import { describe, expect, it } from "vitest";
import {
    formatSessionDuration,
    isEmptyQueueSession,
    formatTargetProgress,
    formatStreakMilestone,
    getDailyScienceTip,
    MILESTONE_STREAK_DAYS,
} from "@/core/completion-metrics";

describe("completion-metrics 会话完成态指标与叙事计算", () => {
    describe("formatSessionDuration", () => {
        it("正确格式化会话时长为分秒形式", () => {
            const start = 1000000;
            expect(formatSessionDuration(start, start + 45000)).toBe("0:45");
            expect(formatSessionDuration(start, start + 125000)).toBe("2:05");
            expect(formatSessionDuration(start, start + 3600000)).toBe("60:00");
        });

        it("处理时间倒退或异常时返回 0:00", () => {
            expect(formatSessionDuration(5000, 2000)).toBe("0:00");
        });
    });

    describe("isEmptyQueueSession", () => {
        it("全部为0且sessionDone时判定为空队列", () => {
            expect(isEmptyQueueSession(true, { new: 0, review: 0, forget: 0, skip: 0 })).toBe(true);
        });

        it("只要有作答或跳过就不算空队列", () => {
            expect(isEmptyQueueSession(true, { new: 1, review: 0, forget: 0, skip: 0 })).toBe(false);
            expect(isEmptyQueueSession(true, { new: 0, review: 1, forget: 0, skip: 0 })).toBe(false);
            expect(isEmptyQueueSession(true, { new: 0, review: 0, forget: 1, skip: 0 })).toBe(false);
            expect(isEmptyQueueSession(true, { new: 0, review: 0, forget: 0, skip: 1 })).toBe(false);
            expect(isEmptyQueueSession(false, { new: 0, review: 0, forget: 0, skip: 0 })).toBe(false);
        });
    });

    describe("formatTargetProgress", () => {
        it("正常格式化目标进度字符串", () => {
            expect(formatTargetProgress(15, 20, "已完成 ${a} / 目标 ${b}")).toBe("已完成 15 / 目标 20");
        });

        it("无目标或模板为空返回空字符串", () => {
            expect(formatTargetProgress(15, 0, "已完成 ${a} / 目标 ${b}")).toBe("");
            expect(formatTargetProgress(15, 20, "")).toBe("");
        });
    });

    describe("formatStreakMilestone", () => {
        it("仅在专属里程碑天数时触发庆祝文案", () => {
            for (const days of MILESTONE_STREAK_DAYS) {
                expect(formatStreakMilestone(days, "达成 ${n} 天连击！")).toBe(`达成 ${days} 天连击！`);
            }
            expect(formatStreakMilestone(15, "达成 ${n} 天连击！")).toBe("");
            expect(formatStreakMilestone(0, "达成 ${n} 天连击！")).toBe("");
        });
    });

    describe("getDailyScienceTip", () => {
        const tips = ["贴士一", "贴士二", "贴士三", "贴士四", "贴士五"];

        it("根据日期轮换贴士内容", () => {
            const day0 = 0;
            const day1 = 86400000;
            expect(getDailyScienceTip(tips, true, day0)).toBe("贴士一");
            expect(getDailyScienceTip(tips, true, day1)).toBe("贴士二");
        });

        it("未启用或空贴士返回空字符串", () => {
            expect(getDailyScienceTip(tips, false, 0)).toBe("");
            expect(getDailyScienceTip([], true, 0)).toBe("");
        });
    });
});
