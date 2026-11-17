/**
 * 复习队列处理与排序管道（Review Queue Pipeline）
 *
 * 封装复习出题队列的范围筛选、批次截断、同源防剧透、优先级排序、会话命中率计算与星标切换纯逻辑。
 */

import { filterBurySiblings, disperseSiblings } from "./sibling-cards";
import { DEFAULT_LEECH_THRESHOLD, isLeechCard } from "./revlog";
import { isCardDueThisWeek, CRAM_LEECH_THRESHOLD, type CramScope } from "./cram-mode";

export interface QueuePipelineCard {
    cardID: string;
    state: number;
    lapses: number;
    blockID?: string;
    sourceBlockId?: string;
    isLeech?: boolean;
    due?: string | number;
    nextDues?: Record<string, string>;
}

export interface QueuePipelineOptions<TCard> {
    scopeKey: string;
    batchLimit?: number;
    burySiblings?: boolean;
    disperseSiblings?: boolean;
    cramActive?: boolean;
    cramScope?: CramScope;
    reverseOrder?: boolean;
    randomOrder?: boolean;
    shuffleFn?: (cards: TCard[]) => TCard[];
    /** 水蛭卡遗忘次数阈值，取自用户设置；缺省用全局唯一默认值 */
    leechThreshold?: number;
}

/**
 * 对拉取的原始卡片队列执行范围筛选、批次截断、同源兄弟卡防剧透推迟与排序
 */
export function applyQueuePipeline<TCard extends QueuePipelineCard>(
    cards: readonly TCard[],
    options: QueuePipelineOptions<TCard>
): TCard[] {
    let result: TCard[] = cards.map(c => ({
        ...c,
        isLeech: isLeechCard(c, options.leechThreshold ?? DEFAULT_LEECH_THRESHOLD),
    }) as TCard);

    // 0. Cram 突击快刷专属范围筛选（全部卡片 / 本周待复习 / 仅水蛭卡 lapses≥5）
    if (options.cramActive && options.cramScope) {
        if (options.cramScope === "leech") {
            const threshold = options.leechThreshold ?? CRAM_LEECH_THRESHOLD;
            result = result.filter(c => (c.lapses ?? 0) >= threshold);
        } else if (options.cramScope === "weekDue") {
            result = result.filter(c => isCardDueThisWeek(c as any));
        }
    }

    // 1. 仅新卡 / 仅旧卡模式（睡前巩固包）
    if (options.scopeKey === "new" || options.scopeKey === "old") {
        result = result.filter(c => (options.scopeKey === "new") === (c.state === 0));
    }

    // 2. 排序策略（必须在兄弟卡防剧透与批次截断前执行，保证考前冲刺高难卡、全局倒序/乱序真正生效）
    if (options.randomOrder && options.shuffleFn) {
        // 随机乱序（Cram 或常规随机）
        result = options.shuffleFn(result);
    } else if (options.cramActive) {
        // 考前冲刺非乱序：遗忘多次的高难卡优先
        result.sort((a, b) => (b.lapses ?? 0) - (a.lapses ?? 0));
    } else if (options.reverseOrder) {
        // 倒序模式：最新到期优先
        result.reverse();
    }

    // 3. 同源兄弟卡防剧透推迟或自动错峰排列（Anki Bury / Disperse Siblings）
    if (!options.cramActive) {
        if (options.burySiblings) {
            const buryRes = filterBurySiblings(result as any[]);
            result = buryRes.retained as TCard[];
        } else if (options.disperseSiblings ?? true) {
            result = disperseSiblings(result as any[]) as TCard[];
        }
    }

    // 4. 批次上限截断（在完成排序与防剧透后，取最终批次）
    const bl = options.batchLimit ?? 0;
    if (bl > 0) {
        result = result.slice(0, bl);
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
    const total = session.newCount + session.reviewCount + session.forgetCount;
    if (total > 0) {
        const passed = session.newCount + session.reviewCount;
        return Math.round((passed / total) * 100);
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

export interface StarToggleFeedback {
    message: string;
    toastDuration: number;
    hapticPattern?: number;
}

/**
 * 格式化星标切换的用户反馈与震动配置
 */
export function formatStarToggleFeedback(isStarred: boolean): StarToggleFeedback {
    return {
        message: isStarred ? "已加入重点星标卡片" : "已取消星标",
        toastDuration: isStarred ? 1800 : 1500,
        hapticPattern: isStarred ? 15 : undefined,
    };
}

/**
 * 合并内核复习排除卡片 ID 集合（已评分 + 结构质量排除）
 */
export function combineExcludedCardIDs(
    reviewedIDs: readonly string[],
    qualityExcludedIDs: readonly string[]
): string[] {
    return [...new Set([...reviewedIDs, ...qualityExcludedIDs])];
}

/**
 * 本地过滤当前会话已跳过或被用户标记为今天不学的卡片
 */
export function filterActiveSessionCards<T extends { cardID: string; blockID?: string }>(
    cards: readonly T[],
    isSuspended: (id: string) => boolean,
    skippedIDs: readonly string[]
): T[] {
    const skipSet = new Set(skippedIDs);
    return cards.filter(c => !isSuspended(c.cardID) && (!c.blockID || !isSuspended(c.blockID)) && !skipSet.has(c.cardID));
}

/**
 * 合并新发现的质量不合规卡片 ID
 */
export function mergeQualityExcludedCardIDs(
    currentExcluded: readonly string[],
    newInvalid: readonly { cardID?: string }[]
): string[] {
    const validNewIds = newInvalid.map(item => item.cardID).filter((id): id is string => Boolean(id));
    return [...new Set([...currentExcluded, ...validNewIds])];
}
