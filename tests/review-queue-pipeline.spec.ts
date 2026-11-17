import { describe, expect, it } from "vitest";
import {
    applyQueuePipeline,
    calculateReviewAccuracy,
    toggleCardStar,
    formatStarToggleFeedback,
    combineExcludedCardIDs,
    filterActiveSessionCards,
    mergeQualityExcludedCardIDs,
    type QueuePipelineCard,
} from "@/core/review-queue-pipeline";

describe("review-queue-pipeline 复习队列处理与排序管道", () => {
    const mockCards: QueuePipelineCard[] = [
        { cardID: "c-1", state: 0, lapses: 0, blockID: "b-1" },
        { cardID: "c-2", state: 1, lapses: 3, blockID: "b-2" },
        { cardID: "c-3", state: 0, lapses: 1, blockID: "b-1" }, // sibling of c-1
        { cardID: "c-4", state: 2, lapses: 5, blockID: "b-3" },
    ];

    describe("applyQueuePipeline", () => {
        it("scopeKey 为 new 时仅保留新卡", () => {
            const res = applyQueuePipeline(mockCards, { scopeKey: "new" });
            expect(res.map(c => c.cardID)).toEqual(["c-1", "c-3"]);
        });

        it("scopeKey 为 old 时仅保留复习卡", () => {
            const res = applyQueuePipeline(mockCards, { scopeKey: "old" });
            expect(res.map(c => c.cardID)).toEqual(["c-2", "c-4"]);
        });

        it("batchLimit 截断卡片上限", () => {
            const res = applyQueuePipeline(mockCards, { scopeKey: "all", batchLimit: 2 });
            expect(res.length).toBe(2);
            expect(res.map(c => c.cardID)).toEqual(["c-1", "c-2"]);
        });

        it("burySiblings 在非冲刺模式下推迟同源兄弟卡", () => {
            const res = applyQueuePipeline(mockCards, { scopeKey: "all", burySiblings: true });
            // c-1 与 c-3 同属于 b-1，同块只保留先出的一张
            expect(res.map(c => c.cardID)).toEqual(["c-1", "c-2", "c-4"]);
        });

        it("cramActive 冲刺模式按 lapses 降序优先排卡，且忽略 burySiblings", () => {
            const res = applyQueuePipeline(mockCards, { scopeKey: "all", cramActive: true, burySiblings: true });
            expect(res.map(c => c.cardID)).toEqual(["c-4", "c-2", "c-3", "c-1"]);
        });

        it("cramActive 配合 batchLimit 时排序先于截断，确保批次内是全库最难卡", () => {
            const res = applyQueuePipeline(mockCards, { scopeKey: "all", cramActive: true, batchLimit: 2 });
            expect(res.map(c => c.cardID)).toEqual(["c-4", "c-2"]);
        });

        it("reverseOrder 倒序模式反转队列", () => {
            const res = applyQueuePipeline(mockCards, { scopeKey: "all", reverseOrder: true });
            expect(res.map(c => c.cardID)).toEqual(["c-4", "c-3", "c-2", "c-1"]);
        });

        it("randomOrder 调用指定洗牌函数", () => {
            const reverseShuffle = <T>(arr: T[]): T[] => [...arr].reverse();
            const res = applyQueuePipeline(mockCards, { scopeKey: "all", randomOrder: true, shuffleFn: reverseShuffle });
            expect(res.map(c => c.cardID)).toEqual(["c-4", "c-3", "c-2", "c-1"]);
        });

        it("按用户设置的阈值标记水蛭卡（此前写死 5，与设置页默认 8 不一致）", () => {
            const res = applyQueuePipeline(mockCards, { scopeKey: "all", leechThreshold: 5 });
            const c4 = res.find(c => c.cardID === "c-4");
            const c2 = res.find(c => c.cardID === "c-2");
            expect(c4?.isLeech).toBe(true);
            expect(c2?.isLeech).toBe(false);
        });

        it("未启用 burySiblings 时默认自动错峰排列同源兄弟卡", () => {
            const raw: QueuePipelineCard[] = [
                { cardID: "c-1", state: 1, lapses: 0, blockID: "b-1" },
                { cardID: "c-2", state: 1, lapses: 0, blockID: "b-1" },
                { cardID: "c-3", state: 1, lapses: 0, blockID: "b-2" },
            ];
            const res = applyQueuePipeline(raw, { scopeKey: "all", burySiblings: false });
            // c-1 和 c-2 不会连续出现，c-3 插入中间
            expect(res.map(c => c.cardID)).toEqual(["c-1", "c-3", "c-2"]);
        });
    });

    describe("calculateReviewAccuracy", () => {
        it("优先依据交互题型正确数统计命中率", () => {
            const acc = calculateReviewAccuracy({
                newCount: 2,
                reviewCount: 3,
                forgetCount: 1,
                quizTotal: 10,
                quizCorrect: 8,
            });
            expect(acc).toBe(80);
        });

        it("无交互题型时按新学+复习 vs 总作答数统计命中率", () => {
            const acc = calculateReviewAccuracy({
                newCount: 4,
                reviewCount: 4,
                forgetCount: 2,
                quizTotal: 0,
                quizCorrect: 0,
            });
            expect(acc).toBe(80); // (4+4)/(4+4+2) = 80%

            const allForget = calculateReviewAccuracy({
                newCount: 0,
                reviewCount: 0,
                forgetCount: 10,
                quizTotal: 0,
                quizCorrect: 0,
            });
            expect(allForget).toBe(0); // 0/10 = 0%
        });

        it("无任何作答返回 100", () => {
            const acc = calculateReviewAccuracy({
                newCount: 0,
                reviewCount: 0,
                forgetCount: 0,
                quizTotal: 0,
                quizCorrect: 0,
            });
            expect(acc).toBe(100);
        });
    });

    describe("toggleCardStar", () => {
        it("加入星标与移除星标的集合不可变切换", () => {
            const initial = new Set(["c-1", "c-2"]);

            // 移除 c-2
            const r1 = toggleCardStar(initial, "c-2");
            expect(r1.isStarred).toBe(false);
            expect(r1.nextStarredIDs.has("c-2")).toBe(false);
            expect(r1.nextStarredIDs.size).toBe(1);
            expect(initial.size).toBe(2); // 原 Set 不被修改

            // 添加 c-3
            const r2 = toggleCardStar(r1.nextStarredIDs, "c-3");
            expect(r2.isStarred).toBe(true);
            expect(r2.nextStarredIDs.has("c-3")).toBe(true);
            expect(r2.nextStarredIDs.size).toBe(2);
        });
    });

    describe("formatStarToggleFeedback", () => {
        it("加入星标提示较长且携带触感震动模式", () => {
            const fb = formatStarToggleFeedback(true);
            expect(fb.message).toBe("已加入重点星标卡片");
            expect(fb.toastDuration).toBe(1800);
            expect(fb.hapticPattern).toBe(15);
        });

        it("取消星标提示简短且无震动", () => {
            const fb = formatStarToggleFeedback(false);
            expect(fb.message).toBe("已取消星标");
            expect(fb.toastDuration).toBe(1500);
            expect(fb.hapticPattern).toBeUndefined();
        });
    });

    describe("combineExcludedCardIDs & filterActiveSessionCards & mergeQualityExcludedCardIDs", () => {
        it("combineExcludedCardIDs 合并并去重排除卡片 ID", () => {
            const res = combineExcludedCardIDs(["c1", "c2"], ["c2", "c3"]);
            expect(res).toEqual(["c1", "c2", "c3"]);
        });

        it("filterActiveSessionCards 过滤已跳过和今日不学的卡片（支持 cardID 与 blockID 判定）", () => {
            const cards = [
                { cardID: "c1", blockID: "b1" },
                { cardID: "c2", blockID: "b2" },
                { cardID: "c3", blockID: "b3" },
                { cardID: "c4", blockID: "b4" },
            ];
            // c1 命中了 cardID 挂起，b2 命中了 blockID 挂起，c3 命中了跳过
            const res = filterActiveSessionCards(cards, id => id === "c1" || id === "b2", ["c3"]);
            expect(res).toEqual([{ cardID: "c4", blockID: "b4" }]);
        });

        it("mergeQualityExcludedCardIDs 正确提取并合并有效 invalid 卡片 ID", () => {
            const res = mergeQualityExcludedCardIDs(["q1"], [{ cardID: "q2" }, { cardID: undefined }, { cardID: "q1" }]);
            expect(res).toEqual(["q1", "q2"]);
        });
    });
});
