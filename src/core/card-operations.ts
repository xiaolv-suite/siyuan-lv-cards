/**
 * 卡片入组、查重、移除与标记制卡核心业务引擎（Card Operations Engine）
 * 统筹与 Riff 内核卡片生命周期的读写交互、知识对象自动派生与卡片关系图端点清理。
 */

import { addRiffCards, invalidateDueCache } from "../api/due-shared";
import { getRiffCardsByBlockIDs, removeRiffCards } from "../api/riff";
import * as siyuanApi from "../api/siyuan";
import { appendBlock, createDocWithMd, setBlockAttrs } from "../api/siyuan";
import { withDocLock } from "../libs/lv-notice-kit";
import { attachCardSourceBacklink, buildSourceLinkAttrs } from "./block-attributes";
import { detachCard, type CardRelationsData } from "./card-relations";
import { validateCardEntry } from "./card-entry-gate";
import { extractDecksFromIal } from "./deck-management";
import { validateFlashcardMarkdown } from "./flashcard-quality";
import { deriveInstance, registerObject, type KnowledgeObjectsData } from "./knowledge-objects";
import { parseSrLine, parseSrMultiline, stripSrMarkers } from "./obsidian-sr";

/**
 * 校验给定块是否已经在 Riff 闪卡中，返回重复卡片数量
 */
export async function checkDuplicateCards(blockIDs: string[]): Promise<number> {
    try {
        const { blocks } = await getRiffCardsByBlockIDs(blockIDs);
        return (blocks ?? []).filter(b => !!b.id).length;
    } catch {
        return 0;
    }
}

export interface RemoveCardsResult {
    removedCount: number;
    cardIDs: string[];
    hadCards: boolean;
}

/**
 * 从卡组中批量移除卡片，并自动清理关联的知识对象关系图端点
 */
export async function removeCardsFromDeckFlow(
    blockIDs: string[],
    cardRelations: CardRelationsData,
    mutateRelations: (mutator: (next: CardRelationsData) => void) => Promise<unknown>,
    options?: { deckID?: string },
): Promise<RemoveCardsResult> {
    const cleanInputIDs = [...new Set(blockIDs.map(id => String(id || "").trim()).filter(Boolean))];
    if (cleanInputIDs.length === 0) {
        return { removedCount: 0, cardIDs: [], hadCards: false };
    }

    const { blocks } = await getRiffCardsByBlockIDs(cleanInputIDs);
    const matchedBlocks = (blocks ?? []).filter(b => Boolean(b?.id));
    let ids = matchedBlocks.map(b => b.id);

    let getBlockAttrsFn: ((id: string) => Promise<Record<string, string>>) | undefined;
    try {
        if (Object.prototype.hasOwnProperty.call(siyuanApi, "getBlockAttrs")) {
            getBlockAttrsFn = (siyuanApi as any).getBlockAttrs;
        }
    } catch {
        getBlockAttrsFn = undefined;
    }
    const deckToIds = new Map<string, string[]>();
    const addDeckMapping = (deckID: string, id: string) => {
        const cleanDeck = String(deckID || "").trim();
        if (!cleanDeck) return;
        const list = deckToIds.get(cleanDeck) ?? [];
        if (!list.includes(id)) list.push(id);
        deckToIds.set(cleanDeck, list);
    };

    const blockById = new Map(matchedBlocks.map(b => [b.id, b]));
    if (ids.length === 0 && options?.deckID) {
        ids = [...cleanInputIDs];
    } else if (ids.length === 0 && typeof getBlockAttrsFn === "function") {
        for (const id of cleanInputIDs) {
            try {
                const attrs = await getBlockAttrsFn(id);
                const rawDecks = String(attrs?.["custom-riff-decks"] || "").trim();
                if (rawDecks) {
                    ids.push(id);
                    for (const d of rawDecks.split(",").map(s => s.trim()).filter(Boolean)) {
                        addDeckMapping(d, id);
                    }
                }
            } catch { /* ignore */ }
        }
    }

    if (ids.length === 0) {
        return { removedCount: 0, cardIDs: [], hadCards: false };
    }

    for (const id of ids) {
        const block = blockById.get(id) as any;
        const resolvedForId = new Set<string>();
        if (options?.deckID) resolvedForId.add(options.deckID);
        if (block?.ial) {
            for (const d of extractDecksFromIal(String(block.ial))) {
                resolvedForId.add(d);
            }
        }
        if (typeof block?.deckID === "string" && block.deckID.trim()) {
            resolvedForId.add(block.deckID.trim());
        }
        if (Array.isArray(block?.riffCard?.deckIDs)) {
            for (const d of block.riffCard.deckIDs) {
                if (typeof d === "string" && d.trim()) resolvedForId.add(d.trim());
            }
        }
        if (resolvedForId.size === 0 && typeof getBlockAttrsFn === "function") {
            try {
                const attrs = await getBlockAttrsFn(id);
                const rawDecks = String(attrs?.["custom-riff-decks"] || "").trim();
                for (const d of rawDecks.split(",").map(s => s.trim()).filter(Boolean)) {
                    resolvedForId.add(d);
                }
            } catch { /* ignore */ }
        }
        for (const d of resolvedForId) {
            addDeckMapping(d, id);
        }
    }

    if (deckToIds.size > 0) {
        for (const [deckID, targetIds] of deckToIds.entries()) {
            await removeRiffCards(deckID, targetIds);
        }
    } else {
        await removeRiffCards("", ids);
    }
    invalidateDueCache();

    // BK-2：内核卡已删，关系图端点同步清理
    if (ids.some(id => cardRelations.relations.some(r => r.from === id || r.to === id))) {
        await mutateRelations(next => {
            for (const id of ids) {
                detachCard(next, id);
            }
        });
    }
    return { removedCount: ids.length, cardIDs: ids, hadCards: true };
}

export interface QuickCardFlowInput {
    nbId: string;
    markdown: string;
    deckID: string;
    qualityErrorMessage?: string;
    q?: string;
    a?: string;
    /** 已创建的快速制卡文档；双向卡第二面复用，避免重复创建同一路径文档。 */
    docID?: string;
    /** 来源文档或来源块 ID，用于写入双向反链与属性 */
    sourceDocID?: string;
    sourceBlockID?: string;
    sourceTitle?: string;
    /** 是否就地存入原文档（直接在原文档追加） */
    inPlaceDocID?: string;
    /** R59 题型属性（选择题/判断题/填空）：写入 custom-exam-* 块属性供复习端交互组件识别 */
    examAttrs?: Record<string, string>;
    mutateKnowledgeObjects?: (mutator: (next: KnowledgeObjectsData) => void) => Promise<unknown>;
}

/**
 * 执行快速问答/挖空制卡流程（写块 -> 入组 -> 派生知识对象实例）
 */
export async function executeQuickCardCreation(
    input: QuickCardFlowInput,
): Promise<{ docID: string; blockID: string }> {
    const draftAttrs = input.examAttrs || {};
    const draftDecision = validateCardEntry({
        blockID: "quick-card-draft",
        markdown: input.markdown,
        attrs: draftAttrs,
    });
    if (!draftDecision.ok) throw new Error(input.qualityErrorMessage || "quickCardInvalid");

    // 如果指定了原文档就地追加（inPlaceDocID），直接使用该文档 ID；否则在快速制卡目录下创建或复用
    const docID = input.docID ?? (input.inPlaceDocID || await createDocWithMd(input.nbId, "小驴闪卡/快速制卡", ""));
    if (!docID) {
        throw new Error("quickCardFail");
    }

    // 若指定了来源文档且不是就地追加原文档，且卡片尚未包含反链，则自动附带思源原生反链引用
    const cardMarkdown = (input.sourceDocID && !input.inPlaceDocID)
        ? attachCardSourceBacklink(input.markdown, input.sourceBlockID || input.sourceDocID, input.sourceTitle)
        : input.markdown;

    const blockID = await withDocLock(docID, async () => {
        const ids = await appendBlock("markdown", cardMarkdown, docID);
        if (!ids || ids.length === 0) {
            throw new Error("quickCardFail");
        }
        const blkId = ids[0];

        // 必须先写入问答/题型/阶梯列表等块属性，再调用 addRiffCards 入组门禁：
        // 门禁依赖 getBlockAttrs 读取 custom-riff-title / custom-exam-type / custom-lv-card-type，
        // 此前先入组后写属性导致问答/属性问答/阶梯列表在入组校验时全部被误拦为 missing-answer。
        const attrsToSet: Record<string, string> = {};
        if (input.sourceDocID || input.sourceBlockID || input.inPlaceDocID) {
            Object.assign(attrsToSet, buildSourceLinkAttrs(input.sourceDocID || input.inPlaceDocID, input.sourceBlockID));
        }
        if (input.examAttrs && Object.keys(input.examAttrs).length > 0) {
            for (const [k, v] of Object.entries(input.examAttrs)) {
                attrsToSet[k] = typeof v === "string" ? v.replace(/[\r\n]+/g, " ").trim() : String(v ?? "");
            }
        }
        if (Object.keys(attrsToSet).length > 0) {
            try {
                await setBlockAttrs(blkId, attrsToSet);
            } catch {
                // 属性写入旁路容错
            }
        }

        await addRiffCards(input.deckID, [blkId]);
        return blkId;
    });

    if (input.q && input.mutateKnowledgeObjects) {
        try {
            const { blocks } = await getRiffCardsByBlockIDs([blockID]);
            const cardID = blocks?.[0]?.id;
            await input.mutateKnowledgeObjects(next => {
                const obj = registerObject(next, input.q!, blockID);
                if (cardID) {
                    deriveInstance(obj, {
                        cardID,
                        cardType: "cloze",
                        capability: input.a && input.q!.includes(input.a) ? "fact" : "definition",
                    });
                }
            });
        } catch {
            // 知识对象注册为旁路增强：失败不影响制卡主流程
        }
    }
    return { docID, blockID };
}

export interface MarkerCardItem {
    blockID: string;
    kind: "qa" | "whole";
    front: string;
    back: string;
}

/**
 * 扫描 Markdown 内容提取标记符制卡项（支持单行 ::、多行 ?/?? 问答与 ？ 结尾块）
 */
export function extractMarkerCardItems(rows: Array<{ id?: string; markdown?: string }>): {
    items: MarkerCardItem[];
    wholeIds: string[];
} {
    const items: MarkerCardItem[] = [];
    const wholeIds: string[] = [];

    for (const r of rows) {
        const md = String(r.markdown ?? "").trim();
        if (!md || !r.id) {
            continue;
        }
        const blockID = String(r.id);

        // AQ-11：Obsidian SR 语法识别——单行 `::`/`:::`
        if (!md.includes("\n")) {
            const sr = parseSrLine(md);
            if (sr) {
                const front = stripSrMarkers(sr.front.replace(/#flashcards\S*/g, ""));
                const back = stripSrMarkers(sr.back.replace(/#flashcards\S*/g, ""));
                if (front && back) {
                    items.push({ blockID, kind: "qa", front, back });
                    continue;
                }
            }
        } else {
            // 多行 `?` / `??` 问答块
            const multi = parseSrMultiline(md.split(/\r?\n/));
            if (multi) {
                const front = stripSrMarkers(multi.front.replace(/#flashcards\S*/g, ""));
                const back = stripSrMarkers(multi.back.replace(/#flashcards\S*/g, ""));
                if (front && back) {
                    items.push({ blockID, kind: "qa", front, back });
                    continue;
                }
            }
        }

        // 以「？」结尾的块或包含挖空的块：整块直接入组
        if ((md.endsWith("？") || /(?<!=)==(?!=)/.test(md)) && !validateFlashcardMarkdown(md)) {
            items.push({ blockID, kind: "whole", front: md.replace(/[*`#]/g, ""), back: "" });
            wholeIds.push(blockID);
        }
    }

    return { items, wholeIds };
}
