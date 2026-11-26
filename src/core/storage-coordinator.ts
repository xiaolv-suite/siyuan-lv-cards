/**
 * 小驴闪卡 23 槽持久化存储中枢（StorageCoordinator）
 *
 * 核心职责：
 * 1. Tier 1（4 槽）与 Tier 2（19 槽）分级加载与按需就绪守卫（ensureTier2Loaded）；
 * 2. 全生态 23 槽持久化数据导出与原子恢复灾备签名（dumpData / restoreData）；
 * 3. 卸载与灾备前的循环排空冲刷（flush）：
 *    采用 Promise.allSettled 循环全排空慢链、失败链与并发新写，限轮（50 轮）显式报错，杜绝数据静默丢失。
 */

import { lvLog } from "@/libs/log";
import { withExternalIntakeLock } from "@/libs/external-intake-lock";
import { readPluginJsonFile, writePluginJsonFile } from "@/api/plugin-json-file";
import { INTAKE_JOURNAL, assertSafeIntakeRestore } from "@/core/external-card-intake";
import { applyRestoreTransaction } from "@/core/data-transfer";
import { ALL_STORE_KEYS, TIER1_STORE_KEYS } from "@/bootstrap/storage-keys";
import {
    readAllPluginStores,
    readTier1PluginStores,
    readTier2PluginStores,
} from "@/bootstrap/storage-loader";

function safePerfMark(name: string): void {
    if (typeof performance !== "undefined" && typeof performance.mark === "function") {
        try { performance.mark(name); } catch { /* ignore */ }
    }
}

function safePerfMeasure(name: string, startMark: string, endMark: string): void {
    if (typeof performance !== "undefined" && typeof performance.measure === "function") {
        try { performance.measure(name, startMark, endMark); } catch { /* ignore */ }
    }
}

export interface StorageCoordinatorOptions {
    pluginName?: string;
    loadData: (key: string) => Promise<unknown>;
    saveData: (key: string, data: unknown) => Promise<void>;
    saveOnce?: (key: string, operationId: string, data: unknown) => Promise<void>;
    applyTier1Stores?: (loaded: Record<string, unknown>) => Promise<void> | void;
    applyTier2Stores?: (loaded: Record<string, unknown>) => Promise<void> | void;
    reloadLocalStoresBounded?: (keys: string[], options?: { discardPending?: boolean }) => Promise<void>;
    getIsUnloading: () => boolean;
    triggerRevlogSave?: () => void;
    triggerSettingsSave?: () => Promise<void>;
    discardPendingTimers?: () => void;
    hasPendingTimers?: () => boolean;
    loadHubServices?: () => Promise<any>;
}

export class StorageCoordinator {
    public readonly pluginName: string;
    private readonly options: StorageCoordinatorOptions;

    private tier2Ready = false;
    public tier2LoadingPromise: Promise<void> | undefined;
    private tier2ScheduledTimer: ReturnType<typeof setTimeout> | undefined;
    public tier2IdleId: any = undefined;
    private tier2LoadGeneration = 0;

    /** 在途写操作链条字典，按 key 串行聚合 */
    private readonly saveChains = new Map<string, Promise<void>>();
    /** 标识当前是否正处于 flush 排空周期中 */
    private isFlushing = false;
    /** Tier 1 读取失败的只读保护槽位（key -> 失败原因），阻断以空默认值覆写原数据 */
    private readonly readOnlySlots = new Map<string, string>();

    constructor(options: StorageCoordinatorOptions) {
        this.options = options;
        this.pluginName = options.pluginName || "siyuan-lv-cards";
    }

    public get isTier2Ready(): boolean {
        return this.tier2Ready;
    }

    public get isFlushingActive(): boolean {
        return this.isFlushing;
    }

    public setTier2Ready(ready: boolean): void {
        this.tier2Ready = ready;
    }

    public getLoadGeneration(): number {
        return this.tier2LoadGeneration;
    }

    public incrementLoadGeneration(): number {
        return ++this.tier2LoadGeneration;
    }

    public markSlotReadOnly(key: string, reason: string): void {
        this.readOnlySlots.set(key, reason || "read failed");
    }

    public clearSlotReadOnly(key: string): void {
        this.readOnlySlots.delete(key);
    }

    public isSlotReadOnly(key: string): boolean {
        return this.readOnlySlots.has(key);
    }

    public getReadOnlySlots(): string[] {
        return Array.from(this.readOnlySlots.keys());
    }

    // =========================================================================
    // 1. 分级装载调度 (Tier 1 & Tier 2)
    // =========================================================================

    public async readTier1Stores(): Promise<Record<string, unknown>> {
        const failed = new Set<string>();
        const loaded = await readTier1PluginStores(
            (key) => this.options.loadData(key),
            (key, err) => {
                failed.add(key);
                this.markSlotReadOnly(key, err instanceof Error ? err.message : String(err));
            },
        );
        for (const key of TIER1_STORE_KEYS) {
            if (!failed.has(key)) {
                this.clearSlotReadOnly(key);
            }
        }
        return loaded;
    }

    public async readTier2Stores(): Promise<Record<string, unknown>> {
        return readTier2PluginStores((key) =>
            key === INTAKE_JOURNAL
                ? readPluginJsonFile(this.pluginName, key).catch(() => null)
                : this.options.loadData(key),
        );
    }

    public async readAllStores(): Promise<Record<string, unknown>> {
        return readAllPluginStores(
            (key) => (key === INTAKE_JOURNAL ? readPluginJsonFile(this.pluginName, key) : this.options.loadData(key)),
            ALL_STORE_KEYS,
        );
    }

    public cancelTier2Schedule(): void {
        if (this.tier2ScheduledTimer !== undefined) {
            clearTimeout(this.tier2ScheduledTimer);
            this.tier2ScheduledTimer = undefined;
        }
        if (this.tier2IdleId !== undefined) {
            if (typeof window !== "undefined" && typeof (window as any).cancelIdleCallback === "function") {
                try {
                    (window as any).cancelIdleCallback(this.tier2IdleId);
                } catch {
                    /* ignore */
                }
            }
            this.tier2IdleId = undefined;
        }
    }

    public scheduleTier2Load(): void {
        // 冷启动 I/O 减负：启动期（onload/onLayoutReady）不再定时并发发起 19 路 Tier 2 loadData，
        // 统一由首次打开闪卡主页/复习/设置/弹窗或写入口守卫触发 ensureTier2Loaded() 按需懒加载。
        if (this.tier2Ready || this.tier2LoadingPromise || this.options.getIsUnloading()) return;
        this.cancelTier2Schedule();
    }

    public ensureTier2Loaded(): Promise<void> {
        if (this.tier2Ready) return Promise.resolve();
        if (this.tier2LoadingPromise) return this.tier2LoadingPromise;
        this.cancelTier2Schedule();
        this.tier2LoadingPromise = (async () => {
            try {
                await this.loadTier2Storage();
            } finally {
                this.tier2LoadingPromise = undefined;
            }
        })();
        return this.tier2LoadingPromise;
    }

    private async loadTier2Storage(): Promise<void> {
        if (this.options.getIsUnloading()) return;
        if (typeof this.options.loadData !== "function") {
            this.tier2Ready = true;
            return;
        }
        const currentGen = ++this.tier2LoadGeneration;
        safePerfMark("siyuan-lv-cards-tier2-start");
        try {
            const loaded = await this.readTier2Stores();
            if (this.options.getIsUnloading() || currentGen !== this.tier2LoadGeneration) {
                return;
            }
            if (this.options.applyTier2Stores) {
                await this.options.applyTier2Stores(loaded);
            }
            if (this.options.getIsUnloading() || currentGen !== this.tier2LoadGeneration) {
                return;
            }
            this.tier2Ready = true;
            safePerfMark("siyuan-lv-cards-tier2-end");
            safePerfMeasure("siyuan-lv-cards-tier2-load", "siyuan-lv-cards-tier2-start", "siyuan-lv-cards-tier2-end");
        } catch (err) {
            this.tier2Ready = false;
            lvLog("error", `[storage] Tier 2 load failed: ${err instanceof Error ? err.message : String(err)}`);
            throw err;
        }
    }

    // =========================================================================
    // 2. 写操作排队与并发链管理
    // =========================================================================

    /**
     * 将写操作加入当前 coordinator 监管的串行链条
     */
    public queueSave(key: string, data: unknown): Promise<void> {
        const prev = this.saveChains.get(key) || Promise.resolve();
        const currentSave = prev.then(
            () => this.options.saveData(key, data),
            () => this.options.saveData(key, data),
        );

        this.saveChains.set(key, currentSave);

        // 清理在途链：确保派生 Promise 静默消费错误，杜绝 Node unhandledRejection 逃逸
        currentSave
            .catch(() => {})
            .finally(() => {
                if (this.saveChains.get(key) === currentSave) {
                    this.saveChains.delete(key);
                }
            });

        return currentSave;
    }

    public save(key: string, data: unknown): Promise<void> {
        if (this.readOnlySlots.has(key)) {
            const reason = this.readOnlySlots.get(key) || "read failed";
            return Promise.reject(new Error(`[storage] slot "${key}" is read-only after Tier 1 load failure (${reason}); write blocked`));
        }
        return this.queueSave(key, data);
    }

    public saveOnce(key: string, operationId: string, data: unknown): Promise<void> {
        if (this.readOnlySlots.has(key)) {
            const reason = this.readOnlySlots.get(key) || "read failed";
            return Promise.reject(new Error(`[storage] slot "${key}" is read-only after Tier 1 load failure (${reason}); write blocked`));
        }
        const opKey = `${key}:${operationId}`;
        const prev = this.saveChains.get(opKey) || Promise.resolve();
        const currentSave = prev.then(
            () => (this.options.saveOnce ? this.options.saveOnce(key, operationId, data) : this.options.saveData(key, data)),
            () => (this.options.saveOnce ? this.options.saveOnce(key, operationId, data) : this.options.saveData(key, data)),
        );

        this.saveChains.set(opKey, currentSave);
        currentSave
            .catch(() => {})
            .finally(() => {
                if (this.saveChains.get(opKey) === currentSave) {
                    this.saveChains.delete(opKey);
                }
            });

        return currentSave;
    }

    public hasPendingWrites(): boolean {
        const hasTimers = Boolean(this.options.hasPendingTimers?.());
        return hasTimers || this.saveChains.size > 0;
    }

    // =========================================================================
    // 3. 全排空冲刷 (flush: allSettled 慢链/失败链/并发新写排空 + 50 轮上限)
    // =========================================================================

    public async flush(): Promise<void> {
        this.isFlushing = true;
        const flushErrors: unknown[] = [];
        const MAX_ROUNDS = 50;

        try {
            let rounds = 0;
            while (this.hasPendingWrites() && rounds < MAX_ROUNDS) {
                rounds++;

                // 1. 清空并触发待写定时器（如设置保存与 revlog 延时写入）
                if (this.options.triggerSettingsSave) {
                    try {
                        await this.options.triggerSettingsSave();
                    } catch (e) {
                        flushErrors.push(e);
                    }
                }
                if (this.options.triggerRevlogSave) {
                    try {
                        this.options.triggerRevlogSave();
                    } catch (e) {
                        flushErrors.push(e);
                    }
                }

                // 2. allSettled 等待当前在途写链全部结算，失败不中断排空、慢链不遗漏
                const activeChains = Array.from(this.saveChains.values());
                if (activeChains.length > 0) {
                    const results = await Promise.allSettled(activeChains);
                    for (const res of results) {
                        if (res.status === "rejected") {
                            flushErrors.push(res.reason);
                        }
                    }
                }
            }

            if (this.hasPendingWrites()) {
                const remainingKeys = Array.from(this.saveChains.keys());
                throw new Error(
                    `[StorageCoordinator] Flush failed to drain within ${MAX_ROUNDS} rounds: remaining [${remainingKeys.join(", ")}]`,
                );
            }

            if (flushErrors.length > 0) {
                const firstErr = flushErrors[0];
                const aggregate = Object.assign(
                    firstErr instanceof Error ? firstErr : new Error(String(firstErr)),
                    { flushErrors },
                );
                throw aggregate;
            }
        } finally {
            this.isFlushing = false;
        }
    }

    // =========================================================================
    // 4. 23 槽联合灾备切面 (dumpData / restoreData)
    // =========================================================================

    public async dumpData(): Promise<Record<string, unknown>> {
        await this.ensureTier2Loaded();
        return withExternalIntakeLock(() => this.dumpDataLocked());
    }

    private async dumpDataLocked(): Promise<Record<string, unknown>> {
        await this.ensureTier2Loaded();
        await this.flush();

        const stores = await this.readAllStores();
        return {
            v: 1,
            plugin: this.pluginName,
            timestamp: Date.now(),
            exportedAt: new Date().toISOString(),
            stores,
        };
    }

    public async restoreData(data: Record<string, unknown>): Promise<boolean> {
        await this.ensureTier2Loaded();
        return withExternalIntakeLock(() => this.restoreDataLocked(data));
    }

    private async restoreDataLocked(data: Record<string, unknown>): Promise<boolean> {
        await this.ensureTier2Loaded();
        if (!data || typeof data !== "object" || Array.isArray(data)) return false;
        const rawRestore = data.stores && typeof data.stores === "object" && !Array.isArray(data.stores)
            ? (data.stores as Record<string, unknown>)
            : data;
        const allowedKeys = new Set<string>(ALL_STORE_KEYS);
        const restoreFiles: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rawRestore)) {
            if (allowedKeys.has(k)) {
                restoreFiles[k] = v;
            }
        }
        if (Object.keys(restoreFiles).length === 0) return false;

        try {
            // 还原前先取消并丢弃内存中的防抖待写定时器，严禁在写盘后把旧内存覆写回刚还原的磁盘文件
            this.options.discardPendingTimers?.();
            const currentFiles = await this.readAllStores();
            if (Object.prototype.hasOwnProperty.call(restoreFiles, INTAKE_JOURNAL)) {
                assertSafeIntakeRestore(currentFiles[INTAKE_JOURNAL], restoreFiles[INTAKE_JOURNAL]);
                restoreFiles[INTAKE_JOURNAL] ??= { v: 1, entries: [] };
            }

            await applyRestoreTransaction({
                restoreFiles,
                currentFiles,
                saveFile: (key, val) =>
                    key === INTAKE_JOURNAL
                        ? writePluginJsonFile(this.pluginName, key, val ?? { v: 1, entries: [] })
                        : this.options.saveData(key, val),
                rollbackFailedKey: true,
                logError: (msg) => lvLog("error", msg),
            });

            if (Object.prototype.hasOwnProperty.call(restoreFiles, INTAKE_JOURNAL)) {
                const readback = await readPluginJsonFile(this.pluginName, INTAKE_JOURNAL);
                if (JSON.stringify(readback) !== JSON.stringify(restoreFiles[INTAKE_JOURNAL])) {
                    await writePluginJsonFile(
                        this.pluginName,
                        INTAKE_JOURNAL,
                        currentFiles[INTAKE_JOURNAL] ?? { v: 1, entries: [] },
                    );
                    throw new Error("Restored intake journal readback failed");
                }
            }

            for (const key of Object.keys(restoreFiles)) {
                this.clearSlotReadOnly(key);
            }
            this.options.discardPendingTimers?.();
            if (this.options.reloadLocalStoresBounded) {
                await this.options.reloadLocalStoresBounded(Object.keys(restoreFiles), { discardPending: true });
            }
            return true;
        } catch (e) {
            lvLog("error", `[lvBackup] restore failed: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
    }
}

export function createStorageCoordinator(options: StorageCoordinatorOptions): StorageCoordinator {
    return new StorageCoordinator(options);
}
