/**
 * 卡片快捷操作与视图控制纯函数（Card Actions & View Adjusters）
 */

import { gradeTyping, type Rating1to4 } from "./card-types";

/**
 * 调整卡片字号缩放比例（0.7 ~ 2.5 之间以 0.1 步进平滑调整）
 */
export function clampFontScale(currentScale = 1, delta = 0, min = 0.7, max = 2.5): number {
    return Math.min(max, Math.max(min, Math.round((currentScale + delta) * 10) / 10));
}

/**
 * 切换格式问题卡片标记集合（不可变操作）
 */
export function toggleCardIssue(
    markedIssueCardIDs: ReadonlySet<string>,
    cardID: string
): { nextMarkedIDs: Set<string>; isMarked: boolean } {
    const next = new Set(markedIssueCardIDs);
    if (next.has(cardID)) {
        next.delete(cardID);
        return { nextMarkedIDs: next, isMarked: false };
    } else {
        next.add(cardID);
        return { nextMarkedIDs: next, isMarked: true };
    }
}

/**
 * 从队列中移除已退役或已删除的卡片
 */
export function removeCardFromQueue<T extends { cardID: string }>(
    queue: readonly T[],
    cardID: string
): T[] {
    return queue.filter(c => c.cardID !== cardID);
}

/**
 * 计算作答时长（秒），按设置上限封顶防离席异常
 */
export function computeAnswerDuration(
    cardShownAt: number,
    capSec = 60,
    now = Date.now()
): number | undefined {
    if (cardShownAt <= 0) return undefined;
    const cap = Math.max(5, capSec || 60);
    return Math.min(cap, Math.max(0, Math.round((now - cardShownAt) / 1000)));
}

export interface ReviewSessionCounters {
    new: number;
    review: number;
    forget: number;
    skip: number;
}

/**
 * 创建清空的会话计数对象
 */
export function createEmptySessionCounters(): ReviewSessionCounters {
    return { new: 0, review: 0, forget: 0, skip: 0 };
}

/**
 * 依据单张评分更新会话统计计数
 */
export function updateSessionCountersOnRate(
    counters: ReviewSessionCounters,
    rating: number,
    wasNew: boolean
): ReviewSessionCounters {
    if (rating === 1) {
        return { ...counters, forget: counters.forget + 1 };
    }
    if (wasNew) {
        return { ...counters, new: counters.new + 1 };
    }
    return { ...counters, review: counters.review + 1 };
}

export interface CardTypingResult {
    typingGrade: { chars: { ch: string; ok: boolean }[]; suggested: Rating1to4 } | null;
    isBlank: boolean;
}

/**
 * 评估打字作答并给出评分建议（空输入直接判定放弃思考）
 */
export function evaluateCardTyping(
    expectedText: string,
    typingInput: string,
    strict = false
): CardTypingResult {
    const input = typingInput.trim();
    if (!input || !expectedText) {
        return { typingGrade: null, isBlank: true };
    }
    const g = gradeTyping(expectedText, typingInput, strict);
    return {
        typingGrade: { chars: g.chars, suggested: g.suggested },
        isBlank: false,
    };
}


