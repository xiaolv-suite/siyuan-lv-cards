/**
 * 闪卡复习会话与状态机生命周期调度器（Session Lifecycle）
 * 统管 Revlog 读写追加、定时防抖排空、WebSocket 过滤同步、灾备恢复与多端重载。
 */

import { lvLog } from "@/libs/log";
import { localDate, appendRevlog as doAppendRevlog, rollbackLastRevlogEntry, calcStreak, emptyRevlog, DEFAULT_LEECH_THRESHOLD, type RevlogEntry } from "@/core/revlog";
import { setBlockAttrs } from "@/api/siyuan";
import { buildLeechAttrs } from "@/core/block-attributes";
import { invalidateDueCache } from "@/api/due-shared";
import { dispatchCardReviewedEvent } from "@/api/external-bridge";
import { normalizeNativeCardAction, NativeEventDeduper } from "@/core/native-events";
import { LV_EVENTS, reviewedEvent, streakChangedEvent, storesChangedEvent } from "@/libs/events";
import { previewRestore } from "@/core/backup";
import { confirmDialogBool } from "@/libs/dialog";
import { applyRestoreTransaction } from "@/core/data-transfer";
import { REVLOG_DATA } from "@/bootstrap/storage-keys";

function cloneStore<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

const todayDate = () => localDate(Date.now());

export class SessionLifecycleService {
    private readonly plugin: any;
    private readonly nativeDeduper = new NativeEventDeduper();

    constructor(plugin: any) {
        this.plugin = plugin;
    }

    public isCardRelatedWsEvent(detail: any): boolean {
        if (!detail) return false;
        const cmd = detail.cmd;
        if (cmd === "syncMergeResult") return true;
        try {
            if (typeof detail.data === "string") {
                return /riff|custom-riff|custom-lv-question|flashcard/i.test(detail.data);
            }
            if (Array.isArray(detail.data)) {
                for (let i = 0; i < detail.data.length; i++) {
                    const tx = detail.data[i];
                    if (!tx) continue;
                    const ops = tx.doOperations;
                    if (Array.isArray(ops)) {
                        for (let j = 0; j < ops.length; j++) {
                            const op = ops[j];
                            if (!op) continue;
                            const action = op.action;
                            if (action === "setAttr" || action === "updateAttrView") return true;
                            const opData = typeof op.data === "string" ? op.data : "";
                            if (opData && (opData.includes("custom-riff") || opData.includes("custom-lv-question") || opData.includes("flashcard") || opData.includes("riff"))) {
                                return true;
                            }
                        }
                    }
                }
                return false;
            }
            const raw = JSON.stringify(detail.data || "");
            return /riff|custom-riff|custom-lv-question|flashcard/i.test(raw);
        } catch {
            return false;
        }
    }

    public onWsMain = (event: CustomEvent<any>): void => {
        try {
            const cmd = event?.detail?.cmd;
            if (cmd === "transactions" || cmd === "savedoc" || cmd === "syncMergeResult") {
                if (!this.isCardRelatedWsEvent(event.detail)) return;
                if (typeof document !== "undefined" && document.hidden) return;

                if (this.plugin.docSyncTimer) {
                    clearTimeout(this.plugin.docSyncTimer);
                }
                this.plugin.docSyncTimer = setTimeout(() => {
                    this.plugin.docSyncTimer = null;
                    try {
                        invalidateDueCache();
                        this.plugin.refreshDueBadge();
                        (this.plugin.eventBus as any).emit(LV_EVENTS.storesChanged, storesChangedEvent());
                    } catch {}
                }, 1500);
            }
        } catch {}
    };

    public onNativeCardAction = (event: CustomEvent): void => {
        try {
            const normalized = normalizeNativeCardAction(event?.detail, Date.now());
            if (!normalized) {
                lvLog("warn", "[native] dropped");
                return;
            }
            if (this.nativeDeduper.seen((event?.detail as any)?.eid, normalized.cardID, normalized.ts)) {
                lvLog("info", "[native] deduped");
                return;
            }
            if (normalized.timeEstimated) {
                lvLog("info", "[native] estimated");
            }
            this.appendRevlog({
                ts: normalized.ts,
                cardID: normalized.cardID,
                deckID: normalized.deckID,
                blockID: normalized.blockID,
                rating: normalized.rating,
                source: "native",
            });
        } catch {}
    };

    public appendRevlog(entry: Omit<RevlogEntry, "ts"> & { ts?: number }): void {
        if (!this.plugin.persistedRevlogSnapshot) {
            this.plugin.persistedRevlogSnapshot = cloneStore(this.plugin.revlog);
        }
        this.plugin.revlogMutationVersion += 1;
        const today = todayDate();
        const prevCount = (this.plugin.revlog.days[today]?.new ?? 0) + (this.plugin.revlog.days[today]?.review ?? 0);
        const streakBefore = calcStreak(this.plugin.revlog);
        doAppendRevlog(this.plugin.revlog, { ts: entry.ts ?? Date.now(), ...entry } as RevlogEntry);
        const streakAfter = calcStreak(this.plugin.revlog);
        this.scheduleRevlogSave();

        const entryBlockID = entry.blockID;
        if (entryBlockID) {
            const { lapsesMap } = this.plugin.getRevlogBlockIndex();
            const lapses = lapsesMap[entryBlockID] ?? 0;
            const threshold = this.plugin.settings.leechThreshold || DEFAULT_LEECH_THRESHOLD;
            if (lapses >= threshold) {
                void setBlockAttrs(entryBlockID, buildLeechAttrs(true, lapses)).catch(() => {});
            }
        }

        invalidateDueCache();
        this.plugin.refreshDueBadge();

        const target = this.plugin.settings.dailyReviewTarget;
        const nextCount = (this.plugin.revlog.days[today]?.new ?? 0) + (this.plugin.revlog.days[today]?.review ?? 0);
        if (target > 0 && prevCount < target && nextCount >= target && !this.plugin.inQuietHours()) {
            this.plugin.showNotice(this.plugin.i18n.dailyTargetReached, 3000, "info");
        }
        try {
            (this.plugin.eventBus as any).emit(LV_EVENTS.reviewed, reviewedEvent({
                cardID: entry.cardID, deckID: entry.deckID, blockID: entry.blockID,
                rating: entry.rating, source: entry.source,
            }));
            if (streakAfter !== streakBefore) {
                (this.plugin.eventBus as any).emit(LV_EVENTS.streakChanged, streakChangedEvent(streakAfter));
            }
            dispatchCardReviewedEvent({
                cardID: entry.cardID,
                deckID: entry.deckID,
                blockID: entry.blockID,
                rating: entry.rating,
                source: entry.source,
                ts: entry.ts,
            });
        } catch {}
    }

    public rollbackRevlog(cardID?: string): RevlogEntry | null {
        if (!this.plugin.persistedRevlogSnapshot) {
            this.plugin.persistedRevlogSnapshot = cloneStore(this.plugin.revlog);
        }
        this.plugin.revlogMutationVersion += 1;
        const removed = rollbackLastRevlogEntry(this.plugin.revlog, cardID);
        if (removed) {
            this.scheduleRevlogSave();
            invalidateDueCache();
            this.plugin.refreshDueBadge();
        }
        return removed;
    }

    public scheduleRevlogSave(): void {
        if (this.plugin.saveRevlogTimer) {
            clearTimeout(this.plugin.saveRevlogTimer);
        }
        this.plugin.saveRevlogTimer = setTimeout(() => this.flushRevlogSave(), 2000);
    }

    public flushRevlogSave(): void {
        if (this.plugin.saveRevlogTimer) {
            clearTimeout(this.plugin.saveRevlogTimer);
            this.plugin.saveRevlogTimer = null;
        }
        const version = this.plugin.revlogMutationVersion;
        const next = cloneStore(this.plugin.revlog);
        this.plugin.storageCoordinator.save(REVLOG_DATA, next).then(() => {
            this.plugin.persistedRevlogSnapshot = next;
        }).catch(() => {
            if (version === this.plugin.revlogMutationVersion) {
                this.plugin.revlog = cloneStore(this.plugin.persistedRevlogSnapshot ?? next);
                this.plugin.refreshDueBadge();
            }
        });
    }

    public handleDataChanged(files?: unknown): void {
        if (this.plugin.isUnloading) return;
        try {
            if (files === "sync" || files === "overwrite") {
                this.scheduleReloadLocalStores([]);
                return;
            }
            const raw = Array.isArray(files) ? files : (files as any)?.files;
            if (!Array.isArray(raw) || raw.length === 0) return;

            const related = raw.filter((f): f is string => {
                if (typeof f !== "string") return false;
                const norm = f.replace(/\\/g, "/").toLowerCase();
                return norm.includes("/storage/petal/siyuan-lv-cards/") || norm.includes("storage/petal/siyuan-lv-cards/");
            });
            if (related.length === 0) return;

            const now = Date.now();
            const lastWrites = this.plugin.storageLastWrite ?? {};
            const allEchoes = related.every((f) => {
                const name = f.split(/[\\/]/).pop();
                return name ? now - (lastWrites[name] ?? 0) < 3000 : false;
            });
            if (allEchoes) return;

            this.scheduleReloadLocalStores(related);
        } catch {
            // 协议差异不容阻断宿主
        }
    }

    public scheduleReloadLocalStores(files: string[]): void {
        if (this.plugin.isUnloading) return;
        if (this.plugin.reloadTimer) clearTimeout(this.plugin.reloadTimer);
        this.plugin.reloadTimer = setTimeout(() => {
            this.plugin.reloadTimer = null;
            if (!this.plugin.isUnloading) {
                void this.reloadLocalStoresBounded(files);
            }
        }, 2000);
    }

    public discardPendingSaveTimers(): void {
        if (this.plugin.saveRevlogTimer) {
            clearTimeout(this.plugin.saveRevlogTimer);
            this.plugin.saveRevlogTimer = null;
        }
        if (this.plugin.settingsSaveTimer) {
            clearTimeout(this.plugin.settingsSaveTimer);
            this.plugin.settingsSaveTimer = null;
        }
    }

    public async reloadLocalStoresBounded(files: string[] = [], options?: { discardPending?: boolean }): Promise<void> {
        if (this.plugin.isUnloading) return;
        if (this.plugin.reloadInFlight) {
            this.plugin.reloadQueued = true;
            return;
        }
        this.plugin.reloadInFlight = true;
        try {
            if (options?.discardPending) {
                // 灾备还原路径：先取消并丢弃挂起的内存脏缓冲，绝不用旧内存覆写刚还原的磁盘文件
                this.discardPendingSaveTimers();
            } else {
                if (this.plugin.saveRevlogTimer) {
                    this.flushRevlogSave();
                }
                if (this.plugin.settingsSaveTimer) {
                    clearTimeout(this.plugin.settingsSaveTimer);
                    this.plugin.settingsSaveTimer = null;
                    await this.plugin.saveSettingsNow();
                }
            }
            await this.plugin.persist?.waitAll?.(3000);
            if (this.plugin.isUnloading) return;
            const loaded = await this.plugin.readAllStores();
            if (this.plugin.isUnloading) return;
            await this.plugin.applyLoadedStores(loaded);
            invalidateDueCache();
            this.plugin.refreshDueBadge();
            try {
                (this.plugin.eventBus as any).emit(LV_EVENTS.storesChanged, storesChangedEvent(files));
            } catch {}
            lvLog("info", "[sync] reloaded stores");
        } catch (e) {
            lvLog("error", `[sync] reload failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            this.plugin.reloadInFlight = false;
            if (this.plugin.reloadQueued && !this.plugin.isUnloading) {
                this.plugin.reloadQueued = false;
                void this.reloadLocalStoresBounded(files);
            } else {
                this.plugin.reloadQueued = false;
            }
        }
    }

    public async clearRevlog(): Promise<void> {
        const previous = cloneStore(this.plugin.persistedRevlogSnapshot ?? this.plugin.revlog);
        const next = emptyRevlog();
        const version = ++this.plugin.revlogMutationVersion;
        this.plugin.revlog = next;
        this.plugin.refreshDueBadge();
        try {
            await this.plugin.storageCoordinator.save(REVLOG_DATA, next);
            if (version === this.plugin.revlogMutationVersion) this.plugin.persistedRevlogSnapshot = next;
            this.plugin.showNotice(this.plugin.i18n.settingsSaved, 2000, "info");
        } catch {
            if (version === this.plugin.revlogMutationVersion) {
                this.plugin.revlog = cloneStore(this.plugin.persistedRevlogSnapshot ?? previous);
                this.plugin.refreshDueBadge();
            }
            this.plugin.toastStorageFail();
        }
    }

    public async restoreBackupFromFile(text: string): Promise<void> {
        await this.plugin.ensureTier2Loaded();
        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            throw new Error((this.plugin.i18n as any).backup?.badJson ?? "invalid JSON");
        }
        const current = await this.plugin.readAllStores();
        const preview = previewRestore(parsed, current, [...this.plugin.constructor.STORE_KEYS]);
        const dict = (this.plugin.i18n as any).backup ?? {};
        if (!preview.ok) {
            throw new Error(`${dict.badBundle ?? "backup rejected"}: ${preview.errors.slice(0, 3).join("; ")}`);
        }
        const actLabel = { replace: dict.actReplace ?? "overwrite", add: dict.actAdd ?? "add", unchanged: dict.actUnchanged ?? "keep" } as const;
        const rows = preview.perKey
            .slice(0, 12)
            .map(k => `<li>${actLabel[k.action]} · ${k.key}</li>`)
            .join("") + (preview.perKey.length > 12 ? `<li>… +${preview.perKey.length - 12}</li>` : "");
        const created = preview.createdAt ? new Date(preview.createdAt).toLocaleString() : "—";
        const ok = await confirmDialogBool({
            title: dict.restoreTitle ?? "Restore backup",
            content: `<div class="b3-typography"><p>${(dict.restoreWarn ?? "").replace("${created}", created)
                .replace("${r}", preview.summary.replace)
                .replace("${a}", preview.summary.add)
                .replace("${u}", preview.summary.unchanged)}</p><ul>${rows}</ul></div>`,
        });
        if (!ok) return;

        this.discardPendingSaveTimers();
        await applyRestoreTransaction({
            restoreFiles: preview.files,
            currentFiles: current,
            saveFile: (key, data) => this.plugin.storageCoordinator.save(key, cloneStore(data)),
            logError: (msg) => lvLog("error", msg),
        });
        this.discardPendingSaveTimers();
        await this.plugin.applyLoadedStores(await this.plugin.readAllStores());
        this.plugin.refreshDueBadge();
        this.plugin.showNotice(dict.restoreDone ?? "restored", 2500, "info");
        lvLog("info", "[backup] restored");
    }
}

export function createSessionLifecycleService(plugin: any): SessionLifecycleService {
    return new SessionLifecycleService(plugin);
}
