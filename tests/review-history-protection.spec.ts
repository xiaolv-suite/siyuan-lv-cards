import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import Review from "../src/ui/review.svelte";

vi.mock("svelte/transition", () => ({ fade: () => ({ duration: 0, css: () => "" }) }));

const { getRiffDueCardsForScope, getRiffDecks, reviewRiffCard, getNotebooks, getBlockAttrs, getBlockDOM, sqlQuery } = vi.hoisted(() => ({
    getRiffDueCardsForScope: vi.fn(),
    getRiffDecks: vi.fn().mockResolvedValue([]),
    reviewRiffCard: vi.fn(),
    getNotebooks: vi.fn().mockResolvedValue([]),
    getBlockAttrs: vi.fn().mockResolvedValue({}),
    getBlockDOM: vi.fn().mockResolvedValue("<p>body</p>"),
    sqlQuery: vi.fn().mockResolvedValue([]),
}));

vi.mock("../src/api/riff", () => ({
    getRiffDueCardsForScope,
    getRiffDecks,
    reviewRiffCard,
    skipReviewRiffCard: vi.fn(),
    batchSetRiffCardsDueTime: vi.fn(),
}));

vi.mock("../src/api/siyuan", () => ({
    getNotebooks,
    getBlockAttrs,
    getBlockDOM,
    sqlQuery,
    setBlockAttrs: vi.fn(),
}));

const cardA = {
    cardID: "card-p1",
    deckID: "deck-1",
    blockID: "block-p1",
    due: "20261104000000",
    reps: 1,
};

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

const makeCtx = () => ({
    i18n: message("t"),
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
    suspendToday: vi.fn(),
    openDashboard: vi.fn(),
    onScopePersist: vi.fn(),
    getSessionState: () => null,
    saveSessionState: vi.fn(),
    clearSessionState: vi.fn(),
    emitSessionFinished: vi.fn(),
    getContextBlocks: async () => [],
});

describe("review-history-protection (Mobile Spec v1 进度保护)", () => {
    beforeEach(() => {
        window.confirm = vi.fn();
        getRiffDueCardsForScope.mockReset().mockResolvedValue({ cards: [cardA], unreviewedCount: 1 });
        getRiffDecks.mockReset().mockResolvedValue([]);
        getBlockAttrs.mockReset().mockResolvedValue({});
        getBlockDOM.mockReset().mockImplementation(async (id: string) => `<p>${id} body</p>`);
        sqlQuery.mockReset().mockImplementation(async (stmt: string) => {
            if (stmt.includes("hpath")) return [{ hpath: "/notebook/chapter/doc" }];
            if (stmt.includes("markdown FROM blocks")) {
                return [
                    { id: "block-p1", markdown: "block-p1 question ==block-p1 answer==" },
                ];
            }
            return [];
        });
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        // 清理历史占位
        if (window.history.state?.lvCards) {
            window.history.replaceState(null, "");
        }
    });

    it("进入复习会话时在 history 压入占位态并在 popstate 时弹出确认", async () => {
        const pushStateSpy = vi.spyOn(window.history, "pushState");
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
        const testCtx = makeCtx();

        const view = render(Review, { ctx: testCtx });
        await screen.findByText("block-p1 body");

        expect(pushStateSpy).toHaveBeenCalledWith({ lvCards: true }, "");

        // 模拟触发 popstate (Android 返回键/返回手势)
        window.dispatchEvent(new PopStateEvent("popstate"));
        expect(confirmSpy).toHaveBeenCalledWith("t.review.backConfirm");

        // 用户取消退出，不执行 openDashboard
        expect(testCtx.openDashboard).not.toHaveBeenCalled();

        view.unmount();
    });

    it("用户确认退出时落盘并返回闪卡中心", async () => {
        vi.spyOn(window.history, "pushState");
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
        const testCtx = makeCtx();

        const view = render(Review, { ctx: testCtx });
        await screen.findByText("block-p1 body");

        window.dispatchEvent(new PopStateEvent("popstate"));
        expect(confirmSpy).toHaveBeenCalledWith("t.review.backConfirm");
        expect(testCtx.saveSessionState).toHaveBeenCalled();
        expect(testCtx.openDashboard).toHaveBeenCalled();

        view.unmount();
    });
});
