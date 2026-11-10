import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewRequeueWaiting from "@/ui/review/ReviewRequeueWaiting.svelte";

describe("ReviewRequeueWaiting 短暂重考倒计时等待面板", () => {
    afterEach(() => {
        cleanup();
    });

    const mockT = {
        dashboard: {
            refresh: "刷新",
        },
        review: {
            requeueWaitingTitle: "等待重考中",
            requeueWaitingSub: "卡片已暂存，${n} 秒后重新出题",
            undoLast: "撤销上一张",
        },
    };

    it("正确渲染标题、倒计时与范围，并触发刷新", async () => {
        const onRefresh = vi.fn();
        const { getByText, getByTestId } = render(ReviewRequeueWaiting, {
            props: {
                headScopeLabel: "默认牌组",
                requeueWaitSeconds: 15,
                historyLength: 2,
                t: mockT,
                onRefresh,
            },
        });

        expect(getByText("REVIEW / 默认牌组")).toBeTruthy();
        expect(getByText("等待重考中")).toBeTruthy();
        expect(getByText("卡片已暂存，15 秒后重新出题")).toBeTruthy();

        const refreshBtn = getByTestId("review-requeue-refresh-btn");
        await fireEvent.click(refreshBtn);
        expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it("有作答历史时撤销按钮可用并支持点击", async () => {
        const onUndo = vi.fn();
        const { getByTestId } = render(ReviewRequeueWaiting, {
            props: {
                historyLength: 3,
                actionBusy: false,
                t: mockT,
                onUndo,
            },
        });

        const undoBtn = getByTestId("review-requeue-undo-btn");
        expect(undoBtn.hasAttribute("disabled")).toBe(false);

        await fireEvent.click(undoBtn);
        expect(onUndo).toHaveBeenCalledTimes(1);
    });

    it("无历史或处于繁忙状态时撤销按钮禁用", async () => {
        const onUndo = vi.fn();
        const { getByTestId, rerender } = render(ReviewRequeueWaiting, {
            props: {
                historyLength: 0,
                actionBusy: false,
                t: mockT,
                onUndo,
            },
        });

        const undoBtn = getByTestId("review-requeue-undo-btn");
        expect(undoBtn.hasAttribute("disabled")).toBe(true);

        // 切换为繁忙状态
        rerender({
            historyLength: 2,
            actionBusy: true,
        });
        expect(undoBtn.hasAttribute("disabled")).toBe(true);
    });
});
