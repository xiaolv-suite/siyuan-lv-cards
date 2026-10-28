import { describe, expect, it } from "vitest";
import {
    buildChoiceOptions,
    cleanChoiceText,
    assembleChoiceOptions,
    extractAnswerFromDomHtml,
} from "@/core/choice-options";

describe("cleanChoiceText", () => {
    it("strips zero-width characters and control codes", () => {
        expect(cleanChoiceText("答案\u200b\u200c\ufeff")).toBe("答案");
        expect(cleanChoiceText("\u200b\u2060")).toBe("");
    });

    it("normalizes non-breaking spaces and collapses whitespace", () => {
        expect(cleanChoiceText("词一\u00a0\u00a0词二")).toBe("词一 词二");
        expect(cleanChoiceText("   多重   空格   ")).toBe("多重 空格");
    });
});

describe("buildChoiceOptions", () => {
    it("uses all available reliable distractors, up to four choices", () => {
        expect(buildChoiceOptions("正确", ["甲", "乙", "丙", "丁"])).toEqual(["正确", "甲", "乙", "丙"]);
    });

    it("degrades to three or two choices when distractors are scarce", () => {
        expect(buildChoiceOptions("正确", ["甲", "甲", "乙"])).toEqual(["正确", "甲", "乙"]);
        expect(buildChoiceOptions("正确", ["甲", "正确", "  "])).toEqual(["正确", "甲"]);
    });

    it("returns null when no reliable distractor exists", () => {
        expect(buildChoiceOptions("正确", [])).toBeNull();
        expect(buildChoiceOptions("正确", ["正确", "  "])).toBeNull();
        expect(buildChoiceOptions("", ["甲"])).toBeNull();
    });

    it("strips invisible characters and prevents duplicate choices caused by zero-width spaces", () => {
        expect(buildChoiceOptions("答案\u200b", ["答案", "干扰一"])).toEqual(["答案", "干扰一"]);
        expect(buildChoiceOptions("正确", ["\u200b", "\u200c\ufeff", "有效干扰"])).toEqual(["正确", "有效干扰"]);
        expect(buildChoiceOptions("正确\ufeff", ["正确\u200b", "\u2060"])).toBeNull();
    });
});

describe("assembleChoiceOptions", () => {
    it("组装选项并精确定位正确答案索引", () => {
        // mock 颠倒顺序的 shuffle
        const reverseShuffle = <T>(arr: T[]): T[] => [...arr].reverse();
        const res = assembleChoiceOptions("答案A", ["干扰B", "干扰C"], reverseShuffle);
        expect(res).not.toBeNull();
        expect(res?.options).toEqual(["干扰C", "干扰B", "答案A"]);
        expect(res?.answerIdx).toBe(2);
        expect(res?.picked).toBeNull();
    });

    it("没有足够干扰项时返回 null", () => {
        expect(assembleChoiceOptions("答案A", [])).toBeNull();
    });
});

describe("extractAnswerFromDomHtml", () => {
    it("优先提取挖空标记内容", () => {
        const html = `<div>这是<span data-type="mark">挖空一</span>和<span data-type="mark">挖空二</span></div>`;
        expect(extractAnswerFromDomHtml(html)).toBe("挖空一 / 挖空二");
    });

    it("无挖空但有问答分隔符提取答案部分", () => {
        const html = `<div>问题内容 :: 问答答案</div>`;
        expect(extractAnswerFromDomHtml(html)).toBe("问答答案");
    });

    it("纯文本卡直接提取完整文本", () => {
        const html = `<p>  纯文本笔记卡片内容  </p>`;
        expect(extractAnswerFromDomHtml(html)).toBe("纯文本笔记卡片内容");
    });

    it("空输入返回空串", () => {
        expect(extractAnswerFromDomHtml("")).toBe("");
    });
});

