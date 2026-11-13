import { describe, expect, it } from "vitest";
import { computeKeyboardViewportState } from "@/core/viewport-keyboard";

describe("viewport-keyboard 软键盘避让计算器", () => {
    it("高度差超过阈值时判定键盘开启并返回避让距离", () => {
        const state = computeKeyboardViewportState(800, 500, 120);
        expect(state.isKeyboardOpen).toBe(true);
        expect(state.keyboardInset).toBe(300);
    });

    it("高度差未达阈值时判定键盘关闭且避让为0", () => {
        const state = computeKeyboardViewportState(800, 750, 120);
        expect(state.isKeyboardOpen).toBe(false);
        expect(state.keyboardInset).toBe(0);
    });

    it("视口高度等于或大于窗口高度时安全返回关闭状态", () => {
        const state = computeKeyboardViewportState(800, 800, 120);
        expect(state.isKeyboardOpen).toBe(false);
        expect(state.keyboardInset).toBe(0);
    });
});
