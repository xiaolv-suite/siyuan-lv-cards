/**
 * 页签与工作台路由开启器（Tab Openers）
 * 统管桌面端多页签防重入复用激活、单实例工作面切换与移动端全屏弹窗分流。
 */

import { DEFAULT_HUB_HOME_TAB, TAB_DASHBOARD, TAB_REVIEW } from "@/bootstrap/tab-constants";
import type { TabOpenerHost } from "@/bootstrap/tab-host";

interface HostTabLike {
    tab?: { id?: string };
    model?: { type?: string };
    id?: string;
    parent?: { switchTab?: (head: HTMLElement) => void };
    headElement?: HTMLElement;
    panelElement?: HTMLElement;
}

function matchesPluginTab(tab: HostTabLike | null | undefined, customId: string): boolean {
    if (!tab) return false;
    if (tab.tab?.id === customId || tab.model?.type === customId || tab.id === customId) {
        return true;
    }
    const initData = tab.headElement?.getAttribute?.("data-initdata");
    if (!initData) return false;
    try {
        const parsed = JSON.parse(initData) as { instance?: string; customModelType?: string };
        return parsed?.instance === "Custom" && parsed?.customModelType === customId;
    } catch {
        return false;
    }
}

function focusExistingTab(tab: HostTabLike): void {
    if (tab.headElement && typeof tab.parent?.switchTab === "function") {
        tab.parent.switchTab(tab.headElement);
        return;
    }
    tab.headElement?.click?.();
}

export function openPluginTab(plugin: TabOpenerHost, type: string, data?: Record<string, unknown>): void {
    const isDashboard = type === TAB_DASHBOARD || type === "dashboard";
    const isReview = type === TAB_REVIEW || type === "review";
    const canonicalType = isDashboard ? TAB_DASHBOARD : (isReview ? TAB_REVIEW : type);

    if (plugin.isMobileHost()) {
        if (isDashboard) {
            void plugin.openHubMobileDialog(data);
            return;
        }
        if (isReview) {
            void plugin.mobileDialogController.openReviewMobileDialog(data);
            return;
        }
    }

    const targetTab = isDashboard
        ? ((typeof data?.tab === "string" && data.tab) ? data.tab : DEFAULT_HUB_HOME_TAB)
        : undefined;
    const focusBlockID = typeof data?.focusBlockID === "string" ? data.focusBlockID : undefined;

    if (isDashboard && targetTab) {
        plugin.pendingHubRequest = { tab: targetTab, focusBlockID };
    }

    const customId = `${plugin.name}${canonicalType}`;
    const openedTabs = plugin.hostBridge.getAllTabs() as HostTabLike[];
    const existing = openedTabs.find((t) => matchesPluginTab(t, customId));
    if (existing) {
        focusExistingTab(existing);
        if (isDashboard && targetTab) {
            const hubEl = existing.panelElement?.querySelector?.(".lv-hub");
            if (hubEl) {
                plugin.pendingHubRequest = null;
                hubEl.dispatchEvent(new CustomEvent("lv-switch-tab", { detail: { tab: targetTab, focusBlockID } }));
            }
        } else if (isReview) {
            const reviewEl = existing.panelElement?.querySelector?.(".lv-review");
            if (reviewEl) {
                const detailPayload = { ...(data ?? {}), cram: Boolean(data?.cram) };
                reviewEl.dispatchEvent(new CustomEvent("lv-switch-scope", { detail: detailPayload }));
                reviewEl.dispatchEvent(new CustomEvent("lv-switch-review", { detail: detailPayload }));
            }
        }
        return;
    }
    const customData = isDashboard && targetTab
        ? { ...(data ?? {}), tab: targetTab }
        : data;
    void plugin.hostBridge.openTab({
        app: plugin.app,
        custom: {
            id: customId,
            icon: "iconLvCards",
            title: isReview ? (plugin.i18n?.menuReview ?? "复习") : (plugin.i18n?.menuDashboard ?? "闪卡中心"),
            data: customData,
        },
    });
}
