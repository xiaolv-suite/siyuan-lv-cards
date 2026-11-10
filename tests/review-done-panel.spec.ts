import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewDonePanel from "@/ui/review/ReviewDonePanel.svelte";

describe("ReviewDonePanel 复习完成面板组件", () => {
    afterEach(() => {
        cleanup();
    });

    const defaultProps = {
        t: {
            review: {
                done: "今日已完成",
                doneNew: "新学",
                doneReview: "复习",
                doneForget: "遗忘",
                doneSkip: "跳过",
                doneRetention: "留存率",
                doneConfirm: "已正式评分记入算法",
                skipNotRated: "不计入评分",
                sessionTime: "用时",
                remainingDue: "还有 ${n} 张待复习",
                returnHome: "返回闪卡主页",
                again: "再来一组",
                nextTitle: "下一步建议",
                nextSkipped: "跳过了 ${n} 张卡片",
                nextForgotten: "遗忘了 ${n} 张卡片",
                reinforceMistakes: "强化这批遗忘卡",
                nextAct: "去处理",
            },
            endReason: {
                title: "收工原因",
                "goal-done": "目标达成",
                "time-up": "时间到了",
                "energy": "精力耗尽",
                "question": "遇到难题",
                "manual": "主动退出",
            },
            menuManager: "卡片管理",
        },
        sessionNew: 5,
        sessionReview: 13,
        sessionForget: 2,
        sessionSkip: 1,
        sessionQuizTotal: 10,
        sessionQuizCorrect: 8,
        purpose: "daily" as const,
        budgetMin: 0,
        budgetExpired: false,
        remainingDue: 3,
        streakMilestone: "连续打卡 7 天！",
        dailyTip: "每天复习一点，记忆更持久。",
        endPicked: null,
        starredCardCount: 2,
        sessionDuration: "12 分钟",
        targetProgress: "今日目标达成 100%",
        onPickEnd: vi.fn(),
        onReturnHome: vi.fn(),
        onOpenManager: vi.fn(),
        onReviewAgain: vi.fn(),
        onCramForgotten: vi.fn(),
        onCramStarred: vi.fn(),
    };

    it("正确计算并渲染大数字统计、留存率与测验命中率", () => {
        const { getByText } = render(ReviewDonePanel, { props: defaultProps });

        expect(getByText("今日已完成")).toBeTruthy();
        // 留存率 = (20 - 2) / 20 = 90%
        expect(getByText(/留存率 90%/)).toBeTruthy();
        // 测验命中率 = 8 / 10 = 80%
        expect(getByText(/实战命中率 80%/)).toBeTruthy();
        // 剩余卡片提醒
        expect(getByText("还有 3 张待复习")).toBeTruthy();
        expect(getByText("连续打卡 7 天！")).toBeTruthy();
    });

    it("点击收工原因按钮触发 onPickEnd 回调", async () => {
        const onPickEnd = vi.fn();
        const { getByText } = render(ReviewDonePanel, {
            props: { ...defaultProps, onPickEnd },
        });

        const energyBtn = getByText("精力耗尽");
        await fireEvent.click(energyBtn);
        expect(onPickEnd).toHaveBeenCalledWith("energy");
    });

    it("点击下一步建议中的强化遗忘卡与星标卡触发相应回调", async () => {
        const onCramForgotten = vi.fn();
        const onCramStarred = vi.fn();
        const { getByText } = render(ReviewDonePanel, {
            props: { ...defaultProps, onCramForgotten, onCramStarred },
        });

        await fireEvent.click(getByText("强化这批遗忘卡"));
        expect(onCramForgotten).toHaveBeenCalled();

        await fireEvent.click(getByText("立即专项练习星标卡"));
        expect(onCramStarred).toHaveBeenCalled();
    });

    it("点击跳过建议中的「去处理/去管理器」按钮触发 onOpenManager 而非误跳返回主页", async () => {
        const onReturnHome = vi.fn();
        const onOpenManager = vi.fn();
        const { getByTestId } = render(ReviewDonePanel, {
            props: { ...defaultProps, sessionSkip: 3, onReturnHome, onOpenManager },
        });

        await fireEvent.click(getByTestId("done-open-manager-skipped-btn"));
        expect(onOpenManager).toHaveBeenCalledOnce();
        expect(onReturnHome).not.toHaveBeenCalled();
    });

    it("底部主操作按钮（返回主页、卡片管理、再来一组）点击正常响应", async () => {
        const onReturnHome = vi.fn();
        const onOpenManager = vi.fn();
        const onReviewAgain = vi.fn();
        const { getByText } = render(ReviewDonePanel, {
            props: { ...defaultProps, onReturnHome, onOpenManager, onReviewAgain },
        });

        await fireEvent.click(getByText("返回闪卡主页"));
        expect(onReturnHome).toHaveBeenCalled();

        await fireEvent.click(getByText("卡片管理"));
        expect(onOpenManager).toHaveBeenCalled();

        await fireEvent.click(getByText("再来一组"));
        expect(onReviewAgain).toHaveBeenCalled();
    });

    it("键盘快捷键（Enter/Escape 返回主页、R/r 再来一组、M/m 打开卡库）正常响应", async () => {
        const onReturnHome = vi.fn();
        const onOpenManager = vi.fn();
        const onReviewAgain = vi.fn();
        render(ReviewDonePanel, {
            props: { ...defaultProps, onReturnHome, onOpenManager, onReviewAgain },
        });

        // Escape 返回主页
        await fireEvent.keyDown(window, { key: "Escape" });
        expect(onReturnHome).toHaveBeenCalledTimes(1);

        // Enter 返回主页
        await fireEvent.keyDown(window, { key: "Enter" });
        expect(onReturnHome).toHaveBeenCalledTimes(2);

        // R 键（大小写均支持）
        await fireEvent.keyDown(window, { key: "r" });
        expect(onReviewAgain).toHaveBeenCalledTimes(1);
        await fireEvent.keyDown(window, { key: "R" });
        expect(onReviewAgain).toHaveBeenCalledTimes(2);

        // M 键（大小写均支持）
        await fireEvent.keyDown(window, { key: "m" });
        expect(onOpenManager).toHaveBeenCalledTimes(1);
        await fireEvent.keyDown(window, { key: "M" });
        expect(onOpenManager).toHaveBeenCalledTimes(2);
    });

    it("突击快刷模式 (isCramMode: true) 结算卡契约与操作按钮响应", async () => {
        const onReturnHome = vi.fn();
        const onReviewAgain = vi.fn();

        const { getByTestId, getByText } = render(ReviewDonePanel, {
            props: {
                ...defaultProps,
                isCramMode: true,
                sessionNew: 2,
                sessionReview: 5,
                sessionForget: 3,
                sessionMinutes: 4,
                onReturnHome,
                onReviewAgain,
            },
        });

        // 验证顶部突击小结胶囊文案
        const summary = getByTestId("cram-done-summary");
        expect(summary).toBeTruthy();
        expect(summary.textContent).toContain("突击完成！共过题 10 张 · 耗时 4 分钟 · 算法排期未受干扰");

        // 验证主操作区支持再刷与退出
        const againBtn = getByTestId("cram-again-btn");
        expect(againBtn).toBeTruthy();
        await fireEvent.click(againBtn);
        expect(onReviewAgain).toHaveBeenCalledOnce();

        const exitBtn = getByTestId("cram-exit-btn");
        expect(exitBtn).toBeTruthy();
        await fireEvent.click(exitBtn);
        expect(onReturnHome).toHaveBeenCalledOnce();
    });
});
