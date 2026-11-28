/**
 * 插件核心窄契约（Plugin Context & Narrow Contracts）
 * 建立明确的单向依赖边界，废除全量宿主上帝类透传。
 * 界面表面、应用服务与领域模型仅按需消费对应的窄契约。
 */
import type { IHostBridge } from "@/api/host-bridge";
import type { LvCardsSettings } from "./settings";

/**
 * 存储与持久化窄契约
 */
export interface ICardStorageContext {
    loadData(key: string): Promise<unknown>;
    saveData(key: string, data: unknown): Promise<void>;
    ensureTier2Loaded(): Promise<void>;
    dumpData(): Promise<Record<string, unknown>>;
    restoreData(data: Record<string, unknown>): Promise<boolean>;
    flush(): Promise<void>;
    readonly isTier2Ready: boolean;
}

/**
 * 复习宿主交互窄契约
 */
export interface IReviewHostContext {
    openReviewScope(options?: any): Promise<void> | void;
    openDashboard(): void;
    openAuthoring?(blockId?: string): void;
}

/**
 * AI 服务与熔断治理窄契约
 */
export interface IAIServiceContext {
    getKillSwitch(): unknown;
    getCostLedger(): unknown;
    recordUsage?(usage: unknown): Promise<void>;
}

/**
 * 统一插件上下文窄契约
 */
export interface IPluginContext {
    readonly name: string;
    readonly displayName: string;
    readonly i18n: Record<string, any>;
    readonly hostBridge: IHostBridge;
    readonly storage: ICardStorageContext;
    readonly eventBus: unknown;
    readonly isUnloading: boolean;
    getSettings(): LvCardsSettings;
    saveSettingsNow(): Promise<void>;
}

export interface IPluginContextOptions {
    name: string;
    displayName: string;
    i18n: Record<string, any>;
    hostBridge: IHostBridge;
    storage: ICardStorageContext;
    eventBus: unknown;
    getIsUnloading: () => boolean;
    getSettings: () => LvCardsSettings;
    saveSettingsNow: () => Promise<void>;
}

export class PluginContext implements IPluginContext {
    public readonly name: string;
    public readonly displayName: string;
    public readonly i18n: Record<string, any>;
    public readonly hostBridge: IHostBridge;
    public readonly storage: ICardStorageContext;
    public readonly eventBus: unknown;
    private readonly getIsUnloadingFn: () => boolean;
    private readonly getSettingsFn: () => LvCardsSettings;
    private readonly saveSettingsNowFn: () => Promise<void>;

    constructor(options: IPluginContextOptions) {
        this.name = options.name;
        this.displayName = options.displayName;
        this.i18n = options.i18n;
        this.hostBridge = options.hostBridge;
        this.storage = options.storage;
        this.eventBus = options.eventBus;
        this.getIsUnloadingFn = options.getIsUnloading;
        this.getSettingsFn = options.getSettings;
        this.saveSettingsNowFn = options.saveSettingsNow;
    }

    public get isUnloading(): boolean {
        return this.getIsUnloadingFn();
    }

    public getSettings(): LvCardsSettings {
        return this.getSettingsFn();
    }

    public async saveSettingsNow(): Promise<void> {
        return await this.saveSettingsNowFn();
    }
}

export function createPluginContext(options: IPluginContextOptions): IPluginContext {
    return new PluginContext(options);
}
