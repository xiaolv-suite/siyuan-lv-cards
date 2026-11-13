import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import zh from "../public/i18n/zh-CN.json";
import { defaultSettings } from "../src/core/settings";
import Settings from "../src/ui/settings.svelte";
import Dashboard from "../src/ui/dashboard.svelte";

vi.mock("svelte/transition", () => ({ fade: () => ({ duration: 0, css: () => "" }) }));
vi.mock("siyuan", () => ({ showMessage: vi.fn(), openTab: vi.fn() }));
vi.mock("../src/api/riff", () => ({
    createRiffDeck: vi.fn(),
    getRiffDecks: vi.fn().mockResolvedValue([{ id: "deck-1", name: "Deck 1", size: 10 }]),
    getRiffCards: vi.fn().mockResolvedValue({ blocks: [] }),
    renameRiffDeck: vi.fn(),
    removeRiffDeck: vi.fn(),
}));
vi.mock("../src/api/due-shared", () => ({
    dueCache: { get: vi.fn().mockResolvedValue({ unreviewedCount: 0, cards: [] }) },
    invalidateDueCache: vi.fn(),
}));
vi.mock("../src/api/siyuan", () => ({
    getNotebooks: vi.fn().mockResolvedValue([]),
    sqlQuery: vi.fn().mockResolvedValue([]),
    getBlockDOM: vi.fn(),
    getBlockAttrs: vi.fn(),
}));

function makeSettingsCtx(initialSettings = defaultSettings()) {
    return {
        i18n: zh,
        settings: initialSettings,
        save: vi.fn(),
        close: vi.fn(),
        exportRevlog: vi.fn(),
        clearRevlog: vi.fn(),
        backup: { export: vi.fn(), restore: vi.fn(async () => {}) },
        redetectV2: vi.fn(async () => ""),
        getV2Status: vi.fn(() => ""),
        getSuspendedCount: vi.fn(() => 0),
        restoreAllSuspended: vi.fn(),
        testAnkiClient: vi.fn(async () => ""),
        storageStats: vi.fn(() => []),
        exportSettings: vi.fn(),
        getNotebooks: vi.fn(async () => []),
        exportRevlogCsv: vi.fn(),
        importRevlogCsv: vi.fn(async () => ({ added: 0, skipped: 0 })),
    };
}

describe("Batch 4: Settings search, single-group reset, and calendar action", () => {
    beforeEach(() => {
        Object.defineProperty(window, "siyuan", {
            configurable: true,
            value: { languages: { cancel: "取消" } },
        });
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it("CF-12: 设置中心支持按配置项关键字实时搜索与过滤分组", async () => {
        const ctx = makeSettingsCtx();
        const view = render(Settings, { ctx });

        // 初始所有主要 section 都在
        expect(view.container.querySelector("#sec-studyAnswer")).toBeTruthy();
        expect(view.container.querySelector("#sec-studyVoice")).toBeTruthy();

        const searchInput = screen.getByRole("textbox", { name: /搜索设置/ });
        expect(searchInput).toBeTruthy();

        // 搜索「快捷键」——只命中作答偏好，排除语音与其他分组
        await fireEvent.input(searchInput, { target: { value: "快捷键" } });
        expect(view.container.querySelector("#sec-studyAnswer")).toBeTruthy();
        expect(view.container.querySelector("#sec-studyVoice")).toBeNull();
        expect(screen.getByText(/找到 1 个匹配的设置分组/)).toBeTruthy();

        // 搜索「音效」——命中语音与音效分组
        await fireEvent.input(searchInput, { target: { value: "音效" } });
        expect(view.container.querySelector("#sec-studyVoice")).toBeTruthy();
        expect(view.container.querySelector("#sec-studyRhythm")).toBeNull();

        // 点击清空按钮重置搜索
        const clearBtn = screen.getByRole("button", { name: "清空搜索" });
        await fireEvent.click(clearBtn);
        expect(view.container.querySelector("#sec-studyRhythm")).toBeTruthy();
        expect(view.container.querySelector("#sec-studyVoice")).toBeTruthy();
    });

    it("CF-13: 设置中心支持按单分组一键重置默认值", async () => {
        const customSettings = {
            ...defaultSettings(),
            dailyNewTarget: 99,
            dailyReviewTarget: 888,
            ratingStyle: "three" as const,
        };
        const ctx = makeSettingsCtx(customSettings);
        const view = render(Settings, { ctx });

        // 验证当前自定义值
        const newTargetInput = view.container.querySelector("#sec-studyRhythm input[type='number']") as HTMLInputElement;
        expect(newTargetInput.value).toBe("99");

        // 点击「学习节奏」的「恢复本组默认」按钮
        const rhythmSection = view.container.querySelector("#sec-studyRhythm")!;
        const resetBtn = rhythmSection.querySelector("button[title='恢复学习节奏默认设置']") as HTMLButtonElement;
        expect(resetBtn).toBeTruthy();

        await fireEvent.click(resetBtn);

        // 学习节奏已恢复默认（20 / 200）
        expect(newTargetInput.value).toBe("20");
    });

    it("CF-17: 学习日历支持点击日期直接拉起补卡定向会话卡片", async () => {
        const openReviewScope = vi.fn();
        const ctx = {
            i18n: zh,
            app: {},
            getRevlog: () => ({ version: 1, entries: [], days: {} }),
            settings: () => defaultSettings(),
            getV2Status: () => "",
            getDeepStatsOpen: () => true,
            setDeepStatsOpen: vi.fn(),
            getHeatmapWeeks: () => 17,
            getReviewedDocCount: () => 0,
            getTodayDeckSummaries: () => [],
            calcCoverage: () => ({ reviewedDocs: 0, totalDocs: 0, coveragePct: 0 }),
            getDailyTargets: () => ({ new: 20, review: 50 }),
            openReview: vi.fn(),
            openReviewScope,
            openManager: vi.fn(),
            openManagerDeck: vi.fn(),
            openOnboarding: vi.fn(),
            openQuickCard: vi.fn(),
            openHubTab: vi.fn(),
            getAIBatches: () => [],
            getLeechCards: () => [],
            rewriteWithAI: vi.fn(),
            writeReportDoc: vi.fn(async () => undefined),
            getExamCountdown: () => null,
            getXpEnabled: () => false,
            getSuspendedCount: () => 0,
            isSuspendedToday: () => false,
            restoreSuspendedToday: vi.fn(async () => 0),
            restoreAllSuspended: vi.fn(),
            getDormantCards: () => [],
            getDormantClusters: () => [],
            wakeDormantCluster: vi.fn(),
            wakeDormantCard: vi.fn(),
            getSessionState: () => null,
            openDynamicBoardDoc: vi.fn(),
            onReviewed: () => () => {},
            onSessionFinished: () => () => {},
            getCustomDecks: () => [],
            getLearningTargets: () => ({ new: 20, review: 50 }),
        } as any;

        const view = render(Dashboard, { ctx });

        // 点击日历中的某个日期单元格（找到任意一个按钮日历格）
        const dayBtns = await waitFor(() => {
            const btns = view.container.querySelectorAll(".lv-cal-day:not(.lv-cal-off)");
            if (btns.length === 0) throw new Error("No calendar day buttons");
            return btns;
        });

        await fireEvent.click(dayBtns[0]);

        // 出现日期定向会话操作卡片
        const card = await screen.findByTestId("dashboard-cal-selected-card");
        expect(card).toBeTruthy();

        // 点击「发起复习」
        const reviewBtn = within(card).getByRole("button", { name: "发起复习" });
        await fireEvent.click(reviewBtn);
        expect(openReviewScope).toHaveBeenCalledWith("all");

        // 点击「突击」
        const cramBtn = within(card).getByRole("button", { name: "突击" });
        await fireEvent.click(cramBtn);
        expect(openReviewScope).toHaveBeenCalledWith("all", true);
    });
});
