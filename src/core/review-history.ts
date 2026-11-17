/**
 * 复习撤销历史栈控制器（Review History Stack Controller）
 *
 * 管理单次复习会话内的作答撤销历史快照栈：
 * - 记录每次评分前的全量队列状态、延迟重现卡列表、已复习/已跳过卡片 ID 集合、当前卡片内容、卡面 HTML、遮挡数据与统计计数器
 * - 维护最大撤销深度限制（MAX_REVIEW_HISTORY_DEPTH = 50），防止大库无限快照耗尽内存
 * - 提供深拷贝快照生成与安全弹出恢复能力
 */

import type { DelayedRequeue } from "./delayed-requeue";
import type { OcclusionData } from "./occlusion";

export interface ReviewCounters {
    new: number;
    review: number;
    forget: number;
    skip: number;
}

export interface ReviewHistorySnapshot<TCard = any> {
    queue: TCard[];
    pendingRequeues: DelayedRequeue<TCard>[];
    reviewedIDs: string[];
    skippedIDs: string[];
    current: TCard;
    showAnswer: boolean;
    cardHtml: string;
    expectedText: string;
    faceError: string;
    occlusion: OcclusionData | null;
    counters: ReviewCounters;
    /** 仅当本次操作实际写入了正式 revlog 时为 true；跳过、重现卡与 Cram 模式均为 false，防止撤销时误删历史记录 */
    revlogAppended?: boolean;
    /** 若本次操作为 Ctrl+D 归档隐藏卡片，记录被归档的 blockID 以供撤销时恢复 */
    dismissedBlockID?: string;
    /** 若本次操作为 S 今天不学（仅今日暂缓），记录被暂缓的 cardID 以供撤销时恢复 */
    suspendedCardID?: string;
    /** 单调递增快照序号（标量值，避免 Svelte 5 $state Proxy === 比对失配） */
    snapshotSeq?: number;
}

export const MAX_REVIEW_HISTORY_DEPTH = 50;

/**
 * 创建单条复习历史快照（数组与嵌套对象均安全浅克隆，避免后续变更污染历史状态）
 */
export function createReviewHistorySnapshot<TCard>(input: {
    queue: readonly TCard[];
    pendingRequeues: readonly DelayedRequeue<TCard>[];
    reviewedIDs: readonly string[];
    skippedIDs: readonly string[];
    current: TCard;
    showAnswer: boolean;
    cardHtml: string;
    expectedText: string;
    faceError: string;
    occlusion: OcclusionData | null;
    counters: ReviewCounters;
    revlogAppended?: boolean;
    dismissedBlockID?: string;
    suspendedCardID?: string;
    snapshotSeq?: number;
}): ReviewHistorySnapshot<TCard> {
    return {
        queue: [...input.queue],
        pendingRequeues: input.pendingRequeues.map(item => ({ ...item })),
        reviewedIDs: [...input.reviewedIDs],
        skippedIDs: [...input.skippedIDs],
        current: input.current,
        showAnswer: input.showAnswer,
        cardHtml: input.cardHtml,
        expectedText: input.expectedText,
        faceError: input.faceError,
        occlusion: input.occlusion ? { v: input.occlusion.v, rects: [...input.occlusion.rects] } : null,
        counters: { ...input.counters },
        ...(input.revlogAppended !== undefined ? { revlogAppended: input.revlogAppended } : {}),
        ...(input.dismissedBlockID ? { dismissedBlockID: input.dismissedBlockID } : {}),
        ...(input.suspendedCardID ? { suspendedCardID: input.suspendedCardID } : {}),
        ...(input.snapshotSeq !== undefined ? { snapshotSeq: input.snapshotSeq } : {}),
    };
}

/**
 * 压入一条复习快照，并保持最大深度约束（超限时丢弃最旧快照）
 */
export function pushReviewHistory<TCard>(
    stack: ReviewHistorySnapshot<TCard>[],
    snapshot: ReviewHistorySnapshot<TCard>,
    maxDepth = MAX_REVIEW_HISTORY_DEPTH
): void {
    stack.push(snapshot);
    if (stack.length > maxDepth) {
        stack.shift();
    }
}

/**
 * 弹出最近一条复习快照
 */
export function popReviewHistory<TCard>(
    stack: ReviewHistorySnapshot<TCard>[]
): ReviewHistorySnapshot<TCard> | null {
    return stack.pop() ?? null;
}
