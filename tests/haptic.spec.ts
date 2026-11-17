import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { triggerHaptic, getRatingHapticPattern } from "../src/core/haptic";

describe("haptic feedback (Web Vibration API)", () => {
    const originalNavigator = globalThis.navigator;

    afterEach(() => {
        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: originalNavigator,
        });
    });

    it("triggers default 12ms pulse when navigator.vibrate is available", () => {
        const vibrate = vi.fn().mockReturnValue(true);
        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: { vibrate },
        });

        const res = triggerHaptic();
        expect(res).toBe(true);
        expect(vibrate).toHaveBeenCalledWith(12);
    });

    it("passes complex vibration waveform array (e.g. [15, 30, 15])", () => {
        const vibrate = vi.fn().mockReturnValue(true);
        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: { vibrate },
        });

        const res = triggerHaptic([15, 30, 15]);
        expect(res).toBe(true);
        expect(vibrate).toHaveBeenCalledWith([15, 30, 15]);
    });

    it("returns false and skips execution when disabled in options", () => {
        const vibrate = vi.fn();
        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: { vibrate },
        });

        const res = triggerHaptic(12, { enabled: false });
        expect(res).toBe(false);
        expect(vibrate).not.toHaveBeenCalled();
    });

    it("defensively catches navigator.vibrate errors without throwing", () => {
        const vibrate = vi.fn().mockImplementation(() => {
            throw new Error("SecurityError: vibrate blocked by permission policy");
        });
        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: { vibrate },
        });

        expect(() => triggerHaptic(12)).not.toThrow();
        expect(triggerHaptic(12)).toBe(false);
    });

    it("returns false safely when navigator.vibrate is not supported", () => {
        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: {},
        });

        expect(triggerHaptic()).toBe(false);
    });

    describe("getRatingHapticPattern", () => {
        it("评级 1（遗忘）返回三次确认双击波形", () => {
            expect(getRatingHapticPattern(1)).toEqual([15, 30, 15]);
        });

        it("其他评级（2, 3, 4）返回普通 12ms 微震", () => {
            expect(getRatingHapticPattern(2)).toBe(12);
            expect(getRatingHapticPattern(3)).toBe(12);
            expect(getRatingHapticPattern(4)).toBe(12);
        });
    });
});
