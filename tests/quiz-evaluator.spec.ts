import { describe, expect, it } from "vitest";
import {
    evaluateChoiceQuiz,
    evaluateJudgeQuiz,
    evaluateFillQuiz,
    resolveQuizKeyboardAction,
    type InteractiveOption,
    type InteractiveQuizData,
} from "@/core/quiz-interactive";

describe("quiz-evaluator 交互式题型评分与反馈评估引擎", () => {
    const singleOptions: InteractiveOption[] = [
        { key: "A", text: "选项A", isAnswer: false },
        { key: "B", text: "选项B", isAnswer: true },
        { key: "C", text: "选项C", isAnswer: false },
    ];

    const multiOptions: InteractiveOption[] = [
        { key: "A", text: "选项A", isAnswer: true },
        { key: "B", text: "选项B", isAnswer: true },
        { key: "C", text: "选项C", isAnswer: false },
        { key: "D", text: "选项D", isAnswer: true },
    ];

    describe("evaluateChoiceQuiz", () => {
        it("单选正确匹配给出满分评级与正面反馈", () => {
            const res = evaluateChoiceQuiz(singleOptions, ["B"], false);
            expect(res).not.toBeNull();
            expect(res?.isCorrect).toBe(true);
            expect(res?.suggestedRating).toBe(3);
            expect(res?.message).toBe("回答正确！");
            expect(res?.messageType).toBe("info");
        });

        it("单选错误给出最低评级与错误反馈", () => {
            const res = evaluateChoiceQuiz(singleOptions, ["A"], false);
            expect(res).not.toBeNull();
            expect(res?.isCorrect).toBe(false);
            expect(res?.suggestedRating).toBe(1);
            expect(res?.message).toBe("回答错误，已标出正确选项");
            expect(res?.messageType).toBe("error");
        });

        it("多选全部命中给出满分", () => {
            const res = evaluateChoiceQuiz(multiOptions, ["A", "B", "D"], true);
            expect(res).not.toBeNull();
            expect(res?.isCorrect).toBe(true);
            expect(res?.suggestedRating).toBe(3);
            expect(res?.message).toBe("多选全部正确！");
        });

        it("多选漏选但无错选给出部分正确评级（2星）", () => {
            const res = evaluateChoiceQuiz(multiOptions, ["A", "B"], true);
            expect(res).not.toBeNull();
            expect(res?.isCorrect).toBe(false);
            expect(res?.suggestedRating).toBe(2);
            expect(res?.message).toContain("多选漏选");
        });

        it("多选包含错选给出错误评级（1星）", () => {
            const res = evaluateChoiceQuiz(multiOptions, ["A", "C"], true);
            expect(res).not.toBeNull();
            expect(res?.isCorrect).toBe(false);
            expect(res?.suggestedRating).toBe(1);
            expect(res?.message).toBe("回答错误，已标出正确选项");
        });

        it("未选择任何选项返回 null", () => {
            expect(evaluateChoiceQuiz(singleOptions, [], false)).toBeNull();
        });
    });

    describe("evaluateJudgeQuiz", () => {
        it("判断题正确评估", () => {
            const res = evaluateJudgeQuiz(true, true);
            expect(res?.isCorrect).toBe(true);
            expect(res?.suggestedRating).toBe(3);
            expect(res?.message).toBe("判断正确！");
            expect(res?.messageType).toBe("info");
        });

        it("判断题错误评估", () => {
            const res = evaluateJudgeQuiz(true, false);
            expect(res?.isCorrect).toBe(false);
            expect(res?.suggestedRating).toBe(1);
            expect(res?.message).toBe("判断错误，已标出正确答案");
            expect(res?.messageType).toBe("error");
        });

        it("已知答案为 null 时返回 null", () => {
            expect(evaluateJudgeQuiz(true, null)).toBeNull();
        });
    });

    describe("evaluateFillQuiz", () => {
        it("完全一致填空给出正确评级", () => {
            const res = evaluateFillQuiz("光合作用", "光合作用");
            expect(res?.isCorrect).toBe(true);
            expect(res?.suggestedRating).toBe(3);
            expect(res?.message).toBe("填空正确！");
        });

        it("拼写微瑕（1字之差）智能容错放行", () => {
            const res = evaluateFillQuiz("神经元突触", "神经元突触1");
            expect(res?.typingGrade?.isTypo).toBe(true);
            expect(res?.message).toContain("拼写微瑕");
        });

        it("输入为空或期望为空返回 null", () => {
            expect(evaluateFillQuiz("", "测试")).toBeNull();
            expect(evaluateFillQuiz("测试", "   ")).toBeNull();
        });
    });

    describe("resolveQuizKeyboardAction", () => {
        const choiceQuiz: InteractiveQuizData = {
            kind: "choice",
            stem: "题目",
            options: [
                { key: "A", text: "选项A", isAnswer: true },
                { key: "B", text: "选项B", isAnswer: false },
                { key: "C", text: "选项C", isAnswer: false },
            ],
            isMultiple: false,
            judgeAnswer: null,
            fillExpected: "",
            analysis: "",
            hasInteractiveWidgets: true,
        };

        const multiChoiceQuiz: InteractiveQuizData = {
            ...choiceQuiz,
            isMultiple: true,
        };

        const judgeQuiz: InteractiveQuizData = {
            kind: "judge",
            stem: "题目",
            options: [],
            isMultiple: false,
            judgeAnswer: true,
            fillExpected: "",
            analysis: "",
            hasInteractiveWidgets: true,
        };

        it("单选选择题匹配字母与数字快捷键", () => {
            expect(resolveQuizKeyboardAction({ key: "a" }, choiceQuiz, [], false)).toEqual({ type: "pick-option", optionKey: "A" });
            expect(resolveQuizKeyboardAction({ key: "2" }, choiceQuiz, [], false)).toEqual({ type: "pick-option", optionKey: "B" });
            expect(resolveQuizKeyboardAction({ key: "C" }, choiceQuiz, [], false)).toEqual({ type: "pick-option", optionKey: "C" });
            expect(resolveQuizKeyboardAction({ key: "4" }, choiceQuiz, [], false)).toBeNull();
        });

        it("多选题有选项时按 Enter 触发提交", () => {
            expect(resolveQuizKeyboardAction({ key: "Enter" }, multiChoiceQuiz, ["A"], false)).toEqual({ type: "submit-choice" });
            expect(resolveQuizKeyboardAction({ key: "Enter" }, multiChoiceQuiz, [], false)).toBeNull();
        });

        it("判断题匹配 T/F/Y/N/1/2 快捷键", () => {
            expect(resolveQuizKeyboardAction({ key: "t" }, judgeQuiz, [], false)).toEqual({ type: "pick-judge", choice: true });
            expect(resolveQuizKeyboardAction({ key: "1" }, judgeQuiz, [], false)).toEqual({ type: "pick-judge", choice: true });
            expect(resolveQuizKeyboardAction({ key: "f" }, judgeQuiz, [], false)).toEqual({ type: "pick-judge", choice: false });
            expect(resolveQuizKeyboardAction({ key: "2" }, judgeQuiz, [], false)).toEqual({ type: "pick-judge", choice: false });
        });

        it("答案态或无题型返回 null", () => {
            expect(resolveQuizKeyboardAction({ key: "a" }, choiceQuiz, [], true)).toBeNull();
            expect(resolveQuizKeyboardAction({ key: "a" }, null, [], false)).toBeNull();
        });
    });
});
