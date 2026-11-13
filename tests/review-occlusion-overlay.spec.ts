import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewOcclusionOverlay from "@/ui/review/ReviewOcclusionOverlay.svelte";
import type { OcclusionData } from "@/core/occlusion";

describe("ReviewOcclusionOverlay 图片遮挡交互蒙版组件", () => {
    afterEach(() => {
        cleanup();
    });

    const mockOccl: OcclusionData = {
        imageWidth: 800,
        imageHeight: 600,
        rects: [
            { x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
            { x: 0.4, y: 0.3, w: 0.3, h: 0.15 },
        ],
    };

    const mockBox = { l: 20, t: 50, w: 400, h: 300 };

    it("当 occl 或 occlBox 为空时不渲染遮罩", () => {
        const { container: c1 } = render(ReviewOcclusionOverlay, {
            props: { occl: null, occlBox: mockBox },
        });
        expect(c1.querySelector(".lv-occl-overlay")).toBeNull();

        const { container: c2 } = render(ReviewOcclusionOverlay, {
            props: { occl: mockOccl, occlBox: null },
        });
        expect(c2.querySelector(".lv-occl-overlay")).toBeNull();
    });

    it("正常渲染 SVG 蒙版与遮挡矩形，并应用定位和包围盒属性", () => {
        const { getByTestId } = render(ReviewOcclusionOverlay, {
            props: {
                occl: mockOccl,
                occlBox: mockBox,
                showAnswer: false,
            },
        });

        const svg = getByTestId("review-occl-overlay");
        expect(svg).toBeTruthy();
        expect(svg.getAttribute("style")).toMatch(/left:\s*20px/);
        expect(svg.getAttribute("style")).toMatch(/top:\s*50px/);
        expect(svg.getAttribute("style")).toMatch(/width:\s*400px/);
        expect(svg.getAttribute("style")).toMatch(/height:\s*300px/);

        const rect0 = getByTestId("review-occl-rect-0");
        const rect1 = getByTestId("review-occl-rect-1");
        expect(rect0).toBeTruthy();
        expect(rect1).toBeTruthy();

        // x: 0.1 -> 10, y: 0.1 -> 10, w: 0.2 -> 20, h: 0.1 -> 10
        expect(rect0.getAttribute("x")).toBe("10");
        expect(rect0.getAttribute("y")).toBe("10");
        expect(rect0.getAttribute("width")).toBe("20");
        expect(rect0.getAttribute("height")).toBe("10");
        expect(rect0.getAttribute("opacity")).toBe("1");
    });

    it("问题态下点击矩形逐框翻开与遮回，并触发回调", async () => {
        const onToggleRect = vi.fn();
        let hidden: number[] = [];

        const { getByTestId } = render(ReviewOcclusionOverlay, {
            props: {
                occl: mockOccl,
                occlBox: mockBox,
                occlHidden: hidden,
                showAnswer: false,
                onToggleRect,
            },
        });

        const rect0 = getByTestId("review-occl-rect-0");
        expect(rect0.getAttribute("opacity")).toBe("1");

        // 第一次点击：翻开第 0 块
        await fireEvent.click(rect0);
        expect(onToggleRect).toHaveBeenCalledWith(0);
        expect(rect0.getAttribute("opacity")).toBe("0.05");

        // 第二次点击：重新盖上第 0 块
        await fireEvent.click(rect0);
        expect(onToggleRect).toHaveBeenCalledTimes(2);
        expect(rect0.getAttribute("opacity")).toBe("1");
    });

    it("答案态下所有遮挡框全显为半透明且不可交互", async () => {
        const onToggleRect = vi.fn();
        const { getByTestId } = render(ReviewOcclusionOverlay, {
            props: {
                occl: mockOccl,
                occlBox: mockBox,
                showAnswer: true,
                onToggleRect,
            },
        });

        const rect0 = getByTestId("review-occl-rect-0");
        const rect1 = getByTestId("review-occl-rect-1");

        // 答案态透明度应为 0.12
        expect(rect0.getAttribute("opacity")).toBe("0.12");
        expect(rect1.getAttribute("opacity")).toBe("0.12");

        // 点击不应触发切换
        await fireEvent.click(rect0);
        expect(onToggleRect).not.toHaveBeenCalled();
    });

    it("支持无障碍属性并在问题态下响应键盘 Enter/Space 键触发翻开", async () => {
        const onToggleRect = vi.fn();
        const { getByTestId } = render(ReviewOcclusionOverlay, {
            props: {
                occl: mockOccl,
                occlBox: mockBox,
                showAnswer: false,
                onToggleRect,
            },
        });

        const rect0 = getByTestId("review-occl-rect-0");
        expect(rect0.getAttribute("role")).toBe("button");
        expect(rect0.getAttribute("tabindex")).toBe("0");
        expect(rect0.getAttribute("aria-label")).toBe("遮挡框 1");

        await fireEvent.keyDown(rect0, { key: "Enter" });
        expect(onToggleRect).toHaveBeenCalledWith(0);

        await fireEvent.keyDown(rect0, { key: " " });
        expect(onToggleRect).toHaveBeenCalledTimes(2);
    });
});
