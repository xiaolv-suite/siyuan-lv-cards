/**
 * 卡包管理引擎（Deck Management & Legacy Ecosystem Sync）
 *
 * 统筹管理思源笔记全生态卡包资产：
 * 1. 思源本体原生卡包（RiffDecks）的全生命周期管理（创建、重命名、删除、清空、合并）；
 * 2. 存量与第三方插件卡包识别：
 *    - 思源原生块属性 `custom-riff-decks`
 *    - 社区闪卡插件属性 `custom-flashcard-deck` / `custom-deck` / `custom-card-deck` / `custom-card-group`
 *    - 标签化卡包 `#deck/*` / `#卡包/*` / `#卡组/*`
 *    - 未归组的孤儿闪卡（正文带 ==挖空== 或概念分隔符但未入组）
 * 3. 一键同步接入：将存量与第三方卡包无损对齐并注册为标准 Riff 卡组，纳入 FSRS 科学调度；
 * 4. 卡包合并与冗余空卡包批量清理。
 */

import type { RiffDeck } from "@/api/riff";

export type DeckCategory = "native" | "third-party" | "tag" | "orphan";

export interface ManagedDeckInfo {
    id: string;
    name: string;
    category: DeckCategory;
    cardCount: number;
    dueCount?: number;
    newCount?: number;
    synced: boolean;
    blockIDs: string[];
    sourceHint: string;
}

export interface DiscoveredLegacyDeck {
    name: string;
    category: DeckCategory;
    blockIDs: string[];
    sampleBlockContent?: string;
    sourcePlugin?: string;
}

const ATTR_DECK_REGEXES = [
    /custom-riff-decks="([^"]+)"/,
    /custom-flashcard-deck="([^"]+)"/,
    /custom-deck="([^"]+)"/,
    /custom-card-deck="([^"]+)"/,
    /custom-card-group="([^"]+)"/,
    /custom-card-pack="([^"]+)"/,
];

const TAG_DECK_REGEX = /#(?:deck|卡包|卡组)\/([^\s#,]+)/;

/**
 * 从块 IAL 属性字符串中提取卡包标识（支持原生与第三方插件）
 */
export function extractDeckFromIal(ial: string): string | null {
    if (!ial) return null;
    for (const reg of ATTR_DECK_REGEXES) {
        const m = ial.match(reg);
        if (m && m[1]?.trim()) {
            return m[1].trim();
        }
    }
    return null;
}

/**
 * 从 Markdown 文本中提取标签化卡包名称（如 #deck/英语单词 或 #卡包/考研政治）
 */
export function extractDeckFromTags(markdown: string): string | null {
    if (!markdown) return null;
    const m = markdown.match(TAG_DECK_REGEX);
    return m ? m[1].trim() : null;
}

export interface RawScannedBlock {
    id: string;
    root_id?: string;
    markdown: string;
    ial: string;
}

/**
 * 扫描并分类存量与第三方插件卡包块
 */
export function discoverLegacyDecks(
    blocks: RawScannedBlock[],
    activeRiffDecks: RiffDeck[],
): DiscoveredLegacyDeck[] {
    const activeDeckIdSet = new Set(activeRiffDecks.map(d => d.id));

    const deckMap = new Map<string, { category: DeckCategory; blockIDs: string[]; sample?: string; source?: string }>();
    const orphanBlockIDs: string[] = [];

    for (const b of blocks) {
        const ialDeck = extractDeckFromIal(b.ial);
        const tagDeck = extractDeckFromTags(b.markdown);

        if (ialDeck) {
            // 如果已是当前已注册的原生 RiffDeck ID，跳过发现（已在本体卡包中）
            if (activeDeckIdSet.has(ialDeck)) {
                continue;
            }
            // 判断是否是已知卡包名称
            const deckName = ialDeck;
            const existing = deckMap.get(deckName);
            const source = b.ial.includes("custom-flashcard-deck")
                ? "思源第三方闪卡插件"
                : b.ial.includes("custom-riff-decks")
                ? "思源原生历史卡包"
                : "第三方插件卡包";
            if (existing) {
                existing.blockIDs.push(b.id);
            } else {
                deckMap.set(deckName, {
                    category: "third-party",
                    blockIDs: [b.id],
                    sample: b.markdown.slice(0, 60),
                    source,
                });
            }
        } else if (tagDeck) {
            const deckName = tagDeck;
            // 如果已存在同名 RiffDeck，依然可以提示同步
            const existing = deckMap.get(deckName);
            if (existing) {
                existing.blockIDs.push(b.id);
            } else {
                deckMap.set(deckName, {
                    category: "tag",
                    blockIDs: [b.id],
                    sample: b.markdown.slice(0, 60),
                    source: "标签卡包 (#deck/...)",
                });
            }
        } else if (b.markdown.includes("==") && !b.ial.includes("custom-riff-decks")) {
            // 未归组的孤儿闪卡（正文带挖空但无任何卡包关联）
            orphanBlockIDs.push(b.id);
        }
    }

    const result: DiscoveredLegacyDeck[] = [];

    for (const [name, info] of deckMap.entries()) {
        result.push({
            name,
            category: info.category,
            blockIDs: info.blockIDs,
            sampleBlockContent: info.sample,
            sourcePlugin: info.source,
        });
    }

    if (orphanBlockIDs.length > 0) {
        result.push({
            name: "未归组存量闪卡",
            category: "orphan",
            blockIDs: orphanBlockIDs,
            sampleBlockContent: "包含正文 ==挖空== 但尚未加入任何卡包的存量闪卡",
            sourcePlugin: "正文挖空卡片",
        });
    }

    return result;
}

export interface DeckSyncHelpers {
    getRiffDecks: () => Promise<RiffDeck[]>;
    createRiffDeck: (name: string) => Promise<RiffDeck>;
    addRiffCards: (deckID: string, blockIDs: string[]) => Promise<any>;
}

/**
 * 将发现的第三方/存量卡包一键接入并同步为思源原生 RiffDeck
 */
export async function syncDiscoveredDeckToRiff(
    discovered: DiscoveredLegacyDeck,
    helpers: DeckSyncHelpers,
): Promise<{ deckID: string; deckName: string; addedCount: number }> {
    const existingDecks = await helpers.getRiffDecks();
    let target = existingDecks.find(d => d.name === discovered.name || d.id === discovered.name);

    if (!target) {
        target = await helpers.createRiffDeck(discovered.name);
    }

    if (discovered.blockIDs.length > 0) {
        await helpers.addRiffCards(target.id, discovered.blockIDs);
    }

    return {
        deckID: target.id,
        deckName: target.name,
        addedCount: discovered.blockIDs.length,
    };
}

export interface DeckMergeHelpers {
    getRiffCards: (deckID: string, page: number, pageSize: number) => Promise<{ blocks: { id: string }[]; total: number }>;
    addRiffCards: (deckID: string, blockIDs: string[]) => Promise<any>;
    removeRiffDeck?: (deckID: string) => Promise<any>;
}

/**
 * 合并卡包：将源卡包内的所有卡片并入目标卡包，并可选删除源卡包
 */
export async function mergeRiffDecks(
    sourceDeckID: string,
    targetDeckID: string,
    helpers: DeckMergeHelpers,
    options?: { deleteSourceDeck?: boolean },
): Promise<{ mergedCount: number }> {
    if (!sourceDeckID || !targetDeckID || sourceDeckID === targetDeckID) {
        return { mergedCount: 0 };
    }

    // 分页获取源卡包全部卡片
    const allBlockIDs: string[] = [];
    let page = 1;
    while (true) {
        const resp = await helpers.getRiffCards(sourceDeckID, page, 50);
        if (!resp || !resp.blocks || resp.blocks.length === 0) break;
        for (const b of resp.blocks) {
            if (b.id) allBlockIDs.push(b.id);
        }
        if (allBlockIDs.length >= resp.total) break;
        page++;
    }

    if (allBlockIDs.length > 0) {
        await helpers.addRiffCards(targetDeckID, allBlockIDs);
    }

    if (options?.deleteSourceDeck && helpers.removeRiffDeck) {
        await helpers.removeRiffDeck(sourceDeckID);
    }

    return { mergedCount: allBlockIDs.length };
}

/**
 * 筛选出卡片数量为 0 的冗余空卡包
 */
export function findEmptyDecks(decks: RiffDeck[]): RiffDeck[] {
    return decks.filter(d => (d.size ?? 0) === 0);
}
