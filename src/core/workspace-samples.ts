/**
 * 示例卡与示例工作区生成引擎（AR-4）
 * 包含新手引导示例卡（Onboarding Samples）与独立示例工作区（Sample Workspace）的创建、
 * 断点标记恢复、防重复建卡、以及卡组按名复用逻辑。
 */

import { createRiffDeck, getRiffCards, getRiffDecks, removeRiffDeck } from "../api/riff";
import { addRiffCards } from "../api/due-shared";
import { appendBlock, createDocWithMd, flushTransaction, setBlockAttrs, sqlQuery } from "../api/siyuan";
import { allTypeSampleCards } from "./sample-cards";
export { sampleCards, allTypeSampleCards } from "./sample-cards";

export interface SampleDocResult {
    docID: string;
    createdCount: number;
    alreadyExisted: boolean;
}

/**
 * 按名称查找或创建 Riff 卡组（重试不重复建组，自动合并清理同名空白重复卡组）
 */
export async function findOrCreateRiffDeck(deckName: string): Promise<{ id: string; name: string }> {
    const decks = await getRiffDecks();
    const matches = decks.filter(d => d.name === deckName);
    if (matches.length > 0) {
        const chosen = matches.find(d => (Number(d.size) || 0) > 0) ?? matches[0];
        for (const dup of matches) {
            if (dup.id !== chosen.id && (Number(dup.size) || 0) === 0) {
                try {
                    await removeRiffDeck(String(dup.id));
                } catch {
                    // 旁路清理容错
                }
            }
        }
        return { id: String(chosen.id), name: chosen.name };
    }
    const created = await createRiffDeck(deckName);
    const newId = (created as any)?.id ?? created;
    return { id: String(newId), name: deckName };
}

/**
 * R59：全类型示例卡创建引擎（13 类卡面形态）。
 * 幂等：kind 写入块属性 custom-lv-sample，重跑只补缺失块；attrs 单独补写（存量块不带考试属性时补齐）。
 * 直接收集 appendBlock 返回的块 ID，不依赖异步 SQLite 索引延迟。
 */
async function createAllTypeSamples(docID: string): Promise<{ created: number; blockIDs: string[] }> {
    const escapedDoc = docID.replace(/'/g, "''");
    const existing = await sqlQuery(
        `SELECT id, ial FROM blocks WHERE root_id='${escapedDoc}' AND (ial LIKE '%custom-lv-sample=%' OR markdown LIKE '%lv-cards-sample:%')`,
    );

    let created = 0;
    const blockIDs: string[] = [];
    for (const item of allTypeSampleCards()) {
        const found = existing.find(row => String(row.ial ?? "").includes(`custom-lv-sample="${item.kind}"`));
        let blockID = found?.id ? String(found.id) : "";
        if (!blockID) {
            const r = await appendBlock("markdown", `${item.md}\n{: custom-lv-sample="${item.kind}"}`, docID);
            if (r?.length && r[0]) {
                blockID = String(r[0]);
                created += 1;
            }
        }
        if (blockID) {
            blockIDs.push(blockID);
        }
        // 考试属性断点恢复：存量块缺 attrs（如旧版本示例）时补写
        if (blockID && item.attrs) {
            try {
                await setBlockAttrs(blockID, item.attrs);
            } catch {
                // 属性写入旁路容错
            }
        }
    }
    if (created > 0) {
        try {
            await flushTransaction();
        } catch {
            // 旁路容错
        }
    }
    return { created, blockIDs };
}

/** 幂等把块并入卡组（只补缺失） */
async function ensureDeckMembership(deckID: string, blockIDs: string[]): Promise<number> {
    const uniqueIDs = [...new Set(blockIDs.filter(Boolean))];
    if (uniqueIDs.length === 0) return 0;
    const deckCards = await getRiffCards(deckID, 1, 200);
    const inDeck = new Set(deckCards.blocks.map(block => block.id));
    const missing = uniqueIDs.filter(id => !inDeck.has(id));
    if (missing.length > 0) {
        await addRiffCards(deckID, missing);
    }
    return missing.length;
}

/**
 * 创建新手引导示例卡（R59 起升级为全类型 13 张：qa/cloze/superblock/bidi/delimited/choice/judge/fill/code/formula/table…）
 * 具备标记断点恢复：半途失败时只补缺失块，且幂等入组。
 */
export async function createOnboardingSampleCards(
    nbId: string,
    i18n: Record<string, any>,
): Promise<string> {
    const deckName = String(i18n.onboardingDeckName ?? "示例卡组");
    const deck = await findOrCreateRiffDeck(deckName);

    const docID = await createDocWithMd(nbId, "小驴闪卡/示例卡", "");
    if (!docID) {
        throw new Error(i18n.quickCardFail ?? "创建示例卡文档失败");
    }

    const { blockIDs } = await createAllTypeSamples(docID);

    const escapedDoc = docID.replace(/'/g, "''");
    const rows = await sqlQuery(`SELECT id FROM blocks WHERE root_id='${escapedDoc}' AND ial LIKE '%custom-lv-sample=%'`);
    const allBlockIDs = [...new Set([...blockIDs, ...rows.map(row => String(row.id))])];
    await ensureDeckMembership(deck.id, allBlockIDs);

    // 兼容旧版 5 张示例（正文注释标记）：仍存在时一并入组，避免老用户示例「消失」
    const legacy = await sqlQuery(
        `SELECT id FROM blocks WHERE root_id='${escapedDoc}' AND markdown LIKE '%lv-cards-sample:%'`,
    );
    if (legacy.length > 0) {
        await ensureDeckMembership(deck.id, legacy.map(row => String(row.id)));
    }

    return docID;
}

/**
 * 生成全套示例工作区文档（命令面板调用）——与引导示例同一套全类型内容
 */
export async function createFullSampleWorkspace(
    nbId: string,
    i18n: Record<string, any>,
): Promise<SampleDocResult> {
    const deck = await findOrCreateRiffDeck("示例卡组");

    const docID = await createDocWithMd(nbId, "小驴闪卡/示例卡片", "");
    if (!docID) {
        throw new Error(i18n.quickCardFail ?? "创建示例卡片文档失败");
    }

    const escapedDoc = docID.replace(/'/g, "''");
    const existing = await sqlQuery(
        `SELECT id FROM blocks WHERE root_id='${escapedDoc}' AND (ial LIKE '%custom-lv-sample=%' OR content LIKE '示例 %')`,
    );
    if (existing.length > 0) {
        // 幂等 + 断点恢复：已存在的示例文档补齐缺失卡型并入组
        const { created, blockIDs } = await createAllTypeSamples(docID);
        const rows = await sqlQuery(`SELECT id FROM blocks WHERE root_id='${escapedDoc}' AND ial LIKE '%custom-lv-sample=%'`);
        const legacy = await sqlQuery(`SELECT id FROM blocks WHERE root_id='${escapedDoc}' AND content LIKE '示例 %'`);
        const ids = [...new Set([...blockIDs, ...rows.map(r => String(r.id)), ...legacy.map(r => String(r.id))])];
        await ensureDeckMembership(deck.id, ids);
        return { docID, createdCount: created, alreadyExisted: created === 0 };
    }

    const { created, blockIDs } = await createAllTypeSamples(docID);

    const rows = await sqlQuery(`SELECT id FROM blocks WHERE root_id='${escapedDoc}' AND ial LIKE '%custom-lv-sample=%'`);
    const ids = [...new Set([...blockIDs, ...rows.map(r => String(r.id))])];
    if (ids.length > 0) {
        await ensureDeckMembership(deck.id, ids);
    }

    return { docID, createdCount: created, alreadyExisted: false };
}

/**
 * 旧版 5 张示例创建（保留：i18n onboardingSample1–5 驱动的演示路径仍被引用时不破坏）
 * @deprecated R59 起引导流程改用 createOnboardingSampleCards（全类型）
 */
export async function createLegacyFiveSamples(docID: string, i18n: Record<string, any>): Promise<string[]> {
    const samples = [
        i18n.onboardingSample1,
        i18n.onboardingSample2,
        i18n.onboardingSample3,
        i18n.onboardingSample4,
        i18n.onboardingSample5,
    ] as const;

    const escapedDoc = docID.replace(/'/g, "''");
    const existing = await sqlQuery(
        `SELECT id, markdown FROM blocks WHERE root_id='${escapedDoc}' AND markdown LIKE '%lv-cards-sample:%'`,
    );

    const kinds = ["qa", "cloze", "cloze-2", "formula", "list"] as const;
    const ids: string[] = [];
    for (let i = 0; i < samples.length; i++) {
        const kind = kinds[i];
        const found = existing.find(row => String(row.markdown ?? "").includes(`lv-cards-sample:${kind} `));
        if (found?.id) {
            ids.push(String(found.id));
            continue;
        }
        const r = await appendBlock("markdown", `${samples[i]}\n{: custom-lv-sample="legacy-${kind}"}`, docID);
        if (r?.length) ids.push(r[0]);
    }
    return ids;
}
