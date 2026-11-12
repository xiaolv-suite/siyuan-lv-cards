import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewRescheduleModal from "@/ui/review/ReviewRescheduleModal.svelte";

describe("ReviewRescheduleModal 快速改期组件", () => {
    afterEach(() => {
        cleanup();
    });

    const mockT = {
        review: {
            helpReschedule: "快速改期",
            rescheduleIn: "安排在",
            rescheduleDays: "天后复习",
            rescheduleTarget: "目标到期日",
            rescheduleRange: "天数范围应为 1 ~ 36500",
            rescheduleCancel: "取消",
            rescheduleRetrySame: "重试改期",
            rescheduleErrorPreserved: "改期未生效",
            rescheduleTargetHint: "精准到期重试时会保持精确时间戳不变。",
        },
        dashboard: {
            loading: "正在处理…",
        },
    };

    it("open 为 false 时不渲染任何内容", () => {
        const { queryByRole } = render(ReviewRescheduleModal, {
            props: {
                open: false,
                t: mockT,
                onReschedule: vi.fn(),
                onClose: vi.fn(),
            },
        });

        expect(queryByRole("region")).toBeNull();
    });

    it("正常渲染输入天数与目标到期日预览", () => {
        const { getByText, getByDisplayValue } = render(ReviewRescheduleModal, {
            props: {
                open: true,
                rescheduleDays: 5,
                previewTargetLabel: "2026-11-02",
                t: mockT,
                onReschedule: vi.fn(),
                onClose: vi.fn(),
            },
        });

        expect(getByText("安排在")).toBeTruthy();
        expect(getByDisplayValue("5")).toBeTruthy();
        expect(getByText(/2026-11-02/)).toBeTruthy();
    });

    it("输入非法天数展示校验错误并禁用确认按钮", async () => {
        const { getByText, container } = render(ReviewRescheduleModal, {
            props: {
                open: true,
                rescheduleDays: 0,
                t: mockT,
                onReschedule: vi.fn(),
                onClose: vi.fn(),
            },
        });

        expect(getByText("天数范围应为 1 ~ 36500")).toBeTruthy();
        const confirmBtn = container.querySelector<HTMLButtonElement>(".lv-btn-primary");
        expect(confirmBtn?.disabled).toBe(true);
    });

    it("点击确认按钮触发 onReschedule 回调", async () => {
        const onReschedule = vi.fn();
        const { container } = render(ReviewRescheduleModal, {
            props: {
                open: true,
                rescheduleDays: 3,
                t: mockT,
                onReschedule,
                onClose: vi.fn(),
            },
        });

        const confirmBtn = container.querySelector<HTMLButtonElement>(".lv-btn-primary");
        expect(confirmBtn).toBeTruthy();
        await fireEvent.click(confirmBtn!);
        expect(onReschedule).toHaveBeenCalled();
    });

    it("点击取消按钮触发 onClose 回调", async () => {
        const onClose = vi.fn();
        const { getByText } = render(ReviewRescheduleModal, {
            props: {
                open: true,
                rescheduleDays: 3,
                t: mockT,
                onReschedule: vi.fn(),
                onClose,
            },
        });

        const cancelBtn = getByText("取消");
        await fireEvent.click(cancelBtn);
        expect(onClose).toHaveBeenCalled();
    });
});
