/**
 * 插件底层存储与持久化装配器（Storage Setup）
 * 统管 createPersist 唯一队列（串行/重试/失败通知/时间戳）与 StorageCoordinator 协同。
 */

import { createPersist, type PersistQueue } from "@/libs/persist";
import { createStorageCoordinator, type StorageCoordinator } from "@/core/storage-coordinator";
import { loadHubServices } from "@/bootstrap/chunk-loaders";
import { AI_JOBS_DATA } from "@/bootstrap/storage-keys";
import type { AIJobsData } from "@/core/ai-jobs";
import { lvLog } from "@/libs/log";

function cloneStore<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

export class AiJobsPersistenceCoordinator {
    private persistedSnapshot: AIJobsData | null = null;
    private mutationVersion = 0;

    public async persist(plugin: any, previous: AIJobsData): Promise<void> {
        await plugin.ensureTier2Loaded();
        const version = ++this.mutationVersion;
        const next = cloneStore(plugin.aiJobs);
        try {
            await plugin.storageCoordinator.save(AI_JOBS_DATA, next);
            this.persistedSnapshot = cloneStore(next);
        } catch (err) {
            if (version === this.mutationVersion) {
                plugin.aiJobs = cloneStore(this.persistedSnapshot ?? previous);
            }
            throw err;
        }
    }

    public async persistOnce(plugin: any, operationId: string): Promise<void> {
        await plugin.ensureTier2Loaded();
        const version = ++this.mutationVersion;
        const next = cloneStore(plugin.aiJobs);
        try {
            await plugin.storageCoordinator.saveOnce(AI_JOBS_DATA, operationId, next);
            this.persistedSnapshot = cloneStore(next);
        } catch (err) {
            if (version === this.mutationVersion && this.persistedSnapshot) {
                plugin.aiJobs = cloneStore(this.persistedSnapshot);
            }
            throw err;
        }
    }

    public getPersistedSnapshot(): AIJobsData | null {
        return this.persistedSnapshot;
    }
}

export function setupStorageInfrastructure(plugin: any) {
    let hadPersistFail = false;
    let lastPersistToast = 0;

    const trackSave = (file: string) => {
        plugin.storageLastWrite[file] = Date.now();
        if (hadPersistFail) {
            hadPersistFail = false;
            try { plugin.showNotice(String(plugin.i18n.settingsSaved ?? "设置已保存"), 1500, "info"); } catch {}
        }
    };

    const notifyPersistFail = (error?: any) => {
        if (plugin.isUnloading) return;
        const msg = String(error?.message || error?.msg || "");
        if (error?.code === 410 || msg.includes("lifecycle has ended") || msg.includes("Plugin lifecycle")) {
            lvLog("info", `persist ignored on unloaded plugin: ${msg || "lifecycle ended"}`);
            return;
        }
        hadPersistFail = true;
        const now = Date.now();
        if (now - lastPersistToast < 30000) return;
        lastPersistToast = now;
        plugin.showStorageFail();
    };

    const persist: PersistQueue = createPersist((k, d) => plugin.saveData(k, d), {
        attempts: 3,
        retryDelayMs: 600,
        onOk: k => trackSave(k),
        onFail: (k, err) => {
            lvLog("error", `persist ${k} failed: ${err.message}`);
            notifyPersistFail(err);
        },
    });

    const storageCoordinator: StorageCoordinator = createStorageCoordinator({
        pluginName: "siyuan-lv-cards",
        loadData: (k) => plugin.loadData(k),
        saveData: (k, d) => persist.save(k, d),
        saveOnce: (k, id, d) => persist.saveOnce(k, id, d),
        applyTier1Stores: (l) => plugin.applyTier1Stores(l),
        applyTier2Stores: (l) => plugin.applyTier2Stores(l),
        reloadLocalStoresBounded: (k, opts) => plugin.reloadLocalStoresBounded(k, opts),
        getIsUnloading: () => plugin.isUnloading,
        triggerRevlogSave: () => { if (plugin.saveRevlogTimer) plugin.flushRevlogSave(); },
        triggerSettingsSave: async () => {
            if (plugin.settingsSaveTimer) {
                clearTimeout(plugin.settingsSaveTimer);
                plugin.settingsSaveTimer = null;
                await plugin.saveSettingsNow();
            }
        },
        discardPendingTimers: () => {
            if (plugin.saveRevlogTimer) {
                clearTimeout(plugin.saveRevlogTimer);
                plugin.saveRevlogTimer = null;
            }
            if (plugin.settingsSaveTimer) {
                clearTimeout(plugin.settingsSaveTimer);
                plugin.settingsSaveTimer = null;
            }
        },
        hasPendingTimers: () => Boolean(plugin.saveRevlogTimer || plugin.settingsSaveTimer),
        loadHubServices,
    });

    return { persist, storageCoordinator, trackSave, notifyPersistFail };
}
