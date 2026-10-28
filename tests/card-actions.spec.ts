import { describe, expect, it } from "vitest";
import { clampFontScale, toggleCardIssue } from "@/core/card-actions";

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
});
