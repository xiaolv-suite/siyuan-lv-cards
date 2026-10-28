import { describe, expect, it } from "vitest";
import { formatRatingDueText } from "@/core/due-format";

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
});
