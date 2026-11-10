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

export type DeckBadgeIcon = "graduation" | "book" | "home" | "check" | "flag" | "cards";

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

export const SIYUAN_BUILTIN_DECK_ID = "20230218211946-2kw8jgx";

const ATTR_DECK_REGEXES = [
    /custom-riff-decks=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/,
    /custom-flashcard-deck=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/,
    /custom-deck=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/,
    /custom-card-deck=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/,
    /custom-card-group=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/,
    /custom-card-pack=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/,
];

const TAG_DECK_REGEX = /#(?:deck|卡包|卡组)\/([^\s#,]+)/;

/**
 * 从块 IAL 属性字符串中提取卡包标识（支持原生与第三方插件）
 */
export function extractDeckFromIal(ial: string): string | null {
    const list = extractDecksFromIal(ial);
    return list.length > 0 ? list[0] : null;
}

/**
 * 从块 IAL 属性中提取所有关联卡包（兼容思源原生逗号分隔的多卡包映射）
 */
export function extractDecksFromIal(ial: string): string[] {
    if (!ial) return [];
    const found: string[] = [];
    for (const reg of ATTR_DECK_REGEXES) {
        const m = ial.match(reg);
        if (m) {
            const rawVal = (m[1] ?? m[2] ?? m[3] ?? "").trim();
            if (rawVal) {
                // custom-riff-decks 是逗号分隔的多个卡包 ID
                const parts = rawVal.split(",").map(s => s.trim()).filter(Boolean);
                found.push(...parts);
            }
        }
    }
    return [...new Set(found)];
}

/**
 * 提取闪卡工具箱（sy-flashcard-toolbox-plugin）自定义卡片标题
 */
export function extractCustomRiffTitle(ial: string): string | null {
    if (!ial) return null;
    const m = ial.match(/custom-riff-title=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/) ||
              ial.match(/custom-card-title=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/);
    if (!m) return null;
    const val = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    return val || null;
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
    const activeDeckIdSet = new Set(activeRiffDecks.map(d => d.id.trim()));
    const activeDeckNameSet = new Set(activeRiffDecks.map(d => d.name.trim().toLowerCase()));

    // 辅助检查某卡包标识（ID 或名称）是否已被原生 Riff 卡包收录
    const isAlreadyActive = (ref: string): boolean => {
        const clean = ref.trim();
        if (!clean) return true;
        if (activeDeckIdSet.has(clean)) return true;
        if (activeDeckNameSet.has(clean.toLowerCase())) return true;
        return false;
    };

    const deckMap = new Map<string, { category: DeckCategory; blockIDs: string[]; sample?: string; source?: string }>();
    const orphanBlockIDs: string[] = [];

    for (const b of blocks) {
        const ialDecks = extractDecksFromIal(b.ial);
        const tagDeck = extractDeckFromTags(b.markdown);

        if (ialDecks.length > 0) {
            for (const deckRef of ialDecks) {
                const trimmedRef = deckRef.trim();
                const isBuiltin = trimmedRef === SIYUAN_BUILTIN_DECK_ID;
                const deckName = isBuiltin ? "思源默认内置卡包" : trimmedRef;

                // 如果已在活跃的原生卡包中（匹配 ID 或名称），已导入过的存量卡包不应再被识别
                if (isAlreadyActive(trimmedRef) || isAlreadyActive(deckName)) {
                    continue;
                }
                const source = isBuiltin
                    ? "思源默认内置卡包"
                    : b.ial.includes("custom-flashcard-deck")
                    ? "SiYuanMemo / 第三方闪卡插件"
                    : b.ial.includes("custom-riff-decks")
                    ? "思源原生历史卡包"
                    : "第三方插件卡包";

                const existing = deckMap.get(deckName);
                if (existing) {
                    if (!existing.blockIDs.includes(b.id)) {
                        existing.blockIDs.push(b.id);
                    }
                } else {
                    deckMap.set(deckName, {
                        category: "third-party",
                        blockIDs: [b.id],
                        sample: b.markdown.slice(0, 60),
                        source,
                    });
                }
            }
        } else if (tagDeck) {
            const deckName = tagDeck.trim();
            // 如果标签卡包名称已存在同名活跃原生卡包，不重复识别
            if (isAlreadyActive(deckName)) {
                continue;
            }
            const existing = deckMap.get(deckName);
            if (existing) {
                if (!existing.blockIDs.includes(b.id)) {
                    existing.blockIDs.push(b.id);
                }
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
        if (isAlreadyActive(name)) {
            continue;
        }
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
            name: "未归组闪卡",
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

export const PINNED_DECKS_STORAGE_KEY = "lv-cards.pinned-decks";
export const DECK_SORT_STORAGE_KEY = "lv-cards.deck-sort-mode";

export type DeckSortMode = "default" | "size-desc" | "name-asc";

/**
 * 读取置顶卡包 ID 列表（CF-05）
 */
export function loadPinnedDeckIds(storage?: Storage): string[] {
    const s = storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
    if (!s) return [];
    try {
        const raw = s.getItem(PINNED_DECKS_STORAGE_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
    } catch {
        return [];
    }
}

/**
 * 保存置顶卡包 ID 列表
 */
export function savePinnedDeckIds(ids: string[], storage?: Storage): void {
    const s = storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
    if (!s) return;
    try {
        s.setItem(PINNED_DECKS_STORAGE_KEY, JSON.stringify(ids));
    } catch { /* 旁路 */ }
}

/**
 * 切换某卡包的置顶状态
 */
export function togglePinnedDeckId(ids: string[], deckId: string, storage?: Storage): string[] {
    const set = new Set(ids);
    if (set.has(deckId)) {
        set.delete(deckId);
    } else {
        set.add(deckId);
    }
    const next = Array.from(set);
    savePinnedDeckIds(next, storage);
    return next;
}

/**
 * 卡包列表按置顶与排序模式重排（置顶优先排在前列）
 */
export function sortDecksWithPins<T extends { id: string; name: string; size?: number }>(
    decks: T[],
    pinnedIds: string[],
    sortMode: DeckSortMode = "default"
): T[] {
    const pinSet = new Set(pinnedIds);
    const pinned: T[] = [];
    const unpinned: T[] = [];
    for (const d of decks) {
        if (pinSet.has(d.id)) pinned.push(d);
        else unpinned.push(d);
    }

    const sortFn = (a: T, b: T) => {
        if (sortMode === "size-desc") {
            return (b.size ?? 0) - (a.size ?? 0);
        }
        if (sortMode === "name-asc") {
            return a.name.localeCompare(b.name, undefined, { numeric: true });
        }
        return 0;
    };

    pinned.sort(sortFn);
    unpinned.sort(sortFn);
    return [...pinned, ...unpinned];
}

export interface DeckClusterNode<T extends { id: string; name: string; size?: number }> {
    prefix: string;
    isGroup: boolean;
    totalSize: number;
    decks: T[];
}

/**
 * 识别卡包名称中的斜杠分级命名（如「考研/数学/高数」），按顶层前缀聚类（CF-02）
 */
export function clusterDecksBySlash<T extends { id: string; name: string; size?: number }>(
    decks: T[]
): DeckClusterNode<T>[] {
    const groups = new Map<string, T[]>();
    const rootOrder: string[] = [];

    for (const d of decks) {
        const parts = d.name.split("/").map(p => p.trim()).filter(Boolean);
        if (parts.length > 1) {
            const rootPrefix = parts[0];
            let list = groups.get(rootPrefix);
            if (!list) {
                list = [];
                groups.set(rootPrefix, list);
                rootOrder.push(rootPrefix);
            }
            list.push(d);
        } else {
            const key = `__single__:${d.id}`;
            groups.set(key, [d]);
            rootOrder.push(key);
        }
    }

    const clusters: DeckClusterNode<T>[] = [];
    for (const key of rootOrder) {
        const list = groups.get(key) ?? [];
        if (key.startsWith("__single__:")) {
            const d = list[0];
            clusters.push({
                prefix: d.name,
                isGroup: false,
                totalSize: d.size ?? 0,
                decks: [d],
            });
        } else {
            const totalSize = list.reduce((sum, d) => sum + (d.size ?? 0), 0);
            clusters.push({
                prefix: key,
                isGroup: list.length > 1,
                totalSize,
                decks: list,
            });
        }
    }
    return clusters;
}

export type EcosystemOrigin = "exam" | "glean" | "home" | "checkin" | "none";

export interface DeckEcosystemBadge {
    origin: EcosystemOrigin;
    label: string;
    icon: DeckBadgeIcon;
    colorTone: "brand" | "info" | "warning" | "success";
    actionLabel?: string;
}

/**
 * 识别卡包所属的小驴家族生态来源（如小驴考试、小驴拾遗、小驴管家等）
 */
export function getDeckEcosystemBadge(deckName: string): DeckEcosystemBadge | null {
    const trimmed = (deckName || "").trim();
    if (trimmed.startsWith("小驴考试/") || trimmed === "小驴考试" || trimmed.startsWith("siyuan-exam/")) {
        return {
            origin: "exam",
            label: "小驴考试",
            icon: "graduation",
            colorTone: "brand",
            actionLabel: "考试台",
        };
    }
    if (trimmed === "拾遗卡片" || trimmed.startsWith("拾遗卡片/") || trimmed.startsWith("小驴拾遗/")) {
        return {
            origin: "glean",
            label: "小驴拾遗",
            icon: "book",
            colorTone: "info",
        };
    }
    if (trimmed.startsWith("小驴管家/") || trimmed.startsWith("管家备忘")) {
        return {
            origin: "home",
            label: "小驴管家",
            icon: "home",
            colorTone: "warning",
        };
    }
    if (trimmed.startsWith("小驴打卡/") || trimmed.startsWith("打卡")) {
        return {
            origin: "checkin",
            label: "小驴打卡",
            icon: "check",
            colorTone: "success",
        };
    }
    return null;
}


