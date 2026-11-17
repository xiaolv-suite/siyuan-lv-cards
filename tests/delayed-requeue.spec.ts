import { describe, expect, it, vi } from "vitest";
import {
    enqueueDelayedRequeue,
    nextRequeueDelay,
    SHORT_REQUEUE_DELAY_MS,
    takeDueRequeues,
    createDelayedRequeueScheduler,
    markAsRequeueCard,
    isRequeueWaiting,
    calculateRequeueWaitSeconds,
    type DelayedRequeue,
} from "../src/core/delayed-requeue";

describe("delayed requeue（会话内遗忘卡短期循环）", () => {
    it("默认延迟几分钟，不会立即把 Again 卡放回队列", () => {
        const pending = enqueueDelayedRequeue([], "card-1", 1_000);
        expect(pending).toEqual([{ card: "card-1", dueAt: 1_000 + SHORT_REQUEUE_DELAY_MS }]);
        expect(takeDueRequeues(pending, 1_000 + SHORT_REQUEUE_DELAY_MS - 1)).toEqual({
            due: [],
            pending,
        });
    });

    it("只释放到期卡并保持未到期卡顺序", () => {
        let pending = enqueueDelayedRequeue([], "card-a", 0, 100);
        pending = enqueueDelayedRequeue(pending, "card-b", 0, 300);
        pending = enqueueDelayedRequeue(pending, "card-c", 0, 200);
        const result = takeDueRequeues(pending, 150);
        expect(result.due).toEqual(["card-a"]);
        expect(result.pending.map(item => item.card)).toEqual(["card-b", "card-c"]);
        expect(nextRequeueDelay(result.pending, 150)).toBe(50);
    });

    it("非法延迟回退为默认延迟，负数延迟才允许显式立即释放", () => {
        expect(enqueueDelayedRequeue([], "fallback", 0, Number.NaN)[0].dueAt).toBe(SHORT_REQUEUE_DELAY_MS);
        expect(enqueueDelayedRequeue([], "now", 100, -1)[0].dueAt).toBe(100);
    });

    describe("createDelayedRequeueScheduler 调度器", () => {
        it("空队列停止调度", () => {
            let pending: DelayedRequeue<string>[] = [];
            const onDue = vi.fn();
            const scheduler = createDelayedRequeueScheduler({
                onDue,
                getPending: () => pending,
                setPending: (p) => { pending = p; },
            });
            scheduler.schedule();
            expect(onDue).not.toHaveBeenCalled();
            scheduler.stop();
        });

        it("定时到期释放卡片并触发回调", () => {
            vi.useFakeTimers();
            try {
                let pending: DelayedRequeue<string>[] = [
                    { card: "card-x", dueAt: Date.now() + 50 },
                ];
                const onDue = vi.fn();
                const scheduler = createDelayedRequeueScheduler({
                    onDue,
                    getPending: () => pending,
                    setPending: (p) => { pending = p; },
                });

                scheduler.schedule();
                expect(onDue).not.toHaveBeenCalled();

                vi.advanceTimersByTime(60);
                expect(onDue).toHaveBeenCalledWith(["card-x"]);
                expect(pending.length).toBe(0);

                scheduler.stop();
            } finally {
                vi.useRealTimers();
            }
        });
    });

    describe("markAsRequeueCard", () => {
        it("为卡片打上 lvRequeue=1 属性且不破坏原字段", () => {
            const card = { cardID: "c-1", deckID: "d-1" };
            const requeued = markAsRequeueCard(card);
            expect(requeued).toEqual({ cardID: "c-1", deckID: "d-1", lvRequeue: 1 });
            expect(card).not.toHaveProperty("lvRequeue");
        });
    });

    describe("isRequeueWaiting & calculateRequeueWaitSeconds", () => {
        it("未完成、无当前卡、存在待重现卡且无加载/错误时返回 true", () => {
            expect(isRequeueWaiting(false, false, 2, false, false)).toBe(true);
        });

        it("已完成、有当前卡、待重现卡为 0 或处于加载/错误态时返回 false", () => {
            expect(isRequeueWaiting(true, false, 2, false, false)).toBe(false);
            expect(isRequeueWaiting(false, true, 2, false, false)).toBe(false);
            expect(isRequeueWaiting(false, false, 0, false, false)).toBe(false);
            expect(isRequeueWaiting(false, false, 2, true, false)).toBe(false);
            expect(isRequeueWaiting(false, false, 2, false, true)).toBe(false);
        });

        it("calculateRequeueWaitSeconds 向上取整计算秒数，负数或 null 安全回退到 0", () => {
            expect(calculateRequeueWaitSeconds(1500)).toBe(2);
            expect(calculateRequeueWaitSeconds(1000)).toBe(1);
            expect(calculateRequeueWaitSeconds(0)).toBe(0);
            expect(calculateRequeueWaitSeconds(-500)).toBe(0);
            expect(calculateRequeueWaitSeconds(null)).toBe(0);
        });
    });
});

