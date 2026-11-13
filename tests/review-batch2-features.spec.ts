import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import Review from "../src/ui/review.svelte";
import { openTab } from "siyuan";

vi.mock("svelte/transition", () => ({ fade: () => ({ duration: 0, css: () => "" }) }));

const { getRiffDueCards, getRiffDecks, batchSetRiffCardsDueTime, reviewRiffCard, skipReviewRiffCard, getNotebooks, getBlockAttrs, getBlockDOM, setBlockAttrs, sqlQuery } = vi.hoisted(() => ({
    getRiffDueCards: vi.fn(),
    getRiffDecks: vi.fn(),
    batchSetRiffCardsDueTime: vi.fn(),
    reviewRiffCard: vi.fn(),
    skipReviewRiffCard: vi.fn(),
    getNotebooks: vi.fn(),
    getBlockAttrs: vi.fn(),
    getBlockDOM: vi.fn(),
    setBlockAttrs: vi.fn().mockResolvedValue(undefined),
    sqlQuery: vi.fn().mockImplementation(async (stmt: string) => {
        if (stmt.includes("hpath")) return [{ hpath: "/notebook/chapter/doc" }];
        if (stmt.includes("markdown FROM blocks")) {
            return [
                { id: "block-a", markdown: "block-a question ==block-a answer==" },
                { id: "block-b", markdown: "block-b question ==block-b answer==" },
            ];
        }
        return [];
    }),
}));

vi.mock("@/api/riff", () => ({
    getRiffDueCards,
    getRiffDueCardsForScope: vi.fn(async (scope, rev) => getRiffDueCards(scope.startsWith("deck:") ? scope.slice(5) : "", rev)),
    getRiffDecks,
    batchSetRiffCardsDueTime,
    reviewRiffCard,
    skipReviewRiffCard,
}));
vi.mock("@/api/siyuan", () => ({ getNotebooks, getBlockAttrs, getBlockDOM, setBlockAttrs, sqlQuery }));
vi.mock("@/api/due-shared", () => ({ dueCache: { get: vi.fn().mockResolvedValue({ unreviewedCount: 0 }) }, invalidateDueCache: vi.fn() }));
vi.mock("siyuan", () => ({ openTab: vi.fn(), showMessage: vi.fn() }));

const cardA = { deckID: "deck-a", cardID: "card-a", blockID: "block-a", lapses: 0, reps: 0, state: 2, lastReview: 0, nextDues: {} };

function message(path: string): any {
    const fn = () => path;
    return new Proxy(fn, {
        get(_target, property) {
            if (property === "replace") return (search: string, replacement: string) => path.replace(search, replacement);
            if (property === "toString" || property === "valueOf" || property === Symbol.toPrimitive) return () => path;
            if (property === "then") return undefined;
            return message(`${path}.${String(property)}`);
        },
        apply: () => path,
    });
}

const mockSettings = (overrides = {}) => ({
    ratingStyle: "four" as const,
    ratingKeyScheme: "both" as const,
    timeoutMode: "off" as const,
    timeoutSeconds: 60,
    randomOrder: false,
    cardMaxWidth: 720,
    typingEnabled: false,
    typingStrict: false,
    choiceEnabled: false,
    mixedRotation: false,
    ttsEnabled: false,
    ttsRate: 1,
    ttsVoice: "",
    batchLimit: 0,
    dictationEnabled: false,
    requeueAgain: true,
    dailyReviewTarget: 1,
    cardFontScale: 1,
    ratingDensity: "cozy" as const,
    sfxEnabled: false,
    sfxStyle: "chime" as const,
    hideMetaUntilAnswer: false,
    reverseOrder: false,
    answerTimeCapSec: 60,
    burySiblings: false,
    dailyTipEnabled: false,
    ...overrides,
});

const mountReview = (settingsOverride = {}) => {
    Object.defineProperty(window, "siyuan", {
        configurable: true,
        value: { languages: { confirm: "Confirm", cancel: "Cancel" } },
    });
    return render(Review, {
        ctx: {
            i18n: message("t"),
            app: {},
            settings: () => mockSettings(settingsOverride),
            appendRevlog: vi.fn(),
            getRevlog: () => ({ version: 1, entries: [], days: {} }),
            isSuspendedToday: () => false,
            suspendToday: vi.fn(),
            openDashboard: vi.fn(),
            onScopePersist: vi.fn(),
            getSessionState: () => null,
            saveSessionState: vi.fn(),
            clearSessionState: vi.fn(),
            emitSessionFinished: vi.fn(),
            getContextBlocks: async () => [],
            tagErrorReason: vi.fn(),
        } as any,
    });
};

describe("Batch 2: Review core & keyboard enhancements", () => {
    beforeEach(() => {
        Object.defineProperty(window, "siyuan", {
            configurable: true,
            value: { languages: { confirm: "Confirm", cancel: "Cancel" } },
        });
        getRiffDueCards.mockReset().mockResolvedValue({ cards: [cardA], unreviewedCount: 1 });
        getRiffDecks.mockReset().mockResolvedValue([{ id: "deck-a", name: "Deck A" }]);
        batchSetRiffCardsDueTime.mockReset().mockResolvedValue(undefined);
        reviewRiffCard.mockReset().mockResolvedValue(undefined);
        skipReviewRiffCard.mockReset().mockResolvedValue(undefined);
        getNotebooks.mockReset().mockResolvedValue([{ id: "nb-a", name: "Notebook A" }]);
        getBlockAttrs.mockReset().mockResolvedValue({});
        getBlockDOM.mockReset().mockImplementation(async (id: string) => `<p>${id} body</p>`);
        sqlQuery.mockReset().mockImplementation(async (stmt: string) => {
            if (stmt.includes("hpath")) return [{ hpath: "/notebook/chapter/doc" }];
            if (stmt.includes("markdown FROM blocks")) {
                return [
                    { id: "block-a", markdown: "block-a question ==block-a answer==" },
                ];
            }
            return [];
        });
    });

    afterEach(() => {
        cleanup();
    });

    it("CF-03: 按 O 键跳原笔记时挂起答题秒表并在返回时恢复", async () => {
        const view = mountReview();
        await screen.findByText("block-a body");

        // 按 O 键触发打开原笔记
        await fireEvent.keyDown(window, { key: "o" });
        expect(openTab).toHaveBeenCalledWith(expect.objectContaining({
            doc: expect.objectContaining({ id: "block-a", zoomIn: true }),
        }));

        // 挂起状态出现
        expect(view.container.querySelector(".lv-stopwatch-suspended-badge")).toBeTruthy();

        // 模拟返回闪卡（window focus）
        await fireEvent.focus(window);
        expect(view.container.querySelector(".lv-stopwatch-suspended-badge")).toBeNull();
    });

    it("CF-10: 未翻面时支持长按/快捷键临时透视答案", async () => {
        const view = mountReview();
        await screen.findByText("block-a body");

        // 初始为问题态，答案未揭晓
        expect(view.container.querySelector(".lv-peeking-banner")).toBeNull();
        expect(view.container.querySelector(".lv-btn-rate")).toBeNull();

        // 触发临时透视（长按 H 或 Alt+H）
        await fireEvent.keyDown(window, { key: "h", altKey: true });
        expect(view.container.querySelector(".lv-peeking-banner")).toBeTruthy();

        // 松开按键恢复遮挡，仍处于问题态
        await fireEvent.keyUp(window, { key: "h" });
        expect(view.container.querySelector(".lv-peeking-banner")).toBeNull();
        expect(view.container.querySelector(".lv-btn-rate")).toBeNull();
    });

    it("CF-11: 复习评分达到每日目标时触发彩带微动效", async () => {
        const view = mountReview({ dailyReviewTarget: 1 });
        await screen.findByText("block-a body");

        // 翻面
        await fireEvent.keyDown(window, { key: " ", code: "Space" });
        expect(view.container.querySelector(".lv-btn-rate")).toBeTruthy();
        await new Promise((r) => setTimeout(r, 200));

        // 评分 3（良好），正好达成 dailyReviewTarget = 1
        await fireEvent.keyDown(window, { key: "3" });

        // 目标达成庆祝动效触发
        expect(view.container.querySelector(".lv-target-celebration")).toBeTruthy();
    });

    it("CF-18: 支持主键区人体工学按键 (J/K/L/;) 直接评分", async () => {
        const view = mountReview({ ratingKeyScheme: "both" });
        await screen.findByText("block-a body");

        // 翻面
        await fireEvent.keyDown(window, { key: " ", code: "Space" });
        expect(view.container.querySelector(".lv-btn-rate")).toBeTruthy();
        await new Promise((r) => setTimeout(r, 200));

        // 按 L 键（对标评分 3 良好）
        await fireEvent.keyDown(window, { key: "l" });
        expect(reviewRiffCard).toHaveBeenCalledWith("deck-a", "card-a", 3, expect.any(Array));
    });
});
