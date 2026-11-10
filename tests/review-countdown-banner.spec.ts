import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewCountdownBanner from "@/ui/review/ReviewCountdownBanner.svelte";

describe("ReviewCountdownBanner 番茄专注提醒与限时提示组件", () => {
    afterEach(() => {
        cleanup();
    });

    const mockT = {
        review: {
            pomodoroDoneTitle: "25 分钟番茄专注达成！",
            pomodoroDoneDesc: "已完成本轮专注复习（已评 ${n} 张），建议休息 5 分钟。",
            pomodoroRest: "休息并返回今日",
            pomodoroContinue: "继续复习",
            timeoutExpiredNote: "已到答题时限，请对照答案并自评",
        },
    };

    it("番茄周期达成并揭晓答案时展示番茄休息卡片", async () => {
        const onRest = vi.fn();
        const onContinue = vi.fn();
        const { getByText } = render(ReviewCountdownBanner, {
            props: {
                budgetMin: 25,
                budgetExpired: true,
                showAnswer: true,
                timeoutExpired: false,
                reviewedCount: 15,
                t: mockT,
                onRest,
                onContinue,
            },
        });

        expect(getByText("25 分钟番茄专注达成！")).toBeTruthy();
        expect(getByText(/已评 15 张/)).toBeTruthy();

        const restBtn = getByText("休息并返回今日");
        await fireEvent.click(restBtn);
        expect(onRest).toHaveBeenCalled();

        const continueBtn = getByText("继续复习");
        await fireEvent.click(continueBtn);
        expect(onContinue).toHaveBeenCalled();
    });

    it("超时到点时展示限时自评提醒", () => {
        const { getByText } = render(ReviewCountdownBanner, {
            props: {
                budgetMin: 0,
                budgetExpired: false,
                showAnswer: true,
                timeoutExpired: true,
                reviewedCount: 5,
                t: mockT,
                onRest: vi.fn(),
                onContinue: vi.fn(),
            },
        });

        expect(getByText("已到答题时限，请对照答案并自评")).toBeTruthy();
    });
});
