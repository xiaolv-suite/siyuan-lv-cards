import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewErrorTagBar from "@/ui/review/ReviewErrorTagBar.svelte";

describe("ReviewErrorTagBar 遗忘卡错误原因标注组件", () => {
    afterEach(() => {
        cleanup();
    });

    const mockT = {
        review: {
            errTagPrompt: "标记遗忘原因（可选）：",
            skip: "跳过",
            ko: {
                errReasons: {
                    "concept-confusion": "混淆相似概念",
                    "step-error": "步骤错误",
                    "memory-blank": "大脑空白",
                },
            },
        },
    };

    it("open 为 false 时不渲染任何内容", () => {
        const { queryByRole } = render(ReviewErrorTagBar, {
            props: {
                open: false,
                t: mockT,
                onTagError: vi.fn(),
                onClose: vi.fn(),
            },
        });

        expect(queryByRole("region")).toBeNull();
    });

    it("open 为 true 时渲染各错误原因标签并支持点击打标", async () => {
        const onTagError = vi.fn();
        const { getByText } = render(ReviewErrorTagBar, {
            props: {
                open: true,
                t: mockT,
                onTagError,
                onClose: vi.fn(),
            },
        });

        expect(getByText("标记遗忘原因（可选）：")).toBeTruthy();
        expect(getByText("混淆相似概念")).toBeTruthy();

        await fireEvent.click(getByText("混淆相似概念"));
        expect(onTagError).toHaveBeenCalledWith("concept-confusion");
    });

    it("点击关闭跳过按钮触发 onClose 回调", async () => {
        const onClose = vi.fn();
        const { getByLabelText } = render(ReviewErrorTagBar, {
            props: {
                open: true,
                t: mockT,
                onTagError: vi.fn(),
                onClose,
            },
        });

        const closeBtn = getByLabelText("跳过");
        await fireEvent.click(closeBtn);
        expect(onClose).toHaveBeenCalled();
    });
});
