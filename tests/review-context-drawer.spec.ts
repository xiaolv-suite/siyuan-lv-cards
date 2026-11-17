import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewContextDrawer from "@/ui/review/ReviewContextDrawer.svelte";

describe("ReviewContextDrawer 来源文档上下文抽屉组件", () => {
    afterEach(() => {
        cleanup();
    });

    const mockT = {
        review: {
            ctxTitle: "来源上下文",
            ctxNone: "暂无上下文信息",
        },
    };

    it("open 为 false 时不渲染任何内容", () => {
        const { queryByRole } = render(ReviewContextDrawer, {
            props: {
                open: false,
                blocks: [],
                loading: false,
                t: mockT,
            },
        });

        expect(queryByRole("region")).toBeNull();
    });

    it("loading 态渲染骨架屏", () => {
        const { getByRole } = render(ReviewContextDrawer, {
            props: {
                open: true,
                blocks: [],
                loading: true,
                t: mockT,
            },
        });

        expect(getByRole("region")).toBeTruthy();
    });

    it("空块时展示空态提示", () => {
        const { getByText } = render(ReviewContextDrawer, {
            props: {
                open: true,
                blocks: [],
                loading: false,
                t: mockT,
            },
        });

        expect(getByText("暂无上下文信息")).toBeTruthy();
    });

    it("正常渲染前后上下文块并高亮当前卡片块", () => {
        const mockBlocks = [
            { id: "blk-prev", html: "<p>前置背景段落</p>" },
            { id: "blk-cur", html: "<p>当前测试卡片主体</p>" },
            { id: "blk-next", html: "<p>后续延展段落</p>" },
        ];

        const { getByText, container } = render(ReviewContextDrawer, {
            props: {
                open: true,
                blocks: mockBlocks,
                loading: false,
                currentBlockID: "blk-cur",
                t: mockT,
            },
        });

        expect(getByText("前置背景段落")).toBeTruthy();
        expect(getByText("当前测试卡片主体")).toBeTruthy();
        expect(getByText("后续延展段落")).toBeTruthy();

        // 验证当前块高亮 class
        const currentBlockEl = container.querySelector(".lv-ctx-cur");
        expect(currentBlockEl).toBeTruthy();
        expect(currentBlockEl?.textContent).toContain("当前测试卡片主体");
    });

    it("点击关闭按钮触发 onClose 回调", async () => {
        const onClose = vi.fn();
        const { getByLabelText } = render(ReviewContextDrawer, {
            props: {
                open: true,
                blocks: [{ id: "1", html: "<p>测试</p>" }],
                loading: false,
                t: mockT,
                onClose,
            },
        });

        const closeBtn = getByLabelText("关闭");
        await fireEvent.click(closeBtn);
        expect(onClose).toHaveBeenCalled();
    });
});
