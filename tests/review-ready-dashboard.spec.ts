import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewReadyDashboard from "@/ui/review/ReviewReadyDashboard.svelte";

describe("ReviewReadyDashboard 复习就绪看板组件", () => {
    afterEach(() => {
        cleanup();
    });

    const mockT = {
        review: {
            readyEmptyTitle: "今日复习任务已轻松搞定",
            readyEmptyDesc: "当前选择的范围内没有到期的卡片。",
            readyHasIssuesTitle: "当前队列暂无可学闪卡",
            readyHasIssuesDesc: "部分卡片存在异常已被隔离保护。",
            scopeTitle: "范围",
            scopeAll: "全部卡片",
            scopeNew: "仅新卡",
            scopeOld: "仅旧卡",
            scopeNotebooks: "笔记本",
            qualityExcluded: "有 ${n} 张卡片存在异常",
            qualityExcludedHelp: "这通常是因为原笔记块被移动或删除。",
            qualityRecheck: "重新检查",
            openMaintenance: "前往维护中心修复",
            readyCramTitle: "自主提前巩固",
            readyCramSubtitle: "提前练习未来卡片",
            readyCramDesc: "按遗忘次数智能排序。",
            startCram: "开启 Cram 提前冲刺",
            readyCreateTitle: "制作与积累新卡",
            readyCreateSubtitle: "将笔记转化为闪卡",
            readyCreateDesc: "支持自由回忆、问答及挖空。",
            createCards: "去制作新卡",
            readyManageTitle: "卡片库浏览与整理",
            readyManageSubtitle: "全面掌控闪卡资产",
            readyManageDesc: "跨卡组检索与健康度管理。",
            returnHome: "返回闪卡主页",
        },
        dashboard: {
            decks: "卡组",
            inbox: "材料收件箱",
            maintenance: "维护中心",
            refresh: "刷新状态",
        },
        menuManager: "闪卡管理器",
    };

    it("正常渲染空队列就绪看板与便当盒功能矩阵", () => {
        const { getByText } = render(ReviewReadyDashboard, {
            props: {
                headScopeLabel: "全部卡片",
                qualityExcludedCardIDs: [],
                scopeKey: "all",
                decks: [{ id: "d1", name: "计算机网络" }],
                notebooks: [],
                t: mockT,
                onScopeChange: vi.fn(),
                onRecheckQualityExcluded: vi.fn(),
                onOpenMaintenance: vi.fn(),
                onStartCram: vi.fn(),
                onScopeNew: vi.fn(),
                onOpenAuthoring: vi.fn(),
                onOpenInbox: vi.fn(),
                onOpenManager: vi.fn(),
                onRefreshQueue: vi.fn(),
                onReturnHome: vi.fn(),
            },
        });

        expect(getByText("今日复习任务已轻松搞定")).toBeTruthy();
        expect(getByText("自主提前巩固")).toBeTruthy();
        expect(getByText("制作与积累新卡")).toBeTruthy();
        expect(getByText("卡片库浏览与整理")).toBeTruthy();
        expect(getByText("返回闪卡主页")).toBeTruthy();
    });

    it("存在隔离异常卡片时展示醒目警示横幅与维护入口", async () => {
        const onOpenMaintenance = vi.fn();
        const { getByText } = render(ReviewReadyDashboard, {
            props: {
                headScopeLabel: "默认",
                qualityExcludedCardIDs: ["card-err-1", "card-err-2"],
                scopeKey: "all",
                t: mockT,
                onScopeChange: vi.fn(),
                onRecheckQualityExcluded: vi.fn(),
                onOpenMaintenance,
                onStartCram: vi.fn(),
                onScopeNew: vi.fn(),
                onOpenAuthoring: vi.fn(),
                onOpenInbox: vi.fn(),
                onOpenManager: vi.fn(),
                onRefreshQueue: vi.fn(),
                onReturnHome: vi.fn(),
            },
        });

        expect(getByText("当前队列暂无可学闪卡")).toBeTruthy();
        expect(getByText("有 2 张卡片存在异常")).toBeTruthy();

        const fixBtn = getByText("前往维护中心修复");
        await fireEvent.click(fixBtn);
        expect(onOpenMaintenance).toHaveBeenCalled();
    });

    it("点击 Cram 提前冲刺与返回主页触发相应回调", async () => {
        const onStartCram = vi.fn();
        const onReturnHome = vi.fn();

        const { getByText } = render(ReviewReadyDashboard, {
            props: {
                headScopeLabel: "全部卡片",
                qualityExcludedCardIDs: [],
                scopeKey: "all",
                t: mockT,
                onScopeChange: vi.fn(),
                onRecheckQualityExcluded: vi.fn(),
                onOpenMaintenance: vi.fn(),
                onStartCram,
                onScopeNew: vi.fn(),
                onOpenAuthoring: vi.fn(),
                onOpenInbox: vi.fn(),
                onOpenManager: vi.fn(),
                onRefreshQueue: vi.fn(),
                onReturnHome,
            },
        });

        const cramBtn = getByText("开启 Cram 提前冲刺");
        await fireEvent.click(cramBtn);
        expect(onStartCram).toHaveBeenCalled();

        const homeBtn = getByText("返回闪卡主页");
        await fireEvent.click(homeBtn);
        expect(onReturnHome).toHaveBeenCalled();
    });
});
