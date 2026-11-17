import { describe, expect, it } from "vitest";
import { BLOCK_ACTIONS } from "../src/core/block-actions";

describe("设置面板块动作偏好与场景预设测试", () => {
    it("预设场景算法能够准确裁剪动作并注入置顶星标", () => {
        const allIds = BLOCK_ACTIONS.map((a) => a.id);

        // 1. 备考模式
        const examKeep = new Set(["edit-card-qa", "make-cloze", "make-occlusion", "add-to-deck", "remove-from-deck", "to-exam-question", "exam-ai-generate", "bind-checkin-item", "copy-block-ref"]);
        const examDisabled = allIds.filter((id) => !examKeep.has(id));
        expect(examDisabled).toContain("focus-block");
        expect(examDisabled).toContain("copy-embed-ref");
        expect(examDisabled).not.toContain("edit-card-qa");
        expect(examDisabled).not.toContain("to-exam-question");

        // 2. 写作专注模式
        const writingKeep = new Set(["focus-block", "copy-embed-ref", "toggle-fold-block", "morph-block-type", "copy-block-ref", "copy-plain-text", "capture-quote-common", "to-glean-library"]);
        const writingDisabled = allIds.filter((id) => !writingKeep.has(id));
        expect(writingDisabled).toContain("edit-card-qa");
        expect(writingDisabled).not.toContain("focus-block");
        expect(writingDisabled).not.toContain("copy-embed-ref");

        // 3. 极简模式
        const minimalKeep = new Set(["edit-card-qa", "focus-block", "copy-block-ref", "copy-embed-ref"]);
        const minimalDisabled = allIds.filter((id) => !minimalKeep.has(id));
        expect(minimalDisabled.length).toBeGreaterThan(allIds.length - 6);
        expect(minimalDisabled).not.toContain("edit-card-qa");
        expect(minimalDisabled).not.toContain("focus-block");
    });
});
