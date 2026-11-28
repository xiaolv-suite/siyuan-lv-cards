import "./index.scss";
import { Plugin, fetchSyncPost, type subMenu } from "siyuan";
import * as siyuanNamespace from "siyuan";
if (typeof window !== "undefined") { (window as any).__lvSiyuan = siyuanNamespace; (globalThis as any).__lvSiyuan = siyuanNamespace; }
import {
    SETTINGS_DATA, SUSPEND_TODAY_DATA, KNOWLEDGE_OBJECTS_DATA, CARD_RELATIONS_DATA,
    INBOX_DATA, LEARNING_GOALS_DATA, ENTRY_CONTEXTS_DATA, SESSION_STATE_DATA, CONTENT_LIFECYCLES_DATA,
    SOURCE_HEALTH_DATA, AI_KILL_SWITCH_DATA, TIER1_STORE_KEYS, TIER2_STORE_KEYS, ALL_STORE_KEYS,
} from "@/bootstrap/storage-keys";
import { TAB_DASHBOARD, TAB_REVIEW, registerDashboardTab, registerReviewTab } from "@/bootstrap/tab-registrars"; import type { TabHostPlugin } from "@/bootstrap/tab-host";
import { loadHubMount, loadReviewMount, loadHubServices, mountChunkFallback } from "@/bootstrap/chunk-loaders";
import { openPluginTab } from "@/bootstrap/tab-openers"; import { createEditorMenuListeners } from "@/bootstrap/editor-menu-listeners";
import { setupEditorQaIntegration, openPluginBlockActionCenter, openPluginCardQuestionDialog, openPluginActiveBlockQuestionDialog, openPluginActiveBlockActionCenter, makePluginClozeCard, openPluginOcclusionEditor, removePluginCardsFromDeck } from "@/bootstrap/editor-qa-init";
import { openPluginSettingsDialog, openPluginDeckPicker, openPluginQuickCard, openPluginQuickCardFromSelection, openPluginOnboarding, openPluginPalette, openPluginAIWizard, openPluginMarkerCards, openPluginChallenge, openPluginPairing, openPluginRepairDrill, openPluginHelpDoc, createSampleWorkspace, openOrCreateDynamicBoardDoc, copyDiagnostics, reportDialogOpenFailure } from "@/bootstrap/dialog-actions";
import { createBadgeReminderService, type BadgeReminderService } from "@/bootstrap/badge-reminder-service"; import { createSessionLifecycleService, type SessionLifecycleService } from "@/bootstrap/session-lifecycle";
import { setupEcosystemIntegrations, registerCardsLaunchpad, handleCardsQuickAction, receiveCardsExtract, createCardsExternalAtomicCard, setupPluginMenusAndCommands, buildPluginTopbarMenuProps } from "@/bootstrap/ecosystem-setup";
import { setupLifecycleDisposers } from "@/bootstrap/disposer-setup"; import { TopbarController } from "@/bootstrap/topbar-controller"; import { appendPluginTopbarMenuItems } from "@/bootstrap/topbar-menu";
import { doFallbackSaveBlockContentVersion, rememberPluginSourceFingerprint, tagPluginErrorReason, getPluginRevlogBlockIndex, reconcilePluginSourceHealthForScan, acknowledgePluginSourceHealth } from "@/bootstrap/maintenance-fallback";
import { defaultSettings, normalizeSettings, stripSecretsForStorage, type LvCardsSettings } from "@/core/settings"; import { emptyRevlog, localDate, type RevlogData } from "@/core/revlog";
import { CARDS_SECRET_SLOTS, readCardsSecretSlot, bindCardsSecretSlots, type CardsSecretField, type CardsSecretSlot } from "@/core/secrets";
import { type SuspendTodayData } from "@/core/suspend-today"; import { type ExamPlansData } from "@/core/exam";
import { type AIKillSwitchData, emptyKillSwitch } from "@/core/ai-kill-switch"; import { type KnowledgeObjectsData, emptyKnowledgeObjects } from "@/core/knowledge-objects";
import { type CardRelationsData, emptyCardRelations } from "@/core/card-relations"; import { type ErrorTagsData, emptyErrorTags, type ErrorReason } from "@/core/error-reasons";
import { type InboxData, emptyInbox, addInboxItem } from "@/core/inbox"; import { type LearningGoalsData, emptyGoals } from "@/core/learning-goal";
import { type EntryContextData, emptyEntryContexts, type EntryKind } from "@/core/entry-context"; import { type ContentLifecyclesData, emptyLifecycles } from "@/core/content-lifecycle";
import { type SourceHealthData, emptySourceHealth } from "@/core/source-health-store"; import { type AIJobsData, emptyAIJobs } from "@/core/ai-jobs";
import { type AIBatchesData } from "@/core/ai-batches"; import { type ContentVersionsData, emptyContentVersions, appendVersion } from "@/core/content-versions";
import { type MaintenanceRepairJournal } from "@/core/maintenance-repair"; import { type MigrationStatus, detectFlashcardV2 } from "@/api/v2-detect";
import { V2SourceIndex } from "@/core/v2-source-index";
import { type SessionState } from "@/core/session-state"; import { type CostLedgerData, emptyCostLedger } from "@/core/ai-cost-ledger";
import { type DenyListData, emptyDenyList } from "@/core/ai-source-deny"; import { type LedgerEntry, type ObLedgerEntry } from "@/core/import-ledgers";
import { createDisposerRegistry, type DisposerRegistry } from "@/core/disposer-registry";
import { type PersistQueue } from "@/libs/persist"; import { type StorageCoordinator } from "@/core/storage-coordinator";
import { setupStorageInfrastructure, AiJobsPersistenceCoordinator } from "@/bootstrap/storage-setup";
import { createHostBridge, type HostBridge } from "@/api/host-bridge";
import { createPluginContext, type IPluginContext } from "@/core/plugin-context"; import { createAICardService, type AICardService } from "@/core/ai-card-service";
import { createMaintenanceService, type MaintenanceService } from "@/core/maintenance-service"; import { createReviewCoordinator, type ReviewCoordinator } from "@/core/review-coordinator";
import { createDeckExamSyncService, type DeckExamSyncService } from "@/core/deck-exam-sync-service"; import { createMobileDialogController, type MobileDialogController } from "@/bootstrap/mobile-dialog-controller";
import { createPresentationPrivacyController } from "@/core/presentation-privacy"; import { createSnapshotMutationQueue } from "@/core/snapshot-mutation-queue";
import { createSuspendTodayMutations } from "@/core/suspend-today-persistence"; import { lvLog } from "@/libs/log"; import { lvLaunchpad, lvSnapshotVault } from "@/libs/notice";
import { getNotebooks, getBlockDOM, setBlockAttrs } from "@/api/siyuan"; import { resolveTargetNotebook } from "@/core/report-writer";
import { buildStarredAttrs } from "@/core/block-attributes"; import { hasImageContent } from "@/core/flashcard-quality";
import { LV_EVENTS, settingsChangedEvent, storesChangedEvent } from "@/libs/events"; import { applyTier1PluginStores, applyTier2PluginStores, applyAllPluginStores } from "@/bootstrap/storage-loader";
import type { ExtractEnvelope } from "@/core/incremental-learning"; import type { IntakeInput } from "@/core/external-card-intake";

function safePerfMark(name: string): void { if (typeof performance !== "undefined" && typeof performance.mark === "function") { try { performance.mark(name); } catch {} } }
function safePerfMeasure(name: string, startMark: string, endMark: string): void { if (typeof performance !== "undefined" && typeof performance.measure === "function") { try { performance.measure(name, startMark, endMark); } catch {} } }
function cloneStore<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

export default class LvCardsPlugin extends Plugin implements TabHostPlugin {
    public static readonly TIER1_KEYS = TIER1_STORE_KEYS; public static readonly TIER2_KEYS = TIER2_STORE_KEYS;
    public static readonly STORE_KEYS = ALL_STORE_KEYS; public static readonly TOPBAR_ICON_ID = TopbarController.TOPBAR_ICON_ID;

    public readonly hostBridge: HostBridge = createHostBridge({ pluginName: "siyuan-lv-cards" });

    private readonly storageInfra = setupStorageInfrastructure(this);
    public readonly persist: PersistQueue = this.storageInfra.persist;
    public readonly storageCoordinator: StorageCoordinator = this.storageInfra.storageCoordinator;
    private readonly aiJobsCoordinator = new AiJobsPersistenceCoordinator();

    public disposerRegistry: DisposerRegistry = createDisposerRegistry();
    public readonly aiCardService: AICardService = createAICardService({
        getSettings: () => this.settings, getI18n: () => this.i18n, getKillSwitch: () => this.killSwitch,
        setKillSwitch: (v) => { this.killSwitch = v; }, getCostLedger: () => this.costLedger, setCostLedger: (v) => { this.costLedger = v; },
        getAIDenyList: () => this.aiDenyList, setAIDenyList: (v) => { this.aiDenyList = v; }, getAIBatches: () => this.aiBatches,
        setAIBatches: (v) => { this.aiBatches = v; }, getAIJobs: () => this.aiJobs, setAIJobs: (v) => { this.aiJobs = v; },
        saveSlot: (k, d) => this.storageCoordinator.save(k, d), saveSlotOnce: (k, id, d) => this.storageCoordinator.saveOnce(k, id, d),
        showNotice: (m, t, i) => this.showNotice(m, t, i), withDocLock: (d, a) => this.hostBridge.withDocLock(d, a),
        targetNotebook: () => this.targetNotebook(), rememberSourceFingerprint: (b, d, m) => this.rememberSourceFingerprint(b, d, m),
        getSecret: (name: string) => (this as any).getSecret?.(name) ?? "",
        eventBus: this.eventBus, persistJobs: (p) => this.persistAIJobs(p), persistJobsOnce: (id) => this.persistAIJobsOnce(id),
    });

    public readonly maintenanceService: MaintenanceService = createMaintenanceService({
        getRepairJournal: () => this.repairJournal, setRepairJournal: (j) => { this.repairJournal = j; },
        saveJournal: (k, j) => (this.storageCoordinator ? this.storageCoordinator.save(k, j) : this.persist.save(k, j)),
        getContentVersions: () => this.contentVersions, setContentVersions: (cv) => { this.contentVersions = cv; },
        saveContentVersions: (k, cv) => (this.storageCoordinator ? this.storageCoordinator.save(k, cv) : this.persist.save(k, cv)),
        getSourceHealth: () => this.sourceHealth, sourceHealthMutations: async (m) => { await this.sourceHealthMutations(m); },
        ensureTier2Loaded: () => this.ensureTier2Loaded(), hasValidOcclusionCard: (b, m) => this.hasValidOcclusionCard(b, m),
        loadHubServices, getI18n: () => this.i18n, saveMarkdown: (b, m, r) => this.saveBlockContentVersion(b, m, r),
    });

    public readonly reviewCoordinator: ReviewCoordinator = createReviewCoordinator({
        getEntryContexts: () => this.entryContexts, setEntryContexts: (v) => { this.entryContexts = v; },
        saveEntryContexts: () => this.saveEntryContexts(), openReviewTab: (opts) => this.openReviewTab(opts),
    });

    public readonly deckExamSyncService: DeckExamSyncService = createDeckExamSyncService({
        getKernel: () => (this as any).kernel, getEventBus: () => this.eventBus, getSourceID: () => this.examPlansSourceID,
        reloadExamPlans: (f) => this.reloadLocalStoresBounded(f),
    });

    public readonly mobileDialogController: MobileDialogController = createMobileDialogController({
        plugin: this, getDeps: () => ({ loadHubMount, loadReviewMount, mountChunkFallback, loadHubServices }),
        getI18n: () => this.i18n, ensureTier2Loaded: () => this.ensureTier2Loaded(),
        reportDialogOpenFailure: (t, e) => this.reportDialogOpenFailure(t, e),
    });

    public readonly badgeReminderService: BadgeReminderService = createBadgeReminderService(this);
    public readonly sessionService: SessionLifecycleService = createSessionLifecycleService(this);
    public editorMenuListeners!: ReturnType<typeof createEditorMenuListeners>;

    public settings: LvCardsSettings = defaultSettings(); public revlog: RevlogData = emptyRevlog();
    public saveRevlogTimer: ReturnType<typeof setTimeout> | null = null; public flashcardV2: MigrationStatus | null = null;
    public readonly v2SourceIndex = new V2SourceIndex();
    public topbarController: TopbarController | null = null; public badgeTimer: ReturnType<typeof setInterval> | null = null;
    public badgeTimerUnsub: (() => void) | null = null; public presentationPrivacyController = createPresentationPrivacyController();
    public onboardingTimer: ReturnType<typeof setTimeout> | null = null;
    public paletteState: { close?: () => void; element?: HTMLElement } | null | undefined = null;
    public docSyncTimer: ReturnType<typeof setTimeout> | null = null; public settingsSaveTimer: ReturnType<typeof setTimeout> | null = null;
    public persistedSettingsSnapshot: LvCardsSettings | null = null; public settingsMutationVersion = 0;
    public sessionState: SessionState = { date: "", reviewedIDs: [], skippedIDs: [], counters: { new: 0, review: 0, forget: 0, skip: 0 } };
    public persistedSessionStateSnapshot: SessionState | null = null; public persistedInboxSnapshot: InboxData | null = null;
    public revlogMutationVersion = 0; public persistedRevlogSnapshot: RevlogData | null = null;
    public cachedRevlogVersion = -1; public cachedReviewedBlockIDs: Set<string> | null = null; public cachedLapsesMap: Record<string, number> | null = null;
    public externalIntake: any = null; public inboxMutationVersion = 0; public errorTagMutationVersion = 0;
    public persistedErrorTagsSnapshot: ErrorTagsData | null = null; public sessionMutationVersion = 0;
    public suspendToday: SuspendTodayData = { date: "", cardIDs: [] }; public killSwitch: AIKillSwitchData = emptyKillSwitch();
    public examPlans: ExamPlansData = { version: 1, plans: [] }; public readonly examPlansSourceID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    public examPlansSequence = 0; public cachedExamLinkage: { name: string; days: number; source: string } | null = null;
    public isEditorQaServiceStarted = false; public editorQaService?: { dispose: () => void };
    public aiBatches: AIBatchesData = { version: 1, batches: [] }; public aiJobs: AIJobsData = emptyAIJobs();
    public aiDenyList: DenyListData = emptyDenyList(); public costLedger: CostLedgerData = emptyCostLedger();
    public obLedger: ObLedgerEntry[] = []; public ankiLedger: LedgerEntry[] = [];
    public contentVersions: ContentVersionsData = emptyContentVersions(); public knowledgeObjects: KnowledgeObjectsData = emptyKnowledgeObjects();
    public cardRelations: CardRelationsData = emptyCardRelations(); public errorTags: ErrorTagsData = emptyErrorTags();
    public inbox: InboxData = emptyInbox(); public learningGoals: LearningGoalsData = emptyGoals();
    public entryContexts: EntryContextData = emptyEntryContexts(); public contentLifecycles: ContentLifecyclesData = emptyLifecycles();
    public sourceHealth: SourceHealthData = emptySourceHealth(); public repairJournal: MaintenanceRepairJournal = { schema: 1, entries: [] };
    public isUnloading = false; public isUnloaded = false; public lastDue = 0; public reloadTimer: ReturnType<typeof setTimeout> | null = null;
    public secretSlotBound: Partial<Record<CardsSecretField, boolean>> = {};
    public reloadInFlight = false; public reloadQueued = false; public storageLastWrite: Record<string, number> = {};
    public pendingHubRequest: { tab: string; focusBlockID?: string } | null = null;

    public sourceHealthMutations = createSnapshotMutationQueue<SourceHealthData>(() => this.sourceHealth, current => cloneStore(current), next => this.storageCoordinator.save(SOURCE_HEALTH_DATA, next), next => { this.sourceHealth = next; });
    public suspendTodayMutations = createSuspendTodayMutations(() => this.suspendToday, data => this.storageCoordinator.save(SUSPEND_TODAY_DATA, data), data => { this.suspendToday = data; });
    public knowledgeObjectsMutations = createSnapshotMutationQueue<KnowledgeObjectsData>(() => this.knowledgeObjects, current => cloneStore(current), next => this.storageCoordinator.save(KNOWLEDGE_OBJECTS_DATA, next), next => { this.knowledgeObjects = next; });
    public cardRelationsMutations = createSnapshotMutationQueue<CardRelationsData>(() => this.cardRelations, current => cloneStore(current), next => this.storageCoordinator.save(CARD_RELATIONS_DATA, next), next => { this.cardRelations = next; });

    constructor(options?: any) {
        super(options);
        this.initLifecycleDisposers();
        void [this.mutateInbox, this.mutateKillSwitch, this.cancelPendingAiJobs, this.getMaintenanceRepairController, this.clearCostLedger, this.exportCostLedger, this.restoreBackupFromFile];
    }

    private initLifecycleDisposers(): void { setupLifecycleDisposers(this); }

    public get pluginContext(): IPluginContext {
        return createPluginContext({
            name: this.name, displayName: (this as any).displayName ?? "小驴闪卡", i18n: this.i18n, hostBridge: this.hostBridge,
            storage: {
                loadData: (k) => this.loadData(k), saveData: (k, d) => this.storageCoordinator.save(k, d),
                ensureTier2Loaded: () => this.storageCoordinator.ensureTier2Loaded(), dumpData: () => this.storageCoordinator.dumpData(),
                restoreData: (d) => this.storageCoordinator.restoreData(d), flush: () => this.storageCoordinator.flush(),
                get isTier2Ready() { return this.storageCoordinator.isTier2Ready; },
            },
            eventBus: this.eventBus, getIsUnloading: () => this.isUnloading, getSettings: () => this.settings, saveSettingsNow: () => this.saveSettingsNow(),
        });
    }

    public showNotice(message: string, timeout = 2500, icon?: "info" | "error"): void { this.hostBridge.showNotice(message, timeout, icon); }

    public async onload(): Promise<void> {
        safePerfMark("siyuan-lv-cards-onload-start");
        this.isUnloading = false;
        this.isUnloaded = false;
        this.autoOnboardingTriggered = false;
        this.isEditorQaServiceStarted = false;
        if (this.disposerRegistry.isDisposed) {
            this.disposerRegistry = createDisposerRegistry();
            this.initLifecycleDisposers();
        }
        this.disposerRegistry.register(() => {
            this.isUnloading = true;
            this.isUnloaded = true;
        });
        this.topbarController = new TopbarController({
            i18n: this.i18n, settings: this.settings, revlog: this.revlog, examPlans: this.examPlans,
            addIcons: (svg) => this.addIcons(svg), addTopBar: (opts) => this.addTopBar(opts),
            removeTopBar: (id) => (this as any).removeTopBar(id), openTabOf: (tab) => this.openTabOf(tab),
            showTopbarMenu: (menu) => this.showTopbarMenu(menu), showMessage: (msg, timeout, type) => this.showNotice(msg, timeout, type),
            onDueCountChanged: (newDue) => { this.lastDue = newDue; try { this.registerLaunchpadEntry(); } catch {} },
        }, TopbarController.ICON_SVG);
        this.addIcons(TopbarController.ICON_SVG);

        await this.applyTier1Stores(await this.readTier1Stores());
        const readOnlyTier1 = this.storageCoordinator.getReadOnlySlots();
        if (readOnlyTier1.length > 0) {
            this.showNotice(
                `读取本地存储失败（${readOnlyTier1.join(", ")}），已锁定只读防止覆盖原始数据`,
                5000,
                "error",
            );
        }
        safePerfMark("siyuan-lv-cards-tier1-ready");
        safePerfMeasure("siyuan-lv-cards-tier1-load", "siyuan-lv-cards-onload-start", "siyuan-lv-cards-tier1-ready");

        registerDashboardTab(this, { loadHubMount, loadReviewMount, mountChunkFallback, loadHubServices });
        registerReviewTab(this, { loadHubMount, loadReviewMount, mountChunkFallback, loadHubServices });
        this.initEditorQaService();
        this.editorMenuListeners = createEditorMenuListeners(this);
        setupPluginMenusAndCommands(this);
        setupEcosystemIntegrations(this);
        this.bindExamPlansSync();

        if (typeof window !== "undefined") (window as any).__lvCardsPlugin = this;
        this.eventBus.on("ws-main", this.sessionService.onWsMain);
        this.disposerRegistry.register(() => { this.eventBus.off("ws-main", this.sessionService.onWsMain); });

        safePerfMark("siyuan-lv-cards-onload-end");
        safePerfMeasure("siyuan-lv-cards-onload", "siyuan-lv-cards-onload-start", "siyuan-lv-cards-onload-end");
        this.scheduleTier2Load();
    }

    public onLayoutReady(): void {
        safePerfMark("siyuan-lv-cards-layoutready-start");
        this.refreshDueBadge(); this.setupBadgeTimer();
        detectFlashcardV2().then(s => {
            this.flashcardV2 = s;
            if (s?.state === "Active" && !this.isUnloading && !this.isUnloaded) {
                void this.refreshV2SourceIndexSoon();
            }
        }).catch(() => {});
        safePerfMark("siyuan-lv-cards-layoutready-end");
        safePerfMeasure("siyuan-lv-cards-layoutready", "siyuan-lv-cards-layoutready-start", "siyuan-lv-cards-layoutready-end");
        safePerfMeasure("siyuan-lv-cards-startup-total", "siyuan-lv-cards-onload-start", "siyuan-lv-cards-layoutready-end");
    }

    public async onunload(): Promise<void> {
        const unloadStart = Date.now();
        this.isUnloading = true;
        this.storageCoordinator.incrementLoadGeneration();
        this.cancelTier2Schedule();
        if (this.editorQaService) { this.editorQaService.dispose(); this.editorQaService = undefined; }
        this.isEditorQaServiceStarted = false;
        if (this.settingsSaveTimer) { clearTimeout(this.settingsSaveTimer); this.settingsSaveTimer = null; await this.saveSettingsNow(); }
        if (this.saveRevlogTimer) { this.sessionService.flushRevlogSave(); }
        this.disposerRegistry.dispose();
        try { lvSnapshotVault.unregister("siyuan-lv-cards"); } catch {}
        this.pendingHubRequest = null;
        this.isUnloaded = true;
        if (typeof window !== "undefined" && (window as any).__lvCardsPlugin === this) {
            delete (window as any).__lvCardsPlugin;
        }
        try {
            await this.storageCoordinator.flush();
            lvLog("info", "[unload] storage flush done: " + (Date.now() - unloadStart) + "ms");
        } catch (err) {
            lvLog("warn", `[unload] storage flush failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    public onDataChanged(files?: unknown): void { this.sessionService.handleDataChanged(files); }
    public async uninstall(): Promise<void> {
        await this.onunload();
        try {
            if (typeof localStorage !== "undefined") {
                localStorage.removeItem("lv_cards_block_action_usage");
            }
        } catch {}
    }

    public get tier2Ready(): boolean { return this.storageCoordinator.isTier2Ready; }
    public set tier2Ready(val: boolean) { this.storageCoordinator.setTier2Ready(val); }
    public get tier2LoadingPromise(): any { return this.storageCoordinator.tier2LoadingPromise; }
    public set tier2LoadingPromise(val: any) { this.storageCoordinator.tier2LoadingPromise = val; }
    public get tier2LoadGeneration(): number { return this.storageCoordinator.getLoadGeneration(); }
    public set tier2LoadGeneration(_val: number) {}
    public get tier2IdleId(): any { return this.storageCoordinator.tier2IdleId; }
    public set tier2IdleId(val: any) { this.storageCoordinator.tier2IdleId = val; }

    public ensureTier2Loaded(): Promise<void> { return this.storageCoordinator.ensureTier2Loaded(); }
    public cancelTier2Schedule(): void { this.storageCoordinator.cancelTier2Schedule(); }
    private scheduleTier2Load(): void { this.storageCoordinator.scheduleTier2Load(); }

    // safePerfMark("siyuan-lv-cards-tier2-start");
    // safePerfMark("siyuan-lv-cards-tier2-end");
    // safePerfMeasure("siyuan-lv-cards-tier2-load", "siyuan-lv-cards-tier2-start", "siyuan-lv-cards-tier2-end");

    public async readTier1Stores(): Promise<Record<string, unknown>> { return this.storageCoordinator.readTier1Stores(); }
    public async applyTier1Stores(loaded: Record<string, unknown>) { await applyTier1PluginStores(this, loaded); }
    public async readTier2Stores(): Promise<Record<string, unknown>> { return this.storageCoordinator.readTier2Stores(); }
    public async applyTier2Stores(loaded: Record<string, unknown>) { await applyTier2PluginStores(this, loaded, { loadHubServices }); }
    public async readAllStores(): Promise<Record<string, unknown>> { return this.storageCoordinator.readAllStores(); }
    public async applyLoadedStores(loaded: Record<string, unknown>) {
        await applyAllPluginStores(this, loaded, { loadHubServices });
        this.storageCoordinator.setTier2Ready(true);
    }

    // 25 Write Entrance Guards
    async dumpData(): Promise<Record<string, unknown>> { await this.ensureTier2Loaded(); return this.storageCoordinator.dumpData(); }
    async restoreData(data: Record<string, unknown>): Promise<boolean> { await this.ensureTier2Loaded(); return this.storageCoordinator.restoreData(data); }
    async saveKnowledgeObjects() { await this.ensureTier2Loaded(); return this.storageCoordinator.save(KNOWLEDGE_OBJECTS_DATA, this.knowledgeObjects); }
    async saveCardRelations() { await this.ensureTier2Loaded(); return this.storageCoordinator.save(CARD_RELATIONS_DATA, this.cardRelations); }
    tagErrorReason(cardID: string, reason: ErrorReason, blockID?: string) {
        void this.ensureTier2Loaded().catch((e) => lvLog("warn", String(e)));
        tagPluginErrorReason(this, cardID, reason, blockID);
    }
    async saveInbox() { await this.ensureTier2Loaded(); return this.storageCoordinator.save(INBOX_DATA, this.inbox); }
    private async mutateInbox(mutate: (next: InboxData) => number | boolean | void): Promise<void> {
        await this.ensureTier2Loaded(); mutate(this.inbox); return this.saveInbox();
    }
    async saveLearningGoals() { await this.ensureTier2Loaded(); return this.storageCoordinator.save(LEARNING_GOALS_DATA, this.learningGoals); }
    async saveEntryContexts() { await this.ensureTier2Loaded(); return this.storageCoordinator.save(ENTRY_CONTEXTS_DATA, this.entryContexts); }
    async saveContentLifecycles() { await this.ensureTier2Loaded(); return this.storageCoordinator.save(CONTENT_LIFECYCLES_DATA, this.contentLifecycles); }
    async saveKillSwitch() { await this.ensureTier2Loaded(); return this.storageCoordinator.save(AI_KILL_SWITCH_DATA, this.killSwitch); }
    private async mutateKillSwitch(mutate: (next: AIKillSwitchData) => void): Promise<AIKillSwitchData> {
        await this.ensureTier2Loaded(); return this.aiCardService.mutateKillSwitch(mutate);
    }
    public async clearSessionState(): Promise<void> {
        await this.ensureTier2Loaded();
        const next = { date: "", reviewedIDs: [], skippedIDs: [], counters: { new: 0, review: 0, forget: 0, skip: 0 } };
        this.sessionState = next; await this.storageCoordinator.save(SESSION_STATE_DATA, next);
    }
    private async cancelPendingAiJobs(): Promise<number> { await this.ensureTier2Loaded(); return this.aiCardService.cancelPendingAiJobs(); }
    private async rememberSourceFingerprint(blockID: string, rootID?: string, markdown?: string): Promise<void> {
        await this.ensureTier2Loaded(); return rememberPluginSourceFingerprint(this, blockID, rootID, markdown);
    }
    async reconcileSourceHealthForScan(cards: any[]): Promise<void> {
        await this.ensureTier2Loaded(); return reconcilePluginSourceHealthForScan(this, cards);
    }
    async acknowledgeSourceHealth(blockID: string): Promise<void> {
        await this.ensureTier2Loaded(); return acknowledgePluginSourceHealth(this, blockID);
    }
    private async getMaintenanceRepairController() { await this.ensureTier2Loaded(); return this.maintenanceService.getController(); }
    public async saveBlockContentVersion(blockID: string, markdown: string, recovery?: any): Promise<boolean | string> {
        await this.ensureTier2Loaded?.();
        if (this.maintenanceService) return this.maintenanceService.saveBlockContentVersion(blockID, markdown, recovery);
        return doFallbackSaveBlockContentVersion(this, blockID, markdown, recovery);
    }
    async acceptContentVersion(blockID: string, at: number): Promise<void> { await this.ensureTier2Loaded(); return this.maintenanceService.acceptContentVersion(blockID, at); }
    private async clearCostLedger(): Promise<void> { await this.ensureTier2Loaded(); return this.aiCardService.clearCostLedger(); }
    private async exportCostLedger(): Promise<void> {
        await this.ensureTier2Loaded();
        const { exportAiCostLedger } = await loadHubServices();
        exportAiCostLedger(this.costLedger, localDate(Date.now()));
    }
    private async restoreBackupFromFile(text: string) { await this.ensureTier2Loaded(); return this.sessionService.restoreBackupFromFile(text); }
    private async persistAIJobs(previous: AIJobsData): Promise<void> {
        await this.ensureTier2Loaded();
        return this.aiJobsCoordinator.persist(this, previous);
    }
    private async persistAIJobsOnce(operationId: string): Promise<void> {
        await this.ensureTier2Loaded();
        return this.aiJobsCoordinator.persistOnce(this, operationId);
    }

    private autoOnboardingTriggered = false;
    private maybeOpenOnboardingOnFlashcardsOpen(): void {
        if (!this.settings.onboarded && !this.autoOnboardingTriggered && !this.isUnloading) {
            this.autoOnboardingTriggered = true;
            this.onboardingTimer = setTimeout(() => {
                this.onboardingTimer = null;
                if (!this.settings.onboarded && !this.isUnloading) {
                    void this.openOnboarding();
                }
            }, 150);
        }
    }

    // 8 UI Entrance Guards
    public openTabOf(type: string, data?: Record<string, unknown>) {
        void this.ensureTier2Loaded().catch((err) => { lvLog("warn", `[storage] ensureTier2Loaded on openTabOf failed: ${err}`); });
        const tab = openPluginTab(this, type, data);
        if (type === TAB_DASHBOARD) {
            this.maybeOpenOnboardingOnFlashcardsOpen();
        }
        return tab;
    }
    public openSetting(): void {
        void this.ensureTier2Loaded().catch((err) => { lvLog("warn", `[storage] ensureTier2Loaded on openSetting failed: ${err}`); });
        void this.openSettingsDialog();
    }
    public async openSettingsDialog(onSaved?: () => void, initialSection?: "imports") {
        void this.ensureTier2Loaded().catch((err) => { lvLog("warn", `[storage] ensureTier2Loaded on openSettingsDialog failed: ${err}`); });
        return openPluginSettingsDialog(this, onSaved, initialSection);
    }
    public async openDeckPicker(blockIDs: string[], opts: { skipAdd?: boolean; onPicked?: (deckID: string) => void } = {}) {
        void this.ensureTier2Loaded().catch((err) => { lvLog("warn", `[storage] ensureTier2Loaded on openDeckPicker failed: ${err}`); });
        return openPluginDeckPicker(this, blockIDs, opts);
    }
    public async openQuickCard(prefillQ = "") {
        void this.ensureTier2Loaded().catch((err) => { lvLog("warn", `[storage] ensureTier2Loaded on openQuickCard failed: ${err}`); });
        return openPluginQuickCard(this, prefillQ);
    }
    public async openQuickCardFromSelection(blockID: string, selectionText: string) {
        void this.ensureTier2Loaded().catch((err) => { lvLog("warn", `[storage] ensureTier2Loaded on openQuickCardFromSelection failed: ${err}`); });
        return openPluginQuickCardFromSelection(this, blockID, selectionText);
    }
    public async openOnboarding() {
        void this.ensureTier2Loaded().catch((err) => { lvLog("warn", `[storage] ensureTier2Loaded on openOnboarding failed: ${err}`); });
        return openPluginOnboarding(this);
    }
    public async openHubMobileDialog(tab?: string | Record<string, unknown>) {
        void this.ensureTier2Loaded().catch((err) => { lvLog("warn", `[storage] ensureTier2Loaded on openHubMobileDialog failed: ${err}`); });
        const res = await this.mobileDialogController.openHubMobileDialog(tab);
        this.maybeOpenOnboardingOnFlashcardsOpen();
        return res;
    }
    public openReviewMobileDialog(data?: Record<string, unknown>) {
        void this.ensureTier2Loaded().catch((err) => { lvLog("warn", `[storage] ensureTier2Loaded on openReviewMobileDialog failed: ${err}`); });
        return this.mobileDialogController.openReviewMobileDialog(data);
    }

    // Forwarders and Business Delegations
    public fallbackSaveBlockContentVersion(blockID: string, markdown: string) {
        appendVersion(this.contentVersions, blockID, markdown, Date.now(), "editor");
        return doFallbackSaveBlockContentVersion(this, blockID, markdown);
    }
    public getDueCount(): number { return this.lastDue || (this.topbarController?.getLastDue() ?? 0); }
    public openReviewTab(options?: Record<string, unknown>): void { this.openTabOf(TAB_REVIEW, options); }
    public openReviewScope(scopeKindOrKey: string, scopeIdOrCram?: string | boolean, cram = false, planId = "") { this.reviewCoordinator.openReviewScope(scopeKindOrKey, scopeIdOrCram, cram, planId); }
    public openReviewWithEntry(scope: string, cram: boolean, entry?: { entryKind: EntryKind; sourceID: string; returnPoint: string }) { this.reviewCoordinator.openReviewWithEntry(scope, cram, entry); }
    public handleQuickAction(action: string): void { handleCardsQuickAction(this, action); } public registerLaunchpadEntry(): void { registerCardsLaunchpad(this); }
    public ensureTopBarElement(): HTMLElement | null { return this.topbarController?.getElement() || null; }
    public refreshDueBadge(): void { this.topbarController?.refreshDueBadge(localDate(Date.now())); this.lastDue = this.topbarController?.getLastDue() ?? 0; }
    public setupBadgeTimer(): void { this.badgeReminderService.setupBadgeTimer(); } public inQuietHours(): boolean { return this.badgeReminderService.inQuietHours(); }
    public appendRevlog(entry: any): void { this.sessionService.appendRevlog(entry); } public rollbackRevlog(cardID?: string) { return this.sessionService.rollbackRevlog(cardID); }
    public scheduleRevlogSave() { this.sessionService.scheduleRevlogSave(); } public flushRevlogSave() { this.sessionService.flushRevlogSave(); }
    public async targetNotebook(): Promise<{ id: string; name: string } | null> { return resolveTargetNotebook(await getNotebooks(), this.settings.targetNotebookId); }
    public isMobileHost(): boolean {
        if ((this as any).isMobile || lvLaunchpad.isMobileFrontend()) return true;
        try { const fe = (window as any).siyuan?.getFrontend?.() ?? ""; return fe === "mobile" || fe === "browser-mobile"; } catch { return false; }
    }
    public async toggleStarCard(id: string): Promise<boolean> {
        const s = new Set(this.settings.starredCards); const added = !s.delete(id); if (added) s.add(id);
        this.settings.starredCards = [...s]; this.saveSettingsSoon();
        try { await setBlockAttrs(id, buildStarredAttrs(added)); } catch {}
        return added;
    }
    public async saveSettingsNow(): Promise<void> {
        this.setupBadgeTimer(); const version = ++this.settingsMutationVersion;
        const runtimeNext = normalizeSettings(cloneStore(this.settings));
        const boundFields: Partial<Record<CardsSecretField, boolean>> = {};
        const pendingUpdates: Partial<Record<CardsSecretSlot, string>> = {};
        const pendingFields: CardsSecretField[] = [];

        for (const field of ["aiKey", "aiFallbackKey", "ankiClientKey"] as const) {
            const slot = CARDS_SECRET_SLOTS[field];
            const val = typeof runtimeNext[field] === "string" ? runtimeNext[field].trim() : "";
            const inSlot = readCardsSecretSlot(this, slot);
            if (val) {
                if (inSlot === val || this.secretSlotBound[field] === true) {
                    boundFields[field] = true;
                } else {
                    pendingFields.push(field);
                    pendingUpdates[slot] = val;
                }
            } else if (this.secretSlotBound[field] === false && !runtimeNext[`${field}Configured`]) {
                boundFields[field] = false;
            }
        }

        if (pendingFields.length > 0) {
            const bindRes = await bindCardsSecretSlots({
                updates: pendingUpdates,
                host: (this as any).secretHost ?? (this as any).host,
                fetchFn: (this as any).secretFetchFn ?? (this as any).fetchFn,
                plugin: this,
            });
            for (const field of pendingFields) {
                const configuredField = `${field}Configured` as "aiKeyConfigured" | "aiFallbackKeyConfigured" | "ankiClientKeyConfigured";
                if (bindRes.ok) {
                    boundFields[field] = true;
                    this.secretSlotBound[field] = true;
                    runtimeNext[configuredField] = true;
                } else {
                    boundFields[field] = false;
                    this.secretSlotBound[field] = false;
                    runtimeNext[configuredField] = false;
                }
            }
        }

        const persistedNext = stripSecretsForStorage(runtimeNext, { boundFields });
        try {
            await this.storageCoordinator.save(SETTINGS_DATA, persistedNext);
            if (version === this.settingsMutationVersion) {
                this.settings = normalizeSettings(cloneStore(runtimeNext));
                this.persistedSettingsSnapshot = cloneStore(runtimeNext);
            }
            try { (this.eventBus as any).emit(LV_EVENTS.settingsChanged, settingsChangedEvent()); } catch {}
            this.scheduleVaultAutoBackup();
        } catch (e) {
            if (version === this.settingsMutationVersion && this.persistedSettingsSnapshot) {
                this.settings = normalizeSettings(cloneStore(this.persistedSettingsSnapshot)); this.setupBadgeTimer();
            }
            throw e;
        }
    }
    public saveSettingsSoon() { if (this.settingsSaveTimer) clearTimeout(this.settingsSaveTimer); this.settingsSaveTimer = setTimeout(() => { this.settingsSaveTimer = null; void this.saveSettingsNow(); }, 1200); }
    public markOnboarded() { if (!this.settings.onboarded) { this.settings.onboarded = true; this.saveSettingsSoon(); } }
    public async hasValidOcclusionCard(blockID: string, markdown?: string): Promise<boolean> {
        const text = markdown ?? (await getBlockDOM(blockID)) ?? ""; return hasImageContent(text) || text.includes('data-type="img"');
    }
    public openSiYuanTarget(docOrBlockId: string, zoomIn = false): void {
        if (!docOrBlockId) return; this.mobileDialogController.closeAll();
        if (this.isMobileHost()) { this.hostBridge.openMobileFile(this.app, docOrBlockId, ["cb-get-focus", "cb-get-hl"]); return; }
        void this.hostBridge.openTab({ app: this.app, doc: zoomIn ? { id: docOrBlockId, zoomIn: true } : { id: docOrBlockId } });
    }
    public togglePresentationPrivacy() {
        const state = this.presentationPrivacyController.getState();
        if (state.enabled) { this.presentationPrivacyController.exit(); this.showNotice(String(this.i18n.presentationPrivacyTipExited ?? "已退出演示模式"), 2500, "info"); }
        else { this.presentationPrivacyController.enter("screen-sharing"); this.showNotice(String(this.i18n.presentationPrivacyTipActive ?? "私密演示模式已启用"), 3500, "info"); }
    }
    public openOrCreateDynamicBoardDoc(): Promise<string> { return openOrCreateDynamicBoardDoc(this); }
    public openCardQuestionDialog(blockID?: string) { return openPluginCardQuestionDialog(this, blockID); }
    public openActiveBlockQuestionDialog() { openPluginActiveBlockQuestionDialog(this); }
    public openActiveBlockActionCenter() { openPluginActiveBlockActionCenter(this); }
    public openBlockActionCenter(b: string, a: HTMLElement) { return openPluginBlockActionCenter(this, b, a); }
    public makeClozeCard(b: string, r?: Range | null, t?: string) { makePluginClozeCard(this, b, r, t); }
    public openOcclusionEditor(b: string, d: string) { return openPluginOcclusionEditor(this, b, d); }
    public removeCardsFromDeck(ids: string[], deckID?: string) { return removePluginCardsFromDeck(this, ids, deckID); }
    public addDocToReview(id: string) { return this.editorMenuListeners?.addDocToReview(id); }
    public removeDocFromReview(id: string) { return this.editorMenuListeners?.removeDocFromReview(id); }
    public openAIWizard(s = "", c?: () => void) {
        void this.ensureTier2Loaded().catch((err) => { lvLog("warn", `[storage] ensureTier2Loaded on openAIWizard failed: ${err}`); });
        return openPluginAIWizard(this, s, c);
    }
    public openMarkerCards() {
        void this.ensureTier2Loaded().catch((err) => { lvLog("warn", `[storage] ensureTier2Loaded on openMarkerCards failed: ${err}`); });
        return openPluginMarkerCards(this);
    }
    public openChallenge() {
        void this.ensureTier2Loaded().catch((err) => { lvLog("warn", `[storage] ensureTier2Loaded on openChallenge failed: ${err}`); });
        return openPluginChallenge(this);
    }
    public openPairing() {
        void this.ensureTier2Loaded().catch((err) => { lvLog("warn", `[storage] ensureTier2Loaded on openPairing failed: ${err}`); });
        return openPluginPairing(this);
    }
    public openRepairDrill() {
        void this.ensureTier2Loaded().catch((err) => { lvLog("warn", `[storage] ensureTier2Loaded on openRepairDrill failed: ${err}`); });
        return openPluginRepairDrill(this);
    }
    public openHelpDoc() { return openPluginHelpDoc(this); } public createSampleWorkspace() { return createSampleWorkspace(this); }
    public copyDiagnostics() {
        void this.ensureTier2Loaded().catch((err) => { lvLog("warn", `[storage] ensureTier2Loaded on copyDiagnostics failed: ${err}`); });
        return copyDiagnostics(this);
    }
    public openPalette() {
        void this.ensureTier2Loaded().catch((err) => { lvLog("warn", `[storage] ensureTier2Loaded on openPalette failed: ${err}`); });
        return openPluginPalette(this);
    }
    public showTopbarMenu(menu: subMenu) {
        appendPluginTopbarMenuItems(buildPluginTopbarMenuProps(this), menu as any);
        const stat = this.revlog.days[localDate(Date.now())];
        const doneToday = (stat?.new ?? 0) + (stat?.review ?? 0);
        if (stat && this.settings.dailyReviewTarget > 0 && doneToday >= this.settings.dailyReviewTarget) {
            this.showNotice(String(this.i18n.dailyTargetReached ?? "今日复习目标已达成！"), 3000, "info");
        }
    }
    public receiveExtract(envelope: ExtractEnvelope) { return receiveCardsExtract(this, envelope); }
    public createExternalAtomicCard(input: IntakeInput) { return createCardsExternalAtomicCard(this, input); }
    public createAICards(cards: any, deckID: string, deckName: string, jobId: string, sourceMeta?: any) {
        return this.aiCardService.createAICards(cards, deckID, deckName, jobId, sourceMeta);
    }
    public getUnfinishedAIJob() { return this.aiCardService.getUnfinishedAIJob(); }
    public aiProviderTargets(): string[] {
        return this.aiCardService.aiProviderTargets();
    }
    private inboxListeners = new Set<() => void>();
    public subscribeInbox(cb: () => void): () => void { this.inboxListeners.add(cb); return () => { this.inboxListeners.delete(cb); }; }
    public notifyInboxChanged(): void {
        for (const cb of this.inboxListeners) { try { cb(); } catch {} }
        try { (this.eventBus as any).emit(LV_EVENTS.storesChanged, storesChangedEvent([INBOX_DATA])); } catch {}
    }
    public async addInboxItems(docIDs: string[]) { await this.mutateInbox(inbox => { for (const id of docIDs) addInboxItem(inbox, id); }); this.notifyInboxChanged(); }
    public toastStorageFail(): never { this.showStorageFail(); throw new Error(String(this.i18n.storageWriteFail ?? "存储写入失败")); }
    public showStorageFail() { this.showNotice(String(this.i18n.storageWriteFail ?? "存储写入失败"), 3500, "error"); }
    public reloadLocalStoresBounded(files: string[] = [], options?: { discardPending?: boolean }) { return this.sessionService.reloadLocalStoresBounded(files, options); }
    public bindExamPlansSync() { this.deckExamSyncService.bind(); } public unbindExamPlansSync() { this.deckExamSyncService.unbind(); }
    public initEditorQaService(): void {
        if (this.isEditorQaServiceStarted) return;
        this.isEditorQaServiceStarted = true;
        this.editorQaService = setupEditorQaIntegration(this);
    }
    public reportDialogOpenFailure(title: string, err: unknown) { reportDialogOpenFailure(this, title, err); }
    public getRevlogBlockIndex(): { reviewedSet: Set<string>; lapsesMap: Record<string, number> } {
        return getPluginRevlogBlockIndex(this);
    }
    public scheduleVaultAutoBackup(): void {
        if (this.isUnloading || this.isUnloaded) return;
        try { lvSnapshotVault.scheduleAutoBackup("siyuan-lv-cards"); } catch {}
    }
    public async refreshV2SourceIndexSoon(): Promise<void> {
        if (this.flashcardV2?.state !== "Active" || this.isUnloading || this.isUnloaded) return;
        await this.v2SourceIndex.ensureFresh(async (offset, limit) => {
            const resp: any = await (fetchSyncPost as any)("/api/flashcard/queryCards", {
                options: { now: Date.now(), includeInactive: false, includeSuspended: true, includeBuried: true, includePaused: true, groupBySource: true, limit, offset },
            });
            return resp && resp.code === 0 ? resp.data : null;
        });
    }
}
