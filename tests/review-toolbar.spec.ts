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
            prefsTitle: "本场偏好",
            tbPrefs: "本场偏好",
            tbMarkIssue: "标记疑问",
            issueChip: "待修",
            issueMarked: "已标记疑问",
            pauseTitle: "暂停",
            tbPause: "暂停本场",
            undoTitle: "撤销",
            tbUndo: "撤销",
            skip: "跳过",
            tbEdit: "编辑",
            tbMore: "更多",
            tbMoreDesc: "更多动作",
            openInEditor: "在编辑器中打开",
            helpTitle: "快捷键帮助",
            tbHelp: "快捷键帮助",
            retireCard: "移出复习…",
        },
        dashboard: {
            decks: "卡组",
        },
        purpose: {
            review: { name: "复习", end: "完成" },
        },
    };

    it("阶段 B 精简顶栏：常驻范围摘要胶囊与撤销、跳过、编辑、星标、更多 5 个高频按钮", async () => {
        const onOpenInEditor = vi.fn();
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
                onOpenMemoEditor: vi.fn(),
                onOpenRetireModal: vi.fn(),
                onOpenHelp: vi.fn(),
            },
        });

        expect(getByText("全部卡片")).toBeTruthy();
        expect(getByText("撤销")).toBeTruthy();
        expect(getByText("跳过")).toBeTruthy();
        const editBtn = getByTitle("在编辑器中打开 (E)");
        expect(editBtn.getAttribute("aria-keyshortcuts")).toBe("e");
        await fireEvent.click(editBtn);
        expect(onOpenInEditor).toHaveBeenCalledOnce();
    });

    it("点击跳过按钮触发 onSkip 回调", async () => {
        const onSkip = vi.fn();
        const { getByText } = render(ReviewToolbar, {
            props: {
                scopeKey: "all",
                current: { cardID: "c1" },
                t: mockT,
                onAdjustFontScale: vi.fn(),
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
                onOpenMemoEditor: vi.fn(),
                onOpenRetireModal: vi.fn(),
                onOpenHelp: vi.fn(),
            },
        });

        const skipBtn = getByText("跳过");
        await fireEvent.click(skipBtn);
        expect(onSkip).toHaveBeenCalled();
    });

    it("点击更多动作展开折叠菜单，包含本场偏好、暂停、移出复习、标记疑问与字号调整", async () => {
        const onPause = vi.fn();
        const onOpenRetireModal = vi.fn();
        const { getByText, getByTitle } = render(ReviewToolbar, {
            props: {
                scopeKey: "all",
                current: { cardID: "c1" },
                t: mockT,
                onAdjustFontScale: vi.fn(),
                onToggleStar: vi.fn(),
                onToggleMarkIssue: vi.fn(),
                onPause,
                onUndo: vi.fn(),
                onSkip: vi.fn(),
                onToggleContext: vi.fn(),
                onTogglePrefs: vi.fn(),
                onTogglePeek: vi.fn(),
                onOpenInEditor: vi.fn(),
                onRefreshCard: vi.fn(),
                onOpenMemoEditor: vi.fn(),
                onOpenRetireModal,
                onOpenHelp: vi.fn(),
            },
        });

        await fireEvent.click(getByText(/更多/));
        expect(getByTitle("缩小卡面字号")).toBeTruthy();
        expect(getByTitle("放大卡面字号")).toBeTruthy();
        expect(getByText("移出复习…")).toBeTruthy();

        await fireEvent.click(getByTitle("暂停"));
        expect(onPause).toHaveBeenCalledOnce();
    });

    it("点击突击快刷按钮触发 onOpenCramModal 回调，并支持突击状态渲染", async () => {
        const onOpenCramModal = vi.fn();
        const { getByTestId, rerender } = render(ReviewToolbar, {
            props: {
                scopeKey: "all",
                current: { cardID: "c1" },
                t: mockT,
                isCramMode: false,
                onOpenCramModal,
                onAdjustFontScale: vi.fn(),
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
                onOpenMemoEditor: vi.fn(),
                onOpenRetireModal: vi.fn(),
                onOpenHelp: vi.fn(),
            },
        });

        const cramBtn = getByTestId("review-tb-cram-btn");
        expect(cramBtn).toBeTruthy();
        expect(cramBtn.textContent).toContain("考前突击快刷");

        await fireEvent.click(cramBtn);
        expect(onOpenCramModal).toHaveBeenCalledOnce();

        // 重新渲染为 isCramMode: true
        rerender({ isCramMode: true });
        expect(cramBtn.classList.contains("lv-cram-btn-active")).toBe(true);
        expect(cramBtn.textContent).toContain("突击中");
    });
});
