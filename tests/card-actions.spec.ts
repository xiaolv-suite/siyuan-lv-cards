import { describe, expect, it } from "vitest";
import {
    clampFontScale,
    toggleCardIssue,
    removeCardFromQueue,
    computeAnswerDuration,
    updateSessionCountersOnRate,
    createEmptySessionCounters,
    evaluateCardTyping,
    formatFontScalePercent,
    shouldInvalidateCardDerivedState,
    createLastAnsweredSnapshot,
    sliceQueueAfterCurrent,
    buildMemoAttributes,
    isCardActionBusy,
    createLiveAnnouncement,
    getNextQueueHead,
    canRateCurrentCard,
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

    describe("evaluateCardTyping", () => {
        it("输入为空或期望为空判定为 isBlank 放弃思考", () => {
            expect(evaluateCardTyping("答案", "").isBlank).toBe(true);
            expect(evaluateCardTyping("", "输入").isBlank).toBe(true);
        });

        it("正常输入给出打分建议与逐字对比", () => {
            const res = evaluateCardTyping("hello", "hello");
            expect(res.isBlank).toBe(false);
            expect(res.typingGrade?.suggested).toBe(3);
            expect(res.typingGrade?.chars.every(c => c.ok)).toBe(true);
        });
    });

    describe("formatFontScalePercent", () => {
        it("正确格式化字号百分比字符串", () => {
            expect(formatFontScalePercent(1.0)).toBe("100%");
            expect(formatFontScalePercent(1.2)).toBe("120%");
            expect(formatFontScalePercent(0.85)).toBe("85%");
            expect(formatFontScalePercent(NaN)).toBe("100%");
        });
    });

    describe("shouldInvalidateCardDerivedState", () => {
        it("旧 HTML 存在且与新 HTML 不一致时判定需要废弃衍生状态", () => {
            expect(shouldInvalidateCardDerivedState("<p>旧题面</p>", "<p>新题面</p>")).toBe(true);
        });

        it("初次加载（无旧 HTML）或题面未变更时不废弃", () => {
            expect(shouldInvalidateCardDerivedState("", "<p>新题面</p>")).toBe(false);
            expect(shouldInvalidateCardDerivedState("<p>同一题面</p>", "<p>同一题面</p>")).toBe(false);
        });
    });

    describe("createLastAnsweredSnapshot & sliceQueueAfterCurrent", () => {
        it("createLastAnsweredSnapshot 正常生成回看快照，无卡片时返回 null", () => {
            const snap = createLastAnsweredSnapshot({ cardID: "c1" }, "<p>题面</p>", true);
            expect(snap).toEqual({
                card: { cardID: "c1" },
                html: "<p>题面</p>",
                revealed: true,
            });

            expect(createLastAnsweredSnapshot(null, "html", true)).toBeNull();
            expect(createLastAnsweredSnapshot(undefined, "html", false)).toBeNull();
        });

        it("sliceQueueAfterCurrent 截取当前卡片后续队列，未命中时安全返回全量队列浅拷贝", () => {
            const queue = [{ cardID: "c1" }, { cardID: "c2" }, { cardID: "c3" }];
            expect(sliceQueueAfterCurrent(queue, "c1").map(c => c.cardID)).toEqual(["c2", "c3"]);
            expect(sliceQueueAfterCurrent(queue, "c2").map(c => c.cardID)).toEqual(["c3"]);
            expect(sliceQueueAfterCurrent(queue, "c3")).toEqual([]);
            expect(sliceQueueAfterCurrent(queue, "not-found").map(c => c.cardID)).toEqual(["c1", "c2", "c3"]);
            expect(sliceQueueAfterCurrent(queue, undefined).map(c => c.cardID)).toEqual(["c1", "c2", "c3"]);
        });
    });

    describe("buildMemoAttributes", () => {
        it("正确去除首尾空白并包装为 memo 属性对象", () => {
            expect(buildMemoAttributes("  助记重点提示  ")).toEqual({ memo: "助记重点提示" });
            expect(buildMemoAttributes("")).toEqual({ memo: "" });
            expect(buildMemoAttributes(null as any)).toEqual({ memo: "" });
        });
    });

    describe("isCardActionBusy", () => {
        it("任意操作处于忙碌时返回 true", () => {
            expect(isCardActionBusy(true, false, false)).toBe(true);
            expect(isCardActionBusy(false, true, false)).toBe(true);
            expect(isCardActionBusy(false, false, true)).toBe(true);
        });

        it("所有操作均空闲时返回 false", () => {
            expect(isCardActionBusy(false, false, false)).toBe(false);
            expect(isCardActionBusy(false, false)).toBe(false);
        });
    });

    describe("createLiveAnnouncement", () => {
        it("构造带有播报级别与文本的载荷对象", () => {
            expect(createLiveAnnouncement("提示内容", "polite")).toEqual({ msg: "提示内容", tone: "polite" });
            expect(createLiveAnnouncement("错误发生", "assertive")).toEqual({ msg: "错误发生", tone: "assertive" });
            expect(createLiveAnnouncement("默认等级")).toEqual({ msg: "默认等级", tone: "polite" });
        });
    });

    describe("getNextQueueHead", () => {
        it("非空队列返回第一张卡片，空队列返回 null", () => {
            expect(getNextQueueHead(["c1", "c2"])).toBe("c1");
            expect(getNextQueueHead([])).toBeNull();
        });
    });

    describe("canRateCurrentCard", () => {
        it("已亮出答案或强制评分时允许评分", () => {
            expect(canRateCurrentCard(true, false, true, false, false)).toBe(true);
            expect(canRateCurrentCard(true, false, false, true, false)).toBe(true);
        });

        it("无当前卡片、会话暂停、操作忙碌或问题态未强制时不允许评分", () => {
            expect(canRateCurrentCard(false, false, true, false, false)).toBe(false);
            expect(canRateCurrentCard(true, true, true, false, false)).toBe(false);
            expect(canRateCurrentCard(true, false, true, false, true)).toBe(false);
            expect(canRateCurrentCard(true, false, false, false, false)).toBe(false);
        });
    });
});
