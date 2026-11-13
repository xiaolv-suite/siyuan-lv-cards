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
 * 格式化卡片字号缩放比例百分比字符串（如 "120%"）
 */
export function formatFontScalePercent(scale: number): string {
    const valid = Number.isFinite(scale) && scale > 0 ? scale : 1;
    return `${Math.round(valid * 100)}%`;
}

/**
 * 判定卡片题面在编辑返回后是否发生变动，需要废弃题型及打字等临时状态
 */
export function shouldInvalidateCardDerivedState(existingHtml: string, incomingHtml: string): boolean {
    return Boolean(existingHtml && existingHtml !== incomingHtml);
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

export interface LastAnsweredSnapshot<T = any> {
    html: string;
    card: T;
    revealed: boolean;
}

/**
 * 构造上一张已作答卡片回看快照
 */
export function createLastAnsweredSnapshot<T>(
    card: T | null | undefined,
    html: string,
    revealed: boolean
): LastAnsweredSnapshot<T> | null {
    if (!card) return null;
    return { html, card, revealed };
}

/**
 * 截取当前卡片之后的剩余复习队列
 */
export function sliceQueueAfterCurrent<T extends { cardID: string }>(
    queue: readonly T[],
    currentCardID: string | undefined
): T[] {
    if (!currentCardID) return [...queue];
    const idx = queue.findIndex(c => c.cardID === currentCardID);
    if (idx === -1) return [...queue];
    return queue.slice(idx + 1);
}

/**
 * 构造助记便签更新块属性对象
 */
export function buildMemoAttributes(memoText: string): { memo: string } {
    return { memo: String(memoText ?? "").trim() };
}

/**
 * 判定当前卡片是否正处于异步操作忙碌状态（评分提交中、改期中或解散归档中）
 */
export function isCardActionBusy(submitting: boolean, rescheduleBusy: boolean, dismissBusy = false): boolean {
    return submitting || rescheduleBusy || dismissBusy;
}

/**
 * 判定当前卡片是否允许执行评分操作
 */
export function canRateCurrentCard(
    hasCurrent: boolean,
    isPaused: boolean,
    showAnswer: boolean,
    force: boolean,
    isBusy: boolean
): boolean {
    if (!hasCurrent || isPaused || isBusy) return false;
    return showAnswer || force;
}

export interface LiveAnnouncement {
    msg: string;
    tone: "polite" | "assertive";
}

/**
 * 构造无障碍读屏实时播报载荷
 */
export function createLiveAnnouncement(
    msg: string,
    tone: "polite" | "assertive" = "polite"
): LiveAnnouncement {
    return { msg, tone };
}

/**
 * 安全提取出题队列头节点卡片，空队列时返回 null
 */
export function getNextQueueHead<T>(queue: readonly T[]): T | null {
    return queue.length > 0 ? queue[0] : null;
}


