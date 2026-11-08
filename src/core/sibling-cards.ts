/**
 * 同源兄弟卡防剧透与分散机制（对标 Anki Bury Siblings 机制）。
 * 当一个原笔记块包含多个挖空或正反双向卡时，同一会话中同日出现会产生即时语境剧透。
 * 本模块提供纯函数，用于同源兄弟卡识别、安全分散与推迟，确保每一次提取努力（Desirable Difficulty）真实有效。
 */

export interface SiblingCardLike {
    blockID?: string;
    sourceBlockId?: string;
    cardID: string;
    rootID?: string;
    docId?: string;
    sourceDocId?: string;
    [key: string]: unknown;
}

/**
 * 提取卡片的同源关键标识（支持按块或按文档）
 */
export function getSiblingKey(card: SiblingCardLike, mode: "block" | "doc" = "block"): string {
    if (!card) return "";
    if (mode === "doc") {
        return String(card.sourceDocId ?? card.docId ?? card.rootID ?? card.sourceBlockId ?? card.blockID ?? "");
    }
    return String(card.sourceBlockId ?? card.blockID ?? "");
}

export interface BurySiblingsResult<T> {
    retained: T[];
    buriedCards: T[];
    buriedCount: number;
    buriedBlockIDs: string[];
}

/**
 * 依据 blockID / sourceBlockId 过滤同源兄弟卡：
 * 同一会话队列中，每个源块优先仅保留 1 张卡片进行测试，其余兄弟卡推迟到后续复习，杜绝虚假熟练感。
 */
export function filterBurySiblings<T extends SiblingCardLike>(cards: readonly T[]): BurySiblingsResult<T> {
    const seen = new Set<string>();
    const retained: T[] = [];
    const buriedCards: T[] = [];
    const buriedBlockIDs: string[] = [];

    for (const card of cards) {
        const bid = getSiblingKey(card, "block");
        if (!bid) {
            retained.push(card);
            continue;
        }
        if (!seen.has(bid)) {
            seen.add(bid);
            retained.push(card);
        } else {
            buriedCards.push(card);
            if (!buriedBlockIDs.includes(bid)) {
                buriedBlockIDs.push(bid);
            }
        }
    }

    return {
        retained,
        buriedCards,
        buriedCount: buriedCards.length,
        buriedBlockIDs,
    };
}

/**
 * 计算队列中相邻同源卡片的冲突对数（用于量化检验打散效果）
 */
export function countSiblingClashes<T extends SiblingCardLike>(cards: readonly T[]): number {
    let clashes = 0;
    for (let i = 0; i < cards.length - 1; i++) {
        const k1 = getSiblingKey(cards[i], "block");
        const k2 = getSiblingKey(cards[i + 1], "block");
        if (k1 && k2 && k1 === k2) {
            clashes++;
        }
    }
    return clashes;
}

/**
 * 将同源卡片分组为字典
 */
export function groupSiblingCards<T extends SiblingCardLike>(cards: readonly T[]): Map<string, T[]> {
    const buckets = new Map<string, T[]>();
    for (const card of cards) {
        const bid = getSiblingKey(card, "block");
        if (!bid) continue;
        const b = buckets.get(bid) ?? [];
        b.push(card);
        buckets.set(bid, b);
    }
    return buckets;
}

/**
 * 同源卡片最大间距分散（Disperse Siblings / 轮转错峰错位排列）：
 * 1. 采用轮转分层策略（Round-Robin Layers），第一轮先让各个源块的首张卡片相继登场，确保前置卡片覆盖面最大化；
 * 2. 在后续轮次中引入循环错位步长（Round Stride Shift），杜绝前一轮末尾与后一轮起始出现相同源块；
 * 3. 无 blockID 的卡片作为中立缓冲垫（Buffer Cards），均匀穿插到各轮次中拉大间距。
 */
export function disperseSiblings<T extends SiblingCardLike>(cards: readonly T[]): T[] {
    if (!Array.isArray(cards) || cards.length <= 2) return [...(cards || [])];

    const buckets = new Map<string, T[]>();
    const noBlock: T[] = [];

    for (const card of cards) {
        const bid = getSiblingKey(card, "block");
        if (!bid) {
            noBlock.push(card);
            continue;
        }
        const b = buckets.get(bid) ?? [];
        b.push(card);
        buckets.set(bid, b);
    }

    if (buckets.size === 0) return [...noBlock];
    if (buckets.size === 1 && noBlock.length === 0) return [...cards];

    const bucketKeys = Array.from(buckets.keys());
    let maxLen = 0;
    for (const list of buckets.values()) {
        if (list.length > maxLen) maxLen = list.length;
    }

    const dispersed: T[] = [];
    for (let round = 0; round < maxLen; round++) {
        // 错位步长：每一轮循环平移，避免相邻轮次交界处相同的桶首尾相接
        const offset = round % bucketKeys.length;
        const reorderedKeys = [
            ...bucketKeys.slice(offset),
            ...bucketKeys.slice(0, offset)
        ];

        for (const k of reorderedKeys) {
            const list = buckets.get(k)!;
            if (round < list.length) {
                const card = list[round];
                // 检查是否与上一张相同，若相同且有缓冲卡，则先垫入一张缓冲卡
                if (dispersed.length > 0) {
                    const lastCard = dispersed[dispersed.length - 1];
                    const lastKey = getSiblingKey(lastCard, "block");
                    if (lastKey && lastKey === k && noBlock.length > 0) {
                        dispersed.push(noBlock.shift()!);
                    }
                }
                dispersed.push(card);
            }
        }
    }

    // 收尾将剩余的无 block 卡平滑追加
    if (noBlock.length > 0) {
        dispersed.push(...noBlock);
    }

    return dispersed;
}
