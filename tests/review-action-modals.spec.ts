import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewActionModals from "@/ui/review/ReviewActionModals.svelte";

describe("ReviewActionModals 模态弹窗与灯箱组件", () => {
    afterEach(() => {
        cleanup();
    });

    const defaultProps = {
        t: {
            review: {
                pauseTitle: "暂停这场复习",
                pauseDesc: "进度已安全保留。",
                pauseContinue: "继续本场",
                pauseConfirm: "暂停并返回今日",
                doneConfirm: "已完成",
                skipNotRated: "跳过",
                sessionOptionsTitle: "本场偏好",
                sessionOptionsHint: "仅本场有效",
                answerModeLabel: "作答方式",
                modeRecall: "自由回忆",
                modeChoice: "选择题",
                modeTyping: "打字练习",
                applySessionOptions: "应用偏好",
                memoModalTitle: "助记便签",
                memoModalDesc: "写下口诀",
                memoPlaceholder: "输入便签",
                memoSave: "保存便签",
                retireCardTitle: "移出卡组",
                retireCardDesc: "确认移出？",
                retireCardConfirm: "确认移出",
            },
        },
        showPauseModal: false,
        showSessionOptionsModal: false,
        showMemoEditor: false,
        showRetireModal: false,
        zoomedImage: null,
        reviewedCount: 10,
        skippedCount: 2,
        tempAnswerVariant: "normal" as const,
        memoDraft: "记忆线索",
        memoSaving: false,
        retireBusy: false,
        onClosePause: vi.fn(),
        onConfirmPause: vi.fn(),
        onCloseSessionOptions: vi.fn(),
        onApplySessionOptions: vi.fn(),
        onCloseMemoEditor: vi.fn(),
        onSaveMemo: vi.fn(),
        onCloseRetireModal: vi.fn(),
        onConfirmRetire: vi.fn(),
        onCloseZoomedImage: vi.fn(),
    };

    it("正确渲染暂停弹窗并触发确认/继续回调", async () => {
        const onConfirmPause = vi.fn();
        const onClosePause = vi.fn();
        const { getByText } = render(ReviewActionModals, {
            props: {
                ...defaultProps,
                showPauseModal: true,
                onConfirmPause,
                onClosePause,
            },
        });

        expect(getByText("暂停这场复习")).toBeTruthy();

        await fireEvent.click(getByText("继续本场"));
        expect(onClosePause).toHaveBeenCalled();

        await fireEvent.click(getByText("暂停并返回今日"));
        expect(onConfirmPause).toHaveBeenCalled();
    });

    it("正确渲染本场偏好弹窗并应用作答偏好", async () => {
        const onApplySessionOptions = vi.fn();
        const { getByText } = render(ReviewActionModals, {
            props: {
                ...defaultProps,
                showSessionOptionsModal: true,
                onApplySessionOptions,
            },
        });

        expect(getByText("本场偏好")).toBeTruthy();

        await fireEvent.click(getByText("应用偏好"));
        expect(onApplySessionOptions).toHaveBeenCalledWith("normal");
    });

    it("正确渲染助记便签弹窗并保存输入内容", async () => {
        const onSaveMemo = vi.fn();
        const { getByText, getByDisplayValue } = render(ReviewActionModals, {
            props: {
                ...defaultProps,
                showMemoEditor: true,
                onSaveMemo,
            },
        });

        expect(getByText("助记便签")).toBeTruthy();
        expect(getByDisplayValue("记忆线索")).toBeTruthy();

        await fireEvent.click(getByText("保存便签"));
        expect(onSaveMemo).toHaveBeenCalledWith("记忆线索");
    });

    it("正确渲染统一移出复习三选一弹窗，支持今天不学、归档隐藏与彻底移出卡组", async () => {
        const onConfirmRetire = vi.fn();
        const onSuspendToday = vi.fn();
        const onDismissCard = vi.fn();
        const onCloseRetireModal = vi.fn();
        const { getByText, getByRole } = render(ReviewActionModals, {
            props: {
                ...defaultProps,
                showRetireModal: true,
                onConfirmRetire,
                onSuspendToday,
                onDismissCard,
                onCloseRetireModal,
            },
        });

        expect(getByText("移出卡组")).toBeTruthy();
        expect(getByText(/思源原生闪卡面板仍可见/)).toBeTruthy();

        await fireEvent.click(getByRole("button", { name: "今天不学" }));
        expect(onSuspendToday).toHaveBeenCalledOnce();
        expect(onCloseRetireModal).toHaveBeenCalledTimes(1);

        await fireEvent.click(getByRole("button", { name: "归档隐藏" }));
        expect(onDismissCard).toHaveBeenCalledOnce();
        expect(onCloseRetireModal).toHaveBeenCalledTimes(2);

        await fireEvent.click(getByText("确认移出"));
        expect(onConfirmRetire).toHaveBeenCalledOnce();
    });

    it("正确渲染图片灯箱并能触发关闭", async () => {
        const onCloseZoomedImage = vi.fn();
        const { getByAltText, getByLabelText } = render(ReviewActionModals, {
            props: {
                ...defaultProps,
                zoomedImage: { src: "test.png", alt: "测试图片" },
                onCloseZoomedImage,
            },
        });

        expect(getByAltText("测试图片")).toBeTruthy();

        await fireEvent.click(getByLabelText(/(Cancel|关闭)/));
        expect(onCloseZoomedImage).toHaveBeenCalled();
    });
});
