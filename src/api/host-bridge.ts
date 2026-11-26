/**
 * 宿主与生态网桥中枢（HostBridge）
 * 集中管理选区提取、文档路径解析、多端环境识别、内核 HTTP 调用、页签/移动文件打开与生态事件转发。
 * 严禁反向依赖上层业务或插件主入口，具备 100% 无 DOM/SSR/单测降级容错。
 */
import {
    fetchSyncPost,
    showMessage,
    openTab as siyuanOpenTab,
    getAllTabs as siyuanGetAllTabs,
    openMobileFileById as siyuanOpenMobileFileById,
} from "siyuan";
import { requestKernelData, type KernelRequestOptions } from "@/libs/kernel-request";
import { withDocLock } from "@/libs/notice";
import { isMobileFrontend } from "@/libs/lv-notice-kit";

export interface SelectionInfo {
    text: string;
    blockId: string | null;
}

export interface DocPathInfo {
    title: string;
    path: string;
}

export interface IHostBridgeOptions {
    pluginName?: string;
    fetchKernelJson?: (endpoint: string, payload?: any, timeoutOrOptions?: any, options?: any) => Promise<any>;
    showNotice?: (message: string, timeoutMs?: number, icon?: "info" | "error") => void;
    withDocLock?: <T>(docId: string, action: () => Promise<T>) => Promise<T>;
    isMobile?: boolean;
    emitEcosystemEvent?: (event: string, detail?: any) => void;
    subscribeEcosystemEvent?: (event: string, handler: (detail: any) => void) => () => void;
    getAllTabs?: () => any[];
    getActiveTab?: () => any | null;
    openTab?: (options: any) => Promise<any>;
    closeTab?: (tabId: string) => Promise<boolean>;
    openMobileFile?: (app: any, docId: string, actions?: any[]) => void;
}

export interface IHostBridge {
    readonly pluginName: string;
    fetchKernelJson<T = any>(endpoint: string, payload?: any, timeoutOrOptions?: any, options?: any): Promise<T>;
    showNotice(message: string, timeoutMs?: number, icon?: "info" | "error"): void;
    withDocLock<T>(docId: string, action: () => Promise<T>): Promise<T>;
    isMobile(): boolean;
    emitEcosystemEvent(event: string, detail?: any): void;
    subscribeEcosystemEvent(event: string, handler: (detail: any) => void): () => void;
    getAllTabs(): any[];
    getActiveTab(): any | null;
    openTab(options: any): Promise<any>;
    closeTab(tabId: string): Promise<boolean>;
    openMobileFile(app: any, docId: string, actions?: any[]): void;
    getSelectionInfo(): SelectionInfo;
    getSelectionText(): string;
    parseDocPath(path: string | null | undefined): DocPathInfo;
    resolveTargetHPath(docTitle: string, isHubNb?: boolean): string;
}

export class HostBridge implements IHostBridge {
    public readonly pluginName: string;
    private readonly options: IHostBridgeOptions;

    public readonly callCounts = {
        fetchKernelJson: 0,
        showNotice: 0,
        withDocLock: 0,
        isMobile: 0,
        emitEcosystemEvent: 0,
        subscribeEcosystemEvent: 0,
        getAllTabs: 0,
        getActiveTab: 0,
        openTab: 0,
        closeTab: 0,
        openMobileFile: 0,
        getSelectionInfo: 0,
        getSelectionText: 0,
        parseDocPath: 0,
        resolveTargetHPath: 0,
    };

    constructor(options: IHostBridgeOptions = {}) {
        this.options = options;
        this.pluginName = options.pluginName || "siyuan-lv-cards";
    }

    public async fetchKernelJson<T = any>(
        endpoint: string,
        payload?: any,
        timeoutOrOptions?: any,
        options?: any,
    ): Promise<T> {
        this.callCounts.fetchKernelJson++;
        if (this.options.fetchKernelJson) {
            return await this.options.fetchKernelJson(endpoint, payload, timeoutOrOptions, options);
        }

        if (typeof endpoint !== "string" || !endpoint.startsWith("/")) {
            throw new Error(`Invalid kernel endpoint: ${endpoint}`);
        }

        const timeoutMs = typeof timeoutOrOptions === "number" ? timeoutOrOptions : 15000;
        const reqOpts: KernelRequestOptions = typeof timeoutOrOptions === "object" ? timeoutOrOptions : (options || {});
        return await requestKernelData<T>(fetchSyncPost, endpoint, payload ?? {}, timeoutMs, reqOpts);
    }

    public showNotice(message: string, timeoutMs = 6000, icon?: "info" | "error"): void {
        this.callCounts.showNotice++;
        if (this.options.showNotice) {
            this.options.showNotice(message, timeoutMs, icon);
            return;
        }
        try {
            if (typeof showMessage === "function") {
                showMessage(message, timeoutMs, icon);
            }
        } catch {
            // SSR/Node 降级
        }
    }

    public async withDocLock<T>(docId: string, action: () => Promise<T>): Promise<T> {
        this.callCounts.withDocLock++;
        if (this.options.withDocLock) {
            return await this.options.withDocLock(docId, action);
        }
        return await withDocLock(docId, action);
    }

    public isMobile(): boolean {
        this.callCounts.isMobile++;
        if (typeof this.options.isMobile === "boolean") {
            return this.options.isMobile;
        }
        try {
            return isMobileFrontend();
        } catch {
            return false;
        }
    }

    public emitEcosystemEvent(event: string, detail?: any): void {
        this.callCounts.emitEcosystemEvent++;
        if (this.options.emitEcosystemEvent) {
            this.options.emitEcosystemEvent(event, detail);
            return;
        }
        try {
            if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
                window.dispatchEvent(new CustomEvent(event, { detail }));
            }
        } catch {
            // SSR / Node 降级
        }
    }

    public subscribeEcosystemEvent(event: string, handler: (detail: any) => void): () => void {
        this.callCounts.subscribeEcosystemEvent++;
        if (this.options.subscribeEcosystemEvent) {
            return this.options.subscribeEcosystemEvent(event, handler);
        }
        try {
            if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
                const listener = (e: Event) => {
                    const custom = e as CustomEvent;
                    handler(custom.detail);
                };
                window.addEventListener(event, listener);
                return () => {
                    window.removeEventListener(event, listener);
                };
            }
        } catch {
            // SSR / Node 降级
        }
        return () => {};
    }

    public getAllTabs(): any[] {
        this.callCounts.getAllTabs++;
        if (this.options.getAllTabs) {
            return this.options.getAllTabs();
        }
        try {
            if (typeof siyuanGetAllTabs === "function") {
                return siyuanGetAllTabs() || [];
            }
        } catch {
            // fallback
        }
        return [];
    }

    public getActiveTab(): any | null {
        this.callCounts.getActiveTab++;
        if (this.options.getActiveTab) {
            return this.options.getActiveTab();
        }
        return null;
    }

    public async openTab(tabOptions: any): Promise<any> {
        this.callCounts.openTab++;
        if (this.options.openTab) {
            return await this.options.openTab(tabOptions);
        }
        try {
            if (typeof siyuanOpenTab === "function") {
                return siyuanOpenTab(tabOptions);
            }
        } catch {
            // fallback
        }
        return null;
    }

    public async closeTab(tabId: string): Promise<boolean> {
        this.callCounts.closeTab++;
        if (this.options.closeTab) {
            return await this.options.closeTab(tabId);
        }
        const tabs = this.getAllTabs();
        const target = tabs.find((t: any) => t?.id === tabId);
        if (target && typeof target.close === "function") {
            target.close();
            return true;
        }
        return false;
    }

    public openMobileFile(app: any, docId: string, actions: any[] = ["cb-get-focus", "cb-get-hl"]): void {
        this.callCounts.openMobileFile++;
        if (this.options.openMobileFile) {
            this.options.openMobileFile(app, docId, actions);
            return;
        }
        try {
            if (typeof siyuanOpenMobileFileById === "function") {
                siyuanOpenMobileFileById(app, docId, actions);
            }
        } catch {
            // fallback
        }
    }

    public getSelectionInfo(): SelectionInfo {
        this.callCounts.getSelectionInfo++;
        if (typeof window === "undefined") return { text: "", blockId: null };
        try {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return { text: "", blockId: null };
            const text = sel.isCollapsed ? "" : sel.toString();
            let node: Node | null = sel.anchorNode;
            while (node && !(node instanceof Element)) node = node.parentNode;
            const el = node as Element | null;
            const block = el?.closest?.("[data-node-id]") as HTMLElement | null;
            return { text, blockId: block?.getAttribute("data-node-id") ?? null };
        } catch {
            return { text: "", blockId: null };
        }
    }

    public getSelectionText(): string {
        this.callCounts.getSelectionText++;
        if (typeof window === "undefined") return "";
        try {
            const sel = window.getSelection();
            return sel ? sel.toString().trim() : "";
        } catch {
            return "";
        }
    }

    public parseDocPath(path: string | null | undefined): DocPathInfo {
        this.callCounts.parseDocPath++;
        if (!path || typeof path !== "string") return { title: "", path: "" };
        const segments = path.split("/").filter(Boolean);
        const title = segments.pop() ?? path;
        return { title, path };
    }

    public resolveTargetHPath(docTitle: string, isHubNb = false): string {
        this.callCounts.resolveTargetHPath++;
        const cleanTitle = (docTitle || "").trim();
        return isHubNb ? `/07-小驴闪卡/${cleanTitle}` : `/${cleanTitle}`;
    }
}

export function createHostBridge(options: IHostBridgeOptions = {}): HostBridge {
    return new HostBridge(options);
}
