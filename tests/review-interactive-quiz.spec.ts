import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewInteractiveQuiz from "@/ui/review/ReviewInteractiveQuiz.svelte";
import type { InteractiveQuizData } from "@/core/quiz-interactive";

describe("ReviewInteractiveQuiz 交互式题型作答组件", () => {
    afterEach(() => {
        cleanup();
    });

    const choiceQuiz: InteractiveQuizData = {
        kind: "choice",
        isMultiple: false,
        options: [
            { key: "A", text: "光子", isAnswer: true },
            { key: "B", text: "电子", isAnswer: false },
            { key: "C", text: "质子", isAnswer: false },
        ],
        rawAnswer: "A",
    };

    const judgeQuiz: InteractiveQuizData = {
        kind: "judge",
        judgeAnswer: true,
        rawAnswer: "对",
    };

    const fillQuiz: InteractiveQuizData = {
        kind: "fill",
        fillAnswers: ["量子"],
        rawAnswer: "量子",
        analysis: "普朗克在1900年提出了量子假说。",
    };

    it("单选题选项渲染与点击选项", async () => {
        const onOptionPick = vi.fn();
        const { getByText } = render(ReviewInteractiveQuiz, {
            props: {
                interactiveQuiz: choiceQuiz,
                showAnswer: false,
                selectedChoiceKeys: ["A"],
                userJudgeChoice: null,
                typingInput: "",
                onOptionPick,
                onSubmitChoice: vi.fn(),
                onJudgePick: vi.fn(),
                onFillCheck: vi.fn(),
            },
        });

        expect(getByText("光子")).toBeTruthy();
        expect(getByText("电子")).toBeTruthy();

        await fireEvent.click(getByText("电子"));
        expect(onOptionPick).toHaveBeenCalledWith("B");
    });

    it("多选题显示确认提交按钮并可点击", async () => {
        const multiQuiz: InteractiveQuizData = {
            ...choiceQuiz,
            isMultiple: true,
        };
        const onSubmitChoice = vi.fn();
        const { getByText } = render(ReviewInteractiveQuiz, {
            props: {
                interactiveQuiz: multiQuiz,
                showAnswer: false,
                selectedChoiceKeys: ["A", "B"],
                userJudgeChoice: null,
                typingInput: "",
                onOptionPick: vi.fn(),
                onSubmitChoice,
                onJudgePick: vi.fn(),
                onFillCheck: vi.fn(),
            },
        });

        const submitBtn = getByText(/确认提交多选/);
        expect(submitBtn).toBeTruthy();

        await fireEvent.click(submitBtn);
        expect(onSubmitChoice).toHaveBeenCalled();
    });

    it("判断题正确/错误按钮点击", async () => {
        const onJudgePick = vi.fn();
        const { getByText } = render(ReviewInteractiveQuiz, {
            props: {
                interactiveQuiz: judgeQuiz,
                showAnswer: false,
                selectedChoiceKeys: [],
                userJudgeChoice: null,
                typingInput: "",
                onOptionPick: vi.fn(),
                onSubmitChoice: vi.fn(),
                onJudgePick,
                onFillCheck: vi.fn(),
            },
        });

        const trueBtn = getByText("正确 / 对");
        await fireEvent.click(trueBtn);
        expect(onJudgePick).toHaveBeenCalledWith(true);

        const falseBtn = getByText("错误 / 错");
        await fireEvent.click(falseBtn);
        expect(onJudgePick).toHaveBeenCalledWith(false);
    });

    it("填空题输入与回车触发判定，答案态展示参考解析", async () => {
        const onFillCheck = vi.fn();
        const { getByPlaceholderText, rerender, getByText } = render(ReviewInteractiveQuiz, {
            props: {
                interactiveQuiz: fillQuiz,
                showAnswer: false,
                selectedChoiceKeys: [],
                userJudgeChoice: null,
                typingInput: "量子",
                onOptionPick: vi.fn(),
                onSubmitChoice: vi.fn(),
                onJudgePick: vi.fn(),
                onFillCheck,
            },
        });

        const input = getByPlaceholderText(/在此输入你的填空答案/);
        await fireEvent.keyDown(input, { key: "Enter" });
        expect(onFillCheck).toHaveBeenCalled();

        // 翻面后呈现参考解析
        rerender({
            interactiveQuiz: fillQuiz,
            showAnswer: true,
            selectedChoiceKeys: [],
            userJudgeChoice: null,
            typingInput: "量子",
            onOptionPick: vi.fn(),
            onSubmitChoice: vi.fn(),
            onJudgePick: vi.fn(),
            onFillCheck,
        });

        expect(getByText(/普朗克在1900年提出了量子假说/)).toBeTruthy();
    });
});
