import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewCramModal from "@/ui/review/ReviewCramModal.svelte";

describe("ReviewCramModal 考前突击快刷设置弹窗", () => {
    afterEach(() => {
        cleanup();
    });

    const mockT = {
        cancel: "取消",
    };

    it("正确渲染标题、算法保护提示与范围三选一选项", () => {
        const { getByTestId, getByText } = render(ReviewCramModal, {
            props: {
                open: true,
                t: mockT,
                onClose: vi.fn(),
                onStart: vi.fn(),
            },
        });

        expect(getByText("考前突击快刷")).toBeTruthy();
        expect(getByText(/算法排期保护中/)).toBeTruthy();
        expect(getByText(/零污染长期记忆曲线/)).toBeTruthy();

        expect(getByTestId("cram-scope-all")).toBeTruthy();
        expect(getByTestId("cram-scope-week")).toBeTruthy();
        expect(getByTestId("cram-scope-leech")).toBeTruthy();

        // 默认选中全部卡片
        expect(getByTestId("cram-scope-all").getAttribute("aria-checked")).toBe("true");
        expect(getByTestId("cram-scope-week").getAttribute("aria-checked")).toBe("false");
        expect(getByTestId("cram-scope-leech").getAttribute("aria-checked")).toBe("false");
    });

    it("切换范围选项与勾选随机乱序，点击开始触发 onStart 并携带配置参数", async () => {
        const onStart = vi.fn();
        const onClose = vi.fn();

        const { getByTestId } = render(ReviewCramModal, {
            props: {
                open: true,
                t: mockT,
                initialScope: "all",
                initialRandomOrder: false,
                onClose,
                onStart,
            },
        });

        // 切换为仅水蛭卡
        await fireEvent.click(getByTestId("cram-scope-leech"));
        expect(getByTestId("cram-scope-leech").getAttribute("aria-checked")).toBe("true");
        expect(getByTestId("cram-scope-all").getAttribute("aria-checked")).toBe("false");

        // 勾选随机乱序
        const randomCheckbox = getByTestId("cram-random-order") as HTMLInputElement;
        expect(randomCheckbox.checked).toBe(false);
        await fireEvent.click(randomCheckbox);
        expect(randomCheckbox.checked).toBe(true);

        // 点击开始
        await fireEvent.click(getByTestId("cram-start-btn"));
        expect(onStart).toHaveBeenCalledWith({
            scope: "leech",
            randomOrder: true,
        });
    });

    it("点击关闭按钮触发 onClose 回调", async () => {
        const onClose = vi.fn();

        const { getByTestId } = render(ReviewCramModal, {
            props: {
                open: true,
                t: mockT,
                onClose,
                onStart: vi.fn(),
            },
        });

        await fireEvent.click(getByTestId("cram-modal-close-btn"));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it("在突击中打开时支持退出突击返回正常复习", async () => {
        const onExitCram = vi.fn();

        const { getByTestId } = render(ReviewCramModal, {
            props: {
                open: true,
                t: mockT,
                isCramActive: true,
                onClose: vi.fn(),
                onStart: vi.fn(),
                onExitCram,
            },
        });

        const exitBtn = getByTestId("cram-exit-to-normal-btn");
        expect(exitBtn).toBeTruthy();
        await fireEvent.click(exitBtn);
        expect(onExitCram).toHaveBeenCalledOnce();
    });
});
