/**
 * 复习队列处理与排序管道（Review Queue Pipeline）
 *
 * 封装复习出题队列的范围筛选、批次截断、同源防剧透、优先级排序、会话命中率计算与星标切换纯逻辑。
 */

import { filterBurySiblings } from "./sibling-cards";

export interface QueuePipelineCard {
    cardID: string;
    state: number;
    lapses: number;
    blockID?: string;
}

export interface QueuePipelineOptions<TCard> {
    scopeKey: string;
    batchLimit?: number;
    burySiblings?: boolean;
    cramActive?: boolean;
    reverseOrder?: boolean;
    randomOrder?: boolean;
    shuffleFn?: (cards: TCard[]) => TCard[];
}

/**
 * 对拉取的原始卡片队列执行范围筛选、批次截断、同源兄弟卡防剧透推迟与排序
 */
export function applyQueuePipeline<TCard extends QueuePipelineCard>(
    cards: readonly TCard[],
    options: QueuePipelineOptions<TCard>
): TCard[] {
    let result = [...cards];

    // 1. 仅新卡 / 仅旧卡模式（睡前巩固包）
    if (options.scopeKey === "new" || options.scopeKey === "old") {
        result = result.filter(c => (options.scopeKey === "new") === (c.state === 0));
    }

    // 2. 批次上限截断
    const bl = options.batchLimit ?? 0;
    if (bl > 0) {
        result = result.slice(0, bl);
    }

    // 3. 同源兄弟卡防剧透推迟（Anki Bury Siblings）
    if (!options.cramActive && options.burySiblings) {
        const buryRes = filterBurySiblings(result as any[]);
        result = buryRes.retained as TCard[];
    }

    // 4. 排序策略
    if (options.cramActive) {
        // 考前冲刺：遗忘多次的高难卡优先
        result.sort((a, b) => b.lapses - a.lapses);
    } else if (options.reverseOrder) {
        // 倒序模式：最新到期优先
        result.reverse();
    } else if (options.randomOrder && options.shuffleFn) {
        // 随机乱序
        result = options.shuffleFn(result);
    }

    return result;
}

/**
 * 计算复习会话命中率百分比（0-100）
 */
export function calculateReviewAccuracy(session: {
    newCount: number;
    reviewCount: number;
    forgetCount: number;
    quizTotal: number;
    quizCorrect: number;
}): number {
    if (session.quizTotal > 0) {
        return Math.round((session.quizCorrect / session.quizTotal) * 100);
    }
    const totalRated = session.newCount + session.reviewCount;
    if (totalRated > 0) {
        const passed = Math.max(0, totalRated - session.forgetCount);
        return Math.round((passed / totalRated) * 100);
    }
    return 100;
}

/**
 * 切换卡片星标集合状态（返回新 Set 与是否星标）
 */
export function toggleCardStar(
    starredCardIDs: ReadonlySet<string>,
    cardID: string
): { nextStarredIDs: Set<string>; isStarred: boolean } {
    const next = new Set(starredCardIDs);
    if (next.has(cardID)) {
        next.delete(cardID);
        return { nextStarredIDs: next, isStarred: false };
    } else {
        next.add(cardID);
        return { nextStarredIDs: next, isStarred: true };
    }
}
