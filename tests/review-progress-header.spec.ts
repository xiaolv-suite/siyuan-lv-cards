import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewProgressHeader from "@/ui/review/ReviewProgressHeader.svelte";

describe("ReviewProgressHeader 复习顶栏元信息与进度条组件", () => {
    afterEach(() => {
        cleanup();
    });

    const mockT = {
        review: {
            returnHome: "返回主页",
            budgetLabel: "会话总倒计时",
            budgetDone: "时间到",
            budgetDoneTip: "已达会话预算目标",
            requeueChip: "重考",
            requeueTip: "由于评分较低，本次会话内已自动重新入队",
            tagNew: "新卡",
            reps: "复习",
            lapses: "遗忘",
            leechChip: "易混淆",
            leechTip: "已遗忘 ${n} 次，建议拆解知识点",
            issueChip: "格式问题",
            issueMarked: "已标记格式问题",
        },
        entry: {
            title: "来源",
            return: "返回",
            dismiss: "关闭",
            kind: {
                doc: "文档",
                query: "搜索",
            },
        },
        exam: {
            cramOn: "冲刺模式",
        },
        cardTypeBadgeOcclusion: "遮挡",
        cardTypeBadgeSuperBlock: "超级块",
        cardTypeBadgeCode: "代码",
        cardTypeBadgeOutlineCloze: "大纲挖空",
        cardTypeBadgeCloze: "挖空",
        cardTypeBadgePlugin: "插件答",
        cardTypeBadgeMemo: "备注答",
        cardTypeBadgeQA: "问答",
        cardTypeBadgeNative: "原生闪卡",
    };

    it("正确渲染标题、范围标签并支持点击返回主页", async () => {
        const onOpenDashboard = vi.fn();
        const { getByText, getByTestId } = render(ReviewProgressHeader, {
            props: {
                headScopeLabel: "全库总复习",
                t: mockT,
                onOpenDashboard,
            },
        });

        expect(getByText("REVIEW / 全库总复习")).toBeTruthy();
        const homeBtn = getByTestId("review-return-home-btn");
        await fireEvent.click(homeBtn);
        expect(onOpenDashboard).toHaveBeenCalledTimes(1);
    });

    it("渲染入口上下文条并支持返回与关闭", async () => {
        const onReturnToEntry = vi.fn();
        const onDismissEntry = vi.fn();
        const { getByTestId } = render(ReviewProgressHeader, {
            props: {
                entryCtx: {
                    entryKind: "doc",
                    sourceID: "doc-123",
                    returnPoint: { tab: "editor" },
                },
                t: mockT,
                onReturnToEntry,
                onDismissEntry,
            },
        });

        expect(getByTestId("review-entry-ctx")).toBeTruthy();

        const returnBtn = getByTestId("review-return-entry-btn");
        await fireEvent.click(returnBtn);
        expect(onReturnToEntry).toHaveBeenCalledWith({ tab: "editor" });

        const dismissBtn = getByTestId("review-dismiss-entry-btn");
        await fireEvent.click(dismissBtn);
        expect(onDismissEntry).toHaveBeenCalledWith("doc", "doc-123");
    });

    it("正确响应各类辅助标签（冲刺模式、预算倒计时与到点、重考标记、卡片限时与预警）", () => {
        const { getByTestId, getByText } = render(ReviewProgressHeader, {
            props: {
                cramActive: true,
                budgetMin: 30,
                budgetExpired: false,
                budgetClockText: "14:59",
                current: { lvRequeue: true, state: 0, reps: 0, lapses: 0 },
                timeoutMode: "reveal",
                timeoutLeft: 8,
                timeoutText: "08s",
                showAnswer: false,
                t: mockT,
            },
        });

        expect(getByTestId("review-cram-chip")).toBeTruthy();
        expect(getByText(/突击快刷模式|冲刺模式/)).toBeTruthy();

        expect(getByTestId("review-budget-chip")).toBeTruthy();
        expect(getByText("14:59")).toBeTruthy();

        expect(getByTestId("review-requeue-chip")).toBeTruthy();
        expect(getByText("重考")).toBeTruthy();

        const timeoutChip = getByTestId("review-card-timeout-chip");
        expect(timeoutChip).toBeTruthy();
        expect(timeoutChip.classList.contains("lv-timeout-low")).toBe(true);
        expect(getByText("08s")).toBeTruthy();
    });

    it("卡片元信息与各种类型徽章的准确匹配（新卡、易混淆、挖空、问答、代码等）", () => {
        const { getByTestId, getByText, rerender } = render(ReviewProgressHeader, {
            props: {
                current: { state: 0, reps: 1, lapses: 5 },
                leechThreshold: 4,
                cardHtml: '<div><span data-type="mark">核心术语</span></div>',
                isMarkedIssue: true,
                t: mockT,
            },
        });

        expect(getByTestId("review-tag-new")).toBeTruthy();
        expect(getByTestId("review-tag-leech")).toBeTruthy();
        expect(getByTestId("review-tag-issue")).toBeTruthy();
        expect(getByText("挖空")).toBeTruthy();

        // 切换为遮挡卡
        rerender({
            current: { state: 1, reps: 3, lapses: 0 },
            occl: { rects: [] },
            cardHtml: "",
            t: mockT,
        });
        expect(getByText("遮挡")).toBeTruthy();

        // 切换为问答卡
        rerender({
            current: { state: 1, reps: 3, lapses: 0 },
            occl: null,
            cardHtml: "<p>核心概念 :: 这是释义内容</p>",
            t: mockT,
        });
        expect(getByText("问答")).toBeTruthy();
    });

    it("进度条段宽与计数格式正确反映遗忘与正常通过比例", () => {
        const { getByTestId } = render(ReviewProgressHeader, {
            props: {
                currentProgress: 6,
                reviewedCount: 5,
                totalCount: 20,
                sessionForget: 2,
                t: mockT,
            },
        });

        const progressText = getByTestId("review-progress-text");
        expect(progressText.textContent).toBe("6 / 20");

        const progressBar = getByTestId("review-progress-bar");
        const forgetSeg = progressBar.querySelector(".lv-progress-seg--forget") as HTMLElement;
        const passSeg = progressBar.querySelectorAll(".lv-progress-seg")[1] as HTMLElement;

        // 2/20 = 10%
        expect(forgetSeg.style.width).toBe("10%");
        // (5-2)/20 = 15%
        expect(passSeg.style.width).toBe("15%");
    });
});
