import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewRatingBar from "@/ui/review/ReviewRatingBar.svelte";

describe("ReviewRatingBar 底部评分操作条组件", () => {
    afterEach(() => {
        cleanup();
    });

    const mockT = {
        review: {
            showAnswer: "显示答案",
            clozeRevealNext: "揭晓下一空",
            clozeRevealAll: "全部揭晓",
            unknown: "不认识",
            vague: "模糊",
            know: "认识",
            againBtn: "重来",
            hard: "困难",
            good: "良好",
            easy: "简单",
            ratingAriaLabel: "评分操作区",
        },
    };

    it("问题态下正确渲染「显示答案」按钮并支持点击", async () => {
        const onRevealAnswer = vi.fn();
        const { getByText } = render(ReviewRatingBar, {
            props: {
                showAnswer: false,
                stepRevealedCount: 0,
                faceReady: true,
                t: mockT,
                onRevealAnswer,
                onRate: vi.fn(),
            },
        });

        const btn = getByText("显示答案");
        expect(btn).toBeTruthy();
        await fireEvent.click(btn);
        expect(onRevealAnswer).toHaveBeenCalled();
    });

    it("问题态分步挖空下渲染「揭晓下一空」与「全部揭晓」", async () => {
        const onRevealNextCloze = vi.fn();
        const onRevealAnswer = vi.fn();
        const { getByText } = render(ReviewRatingBar, {
            props: {
                showAnswer: false,
                stepRevealedCount: 1,
                faceReady: true,
                t: mockT,
                onRevealAnswer,
                onRevealNextCloze,
                onRate: vi.fn(),
            },
        });

        const nextBtn = getByText("揭晓下一空");
        const allBtn = getByText("全部揭晓");
        expect(nextBtn).toBeTruthy();
        expect(allBtn).toBeTruthy();

        await fireEvent.click(nextBtn);
        expect(onRevealNextCloze).toHaveBeenCalled();

        await fireEvent.click(allBtn);
        expect(onRevealAnswer).toHaveBeenCalled();
    });

    it("答案态三档制下渲染「不认识 / 模糊 / 认识」并触发打分", async () => {
        const onRate = vi.fn();
        const { getByText } = render(ReviewRatingBar, {
            props: {
                showAnswer: true,
                ratingStyle: "three",
                dueText: (r: string) => `${r}天`,
                t: mockT,
                onRevealAnswer: vi.fn(),
                onRate,
            },
        });

        expect(getByText("不认识")).toBeTruthy();
        expect(getByText("模糊")).toBeTruthy();
        expect(getByText("认识")).toBeTruthy();

        await fireEvent.click(getByText("认识"));
        expect(onRate).toHaveBeenCalledWith(3);
    });

    it("答案态四档制下渲染「重来 / 困难 / 良好 / 简单」并高亮建议评分", async () => {
        const onRate = vi.fn();
        const { getByText, container } = render(ReviewRatingBar, {
            props: {
                showAnswer: true,
                ratingStyle: "four",
                suggestedRating: 4,
                dueText: (r: string) => `${r}天`,
                t: mockT,
                onRevealAnswer: vi.fn(),
                onRate,
            },
        });

        expect(getByText("重来")).toBeTruthy();
        expect(getByText("困难")).toBeTruthy();
        expect(getByText("良好")).toBeTruthy();
        expect(getByText("简单")).toBeTruthy();

        const suggestedBtn = container.querySelector(".lv-btn-suggested");
        expect(suggestedBtn).toBeTruthy();
        expect(suggestedBtn?.textContent).toContain("简单");

        await fireEvent.click(getByText("简单"));
        expect(onRate).toHaveBeenCalledWith(4);
    });
});
