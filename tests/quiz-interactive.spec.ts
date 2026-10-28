import { describe, expect, it } from "vitest";
import {
    extractChoiceOptionsFromText,
    parseInteractiveQuiz,
    parseJudgeAnswer,
    cleanChoiceHtml,
    checkIsAnswer,
    toggleChoiceSelection,
    updateQuizScoreCounters,
    evaluateChoiceQuiz,
    evaluateJudgeQuiz,
    evaluateFillQuiz,
    createInitialEphemeralQuizState,
} from "../src/core/quiz-interactive";

describe("quiz-interactive core parser", () => {
    it("extracts choice options from multiline list items", () => {
        const text = `
【单选示例】上月销量为 80 件，本月为 100 件，环比增长率是多少？
* A. 20%
* B. 25%
* C. 80%
* D. 125%
        `;
        const opts = extractChoiceOptionsFromText(text, "B");
        expect(opts).toHaveLength(4);
        expect(opts[0]).toEqual({ key: "A", text: "20%", isAnswer: false });
        expect(opts[1]).toEqual({ key: "B", text: "25%", isAnswer: true });
        expect(opts[2]).toEqual({ key: "C", text: "80%", isAnswer: false });
        expect(opts[3]).toEqual({ key: "D", text: "125%", isAnswer: false });
    });

    it("extracts choice options with Unicode bullet • prefix", () => {
        const text = `
【单选示例】上月销量为 80 件，本月为 100 件，环比增长率是多少？
• A. 20%
• B. 25%
• C. 80%
        `;
        const opts = extractChoiceOptionsFromText(text, "B");
        expect(opts).toHaveLength(3);
        expect(opts[0]).toEqual({ key: "A", text: "20%", isAnswer: false });
        expect(opts[1]).toEqual({ key: "B", text: "25%", isAnswer: true });
        expect(opts[2]).toEqual({ key: "C", text: "80%", isAnswer: false });
    });

    it("extracts choice options from SiYuan native HTML block DOM", () => {
        const dom = `
<div data-node-id="20261022-test" data-type="NodeSuperBlock">
    <div class="p" data-type="NodeParagraph">【单选示例】上月销量为 80 件，本月为 100 件，环比增长率是多少？</div>
    <div data-type="NodeList" class="list" data-subtype="u">
        <div data-type="NodeListItem" class="li"><div class="protyle-action"><svg></svg></div><div class="p" data-type="NodeParagraph">A. 20%</div></div>
        <div data-type="NodeListItem" class="li"><div class="protyle-action"><svg></svg></div><div class="p" data-type="NodeParagraph">B. 25%</div></div>
        <div data-type="NodeListItem" class="li"><div class="protyle-action"><svg></svg></div><div class="p" data-type="NodeParagraph">C. 80%</div></div>
        <div data-type="NodeListItem" class="li"><div class="protyle-action"><svg></svg></div><div class="p" data-type="NodeParagraph">D. 125%</div></div>
    </div>
</div>
        `;
        const opts = extractChoiceOptionsFromText(dom, "B");
        expect(opts).toHaveLength(4);
        expect(opts[0]).toEqual({ key: "A", text: "20%", isAnswer: false });
        expect(opts[1]).toEqual({ key: "B", text: "25%", isAnswer: true });
        expect(opts[2]).toEqual({ key: "C", text: "80%", isAnswer: false });
        expect(opts[3]).toEqual({ key: "D", text: "125%", isAnswer: false });
    });

    it("extracts inline options from a single line", () => {
        const text = "这是一道单选题 A. 选项一 B. 选项二 C. 选项三 D. 选项四";
        const opts = extractChoiceOptionsFromText(text, "C");
        expect(opts).toHaveLength(4);
        expect(opts[2]).toEqual({ key: "C", text: "选项三", isAnswer: true });
    });

    it("parses judge answer strings accurately", () => {
        expect(parseJudgeAnswer("T")).toBe(true);
        expect(parseJudgeAnswer("True")).toBe(true);
        expect(parseJudgeAnswer("对")).toBe(true);
        expect(parseJudgeAnswer("正确")).toBe(true);
        expect(parseJudgeAnswer("√")).toBe(true);

        expect(parseJudgeAnswer("F")).toBe(false);
        expect(parseJudgeAnswer("False")).toBe(false);
        expect(parseJudgeAnswer("错")).toBe(false);
        expect(parseJudgeAnswer("错误")).toBe(false);
        expect(parseJudgeAnswer("×")).toBe(false);

        expect(parseJudgeAnswer("")).toBeNull();
        expect(parseJudgeAnswer("也许")).toBeNull();
    });

    it("parses full quiz data for a single-choice question with custom-exam attrs", () => {
        const res = parseInteractiveQuiz({
            markdown: `【单选示例】测试题干\n- A. 选项A\n- B. 选项B\n- C. 选项C\n- D. 选项D`,
            attrs: {
                "custom-exam-type": "single",
                "custom-exam-answer": "B",
                "custom-exam-analysis": "解析说明",
            },
        });

        expect(res.kind).toBe("choice");
        expect(res.isMultiple).toBe(false);
        expect(res.options).toHaveLength(4);
        expect(res.options.find(o => o.key === "B")?.isAnswer).toBe(true);
        expect(res.analysis).toBe("解析说明");
        expect(res.hasInteractiveWidgets).toBe(true);
        expect(res.stem).toBe("【单选示例】测试题干");
    });

    it("cleanly extracts question stem by stripping options with Unicode bullet • prefix", () => {
        const res = parseInteractiveQuiz({
            markdown: `【单选示例】上月销量为 80 件，本月为 100 件，环比增长率是多少？\n• A. 20%\n• B. 25%\n• C. 80%`,
            expectedText: "B",
        });

        expect(res.kind).toBe("choice");
        expect(res.options).toHaveLength(3);
        expect(res.stem).toBe("【单选示例】上月销量为 80 件，本月为 100 件，环比增长率是多少？");
    });

    it("parses full quiz data for a judgment question", () => {
        const res = parseInteractiveQuiz({
            markdown: `【判断示例】地球是太阳系的行星之一。`,
            attrs: {
                "custom-exam-type": "judge",
                "custom-exam-answer": "T",
            },
        });

        expect(res.kind).toBe("judge");
        expect(res.judgeAnswer).toBe(true);
        expect(res.hasInteractiveWidgets).toBe(true);
    });

    it("parses fill-in-the-blank question with underscores", () => {
        const res = parseInteractiveQuiz({
            markdown: `增长率=(本期值－基期值)÷_____。`,
            expectedText: "基期值",
        });

        expect(res.kind).toBe("fill");
        expect(res.fillExpected).toBe("基期值");
        expect(res.hasInteractiveWidgets).toBe(true);
    });

    it("cleanChoiceHtml removes lists and option paragraphs from rendered HTML", () => {
        const dom = `
<div data-node-id="test-1" data-type="NodeSuperBlock">
    <div class="p" data-type="NodeParagraph">【单选题】测试题干内容</div>
    <div class="p" data-type="NodeParagraph">• A. 选项A</div>
    <div class="p" data-type="NodeParagraph">• B. 选项B</div>
    <div data-type="NodeList" class="list"><div class="li">C. 选项C</div></div>
</div>
        `;
        const options = [
            { key: "A", text: "选项A", isAnswer: false },
            { key: "B", text: "选项B", isAnswer: true },
        ];
        const cleaned = cleanChoiceHtml(dom, options);
        expect(cleaned).toContain("【单选题】测试题干内容");
        expect(cleaned).not.toContain("• A. 选项A");
        expect(cleaned).not.toContain("• B. 选项B");
        expect(cleaned).not.toContain("NodeList");
    });

    it("checkIsAnswer matches answer keys in various realistic formats", () => {
        expect(checkIsAnswer("B", "北京", "B")).toBe(true);
        expect(checkIsAnswer("B", "北京", "B. 北京")).toBe(true);
        expect(checkIsAnswer("B", "北京", "答案：B")).toBe(true);
        expect(checkIsAnswer("B", "北京", "北京")).toBe(true);
        expect(checkIsAnswer("A", "上海", "北京")).toBe(false);
        expect(checkIsAnswer("C", "广州", "AC")).toBe(true);
    });

    it("accurately detects choice option answers even when expectedText is full option text", () => {
        const text = `
中国的首都是哪里？
A. 上海
B. 北京
C. 广州
        `;
        const opts = extractChoiceOptionsFromText(text, "B. 北京");
        expect(opts[1].isAnswer).toBe(true);
        expect(opts[0].isAnswer).toBe(false);
        expect(opts[2].isAnswer).toBe(false);
    });

    describe("toggleChoiceSelection", () => {
        it("单选模式下替换选中国项并触发自动提交", () => {
            const res = toggleChoiceSelection(["A"], "B", false);
            expect(res.nextKeys).toEqual(["B"]);
            expect(res.shouldAutoSubmit).toBe(true);
            expect(res.hapticStrength).toBe(10);
        });

        it("多选模式下切换选中状态，不触发自动提交", () => {
            // 新增选中
            const r1 = toggleChoiceSelection(["A"], "B", true);
            expect(r1.nextKeys).toEqual(["A", "B"]);
            expect(r1.shouldAutoSubmit).toBe(false);
            expect(r1.hapticStrength).toBe(5);

            // 取消选中
            const r2 = toggleChoiceSelection(["A", "B"], "A", true);
            expect(r2.nextKeys).toEqual(["B"]);
            expect(r2.shouldAutoSubmit).toBe(false);
        });
    });

    describe("updateQuizScoreCounters & toastDuration", () => {
        it("答对时总数与正确数均递增，且包含预设 toastDuration", () => {
            const next = updateQuizScoreCounters({ total: 2, correct: 1 }, true);
            expect(next).toEqual({ total: 3, correct: 2 });

            const options = [
                { key: "A", text: "选项A", isAnswer: true },
                { key: "B", text: "选项B", isAnswer: false },
            ];
            const res = evaluateChoiceQuiz(options, ["A"], false);
            expect(res?.toastDuration).toBe(2000);
            expect(res?.isCorrect).toBe(true);
        });

        it("答错时仅总数递增，正确数保持不变", () => {
            const next = updateQuizScoreCounters({ total: 5, correct: 3 }, false);
            expect(next).toEqual({ total: 6, correct: 3 });

            const judgeRes = evaluateJudgeQuiz(true, false);
            expect(judgeRes?.toastDuration).toBe(1800);
            expect(judgeRes?.isCorrect).toBe(false);
        });
    });

    describe("createInitialEphemeralQuizState", () => {
        it("返回包含所有重置默认值的初始瞬态对象", () => {
            const state = createInitialEphemeralQuizState();
            expect(state.choices).toBeNull();
            expect(state.choiceLoading).toBe(false);
            expect(state.choiceFallbackMode).toBe("none");
            expect(state.typingGrade).toBeNull();
            expect(state.interactiveQuiz).toBeNull();
            expect(state.selectedChoiceKeys).toEqual([]);
            expect(state.userJudgeChoice).toBeNull();
            expect(state.suggestedRating).toBeNull();
        });
    });
});
