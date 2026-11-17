import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewCardBody from "@/ui/review/ReviewCardBody.svelte";

describe("ReviewCardBody 卡面正文渲染与题型呈现组件", () => {
    afterEach(() => {
        cleanup();
    });

    const mockT = {
        dashboard: {
            refresh: "刷新",
            loading: "加载中...",
        },
        aiFace: {
            scrollHint: "可横向滚动查看完整内容",
        },
    };

    it("加载失败状态展示错误提示与重试按钮", async () => {
        const onRetryFace = vi.fn();
        const { getByTestId, getByText } = render(ReviewCardBody, {
            props: {
                cardHtml: "",
                faceError: "网络连接失败",
                t: mockT,
                onRetryFace,
            },
        });

        expect(getByTestId("review-face-error")).toBeTruthy();
        expect(getByText("网络连接失败")).toBeTruthy();

        const retryBtn = getByTestId("review-retry-face-btn");
        await fireEvent.click(retryBtn);
        expect(onRetryFace).toHaveBeenCalledTimes(1);
    });

    it("空卡面且无错误时展示加载中状态", () => {
        const { getByTestId, getByText } = render(ReviewCardBody, {
            props: {
                cardHtml: "",
                faceError: "",
                t: mockT,
            },
        });

        expect(getByTestId("review-face-loading")).toBeTruthy();
        expect(getByText("加载中...")).toBeTruthy();
    });

    it("正常渲染卡面正文内容并响应单击与双击交互", async () => {
        const onCardContentClick = vi.fn();
        const onCardContentDblClick = vi.fn();

        const { getByTestId, getByText, rerender } = render(ReviewCardBody, {
            props: {
                cardHtml: "<p>闪卡完整内容答案</p>",
                maskedCardHtml: "<p>闪卡[__]内容答案</p>",
                showAnswer: false,
                t: mockT,
                onCardContentClick,
                onCardContentDblClick,
            },
        });

        const content = getByTestId("review-card-content");
        expect(content.classList.contains("lv-masked")).toBe(true);
        expect(getByText("闪卡[__]内容答案")).toBeTruthy();

        await fireEvent.click(content);
        expect(onCardContentClick).toHaveBeenCalledTimes(1);

        await fireEvent.dblClick(content);
        expect(onCardContentDblClick).toHaveBeenCalledTimes(1);

        // 翻面到答案态
        rerender({
            cardHtml: "<p>闪卡完整内容答案</p>",
            maskedCardHtml: "<p>闪卡[__]内容答案</p>",
            showAnswer: true,
            t: mockT,
        });

        expect(content.classList.contains("lv-masked")).toBe(false);
        expect(getByText("闪卡完整内容答案")).toBeTruthy();
    });

    it("展示富内容提示徽章", () => {
        const { getByTestId, getByText } = render(ReviewCardBody, {
            props: {
                cardHtml: "<p>复杂公式与表格内容</p>",
                faceHints: ["table", "math"],
                faceHintText: (k) => (k === "table" ? "包含表格" : "包含公式"),
                t: mockT,
            },
        });

        expect(getByTestId("review-face-hints")).toBeTruthy();
        expect(getByText("包含表格")).toBeTruthy();
        expect(getByText("包含公式")).toBeTruthy();
        expect(getByText("可横向滚动查看完整内容")).toBeTruthy();
    });
});
