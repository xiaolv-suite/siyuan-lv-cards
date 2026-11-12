import { afterEach, describe, expect, it, vi } from "vitest";
import { getRiffDueCardsForScope } from "@/api/riff";

const jsonResponse = (envelope: unknown) => ({
    ok: true,
    json: async () => envelope,
});

let calls: { url: string; body: any }[] = [];
function mockKernel() {
    calls = [];
    const fn = vi.fn(async (url: string, init?: any) => {
        calls.push({ url, body: init?.body ? JSON.parse(init.body) : {} });
        if (url === "/api/riff/getRiffDecks") {
            return jsonResponse({ code: 0, msg: "", data: [] });
        }
        return jsonResponse({ code: 0, msg: "", data: { cards: [], unreviewedCount: 0 } });
    });
    vi.stubGlobal("fetch", fn);
    return fn;
}

describe("getRiffDueCardsForScope 范围到期卡片路由分发", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("正确根据前缀分发至对应的 API 端点与 payload 契约", async () => {
        mockKernel();

        await getRiffDueCardsForScope("deck:d-123", ["r-1"]);
        expect(calls[0].url).toBe("/api/riff/getRiffDueCards");
        expect(calls[0].body).toEqual({ deckID: "d-123", reviewedCards: [{ cardID: "r-1" }] });

        await getRiffDueCardsForScope("notebook:nb-456", ["r-2"]);
        expect(calls[1].url).toBe("/api/riff/getNotebookRiffDueCards");
        expect(calls[1].body).toEqual({ notebook: "nb-456", reviewedCards: [{ cardID: "r-2" }] });

        await getRiffDueCardsForScope("doc:doc-789", ["r-3"]);
        expect(calls[2].url).toBe("/api/riff/getTreeRiffDueCards");
        expect(calls[2].body).toEqual({ rootID: "doc-789", reviewedCards: [{ cardID: "r-3" }] });

        await getRiffDueCardsForScope("all", []);
        expect(calls[3].url).toBe("/api/riff/getRiffDecks");
    });
});
