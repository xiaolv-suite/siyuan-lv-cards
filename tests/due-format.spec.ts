import { describe, expect, it } from "vitest";
import { formatRatingDueText, formatNextDueByRating } from "@/core/due-format";

describe("due-format 到期日紧凑格式化器", () => {
    it("正确去除年份前缀与末尾秒数", () => {
        expect(formatRatingDueText("2026-10-31 14:30:00")).toBe("10-31 14:30");
        expect(formatRatingDueText("2026-05-01 09:00:15")).toBe("5-01 09:00");
    });

    it("空值或未定义安全返回空字符串", () => {
        expect(formatRatingDueText("")).toBe("");
        expect(formatRatingDueText(null)).toBe("");
        expect(formatRatingDueText(undefined)).toBe("");
    });

    describe("formatNextDueByRating", () => {
        it("正确提取评级字典中的对应日期并格式化", () => {
            const dues = { "3": "2026-10-31 14:30:00", "1": "2026-10-29 10:00:00" };
            expect(formatNextDueByRating(dues, "3")).toBe("10-31 14:30");
            expect(formatNextDueByRating(dues, "1")).toBe("10-29 10:00");
        });

        it("未定义或不存在的评级返回空串", () => {
            expect(formatNextDueByRating(null, "3")).toBe("");
            expect(formatNextDueByRating({}, "3")).toBe("");
        });
    });
});
