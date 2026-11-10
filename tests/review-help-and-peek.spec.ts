import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewHelpAndPeek from "@/ui/review/ReviewHelpAndPeek.svelte";

describe("ReviewHelpAndPeek 快捷键帮助与回看浮层组件", () => {
    afterEach(() => {
        cleanup();
    });

    const mockT = {
        review: {
            helpTitle: "快捷键帮助",
            helpFlipRate: "翻面 / 默认评分",
            helpRevealAll: "全部揭晓",
            helpReverse: "翻转问答自测",
            helpUndo: "撤销上一张评分",
            helpSkip: "跳过此卡",
            helpSuspend: "今日暂停",
            tbMemo: "助记便签",
            helpPeek: "回看上一张",
            helpReschedule: "快速改期",
            helpEdit: "打开思源原生编辑器",
            helpHint: "推进分级提示",
            peekTitle: "回看上一张卡片",
        },
    };

    it("正确渲染快捷键帮助浮层并点击关闭", async () => {
        const onCloseHelp = vi.fn();
        const { getByText, getByRole } = render(ReviewHelpAndPeek, {
            props: {
                helpOpen: true,
                peek: null,
                t: mockT,
                onCloseHelp,
                onClosePeek: vi.fn(),
            },
        });

        expect(getByText("快捷键帮助")).toBeTruthy();
        expect(getByText("Space / Enter")).toBeTruthy();
        expect(getByText("翻面 / 默认评分")).toBeTruthy();
        expect(getByText("打开思源原生编辑器")).toBeTruthy();

        const closeBtn = getByRole("button", { name: "取消" });
        await fireEvent.click(closeBtn);
        expect(onCloseHelp).toHaveBeenCalled();
    });

    it("正确渲染回看浮层并点击关闭", async () => {
        const onClosePeek = vi.fn();
        const mockPeek = {
            html: "<div>牛顿第二定律 <mark>F=ma</mark></div>",
            revealed: true,
        };

        const { getByText, getByRole } = render(ReviewHelpAndPeek, {
            props: {
                helpOpen: false,
                peek: mockPeek,
                t: mockT,
                onCloseHelp: vi.fn(),
                onClosePeek,
            },
        });

        expect(getByText("回看上一张卡片")).toBeTruthy();
        expect(getByText(/牛顿第二定律/)).toBeTruthy();

        const closeBtn = getByRole("button", { name: "取消" });
        await fireEvent.click(closeBtn);
        expect(onClosePeek).toHaveBeenCalled();
    });
});
