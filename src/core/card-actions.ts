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
    customRiffTitle?: string;
}

/**
 * 构造上一张已作答卡片回看快照
 */
export function createLastAnsweredSnapshot<T>(
    card: T | null | undefined,
    html: string,
    revealed: boolean,
    customRiffTitle?: string
): LastAnsweredSnapshot<T> | null {
    if (!card) return null;
    return { html, card, revealed, customRiffTitle };
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
 * 构造“取消制卡”时需要清空的块属性补丁（清空 custom-riff-*、custom-exam-*、custom-lv-occlusion 等属性，保留正文）
 */
export function buildUnmakeCardAttributes(): Record<string, string> {
    return {
        "custom-riff-decks": "",
        "custom-riff-title": "",
        "custom-riff-answer": "",
        "custom-riff-occlusion": "",
        "custom-lv-question": "",
        "custom-lv-answer": "",
        "custom-card-title": "",
        "custom-card-answer": "",
        "custom-lv-card-type": "",
        "custom-lv-attr-subtype": "",
        "custom-lv-hint": "",
        "custom-lv-bidi": "",
        "custom-lv-starred": "",
        "custom-lv-dismissed": "",
        "custom-lv-error-reason": "",
        "custom-exam-type": "",
        "custom-exam-answer": "",
        "custom-exam-analysis": "",
        "custom-lv-occlusion": "",
        "lv-occlusion": "",
    };
}

export interface CardLifecycleActionResult {
    success: boolean;
    blockID: string;
    action: "unmake" | "delete";
    error?: string;
}

/**
 * 执行“取消制卡”业务流（解定制卡属性保留正文）：
 * 1. 移出 Riff 闪卡卡组；
 * 2. 清除 custom-riff-* 与 custom-exam-* 块属性；
 * 3. 刷新到期缓存。
 */
export async function executeUnmakeCard(
    blockID: string,
    helpers: {
        removeFromDeck?: (blockID: string, deckID?: string) => Promise<unknown>;
        setBlockAttrs?: (id: string, attrs: Record<string, string>) => Promise<unknown>;
        invalidateCache?: () => void;
        deckID?: string;
    }
): Promise<CardLifecycleActionResult> {
    if (!blockID) return { success: false, blockID: "", action: "unmake", error: "missing blockID" };
    if (helpers.removeFromDeck) {
        const res = helpers.deckID
            ? await helpers.removeFromDeck(blockID, helpers.deckID)
            : await helpers.removeFromDeck(blockID);
        if (res && typeof res === "object" && (res as any).success === false) {
            throw new Error(String((res as any).error || "取消制卡失败：未能从卡组移出"));
        }
    }
    if (helpers.setBlockAttrs) {
        await helpers.setBlockAttrs(blockID, buildUnmakeCardAttributes());
    }
    helpers.invalidateCache?.();
    return { success: true, blockID, action: "unmake" };
}

/**
 * 执行“物理删除原笔记块”业务流（高危不可逆操作）：
 * 1. 尝试从 Riff 卡组移出；
 * 2. 调用 deleteBlock 物理删除原块；
 * 3. 刷新到期缓存。
 */
export async function executeDeleteBlock(
    blockID: string,
    helpers: {
        deleteBlock: (id: string) => Promise<unknown>;
        removeFromDeck?: (blockID: string) => Promise<unknown>;
        invalidateCache?: () => void;
    }
): Promise<CardLifecycleActionResult> {
    if (!blockID) return { success: false, blockID: "", action: "delete", error: "missing blockID" };
    try {
        if (helpers.removeFromDeck) {
            await helpers.removeFromDeck(blockID);
        }
    } catch {}
    await helpers.deleteBlock(blockID);
    helpers.invalidateCache?.();
    return { success: true, blockID, action: "delete" };
}

/**
 * 判定当前卡片是否正处于异步操作忙碌状态（评分提交中、改期中、解散归档或物理删除中）
 */
export function isCardActionBusy(
    submitting: boolean,
    rescheduleBusy: boolean,
    dismissBusy = false,
    retireBusy = false,
    deleteBusy = false
): boolean {
    return submitting || rescheduleBusy || dismissBusy || retireBusy || deleteBusy;
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


