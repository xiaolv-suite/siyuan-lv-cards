import { describe, expect, it } from "vitest";
import {
    parseDueStringToDate,
    formatRescheduleTimestamp,
    computeReschedulePreview,
    calculateTargetDueTimestamp,
    buildRescheduleRequest,
} from "@/core/reschedule-preview";

describe("reschedule-preview 改期时间计算与预览格式化", () => {
    describe("parseDueStringToDate", () => {
        it("正确解析 14 位思源日期时间戳", () => {
            const date = parseDueStringToDate("20261029143045");
            expect(date).not.toBeNull();
            expect(date?.getFullYear()).toBe(2026);
            expect(date?.getMonth()).toBe(9); // 0-indexed, 9 = October
            expect(date?.getDate()).toBe(29);
            expect(date?.getHours()).toBe(14);
            expect(date?.getMinutes()).toBe(30);
            expect(date?.getSeconds()).toBe(45);
        });

        it("长度不足或非法格式返回 null", () => {
            expect(parseDueStringToDate("")).toBeNull();
            expect(parseDueStringToDate("202610")).toBeNull();
            expect(parseDueStringToDate("invalid")).toBeNull();
        });
    });

    describe("formatRescheduleTimestamp", () => {
        it("格式化合法日期为本地化时间字符串", () => {
            const date = new Date(2026, 9, 29, 14, 30);
            const str = formatRescheduleTimestamp(date, "zh-CN");
            expect(str).toBeTruthy();
            expect(str).toContain("29");
            expect(str).toContain("14:30");
        });

        it("无效日期返回空字符串", () => {
            expect(formatRescheduleTimestamp(new Date(NaN))).toBe("");
        });
    });

    describe("computeReschedulePreview", () => {
        const mockNow = new Date("2026-10-28T10:00:00Z").getTime();

        it("优先采用重试目标日期作为预览", () => {
            const preview = computeReschedulePreview(1, "20261031180000", "zh-CN", mockNow);
            expect(preview).toContain("31");
            expect(preview).toContain("18:00");
        });

        it("根据天数推算未来目标时间预览", () => {
            const preview = computeReschedulePreview(3, null, "zh-CN", mockNow);
            expect(preview).toBeTruthy();
            expect(preview).toContain("31");
        });

        it("非法天数返回空字符串", () => {
            expect(computeReschedulePreview(0, null, "zh-CN", mockNow)).toBe("");
            expect(computeReschedulePreview(-5, null, "zh-CN", mockNow)).toBe("");
            expect(computeReschedulePreview(36501, null, "zh-CN", mockNow)).toBe("");
            expect(computeReschedulePreview(1.5, null, "zh-CN", mockNow)).toBe("");
        });
    });

    describe("calculateTargetDueTimestamp", () => {
        const mockNow = new Date("2026-10-28T10:00:00Z").getTime();

        it("retryDue 存在时优先复用该时间戳", () => {
            expect(calculateTargetDueTimestamp(1, "20261031180000", mockNow)).toBe("20261031180000");
        });

        it("无 retryDue 时根据天数计算 14 位格式字符串", () => {
            const due = calculateTargetDueTimestamp(1, null, mockNow);
            expect(due.length).toBe(14);
            expect(due.startsWith("20261029")).toBe(true);
        });
    });

    describe("buildRescheduleRequest", () => {
        const mockNow = new Date("2026-10-28T10:00:00Z").getTime();

        it("合法输入生成包含 cardID、days 和 14 位 due 的请求对象", () => {
            const req = buildRescheduleRequest("card-1", 2, null, mockNow);
            expect(req).not.toBeNull();
            expect(req?.cardID).toBe("card-1");
            expect(req?.days).toBe(2);
            expect(req?.due.length).toBe(14);
            expect(req?.due.startsWith("20261030")).toBe(true);
        });

        it("卡片 ID 与天数匹配时复用 retryRequest", () => {
            const prev = { cardID: "card-1", days: 2, due: "20261030100000" };
            const req = buildRescheduleRequest("card-1", 2, prev, mockNow);
            expect(req).toBe(prev);
        });

        it("卡片 ID 或天数变动时不复用并重新生成", () => {
            const prev = { cardID: "card-1", days: 2, due: "20261030100000" };
            const req = buildRescheduleRequest("card-1", 3, prev, mockNow);
            expect(req).not.toBe(prev);
            expect(req?.days).toBe(3);
        });

        it("非法卡片 ID 或非法天数返回 null", () => {
            expect(buildRescheduleRequest(undefined, 2)).toBeNull();
            expect(buildRescheduleRequest("card-1", 0)).toBeNull();
            expect(buildRescheduleRequest("card-1", -1)).toBeNull();
            expect(buildRescheduleRequest("card-1", 1.5)).toBeNull();
        });
    });
});
