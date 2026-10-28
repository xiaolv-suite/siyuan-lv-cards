import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewToolbar from "@/ui/review/ReviewToolbar.svelte";

describe("ReviewToolbar 复习顶栏与更多命令气泡组件", () => {
    afterEach(() => {
        cleanup();
    });

    const mockT = {
        review: {
            scopeTitle: "复习范围",
            scopeAll: "全部卡片",
            scopeNew: "仅新卡",
            scopeOld: "仅旧卡",
            purposeTitle: "会话目的",
            purposeFormal: "正式复习",
            purposeInformal: "随性自测",
            fontScaleTitle: "调整卡面字号",
            sessionOptionsTitle: "本场偏好",
            tbMarkIssue: "标记疑问",
            issueChip: "待修",
            issueMarked: "已标记疑问",
            pauseTitle: "暂停",
            tbPause: "暂停",
            undoTitle: "撤销",
            tbUndo: "撤销",
            skip: "跳过",
            tbMore: "更多",
            tbMoreDesc: "更多动作",
            openInEditor: "在编辑器中打开",
            helpTitle: "快捷键帮助",
            tbHelp: "快捷键帮助",
            tbDismiss: "解散归档 (Ctrl+D)",
        },
        dashboard: {
            decks: "卡组",
        },
        purpose: {
            review: { name: "复习", end: "完成" },
        },
    };

    it("正常渲染范围选择、字号调整、暂停、撤销与跳过按钮", () => {
        const { getByText, getByTitle } = render(ReviewToolbar, {
            props: {
                scopeKey: "all",
                purpose: "review" as any,
                decks: [],
                notebooks: [],
                current: { cardID: "c1", blockID: "b1" },
                t: mockT,
                onScopeChange: vi.fn(),
                onAdjustFontScale: vi.fn(),
                onOpenSessionOptions: vi.fn(),
                onToggleStar: vi.fn(),
                onToggleMarkIssue: vi.fn(),
                onPause: vi.fn(),
                onUndo: vi.fn(),
                onSkip: vi.fn(),
                onToggleContext: vi.fn(),
                onTogglePrefs: vi.fn(),
                onTogglePeek: vi.fn(),
                onOpenInEditor: vi.fn(),
                onRefreshCard: vi.fn(),
                onSuspendToday: vi.fn(),
                onOpenMemoEditor: vi.fn(),
                onDismissCard: vi.fn(),
                onOpenRetireModal: vi.fn(),
                onOpenHelp: vi.fn(),
            },
        });

        expect(getByText("全部卡片")).toBeTruthy();
        expect(getByTitle("缩小卡面字号")).toBeTruthy();
        expect(getByTitle("放大卡面字号")).toBeTruthy();
        expect(getByTitle("暂停")).toBeTruthy();
    });

    it("点击跳过按钮触发 onSkip 回调", async () => {
        const onSkip = vi.fn();
        const { getByText } = render(ReviewToolbar, {
            props: {
                scopeKey: "all",
                current: { cardID: "c1" },
                t: mockT,
                onScopeChange: vi.fn(),
                onAdjustFontScale: vi.fn(),
                onOpenSessionOptions: vi.fn(),
                onToggleStar: vi.fn(),
                onToggleMarkIssue: vi.fn(),
                onPause: vi.fn(),
                onUndo: vi.fn(),
                onSkip,
                onToggleContext: vi.fn(),
                onTogglePrefs: vi.fn(),
                onTogglePeek: vi.fn(),
                onOpenInEditor: vi.fn(),
                onRefreshCard: vi.fn(),
                onSuspendToday: vi.fn(),
                onOpenMemoEditor: vi.fn(),
                onDismissCard: vi.fn(),
                onOpenRetireModal: vi.fn(),
                onOpenHelp: vi.fn(),
            },
        });

        const skipBtn = getByText("跳过");
        await fireEvent.click(skipBtn);
        expect(onSkip).toHaveBeenCalled();
    });

    it("点击更多动作展开折叠菜单并能触发子动作", async () => {
        const onOpenInEditor = vi.fn();
        const { getByText } = render(ReviewToolbar, {
            props: {
                scopeKey: "all",
                current: { cardID: "c1" },
                t: mockT,
                onScopeChange: vi.fn(),
                onAdjustFontScale: vi.fn(),
                onOpenSessionOptions: vi.fn(),
                onToggleStar: vi.fn(),
                onToggleMarkIssue: vi.fn(),
                onPause: vi.fn(),
                onUndo: vi.fn(),
                onSkip: vi.fn(),
                onToggleContext: vi.fn(),
                onTogglePrefs: vi.fn(),
                onTogglePeek: vi.fn(),
                onOpenInEditor,
                onRefreshCard: vi.fn(),
                onSuspendToday: vi.fn(),
                onOpenMemoEditor: vi.fn(),
                onDismissCard: vi.fn(),
                onOpenRetireModal: vi.fn(),
                onOpenHelp: vi.fn(),
            },
        });

        const moreBtn = getByText(/更多/);
        await fireEvent.click(moreBtn);

        const editItem = getByText("在编辑器中打开");
        expect(editItem).toBeTruthy();
        await fireEvent.click(editItem);
        expect(onOpenInEditor).toHaveBeenCalled();
    });
});
