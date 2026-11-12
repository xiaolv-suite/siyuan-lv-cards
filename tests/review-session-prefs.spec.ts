import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewSessionPrefs from "@/ui/review/ReviewSessionPrefs.svelte";

describe("ReviewSessionPrefs 本场偏好抽屉组件", () => {
    afterEach(() => {
        cleanup();
    });

    const mockT = {
        review: {
            prefsTitle: "本场偏好",
            prefsHint: "仅对当前复习面板生效",
            prefsFour: "四档",
            prefsThree: "三档",
            budgetLabel: "单场时间预算",
            budgetOff: "不设预算",
            budgetMinutes: "${n} 分钟",
            budgetCustomLabel: "自定义预算",
            budgetCustomHint: "分钟",
            budgetEst: "预计完成 ${done} 张 · 剩余 ${left} 张",
            prefsReset: "恢复全局默认",
        },
        settings: {
            ratingStyle: "评分制",
            reverseOrder: "双向问答反转",
            mixedRotationLabel: "混合题型轮换",
            timeoutMode: "超时处理",
            timeoutOff: "关闭限时",
            timeoutReveal: "自动翻面",
            timeoutForget: "记为遗忘",
        },
    };

    it("open 为 false 时不渲染任何内容", () => {
        const { queryByRole } = render(ReviewSessionPrefs, {
            props: {
                open: false,
                t: mockT,
                onSetOverride: vi.fn(),
                onSetBudget: vi.fn(),
                onResetOverrides: vi.fn(),
            },
        });

        expect(queryByRole("region")).toBeNull();
    });

    it("切换评分制按钮触发 onSetOverride 回调", async () => {
        const onSetOverride = vi.fn();
        const { getByText } = render(ReviewSessionPrefs, {
            props: {
                open: true,
                ratingStyle: "four",
                t: mockT,
                onSetOverride,
                onSetBudget: vi.fn(),
                onResetOverrides: vi.fn(),
            },
        });

        expect(getByText("本场偏好")).toBeTruthy();

        const threeBtn = getByText("三档");
        await fireEvent.click(threeBtn);
        expect(onSetOverride).toHaveBeenCalledWith("ratingStyle", "three");
    });

    it("切换反转开关触发 onSetOverride 回调", async () => {
        const onSetOverride = vi.fn();
        const { container } = render(ReviewSessionPrefs, {
            props: {
                open: true,
                reverseOrder: false,
                t: mockT,
                onSetOverride,
                onSetBudget: vi.fn(),
                onResetOverrides: vi.fn(),
            },
        });

        const switches = container.querySelectorAll<HTMLInputElement>(".b3-switch");
        expect(switches.length).toBeGreaterThan(0);
        await fireEvent.change(switches[0], { target: { checked: true } });
        expect(onSetOverride).toHaveBeenCalledWith("reverseOrder", true);
    });

    it("自定义时间预算输入变更触发 onSetBudget 回调", async () => {
        const onSetBudget = vi.fn();
        const { getByPlaceholderText } = render(ReviewSessionPrefs, {
            props: {
                open: true,
                budgetMin: 15,
                t: mockT,
                onSetOverride: vi.fn(),
                onSetBudget,
                onResetOverrides: vi.fn(),
            },
        });

        const customInput = getByPlaceholderText("分钟");
        await fireEvent.change(customInput, { target: { value: "35" } });
        expect(onSetBudget).toHaveBeenCalledWith(35);
    });

    it("点击恢复默认按钮触发 onResetOverrides 回调", async () => {
        const onResetOverrides = vi.fn();
        const { getByText } = render(ReviewSessionPrefs, {
            props: {
                open: true,
                hasOverrides: true,
                t: mockT,
                onSetOverride: vi.fn(),
                onSetBudget: vi.fn(),
                onResetOverrides,
            },
        });

        const resetBtn = getByText("恢复全局默认");
        await fireEvent.click(resetBtn);
        expect(onResetOverrides).toHaveBeenCalled();
    });
});
