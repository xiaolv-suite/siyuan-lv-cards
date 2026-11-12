import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/svelte";
import Review from "../src/ui/review.svelte";

vi.mock("svelte/transition", () => ({ fade: () => ({ duration: 0, css: () => "" }) }));

const {
    getRiffDueCardsForScope,
    getRiffDecks,
    reviewRiffCard,
    skipReviewRiffCard,
    batchSetRiffCardsDueTime,
    getNotebooks,
    getBlockAttrs,
    getBlockDOM,
    sqlQuery,
    setBlockAttrs,
} = vi.hoisted(() => ({
    getRiffDueCardsForScope: vi.fn(),
    getRiffDecks: vi.fn().mockResolvedValue([]),
    reviewRiffCard: vi.fn(),
    skipReviewRiffCard: vi.fn(),
    batchSetRiffCardsDueTime: vi.fn(),
    getNotebooks: vi.fn().mockResolvedValue([]),
    getBlockAttrs: vi.fn().mockResolvedValue({}),
    getBlockDOM: vi.fn().mockResolvedValue("<p>body</p>"),
    sqlQuery: vi.fn().mockResolvedValue([]),
    setBlockAttrs: vi.fn(),
}));

vi.mock("../src/api/riff", () => ({
    getRiffDueCardsForScope,
    getRiffDecks,
    reviewRiffCard,
    skipReviewRiffCard,
    batchSetRiffCardsDueTime,
}));

vi.mock("../src/api/siyuan", () => ({
    getNotebooks,
    getBlockAttrs,
    getBlockDOM,
    sqlQuery,
    setBlockAttrs,
}));

const cardA = { cardID: "card-a", deckID: "deck-1", blockID: "block-a", due: "20261104000000", reps: 1 };
const cardB = { cardID: "card-b", deckID: "deck-1", blockID: "block-b", due: "20261104000000", reps: 1 };

function message(path: string, dict: Record<string, string>): any {
    const fn = () => dict[path] ?? path;
    return new Proxy(fn, {
        get(_target, property) {
            if (property === "replace") return (search: string, replacement: string) => (dict[path] ?? path).replace(search, replacement);
            if (property === "toString" || property === "valueOf" || property === Symbol.toPrimitive) return () => dict[path] ?? path;
            if (property === "then") return undefined;
            const nextPath = `${path}.${String(property)}`;
            return dict[nextPath] !== undefined ? dict[nextPath] : message(nextPath, dict);
        },
        apply: () => dict[path] ?? path,
    });
}

function makeI18n(): any {
    return message("t", {
        "t.review.skip": "跳过",
        "t.review.tbUndo": "撤销",
        "t.review.tbMore": "更多",
        "t.review.tbMoreDesc": "更多动作",
        "t.review.tbPause": "暂停本场",
        "t.review.pauseTitle": "暂停这场复习",
        "t.review.retireCard": "移出复习…",
        "t.review.retireCardTitle": "将此卡移出复习",
        "t.review.retireCardDesc": "从思源卡组彻底移除并清空内核 FSRS 进度。",
        "t.review.retireCardConfirm": "确认移出",
        "t.review.suspendToday": "今天不学",
        "t.review.undoNone": "没有可撤销的操作",
        "t.review.undoDone": "已撤销",
        "t.review.liveSkipped": "已跳过",
        "t.review.showAnswer": "显示答案",
        "t.common.cancel": "取消",
        "t.common.refresh": "刷新",
    });
}

function mountReview(overrides: Record<string, any> = {}) {
    const suspendToday = vi.fn().mockResolvedValue(undefined);
    const unsuspendToday = vi.fn().mockResolvedValue(undefined);
    const removeFromDeck = vi.fn().mockResolvedValue(undefined);
    const ctx = {
        i18n: makeI18n(),
        app: {},
        settings: () => ({
            ratingStyle: "standard",
            timeoutMode: "none",
            timeoutSeconds: 30,
            randomOrder: false,
            cardMaxWidth: 720,
            choiceEnabled: false,
            mixedRotation: false,
            ttsEnabled: false,
            sfxEnabled: false,
            batchLimit: 0,
            dictationEnabled: false,
            requeueAgain: false,
            dailyReviewTarget: 0,
            cardFontScale: 1,
            ratingDensity: "cozy",
            answerTimeCapSec: 60,
        }),
        appendRevlog: vi.fn(),
        getRevlog: () => ({ version: 1, entries: [], days: {} }),
        isSuspendedToday: () => false,
        suspendToday,
        unsuspendToday,
        removeFromDeck,
        openDashboard: vi.fn(),
        onScopePersist: vi.fn(),
        getSessionState: () => null,
        saveSessionState: vi.fn(),
        clearSessionState: vi.fn(),
        emitSessionFinished: vi.fn(),
        getContextBlocks: async () => [],
        ...overrides,
    };
    const rendered = render(Review, { props: { ctx: ctx as any } });
    return { rendered, ctx, suspendToday, unsuspendToday, removeFromDeck };
}

describe("review-remove-semantics 暂缓/隐藏/移出语义与撤销闭环", () => {
    beforeEach(() => {
        Object.defineProperty(window, "siyuan", {
            configurable: true,
            value: { languages: { confirm: "确认", cancel: "取消" } },
        });
        document.getElementById("lv-notice-host")?.remove();
        delete (window as any).__LV_NOTICE_HUB__;
        getRiffDueCardsForScope.mockReset().mockResolvedValue({ cards: [cardA, cardB], unreviewedCount: 2 });
        getRiffDecks.mockReset().mockResolvedValue([]);
        setBlockAttrs.mockReset().mockResolvedValue(undefined);
        skipReviewRiffCard.mockReset().mockResolvedValue(undefined);
        getNotebooks.mockReset().mockResolvedValue([{ id: "nb-1", name: "测试笔记本", closed: false }]);
        getBlockAttrs.mockReset().mockResolvedValue({});
        getBlockDOM.mockReset().mockImplementation(async (id: string) => `<p>${id} body</p>`);
        sqlQuery.mockReset().mockImplementation(async (stmt: string) => {
            if (stmt.includes("hpath")) return [{ hpath: "/nb/doc" }];
            if (stmt.includes("markdown FROM blocks")) {
                return [
                    { id: "block-a", markdown: "block-a q ==block-a a==" },
                    { id: "block-b", markdown: "block-b q ==block-b a==" },
                ];
            }
            return [];
        });
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        document.getElementById("lv-notice-host")?.remove();
        delete (window as any).__LV_NOTICE_HUB__;
    });

    it("弹窗展示清晰的影响范围标签与恢复说明，且取消不写入任何存储", async () => {
        const { suspendToday, removeFromDeck } = mountReview();
        await screen.findByText("block-a body");

        await fireEvent.click(screen.getByRole("button", { name: "更多动作" }));
        await fireEvent.click(screen.getByRole("button", { name: /移出复习/ }));

        const dialog = await screen.findByRole("dialog", { name: "将此卡移出复习" });
        expect(dialog.textContent).toContain("仅今日");
        expect(dialog.textContent).toContain("长期隐藏");
        expect(dialog.textContent).toContain("清空排期进度");
        expect(dialog.textContent).toContain("不可撤销");
        expect(dialog.textContent).toContain("卡库 → 已隐藏");

        await fireEvent.click(screen.getByRole("button", { name: "取消（保留此卡）" }));
        expect(suspendToday).not.toHaveBeenCalled();
        expect(setBlockAttrs).not.toHaveBeenCalled();
        expect(removeFromDeck).not.toHaveBeenCalled();
        expect(screen.getByText("block-a body")).toBeTruthy();
    });

    it("今天不学：等待落盘、显示 5 秒撤销胶囊，点撤销恢复卡片并调用 unsuspendToday", async () => {
        const { suspendToday, unsuspendToday } = mountReview();
        await screen.findByText("block-a body");

        await fireEvent.click(screen.getByRole("button", { name: "更多动作" }));
        await fireEvent.click(screen.getByRole("button", { name: /移出复习/ }));
        const modal = await screen.findByRole("dialog", { name: "将此卡移出复习" });
        const todayBtn = modal.querySelectorAll("button")[1]; // 今天不学 按钮
        await fireEvent.click(todayBtn);

        await waitFor(() => expect(suspendToday).toHaveBeenCalledWith("card-a"));
        await screen.findByText("block-b body");

        const undoPillBtn = await waitFor(() => {
            const btn = document.getElementById("lv-notice-host")?.querySelector<HTMLButtonElement>("[data-role='capsule-action']");
            expect(btn).toBeTruthy();
            return btn!;
        });
        const host = document.getElementById("lv-notice-host");
        expect(host?.textContent).toContain("今天不学");
        expect(host?.textContent).toContain("保留 FSRS 进度");

        await fireEvent.click(undoPillBtn);
        await waitFor(() => expect(unsuspendToday).toHaveBeenCalledWith("card-a"));
        await screen.findByText("block-a body");
    });

    it("今天不学持久化失败时保留原卡片不推进，不留下错误撤销项", async () => {
        const failingSuspend = vi.fn().mockRejectedValueOnce(new Error("磁盘写入失败"));
        const { unsuspendToday } = mountReview({ suspendToday: failingSuspend });
        await screen.findByText("block-a body");

        await fireEvent.keyDown(window, { key: "s" });
        await waitFor(() => expect(failingSuspend).toHaveBeenCalledWith("card-a"));
        await Promise.resolve();

        expect(screen.getByText("block-a body")).toBeTruthy();
        expect(screen.queryByText("block-b body")).toBeNull();
        expect(unsuspendToday).not.toHaveBeenCalled();
    });

    it("归档隐藏：明确提示归档隐藏（非解散）与恢复路径，并支持胶囊撤销恢复块属性", async () => {
        mountReview();
        await screen.findByText("block-a body");

        await fireEvent.keyDown(window, { key: "d", ctrlKey: true });
        await waitFor(() => expect(setBlockAttrs).toHaveBeenCalledWith("block-a", { "custom-lv-dismissed": "true" }));
        await screen.findByText("block-b body");

        const undoPillBtn = await waitFor(() => {
            const btn = document.getElementById("lv-notice-host")?.querySelector<HTMLButtonElement>("[data-role='capsule-action']");
            expect(btn).toBeTruthy();
            return btn!;
        });
        const host = document.getElementById("lv-notice-host");
        expect(host?.textContent).toContain("已归档隐藏");
        expect(host?.textContent).not.toContain("解散");
        expect(host?.textContent).toContain("卡库 → 已隐藏");

        await fireEvent.click(undoPillBtn);

        await waitFor(() => expect(setBlockAttrs).toHaveBeenCalledWith("block-a", { "custom-lv-dismissed": "" }));
        await screen.findByText("block-a body");
    });
});
