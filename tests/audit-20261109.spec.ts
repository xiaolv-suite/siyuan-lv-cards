import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { buildCardsBridge } from "../src/api/external-bridge";
import { partitionReviewCardsByQuality } from "../src/core/review-queue-quality";
import { createExternalCardIntake, assertSafeIntakeRestore } from "../src/core/external-card-intake";

describe("2026-11-09 audit regression", () => {
    it("business failure cannot become a successful bridge receipt", async () => {
        const bridge = buildCardsBridge({ getStats: () => ({} as any), getDueSummary: async () => ({} as any), openHub: () => {}, openReview: () => {}, receiveExtract: async () => ({ enrolled: false }) } as any);
        expect((await bridge.receiveExtract({ content: "extract", sourceBlockId: "source" })).ok).toBe(false);
    });
    it("legacy extracts stay out of the normal FSRS presentation queue", () => {
        const result = partitionReviewCardsByQuality([{ blockID: "b", cardID: "c" }], [{ id: "b", markdown: "粗摘录 ==详见原文==", attrs: { "custom-lv-card-type": "extract" } }]);
        expect(result.valid).toEqual([]);
        expect(result.invalid).toEqual([]);
    });
    it("atomic source identity survives the bridge and thrown or partial completion stays unknown", async () => {
        let received: any;
        const base = { getStats: () => ({} as any), getDueSummary: async () => ({} as any), openHub: () => {}, openReview: () => {} };
        const bridge = buildCardsBridge({ ...base, createCard: async input => { received = input; throw new Error("committed then transport failed"); } });
        expect(await bridge.createCard!({ front: "Q", back: "A", sourceDocId: "doc", sourceBlockId: "block", requestId: "request" })).toMatchObject({ ok: false, code: "write-unknown" });
        expect(received.sourceBlockId).toBe("block");
        const partial = buildCardsBridge({ ...base, createCard: async () => ({ ok: true, data: { createdBlockID: "new-card", blockID: "new-card", kind: "atomic", enrolled: false } }) });
        expect(await partial.createCard!({ front: "Q", back: "A" })).toMatchObject({ ok: false, code: "write-unknown", details: { createdBlockID: "new-card" } });
    });
});

describe("durable external card intake", () => {
    let lockTail: Promise<unknown> = Promise.resolve();
    beforeAll(() => vi.stubGlobal("navigator", { locks: { request: (_name: string, task: () => Promise<unknown>) => {
        const next = lockTail.catch(() => undefined).then(task); lockTail = next; return next;
    } } }));
    afterAll(() => vi.unstubAllGlobals());
    function fixture() {
        let journal: unknown = null;
        const docs = new Map<string, string>();
        let creates = 0, enrolls = 0, inbox = 0, failTarget = false, ambiguous = false;
        const deps = {
            load: async () => journal,
            save: async (value: unknown) => { journal = structuredClone(value); },
            targetNotebook: async () => failTarget ? "" : "nb",
            find: async (_nb: string, path: string) => docs.get(path) ?? null,
            create: async (_nb: string, path: string) => { creates++; if (ambiguous) throw new Error("lost response"); const id = `doc-${creates}`; docs.set(path, id); return id; },
            attrs: async () => {}, firstBlock: async (doc: string) => `${doc}-card`,
            ensureDeck: async () => "deck", enroll: async () => { enrolls++; }, inbox: async () => { inbox++; },
        };
        return { deps, intake: createExternalCardIntake(deps), stats: () => ({ creates, enrolls, inbox }), failTarget: (v: boolean) => { failTarget = v; }, ambiguous: () => { ambiguous = true; } };
    }
    it("failure does not reserve a successful dedupe result; a valid retry creates one extract without FSRS", async () => {
        const f = fixture(), input = { content: "quote", sourceBlockId: "source", requestId: "one" };
        f.failTarget(true);
        expect((await f.intake(input, "extract")).ok).toBe(false);
        f.failTarget(false);
        const res = await f.intake(input, "extract");
        expect(res).toMatchObject({ ok: true, data: { createdBlockID: "doc-1", kind: "extract", enrolled: false } });
        expect((await f.intake(input, "extract"))).toEqual(res);
        expect(f.stats()).toEqual({ creates: 1, enrolls: 0, inbox: 1 });
    });
    it("different selections in one block survive concurrency and a restarted controller", async () => {
        const f = fixture();
        const a = { content: "first selection", sourceBlockId: "source" }, b = { ...a, content: "second selection" };
        const [one, two] = await Promise.all([f.intake(a, "extract"), f.intake(b, "extract")]);
        expect(one.ok && two.ok && one.data.createdBlockID !== two.data.createdBlockID).toBe(true);
        await createExternalCardIntake(f.deps)(a, "extract");
        expect(f.stats()).toEqual({ creates: 2, enrolls: 0, inbox: 2 });
    });
    it("two controllers share the origin lock without overwriting the durable journal", async () => {
        const f = fixture(), other = createExternalCardIntake(f.deps);
        await Promise.all([f.intake({ content: "one", requestId: "one" }, "extract"), other({ content: "two", requestId: "two" }, "extract")]);
        expect((await f.deps.load() as any).entries).toHaveLength(2);
        expect(f.stats().creates).toBe(2);
    });
    it("restoring an older journal cannot discard an unknown creation reservation", async () => {
        const f = fixture(); f.ambiguous();
        await f.intake({ content: "uncertain", requestId: "reserved" }, "extract");
        const journal = await f.deps.load();
        expect(() => assertSafeIntakeRestore(journal, { v: 1, entries: [] })).toThrow();
        expect(() => assertSafeIntakeRestore(null, journal)).not.toThrow();
        expect((await createExternalCardIntake(f.deps)({ content: "uncertain", requestId: "reserved" }, "extract"))).toMatchObject({ ok: false, code: "write-unknown" });
        expect(f.stats().creates).toBe(1);
    });
    it("atomic create enrolls the confirmed new child, while ambiguous creation is never replayed", async () => {
        const f = fixture();
        expect(await f.intake({ content: "Q ==A==", requestId: "atomic" }, "atomic")).toMatchObject({ ok: true, data: { kind: "atomic", enrolled: true, createdBlockID: "doc-1-card" } });
        expect(f.stats().enrolls).toBe(1);
        const bad = fixture(); bad.ambiguous();
        const input = { content: "lost", requestId: "unknown" };
        expect(await bad.intake(input, "extract")).toMatchObject({ ok: false, code: "write-unknown" });
        expect(await createExternalCardIntake(bad.deps)(input, "extract")).toMatchObject({ ok: false, code: "write-unknown" });
        expect(bad.stats().creates).toBe(1);
    });
    it("first installation missing-file empty-string sentinel is treated as uninitialized journal without failing intake", async () => {
        let journal: unknown = "";
        const docs = new Map<string, string>();
        let creates = 0;
        const deps = {
            load: async () => journal,
            save: async (value: unknown) => { journal = structuredClone(value); },
            targetNotebook: async () => "nb",
            find: async (_nb: string, path: string) => docs.get(path) ?? null,
            create: async (_nb: string, path: string) => { creates++; const id = `doc-${creates}`; docs.set(path, id); return id; },
            attrs: async () => {}, firstBlock: async (doc: string) => `${doc}-card`,
            ensureDeck: async () => "deck", enroll: async () => {}, inbox: async () => {},
        };
        const intake = createExternalCardIntake(deps);
        const res = await intake({ content: "first extract", sourceBlockId: "source" }, "extract");
        expect(res.ok).toBe(true);
        expect(creates).toBe(1);
        expect((journal as any).entries).toHaveLength(1);
    });
});
