import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewCardBreadcrumbs from "@/ui/review/ReviewCardBreadcrumbs.svelte";

describe("ReviewCardBreadcrumbs 卡面来源文档层级面包屑组件", () => {
    afterEach(() => {
        cleanup();
    });

    const mockT = {
        review: {
            breadcrumbHint: "点击查阅来源文档上下文",
            breadcrumbShowParent: "显示完整父路径",
            breadcrumbHideParent: "隐藏父路径（仅保留末级文档）",
        },
    };

    const mockBreadcrumbs = {
        cardId: "card-1",
        isTruncated: false,
        formattedText: "笔记本 / 章节 / 末级文档",
        nodes: [
            { displayTitle: "笔记本", fullTitle: "笔记本", targetId: "nb-1" },
            { displayTitle: "章节", fullTitle: "章节", targetId: "doc-1" },
            { displayTitle: "末级文档", fullTitle: "末级文档", targetId: "doc-2" },
        ],
    };

    it("完整渲染多层级面包屑并响应上下文点击", async () => {
        const onToggleContext = vi.fn();
        const { getByText, getByTestId } = render(ReviewCardBreadcrumbs, {
            props: {
                breadcrumbs: mockBreadcrumbs,
                hideParentPath: false,
                t: mockT,
                onToggleContext,
            },
        });

        expect(getByText("笔记本")).toBeTruthy();
        expect(getByText("章节")).toBeTruthy();
        expect(getByText("末级文档")).toBeTruthy();

        const btn = getByTestId("review-breadcrumbs-btn");
        await fireEvent.click(btn);
        expect(onToggleContext).toHaveBeenCalledTimes(1);
    });

    it("折叠父路径时仅显示末级文档，并支持点击折叠切换", async () => {
        const onToggleParentPath = vi.fn();
        const { queryByText, getByText, getByTitle } = render(ReviewCardBreadcrumbs, {
            props: {
                breadcrumbs: mockBreadcrumbs,
                hideParentPath: true,
                t: mockT,
                onToggleParentPath,
            },
        });

        expect(queryByText("笔记本")).toBeNull();
        expect(queryByText("章节")).toBeNull();
        expect(getByText("末级文档")).toBeTruthy();

        const toggleBtn = getByTitle("显示完整父路径");
        await fireEvent.click(toggleBtn);
        expect(onToggleParentPath).toHaveBeenCalledTimes(1);
    });

    it("仅传入纯 hpath 时优雅回退显示", async () => {
        const onToggleContext = vi.fn();
        const { getByText } = render(ReviewCardBreadcrumbs, {
            props: {
                breadcrumbs: null,
                hpath: "/简单笔记本/单页文档",
                t: mockT,
                onToggleContext,
            },
        });

        const btn = getByText("/简单笔记本/单页文档");
        expect(btn).toBeTruthy();
        await fireEvent.click(btn);
        expect(onToggleContext).toHaveBeenCalledTimes(1);
    });
});
