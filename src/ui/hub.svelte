<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import { fade } from "svelte/transition";
    import LvTabs from "./kit/LvTabs.svelte";
    import LvIcon, { type LvIconName } from "./kit/LvIcon.svelte";
    import Dashboard from "./dashboard.svelte";
    import Manager from "./manager.svelte";
    import DeckManager from "./deck-manager.svelte";
    import MarketplaceStudio from "./marketplace-studio.svelte";
    import StudioWorkbench from "./studio-workbench.svelte";
    import RecoveryPage from "./recovery-page.svelte";
    import type { DashboardCtx } from "./dashboard.svelte";
    import type { ManagerCtx } from "./manager.svelte";
    import type { ExamPlan, ExamPlansData, ExamScopeKind } from "@/core/exam";
    import type { InboxData, InboxStatus } from "@/core/inbox";
    import type { LearningGoal, LearningGoalsData } from "@/core/learning-goal";
    import { getMotionDuration } from "./kit/motion";

    type RecoverySnapshot = {
        aiJobs: {
            id: string; status: string; pending: number; failed: number; created: number; source: string;
            canReview: boolean; needsWriteCheck: boolean; deckID: string;
        }[];
        inboxCount: number;
        suspendedCount: number;
        session: { date: string; reviewed: number; skipped: number } | null;
    };

    let {
        i18n, dashboardBase, managerCtx, exam, inbox, goals, maintenance, recovery, uiMode = "advanced", initialTab = "overview", initialBlockID = "", onTabChange, onCloseMobile,
        openWizard, openDrill, openChallenge, openPairing, openQuickCard, loadWizardView, loadQuickCardView, openSettings, openPalette, getSettingsHealth,
    }: {
        i18n: any;
        /** 总览页上下文（不含 openManager，由 Hub 内部切换页签实现） */
        dashboardBase: Omit<DashboardCtx, "openManager">;
        managerCtx: ManagerCtx;
        /** T02 工作台入口页：向导与修卡演练（可选——旧宿主不传则页签隐藏） */
        openWizard?: () => void;
        openDrill?: () => void;
        openChallenge?: () => void;
        openPairing?: () => void;
        /** 手工制卡入口：R54 制卡工作台的快速入口，仍复用现有 quick-card 业务。 */
        openQuickCard?: () => void;
        /** Hub 内嵌 AI 向导和手工制卡组件的懒加载构造器。 */
        loadWizardView?: (
            sources?: { label: string; content: string; docId?: string; nbId?: string; inboxId?: string }[],
            onImportComplete?: (ids: string[]) => void,
            recoveryJobId?: string,
        ) => Promise<{ Component: any; props: Record<string, any> }>;
        loadQuickCardView?: () => Promise<{ Component: any; props: Record<string, any> }>;
        /** 设置保持独立 dialogs chunk；主导航只负责提供稳定入口。 */
        openSettings?: (onSaved?: () => void) => void;
        /** 顶栏搜索/命令面板入口；保持命令面板在 dialogs chunk 懒加载。 */
        openPalette?: () => void;
        /** 只提供非敏感的配置状态，不向 UI 暴露密钥或端点。 */
        getSettingsHealth?: () => { aiConfigured: boolean };
        /** 考试子页数据通道；null = 模块关闭 */
        exam: {
            plans: ExamPlansData;
            getPlans: () => ExamPlansData;
            subscribe: (cb: () => void) => () => void;
            onSavePlan: (plan: ExamPlan) => Promise<ExamPlansData>;
            onDeletePlan: (id: string) => Promise<ExamPlansData>;
            onReviewScope: (scopeKind: ExamScopeKind, scopeId: string, cram: boolean) => void;
            onReport: (plan: ExamPlan) => void;
            onWriteReport: (plan: ExamPlan) => void;
            onError: (message: string) => void;
            /** AQ-8 动态建议只读输入 */
            getRevlog: () => import("@/core/revlog").RevlogData;
            getDailyCap: () => number;
        } | null;
        /** BI-4 材料筛选收件箱通道；null = 模块关闭 */
        inbox: {
            get: () => InboxData;
            subscribe: (cb: () => void) => () => void;
            setStatus: (blockIDs: string[], status: InboxStatus) => InboxData;
            undoSelection: (blockIDs: string[]) => InboxData;
            remove: (blockIDs: string[]) => InboxData;
            add: (blockIDs: string[]) => number;
            loadSourcesForCards: (blockIDs: string[]) => Promise<{ label: string; content: string; docId?: string; inboxId: string }[]>;
            completeCards: (blockIDs: string[]) => void;
            openSource: (blockID: string) => Promise<void>;
            titles: (ids: string[]) => Promise<Map<string, string>>;
        } | null;
        /** BI-1 学习目标通道（只记录目标不强迫建卡） */
        goals: {
            get: () => LearningGoalsData;
            save: (goal: LearningGoal) => LearningGoalsData | Promise<LearningGoalsData>;
            remove: (id: string) => LearningGoalsData | Promise<LearningGoalsData>;
        };
        /** BI-25 维护债务通道（只读扫描 + 今日暂缓可逆 + 回来源） */
        maintenance: {
            scan: () => Promise<{ items: { blockID: string; md: string; memo?: string; state?: string; rootID?: string; occlusion?: boolean; exists?: boolean; mediaRefs?: string[]; mediaBroken?: string[]; mediaUnknown?: string[]; sourceHealthIssues?: { kind: string; detail: string }[] }[]; sourceHealthHistory?: import("@/core/source-health-store").SourceHealthHistoryItem[]; error?: string }>;
            previewRepair: (proposals: { blockID: string; afterMarkdown: string; expectedMarkdown?: string; reason?: string }[]) => Promise<{
                previewID: string;
                ok: boolean;
                errors: string[];
                diffs: { blockID: string; action: string; beforeMarkdown?: string; afterMarkdown?: string; errors?: string[] }[];
                summary: { update: number; unchanged: number; rejected: number };
            }>;
            applyRepair: (previewID: string) => Promise<{ blockIDs: string[] }>;
            getLastRepairRecord?: () => {
                previewID: string;
                appliedAt: number;
                summary: { update: number; unchanged: number; rejected: number };
                diffs: { blockID: string; action: string; beforeMarkdown?: string; afterMarkdown?: string; errors?: string[] }[];
            } | null;
            rollbackLastRepair?: () => Promise<{ blockIDs: string[]; previewID: string }>;
            acknowledgeSourceHealth?: (blockID: string) => Promise<void>;
            suspendToday: (blockIDs: string[]) => void;
            unsuspendToday: (blockIDs: string[]) => void;
            isSuspendedToday: (blockID: string) => boolean;
            openSource: (blockID: string) => Promise<void>;
            openCard: (blockID: string) => void;
        };
        recovery: { load: () => Promise<RecoverySnapshot> };
        /** BI-14：界面模式（simple=隐藏考试/维护高级入口；纯显示控制） */
        uiMode?: "simple" | "advanced";
        initialTab?: string;
        initialBlockID?: string;
        onTabChange?: (id: string) => void;
        onCloseMobile?: () => void;
    } = $props();

    // R54 主导航只保留五个稳定入口；旧 route id 继续作为内部页面 id，
    // 这样命令面板、回源点和旧版本保存的 lastHubTab 都不需要迁移。
    // svelte-ignore state_referenced_locally -- i18n and module switches are fixed for the Hub mount.
    let dueCount = $state<number | null>(null);
    const primaryTabs = $derived(([
        {
            id: "today",
            label: i18n.hubPrimaryToday ?? "今日",
            icon: "home",
            badge: dueCount === null || dueCount <= 0 ? undefined : dueCount,
            badgeLabel: dueCount === null || dueCount <= 0
                ? undefined
                : (i18n.hubDueCount ?? "待复习 ${count} 张").replace("${count}", String(dueCount)),
        },
        { id: "library", label: i18n.hubPrimaryLibrary ?? "卡库", icon: "cards" },
        { id: "marketplace", label: i18n.hubPrimaryMarketplace ?? "集市", icon: "store" },
        { id: "studio", label: i18n.hubPrimaryStudio ?? "制卡", icon: "plus" },
        { id: "learning", label: i18n.hubPrimaryLearning ?? "学习", icon: "learn" },
        { id: "settings", label: i18n.hubPrimarySettings ?? "设置", icon: "settings" },
    ] satisfies { id: string; label: string; icon: LvIconName; badge?: string | number; badgeLabel?: string }[]));
    // Mobile Spec v1：手机端底部主导航收敛 ≤5 项——按手机用户心智排序：今日刷卡 → 卡库 → 学习复盘 → 集市 → 制卡（制卡靠右降级）
    const mobileTabs = $derived([
        primaryTabs.find(t => t.id === "today"),
        primaryTabs.find(t => t.id === "library"),
        primaryTabs.find(t => t.id === "learning"),
        primaryTabs.find(t => t.id === "marketplace"),
        primaryTabs.find(t => t.id === "studio"),
    ].filter((t): t is NonNullable<typeof t> => Boolean(t)));
    // 外部入口仍使用这些旧 id。它们是上下文页面，不再全部挤在一级导航。
    // svelte-ignore state_referenced_locally -- legacy routes are fixed for the Hub mount.
    const legacyTabs = [
        { id: "overview", label: i18n.hubTabOverview },
        { id: "manage", label: i18n.hubTabManage },
        { id: "marketplace", label: i18n.hubTabMarketplace ?? "闪卡集市" },
        ...(openWizard || openQuickCard ? [{ id: "authoring", label: i18n.hubTabAuthoring }] : []),
        { id: "goals", label: i18n.hubTabGoals },
        ...(inbox ? [{ id: "inbox", label: i18n.hubTabInbox }] : []),
        ...(exam && uiMode !== "simple" ? [{ id: "exam", label: i18n.hubTabExam }] : []),
        ...(uiMode !== "simple" ? [{ id: "maintenance", label: i18n.hubTabMaintenance }] : []),
        { id: "recovery", label: i18n.hubTabRecovery ?? "待处理与恢复" },
    ];
    // 简洁模式隐藏高级导航，但今日建议与恢复中心仍可直达维护闭环。
    const knownIds = new Set(["today", "library", "marketplace", "studio", "learning", "settings", "decks", "maintenance", ...legacyTabs.map(t => t.id)]);
    function initialRoute(id: string): string {
        if (id === "settings") return "settings";
        // 旧入口「goals」仍保留兼容，但落到完整学习页的目标与计划分面。
        if (id === "goals") return "learning";
        if (knownIds.has(id) && (id === "overview" || id === "manage" || id === "marketplace" || id === "authoring" || id === "goals" || id === "inbox" || id === "exam" || id === "decks" || id === "maintenance" || id === "recovery")) return id;
        if (id === "library") return "manage";
        if (id === "marketplace") return "marketplace";
        if (id === "studio") return "authoring";
        if (id === "learning") return "learning";
        return "overview";
    }
    // svelte-ignore state_referenced_locally
    let active = $state(initialRoute(initialTab));
    // 旧的 goals 深链默认打开「目标与计划」；点击新的学习入口则回到回顾分面。
    // svelte-ignore state_referenced_locally -- deep-link value is copied once for this Hub mount.
    let learningTabRequest = $state(initialTab === "goals" ? "plans" : "recap");
    let learningViewKey = $state(0);
    // svelte-ignore state_referenced_locally -- the initial focus is copied once; later requests arrive through the switch event.
    let managerInitialBlockID = $state(initialBlockID);

    function primaryFor(route: string): string {
        if (route === "marketplace") return "marketplace";
        if (route === "manage" || route === "decks" || route === "maintenance") return "library";
        if (route === "authoring" || route === "inbox") return "studio";
        if (route === "learning" || route === "goals" || route === "exam") return "learning";
        return route === "settings" ? "settings" : "today";
    }

    // svelte-ignore state_referenced_locally
    let plans = $state(exam?.plans ?? { version: 1 as const, plans: [] });
    let unsubscribeExamPlans: (() => void) | null = null;
    // svelte-ignore state_referenced_locally -- host health callback is stable for this Hub mount.
    let settingsHealth = $state(getSettingsHealth?.() ?? { aiConfigured: false });
    // svelte-ignore state_referenced_locally -- inbox source is fixed for this Hub lifetime.
    let inboxOpenCount = $state(inbox?.get().items.filter(item => item.status !== "dismissed").length ?? 0);
    let unsubscribeInbox: (() => void) | null = null;
    let studioInboxSeq = 0;
    let studioInboxRequest = $state<{
        id: number;
        sources: { label: string; content: string; docId?: string; inboxId: string }[];
        onImportComplete: (ids: string[]) => void;
    } | null>(null);
    let studioManualSeq = $state(0);
    let studioAISeq = $state(0);
    let managerDeckScope = $state<{ id: string; name: string } | null>(null);
    // 维护页打开卡片时建立一次性返回点；保存成功后由管理器回到维护页，
    // 维护页重新挂载并自动执行扫描。
    let managerReturnToMaintenance = $state("");

    function openFullSettings() {
        openSettings?.(() => {
            settingsHealth = getSettingsHealth?.() ?? settingsHealth;
        });
    }

    // svelte-ignore state_referenced_locally
    function openStudioManual() {
        studioManualSeq++;
        switchTab("authoring");
    }

    let studioAIRecoveryJobId = $state("");
    function openStudioAI(recoveryJobId?: string) {
        studioAIRecoveryJobId = recoveryJobId ?? "";
        studioAISeq++;
        switchTab("authoring");
    }

    function openRecoveryDeck(deckID: string) {
        managerDeckScope = { id: deckID, name: i18n.recoveryCenter?.aiDeckLabel ?? "AI 作业目标卡组" };
        switchTab("manage", true);
    }

    function openManagerDeck(deckID: string, deckName: string) {
        managerDeckScope = { id: deckID, name: deckName };
        switchTab("manage", true);
    }

    // svelte-ignore state_referenced_locally -- host callbacks and context are fixed for this Hub mount.
    const dctx: DashboardCtx = {
        ...dashboardBase,
        openReviewScope: (scopeKey: string, cram?: boolean) => (dashboardBase as any).openReviewScope ? (dashboardBase as any).openReviewScope(scopeKey, cram) : (dashboardBase as any).openReview({ scope: scopeKey, cram }),
        onDueCount: (count) => (dueCount = count),
        openManager: () => switchTab("manage"),
        openManagerDeck,
        openQuickCard: loadQuickCardView ? openStudioManual : undefined,
        openAIWizard: openStudioAI,
        openHubTab: (id) => switchTab(id),
        enrollDormantBlocks: inbox?.add ? async (blockIDs: string[]) => {
            let count = 0;
            for (const id of blockIDs) {
                if (inbox.add([id])) count++;
            }
            return count;
        } : undefined,
    };

    // 考试子页懒加载（体积预算 670）：首次切到考试页才拉取 chunk
    let ExamComp = $state<any>(null);
    let examError = $state("");
    async function ensureExam() {
        if (ExamComp || !exam) { return; }
        examError = "";
        try {
            ExamComp = (await import("./exam-page.svelte")).default;
        } catch (e: any) {
            examError = e?.message ?? String(e);
        }
    }
    $effect(() => {
        if (active === "exam") { ensureExam(); }
    });
    // 初值语义：首帧按入口参数直达考试页；此后由 switchTab 驱动
    // svelte-ignore state_referenced_locally
    if (active === "exam") { ensureExam(); }

    // BI-4 收件箱子页懒加载（同考试页模式：首次切到才拉 chunk）
    let InboxComp = $state<any>(null);
    let inboxError = $state("");
    async function ensureInbox() {
        if (InboxComp || !inbox) { return; }
        inboxError = "";
        try {
            InboxComp = (await import("./inbox-page.svelte")).default;
        } catch (e: any) {
            inboxError = e?.message ?? String(e);
        }
    }
    $effect(() => {
        if (active === "inbox") { ensureInbox(); }
    });
    // svelte-ignore state_referenced_locally
    if (active === "inbox") { ensureInbox(); }

    // R54 学习页懒加载：回顾 / 目标与计划 / 学习日历共用一个稳定入口。
    let LearningComp = $state<any>(null);
    let learningError = $state("");
    async function ensureLearning() {
        if (LearningComp) return;
        learningError = "";
        try {
            LearningComp = (await import("./learning-page.svelte")).default;
        } catch (e: any) {
            learningError = e?.message ?? String(e);
        }
    }
    $effect(() => {
        if (active === "learning") void ensureLearning();
    });
    // svelte-ignore state_referenced_locally
    if (active === "learning") void ensureLearning();

    // BI-25 维护子页懒加载（同考试页模式：首次切到才拉 chunk）
    let MaintComp = $state<any>(null);
    let maintError = $state("");
    async function ensureMaint() {
        if (MaintComp) { return; }
        maintError = "";
        try {
            MaintComp = (await import("./maintenance-page.svelte")).default;
        } catch (e: any) {
            maintError = e?.message ?? String(e);
        }
    }
    $effect(() => {
        if (active === "maintenance") { ensureMaint(); }
    });
    // svelte-ignore state_referenced_locally
    if (active === "maintenance") { ensureMaint(); }

    let RecoveryComp = $state<any>(RecoveryPage);

    function switchTab(id: string, preserveDeckScope = false) {
        if (id === "goals") {
            learningTabRequest = "plans";
            learningViewKey += 1;
        } else if (id === "learning") {
            learningTabRequest = "recap";
            learningViewKey += 1;
        }
        const route = id === "today" ? "overview" : id === "library" ? "manage" : id === "marketplace" ? "marketplace" : id === "studio" ? "authoring" : id === "goals" ? "learning" : id;
        if (!knownIds.has(route) && route !== "settings") return;
        // 离开管理器即放弃未完成的维护页返回点，避免随后从普通卡库编辑时误跳回维护页。
        if (route !== "manage") managerReturnToMaintenance = "";
        if (route !== "manage" || !preserveDeckScope) managerDeckScope = null;
        active = route;
        // settings 是 Hub 内部的稳定入口，旧宿主没有对应的 lastHubTab route，
        // 仍允许保存它以便返回时保留现场；外部旧入口照旧写入原 id。
        onTabChange?.(route);
        void tick().then(() => document.getElementById(active === "authoring" ? "lv-hub-studio-panel" : "lv-hub-panel")?.focus());
    }

    async function handleManagerCardSaved(blockID: string) {
        if (!managerReturnToMaintenance || managerReturnToMaintenance !== blockID) return;
        managerReturnToMaintenance = "";
        managerInitialBlockID = "";
        switchTab("maintenance");
    }

    function openMaintenanceCard(blockID: string) {
        managerReturnToMaintenance = blockID;
        managerInitialBlockID = blockID;
        switchTab("manage");
    }

    async function prepareInboxCards(blockIDs: string[]) {
        if (!inbox || blockIDs.length === 0) return;
        const sources = await inbox.loadSourcesForCards(blockIDs);
        if (sources.length === 0) throw new Error(i18n.inboxEmptySource ?? "所选材料没有可用内容");
        studioInboxRequest = {
            id: ++studioInboxSeq,
            sources,
            onImportComplete: (ids: string[]) => inbox?.completeCards(ids),
        };
        switchTab("authoring");
    }

    // T13/openTabOf 去重（docs/40）：外部（顶栏/命令面板）复用既有中心页签时，
    // 经根元素派发 lv-switch-tab 事件切换子页——避免每次入口都新开一个中心
    let hubRoot = $state<HTMLElement | null>(null);
    let keyboardOpen = $state(false);
    let onSwitchTab: ((e: Event) => void) | null = null;
    let unbindVisualViewport: (() => void) | null = null;
    onMount(() => {
        onSwitchTab = (e: Event) => {
            const detail = (e as CustomEvent<string | { tab?: string; focusBlockID?: string }>).detail;
            const id = typeof detail === "string" ? detail : detail?.tab;
            if (typeof id === "string" && knownIds.has(id)) {
                if (typeof detail !== "string" && detail.focusBlockID) managerInitialBlockID = detail.focusBlockID;
                switchTab(id);
            }
        };
        hubRoot?.addEventListener("lv-switch-tab", onSwitchTab);
        if (typeof window !== "undefined") {
            const vv = window.visualViewport;
            let baselineH = Math.max(window.innerHeight || 0, Math.round(vv?.height ?? 0));
            const syncViewport = () => {
                const innerH = window.innerHeight || 0;
                const rawH = vv ? vv.height : innerH;
                const vvH = Math.max(180, Math.round(rawH || innerH));
                if (vvH > baselineH) baselineH = vvH;
                hubRoot?.style.setProperty("--lv-vv-h", `${vvH}px`);
                const refH = Math.max(baselineH, innerH);
                keyboardOpen = refH > 0 && refH - vvH > 110;
            };
            syncViewport();
            vv?.addEventListener("resize", syncViewport);
            vv?.addEventListener("scroll", syncViewport);
            window.addEventListener("resize", syncViewport);
            unbindVisualViewport = () => {
                vv?.removeEventListener("resize", syncViewport);
                vv?.removeEventListener("scroll", syncViewport);
                window.removeEventListener("resize", syncViewport);
            };
        }
        if (inbox) {
            unsubscribeInbox = inbox.subscribe(() => {
                inboxOpenCount = inbox?.get().items.filter(item => item.status !== "dismissed").length ?? 0;
            });
        }
        if (exam) {
            plans = exam.getPlans();
            unsubscribeExamPlans = exam.subscribe(() => {
                plans = exam?.getPlans() ?? plans;
            });
        }
    });
    onDestroy(() => {
        hubRoot?.removeEventListener("lv-switch-tab", onSwitchTab ?? (() => {}));
        unbindVisualViewport?.();
        unbindVisualViewport = null;
        unsubscribeInbox?.();
        unsubscribeExamPlans?.();
    });

    const isMac = typeof navigator !== "undefined" && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || navigator.platform || "");

    function onWindowKeydown(e: KeyboardEvent) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            if (openPalette) {
                e.preventDefault();
                openPalette();
            }
        }
    }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="lv-hub" class:lv-hub--keyboard-open={keyboardOpen} bind:this={hubRoot}>
    <header class="lv-hub-mobile-topbar">
        <div class="lv-hub-mobile-title">
            <span class="lv-hub-mobile-brand-icon"><LvIcon name="cards" size={17} /></span>
            <strong>{primaryTabs.find(item => item.id === primaryFor(active))?.label ?? (i18n.menuDashboard ?? "闪卡中心")}</strong>
        </div>
        <div class="lv-hub-mobile-top-actions">
            {#if openPalette}
                <button type="button" class="lv-hub-mobile-topbtn" onclick={() => openPalette?.()} aria-label={i18n.cmdPalette ?? "命令面板"} title={i18n.cmdPalette ?? "命令面板"}>
                    <LvIcon name="search" size={17} />
                </button>
            {/if}
            <button type="button" class="lv-hub-mobile-gear" onclick={openFullSettings} aria-label={i18n.hubPrimarySettings ?? "设置"} title={i18n.hubPrimarySettings ?? "设置"}>
                <LvIcon name="settings" size={18} />
            </button>
            {#if onCloseMobile}
                <button type="button" class="lv-hub-mobile-close" onclick={onCloseMobile} aria-label={i18n.common?.close ?? "关闭"} title={i18n.common?.close ?? "关闭"}>
                    <LvIcon name="close" size={18} />
                </button>
            {/if}
        </div>
    </header>
    <!-- R54 工作台外壳：桌面左侧稳定主入口；旧模块作为学习页中的上下文工具。 -->
    <div class="lv-r54-shell">
        <aside class="lv-r54-sidebar" aria-label={i18n.hubPrimaryLabel ?? "主要导航"}>
            <div class="lv-r54-brand" title="小驴闪卡">
                <LvIcon name="cards" size={22} />
            </div>
            <button class="b3-button b3-button--outline lv-r54-new-card" disabled={!loadQuickCardView} aria-describedby={!loadQuickCardView ? "lv-r54-new-card-hint" : undefined} onclick={openStudioManual} title={i18n.hubStudioManualAction?.includes("手工") ? "新建闪卡" : (i18n.hubStudioManualAction ?? "新建闪卡")}>
                <LvIcon name="plus" size={18} />
            </button>
            <LvTabs tabs={primaryTabs} active={primaryFor(active)} onchange={switchTab} panelId={active === "authoring" ? "lv-hub-studio-panel" : "lv-hub-panel"} orientation="vertical" />
            <div class="lv-r54-sidebar-divider"></div>
            {#if openPalette}
            <button class="lv-r54-sidebar-link" onclick={() => openPalette?.()} title={`${i18n.cmdPalette ?? "命令面板"} (${isMac ? "⌘K" : "Ctrl+K"})`}>
                <span class="lv-r54-sidebar-icon"><LvIcon name="search" size={18} /></span>
                <span class="lv-r54-sidebar-text">{isMac ? "⌘K" : "Ctrl+K"}</span>
            </button>
            {/if}
            {#if inbox && inboxOpenCount > 0}
            <button class="lv-r54-sidebar-link" class:lv-r54-sidebar-link-active={active === "inbox"} onclick={() => switchTab("inbox")} title={`${i18n.hubInboxOpen ?? "打开收件箱"} (${inboxOpenCount})`}>
                <span class="lv-r54-sidebar-icon"><LvIcon name="inbox" size={18} /></span>
                <span class="lv-r54-sidebar-text">{inboxOpenCount}</span>
            </button>
            {/if}
            <button class="lv-r54-sidebar-link" onclick={() => dashboardBase.openOnboarding()} title={i18n.hubStudioOnboarding ?? "上手与示例"}>
                <span class="lv-r54-sidebar-icon"><LvIcon name="question" size={18} /></span>
                <span class="lv-r54-sidebar-text">上手</span>
            </button>
            {#if !loadQuickCardView}<span id="lv-r54-new-card-hint" class="lv-sr-only">{i18n.hubManualUnavailable ?? "当前宿主未提供手工制卡入口"}</span>{/if}
        </aside>
        <section class="lv-r54-content">
            {#if (primaryFor(active) === "library" && uiMode !== "simple") || (primaryFor(active) === "studio" && inbox) || primaryFor(active) === "learning" || active === "recovery"}
            <div class="lv-hub-bar">
                {#if primaryFor(active) === "library" && uiMode !== "simple"}
                    <nav class="lv-hub-subnav" aria-label={i18n.hubPrimaryLibrary ?? "卡库"}>
                        <button class:lv-hub-subnav-active={active === "decks"} class="lv-hub-subnav-btn" aria-current={active === "decks" ? "page" : undefined} onclick={() => switchTab("decks")}>{i18n.hubTabDecks ?? "卡包管理"}</button>
                        <button class:lv-hub-subnav-active={active === "manage"} class="lv-hub-subnav-btn" aria-current={active === "manage" ? "page" : undefined} onclick={() => switchTab("manage")}>{i18n.hubTabManage ?? "闪卡明细"}</button>
                        <button class:lv-hub-subnav-active={active === "maintenance"} class="lv-hub-subnav-btn" aria-current={active === "maintenance" ? "page" : undefined} onclick={() => switchTab("maintenance")}>{i18n.hubTabMaintenance ?? "维护债务"}</button>
                    </nav>
                {:else if primaryFor(active) === "studio" && inbox}
                    <nav class="lv-hub-subnav" aria-label={i18n.hubPrimaryStudio ?? "制卡"}>
                        <button class:lv-hub-subnav-active={active === "authoring"} class="lv-hub-subnav-btn" aria-current={active === "authoring" ? "page" : undefined} onclick={() => switchTab("authoring")}>{i18n.hubTabAuthoring ?? "制卡工坊"}</button>
                        <button class:lv-hub-subnav-active={active === "inbox"} class="lv-hub-subnav-btn" aria-current={active === "inbox" ? "page" : undefined} onclick={() => switchTab("inbox")}>{i18n.hubTabInbox}{#if inboxOpenCount > 0} ({inboxOpenCount}){/if}</button>
                    </nav>
                {:else if primaryFor(active) === "learning"}
                    <nav class="lv-hub-subnav" aria-label={i18n.hubSecondaryLabel ?? "学习工具"}>
                        <button class:lv-hub-subnav-active={active === "learning"} class="lv-hub-subnav-btn" aria-current={active === "learning" ? "page" : undefined} onclick={() => switchTab("learning")}>{i18n.hubPrimaryLearning ?? "学习"}</button>
                        {#if exam && uiMode !== "simple"}
                            <button class:lv-hub-subnav-active={active === "exam"} class="lv-hub-subnav-btn" aria-current={active === "exam" ? "page" : undefined} onclick={() => switchTab("exam")}>{i18n.hubTabExam}</button>
                        {/if}
                    </nav>
                {:else if active === "recovery"}
                    <nav class="lv-hub-subnav" aria-label={i18n.hubPrimaryToday ?? "今日"}>
                        <button class="lv-hub-subnav-btn" onclick={() => switchTab("today")}>{i18n.hubPrimaryToday ?? "今日"}</button>
                        <button class="lv-hub-subnav-btn lv-hub-subnav-active" aria-current="page" onclick={() => switchTab("recovery")}>{i18n.hubTabRecovery ?? "待处理与恢复"}</button>
                    </nav>
                {/if}
            </div>
            {/if}
            <div class="lv-hub-body">
        <!-- 错误边界（450）：{#key} 使边界随页签重建，单子页崩溃不拖垮中心，切换自愈 -->
        {#key active}
            {#if active !== "authoring"}
            <!-- 页签切换：140ms 单次淡入（R53 动效纪律：只动 opacity，无错峰） -->
            <div
                id="lv-hub-panel"
                class="lv-hub-panel"
                role="tabpanel"
                aria-labelledby={`lv-tab-${primaryFor(active)}`}
                tabindex="0"
                in:fade={{ duration: getMotionDuration("standard") }}
            >
            <svelte:boundary onerror={(e) => console.warn("[lv-cards] tab error", e)}>
                {#snippet failed(error: unknown, reset)}
                    <div style="padding: var(--lv-sp-5)">
                        <div class="lv-card2">
                            <div style="color: var(--lv-color-danger); font-size: 13px; margin-bottom: calc(var(--lv-space-unit) * 4)">{i18n.hubTabError}{error instanceof Error && error.message ? `: ${error.message}` : ""}</div>
                            <button class="b3-button b3-button--outline" onclick={reset}>{i18n.dashboard.refresh}</button>
                        </div>
                    </div>
                {/snippet}
                {#if active === "overview"}
                    <!-- T08：注入页签切换（待处理分区直达收件箱） -->
                    <Dashboard ctx={{ ...dctx, openHubTab: (id: string) => switchTab(id) }} />
                {:else if active === "manage"}
                    {#key managerDeckScope?.id ?? ""}
                    <Manager ctx={{ ...managerCtx, initialBlockID: managerInitialBlockID, onInitialBlockConsumed: () => (managerInitialBlockID = ""), onCardContentSaved: handleManagerCardSaved, deckScope: managerDeckScope, clearDeckScope: () => (managerDeckScope = null), openDecksTab: () => switchTab("decks"), openReviewScope: dctx.openReviewScope }} />
                    {/key}
                {:else if active === "decks"}
                    <DeckManager
                        i18n={i18n}
                        openReviewScope={dctx.openReviewScope}
                        openManagerDeck={openManagerDeck}
                        getRevlog={dashboardBase.getRevlog}
                    />
                {:else if active === "marketplace"}
                    <MarketplaceStudio
                        {i18n}
                        onDeckCreated={(deckId, deckName) => {
                            managerDeckScope = { id: deckId, name: deckName };
                        }}
                        onOpenDeck={(deckId, deckName) => {
                            managerDeckScope = { id: deckId, name: deckName };
                            switchTab("decks");
                        }}
                    />
                {:else if active === "settings"}
                    <div class="lv-r54-settings">
                        <div class="lv-pagehead">
                            <div class="lv-pagehead-main">
                                <div class="lv-eyebrow">{i18n.hubSettingsEyebrow ?? "偏好与健康"}</div>
                                <div class="lv-pagehead-title">{i18n.hubPrimarySettings ?? "设置"}</div>
                                <p class="lv-pagehead-sub">{i18n.hubSettingsSubtitle ?? "先看影响，再进入完整配置。"}</p>
                            </div>
                        </div>
                        <div class="lv-r54-health-grid">
                            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                            <div class="lv-card2" role="button" tabindex="0" onclick={openFullSettings} onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFullSettings(); } }} title={i18n.hubSettingsOpen ?? "打开完整设置"}><span class="lv-r54-health-dot lv-r54-health-dot-good"></span><strong>{i18n.hubSettingsLocalTitle ?? "本地闪卡"}</strong><span class="lv-r54-health-state">{i18n.hubSettingsLocalStatus ?? "本地可用"}</span><p>{i18n.hubSettingsLocalDesc ?? "卡片、来源和复习记录继续保存在当前插件数据中。"}</p></div>
                            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                            <div class="lv-card2" role="button" tabindex="0" onclick={openFullSettings} onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFullSettings(); } }} title={i18n.hubSettingsOpen ?? "打开完整设置"}><span class:lv-r54-health-dot-good={settingsHealth.aiConfigured} class:lv-r54-health-dot-warn={!settingsHealth.aiConfigured} class="lv-r54-health-dot"></span><strong>{i18n.hubSettingsAITitle ?? "AI 辅助"}</strong><span class="lv-r54-health-state">{settingsHealth.aiConfigured ? (i18n.hubSettingsAIConfigured ?? "已配置") : (i18n.hubSettingsAINotConfigured ?? "尚未配置")}</span><p>{i18n.hubSettingsAIDesc ?? "模型、端点、预算和外发确认在完整设置中管理。"}</p></div>
                            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                            <div class="lv-card2" role="button" tabindex="0" onclick={openFullSettings} onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFullSettings(); } }} title={i18n.hubSettingsOpen ?? "打开完整设置"}><span class="lv-r54-health-dot lv-r54-health-dot-neutral"></span><strong>{i18n.hubSettingsDataTitle ?? "数据与备份"}</strong><span class="lv-r54-health-state">{i18n.hubSettingsDataStatus ?? "可在完整设置中管理"}</span><p>{i18n.hubSettingsDataDesc ?? "导入、导出、恢复和诊断按任务展开。"}</p></div>
                        </div>
                        <section class="lv-card2 lv-r54-settings-action">
                            <div><h3>{i18n.hubSettingsOpenTitle ?? "需要修改配置？"}</h3><p>{i18n.hubSettingsOpenDesc ?? "打开完整设置，保存后会回到当前工作台。"}</p></div>
                            <button class="b3-button lv-btn-primary" disabled={!openSettings} onclick={openFullSettings}>{i18n.hubSettingsOpen ?? "打开完整设置"}</button>
                        </section>
                    </div>
                {:else if active === "learning"}
                    {#if LearningComp}
                        {#key learningViewKey}
                            <LearningComp
                                {i18n}
                                {goals}
                                getRevlog={dashboardBase.getRevlog}
                                getDailyTargets={dashboardBase.getDailyTargets}
                                onReviewed={dashboardBase.onReviewed}
                                onStoresChanged={dashboardBase.onStoresChanged}
                                onGoToday={() => switchTab("today")}
                                onOpenExam={exam ? () => switchTab("exam") : undefined}
                                onOpenChallenge={openChallenge}
                                onOpenPairing={openPairing}
                                onOpenBlock={(blockID: string) => { managerInitialBlockID = blockID; switchTab("manage"); }}
                                onTabChange={(tab: string) => onTabChange?.(tab === "plans" ? "goals" : "learning")}
                                initialTab={learningTabRequest}
                            />
                        {/key}
                    {:else if learningError}
                        <div style="padding: var(--lv-sp-5); color: var(--lv-color-danger); font-size: var(--lv-type-body-size)">
                            <div style="margin-bottom: calc(var(--lv-space-unit) * 4)">{learningError}</div>
                            <button class="b3-button b3-button--outline" onclick={ensureLearning}>{i18n.dashboard.refresh}</button>
                        </div>
                    {:else}
                        <div role="status" aria-busy="true" style="padding: var(--lv-sp-5); color: var(--lv-color-text-muted); font-size: var(--lv-type-body-size)">{i18n.dashboard.loading}</div>
                    {/if}
                {:else if active === "maintenance"}
                    {#if MaintComp}
                        <MaintComp i18n={i18n} maintenance={{ ...maintenance, openCard: openMaintenanceCard }} />
                    {:else if maintError}
                        <div style="padding: var(--lv-sp-5); color: var(--lv-color-danger); font-size: var(--lv-type-body-size)">
                            <div style="margin-bottom: calc(var(--lv-space-unit) * 4)">{maintError}</div>
                            <button class="b3-button b3-button--outline" onclick={ensureMaint}>{i18n.dashboard.refresh}</button>
                        </div>
                    {:else}
                        <div role="status" aria-busy="true" style="padding: var(--lv-sp-5); color: var(--lv-color-text-muted); font-size: var(--lv-type-body-size)">{i18n.dashboard.loading}</div>
                    {/if}
                {:else if active === "inbox"}
                    {#if inbox && InboxComp}
                        <InboxComp i18n={i18n} inbox={{ ...inbox, makeCards: prepareInboxCards }} />
                    {:else if inbox && inboxError}
                        <div style="padding: var(--lv-sp-5); color: var(--lv-color-danger); font-size: var(--lv-type-body-size)">
                            <div style="margin-bottom: calc(var(--lv-space-unit) * 4)">{inboxError}</div>
                            <button class="b3-button b3-button--outline" onclick={ensureInbox}>{i18n.dashboard.refresh}</button>
                        </div>
                    {:else if inbox}
                        <div role="status" aria-busy="true" style="padding: var(--lv-sp-5); color: var(--lv-color-text-muted); font-size: var(--lv-type-body-size)">{i18n.dashboard.loading}</div>
                    {:else}
                        <div style="padding: var(--lv-sp-5); text-align: center;">
                            <div class="lv-card2" style="max-width: 480px; margin: 40px auto; padding: var(--lv-sp-5)">
                                <div style="font-size: var(--lv-type-title-size); font-weight: var(--lv-fw-bold); margin-bottom: var(--lv-sp-2)">{i18n.hubTabInbox ?? "材料收件箱"}</div>
                                <p style="color: var(--lv-color-text-muted); font-size: var(--lv-type-body-size); margin-bottom: var(--lv-sp-4)">材料收件箱模块当前已停用。</p>
                                <button class="b3-button lv-btn-primary" onclick={openFullSettings}>{i18n.hubSettingsOpen ?? "打开设置开启模块"}</button>
                            </div>
                        </div>
                    {/if}
                {:else if active === "exam"}
                    {#if exam && ExamComp}
                        <ExamComp
                            i18n={i18n}
                            plans={plans}
                            onSavePlan={async (p: ExamPlan) => (plans = await exam!.onSavePlan(p))}
                            onDeletePlan={async (id: string) => (plans = await exam!.onDeletePlan(id))}
                            onReviewScope={exam.onReviewScope}
                            onReport={exam.onReport}
                            onWriteReport={exam.onWriteReport}
                            onError={exam.onError}
                            getRevlog={exam.getRevlog}
                            getDailyCap={exam.getDailyCap}
                        />
                    {:else if exam && examError}
                        <div style="padding: var(--lv-sp-5); color: var(--lv-color-danger); font-size: var(--lv-type-body-size)">
                            <div style="margin-bottom: calc(var(--lv-space-unit) * 4)">{examError}</div>
                            <button class="b3-button b3-button--outline" onclick={ensureExam}>{i18n.dashboard.refresh}</button>
                        </div>
                    {:else if exam}
                        <div role="status" aria-busy="true" style="padding: var(--lv-sp-5); color: var(--lv-color-text-muted); font-size: var(--lv-type-body-size)">{i18n.dashboard.loading}</div>
                    {:else}
                        <div style="padding: var(--lv-sp-5); text-align: center;">
                            <div class="lv-card2" style="max-width: 480px; margin: 40px auto; padding: var(--lv-sp-5)">
                                <div style="font-size: var(--lv-type-title-size); font-weight: var(--lv-fw-bold); margin-bottom: var(--lv-sp-2)">{i18n.hubTabExam ?? "考试冲刺"}</div>
                                <p style="color: var(--lv-color-text-muted); font-size: var(--lv-type-body-size); margin-bottom: var(--lv-sp-4)">考试计划模块当前已停用。</p>
                                <button class="b3-button lv-btn-primary" onclick={openFullSettings}>{i18n.hubSettingsOpen ?? "打开设置开启模块"}</button>
                            </div>
                        </div>
                    {/if}
                {:else if active === "recovery"}
                    <RecoveryComp
                        i18n={i18n}
                        load={recovery.load}
                        openAI={openStudioAI}
                        openDeck={openRecoveryDeck}
                        openInbox={() => switchTab("inbox")}
                        openMaintenance={() => switchTab("maintenance")}
                        openReview={dashboardBase.openReview}
                        openOnboarding={dashboardBase.openOnboarding}
                    />
                {/if}
            </svelte:boundary>
            </div>
            {/if}
        {/key}
        <div
            id="lv-hub-studio-panel"
            class="lv-hub-panel lv-hub-studio-panel"
            hidden={active !== "authoring"}
            role="tabpanel"
            aria-labelledby="lv-tab-studio"
            tabindex="0"
        >
            <svelte:boundary onerror={(e) => console.warn("[lv-cards] studio error", e)}>
                {#snippet failed(error: unknown, reset)}
                    <div style="padding: var(--lv-sp-5)">
                        <div class="lv-card2">
                            <div style="color: var(--lv-color-danger); font-size: 13px; margin-bottom: calc(var(--lv-space-unit) * 4)">{i18n.hubTabError}{error instanceof Error && error.message ? `: ${error.message}` : ""}</div>
                            <button class="b3-button b3-button--outline" onclick={reset}>{i18n.dashboard.refresh}</button>
                        </div>
                    </div>
                {/snippet}
                <StudioWorkbench
                    {i18n}
                    isActive={active === "authoring"}
                    aiConfigured={settingsHealth.aiConfigured}
                    loadWizard={loadWizardView}
                    loadQuickCard={loadQuickCardView}
                    {openDrill}
                    openOnboarding={dashboardBase.openOnboarding}
                    inboxRequest={studioInboxRequest}
                    manualRequest={studioManualSeq}
                    aiRequest={studioAISeq}
                    recoveryJobId={studioAIRecoveryJobId}
                />
            </svelte:boundary>
        </div>
            </div>
        </section>
    </div>
    <nav class="lv-hub-mobile-nav" aria-label={i18n.hubPrimaryLabel ?? "主要导航"}>
        {#each mobileTabs as tab (tab.id)}
            <button class:lv-hub-mobile-active={primaryFor(active) === tab.id} class="lv-hub-mobile-btn" aria-current={primaryFor(active) === tab.id ? "page" : undefined} aria-label={tab.badgeLabel ? `${tab.label}，${tab.badgeLabel}` : undefined} onclick={() => switchTab(tab.id)}>
                <span class="lv-hub-mobile-icon">
                    <LvIcon name={tab.icon} size={19} />
                    {#if tab.badge !== undefined}<span class="lv-hub-mobile-count" aria-hidden="true">{tab.badge}</span>{/if}
                </span>
                <span class="lv-hub-mobile-label">{tab.label}</span>
            </button>
        {/each}
    </nav>
</div>

<style>
    .b3-button {
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
    .lv-hub {
        height: 100%;
        display: flex;
        flex-direction: column;
        position: relative;
        container: lv-hub / inline-size;
    }

    /* Mobile Spec v2：紧凑单行顶栏整合标题、设置齿轮与关闭钮，桌面端隐藏，杜绝悬浮按钮遮挡子页内容 */
    .lv-hub-mobile-topbar,
    .lv-hub-mobile-gear {
        display: none;
    }

    .lv-r54-shell {
        display: grid;
        grid-template-columns: 78px minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr);
        flex: 1;
        min-height: 0;
        margin: 10px 12px 12px;
        border-radius: var(--lv-r-dialog);
        background: var(--lv-color-surface);
        box-shadow: var(--lv-shadow-2);
        overflow: hidden;
        border: 1px solid var(--lv-border);
    }

    .lv-r54-sidebar {
        display: flex;
        width: 78px;
        min-width: 0;
        height: 100%;
        box-sizing: border-box;
        overflow-y: auto;
        overflow-x: hidden;
        scrollbar-width: none;
        flex-direction: column;
        align-items: center;
        gap: var(--lv-sp-3);
        padding: var(--lv-sp-3) 6px var(--lv-sp-2);
        border-right: 1px solid color-mix(in srgb, var(--lv-color-text) 6%, transparent);
        background: color-mix(in srgb, var(--lv-color-canvas) 85%, var(--lv-color-surface));
    }
    .lv-r54-sidebar::-webkit-scrollbar { display: none; }

    .lv-r54-brand {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        min-height: 36px;
        padding: 0;
        color: var(--lv-color-brand);
        font-size: var(--lv-type-meta-size);
        font-weight: var(--lv-fw-bold);
    }

    .lv-r54-new-card {
        width: 38px;
        height: 38px;
        min-height: 38px;
        padding: 0;
        display: grid;
        place-items: center;
        border-radius: var(--lv-r-circle);
        background: transparent;
        border: 1px solid var(--lv-border);
        color: var(--lv-color-brand);
        box-shadow: none;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        transition: border-color var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease);

        &:hover {
            border-color: var(--lv-primary-border);
            background: var(--lv-primary-softer);
        }

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }

    :global(.lv-r54-sidebar .lv-tabs) {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-1);
        margin: 0;
        width: 100%;
        border-bottom: 0;
    }

    :global(.lv-r54-sidebar .lv-tab) {
        display: flex;
        flex-direction: column;
        min-height: 50px;
        align-items: center;
        justify-content: center;
        padding: 6px 2px;
        gap: 2px;
        border-radius: var(--lv-r-m);
        color: var(--lv-color-text-muted);
        text-align: center;
        font-size: var(--lv-type-meta-size);
        position: relative;
        transition: all var(--lv-dur-1) var(--lv-ease);
    }

    :global(.lv-r54-sidebar .lv-tab:hover) {
        background: color-mix(in srgb, var(--lv-color-text) 5%, transparent);
        color: var(--lv-color-text);
    }

    :global(.lv-r54-sidebar .lv-tab.lv-tab-active) {
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
        font-weight: var(--lv-fw-heading);
        border: 1px solid var(--lv-primary-border);

        &::before {
            display: none;
        }
    }
    :global(.lv-r54-sidebar .lv-tab) { gap: 3px; }
    :global(.lv-r54-sidebar .lv-tab svg) { color: currentColor; }
    :global(.lv-r54-sidebar .lv-tab.lv-tab-active::after) { display: none; }
    :global(.lv-r54-sidebar .lv-tab-badge) {
        position: absolute;
        top: 4px;
        right: 4px;
        margin-left: 0;
        min-width: 16px;
        min-height: 16px;
        height: 16px;
        padding: 0 4px;
        border-radius: var(--lv-r-pill);
        background: var(--lv-color-brand);
        color: var(--lv-color-on-brand);
        font-size: 10px;
        font-weight: var(--lv-fw-bold);
        line-height: 1;
    }
    .lv-r54-sidebar-divider { height: 1px; width: 44px; margin: auto auto 4px; background: color-mix(in srgb, var(--lv-color-text) 8%, transparent); }

    .lv-r54-sidebar-link {
        display: flex;
        flex-direction: column;
        min-height: 44px;
        width: 100%;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: 4px 2px;
        border: 0;
        border-radius: var(--lv-r-m);
        background: transparent;
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-meta-size);
        cursor: pointer;
        text-align: center;
        position: relative;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }

    .lv-r54-sidebar-link:hover,
    .lv-r54-sidebar-link-active { background: var(--lv-primary-softer); color: var(--lv-color-brand); }
    .lv-r54-sidebar-icon { display: grid; width: 20px; height: 20px; flex: none; place-items: center; }
    .lv-r54-sidebar-text { font-size: 10px; line-height: 1.2; }
    .lv-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: calc(var(--lv-space-hairline) * -1); overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    .lv-r54-content {
        display: flex;
        min-width: 0;
        min-height: 0;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
    }

    .lv-hub-bar {
        padding: var(--lv-sp-3) var(--lv-sp-5) 0;
        flex: none;
    }

    .lv-hub-body {
        flex: 1;
        min-height: 0;
        position: relative;
    }
    .lv-hub-panel {
        box-sizing: border-box;
        height: 100%;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
    }
    .lv-hub-panel[hidden] {
        display: none !important;
    }

    .lv-hub-studio-panel {
        box-sizing: border-box;
        height: 100%;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
    }

    .lv-hub-mobile-nav { display: none; }

    /* R54 shell additions: keep the existing LvPage/Manager scroll contract and
       only style the new navigation/workbench surfaces here. */
    .lv-hub-subnav {
        display: flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 3);
        margin: calc(var(--lv-sp-2) * -1) 0 var(--lv-sp-3);
        padding: 0 calc(var(--lv-space-unit) * 1);
        overflow-x: auto;
        scrollbar-width: none;
    }

    .lv-hub-subnav::-webkit-scrollbar { display: none; }

    .lv-hub-subnav-btn {
        min-height: 30px;
        padding: calc(var(--lv-space-unit) * 2) calc(var(--lv-space-unit) * 6);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-pill);
        background: transparent;
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-control-size);
        white-space: nowrap;
        cursor: pointer;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        transition: background var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease), border-color var(--lv-dur-1) var(--lv-ease);

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }

    .lv-hub-subnav-btn:hover,
    .lv-hub-subnav-btn.lv-hub-subnav-active {
        color: var(--lv-color-brand);
        background: var(--lv-primary-soft);
        border-color: var(--lv-primary-border);
        font-weight: var(--lv-fw-semibold);
        box-shadow: 0 2px 6px color-mix(in srgb, var(--lv-color-brand) 16%, transparent);
        transform: translateY(-1px);
    }

    .lv-r54-settings {
        max-width: 1040px;
        margin: 0 auto;
        padding: var(--lv-sp-5);
    }

    .lv-r54-health-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: var(--lv-sp-4);
    }

    .lv-r54-settings-action h3 {
        margin: calc(var(--lv-space-unit) * 3 + var(--lv-space-hairline)) 0 calc(var(--lv-space-unit) * 4);
        font-size: var(--lv-type-title-lg-size);
        text-wrap: balance;
    }

    .lv-r54-settings-action p,
    .lv-r54-health-grid p {
        margin: 0 0 calc(var(--lv-space-unit) * 9);
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-body-size);
        line-height: var(--lv-lh-reading, 1.65);
        max-width: 48em;
        text-wrap: pretty;
    }

    .lv-r54-settings-action {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-4);
        margin-top: var(--lv-sp-4);
        padding: calc(var(--lv-space-unit) * 9) calc(var(--lv-space-unit) * 11);
    }

    .lv-r54-health-grid { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .lv-r54-health-grid .lv-card2 {
        padding: calc(var(--lv-space-unit) * 9 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 10);
        cursor: pointer;
        transition: transform var(--lv-dur-1) var(--lv-ease), border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease);

        &:hover {
            transform: translateY(-2px);
            border-color: var(--lv-color-brand);
            box-shadow: var(--lv-shadow-2);
        }

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
    .lv-r54-health-grid strong { display: block; margin-top: 10px; font-size: var(--lv-type-body-sm-size); }
    .lv-r54-health-state { display: block; margin-top: 4px; color: var(--lv-color-text-muted); font-size: var(--lv-type-meta-size); }
    .lv-r54-health-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; }
    .lv-r54-health-dot-good { background: var(--lv-color-success); }
    .lv-r54-health-dot-warn { background: var(--lv-color-warning); }
    .lv-r54-health-dot-neutral { background: var(--lv-color-brand); }

    @container lv-hub (max-width: 780px) {
        .lv-hub-mobile-topbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--lv-sp-2);
            flex: none;
            min-height: calc(46px + env(safe-area-inset-top, 0px));
            padding: env(safe-area-inset-top, 0px) calc(env(safe-area-inset-right, 0px) + var(--lv-sp-2)) 0 calc(env(safe-area-inset-left, 0px) + var(--lv-sp-3));
            background: var(--lv-color-surface);
            border-bottom: 1px solid var(--lv-border);
            z-index: var(--lv-z-card-control);
        }
        .lv-hub-mobile-title {
            display: inline-flex;
            align-items: center;
            gap: var(--lv-sp-2);
            min-width: 0;
            color: var(--lv-color-text);
            font-size: var(--lv-type-title-size);
            font-weight: var(--lv-fw-heading);
        }
        .lv-hub-mobile-brand-icon {
            display: inline-grid;
            place-items: center;
            color: var(--lv-color-brand);
            flex: none;
        }
        .lv-hub-mobile-top-actions {
            display: inline-flex;
            align-items: center;
            gap: var(--lv-sp-1);
            flex: none;
        }
        .lv-hub-mobile-gear,
        .lv-hub-mobile-topbtn,
        .lv-hub-mobile-close {
            display: grid;
            place-items: center;
            position: static;
            width: 44px;
            height: 44px;
            min-width: 44px;
            min-height: 44px;
            padding: 0;
            border: 0;
            border-radius: var(--lv-r-circle);
            background: transparent;
            color: var(--lv-color-text-muted);
            cursor: pointer;
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;
            transition: background var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease);

            &:hover {
                background: color-mix(in srgb, var(--lv-color-text) 6%, transparent);
                color: var(--lv-color-text);
            }

            &:active {
                transform: scale(0.94);
            }

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }
        }
        .lv-r54-shell {
            grid-template-columns: 1fr;
            margin: 0;
            border-radius: 0;
            border: 0;
            box-shadow: none;
        }
        .lv-r54-sidebar { display: none; }
        .lv-r54-settings { padding: var(--lv-sp-3); }
        .lv-r54-health-grid { grid-template-columns: 1fr; }
        .lv-r54-settings-action { align-items: flex-start; flex-direction: column; }
    }

    @container lv-hub (max-width: 780px) {
        .lv-hub-bar { padding: var(--lv-sp-2) var(--lv-sp-3) var(--lv-sp-1); }
        .lv-hub-subnav { margin: 0 0 var(--lv-sp-1); }
        .lv-hub-panel :global(.lv-pagehead-titles),
        .lv-hub-panel :global(.lv-studio-heading),
        .lv-hub-panel :global(.lv-pagehead:not(:has(.lv-pagehead-actions))) {
            display: none !important;
        }
        .lv-hub-panel :global(.lv-pagehead:has(.lv-pagehead-actions)) {
            margin-bottom: var(--lv-sp-2) !important;
            padding: 4px 0 !important;
            border-bottom: 0 !important;
        }
        .lv-hub-panel :global(.lv-studio) {
            padding: 10px 12px !important;
        }
        .lv-hub-mobile-nav {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: calc(var(--lv-space-unit) * 1);
            flex: none;
            padding: calc(var(--lv-space-unit) * 2) var(--lv-sp-2) max(calc(var(--lv-space-unit) * 2), env(safe-area-inset-bottom));
            border-top: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent);
            background: color-mix(in srgb, var(--lv-color-surface) 94%, transparent);
            backdrop-filter: blur(14px) saturate(1.15);
            -webkit-backdrop-filter: blur(14px) saturate(1.15);
            box-shadow: 0 -1px 3px color-mix(in srgb, black 3%, transparent);
        }
        .lv-hub--keyboard-open .lv-hub-mobile-nav,
        :global(.lv-vv-keyboard-open) .lv-hub-mobile-nav {
            display: none !important;
        }
        .lv-hub-mobile-btn {
            display: flex;
            min-height: 46px;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            gap: calc(var(--lv-space-unit) * 1);
            border: 0;
            border-radius: var(--lv-r-m);
            background: transparent;
            color: var(--lv-color-text-muted);
            font-size: var(--lv-type-meta-size);
            cursor: pointer;
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;
            transition: transform var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease);

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }
        }
        .lv-hub-mobile-btn:active {
            transform: scale(0.96);
        }
        .lv-hub-mobile-btn:hover,
        .lv-hub-mobile-btn.lv-hub-mobile-active {
            color: var(--lv-color-brand);
            background: var(--lv-primary-soft);
            font-weight: var(--lv-fw-heading);
        }
        .lv-hub-mobile-icon { position: relative; display: grid; width: 24px; height: 24px; place-items: center; }
        .lv-hub-mobile-count { position: absolute; top: -4px; right: -13px; display: grid; min-width: 16px; height: 16px; place-items: center; padding: 0 3px; border: 1px solid var(--lv-color-surface); border-radius: var(--lv-r-pill); background: var(--lv-color-brand); color: var(--lv-color-on-brand); font-size: var(--lv-type-micro-size); font-variant-numeric: tabular-nums; line-height: var(--lv-lh-tight); }
        .lv-hub-mobile-label { line-height: var(--lv-lh-icon); }
    }

    @container lv-hub (max-width: 560px) {
        :global(.lv-page) {
            padding: var(--lv-sp-3) var(--lv-sp-3) var(--lv-sp-4);
        }
        :global(.lv-pagehead) {
            gap: var(--lv-sp-2);
            margin-bottom: var(--lv-sp-2);
        }
        :global(.lv-pagehead .lv-eyebrow),
        :global(.lv-pagehead .lv-pagehead-sub) {
            display: none;
        }
        :global(.lv-pagehead .lv-pagehead-title) {
            font-size: var(--lv-type-title-size);
            margin: 0;
        }
    }
</style>
