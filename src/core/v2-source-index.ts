/**
 * SiYuan v3.9+ Flashcard V2 轻量内存卡源索引（V2SourceIndex）
 *
 * 设计约束：
 * 1. 绝不使用脆弱 SQL 查 `custom-riff-decks` 关联来推导 V2 卡片；
 * 2. 优先复用 `/api/flashcard/queryCards`（及旧版 `/api/riff/getRiffCards` 兜底）在内存中建立 `blockID <-> cardID / sourceID / sourceType` 索引；
 * 3. 在 SiYuan v3.1~v3.6 / Legacy 模式下保持惰性空转（0 额外请求，100% 兼容旧行为）；
 * 4. 严格尊重 `data-flashcard-source="false"` 排除标记。
 */

export const V2_SOURCE_TYPES = [
    "quick",
    "basic",
    "cloze",
    "ordered",
    "orderedSingle",
    "orderedCards",
    "image-occlusion",
    "imageOcclusion",
    "multi-line",
    "multiLineAll",
    "multiLineSteps",
    "typed-answer",
    "typedAnswer",
    "choice",
    "choiceSingle",
    "choiceMultiple",
    "plugin",
] as const;

export interface V2IndexedEntry {
    cardID: string;
    sourceID: string;
    blockID: string;
    sourceType: string;
    deckID?: string;
    sourceStatus?: string;
}

export type V2QueryPageFn = (offset: number, limit: number) => Promise<{
    cards?: any[];
    total?: number;
} | null | undefined>;

export type V2BlockQueryFn = (blockID: string) => Promise<{
    cards?: any[];
} | null | undefined>;

function extractCardAndBlockFromItem(item: any): V2IndexedEntry | null {
    if (!item || typeof item !== "object") return null;
    const card = (item.card && typeof item.card === "object") ? item.card : item;
    const cardID = String(card.id ?? card.cardID ?? item.cardID ?? "").trim();
    const sourceID = String(card.sourceID ?? item.sourceID ?? "").trim();
    const sourceStatus = String(item.sourceStatus ?? card.generationStatus ?? "active").trim();
    if (sourceStatus === "deleted" || card.generationStatus === "deleted") {
        return null;
    }
    const sourceType = String(item.sourceType ?? card.sourceType ?? item.source?.sourceType ?? "quick").trim() || "quick";

    const candidateBlockIDs: string[] = [];
    if (typeof item.primaryRefID === "string" && item.primaryRefID.trim()) {
        candidateBlockIDs.push(item.primaryRefID.trim());
    }
    if (typeof item.blockID === "string" && item.blockID.trim()) {
        candidateBlockIDs.push(item.blockID.trim());
    }
    if (typeof card.blockID === "string" && card.blockID.trim()) {
        candidateBlockIDs.push(card.blockID.trim());
    }
    if (Array.isArray(item.references)) {
        for (const ref of item.references) {
            if (ref && typeof ref.entityID === "string" && ref.entityID.trim() && (!ref.entityType || ref.entityType === "block")) {
                candidateBlockIDs.push(ref.entityID.trim());
            }
        }
    }
    if (sourceID && !candidateBlockIDs.includes(sourceID)) {
        candidateBlockIDs.push(sourceID);
    }
    const blockID = candidateBlockIDs[0] || "";
    if (!blockID && !cardID) return null;
    return {
        cardID: cardID || blockID,
        sourceID: sourceID || blockID,
        blockID: blockID || sourceID,
        sourceType,
        deckID: typeof item.reviewSetID === "string" ? item.reviewSetID : (typeof card.deckID === "string" ? card.deckID : undefined),
        sourceStatus,
    };
}

export class V2SourceIndex {
    private readonly blockToEntries = new Map<string, V2IndexedEntry[]>();
    private readonly cardToBlock = new Map<string, string>();
    private readonly excludedBlocks = new Set<string>();
    private lastRefreshedAt = 0;
    private refreshInFlight: Promise<void> | null = null;
    private generation = 0;
    private readonly ttlMs: number;

    constructor(ttlMs = 60_000) {
        this.ttlMs = ttlMs;
    }

    public get size(): number {
        return this.blockToEntries.size;
    }

    public isFresh(now = Date.now()): boolean {
        return this.lastRefreshedAt > 0 && now - this.lastRefreshedAt < this.ttlMs;
    }

    public markExcluded(blockID: string, excluded = true): void {
        const clean = String(blockID || "").trim();
        if (!clean) return;
        if (excluded) {
            this.excludedBlocks.add(clean);
            this.blockToEntries.delete(clean);
        } else {
            this.excludedBlocks.delete(clean);
        }
    }

    public isExcluded(blockID: string): boolean {
        return this.excludedBlocks.has(String(blockID || "").trim());
    }

    public hasBlock(blockID: string): boolean {
        const clean = String(blockID || "").trim();
        if (!clean || this.excludedBlocks.has(clean)) return false;
        const entries = this.blockToEntries.get(clean);
        return Boolean(entries && entries.length > 0);
    }

    public getEntriesForBlock(blockID: string): readonly V2IndexedEntry[] {
        const clean = String(blockID || "").trim();
        if (!clean || this.excludedBlocks.has(clean)) return [];
        return this.blockToEntries.get(clean) ?? [];
    }

    public getAllSourceBlockIDs(): Set<string> {
        const out = new Set<string>();
        for (const id of this.blockToEntries.keys()) {
            if (!this.excludedBlocks.has(id)) out.add(id);
        }
        return out;
    }

    public getBlockIDByCardID(cardID: string): string {
        return this.cardToBlock.get(String(cardID || "").trim()) ?? "";
    }

    public markBlockAdded(blockID: string, cardID = "", sourceType = "quick", deckID?: string): void {
        const cleanBlock = String(blockID || "").trim();
        if (!cleanBlock) return;
        this.excludedBlocks.delete(cleanBlock);
        const list = this.blockToEntries.get(cleanBlock) ?? [];
        const entry: V2IndexedEntry = {
            cardID: cardID || cleanBlock,
            sourceID: cleanBlock,
            blockID: cleanBlock,
            sourceType,
            deckID,
            sourceStatus: "active",
        };
        if (!list.some(e => e.cardID === entry.cardID)) {
            list.push(entry);
        }
        this.blockToEntries.set(cleanBlock, list);
        if (entry.cardID) this.cardToBlock.set(entry.cardID, cleanBlock);
    }

    public markBlockRemoved(blockID: string): void {
        const cleanBlock = String(blockID || "").trim();
        if (!cleanBlock) return;
        const list = this.blockToEntries.get(cleanBlock) ?? [];
        for (const e of list) {
            if (e.cardID) this.cardToBlock.delete(e.cardID);
        }
        this.blockToEntries.delete(cleanBlock);
    }

    public ingestCards(items: unknown[]): void {
        if (!Array.isArray(items)) return;
        for (const raw of items) {
            const parsed = extractCardAndBlockFromItem(raw);
            if (!parsed) continue;
            if (this.excludedBlocks.has(parsed.blockID)) continue;
            const list = this.blockToEntries.get(parsed.blockID) ?? [];
            if (!list.some(e => e.cardID === parsed.cardID && e.sourceID === parsed.sourceID)) {
                list.push(parsed);
                this.blockToEntries.set(parsed.blockID, list);
            }
            if (parsed.cardID) {
                this.cardToBlock.set(parsed.cardID, parsed.blockID);
            }
            // 多块卡（basic / choice / multi-line / ordered）若 references 含其他块 ID，一并建索引
            const refs = Array.isArray((raw as any)?.references) ? (raw as any).references : [];
            for (const ref of refs) {
                const refBlockID = typeof ref?.entityID === "string" && (!ref?.entityType || ref.entityType === "block")
                    ? ref.entityID.trim()
                    : "";
                if (!refBlockID || refBlockID === parsed.blockID || this.excludedBlocks.has(refBlockID)) continue;
                const refList = this.blockToEntries.get(refBlockID) ?? [];
                if (!refList.some(e => e.cardID === parsed.cardID && e.sourceID === parsed.sourceID)) {
                    refList.push({ ...parsed, blockID: refBlockID });
                    this.blockToEntries.set(refBlockID, refList);
                }
            }
        }
    }

    public invalidate(): void {
        this.generation += 1;
        this.lastRefreshedAt = 0;
    }

    public clear(): void {
        this.generation += 1;
        this.lastRefreshedAt = 0;
        this.blockToEntries.clear();
        this.cardToBlock.clear();
        this.excludedBlocks.clear();
    }

    public async ensureFresh(queryPageFn: V2QueryPageFn, maxPages = 10, pageSize = 200): Promise<void> {
        if (this.isFresh()) return;
        if (this.refreshInFlight) return this.refreshInFlight;
        const gen = this.generation;
        this.refreshInFlight = (async () => {
            try {
                const nextBlockMap = new Map<string, V2IndexedEntry[]>();
                const nextCardMap = new Map<string, string>();
                let offset = 0;
                for (let page = 0; page < maxPages; page++) {
                    const res = await queryPageFn(offset, pageSize).catch(() => null);
                    if (!res || !Array.isArray(res.cards) || res.cards.length === 0) break;
                    if (gen !== this.generation) return;
                    for (const raw of res.cards) {
                        const parsed = extractCardAndBlockFromItem(raw);
                        if (!parsed || this.excludedBlocks.has(parsed.blockID)) continue;
                        const addEntry = (blkId: string) => {
                            if (!blkId || this.excludedBlocks.has(blkId)) return;
                            const list = nextBlockMap.get(blkId) ?? [];
                            if (!list.some(e => e.cardID === parsed.cardID && e.sourceID === parsed.sourceID)) {
                                list.push({ ...parsed, blockID: blkId });
                                nextBlockMap.set(blkId, list);
                            }
                        };
                        addEntry(parsed.blockID);
                        const refs = Array.isArray((raw as any)?.references) ? (raw as any).references : [];
                        for (const ref of refs) {
                            const refBlockID = typeof ref?.entityID === "string" && (!ref?.entityType || ref.entityType === "block")
                                ? ref.entityID.trim()
                                : "";
                            if (refBlockID && refBlockID !== parsed.blockID) addEntry(refBlockID);
                        }
                        if (parsed.cardID) nextCardMap.set(parsed.cardID, parsed.blockID);
                    }
                    offset += res.cards.length;
                    if (typeof res.total === "number" && offset >= res.total) break;
                    if (res.cards.length < pageSize) break;
                }
                if (gen === this.generation) {
                    this.blockToEntries.clear();
                    for (const [k, v] of nextBlockMap.entries()) this.blockToEntries.set(k, v);
                    this.cardToBlock.clear();
                    for (const [k, v] of nextCardMap.entries()) this.cardToBlock.set(k, v);
                    this.lastRefreshedAt = Date.now();
                }
            } finally {
                this.refreshInFlight = null;
            }
        })();
        return this.refreshInFlight;
    }

    public async checkBlockInV2(blockID: string, queryBlockFn?: V2BlockQueryFn): Promise<boolean> {
        const clean = String(blockID || "").trim();
        if (!clean || this.excludedBlocks.has(clean)) return false;
        if (this.hasBlock(clean)) return true;
        if (typeof queryBlockFn !== "function") return false;
        try {
            const res = await queryBlockFn(clean);
            const cards = Array.isArray(res?.cards) ? res.cards : [];
            if (cards.length > 0) {
                this.ingestCards(cards);
                return this.hasBlock(clean);
            }
        } catch {
            // defensive: ignore kernel mismatch on older versions
        }
        return false;
    }
}
