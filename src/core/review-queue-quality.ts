import { validateCardEntry, type CardEntryIssue } from "./card-entry-gate";
import { mapChunksOrdered } from "./query-chunks";
import { hasQuestionMediaContent, validateFlashcardMarkdown } from "./flashcard-quality";
import { ATTR_LV_DISMISSED, ATTR_LV_CARD_TYPE, filterDismissedFromQueue, isDismissedCard } from "./incremental-learning";

export interface ReviewQualityCard {
    blockID: string;
    cardID?: string;
}

export interface ReviewQualityRow {
    id: string;
    markdown: string;
    ial?: string;
    attrs?: Record<string, string>;
}

export interface ReviewQualityResult<T extends ReviewQualityCard> {
    valid: T[];
    invalid: Array<{ blockID: string; cardID: string; issue: CardEntryIssue }>;
    dismissedBlockIDs?: string[];
}

export function isRowDismissed(row?: { ial?: string; attrs?: Record<string, string> } | null): boolean {
    if (!row) return false;
    if (row.attrs && isDismissedCard(row.attrs)) return true;
    if (typeof row.ial === "string" && new RegExp(`${ATTR_LV_DISMISSED}=["']true["']`).test(row.ial)) {
        return true;
    }
    return false;
}

/**
 * 保留内核队列顺序，隔离结构无效或无法映射到来源块的存量卡。
 * 这是本场呈现过滤，不会评分、跳过或改动内核 due。
 * 若块带有 custom-lv-dismissed="true" 归档属性，直接从复习队列过滤且不计入结构坏卡。
 */
export function partitionReviewCardsByQuality<T extends ReviewQualityCard>(
    cards: T[],
    rows: ReviewQualityRow[],
    validOcclusionBlockIDs: ReadonlySet<string> = new Set(),
    options: { allowLegacyFormat?: boolean } = {},
): ReviewQualityResult<T> {
    const dismissedSet = new Set<string>();
    for (const row of rows) {
        if (isRowDismissed(row) || row.attrs?.[ATTR_LV_CARD_TYPE] === "extract" || new RegExp(`${ATTR_LV_CARD_TYPE}=["']extract["']`).test(row.ial ?? "")) {
            dismissedSet.add(String(row.id));
        }
    }
    const activeCards = dismissedSet.size > 0 ? filterDismissedFromQueue(cards, dismissedSet) : cards;
    const markdownByID = new Map(rows.map(row => [String(row.id), String(row.markdown ?? "")]));
    const valid: T[] = [];
    const invalid: Array<{ blockID: string; cardID: string; issue: CardEntryIssue }> = [];
    for (const card of activeCards) {
        const blockID = String(card.blockID ?? "");
        const exists = markdownByID.has(blockID);
        const decision = validateCardEntry({
            blockID,
            markdown: markdownByID.get(blockID) ?? "",
            occlusionValid: validOcclusionBlockIDs.has(blockID),
            exists,
            allowLegacyFormat: options.allowLegacyFormat,
        });
        if (decision.ok) valid.push(card);
        else invalid.push({ blockID, cardID: String(card.cardID ?? ""), issue: decision.issue ?? "missing-block" });
    }
    return {
        valid,
        invalid,
        ...(dismissedSet.size > 0 ? { dismissedBlockIDs: [...dismissedSet] } : {}),
    };
}

/**
 * 针对出题卡片异步查询源块 Markdown 与遮挡属性，并执行质量分区
 */
export async function filterReviewQueueByQuality<T extends ReviewQualityCard>(
    cards: T[],
    queryBlocks: (sql: string) => Promise<Array<{ id?: string; markdown?: string; ial?: string; attrs?: Record<string, string> }>>,
    getBlockAttrs: (id: string) => Promise<Record<string, string>>,
    parseOcclusionFn: (attrs: Record<string, string>) => { rects: any[] } | null
): Promise<ReviewQualityResult<T>> {
    if (cards.length === 0) return { valid: [], invalid: [] };

    const blockIDs: string[] = Array.from(
        new Set(cards.map((card): string => String(card.blockID ?? "")).filter(Boolean))
    );
    const chunkSize = 400;
    const concurrency = 3;
    const chunks: string[][] = Array.from({ length: Math.ceil(blockIDs.length / chunkSize) }, (_, index) =>
        blockIDs.slice(index * chunkSize, (index + 1) * chunkSize)
    );

    const rowsByChunk = await mapChunksOrdered(
        chunks,
        (ids: string[]) => {
            const safeIDs = ids.map(id => `'${String(id).replace(/'/g, "''")}'`).join(",");
            return queryBlocks(`SELECT id, ial, markdown FROM blocks WHERE id IN (${safeIDs})`);
        },
        concurrency
    );

    const rows: ReviewQualityRow[] = rowsByChunk.flat().map(row => ({
        id: String(row.id ?? ""),
        markdown: String(row.markdown ?? ""),
        ...(typeof row.ial === "string" ? { ial: row.ial } : {}),
        ...(row.attrs ? { attrs: row.attrs } : {}),
    }));
    const markdownByID = new Map(rows.map(row => [row.id, row.markdown]));

    const occlusionCandidates = blockIDs.filter(id => {
        const markdown = markdownByID.get(id);
        return Boolean(markdown && validateFlashcardMarkdown(markdown) === "missing-answer" && hasQuestionMediaContent(markdown));
    });

    const attrChunks: string[][] = Array.from({ length: Math.ceil(occlusionCandidates.length / concurrency) }, (_, index) =>
        occlusionCandidates.slice(index * concurrency, (index + 1) * concurrency)
    );

    const attrsByChunk = await mapChunksOrdered(
        attrChunks,
        (ids: string[]) => Promise.all(ids.map(async id => {
            try {
                return [id, await getBlockAttrs(id)] as const;
            } catch {
                return [id, {}] as const;
            }
        })),
        concurrency
    );

    const validOcclusionIDs = new Set<string>();
    for (const [id, attrs] of attrsByChunk.flat() as Array<[string, Record<string, string>]>) {
        if (parseOcclusionFn(attrs)?.rects?.length) validOcclusionIDs.add(String(id));
    }

    return partitionReviewCardsByQuality(cards, rows, validOcclusionIDs, { allowLegacyFormat: true });
}

