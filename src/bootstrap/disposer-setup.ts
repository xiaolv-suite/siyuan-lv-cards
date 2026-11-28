/**
 * 插件生命周期注销中枢配置（Disposer Setup）
 */

export function setupLifecycleDisposers(plugin: any): void {
    plugin.disposerRegistry.register(() => {
        const p = plugin.paletteState;
        plugin.paletteState = undefined;
        p?.close?.();
    });
    plugin.disposerRegistry.register(() => plugin.mobileDialogController.closeAll());
    plugin.disposerRegistry.register(() => {
        plugin.topbarController?.destroy();
        plugin.topbarController = null;
    });
    plugin.disposerRegistry.register(() => {
        if (plugin.docSyncTimer) { clearTimeout(plugin.docSyncTimer); plugin.docSyncTimer = null; }
        if (plugin.onboardingTimer) { clearTimeout(plugin.onboardingTimer); plugin.onboardingTimer = null; }
        if (plugin.reloadTimer) { clearTimeout(plugin.reloadTimer); plugin.reloadTimer = null; }
        if (plugin.badgeTimer) { clearInterval(plugin.badgeTimer); plugin.badgeTimer = null; }
        if (plugin.badgeTimerUnsub) { plugin.badgeTimerUnsub(); plugin.badgeTimerUnsub = null; }
    });
    plugin.disposerRegistry.register(() => plugin.storageCoordinator?.cancelTier2Schedule());
    plugin.disposerRegistry.register(() => {
        if (typeof document !== "undefined") document.body.removeAttribute("data-lv-card-badge");
    });
    plugin.disposerRegistry.register(() => plugin.unbindExamPlansSync());
}
