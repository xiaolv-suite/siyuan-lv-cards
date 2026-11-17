/**
 * AT-4 due 共享缓存实例（进程级单例）：badge 心跳、总览刷新、挑战/配对进场、
 * 每日提醒等轻量读取统一走这里；复习会话的 loadQueue 带本场 reviewedIDs 且逐卡变化，
 * 保持直连不经缓存。条目按 scope key（""=全部卡包，"deck:x"，"notebook:y"，"tree:z"）隔离。
 * 失效时机（invalidate）：appendRevlog（插件/原生评分漏斗）、cards-created、改期（batchSetRiffCardsDueTime）。
 */
import { addRiffCards as kernelAddRiffCards, getRiffDueCardsForScope, type RiffDueCardsData } from "./riff";
import { createDueCache } from "../libs/due-cache";
import { flushTransaction, getBlockAttrs, getBlockMarkdown, SQL_QUERY_CHUNK_SIZE, SQL_QUERY_CONCURRENCY, sqlQuery } from "./siyuan";
import { hasQuestionMediaContent, validateFlashcardMarkdown } from "../core/flashcard-quality";
import { validateCardEntries, type CardEntryDecision } from "../core/card-entry-gate";
import { mapChunksOrdered } from "../core/query-chunks";

export const dueCache = createDueCache<RiffDueCardsData>({ fetcher: key => getRiffDueCardsForScope(key) });

/** 今日到期总数（全部卡包）：badge/提醒走共享缓存，与总览等并发读取合并为一次内核请求 */
export const cachedDueCount = async (): Promise<number> => {
    const data = await dueCache.get("");
    return data?.unreviewedCount ?? 0;
};

/** 今日到期块 ID 清单：保留共享缓存读取错误，让依赖它的界面展示重试而非空结果。 */
export const cachedDueBlockIDs = async (scope = ""): Promise<string[]> => {
    const data = await dueCache.get(scope);
    return (data.cards ?? []).map(card => card.blockID).filter((id): id is string => Boolean(id));
};

/** 任何改变内核 due 的事实（评分/建卡/改期）发生后调用：下一次读取立即拉新 */
export const invalidateDueCache = () => dueCache.invalidate();

/** 制卡统一入口（index.ts 全部建卡路径经此）：成功后新卡即时到期，同步失效共享缓存 */
export class RiffCardEntryGateError extends Error {
    readonly decisions: CardEntryDecision[];

    constructor(decisions: CardEntryDecision[]) {
        const rejected = decisions.filter(decision => !decision.ok);
        const details = rejected.slice(0, 12).map(decision => `${decision.blockID || "?"} (${decision.issue ?? "invalid"})`).join(", ");
        const remaining = rejected.length > 12 ? `, +${rejected.length - 12}` : "";
        super(`Flashcard entry blocked: ${details}${remaining}`);
        this.name = "RiffCardEntryGateError";
        this.decisions = rejected;
    }
}

/** Convert the shared gate failure into a host-localized message at UI edges. */
export const riffCardEntryIssueKey = (issue: CardEntryDecision["issue"]): string => {
    if (issue === "empty-card") return "qualityEmpty";
    if (issue === "missing-answer") return "qualityMissingAnswer";
    if (issue === "missing-question") return "qualityMissingQuestion";
    if (issue === "invalid-markup") return "qualityInvalidMarkup";
    if (issue === "invalid-occlusion") return "qualityInvalidOcclusion";
    if (issue === "missing-block") return "qualityMissingBlock";
    return "qualityInvalidMarkup";
};

/** 主包与各 UI 分包各自打包了这个类，跨包抛出的错误 instanceof 不成立，按名称和字段识别。 */
const isRiffCardEntryGateError = (error: unknown): error is RiffCardEntryGateError =>
    error instanceof RiffCardEntryGateError
    || (error instanceof Error && error.name === "RiffCardEntryGateError" && Array.isArray((error as RiffCardEntryGateError).decisions));

export const formatRiffCardEntryError = (error: unknown, i18n: Record<string, any>, fallback?: string): string => {
    if (!isRiffCardEntryGateError(error)) return error instanceof Error ? error.message : String(error);
    const first = error.decisions[0];
    const key = riffCardEntryIssueKey(first?.issue);
    return i18n[key] ?? i18n.editor?.[key] ?? fallback ?? i18n.qualityInvalidMarkup ?? i18n.editor?.qualityInvalidMarkup ?? "卡片结构无效，请先修复后再入组。";
};

async function validateRiffCardEntries(blockIDs: string[]): Promise<CardEntryDecision[]> {
    const uniqueIDs = [...new Set(blockIDs.map(id => String(id ?? "")))];
    const queryIDs = uniqueIDs.filter(Boolean);
    const markdownByID = new Map<string, string>();
    let remainingIDs = [...queryIDs];

    // 新块刚写入时 SQL 索引尚未提交（实测立即查询为 0 行，内核批量提交间隔可达数秒）：
    // 首轮未查齐就请内核立即提交索引再查一次。
    for (let attempt = 0; attempt < 2; attempt++) {
        const chunks = Array.from({ length: Math.ceil(remainingIDs.length / SQL_QUERY_CHUNK_SIZE) }, (_, index) =>
            remainingIDs.slice(index * SQL_QUERY_CHUNK_SIZE, (index + 1) * SQL_QUERY_CHUNK_SIZE),
        );
        const rowsByChunk = await mapChunksOrdered(chunks, ids => {
            const safeIDs = ids.map(id => `'${id.replace(/'/g, "''")}'`).join(",");
            return sqlQuery(`SELECT id, markdown FROM blocks WHERE id IN (${safeIDs})`);
        }, SQL_QUERY_CONCURRENCY);
        const rows = rowsByChunk.flat();
        for (const row of rows) {
            if (row?.id) markdownByID.set(String(row.id), String(row.markdown ?? ""));
        }
        remainingIDs = queryIDs.filter(id => !markdownByID.has(id));
        if (remainingIDs.length === 0 || attempt > 0) break;
        try {
            await flushTransaction();
        } catch {
            await new Promise(r => setTimeout(r, 300));
        }
    }

    // 仍查不到的块直接读 kramdown：块存在就拿到真实内容，块不存在则内核报错，按缺失处理
    for (const id of remainingIDs) {
        try {
            const markdown = await getBlockMarkdown(id);
            if (markdown) markdownByID.set(id, markdown);
        } catch {
            // 块不存在：保持缺失，由门禁判为 missing-block
        }
    }

    const occlusionCandidates = uniqueIDs.filter(id => {
        const markdown = markdownByID.get(id);
        return Boolean(markdown && validateFlashcardMarkdown(markdown) === "missing-answer" && hasQuestionMediaContent(markdown));
    });
    const attrChunks = Array.from({ length: Math.ceil(occlusionCandidates.length / SQL_QUERY_CONCURRENCY) }, (_, index) =>
        occlusionCandidates.slice(index * SQL_QUERY_CONCURRENCY, (index + 1) * SQL_QUERY_CONCURRENCY),
    );
    const attrsByID = new Map<string, Record<string, string>>();
    const attrsByChunk = await mapChunksOrdered(attrChunks, ids => Promise.all(ids.map(async id => {
        try {
            return [id, await getBlockAttrs(id)] as const;
        } catch {
            return [id, {}] as const;
        }
    })), SQL_QUERY_CONCURRENCY);
    for (const entries of attrsByChunk.flat()) attrsByID.set(entries[0], entries[1]);

    return validateCardEntries(uniqueIDs.map(blockID => ({
        blockID,
        markdown: markdownByID.get(blockID) ?? "",
        exists: markdownByID.has(blockID),
        attrs: attrsByID.get(blockID),
    })));
}

export const addRiffCards = async (deckID: string, blockIDs: string[]) => {
    const uniqueBlockIDs = [...new Set(blockIDs.map(id => String(id ?? "")).filter(Boolean))];
    if (uniqueBlockIDs.length > 0) {
        const decisions = await validateRiffCardEntries(uniqueBlockIDs);
        if (decisions.some(decision => !decision.ok)) throw new RiffCardEntryGateError(decisions);
    }
    let r: any;
    for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
            await new Promise(res => setTimeout(res, 200 * attempt));
        }
        try {
            r = await kernelAddRiffCards(deckID, uniqueBlockIDs);
            break;
        } catch (e: any) {
            const msg = String(e?.message ?? "");
            if (attempt < 2 && (msg.includes("metadata is not ready") || msg.includes("not ready"))) {
                continue;
            }
            throw e;
        }
    }
    invalidateDueCache();
    return r;
};
