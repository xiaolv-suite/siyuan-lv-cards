import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewZenIsland from "@/ui/review/ReviewZenIsland.svelte";

describe("ReviewZenIsland 专注模式悬浮岛组件", () => {
    afterEach(() => {
        cleanup();
    });

    const defaultProps = {
        t: {
            review: {
                tbMemo: "助记便签",
            },
        },
        isStarred: false,
        disabled: false,
        onAdjustFontScale: vi.fn(),
        onToggleStar: vi.fn(),
        onOpenMemo: vi.fn(),
        onExitZen: vi.fn(),
    };

    it("正确渲染字号、星标、便签与退出按钮", () => {
        const { getByText, getByTitle, getByLabelText } = render(ReviewZenIsland, { props: defaultProps });

        expect(getByTitle("缩小卡面字号")).toBeTruthy();
        expect(getByTitle("放大卡面字号")).toBeTruthy();
        expect(getByLabelText("星标重点")).toBeTruthy();
        expect(getByLabelText("助记便签")).toBeTruthy();
        expect(getByText("退出专注 (z)")).toBeTruthy();
    });

    it("点击字号按钮触发 onAdjustFontScale 回调", async () => {
        const onAdjustFontScale = vi.fn();
        const { getByTitle } = render(ReviewZenIsland, {
            props: { ...defaultProps, onAdjustFontScale },
        });

        await fireEvent.click(getByTitle("缩小卡面字号"));
        expect(onAdjustFontScale).toHaveBeenCalledWith(-0.1);

        await fireEvent.click(getByTitle("放大卡面字号"));
        expect(onAdjustFontScale).toHaveBeenCalledWith(0.1);
    });

    it("星标状态高亮与点击触发 onToggleStar", async () => {
        const onToggleStar = vi.fn();
        const { getByLabelText } = render(ReviewZenIsland, {
            props: { ...defaultProps, isStarred: true, onToggleStar },
        });

        const starBtn = getByLabelText("星标重点");
        expect(starBtn.classList.contains("lv-zen-starred")).toBe(true);

        await fireEvent.click(starBtn);
        expect(onToggleStar).toHaveBeenCalled();
    });

    it("点击退出专注触发 onExitZen", async () => {
        const onExitZen = vi.fn();
        const { getByText } = render(ReviewZenIsland, {
            props: { ...defaultProps, onExitZen },
        });

        await fireEvent.click(getByText("退出专注 (z)"));
        expect(onExitZen).toHaveBeenCalled();
    });
});
