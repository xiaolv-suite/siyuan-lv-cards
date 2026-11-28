/**
 * 编辑器问答装饰与闪卡业务中枢集成（Editor QA & Flashcard Actions）
 *
 * 唯一悬浮胶囊（#lv-shared-block-capsule）与菜单（.lv-bam）已完全交由全生态底座 lvBlockAssistant 接管；
 * 本模块仅保留纯闪卡业务逻辑：
 * - Alt+Q 免侵入属性问答制卡（含防重复入组保护与 data-flashcard-source="false" 守卫）
 * - 划词挖空制卡 / 图片遮挡卡 / 卡包移出与刷新唯一胶囊状态徽标
 */

import { isBlockElementReadOnly, isCardEditorBlock } from "@/core/editor-qa-service";
import { loadQuestionAttrDialog, loadOcclusionEditor } from "@/bootstrap/chunk-loaders";
import { lvBlockAssistant } from "@/libs/notice";
import { findActiveProtyleBlockElement, findFloatingPillAnchor } from "@/core/block-dom-utils";
import { lvLog } from "@/libs/log";
import { sqlQuery, setBlockAttrs } from "@/api/siyuan";
import { getRiffDecks, createRiffDeck, getRiffCardsByBlockIDs, type RiffDeck } from "@/api/riff";
import {
    extractCardQuestionAttr,
    extractCardAnswerAttr,
    extractAttrQaSubtype,
    extractAttrQaHint,
    extractAttrQaBidi,
    buildAttrQaSubtypeAttrs,
    buildAttrQaClearAttrs,
    isBlockFlashcardExcluded,
    isBlockV2FlashcardSource,
    type AttrQaSubtype,
} from "@/core/block-attributes";
import { addRiffCards, formatRiffCardEntryError } from "@/api/due-shared";
import { removeCardsFromDeckFlow } from "@/core/card-operations";
import { extractDecksFromIal } from "@/core/deck-management";
import { svelteDialog } from "@/libs/dialog";
import { buildOcclusionEditorDialogArgs } from "@/bootstrap/dialog-openers";
import { CARDS_SECRET_SLOTS, readCardsSecretSlot } from "@/core/secrets";

function isDocumentRootElement(el: Element | null): boolean {
    if (!el) return true;
    return el.classList.contains("protyle-wysiwyg")
        || el.classList.contains("protyle-title")
        || el.getAttribute("data-type") === "NodeDocument";
}

function findContentBlockFromNode(node: Node | null): HTMLElement | null {
    const el = node instanceof HTMLElement ? node : node?.parentElement;
    if (!el) return null;
    const candidate = el.closest?.(".protyle-wysiwyg [data-node-id]") as HTMLElement | null;
    if (!candidate || isDocumentRootElement(candidate)) return null;
    return candidate;
}

export function resolveActiveEditorContentBlockId(options: { fallbackToFirstBlock?: boolean } = {}): string {
    if (typeof document === "undefined") return "";
    // 1. 优先从实时文本选区 / 光标（document.getSelection）解析正文块，规避 activeElement 命中根文档容器
    const sel = document.getSelection();
    if (sel && sel.rangeCount > 0) {
        const fromAnchor = findContentBlockFromNode(sel.anchorNode);
        if (fromAnchor) return fromAnchor.getAttribute("data-node-id") || "";
        const range = sel.getRangeAt(0);
        const fromRange = findContentBlockFromNode(range.commonAncestorContainer);
        if (fromRange) return fromRange.getAttribute("data-node-id") || "";
    }

    // 2. 次优从 activeElement 向上寻找正文块（排除文档根节点与文档标题）
    const activeEl = document.activeElement;
    if (activeEl instanceof HTMLElement) {
        const fromActive = findContentBlockFromNode(activeEl);
        if (fromActive) return fromActive.getAttribute("data-node-id") || "";
    }

    // 3. 多选块选中态（优先激活分屏）
    const activeSelectedEls = document.querySelectorAll(".layout__wnd--active .protyle:not(.fn__none) .protyle-wysiwyg--select[data-node-id]");
    const selectedEls = activeSelectedEls.length > 0
        ? activeSelectedEls
        : document.querySelectorAll(".protyle-wysiwyg--select[data-node-id]");
    for (let i = 0; i < selectedEls.length; i++) {
        const el = selectedEls[i];
        if (!isDocumentRootElement(el)) {
            const id = el.getAttribute("data-node-id") || "";
            if (id) return id;
        }
    }

    // 4. 若光标在文档标题或根编辑器游离态，回退当前活动编辑器内的首个正文块
    const inTitleOrRoot = (activeEl instanceof HTMLElement && (
        Boolean(activeEl.closest(".protyle-title"))
        || activeEl.classList.contains("protyle-title__input")
        || activeEl.classList.contains("protyle-wysiwyg")
    ));
    if (options.fallbackToFirstBlock || inTitleOrRoot) {
        const activeProtyle = (activeEl instanceof HTMLElement ? activeEl.closest(".protyle") : null)
            || document.querySelector(".layout__wnd--active .protyle:not(.fn__none)")
            || document.querySelector(".protyle:not(.fn__none)");
        const focusBlock = activeProtyle?.querySelector(".protyle-wysiwyg [data-node-id]:focus-within:not(.protyle-title)");
        if (focusBlock && !isDocumentRootElement(focusBlock)) {
            return focusBlock.getAttribute("data-node-id") || "";
        }
        const blocks = activeProtyle?.querySelectorAll(".protyle-wysiwyg > [data-node-id]") ?? [];
        for (let i = 0; i < blocks.length; i++) {
            const blk = blocks[i];
            if (!isDocumentRootElement(blk)) {
                const id = blk.getAttribute("data-node-id") || "";
                if (id) return id;
            }
        }
    }
    return "";
}

function isBlockActionPluginAlive(plugin: any): boolean {
    return Boolean(plugin)
        && !plugin.isUnloaded
        && !plugin.isUnloading
        && !plugin.disposerRegistry?.isDisposed;
}

export interface AltQDuplicateCheckInput {
    domAttrs?: Record<string, string>;
    targetDeckID?: string;
    existingDeckIDs?: string[];
    isInV2Index?: boolean;
}

export interface AltQDuplicateCheckResult {
    excluded: boolean;
    alreadyCard: boolean;
    duplicateInTargetDeck: boolean;
    existingDeckIDs: string[];
}

export function checkAltQDuplicateCard(input: AltQDuplicateCheckInput): AltQDuplicateCheckResult {
    const attrs = input.domAttrs ?? {};
    if (isBlockFlashcardExcluded(attrs)) {
        return {
            excluded: true,
            alreadyCard: false,
            duplicateInTargetDeck: false,
            existingDeckIDs: [],
        };
    }
    const deckSet = new Set<string>(
        (input.existingDeckIDs ?? []).map(d => String(d || "").trim()).filter(Boolean),
    );
    const rawDecks = String(attrs["custom-riff-decks"] || "").trim();
    for (const d of rawDecks.split(",").map(s => s.trim()).filter(Boolean)) {
        deckSet.add(d);
    }
    const existingDeckIDs = Array.from(deckSet);
    const alreadyCard = existingDeckIDs.length > 0
        || isBlockV2FlashcardSource(attrs)
        || Boolean(input.isInV2Index);
    const targetDeckID = String(input.targetDeckID || "").trim();
    const duplicateInTargetDeck = Boolean(
        (targetDeckID && deckSet.has(targetDeckID))
        || (alreadyCard && !targetDeckID),
    );
    return {
        excluded: false,
        alreadyCard,
        duplicateInTargetDeck,
        existingDeckIDs,
    };
}

export function setupEditorQaIntegration(_plugin: any) {
    const onCardTitleSaved = (ev: Event) => {
        const blockId = (ev as CustomEvent)?.detail?.blockId;
        if (typeof blockId === "string" && blockId) {
            lvBlockAssistant.refreshCapsule(blockId);
        } else {
            lvBlockAssistant.refreshCapsule();
        }
    };
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
        document.addEventListener("flashcard-title-saved", onCardTitleSaved);
    }
    return {
        scan: () => {
            lvBlockAssistant.refreshCapsule();
        },
        dispose: () => {
            if (typeof document !== "undefined" && typeof document.removeEventListener === "function") {
                document.removeEventListener("flashcard-title-saved", onCardTitleSaved);
            }
        },
    };
}

export async function openPluginBlockActionCenter(plugin: any, blockID: string, anchor: HTMLElement): Promise<void> {
    if (!lvBlockAssistant.isEnabled() || !isBlockActionPluginAlive(plugin)) {
        return;
    }
    const targetAnchor = anchor || findFloatingPillAnchor(blockID) || findActiveProtyleBlockElement(blockID) || document.body;
    lvBlockAssistant.openMenu(blockID, targetAnchor);
}

export async function openPluginCardQuestionDialog(plugin: any, blockID?: string): Promise<void> {
    let targetId = (blockID ?? "").trim();
    if (targetId && typeof document !== "undefined") {
        const explicitEl = document.querySelector(`[data-node-id="${targetId}"]`);
        if (explicitEl && isDocumentRootElement(explicitEl)) {
            targetId = "";
        }
    }
    if (!targetId) {
        targetId = resolveActiveEditorContentBlockId({ fallbackToFirstBlock: false });
    }
    if (!targetId) {
        plugin.showNotice(plugin.i18n.cardQuestionNoActiveBlock ?? "请将光标置于要提问的笔记段落中", 2500, "info");
        return;
    }

    const activeBlockForGuard = typeof document !== "undefined" ? findActiveProtyleBlockElement(targetId) : null;
    if (isBlockElementReadOnly(activeBlockForGuard)) {
        plugin.showNotice("当前文档处于只读锁定状态，已拦截写入操作", 2400, "info");
        return;
    }
    if (isBlockFlashcardExcluded(activeBlockForGuard)) {
        plugin.showNotice("当前块已标记为非闪卡来源（data-flashcard-source=false），已跳过制卡", 2600, "info");
        return;
    }
    if (plugin?.flashcardV2?.state === "LegacyDiverged") {
        plugin.showNotice("检测到思源闪卡 V2 存在同步分歧（LegacyDiverged），请先在思源原生闪卡面板完成迁移后再写入", 3600, "error");
        return;
    }

    lvLog("info", `[attr-qa] opening question dialog for block: ${targetId}`);

    try {
        plugin.showNotice(plugin.i18n.cardQuestionOpening ?? "正在打开免侵入属性问答设置…", 800, "info");
        let previewText = "";
        const domAttrs: Record<string, string> = {};
        try {
            const activeBlockEl = findActiveProtyleBlockElement(targetId)
                || document.querySelector(`[data-node-id="${targetId}"]`);
            if (activeBlockEl) {
                const editable = activeBlockEl.querySelector('[contenteditable="true"]');
                previewText = (editable?.textContent ?? activeBlockEl.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
                const attrs = activeBlockEl.attributes;
                if (attrs) {
                    for (let i = 0; i < attrs.length; i++) {
                        const a = attrs[i];
                        if (a && (a.name.startsWith("custom-") || a.name === "data-flashcard-source")) {
                            domAttrs[a.name] = a.value;
                        }
                    }
                }
            }
        } catch {}

        if (isBlockFlashcardExcluded(domAttrs)) {
            plugin.showNotice("当前块已标记为非闪卡来源（data-flashcard-source=false），已跳过制卡", 2600, "info");
            return;
        }

        if (!previewText || previewText === "(空内容块)") {
            try {
                const safeId = targetId.replace(/'/g, "''");
                const rows = await Promise.race([
                    sqlQuery(`SELECT content, markdown, ial FROM blocks WHERE id = '${safeId}' LIMIT 1`),
                    new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 250)),
                ]);
                if (rows && rows[0]) {
                    if (isBlockFlashcardExcluded(rows[0].ial)) {
                        plugin.showNotice("当前块已标记为非闪卡来源（data-flashcard-source=false），已跳过制卡", 2600, "info");
                        return;
                    }
                    previewText = (rows[0].content || rows[0].markdown || "").replace(/\s+/g, " ").trim().slice(0, 300);
                }
            } catch {}
        }

        if (!previewText) previewText = "(空内容块)";

        // 防重复建卡检查：结合 DOM 属性 + V2SourceIndex + Riff 接口核对目标块是否已在卡包中
        const existingDeckIDs = new Set<string>();
        const rawDecks = String(domAttrs["custom-riff-decks"] || "").trim();
        for (const d of rawDecks.split(",").map(s => s.trim()).filter(Boolean)) {
            existingDeckIDs.add(d);
        }
        let isInV2Index = Boolean(plugin?.v2SourceIndex?.hasBlock?.(targetId));
        if (!isInV2Index && existingDeckIDs.size === 0) {
            try {
                const { blocks } = await Promise.race([
                    getRiffCardsByBlockIDs([targetId]),
                    new Promise<{ blocks: any[] }>((resolve) => setTimeout(() => resolve({ blocks: [] }), 250)),
                ]);
                for (const b of blocks ?? []) {
                    if (b?.id) {
                        isInV2Index = true;
                        if (typeof (b as any).ial === "string") {
                            for (const d of extractDecksFromIal((b as any).ial)) existingDeckIDs.add(d);
                        }
                        if (typeof (b as any).deckID === "string" && (b as any).deckID.trim()) {
                            existingDeckIDs.add((b as any).deckID.trim());
                        }
                    }
                }
            } catch {}
        }

        const currentQ = extractCardQuestionAttr(domAttrs);
        const currentA = extractCardAnswerAttr(domAttrs);
        const currentSubtype = extractAttrQaSubtype(domAttrs);
        const currentHint = extractAttrQaHint(domAttrs);
        const currentBidi = currentSubtype === "dual" ? extractAttrQaBidi(domAttrs) : true;
        const dupState = checkAltQDuplicateCard({
            domAttrs,
            existingDeckIDs: Array.from(existingDeckIDs),
            isInV2Index,
        });
        const isAlreadyCard = dupState.alreadyCard;

        const QuestionAttrComp = await loadQuestionAttrDialog();
        if (!QuestionAttrComp) throw new Error("加载问答弹窗组件失败");

        const initialDecks: RiffDeck[] = [];
        let dialogHandle: { close: () => void } | null = null;
        dialogHandle = svelteDialog({
            title: plugin.i18n.cardQuestionTitle ?? "设置属性问答卡 (问题 · 自定义答案)",
            component: QuestionAttrComp,
            width: "min(860px, 94vw)",
            props: {
                blockID: targetId,
                initialQuestion: currentQ,
                initialAnswer: currentA,
                initialSubtype: currentSubtype,
                initialHint: currentHint,
                initialBidi: currentBidi,
                isAlreadyCard,
                previewText,
                decks: initialDecks,
                t: plugin.i18n,
                aiSettings: {
                    aiMode: plugin.settings.aiMode,
                    aiEndpoint: plugin.settings.aiEndpoint,
                    aiKey: plugin.settings.aiKey || readCardsSecretSlot(plugin, CARDS_SECRET_SLOTS.aiKey),
                    aiModel: plugin.settings.aiModel,
                    aiSensitiveTerms: plugin.settings.aiSensitiveTerms,
                    killSwitch: plugin.killSwitch,
                    aiTargets: typeof plugin.aiProviderTargets === "function" ? plugin.aiProviderTargets() : [],
                    costLedger: plugin.costLedger,
                    aiCostBudgetEnabled: plugin.settings.aiCostBudgetEnabled,
                    aiCostMonthlyCap: plugin.settings.aiCostMonthlyCap,
                },
                onSave: async (payload: { question: string; answer?: string; targetDeckID?: string; subtype?: AttrQaSubtype; hint?: string; bidi?: boolean }) => {
                    const subtype: AttrQaSubtype = payload.subtype ?? (payload.question.trim() ? "recite" : "direct");
                    const newQ = payload.question.trim();
                    const newA = (payload.answer ?? "").trim();
                    const newHint = (payload.hint ?? "").trim();
                    if (subtype === "direct" && !newA) {
                        plugin.showNotice("直接问答型必须填写背面答案", 2000, "info");
                        return false;
                    }
                    if (subtype !== "direct" && !newQ) {
                        plugin.showNotice("提问内容不能为空", 2000, "info");
                        return false;
                    }
                    const patch = buildAttrQaSubtypeAttrs({
                        subtype,
                        question: newQ,
                        answer: newA,
                        hint: newHint,
                        bidi: payload.bidi,
                    });

                    try {
                        await setBlockAttrs(targetId, patch as any);
                    } catch {
                        await new Promise(r => setTimeout(r, 80));
                        await setBlockAttrs(targetId, patch as any);
                    }

                    let targetDeckID = payload.targetDeckID || "";
                    const saveDup = checkAltQDuplicateCard({
                        domAttrs,
                        targetDeckID,
                        existingDeckIDs: Array.from(existingDeckIDs),
                        isInV2Index,
                    });

                    let skippedDuplicateEnroll = false;
                    if (targetDeckID) {
                        if (saveDup.duplicateInTargetDeck) {
                            skippedDuplicateEnroll = true;
                        } else {
                            try {
                                await addRiffCards(targetDeckID, [targetId]);
                                existingDeckIDs.add(targetDeckID);
                                plugin?.v2SourceIndex?.markBlockAdded?.(targetId, "", "basic", targetDeckID);
                            } catch (deckErr: any) {
                                lvLog("warn", `[attr-qa] addRiffCards fallback: ${deckErr?.message || String(deckErr)}`);
                                plugin.showNotice(formatRiffCardEntryError(deckErr, plugin.i18n, deckErr?.message || "入组失败"), 3500, "error");
                                return false;
                            }
                        }
                    } else if (!isAlreadyCard) {
                        try {
                            const allDecks = await getRiffDecks().then(d => Array.isArray(d) ? d : []);
                            const defaultDeck = allDecks.find((d: any) => d.name === "小驴闪卡") || allDecks[0];
                            if (defaultDeck) {
                                targetDeckID = defaultDeck.id;
                            } else {
                                const newDeck = await createRiffDeck("小驴闪卡");
                                if (newDeck) targetDeckID = newDeck.id;
                            }
                            if (!targetDeckID) {
                                plugin.showNotice(plugin.i18n.deckJoinFail ?? "默认卡组不可用，入组失败", 3500, "error");
                                return false;
                            }
                            await addRiffCards(targetDeckID, [targetId]);
                            existingDeckIDs.add(targetDeckID);
                            plugin?.v2SourceIndex?.markBlockAdded?.(targetId, "", "basic", targetDeckID);
                        } catch (deckErr: any) {
                            lvLog("warn", `[attr-qa] addRiffCards fallback: ${deckErr?.message || String(deckErr)}`);
                            plugin.showNotice(formatRiffCardEntryError(deckErr, plugin.i18n, deckErr?.message || "入组失败"), 3500, "error");
                            return false;
                        }
                    } else {
                        skippedDuplicateEnroll = true;
                    }

                    lvBlockAssistant.refreshCapsule(targetId);
                    try {
                        document.dispatchEvent(new CustomEvent("flashcard-title-saved", { detail: { blockId: targetId, question: newQ, answer: newA, subtype } }));
                    } catch {}
                    if (skippedDuplicateEnroll) {
                        plugin.showNotice("该块已在目标卡包中，已保留现有卡片并更新问答属性", 2200, "info");
                    } else {
                        plugin.showNotice(newA
                            ? (plugin.i18n.cardQaSavedBoth ?? "闪卡问题与自定义答案已保存至块属性")
                            : (plugin.i18n.cardQuestionSaved ?? "闪卡问题已保存至块属性"), 2000, "info");
                    }
                },
                onClear: async () => {
                    await setBlockAttrs(targetId, buildAttrQaClearAttrs());
                    try {
                        await removePluginCardsFromDeck(plugin, [targetId]);
                    } catch {}
                    plugin?.v2SourceIndex?.markBlockRemoved?.(targetId);
                    lvBlockAssistant.refreshCapsule(targetId);
                    try {
                        document.dispatchEvent(new CustomEvent("flashcard-title-saved", { detail: { blockId: targetId, question: "", answer: "" } }));
                    } catch {}
                    plugin.showNotice(plugin.i18n.cardQuestionCleared ?? "已清空闪卡问题并移出卡组", 2000, "info");
                },
                onClose: () => dialogHandle?.close(),
            },
        });
        void getRiffDecks().then((decks) => {
            if (Array.isArray(decks) && decks.length > 0) {
                document.dispatchEvent(new CustomEvent("lv-cards:decks-updated", { detail: { blockID: targetId, decks } }));
            }
        }).catch(() => {});
    } catch (err: any) {
        plugin.showNotice(err?.message || "打开设置失败", 3000, "error");
    }
}

export function openPluginActiveBlockQuestionDialog(plugin: any): void {
    const blockID = resolveActiveEditorContentBlockId({ fallbackToFirstBlock: false });

    if (blockID) {
        setTimeout(() => { void openPluginCardQuestionDialog(plugin, blockID); }, 60);
    } else {
        plugin.showNotice(plugin.i18n.cardQuestionNoActiveBlock ?? "请将光标置于要提问的笔记段落中，正在为您打开快速制卡", 2500, "info");
        void plugin.openQuickCard();
    }
}

export function openPluginActiveBlockActionCenter(plugin: any): void {
    if (!lvBlockAssistant.isEnabled()) {
        return;
    }
    const blockID = resolveActiveEditorContentBlockId({ fallbackToFirstBlock: true });

    if (!blockID) {
        plugin.showNotice(plugin.i18n.cardQuestionNoActiveBlock ?? "请将光标置于要操作的笔记块中", 2500, "info");
        return;
    }

    const targetEl = findActiveProtyleBlockElement(blockID);
    const safeTarget = (targetEl && !isDocumentRootElement(targetEl)) ? targetEl : null;
    const anchor = findFloatingPillAnchor(blockID)
        || safeTarget
        || document.body;
    void openPluginBlockActionCenter(plugin, blockID, anchor);
}

export function makePluginClozeCard(plugin: any, blockID: string, range?: Range | null, text?: string): void {
    const targetEl = typeof document !== "undefined" ? findActiveProtyleBlockElement(blockID) : null;
    if (isBlockElementReadOnly(targetEl)) {
        plugin.showNotice("当前文档处于只读锁定状态，已拦截写入操作", 2400, "info");
        return;
    }
    if (isBlockFlashcardExcluded(targetEl)) {
        plugin.showNotice("当前块已标记为非闪卡来源（data-flashcard-source=false），已跳过制卡", 2600, "info");
        return;
    }
    let useRange = range ?? null;
    let useText = (text ?? "").trim();
    if (!useRange || !useText) {
        const sel = document.getSelection();
        if (sel && sel.rangeCount > 0) {
            const live = sel.getRangeAt(0);
            const liveText = live.toString().trim();
            if (liveText) {
                useRange = live.cloneRange();
                useText = liveText;
            }
        }
    }
    if (!useRange || !useText) {
        plugin.showNotice("未划选挖空文本，正在为您打开免侵入属性问答制卡", 2500, "info");
        setTimeout(() => { void openPluginCardQuestionDialog(plugin, blockID); }, 80);
        return;
    }
    const sel = document.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(useRange);
    let ok = false;
    try {
        ok = document.execCommand("insertText", false, `==${useText}==`);
    } catch {
        ok = false;
    }
    if (!ok) {
        plugin.showNotice(plugin.i18n.clozeFail, 2500, "error");
        return;
    }
    plugin.openDeckPicker([blockID]);
    lvBlockAssistant.refreshCapsule(blockID);
}

export async function openPluginOcclusionEditor(plugin: any, blockID: string, deckID: string): Promise<void> {
    const targetEl = typeof document !== "undefined" ? findActiveProtyleBlockElement(blockID) : null;
    if (isBlockElementReadOnly(targetEl)) {
        plugin.showNotice("当前文档处于只读锁定状态，已拦截写入操作", 2400, "info");
        return;
    }
    if (isBlockFlashcardExcluded(targetEl)) {
        plugin.showNotice("当前块已标记为非闪卡来源（data-flashcard-source=false），已跳过制卡", 2600, "info");
        return;
    }
    const OcclusionEditor = await loadOcclusionEditor();
    svelteDialog(buildOcclusionEditorDialogArgs(plugin.i18n, OcclusionEditor, blockID, async () => {
        await addRiffCards(deckID, [blockID]);
        await plugin.rememberSourceFingerprint(blockID);
        plugin?.v2SourceIndex?.markBlockAdded?.(blockID, "", "image-occlusion", deckID);
        lvBlockAssistant.refreshCapsule(blockID);
        plugin.showNotice((plugin.i18n as any).occlusion?.occlusionSaved ?? "遮挡卡保存成功", 2000, "info");
    }));
}

export async function removePluginCardsFromDeck(
    plugin: any,
    blockIDs: string[],
    deckID?: string,
): Promise<{ success: boolean; removedCount: number; error?: string }> {
    try {
        const result = await removeCardsFromDeckFlow(
            blockIDs,
            plugin.cardRelations,
            (mutator) => plugin.cardRelationsMutations(mutator),
            deckID ? { deckID } : undefined,
        );
        if (!result.hadCards) {
            const msg = plugin.i18n.deckNotCard ?? "该块还不是闪卡";
            plugin.showNotice(msg, 2000, "info");
            return { success: false, removedCount: 0, error: msg };
        }
        for (const id of result.cardIDs) {
            plugin?.v2SourceIndex?.markBlockRemoved?.(id);
            lvBlockAssistant.refreshCapsule(id);
        }
        plugin.showNotice(plugin.i18n.deckRemoved.replace("${n}", String(result.removedCount)), 2000, "info");
        return { success: true, removedCount: result.removedCount };
    } catch (e: any) {
        const msg = formatRiffCardEntryError(e, plugin.i18n, e?.message ?? String(e));
        plugin.showNotice(msg, 3000, "error");
        return { success: false, removedCount: 0, error: msg };
    }
}

export { isCardEditorBlock };
