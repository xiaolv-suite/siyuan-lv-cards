import { describe, expect, it } from "vitest";
import {
    mergeSessionPrefs,
    pruneSessionPrefs,
    getInitialSessionVariant,
    resolveSessionVariantOverrides,
    shouldRestartTimeoutOnOverrides,
} from "../src/core/session-prefs";

// BX-3 本场偏好：覆盖合并与最小化语义
describe("session-prefs", () => {
    const base = { ratingStyle: "four", reverseOrder: false, timeoutMode: "off", limit: 20 };

    it("merge：覆盖优先、其余回落全局", () => {
        const eff = mergeSessionPrefs(base, { ratingStyle: "three" });
        expect(eff.ratingStyle).toBe("three");
        expect(eff.reverseOrder).toBe(false);
        expect(eff.limit).toBe(20);
        // 不污染 base
        expect(base.ratingStyle).toBe("four");
    });

    it("merge：空覆盖 = 全局原样", () => {
        expect(mergeSessionPrefs(base, {})).toEqual(base);
    });

    it("prune：与全局同值的覆盖键被摘除", () => {
        expect(pruneSessionPrefs(base, { ratingStyle: "four", timeoutMode: "reveal" })).toEqual({ timeoutMode: "reveal" });
    });

    it("prune：全部同值时清空覆盖集", () => {
        expect(pruneSessionPrefs(base, { ratingStyle: "four", reverseOrder: false })).toEqual({});
    });

    it("prune：类型不同但字面同值也算同值（String 比较）", () => {
        expect(pruneSessionPrefs(base, { limit: 20 as unknown as string })).toEqual({});
        expect(pruneSessionPrefs(base, { limit: "20" as unknown as number })).toEqual({});
    });

    it("prune：布尔翻转保留", () => {
        expect(pruneSessionPrefs(base, { reverseOrder: true })).toEqual({ reverseOrder: true });
    });

    describe("题型弹窗单选与覆盖集合映射", () => {
        it("getInitialSessionVariant：根据配置初始化为对应题型单选", () => {
            expect(getInitialSessionVariant({ typingEnabled: true })).toBe("typing");
            expect(getInitialSessionVariant({ choiceEnabled: true })).toBe("choice");
            expect(getInitialSessionVariant({})).toBe("normal");
        });

        it("resolveSessionVariantOverrides：生成对应的覆盖配置项并关闭混合轮换", () => {
            expect(resolveSessionVariantOverrides("typing")).toEqual({
                typingEnabled: true,
                choiceEnabled: false,
                mixedRotation: false,
            });
            expect(resolveSessionVariantOverrides("choice")).toEqual({
                typingEnabled: false,
                choiceEnabled: true,
                mixedRotation: false,
            });
            expect(resolveSessionVariantOverrides("normal")).toEqual({
                typingEnabled: false,
                choiceEnabled: false,
                mixedRotation: false,
            });
        });
    });

    describe("shouldRestartTimeoutOnOverrides", () => {
        it("包含 timeoutMode 或 timeoutSeconds 时返回 true", () => {
            expect(shouldRestartTimeoutOnOverrides({ timeoutMode: "reveal" })).toBe(true);
            expect(shouldRestartTimeoutOnOverrides({ timeoutSeconds: 30 })).toBe(true);
            expect(shouldRestartTimeoutOnOverrides({ timeoutMode: "forget", typingEnabled: true })).toBe(true);
        });

        it("不包含超时相关键时返回 false", () => {
            expect(shouldRestartTimeoutOnOverrides({ typingEnabled: true })).toBe(false);
            expect(shouldRestartTimeoutOnOverrides({})).toBe(false);
        });
    });
});
