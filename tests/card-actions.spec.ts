import { describe, expect, it } from "vitest";
import {
    clampFontScale,
    toggleCardIssue,
    removeCardFromQueue,
    computeAnswerDuration,
    updateSessionCountersOnRate,
    createEmptySessionCounters,
} from "@/core/card-actions";

describe("card-actions 卡片交互与视图调整纯函数", () => {
    describe("clampFontScale", () => {
        it("按 0.1 步进平滑增减字号", () => {
            expect(clampFontScale(1.0, 0.1)).toBe(1.1);
            expect(clampFontScale(1.2, -0.1)).toBe(1.1);
        });

        it("上界封顶在 2.5，下界兜底在 0.7", () => {
            expect(clampFontScale(2.5, 0.2)).toBe(2.5);
            expect(clampFontScale(0.7, -0.3)).toBe(0.7);
        });
    });

    describe("toggleCardIssue", () => {
        it("标记与取消标记格式问题卡片，集合不可变", () => {
            const initial = new Set(["card-a"]);

            // 添加
            const res1 = toggleCardIssue(initial, "card-b");
            expect(res1.isMarked).toBe(true);
            expect(res1.nextMarkedIDs.has("card-b")).toBe(true);
            expect(initial.has("card-b")).toBe(false); // 原集合不被修改

            // 移除
            const res2 = toggleCardIssue(res1.nextMarkedIDs, "card-a");
            expect(res2.isMarked).toBe(false);
            expect(res2.nextMarkedIDs.has("card-a")).toBe(false);
        });
    });

    describe("removeCardFromQueue", () => {
        it("根据 cardID 准确从出题队列移除", () => {
            const queue = [{ cardID: "c1" }, { cardID: "c2" }, { cardID: "c3" }];
            expect(removeCardFromQueue(queue, "c2").map(c => c.cardID)).toEqual(["c1", "c3"]);
            expect(removeCardFromQueue(queue, "not-exist").map(c => c.cardID)).toEqual(["c1", "c2", "c3"]);
        });
    });

    describe("computeAnswerDuration", () => {
        const start = 1000000;
        it("计算正常作答秒数", () => {
            expect(computeAnswerDuration(start, 60, start + 12000)).toBe(12);
        });

        it("超过 capSec 封顶防离席", () => {
            expect(computeAnswerDuration(start, 30, start + 120000)).toBe(30);
        });

        it("未提供呈现时间戳返回 undefined", () => {
            expect(computeAnswerDuration(0, 60, start)).toBeUndefined();
            expect(computeAnswerDuration(-10, 60, start)).toBeUndefined();
        });
    });

    describe("updateSessionCountersOnRate & createEmptySessionCounters", () => {
        it("正确累加遗忘、新卡与复习计数", () => {
            const initial = createEmptySessionCounters();
            expect(initial).toEqual({ new: 0, review: 0, forget: 0, skip: 0 });

            // 遗忘
            const c1 = updateSessionCountersOnRate(initial, 1, false);
            expect(c1.forget).toBe(1);

            // 新学
            const c2 = updateSessionCountersOnRate(c1, 3, true);
            expect(c2.new).toBe(1);
            expect(c2.forget).toBe(1);

            // 复习
            const c3 = updateSessionCountersOnRate(c2, 4, false);
            expect(c3.review).toBe(1);
            expect(c3.new).toBe(1);
            expect(c3.forget).toBe(1);
        });
    });
});
