/**
 * 会话内遗忘卡短期循环（展示层队列，不参与 FSRS 调度）。
 *
 * 该模块只负责时间窗口的纯逻辑，调用方决定何时把到期项目放回本地队列。
 * 默认延迟保持在几分钟，避免评分 Again 后马上看到同一张卡造成机械重复。
 */
export const SHORT_REQUEUE_DELAY_MS = 3 * 60 * 1000;

export interface DelayedRequeue<T> {
    card: T;
    dueAt: number;
}

/** 为重现卡标记 lvRequeue=1 属性。 */
export function markAsRequeueCard<T>(card: T): T & { lvRequeue: 1 } {
    return { ...card, lvRequeue: 1 };
}

/** 将一张遗忘卡加入会话内延迟队列。 */
export function enqueueDelayedRequeue<T>(
    pending: readonly DelayedRequeue<T>[],
    card: T,
    now = Date.now(),
    delayMs = SHORT_REQUEUE_DELAY_MS,
): DelayedRequeue<T>[] {
    const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : SHORT_REQUEUE_DELAY_MS;
    return [...pending, { card, dueAt: now + delay }];
}

/** 取出到期项目，并保持未到期项目的原有顺序。 */
export function takeDueRequeues<T>(
    pending: readonly DelayedRequeue<T>[],
    now = Date.now(),
): { due: T[]; pending: DelayedRequeue<T>[] } {
    const due: T[] = [];
    const rest: DelayedRequeue<T>[] = [];
    for (const item of pending) {
        if (item.dueAt <= now) {
            due.push(item.card);
        } else {
            rest.push(item);
        }
    }
    return { due, pending: rest };
}

/** 返回下一张延迟卡距离出现还需等待的毫秒数；没有待处理卡时返回 null。 */
export function nextRequeueDelay(
    pending: readonly DelayedRequeue<unknown>[],
    now = Date.now(),
): number | null {
    if (pending.length === 0) return null;
    const nextAt = Math.min(...pending.map(item => item.dueAt));
    return Math.max(0, nextAt - now);
}

/**
 * 判定是否处于延迟重现等待态（未完成、无当前卡片、存在待重现卡且无加载/错误）
 */
export function isRequeueWaiting(
    sessionDone: boolean,
    hasCurrent: boolean,
    pendingCount: number,
    loading: boolean,
    hasError: boolean
): boolean {
    return !sessionDone && !hasCurrent && pendingCount > 0 && !loading && !hasError;
}

/**
 * 计算下一张重现卡等待倒计时整秒数
 */
export function calculateRequeueWaitSeconds(nextDelayMs: number | null): number {
    if (nextDelayMs === null || nextDelayMs <= 0) return 0;
    return Math.max(0, Math.ceil(nextDelayMs / 1000));
}

export interface RequeueSchedulerOptions<T> {
    onDue: (dueCards: T[]) => void;
    onTick?: (now: number) => void;
    isLoading?: () => boolean;
    getPending: () => readonly DelayedRequeue<T>[];
    setPending: (next: DelayedRequeue<T>[]) => void;
}

export interface DelayedRequeueScheduler {
    schedule: () => void;
    releaseDue: () => void;
    stop: () => void;
}

/**
 * 延迟重考计时调度器：封装 setTimeout 与 1s 倒计时时钟驱动，并防御与异步拉取队列的数据竞态
 */
export function createDelayedRequeueScheduler<T>(
    options: RequeueSchedulerOptions<T>
): DelayedRequeueScheduler {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let clockTimer: ReturnType<typeof setInterval> | null = null;

    function stop() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (clockTimer) {
            clearInterval(clockTimer);
            clockTimer = null;
        }
    }

    function schedule() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        const pending = options.getPending();
        if (pending.length === 0) {
            if (clockTimer) {
                clearInterval(clockTimer);
                clockTimer = null;
            }
            return;
        }
        const now = Date.now();
        options.onTick?.(now);
        const delay = nextRequeueDelay(pending, now);
        timer = setTimeout(() => {
            timer = null;
            releaseDue();
        }, Math.max(0, delay ?? SHORT_REQUEUE_DELAY_MS));

        if (!clockTimer) {
            clockTimer = setInterval(() => {
                options.onTick?.(Date.now());
            }, 1000);
        }
    }

    function releaseDue() {
        if (options.isLoading?.()) {
            timer = setTimeout(() => {
                timer = null;
                releaseDue();
            }, 250);
            return;
        }
        const now = Date.now();
        const result = takeDueRequeues(options.getPending(), now);
        options.setPending(result.pending);
        if (result.due.length > 0) {
            options.onDue(result.due);
        }
        schedule();
    }

    return {
        schedule,
        releaseDue,
        stop,
    };
}

