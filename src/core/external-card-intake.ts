import type { ActionResult } from "../api/external-bridge";
import { EXTERNAL_CARD_INTAKE_DATA } from "../bootstrap/storage-keys";
import { withExternalIntakeLock } from "../libs/external-intake-lock";

export interface IntakeReceipt { createdBlockID: string; blockID: string; kind: "extract" | "atomic"; enrolled: boolean; }
export interface IntakeInput { content: string; sourceBlockId?: string; sourceDocId?: string; sourceTitle?: string; requestId?: string; tags?: string[]; }
interface IntakeEntry { key: string; identity: string; kind: "extract" | "atomic"; notebook: string; path: string; docID?: string; blockID?: string; deckID?: string; phase: "intent" | "created" | "done"; }
interface IntakeJournal { v: 1; entries: IntakeEntry[]; }
export const INTAKE_JOURNAL = EXTERNAL_CARD_INTAKE_DATA;

export function assertSafeIntakeRestore(currentRaw: unknown, nextRaw: unknown): void {
    const parse = (value: unknown): IntakeJournal => {
        if (value == null || value === "") return { v: 1, entries: [] };
        if (typeof value === "string") {
            try {
                const parsed = JSON.parse(value);
                if (parsed == null || parsed === "") return { v: 1, entries: [] };
                value = parsed;
            } catch {
                throw new Error("Invalid intake journal");
            }
        }
        const journal = value as IntakeJournal;
        if (journal.v !== 1 || !Array.isArray(journal.entries)) throw new Error("Invalid intake journal");
        const keys = new Set<string>();
        for (const e of journal.entries) {
            if (!e || typeof e.key !== "string" || !e.key || keys.has(e.key) || typeof e.identity !== "string" || !e.identity || !["extract", "atomic"].includes(e.kind)
                || typeof e.notebook !== "string" || !e.notebook || typeof e.path !== "string" || !e.path.startsWith("/") || !["intent", "created", "done"].includes(e.phase)
                || (e.phase !== "intent" && !e.docID) || (e.phase === "done" && !e.blockID)) throw new Error("Invalid intake entry");
            keys.add(e.key);
        }
        return journal;
    };
    const current = parse(currentRaw), next = parse(nextRaw);
    const order = { intent: 0, created: 1, done: 2 };
    for (const old of current.entries) {
        const entry = next.entries.find(e => e.key === old.key);
        if (!entry || entry.identity !== old.identity || entry.notebook !== old.notebook || entry.path !== old.path || entry.kind !== old.kind
            || order[entry.phase] < order[old.phase] || (old.docID && entry.docID !== old.docID) || (old.blockID && entry.blockID !== old.blockID)) throw new Error("Restore would lose or regress an intake identity");
    }
}

/** Stable non-secret identity, independent of time windows and selection length. */
export function intakeIdentity(input: IntakeInput, kind: "extract" | "atomic"): string {
    const value = JSON.stringify([kind, input.sourceDocId ?? "", input.sourceBlockId ?? "", input.content.trim(), input.tags ?? []]);
    let a = 2166136261, b = 3335557771;
    for (const char of value) { const n = char.codePointAt(0)!; a = Math.imul(a ^ n, 16777619); b = Math.imul(b ^ n, 2246822519); }
    return `${value.length.toString(36)}-${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`;
}

export interface IntakeDependencies {
    load(): Promise<unknown>; save(journal: IntakeJournal): Promise<void>;
    targetNotebook(): Promise<string>;
    find(notebook: string, path: string): Promise<string | null>;
    create(notebook: string, path: string, markdown: string): Promise<string | null>;
    attrs(id: string, attrs: Record<string, string>): Promise<void>;
    firstBlock(docID: string): Promise<string>;
    ensureDeck(): Promise<string>; enroll(deckID: string, blockID: string): Promise<void>;
    inbox(docID: string): Promise<void>;
}

export function createExternalCardIntake(deps: IntakeDependencies) {
    let chain: Promise<unknown> = Promise.resolve();
    return (input: IntakeInput, kind: "extract" | "atomic"): Promise<ActionResult<IntakeReceipt>> => {
        const perform = async (): Promise<ActionResult<IntakeReceipt>> => {
            let partial: IntakeEntry | undefined;
            if (!input.content?.trim()) return { ok: false, code: "invalid", message: "Empty content" };
            try {
                const identity = intakeIdentity(input, kind);
                const key = input.requestId?.trim() || identity;
                let raw = await deps.load() as IntakeJournal | string | null;
                if (raw === "") raw = null;
                if (typeof raw === "string") {
                    let parsed: unknown = null;
                    try { parsed = JSON.parse(raw); } catch { throw new Error("Invalid intake journal"); }
                    raw = parsed as IntakeJournal;
                }
                assertSafeIntakeRestore(null, raw);
                if (raw && (raw.v !== 1 || !Array.isArray(raw.entries))) throw new Error("Invalid intake journal");
                const journal: IntakeJournal = raw ? structuredClone(raw) : { v: 1, entries: [] };
                let entry = journal.entries.find(e => e.key === key) ?? journal.entries.find(e => e.identity === identity);
                partial = entry;
                if (entry && entry.identity !== identity) return { ok: false, code: "request-conflict", message: "Request identity belongs to different content" };
                if (entry?.docID && await deps.find(entry.notebook, entry.path) !== entry.docID) {
                    return { ok: false, code: "missing-created-object", message: "Previously created object cannot be confirmed; no replacement created" };
                }
                if (!entry) {
                    const notebook = await deps.targetNotebook();
                    if (!notebook) return { ok: false, code: "no-target", message: "No writable notebook" };
                    entry = { key, identity, kind, notebook, path: `/小驴闪卡/${kind === "extract" ? "渐进摘录" : "外部原子卡"}/${identity}`, phase: "intent" };
                    partial = entry;
                    // Scope and identity are durable before any creation request.
                    journal.entries.push(entry);
                    await deps.save(journal);
                    const found = await deps.find(notebook, entry.path);
                    const source = input.sourceBlockId || input.sourceDocId;
                    const title = (input.sourceTitle || "来源").replace(/["\r\n]/g, " ");
                    const markdown = input.content.trim() + (source ? `\n\n> 来源：(( ${source} "${title}" ))` : "");
                    try {
                        entry.docID = found || await deps.create(notebook, entry.path, markdown) || undefined;
                    } catch {
                        return { ok: false, code: "write-unknown", message: "Creation result unknown; retry reconciles original path without replay" };
                    }
                    if (!entry.docID) return { ok: false, code: "write-unknown", message: "Creation result unknown; retry only reconciles the original path" };
                    entry.phase = "created";
                    await deps.save(journal);
                } else if (!entry.docID) {
                    // An ambiguous create is never automatically replayed.
                    entry.docID = await deps.find(entry.notebook, entry.path) || undefined;
                    if (!entry.docID) return { ok: false, code: "write-unknown", message: "Original document not confirmed; no creation replayed" };
                    entry.phase = "created";
                    await deps.save(journal);
                }
                if (entry.phase !== "done") {
                    const source = input.sourceBlockId || input.sourceDocId;
                    const attrs: Record<string, string> = {
                        "custom-lv-card-type": kind, "custom-lv-dismissed": "false", "custom-lv-intake-id": identity,
                        ...(source ? { "custom-lv-source-block": source } : {}),
                        ...(input.sourceDocId ? { "custom-lv-source-doc": input.sourceDocId } : {}),
                        ...(input.tags?.length ? { "custom-riff-tags": input.tags.join(" ") } : {}),
                    };
                    await deps.attrs(entry.docID!, attrs);
                    if (kind === "extract") {
                        entry.blockID = entry.docID;
                        await deps.inbox(entry.docID!);
                    } else {
                        entry.blockID ||= await deps.firstBlock(entry.docID!);
                        if (!entry.blockID) throw new Error("Created atomic card block not confirmed");
                        await deps.attrs(entry.blockID, attrs);
                        entry.deckID ||= await deps.ensureDeck();
                        await deps.save(journal);
                        await deps.enroll(entry.deckID, entry.blockID);
                    }
                    entry.phase = "done";
                    await deps.save(journal);
                }
                if (!entry.blockID) throw new Error("Missing created object identity");
                return { ok: true, data: { createdBlockID: entry.blockID, blockID: entry.blockID, kind, enrolled: kind === "atomic" } };
            } catch (error) {
                return { ok: false, code: partial?.docID ? "write-unknown" : "intake-failed", message: error instanceof Error ? error.message : String(error),
                    details: partial?.docID ? { docID: partial.docID, createdBlockID: partial.blockID, phase: partial.phase, requestId: partial.key } : undefined };
            }
        };
        const run = chain.catch(() => undefined).then(() => {
            return withExternalIntakeLock(perform).catch(error => ({ ok: false as const, code: "lock-unavailable", message: String(error) }));
        });
        chain = run;
        return run;
    };
}
