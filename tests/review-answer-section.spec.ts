import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewAnswerSection from "@/ui/review/ReviewAnswerSection.svelte";

describe("ReviewAnswerSection 答案输入、单选、阶梯提示与翻面控制组件", () => {
    afterEach(() => {
        cleanup();
    });

    const mockT = {
        review: {
            typingPlaceholder: "输入你的答案后回车...",
            typingSuggested: "建议评分",
            choiceFallbackFreeRecall: "当前卡片暂无选项，转为自由回忆",
            choiceLoading: "选项生成中...",
            choiceMake: "生成选项",
            hintBtn: "提示",
            showAnswer: "显示答案",
            revealHint: "空格翻面",
            speak: "朗读",
        },
    };

    it("问题态输入法模式：正常渲染输入框并在按 Enter 时触发提交", async () => {
        const onSubmitTyping = vi.fn();
        let val = "测试答案";

        const { getByTestId } = render(ReviewAnswerSection, {
            props: {
                showAnswer: false,
                answerVariant: "typing",
                typingInput: val,
                t: mockT,
                onSubmitTyping,
            },
        });

        const input = getByTestId("review-typing-input") as HTMLInputElement;
        expect(input.value).toBe("测试答案");

        await fireEvent.keyDown(input, { key: "Enter" });
        expect(onSubmitTyping).toHaveBeenCalledTimes(1);
    });

    it("问题态单选模式：渲染选项、支持点击选择与结果高亮", async () => {
        const onPickChoice = vi.fn();
        const choices = {
            options: ["选项一", "选项二", "选项三", "选项四"],
            picked: null,
            answerIdx: 1,
        };

        const { getByTestId, rerender } = render(ReviewAnswerSection, {
            props: {
                showAnswer: false,
                answerVariant: "choice",
                choices,
                t: mockT,
                onPickChoice,
            },
        });

        const opt0 = getByTestId("review-choice-opt-0");
        const opt1 = getByTestId("review-choice-opt-1");
        expect(opt0.textContent).toContain("A. 选项一");
        expect(opt1.textContent).toContain("B. 选项二");

        await fireEvent.click(opt1);
        expect(onPickChoice).toHaveBeenCalledWith(1);

        // 重新渲染为已选状态
        rerender({
            choices: { ...choices, picked: 1 },
        });

        expect(opt1.classList.contains("lv-choice-correct")).toBe(true);
        expect(opt0.hasAttribute("disabled")).toBe(true);
    });

    it("单选模式的回退与生成交互", async () => {
        const onStartChoice = vi.fn();
        const { getByTestId, rerender, getByText } = render(ReviewAnswerSection, {
            props: {
                showAnswer: false,
                answerVariant: "choice",
                choices: null,
                choiceLoading: false,
                t: mockT,
                onStartChoice,
            },
        });

        const makeBtn = getByTestId("review-make-choice-btn");
        await fireEvent.click(makeBtn);
        expect(onStartChoice).toHaveBeenCalledTimes(1);

        // 切换到 loading
        rerender({ choiceLoading: true });
        expect(getByTestId("review-choice-loading")).toBeTruthy();

        // 切换到自由回忆回退
        rerender({ choiceLoading: false, choiceFallbackMode: "free-recall" });
        expect(getByText("当前卡片暂无选项，转为自由回忆")).toBeTruthy();
    });

    it("分级阶梯提示与翻面按钮控制", async () => {
        const onAdvanceHint = vi.fn();
        const onRevealAnswer = vi.fn();

        const { getByTestId, getByText } = render(ReviewAnswerSection, {
            props: {
                showAnswer: false,
                hintText: "首字线索：天",
                hintLevelLabel: "L1",
                faceReady: true,
                t: mockT,
                onAdvanceHint,
                onRevealAnswer,
            },
        });

        expect(getByTestId("review-hint-box")).toBeTruthy();
        expect(getByText("首字线索：天")).toBeTruthy();
        expect(getByText("L1")).toBeTruthy();

        const hintBtn = getByTestId("review-advance-hint-btn");
        await fireEvent.click(hintBtn);
        expect(onAdvanceHint).toHaveBeenCalledTimes(1);

        const revealBtn = getByTestId("review-reveal-btn");
        await fireEvent.click(revealBtn);
        expect(onRevealAnswer).toHaveBeenCalledTimes(1);
    });

    it("答案态下展示输入对比打分与语音朗读行", async () => {
        const onSpeakAnswer = vi.fn();
        const typingGrade = {
            isTypo: true,
            suggested: 3,
            chars: [
                { ch: "天", ok: true },
                { ch: "王", ok: true },
                { ch: "错", ok: false },
            ],
        };

        const { getByTestId, getByText, rerender } = render(ReviewAnswerSection, {
            props: {
                showAnswer: true,
                typingGrade,
                ttsEnabled: true,
                t: mockT,
                onSpeakAnswer,
            },
        });

        expect(getByTestId("review-typing-diff")).toBeTruthy();
        expect(getByText("拼写微瑕容错")).toBeTruthy();
        expect(getByText("错").classList.contains("lv-diff-bad")).toBe(true);

        // 无打分但开启 TTS 时展示朗读行
        rerender({
            typingGrade: null,
            showAnswer: true,
            ttsEnabled: true,
        });

        const speakBtn = getByTestId("review-tts-speak-btn");
        await fireEvent.click(speakBtn);
        expect(onSpeakAnswer).toHaveBeenCalledTimes(1);
    });
});
