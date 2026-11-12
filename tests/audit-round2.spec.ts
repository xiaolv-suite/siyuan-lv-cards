import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const host = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("siyuan", () => ({ fetchSyncPost: host.post }));
import { appendBlock } from "../src/api/siyuan";
import { readPluginJsonFile, writePluginJsonFile } from "../src/api/plugin-json-file";
import { createExternalCardIntake } from "../src/core/external-card-intake";

describe("round 2 write-result safety", () => {
    beforeEach(() => host.post.mockReset());
    afterEach(() => vi.unstubAllGlobals());
    it("never sends a second write when append may have committed before transport failure", async () => {
        host.post.mockRejectedValueOnce(new Error("timeout after accepted write")).mockResolvedValue({ code: 0, data: { operations: [{ id: "duplicate" }] } });
        await expect(appendBlock("markdown", "Q ==A==", "doc")).rejects.toThrow();
        expect(host.post).toHaveBeenCalledTimes(1);
    });
    it("permission rejection never falls back to insert", async () => {
        host.post.mockResolvedValue({ code: 403, msg: "permission denied" });
        await expect(appendBlock("markdown", "Q ==A==", "doc")).rejects.toThrow();
        expect(host.post).toHaveBeenCalledTimes(1);
    });
});

describe("private journal disk boundary", () => {
    afterEach(() => vi.unstubAllGlobals());
    it("first install accepts explicit missing, never SDK empty string or permission/cache envelopes", async () => {
        const missing = vi.fn(async () => new Response(JSON.stringify({ code: 404, data: null }), { status: 202 })) as any;
        expect(await readPluginJsonFile("siyuan-lv-cards", "external-card-intake-v1.json", missing)).toBeNull();
        expect(await readPluginJsonFile("siyuan-lv-cards", "external-card-intake-v1.json", (async () => new Response("", { status: 404 })) as any)).toBeNull();
        for (const [status, text] of [[403, '{"code":403,"data":null}'], [200, '""'], [200, ''], [500, '{"code":404,"data":null}']] as const) {
            await expect(readPluginJsonFile("siyuan-lv-cards", "external-card-intake-v1.json", (async () => new Response(text, { status })) as any)).rejects.toThrow();
        }
    });
    it("writes check code and independent getFile, refusing mismatch instead of trusting cache", async () => {
        const value = { v: 1, entries: [] };
        const fetcher = vi.fn(async (route: string) => route.endsWith("putFile") ? new Response('{"code":0,"data":null}') : new Response(JSON.stringify(value))) as any;
        await writePluginJsonFile("siyuan-lv-cards", "external-card-intake-v1.json", value, fetcher);
        expect(fetcher.mock.calls.map((c: any[]) => c[0])).toEqual(["/api/file/putFile", "/api/file/getFile"]);
        expect(fetcher.mock.calls[1][1].cache).toBe("no-store");
        const mismatch = vi.fn(async (route: string) => route.endsWith("putFile") ? new Response('{"code":0}') : new Response('{"v":1,"entries":["stale"]}')) as any;
        await expect(writePluginJsonFile("siyuan-lv-cards", "external-card-intake-v1.json", value, mismatch)).rejects.toMatchObject({ outcome: "unknown" });
        const rejected = vi.fn(async () => new Response('{"code":403}')) as any;
        await expect(writePluginJsonFile("siyuan-lv-cards", "external-card-intake-v1.json", value, rejected)).rejects.toMatchObject({ outcome: "unknown" });
        expect(rejected).toHaveBeenCalledTimes(1);
    });
    it("actual missing-file protocol reaches first intake without consulting SDK cache", async () => {
        vi.stubGlobal("navigator", { locks: { request: (_name: string, task: () => Promise<unknown>) => task() } });
        const disk = new Map<string, unknown>();
        const fetcher = vi.fn(async (route: string, options: any) => {
            if (route.endsWith("getFile")) {
                const key = JSON.parse(options.body).path;
                return disk.has(key) ? new Response(JSON.stringify(disk.get(key))) : new Response('{"code":404,"data":null}', { status: 202 });
            }
            disk.set(options.body.get("path"), JSON.parse(await options.body.get("file").text()));
            return new Response('{"code":0,"data":null}');
        }) as any;
        let creates = 0;
        const intake = createExternalCardIntake({ load: () => readPluginJsonFile("siyuan-lv-cards", "external-card-intake-v1.json", fetcher),
            save: value => writePluginJsonFile("siyuan-lv-cards", "external-card-intake-v1.json", value, fetcher),
            targetNotebook: async () => "nb", find: async () => null, create: async () => { creates++; return "new-doc"; }, attrs: async () => {},
            inbox: async () => {}, firstBlock: async () => "child", ensureDeck: async () => "deck", enroll: async () => {} });
        expect(await intake({ content: "First extract", requestId: "first" }, "extract")).toMatchObject({ ok: true, data: { createdBlockID: "new-doc", enrolled: false } });
        expect(creates).toBe(1);
        expect(fetcher.mock.calls[0][0]).toBe("/api/file/getFile");
    });
});
