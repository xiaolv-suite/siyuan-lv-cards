import { describe, expect, it } from "vitest";
import {
    buildChoiceOptions,
    cleanChoiceText,
    assembleChoiceOptions,
    extractAnswerFromDomHtml,
    shuffleArray,
    recordChoicePick,
    addDistractorToPool,
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

describe("shuffleArray", () => {
    it("保持原数组不变且元素集合一致", () => {
        const arr = [1, 2, 3, 4, 5];
        const shuffled = shuffleArray(arr);
        expect(shuffled).toHaveLength(arr.length);
        expect(shuffled.slice().sort()).toEqual([1, 2, 3, 4, 5]);
        // 不修改原数组
        expect(arr).toEqual([1, 2, 3, 4, 5]);
    });

    it("空数组和单元素数组安全返回", () => {
        expect(shuffleArray([])).toEqual([]);
        expect(shuffleArray([42])).toEqual([42]);
    });
});

describe("recordChoicePick", () => {
    const base = {
        options: ["选项A", "选项B"],
        answerIdx: 0,
        picked: null,
    };

    it("正常记录选项并触发翻面标识", () => {
        const res = recordChoicePick(base, 1);
        expect(res).not.toBeNull();
        expect(res?.nextChoices.picked).toBe(1);
        expect(res?.shouldRevealAnswer).toBe(true);
    });

    it("已作答过的状态不可重复作答", () => {
        const answered = { ...base, picked: 0 };
        expect(recordChoicePick(answered, 1)).toBeNull();
    });

    it("空 choices 状态安全返回 null", () => {
        expect(recordChoicePick(null, 0)).toBeNull();
        expect(recordChoicePick(undefined, 0)).toBeNull();
    });
});

describe("addDistractorToPool", () => {
    it("成功添加有效干扰项并清洗空白", () => {
        const pool: string[] = [];
        expect(addDistractorToPool(pool, "  干扰一  ", "正确答案")).toBe(true);
        expect(pool).toEqual(["干扰一"]);
    });

    it("重复项或与正确答案相同的文本被拒绝", () => {
        const pool = ["干扰一"];
        expect(addDistractorToPool(pool, "干扰一", "正确答案")).toBe(false);
        expect(addDistractorToPool(pool, "正确答案", "正确答案")).toBe(false);
        expect(addDistractorToPool(pool, "", "正确答案")).toBe(false);
        expect(pool).toEqual(["干扰一"]);
    });

    it("池达到上限时拒绝添加", () => {
        const pool = ["A", "B", "C"];
        expect(addDistractorToPool(pool, "D", "Target", 3)).toBe(false);
        expect(pool).toHaveLength(3);
    });
});

