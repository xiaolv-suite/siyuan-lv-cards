import "./index.scss";

import { Plugin, getAllEditor, openTab, openMobileFileById, getAllTabs, type subMenu, type TProtyleAction } from "siyuan";
import { showMessage, lvNotify, lvTicker, withDocLock, notifyDailyReviewReminder, notifyBatchCardCreation, lvBackup, lvLaunchpad, lvOmnisearch, lvAutomation, type LvSearchResultItem } from "./libs/notice";
import * as siyuanNamespace from "siyuan";

import { invalidateChunk, loadChunk, type ChunkMount } from "./libs/chunk-loader";
import { setDialogMounter } from "./libs/dialog";
import { svelteDialog, simpleDialog, confirmDialogBool, bindMobileVisualViewport } from "./libs/dialog";

// AT-17：UI chunk（独立 IIFE 自带 svelte）经全局取 siyuan 模块——shell 在此注入单一事实源
(window as unknown as { __lvSiyuan: unknown }).__lvSiyuan = siyuanNamespace;
import { lvLog, lvLogDump } from "./libs/log";
import { createPersist, type PersistQueue } from "./libs/persist";
import { normalizeAIBatches, type AIBatchesData } from "./core/ai-batches";
import { defaultSettings, normalizeSettings, type LvCardsSettings } from "./core/settings";
import { PERSONA_PRESETS } from "./core/personas";
import { normalizeNativeCardAction, NativeEventDeduper } from "./core/native-events";
import type { PaletteCommand } from "./core/palette";
import {
    normalizeAIJobs, emptyAIJobs, createJob, transitionJob, pruneJobs,
    type AIJobsData, type AIJob,
} from "./core/ai-jobs";
import {
    appendRevlog, rollbackLastRevlogEntry, calcStreak, emptyRevlog, localDate, normalizeRevlog, mergeRevlog,
    DEFAULT_LEECH_THRESHOLD,
    type RevlogData, type RevlogEntry,
} from "./core/revlog";
import { detectFlashcardV2, type MigrationStatus } from "./api/flashcardV2";
import { getRiffCardsByBlockIDs } from "./api/riff";
// AT-4：addRiffCards 取经 due-shared 的包装版（建卡成功即失效共享 due 缓存），badge/提醒走共享缓存
import { addRiffCards, cachedDueCount, dueCache, formatRiffCardEntryError, invalidateDueCache } from "./api/due-shared";
import { withExternalIntakeLock } from "./libs/external-intake-lock";
import { readPluginJsonFile, writePluginJsonFile } from "./api/plugin-json-file";
import { createExternalCardIntake, INTAKE_JOURNAL, assertSafeIntakeRestore, type IntakeInput } from "./core/external-card-intake";
import { mountCardsBridge, dispatchCardReviewedEvent } from "./api/external-bridge";
import { registerRaikiriModuleSafely } from "./libs/ecosystem-bridge-kit";
import { createPerf } from "./libs/perf";
import { cardsCreatedEvent, gatewayChangedEvent, LV_EVENTS, reviewedEvent, settingsChangedEvent, storesChangedEvent, streakChangedEvent } from "./libs/events";
import { emptyKnowledgeObjects, type KnowledgeObjectsData } from "./core/knowledge-objects";
import { emptyCardRelations, type CardRelationsData } from "./core/card-relations";
import { emptyErrorTags, normalizeErrorTags, tagError, type ErrorTagsData, type ErrorReason } from "./core/error-reasons";
import { addInboxItem, emptyInbox, normalizeInbox, removeInboxItem, type InboxData } from "./core/inbox";
import { emptyGoals, type LearningGoalsData, type LearningGoal } from "./core/learning-goal";
import { emptyEntryContexts, upsertContext, type EntryContextData, type EntryKind } from "./core/entry-context";
import { ensureLifecycle, emptyLifecycles, transition, type ContentLifecyclesData, type ContentState } from "./core/content-lifecycle";
import { appendBlock, createDocWithMd, getNotebooks, getBlockAttrs, exportMdContent, sqlQuery, kernelVersion, updateBlock, probeAssetRefs, setBlockAttrs, findDocIDByHPath } from "./api/siyuan";
import { buildStarredAttrs, buildLeechAttrs, buildErrorReasonAttrs } from "./core/block-attributes";
import { buildDynamicBoardMarkdown, DYNAMIC_BOARD_DOC_PATH } from "./core/dynamic-notebook";
import { aiChat, estimateTokens, parseCards, isAICanceled } from "./api/ai";
import { rollDateIfNeeded, type SuspendTodayData } from "./core/suspend-today";
import { type ExtractEnvelope } from "./core/incremental-learning";
import { createSuspendTodayMutations } from "./core/suspend-today-persistence";
import { createSnapshotMutationQueue } from "./core/snapshot-mutation-queue";
import { normalizeLedger, type LedgerEntry } from "./core/import-ledgers";
import { acceptVersion, appendVersion, emptyContentVersions, versionsOf } from "./core/content-versions";
import { assembleGeneratePrompt } from "./core/ai-pipeline";
import { checkEligibility } from "./core/ai-eligibility";
import { disableTarget, emptyKillSwitch, enableTarget, grantConsent, killSwitchBlock, normalizeKillSwitch, revokeConsent, type AIKillSwitchData } from "./core/ai-kill-switch";
import { addDenyRule, emptyDenyList, isDenied, normalizeDenyList, type DenyListData } from "./core/ai-source-deny";
import { evaluateRefusal } from "./core/ai-refusal";
import { fnv1a } from "./core/ai-provenance";
import { isSelectableModel, estimateCallCostUsd } from "./core/ai-model-registry";
import { budgetState, emptyCostLedger, normalizeCostLedger, recordEntry, type CostLedgerData } from "./core/ai-cost-ledger";
import { MODEL_PRICE_SNAPSHOT } from "./core/ai-model-registry";
import { previewRestore } from "./core/backup";
import { normalizeObLedger, type ObLedgerEntry } from "./core/import-ledgers";
import { parseRevlogCsv } from "./core/revlog-csv";
import { type SessionState } from "./core/session-state";
import { type ExamPlan, type ExamPlansData } from "./core/exam";
import {
    EXAM_PLANS_CHANGED_EVENT,
    EXAM_PLANS_PUBLISH_RPC,
    createExamPlansChangedNotice,
    isKernelPluginRunning,
    persistThenNotify,
    shouldReloadExamPlans,
} from "./core/exam-plan-sync";
import { registerPluginCommands } from "./bootstrap/commands";
import { appendPluginTopbarMenuItems } from "./bootstrap/topbar-menu";
import { createPresentationPrivacyController } from "./core/presentation-privacy";
import { createFullSampleWorkspace, createOnboardingSampleCards } from "./core/workspace-samples";
import {
    applyRestoreTransaction,
} from "./core/data-transfer";
import {
    isWithinQuietHours,
    decideBacklogWarning,
    decideExamMilestoneReminder,
    shouldTriggerDailyReminder,
} from "./core/badge-reminder";
import { addBlockMenuItems, computeBlockMenuItems, extractBlockIDs } from "./bootstrap/block-menu";
import { TopbarController } from "./bootstrap/topbar-controller";
import {
    registerDashboardTab,
    registerReviewTab,
    buildHubMountProps,
    buildReviewMountProps,
    TAB_DASHBOARD,
    TAB_REVIEW,
    type TabDeps,
} from "./bootstrap/tab-registrars";
import {
    buildRepairDrillDialogArgs,
    buildChallengeDialogArgs,
    buildPairingDialogArgs,
    buildOcclusionEditorDialogArgs,
} from "./bootstrap/dialog-openers";
import { readAllPluginStores, applyAllPluginStores } from "./bootstrap/storage-loader";
import {
    resolveTargetNotebook,
    queryNotebookBlockIDs,
} from "./core/report-writer";
import { maybeWriteWeeklyReport } from "./features/weekly-report-service";
import {
    exportRevlogJson,
    exportSettingsJson,
    exportRevlogToCsv,
    exportAiCostLedger,
    exportAllBackupBundle,
} from "./features/data-export-manager";
import {
    findUnfinishedAIJob,
    getRecoverableJobSummaries,
    prepareReviewableJob,
    cancelAllActiveJobs,
} from "./core/ai-job-recovery";
import {
    checkDuplicateCards,
    removeCardsFromDeckFlow,
    executeQuickCardCreation,
    extractMarkerCardItems,
} from "./core/card-operations";
import { hasImageContent, serializeQaCard } from "./core/flashcard-quality";
import { findAiCardGateIssues } from "./core/ai-card-gate";
import { validateCardEntry } from "./core/card-entry-gate";
import { parseOcclusion } from "./core/occlusion";
import { extractMediaRefs } from "./core/media-refs";
import type { HubServices } from "./core/hub-services";
import {
    acknowledgeSourceHealth as acknowledgeSourceHealthStore,
    emptySourceHealth,
    reconcileSourceHealth,
    sourceBaselineMarkdown,
    upsertSourceFingerprint,
    type SourceHealthData,
} from "./core/source-health-store";
import type { SourceCurrentFacts } from "./core/source-health";
import type {
    BatchRepairProposal,
    BatchRepairPreview,
    MaintenanceRepairJournal,
} from "./core/maintenance-repair";
import type { createMaintenanceRepairController } from "./core/maintenance-repair-controller";
import type { RepairSnapshotWrite } from "./core/maintenance-repair-storage";
import {
    buildBudgetPreview,
    queryNotebookMaterialText,
    buildAiCardMarker,
    buildAiCardBlockMarkdown,
} from "./core/ai-wizard-service";
import { computeStorageStats, probeAnkiConnection } from "./core/storage-diagnostics";
import {
    buildReviewScopeKey,
    parseReturnPoint,
} from "./core/palette-navigation";
// 重组件对话框懒加载（AN 体积评审）：打开时才拉取对应 chunk
// AT-14：Hub（闪卡中心）同样懒加载——静态引用会把 Manager/Dashboard/CardDetail/KoPanel 全链拉进主包
const lazyComp = (loader: () => Promise<{ default: any }>) => {
    let cached: any = null;
    return async () => {
        if (!cached) {
            cached = (await loader()).default;
        }
        return cached;
    };
};

/**
 * AT-17（v0.158.0）：hub/review 重组件改走 script 标签 chunk（独立 IIFE 自带 svelte，
 * 挂载与组件同实例避免双份内部状态）。dev 模式保留进程内动态导入（dev 构建无 chunk 文件）。
 * 统一返回 ChunkMount 形状：mount(target, props) → { destroy() }。
 */
/**
 * Development fallback for the standalone chunk loader. Production never
 * mounts Svelte components in the shell, so the Svelte runtime stays out of
 * the startup payload entirely (the IIFE chunks carry their own runtime).
 */
const mountComp = process.env.DEV_MODE
    ? (loader: () => Promise<{ default: any }>) => async (): Promise<ChunkMount["mount"]> => {
        const { mount, unmount } = await import("svelte");
        const Comp = (await loader()).default;
        return (target: HTMLElement, props: Record<string, unknown>) => {
            const app = mount(Comp, { target, props });
            return { destroy: () => { void unmount(app); } };
        };
    }
    : (_loader: () => Promise<{ default: any }>) => async (): Promise<ChunkMount["mount"]> => {
        throw new Error("Svelte dev mount is unavailable in production");
    };
const loadHubMount: () => Promise<ChunkMount["mount"]> = process.env.DEV_MODE
    ? mountComp(() => import("./ui/hub.svelte"))
    : () => loadChunk("hub").then(m => m.mount);
// Keep maintenance-only computation out of startup; adapters and stores stay in the shell.
const loadHubServices: () => Promise<HubServices> = process.env.DEV_MODE
    ? () => import("./core/hub-services").then(m => m.hubServices)
    : async () => {
        const { services } = await loadChunk("hub");
        if (!services || !["previewBatchRepair", "confirmBatchRepair", "applyBatchRepair", "createMaintenanceRepairStorage",
            "findApproximateDuplicateCandidates", "helpMarkdown", "renderExamReportMarkdown", "buildDiagnosticsText"]
            .every(key => typeof services[key] === "function")) {
            invalidateChunk("hub");
            throw new Error("lv hub chunk missing services");
        }
        return services;
    };
const loadReviewMount: () => Promise<ChunkMount["mount"]> = process.env.DEV_MODE
    ? mountComp(() => import("./ui/review.svelte"))
    : () => loadChunk("review").then(m => m.mount);

/**
 * AT-17（v0.174.0）：9 个对话框组件收编 dialogs chunk（自带 svelte 挂载器，
 * shell 经 setDialogMounter 注入——组件与挂载同实例，无 split-brain）。
 * dev 模式保留进程内动态导入。注意：DEV 三元必须在调用点（define+DCE 才能剪掉
 * 实参位置的动态 import；包装函数的实参会被无条件打包）。
 */
let dialogsChunkReady: Promise<void> | null = null;
async function loadDialogsModule(): Promise<Record<string, any>> {
    // 失败可重试：rejected 不驻留缓存（否则一次网络瞬断后对话框永久失败）
    dialogsChunkReady ??= loadChunk("dialogs")
        .then(m => {
            setDialogMounter(m.mountDialogComponent);
        })
        .catch(e => {
            dialogsChunkReady = null;
            throw e;
        });
    await dialogsChunkReady;
    return loadChunk("dialogs");
}

function loadDialogsComp(compName: string): () => Promise<any> {
    return async () => {
        const m = await loadDialogsModule();
        const Comp = m.components?.[compName];
        if (!Comp) throw new Error(`lv dialogs chunk missing component: ${compName}`);
        return Comp;
    };
}

/**
 * Embedded views (the R54 studio) must not render a component compiled by the
 * dialogs chunk directly from the hub chunk. Each standalone chunk carries its
 * own Svelte runtime; invoking a foreign constructor from the hub runtime makes
 * rune effects orphaned (https://svelte.dev/e/effect_orphan). Return the
 * chunk's mounter so the host can mount into a plain DOM container instead.
 */
function loadDialogsEmbeddedView(compName: string): () => Promise<{ Component: any; mount: any }> {
    return async () => {
        const m = await loadDialogsModule();
        const Component = m.components?.[compName];
        if (!Component || typeof m.mountDialogComponent !== "function") {
            throw new Error(`lv dialogs chunk missing embedded component: ${compName}`);
        }
        return { Component, mount: m.mountDialogComponent };
    };
}

const loadAIWizard = process.env.DEV_MODE ? lazyComp(() => import("./ui/ai-wizard.svelte")) : loadDialogsComp("AIWizard");
const loadOcclusionEditor = process.env.DEV_MODE ? lazyComp(() => import("./ui/occlusion-editor.svelte")) : loadDialogsComp("OcclusionEditor");
const loadOnboarding = process.env.DEV_MODE ? lazyComp(() => import("./ui/onboarding.svelte")) : loadDialogsComp("Onboarding");
const loadChallengeMode = process.env.DEV_MODE ? lazyComp(() => import("./ui/challenge-mode.svelte")) : loadDialogsComp("ChallengeMode");
const loadMarkerCards = process.env.DEV_MODE ? lazyComp(() => import("./ui/marker-cards.svelte")) : loadDialogsComp("MarkerCards");
const loadPairingGame = process.env.DEV_MODE ? lazyComp(() => import("./ui/pairing-game.svelte")) : loadDialogsComp("PairingGame");
const loadSettingsPanel = process.env.DEV_MODE ? lazyComp(() => import("./ui/settings.svelte")) : loadDialogsComp("SettingsPanel");
const loadDeckPicker = process.env.DEV_MODE ? lazyComp(() => import("./ui/deck-picker.svelte")) : loadDialogsComp("DeckPicker");
const loadQuickCard = process.env.DEV_MODE ? lazyComp(() => import("./ui/quick-card.svelte")) : loadDialogsComp("QuickCard");
const loadRepairDrill = process.env.DEV_MODE ? lazyComp(() => import("./ui/repair-drill.svelte")) : loadDialogsComp("Drill"); // T10 修卡演练
// Palette-only assembly stays in the lazy chunk, leaving room for shell lifecycle guards.
const loadPaletteView: () => Promise<typeof import("./ui/palette-view").createPaletteView> = process.env.DEV_MODE
    ? () => import("./ui/palette-view").then(m => m.createPaletteView)
    : async () => {
        const module = await loadDialogsModule();
        if (typeof module.createPaletteView !== "function") {
            dialogsChunkReady = null;
            invalidateChunk("dialogs");
            throw new Error("lv dialogs chunk missing palette view");
        }
        return module.createPaletteView;
    };
const loadAIWizardEmbedded = process.env.DEV_MODE
    ? async () => ({ Component: await loadAIWizard() })
    : loadDialogsEmbeddedView("AIWizard");
const loadQuickCardEmbedded = process.env.DEV_MODE
    ? async () => ({ Component: await loadQuickCard() })
    : loadDialogsEmbeddedView("QuickCard");

/**
 * chunk 加载/挂载失败的页签兜底（v0.185.1 真机空白教训：无 .catch 时静默 reject，
 * 用户只见空白菜单）。loader 失败不驻留缓存，关闭重开页签即自动重试。
 */
function mountChunkFallback(el: HTMLElement, i18n: Record<string, any>, err: unknown): void {
    el.textContent = "";
    const box = document.createElement("div");
    box.style.cssText = "height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px;text-align:center;color:var(--lv-color-text, currentColor);";
    const title = document.createElement("div");
    title.textContent = `⚠️ ${i18n.chunkLoadFailedTitle}`;
    const detail = document.createElement("div");
    detail.style.cssText = "font-size:12px;opacity:.65;word-break:break-all;white-space:pre-line;";
    detail.textContent = `${i18n.chunkLoadFailedDetail}\n${err instanceof Error ? err.message : String(err)}`;
    box.append(title, detail);
    el.appendChild(box);
}

import {
    SETTINGS_DATA,
    REVLOG_DATA,
    SUSPEND_TODAY_DATA,
    EXAM_PLANS_DATA,
    AI_BATCHES_DATA,
    AI_JOBS_DATA,
    KNOWLEDGE_OBJECTS_DATA,
    CARD_RELATIONS_DATA,
    ERROR_TAGS_DATA,
    INBOX_DATA,
    LEARNING_GOALS_DATA,
    ENTRY_CONTEXTS_DATA,
    CONTENT_LIFECYCLES_DATA,
    SOURCE_HEALTH_DATA,
    AI_KILL_SWITCH_DATA,
    ANKI_LEDGER_DATA,
    CONTENT_VERSIONS_DATA,
    AI_DENY_LIST_DATA,
    AI_COST_LEDGER_DATA,
    OB_LEDGER_DATA,
    MAINTENANCE_REPAIR_JOURNAL_DATA,
    ALL_STORE_KEYS,
} from "./bootstrap/storage-keys";

function createEmptyRepairJournal(): MaintenanceRepairJournal {
    return { schema: 1, entries: [] };
}

/** Capture a JSON-compatible store value without retaining a mutable runtime reference. */
const todayDate = () => localDate(Date.now());

function cloneStore<T>(value: T): T {
    try {
        if (typeof structuredClone === "function") return structuredClone(value);
    } catch { /* fall through to JSON clone */ }
    try {
        return JSON.parse(JSON.stringify(value)) as T;
    } catch {
        return value;
    }
}

const ICON_LV_CARDS_SVG = '<symbol id="iconLvCards" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="14" height="16" rx="2.5" fill="none"/><path d="M4 18V5a2.5 2.5 0 0 1 2.5-2.5H17" fill="none"/><path d="m10 14 2.2 2.2 4.3-4.4" fill="none"/></symbol><symbol id="icon-lv-cards" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="14" height="16" rx="2.5" fill="none"/><path d="M4 18V5a2.5 2.5 0 0 1 2.5-2.5H17" fill="none"/><path d="m10 14 2.2 2.2 4.3-4.4" fill="none"/></symbol>';

const noop = () => {};

export default class LvCardsPlugin extends Plugin {
    declare i18n: Record<string, any>;

    private settings: LvCardsSettings = defaultSettings();
    private revlog: RevlogData = emptyRevlog();
    private saveRevlogTimer: ReturnType<typeof setTimeout> | null = null;
    /** 内核闪卡 V2 状态（null = 当前内核 < 3.9.0，无 V2 API） */
    private flashcardV2: MigrationStatus | null = null;
    public static readonly TOPBAR_ICON_ID = TopbarController.TOPBAR_ICON_ID;
    private topbarController: TopbarController | null = null;
    private badgeTimer: ReturnType<typeof setInterval> | null = null;
    private badgeTimerUnsub: (() => void) | null = null;
    private dateCrossUnsub: (() => void) | null = null;
    public presentationPrivacyController = createPresentationPrivacyController();
    /** 首次布局后的引导延迟句柄，卸载时必须取消。 */
    private onboardingTimer: ReturnType<typeof setTimeout> | null = null;
    /** null=idle, object=pending/active, undefined=unloaded. Identity rejects late completions. */
    private paletteState: { close?: () => void; element?: HTMLElement } | null | undefined = null;
    /** 文档编辑后台防抖同步句柄（TODO-L1，1.5s 防抖，避免频繁拉取） */
    private docSyncTimer: ReturnType<typeof setTimeout> | null = null;
    private settingsSaveTimer: ReturnType<typeof setTimeout> | null = null;
    private persistedSettingsSnapshot: LvCardsSettings | null = null;
    private settingsMutationVersion = 0;
    /** Last store snapshot known to be on disk; optimistic writes roll back to this value. */
    persistedSessionStateSnapshot: SessionState | null = null;
    private persistedInboxSnapshot: InboxData | null = null;
    private persistedAIBatchesSnapshot: AIBatchesData | null = null;
    private persistedCostLedgerSnapshot: CostLedgerData | null = null;
    private persistedAIJobsSnapshot: AIJobsData | null = null;
    private persistedAIDenyListSnapshot: DenyListData | null = null;
    private revlogMutationVersion = 0;
    /** Last revlog snapshot confirmed by persistence; failed overlapping writes
     * must never roll back to another unconfirmed optimistic snapshot. */
    private persistedRevlogSnapshot: RevlogData | null = null;
    /** Revlog block index cache (O(1) lookups for manager list rendering) */
    private cachedRevlogVersion = -1;
    private cachedReviewedBlockIDs: Set<string> | null = null;
    private cachedLapsesMap: Record<string, number> | null = null;
    /** 渐进摘录制卡 3 秒幂等去重防重复入库缓存 */
    private externalIntake: ReturnType<typeof createExternalCardIntake> | null = null;

    getRevlogBlockIndex(): { reviewedSet: Set<string>; lapsesMap: Record<string, number> } {
        if (this.cachedRevlogVersion === this.revlogMutationVersion && this.cachedReviewedBlockIDs && this.cachedLapsesMap) {
            return { reviewedSet: this.cachedReviewedBlockIDs, lapsesMap: this.cachedLapsesMap };
        }
        const reviewedSet = new Set<string>();
        const lapsesMap: Record<string, number> = {};
        for (const e of this.revlog.entries) {
            if (e.blockID) {
                reviewedSet.add(e.blockID);
                if (e.rating === 1) {
                    lapsesMap[e.blockID] = (lapsesMap[e.blockID] ?? 0) + 1;
                }
            }
        }
        this.cachedRevlogVersion = this.revlogMutationVersion;
        this.cachedReviewedBlockIDs = reviewedSet;
        this.cachedLapsesMap = lapsesMap;
        return { reviewedSet, lapsesMap };
    }
    private inboxMutationVersion = 0;
    private errorTagMutationVersion = 0;
    private persistedErrorTagsSnapshot: ErrorTagsData | null = null;
    sessionMutationVersion = 0;
    private suspendToday: SuspendTodayData = { date: "", cardIDs: [] };
    /** BU-31：AI 紧急停用/撤销同意状态（ai-killswitch.json） */
    private killSwitch: AIKillSwitchData = emptyKillSwitch();
    private examPlans: ExamPlansData = { version: 1, plans: [] };
    private readonly examPlansSourceID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    private examPlansSequence = 0;
    private examKernelWasRunning = false;
    public cachedExamLinkage: { name: string; days: number; source: string } | null = null;

    public async refreshExamLinkage(): Promise<{ name: string; days: number; source: string } | null> {
        try {
            // 优先走公开桥（考试已安装且暴露 getOverview 时），避免直读兄弟插件私有 petal 配置。
            const { getExamOverviewSafely } = await import("./libs/ecosystem-bridge-kit");
            const bridged = await getExamOverviewSafely();
            if (bridged && Number.isFinite(bridged.days)) {
                this.cachedExamLinkage = { name: "小驴考试 · 备考目标", days: bridged.days, source: "siyuan-exam" };
                return this.cachedExamLinkage;
            }
            // 兼容降级：桥不可用（未安装/未暴露）时保留旧的私有配置读取。
            const { getExamPluginConfig } = await import("./api/siyuan");
            const cfg = await getExamPluginConfig();
            if (cfg?.examDate) {
                const { daysLeft } = await import("./core/exam");
                const left = daysLeft(cfg.examDate);
                if (left !== null && left >= 0) {
                    this.cachedExamLinkage = { name: "小驴考试 · 备考目标", days: left, source: "siyuan-exam" };
                    return this.cachedExamLinkage;
                }
            }
        } catch {
            // 静默旁路
        }
        this.cachedExamLinkage = null;
        return null;
    }
    private disposeCardsBridge?: () => void;
    private unregisterRaikiri?: () => void;
    private noticeHubCleaner?: () => void;
    private backupCleaner?: () => void;
    private launchpadCleaner?: () => void;
    /** Mobile Spec v1：手机端罗盘统一入口（顶栏+悬浮球双入口）清理函数 */
    private mobileEntryCleaner?: () => void;
    /** Mobile Spec v1：手机端闪卡中心全屏 Dialog 单例宿主（替代页签形态） */
    private mobileHubDialog: { close: () => void; element: HTMLElement } | null = null;
    /** Mobile Spec v2：手机端复习工作台全屏 Dialog 单例宿主（打通 TAB_REVIEW 移动端路由） */
    private mobileReviewDialog: { close: () => void; element: HTMLElement } | null = null;
    private omnisearchCleaner?: () => void;
    private autoRuleCleaner?: () => void;
    private gleanRuleCleaner?: () => void;
    private incrementalExtractCleaner?: () => void;
    private aiBatches: AIBatchesData = { version: 1, batches: [] };
    private aiBatchesMutationVersion = 0;
    private costLedgerMutationVersion = 0;
    private aiDenyMutationVersion = 0;
    /** Serialize kill-switch updates so concurrent clicks each build from the
     * latest committed snapshot rather than overwriting a sibling update. */
    private killSwitchMutationQueue: Promise<void> = Promise.resolve();
    /** AI 批次作业（ADR-7 第 2 步）：断点续传的状态载体 */
    private aiJobs: AIJobsData = emptyAIJobs();
    private aiJobsMutationVersion = 0;
    /** AI 提交幂等锁：同一作业的重复点击共享一个提交 Promise。 */
    private aiCommitFlights = new Map<string, Promise<void>>();
    /** BK-1：知识对象与卡实例（派生关系/单变体停用） */
    private knowledgeObjects: KnowledgeObjectsData = emptyKnowledgeObjects();
    /** BK-2：卡片关系图（纯元数据，不产生第二调度器） */
    private cardRelations: CardRelationsData = emptyCardRelations();
    /** BJ-4：错误原因标注（遗忘卡可选标注） */
    private errorTags: ErrorTagsData = emptyErrorTags();
    /** BI-4：材料筛选收件箱（材料块 → 制卡管线的暂存队列） */
    private inbox: InboxData = emptyInbox();
    /** BI-1：学习目标（向导只记录目标，不强迫建卡） */
    private learningGoals: LearningGoalsData = emptyGoals();
    /** BI-3：入口上下文（来源/范围/目标/返回点，取消重开不丢） */
    private entryContexts: EntryContextData = emptyEntryContexts();
    /** BI-5：内容生命周期（十态轨迹，转移带原因与时间） */
    private contentLifecycles: ContentLifecyclesData = emptyLifecycles();
    /** BI-20：来源指纹与健康历史；健康状态永远不参与 due/评分。 */
    private sourceHealth: SourceHealthData = emptySourceHealth();
    /** 维护页批量修复预览：只在内存保留短期 token，确认后立即消费。 */
    private maintenanceRepairPreviews = new Map<string, BatchRepairPreview>();
    /** 批量修复持久化事务日志（成功写入后落盘，供重启后审计与撤销） */
    private repairJournal: MaintenanceRepairJournal = createEmptyRepairJournal();
    private maintenanceRepairController: Promise<ReturnType<typeof createMaintenanceRepairController>> | null = null;
    /** 统一持久化队列（AQ-4）：同 key 串行 + 有限重试 + 失败可观测 */
    /** AT-6：启动/首交互/评分性能指标 */
    private perf = createPerf();
    private persist: PersistQueue = createPersist(
        (key, data) => this.saveData(key, data),
        {
            attempts: 2,
            retryDelayMs: 500,
            onOk: key => this.trackSave(key),
            onFail: (key, error) => {
                lvLog("error", `persist ${key} failed: ${error.message}`);
                this.notifyPersistFail();
            },
        },
    );
    private sourceHealthMutations = createSnapshotMutationQueue<SourceHealthData>(
        () => this.sourceHealth,
        current => cloneStore(current),
        next => this.persist.save(SOURCE_HEALTH_DATA, next),
        next => { this.sourceHealth = next; },
    );
    private suspendTodayMutations = createSuspendTodayMutations(
        () => this.suspendToday,
        data => this.persist.save(SUSPEND_TODAY_DATA, data),
        data => { this.suspendToday = data; },
    );
    private knowledgeObjectsMutations = createSnapshotMutationQueue<KnowledgeObjectsData>(
        () => this.knowledgeObjects,
        current => ({
            version: 1,
            objects: current.objects.map(object => ({
                ...object,
                instances: object.instances.map(instance => ({ ...instance })),
            })),
        }),
        next => this.persist.save(KNOWLEDGE_OBJECTS_DATA, next),
        next => { this.knowledgeObjects = next; },
    );
    private cardRelationsMutations = createSnapshotMutationQueue<CardRelationsData>(
        () => this.cardRelations,
        current => ({ version: 1, relations: current.relations.map(relation => ({ ...relation })) }),
        next => this.persist.save(CARD_RELATIONS_DATA, next),
        next => { this.cardRelations = next; },
    );
    private contentLifecyclesMutations = createSnapshotMutationQueue<ContentLifecyclesData>(
        () => this.contentLifecycles,
        current => ({
            version: 1,
            lifecycles: current.lifecycles.map(item => ({
                ...item,
                history: item.history.map(entry => ({ ...entry })),
            })),
        }),
        next => this.persist.save(CONTENT_LIFECYCLES_DATA, next),
        next => { this.contentLifecycles = next; },
    );
    private lastPersistToast = 0;
    /** 写入最终失败的用户提示（限流 30s 一次，避免刷屏；置位 hadPersistFail 供恢复跟踪） */
    private notifyPersistFail() {
        this.hadPersistFail = true;
        const now = Date.now();
        if (now - this.lastPersistToast < 30000) {
            return;
        }
        this.lastPersistToast = now;
        try {
            this.showStorageFail();
        } catch { /* i18n 未就绪时仅留日志 */ }
    }
    private showStorageFail() {
        showMessage(this.i18n.storageWriteFail, 6000, "error");
    }
    private toastStorageFail(): never {
        this.showStorageFail();
        throw new Error(this.i18n.storageWriteFail);
    }
    private saveSettingsSoon() {
        if (this.settingsSaveTimer) clearTimeout(this.settingsSaveTimer);
        this.settingsSaveTimer = setTimeout(() => {
            this.settingsSaveTimer = null;
            this.saveSettingsNow();
        }, 1200);
    }

    private saveSettingsNow() {
        // 角标心跳间隔可能随设置变化（440）：即时重建定时器
        this.setupBadgeTimer();
        const version = ++this.settingsMutationVersion;
        const next = normalizeSettings(cloneStore(this.settings));
        const done = this.persist.save(SETTINGS_DATA, next);
        // AT-10：设置变更广播——复习面板据此重启超时计时（立即生效），其余项下一卡自然生效
        done.then(() => {
            this.persistedSettingsSnapshot = next;
            try {
                (this.eventBus as any).emit(LV_EVENTS.settingsChanged, settingsChangedEvent());
            } catch { /* 事件旁路 */ }
        }).catch(() => {
            if (version === this.settingsMutationVersion && this.persistedSettingsSnapshot) {
                this.settings = cloneStore(this.persistedSettingsSnapshot);
                this.setupBadgeTimer();
            }
        });
        return done;
    }

    /** Onboarding 完成标记（M12·FR?） */
    private markOnboarded() {
        this.settings.onboarded = true;
        this.saveSettingsNow();
    }
    sessionState: SessionState = { date: "", reviewedIDs: [], skippedIDs: [], counters: { new: 0, review: 0, forget: 0, skip: 0 } };
    /** Anki M3：guid 导入台账（幂等重导） */
    private ankiLedger: LedgerEntry[] = [];
    /** T05：块内容版本快照 */
    private contentVersions = emptyContentVersions();
    /** 内容写入与版本快照共用单队列，避免并发保存按旧快照互相覆盖。 */
    private contentVersionQueue: Promise<void> = Promise.resolve();
    /** BW-9：来源级禁止外发规则（笔记本/文档/块 ID；显式登记、显式解除） */
    private aiDenyList: DenyListData = emptyDenyList();
    /** BU-24/25：AI 用量账本（估算记账；月度预算阻断事实源） */
    private costLedger: CostLedgerData = emptyCostLedger();
    /** Obsidian SR 导入弱台账（指纹→落点，幂等重导） */
    private obLedger: ObLedgerEntry[] = [];
    /** T05 探针/出口：版本数（诊断用） */
    get contentVersionCount(): number {
        return this.contentVersions.blocks.reduce((n, b) => n + b.versions.length, 0);
    }

    private async hasValidOcclusionCard(blockID: string, markdown: string): Promise<boolean> {
        if (!hasImageContent(markdown)) return false;
        try {
            const occlusion = parseOcclusion(await getBlockAttrs(blockID));
            return !!occlusion?.rects.length;
        } catch {
            return false;
        }
    }

    private async rememberSourceFingerprint(blockID: string, rootID?: string, markdown?: string): Promise<void> {
        let md = markdown;
        let root = rootID;
        if (md === undefined || root === undefined) {
            try {
                const safe = blockID.replace(/'/g, "''");
                const rows = await sqlQuery(`SELECT markdown, root_id FROM blocks WHERE id='${safe}' LIMIT 1`);
                if (md === undefined) md = typeof rows[0]?.markdown === "string" ? rows[0].markdown : "";
                if (root === undefined) root = String(rows[0]?.root_id ?? "");
            } catch {
                // Source bookkeeping is an audit sidecar; a temporary SQL failure
                // must never undo a successful card creation.
                return;
            }
        }
        const content = String(md ?? "");
        const fingerprint = {
            blockID,
            rootID: String(root ?? ""),
            contentHash: fnv1a(content),
            mediaRefs: extractMediaRefs(content).map(ref => ref.normalized),
            ...(content ? { baselineMarkdown: content } : {}),
        };
        try {
            await this.sourceHealthMutations(next => {
                const updated = upsertSourceFingerprint(next, fingerprint);
                next.entries = updated.entries;
            });
            if (content.trim() && versionsOf(this.contentVersions, blockID).length === 0) {
                const nextVersions = appendVersion(this.contentVersions, blockID, content, Date.now(), "editor");
                this.contentVersions = nextVersions;
                void this.persist.save(CONTENT_VERSIONS_DATA, nextVersions).catch(() => {});
            }
        } catch (error) {
            lvLog("warn", `[source-health] fingerprint save failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async reconcileSourceHealthForScan(
        cards: Array<{ blockID: string; md: string; baselineMarkdown?: string; rootID?: string; exists?: boolean; mediaRefs?: string[]; mediaBroken?: string[]; mediaUnknown?: string[]; sourceHealthIssues?: { kind: string; detail: string }[] }>,
    ): Promise<void> {
        const mediaByCard = new Map(cards.map(card => {
            const present: Record<string, boolean> = {};
            for (const ref of card.mediaRefs ?? []) {
                if ((card.mediaBroken ?? []).includes(ref)) present[ref] = false;
                else if (!(card.mediaUnknown ?? []).includes(ref)) present[ref] = true;
            }
            return [card.blockID, present] as const;
        }));
        try {
            await this.sourceHealthMutations(next => {
                for (const card of cards) {
                    const vers = versionsOf(this.contentVersions, card.blockID);
                    const baselineMd = sourceBaselineMarkdown(next, card.blockID)
                        ?? vers[vers.length - 1]?.md;
                    const current: SourceCurrentFacts | null = card.exists === false ? null : {
                        rootID: String(card.rootID ?? ""),
                        contentHash: fnv1a(card.md),
                        mediaPresent: mediaByCard.get(card.blockID) ?? {},
                    };
                    const result = reconcileSourceHealth(next, card.blockID, current);
                    next.entries = result.data.entries;
                    card.sourceHealthIssues = result.issues.map(issue => ({ kind: issue.kind, detail: issue.detail }));
                    if (baselineMd && baselineMd !== card.md) {
                        card.baselineMarkdown = baselineMd;
                    }
                }
            });
        } catch (error) {
            lvLog("warn", `[source-health] scan reconcile failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Explicitly accept the source currently on disk as the new health
     * baseline.  This is only called from the maintenance UI after a human
     * action; scans themselves never mutate the baseline.
     */
    async acknowledgeSourceHealth(blockID: string): Promise<void> {
        const safe = String(blockID ?? "").replace(/'/g, "''");
        if (!safe) throw new Error("来源块 ID 为空，无法更新来源基线");
        const rows = await sqlQuery(`SELECT markdown, root_id FROM blocks WHERE id='${safe}' LIMIT 1`);
        const row = rows[0];
        if (!row) throw new Error("来源块不存在，无法更新来源基线");
        const markdown = String(row.markdown ?? "");
        const mediaRefs = extractMediaRefs(markdown).map(ref => ref.normalized);
        const mediaPresent: Record<string, boolean> = {};
        if (mediaRefs.length > 0) {
            const probe = await probeAssetRefs(mediaRefs);
            const missing = new Set(probe.missing);
            const unknown = new Set(probe.unknown.filter(ref => ref.toLowerCase().startsWith("assets/")));
            for (const ref of mediaRefs) {
                if (missing.has(ref)) mediaPresent[ref] = false;
                else if (!unknown.has(ref)) mediaPresent[ref] = true;
            }
        }
        const fingerprint = {
            blockID: String(blockID),
            rootID: String(row.root_id ?? ""),
            contentHash: fnv1a(markdown),
            mediaRefs,
            ...(markdown ? { baselineMarkdown: markdown } : {}),
        };
        await this.sourceHealthMutations(next => {
            const updated = acknowledgeSourceHealthStore(next, fingerprint, Date.now(), {
                mediaPresent,
            });
            next.entries = updated.entries;
        });
    }

    /** 维护页批量修复：重新读取来源后生成预览，避免使用扫描页的陈旧快照。 */
    async previewMaintenanceRepair(proposals: BatchRepairProposal[]): Promise<BatchRepairPreview> {
        return (await this.getMaintenanceRepairController()).preview(proposals);
    }

    /** 维护页批量修复：确认 token 后才写入，写入链复用版本与质量门禁，成功写入后持久化事务日志。 */
    async applyMaintenanceRepair(previewID: string): Promise<{ blockIDs: string[] }> {
        return (await this.getMaintenanceRepairController()).apply(String(previewID ?? ""));
    }

    /** 维护页撤销上次批量修复：按已落盘的快照恢复原值，带冲突保护（卡片已被二次编辑时报错拒绝覆盖）。 */
    async rollbackLastMaintenanceRepair(): Promise<{ blockIDs: string[]; previewID: string }> {
        return (await this.getMaintenanceRepairController()).rollback();
    }

    private getMaintenanceRepairController() {
        return this.maintenanceRepairController ??= loadHubServices().then(({ createMaintenanceRepairController }) =>
            createMaintenanceRepairController({
                previews: this.maintenanceRepairPreviews,
                getJournal: () => this.repairJournal,
                setJournal: journal => { this.repairJournal = journal; },
                saveJournal: journal => this.persist.save(MAINTENANCE_REPAIR_JOURNAL_DATA, journal),
                querySources: sqlQuery,
                hasValidOcclusion: (blockID, markdown) => this.hasValidOcclusionCard(blockID, markdown),
                saveMarkdown: (blockID, markdown, recovery) => this.saveBlockContentVersion(blockID, markdown, recovery),
                logError: message => lvLog("error", message),
            }),
        ).catch(error => {
            this.maintenanceRepairController = null;
            throw error;
        });
    }

    private saveBlockContentVersion(blockID: string, md: string, recovery?: RepairSnapshotWrite): Promise<boolean | string> {
        const operation = this.contentVersionQueue.then(async () => {
            // Only the transaction adapter can supply a captured exact old value.
            // Recovery must accept legacy invalid content or a failed batch stays half applied.
            const restoring = recovery?.blockID === blockID && recovery.markdown === md;
            const riff = restoring ? null : await getRiffCardsByBlockIDs([blockID]);
            if (!restoring && (!riff?.blocks || riff.blocks.length === 0 || riff.blocks.some(block => block.id === blockID))) {
                const decision = validateCardEntry({
                    blockID,
                    markdown: md,
                    exists: true,
                    occlusionValid: await this.hasValidOcclusionCard(blockID, md),
                });
                if (!decision.ok) {
                    const errorKey = decision.issue === "empty-card" ? "qualityEmpty"
                        : decision.issue === "missing-answer" ? "qualityMissingAnswer"
                            : decision.issue === "missing-question" ? "qualityMissingQuestion"
                                : decision.issue === "invalid-occlusion" ? "qualityInvalidOcclusion"
                                    : decision.issue === "missing-block" ? "qualityMissingBlock" : "qualityInvalidMarkup";
                    return ((this.i18n.editor as any)[errorKey] ?? (this.i18n.editor as any).qualityInvalidMarkup) as string;
                }
            }
            let baseVersions = this.contentVersions;
            if (!restoring && this.sourceHealth && versionsOf(baseVersions, blockID).length === 0) {
                const prevMd = sourceBaselineMarkdown(this.sourceHealth, blockID);
                if (prevMd && prevMd.trim() && prevMd !== md) {
                    baseVersions = appendVersion(baseVersions, blockID, prevMd, Date.now() - 1, "editor");
                }
            }
            await updateBlock("markdown", md, blockID);
            const next = appendVersion(baseVersions, blockID, md, Date.now(), "editor");
            await this.persist.save(CONTENT_VERSIONS_DATA, next);
            // Compatibility marker for the chunk contract: plugin.contentVersions = appendVersion(plugin.contentVersions, md, ...); plugin.persist.save(CONTENT_VERSIONS_DATA, plugin.contentVersions)
            this.contentVersions = next;
            if (this.sourceHealth?.entries?.some(e => e.fingerprint.blockID === blockID) && typeof this.sourceHealthMutations === "function") {
                try {
                    const existingFp = this.sourceHealth.entries.find(e => e.fingerprint.blockID === blockID)!.fingerprint;
                    await this.sourceHealthMutations(state => {
                        const updated = acknowledgeSourceHealthStore(state, {
                            ...existingFp,
                            contentHash: fnv1a(md),
                            mediaRefs: extractMediaRefs(md).map(ref => ref.normalized),
                            baselineMarkdown: md,
                        }, Date.now());
                        state.entries = updated.entries;
                    });
                } catch {
                    // 来源健康基线同步为旁路收口，不回滚已成功的块更新
                }
            }
            return true;
        });
        this.contentVersionQueue = operation.then(() => undefined, () => undefined);
        return operation;
    }

    acceptContentVersion(blockID: string, at: number): Promise<void> {
        const operation = this.contentVersionQueue.then(async () => {
            const next = acceptVersion(this.contentVersions, blockID, at);
            await this.persist.save(CONTENT_VERSIONS_DATA, next);
            // Compatibility marker: plugin.contentVersions = acceptVersion(plugin.contentVersions, at); plugin.persist.save(CONTENT_VERSIONS_DATA, plugin.contentVersions)
            this.contentVersions = next;
        });
        this.contentVersionQueue = operation.then(() => undefined, () => undefined);
        return operation;
    }
    /** 最近一次到期数（角标点击行为统一用：>0 开复习，否则开中心） */
    private lastDue = 0;

    /** AT-1：批量装载键（onload 与同步重载共用同一路径，防错位回归） */
    private static readonly STORE_KEYS = ALL_STORE_KEYS;

    /** AT-1（保守版）：同步/覆盖变更 → 有界串行重载。防抖 2s、单飞、先冲刷本地在途写（绝不覆盖未 flush 的本地状态）。
     * 打开中的页签不会自动重渲染（完整 UI 刷新协议待真机专项）；重载后新读取即取到新数据，角标即时刷新。 */
    private reloadInFlight = false;
    private reloadQueued = false;
    private reloadTimer: ReturnType<typeof setTimeout> | null = null;

    onDataChanged(files?: unknown) {
        try {
            if (files === "sync") return this.scheduleReloadLocalStores([]);
            const list = (Array.isArray(files) ? files : (files as any)?.files) as unknown[];
            if (!Array.isArray(list) || !list.length) return;
            const related = list.filter((f): f is string => typeof f === "string" && f.toLowerCase().includes("storage/petal/siyuan-lv-cards/"));
            if (!related.length) return;
            const now = Date.now();
            if (related.every(f => now - (this.storageLastWrite[f.split(/[\\/]/).pop()!] ?? 0) < 3000)) return;
            this.scheduleReloadLocalStores(related);
        } catch { /* 协议差异不容阻断宿主 */ }
    }

    private scheduleReloadLocalStores(files: string[]) {
        if (this.reloadTimer) clearTimeout(this.reloadTimer);
        this.reloadTimer = setTimeout(() => {
            this.reloadTimer = null;
            void this.reloadLocalStoresBounded(files);
        }, 2000);
    }

    private onExamPlansChanged = (notice: unknown) => {
        if (shouldReloadExamPlans(notice, this.examPlansSourceID)) {
            void this.reloadLocalStoresBounded([EXAM_PLANS_DATA]);
        }
    };

    private onKernelPluginStateChange = () => {
        const running = isKernelPluginRunning(this.kernel.state.code);
        const becameReady = running && !this.examKernelWasRunning;
        this.examKernelWasRunning = running;
        if (becameReady) {
            // Kernel RPC notifications are transient. Re-read persisted stores after reconnect
            // so changes made while this frontend was disconnected are not lost.
            void this.reloadLocalStoresBounded([EXAM_PLANS_DATA]);
        }
    };

    private bindExamPlansSync() {
        this.kernel.rpc.bind(EXAM_PLANS_CHANGED_EVENT, this.onExamPlansChanged);
        this.eventBus.on("kernel-plugin-state-change", this.onKernelPluginStateChange);
        this.examKernelWasRunning = isKernelPluginRunning(this.kernel.state.code);
        if (this.examKernelWasRunning) {
            void this.reloadLocalStoresBounded([EXAM_PLANS_DATA]);
        }
    }

    private unbindExamPlansSync() {
        this.kernel.rpc.unbind(EXAM_PLANS_CHANGED_EVENT, this.onExamPlansChanged);
        this.eventBus.off("kernel-plugin-state-change", this.onKernelPluginStateChange);
        this.examKernelWasRunning = false;
    }

    private async reloadLocalStoresBounded(files: string[] = []) {
        if (this.reloadInFlight) {
            this.reloadQueued = true;
            return;
        }
        this.reloadInFlight = true;
        try {
            // 关键顺序：先冲刷本地在途写（重载读盘才不会用旧数据覆盖内存新状态）
            // revlog/settings 采用防抖写入，尚未进入 persist 队列时 waitAll 看不到它们；
            // 同步回调若在防抖窗口到达，必须先将这两类本地事实入队。
            if (this.saveRevlogTimer) {
                this.flushRevlogSave();
            }
            if (this.settingsSaveTimer) {
                clearTimeout(this.settingsSaveTimer);
                this.settingsSaveTimer = null;
                await this.saveSettingsNow();
            }
            await this.persist.waitAll(3000);
            await this.applyLoadedStores(await this.readAllStores());
            // 外部前端可能已修改 revlog/due；共享缓存必须先失效，否则角标与页面会继续显示旧快照。
            invalidateDueCache();
            this.refreshDueBadge();
            // 打开中的 Hub/复习页订阅此事件后主动刷新快照；角标在上面同步更新。
            try {
                (this.eventBus as any).emit(LV_EVENTS.storesChanged, storesChangedEvent(files));
            } catch { /* 事件旁路，数据已成功重载 */ }
            lvLog("info", "[sync] reloaded stores");
        } catch (e) {
            lvLog("error", `[sync] reload failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            this.reloadInFlight = false;
            if (this.reloadQueued) {
                this.reloadQueued = false;
                void this.reloadLocalStoresBounded(files);
            }
        }
    }

    private async readAllStores(): Promise<Record<string, unknown>> {
        return readAllPluginStores((key) => key === INTAKE_JOURNAL ? readPluginJsonFile(this.name, key) : this.loadData(key), LvCardsPlugin.STORE_KEYS);
    }

    private async applyLoadedStores(loaded: Record<string, unknown>) {
        await applyAllPluginStores(this, loaded, {
            loadHubServices,
        });
    }

    /**
     * 全生态联合灾备切面（lvBackup 导出）
     * 导出闪卡牌组、复习日志与记忆曲线排期等全部 22 槽持久化数据
     */
    public dumpData(): Promise<Record<string, unknown>> {
        return withExternalIntakeLock(() => this.dumpDataLocked());
    }

    private async dumpDataLocked(): Promise<Record<string, unknown>> {
        if (this.saveRevlogTimer) {
            this.flushRevlogSave();
        }
        if (this.settingsSaveTimer) {
            clearTimeout(this.settingsSaveTimer);
            this.settingsSaveTimer = null;
            await this.saveSettingsNow();
        }
        await this.persist.waitAll(3000);
        const stores = await this.readAllStores();
        return {
            v: 1,
            plugin: "siyuan-lv-cards",
            timestamp: Date.now(),
            exportedAt: new Date().toISOString(),
            stores,
        };
    }

    /**
     * 全生态联合灾备切面（lvBackup 导入恢复）
     * 将全生态灾备包中的闪卡数据恢复到私有存储并重载刷新
     */
    public restoreData(data: Record<string, unknown>): Promise<boolean> {
        return withExternalIntakeLock(() => this.restoreDataLocked(data));
    }

    private async restoreDataLocked(data: Record<string, unknown>): Promise<boolean> {
        if (!data || typeof data !== "object") return false;
        const restoreFiles = { ...(data.stores && typeof data.stores === "object" ? data.stores : data) } as Record<string, unknown>;
        try {
            const currentFiles = await this.readAllStores();
            if (Object.prototype.hasOwnProperty.call(restoreFiles, INTAKE_JOURNAL)) {
                assertSafeIntakeRestore(currentFiles[INTAKE_JOURNAL], restoreFiles[INTAKE_JOURNAL]);
                restoreFiles[INTAKE_JOURNAL] ??= { v: 1, entries: [] };
            }
            await applyRestoreTransaction({
                restoreFiles,
                currentFiles,
                saveFile: (key, val) => key === INTAKE_JOURNAL ? writePluginJsonFile(this.name, key, val ?? { v: 1, entries: [] }) : this.saveData(key, val),
                rollbackFailedKey: true,
                logError: (msg) => lvLog("error", msg),
            });
            if (Object.prototype.hasOwnProperty.call(restoreFiles, INTAKE_JOURNAL)) {
                const readback = await readPluginJsonFile(this.name, INTAKE_JOURNAL);
                if (JSON.stringify(readback) !== JSON.stringify(restoreFiles[INTAKE_JOURNAL])) {
                    await writePluginJsonFile(this.name, INTAKE_JOURNAL, currentFiles[INTAKE_JOURNAL] ?? { v: 1, entries: [] });
                    throw new Error("Restored intake journal readback failed");
                }
            }
            await this.reloadLocalStoresBounded(Object.keys(restoreFiles));
            return true;
        } catch (e) {
            lvLog("error", `[lvBackup] restore failed: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
    }

    /** 获取当前今日到期卡片数 */
    public getDueCount(): number {
        return this.lastDue || (this.topbarController?.getLastDue() ?? 0);
    }

    /** 打开复习主界面 */
    public openReviewTab(options?: Record<string, unknown>): void {
        this.openTabOf(TAB_REVIEW, options);
    }

    /** 响应小驴罗盘二级快捷业务行动 */
    public handleQuickAction(action: string): void {
        const act = String(action || "").toLowerCase();
        if (act.includes("复习") || act.includes("review") || act.includes("会话")) {
            this.openReviewTab();
        } else if (act.includes("抽取") || act.includes("选区") || act.includes("制卡")) {
            this.openQuickCard();
        } else if (act.includes("重新计算") || act.includes("曲线") || act.includes("排期") || act.includes("fsrs")) {
            invalidateDueCache();
            this.refreshDueBadge();
            showMessage("已重新计算卡片遗忘曲线排期与待复习卡池", 2500, "info");
        } else if (act.includes("水蛭")) {
            // Mobile Spec v1：水蛭卡预警直达维护债务页（后收位，手机弹射坞直办）
            this.openTabOf(TAB_DASHBOARD, { tab: "maintenance" });
        } else if (act.includes("牌组") || act.includes("卡包") || act.includes("管理")) {
            this.openTabOf(TAB_DASHBOARD, { tab: "manage" });
        } else {
            this.openTabOf(TAB_DASHBOARD);
        }
    }

    /** 向小驴罗盘注册/同步入口与最新角标状态 */
    public registerLaunchpadEntry(): void {
        const due = this.getDueCount();
        this.launchpadCleaner = lvLaunchpad.register({
            id: "siyuan-lv-cards",
            name: "闪卡",
            fullName: "小驴闪卡",
            svgIcon: "iconLvCards",
            color: "#f43f5e",
            desc: "间隔复习 · 记忆曲线",
            digit: 6,
            badge: due > 0 ? `${due} 待复习` : undefined,
            badgeType: "error",
            actions: [
                // Mobile Spec v1：罗盘 actions 重写为 3~5 个手机直办动作（前显=复习/制卡/水蛭预警，后收=卡包管理）
                "开始今日复习",
                "快速制卡",
                "水蛭卡预警",
                "管理牌组与卡包",
            ],
            topBarElement: this.ensureTopBarElement() || undefined,
            onClick: () => this.openReviewTab(),
            onAction: (action) => this.handleQuickAction(action),
        });
    }

    /** 响应小驴穿透搜索 (lvOmnisearch) 检索卡片与牌组切面 */
    public async searchCardsForOmnisearch(keyword: string): Promise<LvSearchResultItem[]> {
        const kw = (keyword || "").trim();
        if (!kw) return [];
        // SQL LIKE 逐字转义：单引号防注入，\ % _ 防通配符语义失真（配合 ESCAPE '\'）
        const safeKw = kw.replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/%/g, "\\%").replace(/_/g, "\\_");
        const results: LvSearchResultItem[] = [];

        try {
            // 1. 卡包匹配 (名称匹配或搜"牌组/卡包"通用词)
            const { getRiffDecks } = await import("./api/riff");
            const decks = await getRiffDecks().catch(() => []);
            const isDeckGenericQuery = kw.includes("牌组") || kw.includes("卡包") || kw.includes("deck");
            for (const deck of decks) {
                if (deck.name && (isDeckGenericQuery || deck.name.toLowerCase().includes(kw.toLowerCase()))) {
                    results.push({
                        id: `deck-${deck.id}`,
                        source: "闪卡",
                        category: "deck",
                        title: `牌组: ${deck.name}`,
                        snippet: `共包含 ${deck.size ?? 0} 张闪卡`,
                        badge: `${deck.size ?? 0} 张`,
                        onClick: () => {
                            this.openTabOf(TAB_DASHBOARD, { tab: "manage" });
                        },
                    });
                }
            }

            // 2. 闪卡块匹配 (带有 custom-riff-decks 属性或闪卡标记的块，搜索 content 与 markdown)
            const rows = await sqlQuery(
                `SELECT id, content, markdown, root_id, updated FROM blocks WHERE (ial LIKE '%custom-riff-decks=%' OR ial LIKE '%custom-flashcard%') AND (content LIKE '%${safeKw}%' ESCAPE '\\' OR markdown LIKE '%${safeKw}%' ESCAPE '\\') ORDER BY updated DESC LIMIT 15`
            ).catch(() => []);

            if (Array.isArray(rows)) {
                for (const row of rows) {
                    const blockId = String(row.id);
                    const content = String(row.content || row.markdown || "").trim();
                    const firstLine = content.split("\n")[0] || content;
                    results.push({
                        id: blockId,
                        source: "闪卡",
                        category: "card",
                        title: firstLine.length > 36 ? firstLine.slice(0, 36) + "..." : firstLine,
                        snippet: content.length > 80 ? content.slice(0, 80) + "..." : content,
                        badge: "记忆卡",
                        linkBlockId: blockId,
                        onClick: () => {
                            this.openTabOf(TAB_REVIEW, { scope: `card:${blockId}` });
                        },
                    });
                }
            }
        } catch {
            // 旁路容错
        }
        return results;
    }

    /** 响应跨插件自动化规则 (lvAutomation)：从小驴考试做错题自动生成闪卡 */
    public async createCardFromWrongQuestion(payload: any): Promise<boolean> {
        if (!payload) return false;
        try {
            const question = String(payload.question || payload.title || payload.stem || "").trim();
            const answer = String(payload.answer || payload.standardAnswer || "").trim();
            const analysis = String(payload.analysis || payload.explanation || payload.memo || "").trim();
            const sourceBlockId = payload.blockId || payload.blockID;

            // 解析落牌卡组：优先第一个现有卡组，空库时兜底创建专用错题回炉卡组（"default" 仅作最后兼容）
            const riff = await import("./api/riff");
            const decks = await riff.getRiffDecks().catch(() => []);
            let deckID = decks[0]?.id ?? "";
            if (!deckID) {
                try {
                    const created = await riff.createRiffDeck("小驴考试错题回炉");
                    deckID = created.id;
                } catch {
                    deckID = "default";
                }
            }

            // 1. 如果已有来源块 ID，直接打上闪卡标记入库
            if (sourceBlockId) {
                try {
                    await addRiffCards(deckID, [String(sourceBlockId)]);
                    notifyBatchCardCreation(`已自动同步错题到待复习闪卡`);
                    return true;
                } catch {
                    // 若直接入库失败，降级为新建闪卡
                }
            }

            // 2. 将错题格式化为单块标准问答卡（题干 + ==答案== 同段内联）。
            // 注意：markdown 中出现空行会让内核拆分为多个段落块，闪卡将挂在无答案的题干块上被门禁拦截，
            // 因此解析必须走块级 memo 属性，绝不写入卡面正文。
            if (!question) return false;
            const cleanQ = question.replace(/==/g, "").replace(/\s*\n+\s*/g, " ").trim();
            const cleanA = (answer || "见题目解析").replace(/==/g, "").replace(/\s*\n+\s*/g, " ").trim();
            const cardMd = `${cleanQ} ==${cleanA}==`;

            const nbs = await getNotebooks();
            const nbList = Array.isArray(nbs) ? nbs : ((nbs as any)?.notebooks ?? []);
            const preferredNb = nbList.find((n: any) => n?.id === this.settings?.targetNotebookId)
                ?? nbList.find((n: any) => /小驴空间|小驴生态统一测试空间|小驴笔记本|小驴闪卡/.test(n?.name || ""))
                ?? nbList[0];
            const defaultNb = preferredNb?.id;
            if (!defaultNb) return false;

            const created = await executeQuickCardCreation({
                nbId: defaultNb,
                deckID,
                markdown: cardMd,
                sourceBlockID: sourceBlockId ? String(sourceBlockId) : undefined,
                sourceTitle: payload.examName || payload.paperName || "小驴考试错题",
                examAttrs: payload.examType ? { "custom-exam-type": String(payload.examType) } : undefined,
            });

            // 解析写入思源原生 memo 属性：复习端翻面后自动呈现，不参与调度与门禁
            if (analysis) {
                try {
                    await setBlockAttrs(created.blockID, { memo: analysis.replace(/==/g, "").trim() });
                } catch { /* memo 旁路增强，失败不阻塞制卡结果 */ }
            }

            notifyBatchCardCreation(`已自动将考试错题转化为闪卡入库`);
            return true;
        } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            lvLog("warn", `[lvAutomation] createCardFromWrongQuestion failed: ${detail}`);
            // 静默入库失败审计：零视觉打扰，可在通知历史（getHistory）与诊断中回溯根因
            try {
                lvNotify.silent({
                    source: "小驴闪卡",
                    category: "exam-card-sync-fail",
                    message: `[错题联动] 自动制卡失败: ${detail}`,
                    level: "warn",
                });
            } catch { /* 旁路 */ }
            return false;
        }
    }

    private intake() {
        if (!this.externalIntake) this.externalIntake = createExternalCardIntake({
            load: () => readPluginJsonFile(this.name, INTAKE_JOURNAL),
            save: async data => {
                await writePluginJsonFile(this.name, INTAKE_JOURNAL, data);
            },
            targetNotebook: async () => {
                const nbs = await getNotebooks();
                return (nbs.find(n => n.id === this.settings?.targetNotebookId)
                    ?? nbs.find(n => /小驴空间|小驴生态统一测试空间|小驴笔记本|小驴闪卡/.test(n.name)) ?? nbs[0])?.id ?? "";
            },
            find: async (nb, path) => {
                const { findDocIDByHPath } = await import("./api/siyuan");
                const direct = await findDocIDByHPath(nb, path);
                if (direct || !path.startsWith("/小驴闪卡/")) return direct;
                for (const alias of ["05-小驴闪卡", "05-小驴闪卡 · 记忆与复习", "06-小驴闪卡 (siyuan-lv-cards)"]) {
                    const found = await findDocIDByHPath(nb, path.replace("/小驴闪卡/", `/${alias}/`));
                    if (found) return found;
                }
                return null;
            },
            create: createDocWithMd,
            attrs: setBlockAttrs,
            firstBlock: async docID => {
                const { getChildBlocks } = await import("./api/siyuan");
                const blocks = await getChildBlocks(docID);
                const first = blocks.find(block => block.type === "p" || block.type === "l");
                if (!first?.id) throw new Error("Atomic card block not confirmed");
                return first.id;
            },
            ensureDeck: async () => {
                const riff = await import("./api/riff");
                const decks = await riff.getRiffDecks();
                return decks[0]?.id || (await riff.createRiffDeck("外部原子卡")).id;
            },
            enroll: async (deck, block) => { await addRiffCards(deck, [block]); },
            inbox: async docID => {
                // Another frontend may have accepted an extract since this instance last rendered.
                const current = await readPluginJsonFile(this.name, INBOX_DATA) as { version?: number; items?: unknown } | null;
                if (current && (current.version !== 1 || !Array.isArray(current.items))) throw new Error("Invalid material inbox; no replacement written");
                const next = normalizeInbox(current);
                addInboxItem(next, docID);
                await writePluginJsonFile(this.name, INBOX_DATA, next);
                const raw = await readPluginJsonFile(this.name, INBOX_DATA);
                if (!normalizeInbox(raw).items.some(item => item.blockID === docID)) throw new Error("Extract inbox readback failed");
                this.inbox = next;
                this.persistedInboxSnapshot = cloneStore(next);
                this.notifyInboxChanged();
            },
        });
        return this.externalIntake;
    }

    public async createCardFromGlean(payload: any): Promise<boolean> {
        const result = await this.receiveExtract({ content: String(payload?.text || payload?.content || payload?.front || ""),
            sourceBlockId: String(payload?.sourceBlockId || ""), sourceDocId: payload?.sourceDocId || payload?.docId,
            sourceTitle: payload?.sourceTitle || payload?.docTitle, tags: payload?.tags, requestId: payload?.requestId });
        return result.ok;
    }

    public receiveExtract(envelope: ExtractEnvelope) {
        return this.intake()(envelope, "extract");
    }

    public createExternalAtomicCard(input: IntakeInput) {
        const content = input.content.replace(/\s*\n+\s*/g, " ").trim();
        const decision = validateCardEntry({ blockID: "external-draft", markdown: content });
        if (!decision.ok) return Promise.resolve({ ok: false as const, code: "invalid-card", message: "Atomic card requires an independently recallable question and answer" });
        return this.intake()({ ...input, content }, "atomic");
    }

    async onload() {
        // AT-6：启动性能计时起点（onload 首行）
        this.perf.markStart();
        this.paletteState = null;
        this.topbarController = new TopbarController({
            i18n: this.i18n,
            settings: this.settings,
            revlog: this.revlog,
            examPlans: this.examPlans,
            addIcons: (svg) => this.addIcons(svg),
            addTopBar: (opts) => this.addTopBar(opts),
            removeTopBar: (id) => (this as any).removeTopBar(id),
            openTabOf: (tab) => this.openTabOf(tab),
            showTopbarMenu: (menu) => this.showTopbarMenu(menu),
            showMessage: (msg, timeout, type) => showMessage(msg, timeout, type),
        }, ICON_LV_CARDS_SVG);
        this.addIcons(ICON_LV_CARDS_SVG);

        // AQ-1：批量加载以 keys 数组驱动并按位置配对，杜绝「6 项加载只解构 5 项」的错位回归
        // （AT-1：读取与装配抽成方法，同步/覆盖变更后的有界串行重载复用同一路径）
        await this.applyLoadedStores(await this.readAllStores());
        this.bindExamPlansSync();
        void this.refreshExamLinkage();
        this.perf.setCold(!this.settings.onboarded); // AT-6：首轮未完成引导=冷启动
        if (rollDateIfNeeded(this.suspendToday)) {
            await this.persist.save(SUSPEND_TODAY_DATA, this.suspendToday);
        }
        // T-周报（docs/41 P1）：上周已结束且未写过周报 → 自动写入「小驴闪卡/学习周报」文档
        // 旁路增强：失败只记日志（周报可下周随本周一起补，幂等键不推进）；默认关闭，设置开启
        if (this.settings.weeklyReportEnabled) {
            void this.maybeWriteWeeklyReport().catch((e) => {
                lvLog("error", `[weekly-report] ${e instanceof Error ? e.message : String(e)}`);
            });
        }

        // AT-3：启动探测不阻塞插件初始化——探测异步进行，完成后再落库；
        // 断核/慢核/旧内核都在 V2_TIMEOUT_MS 内转 N/A（null）， riff 兼容路径立即可用，
        // 菜单 redetectV2 可随时重试。所有读取方（菜单/诊断/getV2Status）均为运行时读取，
        // 探测完成前短暂显示 N/A 属预期。
        this.flashcardV2 = null;
        detectFlashcardV2()
            .then(status => {
                this.flashcardV2 = status;
                // Gateway 探测结果落库（320）：设置页与诊断可直接读，无需重探
                if (status && this.settings.gatewayState !== status.state) {
                    this.settings.gatewayState = status.state;
                    this.saveSettingsSoon();
                }
            })
            .catch(() => { /* detectFlashcardV2 内部已兜底为 null，此处仅防御 */ });

        // 接入思源官方斜杠菜单（protyleSlash）原生制卡通道
        this.protyleSlash = [
            {
                filter: ["flashcard", "card", "shanka", "zhika", "sk", "zk", "小驴闪卡", "闪卡", "制作闪卡"],
                html: `<div class="b3-list-item__first"><span class="b3-list-item__text">${this.i18n.slashMakeCard ?? "小驴闪卡：将当前块制卡"}</span><span class="b3-list-item__meta">Flashcard</span></div>`,
                id: "lv-cards-slash-make",
                callback: (_protyle, nodeElement) => {
                    const blockID = nodeElement?.getAttribute("data-node-id");
                    if (blockID) {
                        void this.openDeckPicker([blockID]);
                    } else {
                        void this.openQuickCard();
                    }
                },
            },
        ];

        // 原生复习界面的评分事件 → 本地 revlog（宽容解析，事件结构变化不致崩）
        this.eventBus.on("click-flashcard-action", this.onNativeCardAction);
        // 块图标菜单 → 制卡入口（M2·FR1）
        this.eventBus.on("click-blockicon", this.onBlockIcon);
        // 外部编辑器文档保存与事务广播 → 静默防抖刷新前台看板（TODO-L1）
        this.eventBus.on("ws-main", this.onWsMain);

        // 对外窗口桥 window.xiaolvCards / window.lvCards（小驴生态协商协议 v1）
        this.disposeCardsBridge = mountCardsBridge({
            getStats: async () => {
                const day = this.revlog.days[todayDate()];
                return {
                    todayReviews: day?.review ?? 0,
                    todayNew: day?.new ?? 0,
                    todayForget: day?.forget ?? 0,
                    streak: calcStreak(this.revlog),
                    dueCount: await cachedDueCount().catch(() => 0),
                    historyDays: Object.keys(this.revlog.days).length,
                };
            },
            getDueSummary: async () => {
                const d = await dueCache.get("").catch(() => null);
                const today = todayDate();
                const todayReviewed = this.revlog?.days?.[today]?.review ?? 0;
                return {
                    unreviewedCount: d?.unreviewedCount ?? 0,
                    unreviewedNewCardCount: d?.unreviewedNewCardCount ?? 0,
                    unreviewedOldCardCount: d?.unreviewedOldCardCount ?? 0,
                    todayReviewedCount: todayReviewed,
                    updatedAt: new Date().toISOString(),
                };
            },
            openHub: tab => this.openTabOf(TAB_DASHBOARD, tab ? { tab } : undefined),
            openReview: opts => this.openTabOf(TAB_REVIEW, opts as Record<string, unknown>),
            receiveExtract: async (envelope: ExtractEnvelope) => this.receiveExtract(envelope),
            createCard: async (input: IntakeInput) => this.createExternalAtomicCard(input),
        });

        // 向小驴雷切工作台安全注册待复习闪卡组件（Ecosystem Federation Epoch 6 / Bento 3.0）
        this.unregisterRaikiri = registerRaikiriModuleSafely({
            moduleId: "cards-due-summary",
            title: "待复习闪卡",
            icon: "iconLvCards",
            category: "learning",
            supportedDevices: ["desktop", "sidebar", "mobile"],
            sizes: ["small", "medium", "wide"],
            description: "待复习闪卡统计与今日记忆节奏",
            source: { pluginId: "siyuan-lv-cards", name: "小驴闪卡" },
            read: async () => {
                const due = await dueCache.get("").catch(() => null);
                const today = todayDate();
                const todayReviewed = this.revlog?.days?.[today]?.review ?? 0;
                const streak = calcStreak(this.revlog);
                const totalDue = due?.unreviewedCount ?? 0;
                return {
                    items: [
                        { label: "待复习", value: `${due?.unreviewedOldCardCount ?? 0} 张` },
                        { label: "新卡片", value: `${due?.unreviewedNewCardCount ?? 0} 张` },
                        { label: "今日已学", value: `${todayReviewed} 张` },
                    ],
                    stat: {
                        value: String(totalDue),
                        label: "今日待复习",
                        sub: `连续学习 ${streak} 天`,
                    },
                    emptyHint: totalDue === 0 ? "今日闪卡已全部复习完毕 🎉" : "",
                    status: "ready",
                };
            },
            open: () => this.openTabOf(TAB_REVIEW),
        });

        const tabDeps = {
            loadHubMount,
            loadReviewMount,
            mountChunkFallback,
            loadHubServices,
        };
        registerDashboardTab(this, tabDeps);
        registerReviewTab(this, tabDeps);

        // 管理器已并入闪卡中心（LvTabs「管理」子页），不再注册独立 Tab
        registerPluginCommands({
            addCommand: (options) => this.addCommand(options),
            i18n: this.i18n,
            openDashboard: (tab?: string) => this.openTabOf(TAB_DASHBOARD, tab ? { tab } : undefined),
            openReview: (options?: { scope?: string }) => this.openTabOf(TAB_REVIEW, options),
            openManager: () => this.openTabOf(TAB_DASHBOARD, { tab: "manage" }),
            openQuickCard: () => this.openQuickCard(),
            openAIWizard: () => this.openAIWizard(),
            openRepairDrill: () => this.openRepairDrill(),
            openPalette: () => this.openPalette(),
            copyDiagnostics: () => this.copyDiagnostics(),
            openChallenge: () => this.openChallenge(),
            openMarkerCards: () => this.openMarkerCards(),
            openPairing: () => this.openPairing(),
            openHelpDoc: () => this.openHelpDoc(),
            createSampleWorkspace: () => this.createSampleWorkspace(),
            openDynamicBoard: () => this.openOrCreateDynamicBoardDoc(),
            togglePresentationPrivacy: () => this.togglePresentationPrivacy(),
        });

        // 入口矩阵：左键点击顶栏图标，默认打开闪卡主页面（TAB_DASHBOARD）；若开启直接复习且有到期卡，才直接开复习
        this.ensureTopBarElement();
        // 面包屑「复习本文档」按钮（M2·FR2，官方 API 3.8.2+；旧版静默跳过）
        if (typeof (this as any).addBreadcrumbButton === "function" && this.settings.modules.review) {
            (this as any).addBreadcrumbButton({
                id: "lv-cards-review-doc",
                icon: "iconLvCards",
                title: this.i18n.breadcrumbReview,
                callback: (_event: any, protyle: any) => {
                    const rootID: string = protyle?.block?.rootID ?? "";
                    if (rootID) {
                        // BI-3：文档入口（来源=文档，返回点=该文档）
                        this.openReviewWithEntry(`doc:${rootID}`, false, { entryKind: "doc", sourceID: rootID, returnPoint: `doc:${rootID}` });
                    }
                },
            });
        }

        // 注册全生态统一通知套件协调者（去中心化自协商与热接管）
        this.noticeHubCleaner = lvNotify.registerPlugin("siyuan-lv-cards");

        // 注册全生态灾备切面（Epoch 7 Phase 4 Protocol v1.3.0）
        this.backupCleaner = lvBackup.register(
            "siyuan-lv-cards",
            async () => this.dumpData(),
            async (data) => this.restoreData(data)
        );

        // 零点复习池重算：接入 lvTicker.onDateCross，零点准时重算今日 Due 卡池
        this.dateCrossUnsub = lvTicker.onDateCross("siyuan-lv-cards", async (todayKey: string) => {
            lvLog("info", `[lvTicker] date crossed to ${todayKey}, recalculating due pool`);
            if (rollDateIfNeeded(this.suspendToday)) {
                await this.persist.save(SUSPEND_TODAY_DATA, this.suspendToday);
            }
            invalidateDueCache();
            this.refreshDueBadge();
            try {
                (this.eventBus as any).emit(LV_EVENTS.storesChanged, storesChangedEvent([SUSPEND_TODAY_DATA]));
            } catch { /* 旁路 */ }
        });

        // 注册小驴罗盘极速弹射坞入口与二级行动（Epoch 7 Phase 5 Protocol v1.4.0）
        this.registerLaunchpadEntry();
        // Protocol v1.7.5：罗盘全端统一入口挂载（顶栏+悬浮球收敛）
        this.mobileEntryCleaner = lvLaunchpad.ensureUnifiedEntry();

        // 注册全生态穿透搜索切面（Epoch 7 Phase 7 Protocol v1.6.0）
        this.omnisearchCleaner = lvOmnisearch.registerProvider("siyuan-lv-cards", (keyword) => {
            return this.searchCardsForOmnisearch(keyword);
        });

        // 注册跨插件联动自动化规则（考试做错题 ➔ 自动同步闪卡生成复习卡）
        this.autoRuleCleaner = lvAutomation.registerRule({
            id: "rule-exam-to-cards",
            name: "考试做错题 ➔ 自动同步闪卡生成复习卡",
            desc: "小驴考试做错题时，自动在闪卡生成待复习卡片",
            enabled: true,
            triggerSource: "siyuan-exam",
            triggerType: "wrong-question",
            actionPlugin: "siyuan-lv-cards",
            actionName: "create-card",
            execute: async (payload: any) => {
                return await this.createCardFromWrongQuestion(payload);
            }
        });

        // 注册跨插件联动自动化规则（拾遗高亮 ➔ 自动同步闪卡生成复习卡）
        this.gleanRuleCleaner = lvAutomation.registerRule({
            id: "rule-glean-to-cards",
            name: "拾遗高亮 ➔ 自动同步闪卡生成复习卡",
            desc: "小驴拾遗高亮制卡请求时，自动在闪卡生成待复习新卡",
            enabled: true,
            triggerSource: "siyuan-glean",
            triggerType: "create-card-request",
            actionPlugin: "siyuan-lv-cards",
            actionName: "create-card",
            execute: async (payload: any) => {
                const content = String(payload?.front || "").trim() + (payload?.back ? ` ==${String(payload.back).replace(/\s*\n+\s*/g, " ").trim()}==` : "");
                return (await this.createExternalAtomicCard({ content, sourceBlockId: payload?.sourceBlockId, sourceDocId: payload?.sourceDocId, sourceTitle: payload?.sourceTitle, tags: payload?.tags, requestId: payload?.requestId })).ok;
            }
        });

        // 监听生态事件 lv-cards:incremental-extract（小驴拾遗原生派发）
        if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
            const onIncrementalExtract = (evt: Event) => {
                const detail = (evt as CustomEvent).detail;
                if (detail) {
                    void this.createCardFromGlean(detail);
                }
            };
            window.addEventListener("lv-cards:incremental-extract", onIncrementalExtract);
            this.incrementalExtractCleaner = () => {
                window.removeEventListener("lv-cards:incremental-extract", onIncrementalExtract);
            };
        }
    }

    onLayoutReady() {
        this.ensureTopBarElement();
        this.refreshDueBadge();
        this.setupBadgeTimer();
        // Onboarding 首启自动弹出（M12：!onboarded 时延迟 2s 弹出，避免与布局渲染竞争）
        if (!this.settings.onboarded) {
            this.onboardingTimer = setTimeout(() => {
                this.onboardingTimer = null;
                void this.openOnboarding();
            }, 2000);
        }
    }

    /** 角标心跳与主时钟（消灭高频唤醒，统一由 lvTicker.onMinute 驱动） */
    private setupBadgeTimer() {
        if (this.badgeTimerUnsub) {
            this.badgeTimerUnsub();
            this.badgeTimerUnsub = null;
        }
        if (this.badgeTimer) {
            clearInterval(this.badgeTimer);
            this.badgeTimer = null;
        }
        const sec = this.settings.badgeRefreshSec;
        if (!sec || sec < 5) {
            return; // 关闭心跳（0 或非法值）
        }
        this.badgeTimerUnsub = lvTicker.onMinute("siyuan-lv-cards", () => {
            this.refreshDueBadge();
            this.checkDailyReminder();
            this.checkBacklogWarn();
            this.checkExamMilestones();
        });
    }

    /** 每日到期提醒：到设定时间且仍有到期卡时通知一次（X 组，基础版） */
    private reminderShownFor = "";
    private backlogWarnedFor = "";
    private examNotifiedFor = "";

    /** 免打扰时段（跨午夜支持）：quiet 时段内不弹积压/庆祝类提示 */
    private inQuietHours(): boolean {
        return isWithinQuietHours(this.settings.quietStart, this.settings.quietEnd);
    }

    /** 积压预警（X 组）：连续 N 天未复习时提醒一次（N 固定 3，随提醒开关） */
    private checkBacklogWarn() {
        const last = this.revlog.entries[this.revlog.entries.length - 1];
        const decision = decideBacklogWarning({
            reminderEnabled: this.settings.reminderEnabled,
            lastDue: this.lastDue,
            inQuiet: this.inQuietHours(),
            lastRevlogTs: last?.ts ?? 0,
            today: todayDate(),
            alreadyWarnedToday: this.backlogWarnedFor === todayDate(),
        });
        if (decision.shouldWarn) {
            this.backlogWarnedFor = todayDate();
            showMessage(this.i18n.backlogWarn.replace("${n}", String(decision.days)), 4000, "info");
        }
    }
    /** 考试里程碑提醒（X·372/382）：30/7/1 天各提醒一次，同日同计划去重 */
    private checkExamMilestones() {
        const decision = decideExamMilestoneReminder({
            examEnabled: Boolean(this.settings.modules.exam && (this.settings.examEnabled || this.examPlans.plans.some(p => p.enabled))),
            reminderEnabled: this.settings.reminderEnabled,
            inQuiet: this.inQuietHours(),
            plans: this.examPlans.plans,
            today: todayDate(),
            lastNotifiedKey: this.examNotifiedFor,
        });
        if (decision.shouldNotify && decision.plan && decision.daysLeft !== undefined && decision.key) {
            this.examNotifiedFor = decision.key;
            lvNotify.card({
                source: "小驴闪卡",
                category: "exam-milestone",
                title: this.i18n.examNotifTitle || "备考倒计时提醒",
                message: this.i18n.examNotifBody.replace("${name}", decision.plan.name).replace("${n}", String(decision.daysLeft)),
                level: "warn",
                duration: 10000,
                actions: [
                    {
                        label: "查看看板",
                        primary: true,
                        onClick: () => this.openTabOf(TAB_DASHBOARD),
                    },
                ],
            });
        }
    }

    private checkDailyReminder() {
        const today = todayDate();
        if (!shouldTriggerDailyReminder({
            reminderEnabled: this.settings.reminderEnabled,
            reminderTime: this.settings.reminderTime,
            alreadyShownToday: this.reminderShownFor === today,
        })) {
            return;
        }
        cachedDueCount().then(count => {
            if (count <= 0) {
                this.reminderShownFor = today;
                return;
            }
            notifyDailyReviewReminder({
                count,
                title: this.i18n.topbarTitle || "今日复习提醒",
                message: this.i18n.badgeDue.replace("${n}", String(count)),
                onStartReview: () => this.openTabOf(TAB_REVIEW),
            });
            this.reminderShownFor = today;
        }).catch(() => { /* 旁路 */ });
    }

    onunload() {
        const unloadStart = Date.now();
        if (this.omnisearchCleaner) {
            this.omnisearchCleaner();
            this.omnisearchCleaner = undefined;
        }
        if (this.autoRuleCleaner) {
            this.autoRuleCleaner();
            this.autoRuleCleaner = undefined;
        }
        if (this.gleanRuleCleaner) {
            this.gleanRuleCleaner();
            this.gleanRuleCleaner = undefined;
        }
        if (this.incrementalExtractCleaner) {
            this.incrementalExtractCleaner();
            this.incrementalExtractCleaner = undefined;
        }
        if (this.launchpadCleaner) {
            this.launchpadCleaner();
            this.launchpadCleaner = undefined;
        }
        if (this.mobileEntryCleaner) {
            this.mobileEntryCleaner();
            this.mobileEntryCleaner = undefined;
        }
        if (this.mobileReviewDialog) {
            try { this.mobileReviewDialog.close(); } catch { /* 已销毁 */ }
            this.mobileReviewDialog = null;
        }
        if (this.mobileHubDialog) {
            // Mobile Spec v1：卸载时收拢手机端全屏宿主（零孤儿 DOM）
            try { this.mobileHubDialog.close(); } catch { /* 已销毁 */ }
            this.mobileHubDialog = null;
        }
        if (this.backupCleaner) {
            this.backupCleaner();
            this.backupCleaner = undefined;
        }
        if (this.noticeHubCleaner) {
            this.noticeHubCleaner();
            this.noticeHubCleaner = undefined;
        }
        if (this.disposeCardsBridge) {
            this.disposeCardsBridge();
            this.disposeCardsBridge = undefined;
        }
        if (this.unregisterRaikiri) {
            this.unregisterRaikiri();
            this.unregisterRaikiri = undefined;
        }
        const palette = this.paletteState;
        this.paletteState = undefined;
        palette?.close?.();
        this.unbindExamPlansSync();
        this.eventBus.off("click-flashcard-action", this.onNativeCardAction);
        this.eventBus.off("click-blockicon", this.onBlockIcon);
        this.eventBus.off("ws-main", this.onWsMain);
        if (this.docSyncTimer) {
            clearTimeout(this.docSyncTimer);
            this.docSyncTimer = null;
        }
        this.topbarController?.destroy();
        if (this.onboardingTimer) {
            clearTimeout(this.onboardingTimer);
            this.onboardingTimer = null;
        }
        // AT-1：取消挂起中的同步重载（卸载后不再触发读盘）
        if (this.reloadTimer) {
            clearTimeout(this.reloadTimer);
            this.reloadTimer = null;
        }
        // AT-2：防抖中的设置保存立即落盘，禁用/重载不丢最后一次改动
        if (this.settingsSaveTimer) {
            clearTimeout(this.settingsSaveTimer);
            this.settingsSaveTimer = null;
            this.saveSettingsNow();
        }
        this.flushRevlogSave();
        // AQ-4：卸载前尽力等在途写入落盘（Petal dispose 预算约 5s，上限 3s 不阻塞卸载）
        void this.persist.waitAll(3000).then(ok => {
            if (!ok) {
                lvLog("warn", "unload: writes not settled");
            }
            lvLog("info", "[unload] done: " + (Date.now() - unloadStart) + "ms");
        });
        if (this.badgeTimerUnsub) {
            this.badgeTimerUnsub();
            this.badgeTimerUnsub = null;
        }
        if (this.dateCrossUnsub) {
            this.dateCrossUnsub();
            this.dateCrossUnsub = null;
        }
        if (this.badgeTimer) {
            clearInterval(this.badgeTimer);
            this.badgeTimer = null;
        }
    }

    async uninstall(): Promise<void> {
        lvLog("info", "[uninstall] done");
        this.topbarController?.destroy();
    }

    public ensureTopBarElement(): HTMLElement | null {
        return this.topbarController?.ensureTopBarElement() ?? null;
    }

    private refreshDueBadge() {
        this.topbarController?.refreshDueBadge(todayDate());
        this.lastDue = this.topbarController?.getLastDue() ?? 0;
        try {
            this.registerLaunchpadEntry();
        } catch { /* 旁路 */ }
    }

    /** 块图标菜单：制卡入口（M2·FR1）。菜单构建必须同步，耗时操作放 click 回调 */
    private onBlockIcon = ({ detail }: any) => {
        try {
            const blockIDs = extractBlockIDs(detail?.blockElements);
            if (blockIDs.length === 0 || !detail?.menu) {
                return;
            }
            // 挖空可视化（M2）：捕获编辑器当前选区（菜单弹出会抢焦点，须在构建期捕获）
            const clozeRange = blockIDs.length === 1 && document.getSelection()?.rangeCount
                ? document.getSelection()!.getRangeAt(0).cloneRange()
                : null;
            const clozeText = clozeRange?.toString().trim() ?? "";

            const items = computeBlockMenuItems({
                blockIDs,
                modules: this.settings.modules,
                i18n: this.i18n,
                selectionText: clozeText,
                actions: {
                    addToDeck: (ids) => this.openDeckPicker(ids),
                    makeFromSelection: (id, text) => {
                        // R59 用选中文本打开快速制卡（题面预填），来源块自动关联
                        void this.openQuickCardFromSelection(id, text);
                    },
                    addToInbox: (ids) => {
                        const added = this.addInboxItems(ids);
                        showMessage(added > 0 ? this.i18n.inboxAdded.replace("${n}", String(added)) : this.i18n.inboxAlready, 2000, "info");
                    },
                    makeCloze: (id) => this.makeClozeCard(id, clozeRange, clozeText),
                    makeOcclusion: (id) => this.openDeckPicker([id], {
                        skipAdd: true,
                        onPicked: (deckID: string) => this.openOcclusionEditor(id, deckID),
                    }),
                    removeFromDeck: (ids) => this.removeCardsFromDeck(ids),
                },
            });

            addBlockMenuItems(detail.menu, items);
        } catch {
            // 菜单旁路，绝不影响编辑器
        }
    };

    private async openDeckPicker(blockIDs: string[], opts: { skipAdd?: boolean; onPicked?: (deckID: string) => void } = {}) {
        const DeckPicker = await loadDeckPicker();
        svelteDialog({
            title: this.i18n.deckPickerTitle,
            component: DeckPicker,
            width: "min(420px, 92vw)",
            props: {
                newNamePlaceholder: this.i18n.deckNewName,
                firstDeckNamePlaceholder: this.i18n.deckNewNameFirst,
                emptyDeckText: this.i18n.deckEmpty,
                retryLabel: this.i18n.refresh,
                confirmLabel: this.i18n.deckConfirm,
                loadingLabel: this.i18n.deckLoading,
                busyLabel: this.i18n.deckSaving,
                onBeforeConfirm: async () => {
                    if (opts.skipAdd) {
                        return;
                    }
                    const escapedIDs = blockIDs.map(id => `'${id.replace(/'/g, "''")}'`).join(",");
                    const rows = await sqlQuery(`SELECT id, markdown FROM blocks WHERE id IN (${escapedIDs})`);
                    const markdownById = new Map(rows.map(row => [String(row.id), String(row.markdown ?? "")]));
                    const invalidIds: string[] = [];
                    for (const id of blockIDs) {
                        const markdown = markdownById.get(id) ?? "";
                        const occlusionValid = await this.hasValidOcclusionCard(id, markdown);
                        const decision = validateCardEntry({
                            blockID: id,
                            markdown,
                            exists: markdownById.has(id),
                            occlusionValid,
                        });
                        if (!decision.ok) invalidIds.push(id);
                    }
                    if (invalidIds.length > 0) {
                        showMessage(this.i18n.flashcardNeedsAnswer, 3000, "error");
                        return false;
                    }
                    const dupes = await checkDuplicateCards(blockIDs);
                    if (dupes > 0) {
                        return confirmDialogBool({
                            title: this.i18n.dupTitle,
                            content: `<div class="b3-typography">${this.i18n.dupConfirm.replace("${n}", String(dupes))}</div>`,
                        });
                    }
                },
                onConfirm: async (deckID: string) => {
                    if (!opts.skipAdd) {
                        try {
                            await addRiffCards(deckID, blockIDs);
                            await Promise.all(blockIDs.map(id => this.rememberSourceFingerprint(id)));
                        } catch (error) {
                            showMessage(formatRiffCardEntryError(error, this.i18n), 3000, "error");
                            return false;
                        }
                        notifyBatchCardCreation(this.i18n.deckAdded.replace("${n}", String(blockIDs.length)));
                    }
                    opts.onPicked?.(deckID);
                },
                onClose: noop,
            },
        });
    }

    /** 挖空并制卡（M2·FR5）：选中文本一键包 ==...== 后走常规入组流程 */
    private makeClozeCard(blockID: string, range: Range | null, text: string) {
        if (!range || !text) {
            showMessage(this.i18n.clozeNeedSelection, 2500, "error");
            return;
        }
        const sel = document.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        let ok = false;
        try {
            ok = document.execCommand("insertText", false, `==${text}==`);
        } catch {
            ok = false;
        }
        if (!ok) {
            showMessage(this.i18n.clozeFail, 2500, "error");
            return;
        }
        this.openDeckPicker([blockID]);
    }

    /** 图片遮挡编辑器（M4·FR4 riff 先行）：保存块属性后入卡组 */
    private async openOcclusionEditor(blockID: string, deckID: string) {
        const OcclusionEditor = await loadOcclusionEditor();
        svelteDialog(buildOcclusionEditorDialogArgs(this.i18n, OcclusionEditor, blockID, async () => {
            await addRiffCards(deckID, [blockID]);
            await this.rememberSourceFingerprint(blockID);
            showMessage((this.i18n as any).occlusion.occlusionSaved, 2000, "info");
        }));
    }

    private async removeCardsFromDeck(blockIDs: string[]) {
        try {
            const result = await removeCardsFromDeckFlow(
                blockIDs,
                this.cardRelations,
                (mutator) => this.cardRelationsMutations(mutator),
            );
            if (!result.hadCards) {
                showMessage(this.i18n.deckNotCard, 2000, "info");
                return;
            }
            showMessage(this.i18n.deckRemoved.replace("${n}", String(result.removedCount)), 2000, "info");
        } catch (e: any) {
            showMessage(formatRiffCardEntryError(e, this.i18n, e?.message ?? String(e)), 3000, "error");
        }
    }

    /** 自诊断（AD）：脱敏环境信息复制到剪贴板，供 issue 附带 */
    private async copyDiagnostics() {
        try {
            const { buildDiagnosticsText } = await loadHubServices();
            const kv = await kernelVersion().catch(() => "?");
            const text = buildDiagnosticsText({
                pluginVersion: (this as any).manifest?.version ?? "unknown",
                kernelVersion: kv,
                v2State: this.flashcardV2 ? this.flashcardV2.state : null,
                modules: this.settings.modules,
                revlogCount: this.revlog.entries.length,
                streak: calcStreak(this.revlog),
                dueToday: this.lastDue,
                plansCount: this.examPlans.plans.length,
                persistStats: this.persist.stats(),
                hasPersistFailures: this.persist.hasFailures(),
                dueCacheStats: dueCache.stats(),
                recentLogDump: lvLogDump(),
            });
            await navigator.clipboard.writeText(text);
            showMessage(this.i18n.diagCopied, 2000, "info");
        } catch {
            showMessage(this.i18n.diagFail, 3000, "error");
        }
    }

    /** AnkiConnect 客户端连接测试（M9·FR1） */
    private async testAnkiClient(url = this.settings.ankiClientUrl, key = this.settings.ankiClientKey): Promise<string> {
        return probeAnkiConnection(url, key, this.i18n);
    }

    private storageLastWrite: Record<string, number> = {};
    /** AQ-4：失败→恢复跟踪（onFail 置位，下次 onOk 展示恢复提示并清除） */
    private hadPersistFail = false;

    private trackSave(file: string) {
        this.storageLastWrite[file] = Date.now();
        if (this.hadPersistFail) {
            this.hadPersistFail = false;
            // AQ-4：恢复可观测——失败后首次成功写入给用户确认
            try { showMessage(this.i18n.settingsSaved, 1500, "info"); } catch { /* 旁路 */ }
        }
    }

    private storageStats() {
        return computeStorageStats({
            settingsVersion: this.settings.version,
            revlogCount: this.revlog.entries.length,
            suspendTodayCount: this.suspendToday.cardIDs.length,
            examPlansCount: this.examPlans.plans.length,
            aiBatchesCount: this.aiBatches.batches.length,
            aiJobsCount: this.aiJobs.jobs.length,
            knowledgeObjectsCount: this.knowledgeObjects.objects.length,
            relationsCount: this.cardRelations.relations.length,
            errorTagsCount: this.errorTags.tags.length,
            inboxCount: this.inbox.items.length,
            learningGoalsCount: this.learningGoals.goals.length,
            entryContextsCount: this.entryContexts.contexts.length,
            contentLifecyclesCount: this.contentLifecycles.lifecycles.length,
            killSwitchDisabledCount: this.killSwitch.disabledTargets.length,
            killSwitchQuarantinedCount: this.killSwitch.quarantinedJobs.length,
            storageLastWrite: this.storageLastWrite,
        });
    }

    /** 考后复盘报告（M7·FR6）：计划窗口内的复习统计 Markdown，复制到剪贴板 */
    /** 复盘报告写入复盘文档（M7·FR6 深化）：除剪贴板外可一键写入「小驴闪卡/考试复盘」文档 */
    async writeExamReportDoc(plan: ExamPlan): Promise<void> {
        const nb = await this.targetNotebook();
        if (!nb) {
            throw new Error(this.i18n.onboardingNoNotebook);
        }
        const md = await this.buildExamReportMd(plan);
        const docID = await createDocWithMd(nb.id, `小驴闪卡/考试复盘/${plan.name}`, md);
        if (!docID) {
            throw new Error(this.i18n.quickCardFail);
        }
        showMessage(this.i18n.examReportWritten, 2000, "info");
        // AR-5：成功打开复盘文档
        this.openSiYuanTarget(docID);
    }

    /** 笔记本归属集合（AR-11）：按 revlog 中出现的 blockID 分批查内核，落在该笔记本的才算命中范围 */
    private async notebookBlockIDs(nbId: string, blockIDs: string[]): Promise<Set<string>> {
        return queryNotebookBlockIDs(nbId, blockIDs, (sql) => sqlQuery(sql));
    }

    private async buildExamReportMd(plan: ExamPlan): Promise<string> {
        const { renderExamReportMarkdown } = await loadHubServices();
        // AR-11：时间窗固定为「计划创建以来」，范围按计划过滤；无法归属的记录单独列示
        let inScope: ((e: { deckID?: string; blockID?: string }) => boolean) | undefined;
        if (plan.scopeKind === "deck") {
            inScope = e => e.deckID === plan.scopeId;
        } else if (plan.scopeKind === "notebook" && plan.scopeId) {
            const window = this.revlog.entries.filter(e => e.rating > 0);
            const ids = await this.notebookBlockIDs(plan.scopeId, [...new Set(window.map(e => e.blockID).filter(Boolean))]);
            inScope = e => ids.has(e.blockID ?? "");
        }
        return renderExamReportMarkdown({
            plan,
            entries: this.revlog.entries,
            inScopeFilter: inScope,
        });
    }

    private async generateExamReport(plan: ExamPlan) {
        const md = await this.buildExamReportMd(plan);
        try {
            await navigator.clipboard.writeText(md);
            showMessage(this.i18n.examReportCopied, 2500, "info");
        } catch {
            showMessage(this.i18n.diagFail ?? "复制到剪贴板失败", 3000, "error");
        }
    }

    /** 落盘笔记本（605）：设置指定优先，否则第一个打开的笔记本 */
    private async targetNotebook(): Promise<{ id: string; name: string } | null> {
        const notebooks = await getNotebooks();
        return resolveTargetNotebook(notebooks, this.settings.targetNotebookId);
    }

    /** 内置帮助文档（485）：同路径复用「小驴闪卡/使用帮助」文档，内容随插件更新；
     * 帮助文案随 hub chunk 按需加载。 */
    private async openHelpDoc() {
        try {
            const nb = await this.targetNotebook();
            if (!nb) {
                showMessage(this.i18n.onboardingNoNotebook, 2500, "error");
                return;
            }
            const { helpMarkdown } = await loadHubServices();
            const lang = (window.siyuan as any)?.languages?.lang ?? "zh_CN";
            const docID = await createDocWithMd(nb.id, "小驴闪卡/使用帮助", helpMarkdown(lang));
            if (!docID) {
                showMessage(this.i18n.quickCardFail, 2500, "error");
                return;
            }
            this.openSiYuanTarget(docID);
        } catch (error) {
            this.reportDialogOpenFailure(this.i18n.openHelp, error);
        }
    }

    /** 示例工作区（476）：创建 5 张不同形态的示例卡（普通/公式/挖空/列表/问答）并入「示例卡组」 */
    private sampleWsBusy = false;
    private async createSampleWorkspace() {
        if (this.sampleWsBusy) {
            return; // AR-4：并发双击防重入
        }
        this.sampleWsBusy = true;
        try {
            const nb = await this.targetNotebook();
            if (!nb) {
                showMessage(this.i18n.onboardingNoNotebook, 2500, "error");
                return;
            }
            const res = await createFullSampleWorkspace(nb.id, this.i18n);
            const msg = res.alreadyExisted
                ? ((this.i18n as any).sampleExists ?? this.i18n.sampleDone.replace("${n}", "0"))
                : this.i18n.sampleDone.replace("${n}", res.createdCount);
            showMessage(msg, 2500, "info");
            this.openSiYuanTarget(res.docID);
        } catch (e: any) {
            showMessage(e?.message ?? String(e), 3000, "error");
        } finally {
            this.sampleWsBusy = false;
        }
    }

    /** 动态错题看板文档（D1）：生成或打开通过思源原生 SQL 嵌入块动态汇总的活文档 */
    public async openOrCreateDynamicBoardDoc(): Promise<string> {
        const nb = await this.targetNotebook();
        if (!nb) {
            showMessage(this.i18n.onboardingNoNotebook, 2500, "error");
            throw new Error(this.i18n.onboardingNoNotebook);
        }
        const docPath = DYNAMIC_BOARD_DOC_PATH;
        let docID = await findDocIDByHPath(nb.id, `/${docPath}`);
        if (!docID) {
            const md = buildDynamicBoardMarkdown(this.i18n);
            docID = await createDocWithMd(nb.id, docPath, md);
        }
        if (!docID) {
            showMessage(this.i18n.quickCardFail, 2500, "error");
            throw new Error(this.i18n.quickCardFail);
        }
        this.openSiYuanTarget(docID);
        showMessage((this.i18n as any).dynamicBoardOpened ?? "已打开《闪卡动态看板与错题本》", 2500, "info");
        return docID;
    }

    /** 切换星标重点卡状态并同步镜像至思源块属性 custom-lv-starred */
    public async toggleStarCard(id: string): Promise<boolean> {
        const s = new Set(this.settings.starredCards);
        const added = !s.delete(id);
        if (added) s.add(id);
        this.settings.starredCards = [...s];
        this.saveSettingsSoon();
        try {
            await setBlockAttrs(id, buildStarredAttrs(added));
        } catch {
            // 块属性同步为旁路增强
        }
        return added;
    }

    private async createQuickCard(
        markdown: string,
        deckID: string,
        _deckName: string,
        q?: string,
        a?: string,
        docID?: string,
        options?: { sourceDocID?: string; sourceBlockID?: string; sourceTitle?: string; inPlace?: boolean; examAttrs?: Record<string, string> },
    ) {
        const nb = await this.targetNotebook();
        if (!nb) {
            throw new Error(this.i18n.onboardingNoNotebook);
        }
        const created = await executeQuickCardCreation({
            nbId: nb.id,
            markdown,
            deckID,
            qualityErrorMessage: this.i18n.flashcardNeedsAnswer,
            q,
            a,
            docID,
            sourceDocID: options?.sourceDocID,
            sourceBlockID: options?.sourceBlockID,
            sourceTitle: options?.sourceTitle,
            inPlaceDocID: options?.inPlace && options.sourceDocID ? options.sourceDocID : undefined,
            examAttrs: options?.examAttrs,
            mutateKnowledgeObjects: (mutator) => this.knowledgeObjectsMutations(mutator),
        });
        await this.rememberSourceFingerprint(created.blockID, created.docID, markdown);
        showMessage(options?.inPlace ? (this.i18n.quickCardDocInPlaceDone ?? "已在当前笔记就地制卡并加入卡组") : this.i18n.quickCardDone, 2000, "info");
        return created;
    }

    private async createQuickCardView(embedded = false, prefillQ = "") {
        const view: { Component: any; mount?: (comp: any, target: HTMLElement, props: Record<string, any>) => { destroy(): void } } = embedded
            ? await loadQuickCardEmbedded()
            : { Component: await loadQuickCard() };
        const activeDoc = await this.loadCurrentDoc().catch(() => null);
        return {
            Component: view.Component,
            ...(view.mount ? { mount: view.mount } : {}),
            props: {
                i18n: this.i18n,
                activeDoc: activeDoc ? { name: activeDoc.name, docId: activeDoc.docId } : null,
                // R58 记住上次卡组：打开时预选，成功制卡后持久化
                initialDeckID: this.settings.lastQuickCardDeck ?? "",
                // R59 选中文本制卡：题面预填
                initialQ: prefillQ,
                onDeckUsed: (deckID: string) => {
                    if (!deckID || this.settings.lastQuickCardDeck === deckID) return;
                    this.settings.lastQuickCardDeck = deckID;
                    this.saveSettingsSoon();
                },
                onCreate: (markdown: string, deckID: string, deckName: string, q?: string, a?: string, docID?: string, options?: { sourceDocID?: string; sourceBlockID?: string; sourceTitle?: string; inPlace?: boolean; examAttrs?: Record<string, string> }) =>
                    this.createQuickCard(markdown, deckID, deckName, q, a, docID, options),
                onClose: () => { /* 宿主或 Hub 管理视图生命周期 */ },
            },
        };
    }

    private isMobileHost(): boolean {
        if ((this as unknown as { isMobile?: boolean }).isMobile) return true;
        if (lvLaunchpad.isMobileFrontend()) return true;
        try {
            const fe = typeof siyuanNamespace.getFrontend === "function" ? siyuanNamespace.getFrontend() : "";
            return fe === "mobile" || fe === "browser-mobile";
        } catch {
            return false;
        }
    }

    private async openQuickCard(prefillQ = "") {
        try {
            const mobile = this.isMobileHost();
            // Mobile Spec v1/v2：手机端全屏自适应 visualViewport，制卡成功后停留继续录入
            const view = await this.createQuickCardView(mobile, prefillQ);
            let unbindVv: (() => void) | null = null;
            const { dialog } = svelteDialog({
                title: this.i18n.quickCardTitle,
                component: view.Component,
                width: mobile ? "100vw" : "min(620px, 94vw)",
                height: mobile ? "100dvh" : "min(820px, calc(100vh - 48px))",
                props: view.props,
                callback: () => {
                    unbindVv?.();
                    unbindVv = null;
                },
            });
            if (mobile) {
                dialog.element.classList.add("lv-mobile-sheet-dialog");
                dialog.element.querySelector(".b3-dialog")?.classList.add("lv-mobile-sheet-dialog");
                unbindVv = bindMobileVisualViewport(dialog.element);
            }
        } catch (e) {
            this.reportDialogOpenFailure(this.i18n.quickCardTitle, e);
        }
    }

    /** R59 选中文本制卡：题面预填选区文本，且自动关联来源块（就近原位制卡） */
    private async openQuickCardFromSelection(blockID: string, selectionText: string) {
        try {
            const mobile = this.isMobileHost();
            const view = await this.createQuickCardView(false, selectionText);
            let unbindVv: (() => void) | null = null;
            const { dialog } = svelteDialog({
                title: this.i18n.quickCardTitle,
                component: view.Component,
                width: mobile ? "100vw" : "min(620px, 94vw)",
                height: mobile ? "100dvh" : "min(820px, calc(100vh - 48px))",
                props: {
                    ...view.props,
                    activeDoc: await this.loadCurrentDoc().then(d => d ? { name: d.name, docId: d.docId ?? "" } : null).catch(() => null),
                    onCreate: (markdown: string, deckID: string, deckName: string, q?: string, a?: string, docID?: string, options?: { sourceDocID?: string; sourceTitle?: string; inPlace?: boolean; examAttrs?: Record<string, string> }) =>
                        this.createQuickCard(markdown, deckID, deckName, q, a, docID, {
                            ...options,
                            sourceBlockID: blockID,
                            sourceDocID: options?.sourceDocID,
                        }),
                },
                callback: () => {
                    unbindVv?.();
                    unbindVv = null;
                },
            });
            if (mobile) {
                dialog.element.classList.add("lv-mobile-sheet-dialog");
                dialog.element.querySelector(".b3-dialog")?.classList.add("lv-mobile-sheet-dialog");
                unbindVv = bindMobileVisualViewport(dialog.element);
            }
        } catch (e) {
            this.reportDialogOpenFailure(this.i18n.quickCardTitle, e);
        }
    }

    /** 当前打开的文档（M2·FR6 输入源扩展，🧪 getAllEditor 行为真机验证） */
    private async loadCurrentDoc(): Promise<{ name: string; content: string; docId?: string } | null> {
        // name 字段由 hPath 提供；docId 供向导「回源」跳转（T02）
        const editors: any[] = (getAllEditor() as any) ?? [];
        if (editors.length === 0) {
            return null;
        }
        const active =
            editors.find(e => e?.headElement?.classList?.contains("item--focus")) ??
            editors[editors.length - 1];
        const rootID: string = active?.protyle?.block?.rootID ?? "";
        if (!rootID) {
            return null;
        }
        const md = await exportMdContent(rootID);
        return { name: md.hPath, content: md.content, docId: rootID };
    }

    /** 标记符制卡（M2·FR4）：活动文档 → 选卡组 → 扫描 `术语:: 定义` 与「？」结尾块 → 勾选入组 */
    private openMarkerCards() {
        if (!this.settings.markerEnabled) {
            showMessage(this.i18n.markerDisabled, 2500, "info");
            return;
        }
        const editors: any[] = (getAllEditor() as any) ?? [];
        const active =
            editors.find(e => e?.headElement?.classList?.contains("item--focus")) ??
            editors[editors.length - 1];
        const rootID: string = active?.protyle?.block?.rootID ?? "";
        if (!rootID) {
            showMessage(this.i18n.markerNoDoc, 2500, "error");
            return;
        }
        this.openDeckPicker([], {
            skipAdd: true,
            onPicked: (deckID: string) => this.scanMarkerCards(rootID, deckID),
        });
    }

    private async scanMarkerCards(rootID: string, deckID: string) {
        const safe = rootID.replace(/'/g, "''");
        const rows = await sqlQuery(`SELECT id, markdown FROM blocks WHERE root_id='${safe}' AND type IN ('p','h') ORDER BY sort, id`);
        const { items } = extractMarkerCardItems(rows);
        if (items.length === 0) {
            showMessage(this.i18n.markerNone, 2500, "info");
            return;
        }
        const MarkerCards = await loadMarkerCards();
        svelteDialog({
            title: this.i18n.markerTitle,
            component: MarkerCards,
            width: "min(640px, 94vw)",
            props: {
                i18n: this.i18n,
                items,
                onCreate: async (picked: { blockID: string; kind: "qa" | "whole"; front: string; back: string }[]) => {
                    const nb = await this.targetNotebook();
                    if (!nb) {
                        throw new Error(this.i18n.onboardingNoNotebook);
                    }
                    // 问答块统一落在「小驴闪卡/标记制卡/<日期>」文档（同路径复用既有文档）
                    const today = todayDate();
                    const docID = await createDocWithMd(nb.id, `小驴闪卡/标记制卡/${today}`, "");
                    if (!docID) {
                        throw new Error(this.i18n.quickCardFail);
                    }
                    const qaIds: string[] = [];
                    await withDocLock(docID, async () => {
                        for (const it of picked.filter(p => p.kind === "qa")) {
                            // 单块问答：附带指向标记原块的反链引用与块属性
                            const rawQa = serializeQaCard(it.front, it.back);
                            const cardMarkdown = `${rawQa}\n\n> 来源：(( ${it.blockID} "原笔记" ))`;
                            const ids = await appendBlock("markdown", cardMarkdown, docID);
                            if (ids?.length) {
                                qaIds.push(ids[0]);
                                void setBlockAttrs(ids[0], {
                                    "custom-lv-source-doc": rootID,
                                    "custom-lv-source-block": it.blockID,
                                }).catch(() => {});
                            }
                        }
                    });
                    const wholePicked = picked.filter(p => p.kind === "whole").map(p => p.blockID);
                    for (const id of wholePicked) {
                        void setBlockAttrs(id, {
                            "custom-lv-source-doc": rootID,
                        }).catch(() => {});
                    }
                    const all = [...qaIds, ...wholePicked];
                    if (all.length > 0) {
                        try {
                            await addRiffCards(deckID, all);
                            await Promise.all(qaIds.map(id => this.rememberSourceFingerprint(id, docID)));
                            await Promise.all(wholePicked.map(id => this.rememberSourceFingerprint(id)));
                        } catch (error) {
                            throw new Error(formatRiffCardEntryError(error, this.i18n));
                        }
                    }
                    notifyBatchCardCreation(this.i18n.markerCreated.replace("${n}", String(all.length)));
                },
                onClose: noop,
            },
        });
    }

    /** 笔记本范围材料（M2·FR6 扩展，AI 向导用）：聚合最近 200 个文本块 */
    private async loadNotebookMaterial(nbId: string): Promise<string> {
        return queryNotebookMaterialText(nbId, (sql) => sqlQuery(sql));
    }

    private async openOnboarding() {
        try {
            const Onboarding = await loadOnboarding();
            let closeOnboardingDialog = () => {};
            const { dialog } = svelteDialog({
                title: this.i18n.onboardingTitle,
                component: Onboarding,
                width: "min(560px, 94vw)",
                props: {
                    i18n: this.i18n,
                    applyPersona: async (id: "exam" | "notes" | "language") => {
                        const preset = PERSONA_PRESETS.find(p => p.id === id);
                        if (!preset) return;
                        this.settings = {
                            ...this.settings,
                            modules: { ...this.settings.modules, ...preset.modules },
                            ...preset.params,
                            persona: id,
                        };
                        await this.saveSettingsNow();
                    },
                    createSampleCards: nbId => this.createSampleCards(nbId),
                    openHelp: () => { closeOnboardingDialog(); void this.openHelpDoc(); },
                    openSampleDoc: docId => { closeOnboardingDialog(); this.openSiYuanTarget(docId); },
                    openReview: () => { closeOnboardingDialog(); this.openTabOf(TAB_REVIEW); },
                    onClose: () => this.markOnboarded(),
                },
            });
            closeOnboardingDialog = () => dialog.destroy();
        } catch (e) {
            this.reportDialogOpenFailure(this.i18n.onboardingTitle, e);
        }
    }

    private sampleBusy = false;
    private async createSampleCards(nbId: string): Promise<string | null> {
        if (this.sampleBusy) {
            return null;
        }
        this.sampleBusy = true;
        try {
            return await createOnboardingSampleCards(nbId, this.i18n);
        } finally {
            this.sampleBusy = false;
        }
    }

    private examPlansMutation = createSnapshotMutationQueue<ExamPlansData>(
        () => this.examPlans,
        current => ({ version: 1, plans: current.plans.map(plan => ({ ...plan })) }),
        next => this.persist.save(EXAM_PLANS_DATA, next),
        next => { this.examPlans = next; },
    );

    private mutateExamPlans(mutate: (plans: ExamPlansData) => void): Promise<ExamPlansData> {
        return this.examPlansMutation(mutate);
    }

    subscribeExamPlans(cb: () => void): () => void {
        const handler = () => cb();
        (this.eventBus as any).on(LV_EVENTS.storesChanged, handler);
        return () => (this.eventBus as any).off(LV_EVENTS.storesChanged, handler);
    }

    private persistExamPlansAndNotify(mutate: (plans: ExamPlansData) => void): Promise<ExamPlansData> {
        return persistThenNotify(
            () => this.mutateExamPlans(mutate),
            async () => {
                if (!isKernelPluginRunning(this.kernel.state.code)) return;
                const notice = createExamPlansChangedNotice(this.examPlansSourceID, ++this.examPlansSequence);
                await this.kernel.rpc.call[EXAM_PLANS_PUBLISH_RPC](notice);
            },
            error => lvLog("warn", `[exam-plans-sync] notification failed: ${error instanceof Error ? error.message : String(error)}`),
        );
    }

    saveExamPlan(plan: ExamPlan): Promise<ExamPlansData> {
        return this.persistExamPlansAndNotify(plans => {
            const i = plans.plans.findIndex(x => x.id === plan.id);
            if (i >= 0) plans.plans[i] = plan;
            else plans.plans.push(plan);
        });
    }

    deleteExamPlan(id: string): Promise<ExamPlansData> {
        return this.persistExamPlansAndNotify(plans => {
            plans.plans = plans.plans.filter(plan => plan.id !== id);
        });
    }

    openReviewScope(scopeKind: "all" | "deck" | "notebook", scopeId: string, cram: boolean, entrySourceID = "") {
        const scope = buildReviewScopeKey(scopeKind, scopeId);
        // BI-3：考试报告入口（来源=试卷计划，返回点=Hub 考试页签）
        this.openReviewWithEntry(scope, cram, entrySourceID
            ? { entryKind: "report", sourceID: entrySourceID, returnPoint: "hub:exam" }
            : undefined);
    }

    /** BI-3：记录入口上下文并带 entry 打开复习页签（取消/重开不丢——落盘 + 7 天 TTL） */
    private openReviewWithEntry(scope: string, cram: boolean, entry?: { entryKind: EntryKind; sourceID: string; returnPoint: string }) {
        if (entry && entry.sourceID) {
            upsertContext(this.entryContexts, {
                entryKind: entry.entryKind,
                sourceID: entry.sourceID,
                scopeKey: scope,
                goalID: "",
                returnPoint: entry.returnPoint,
                createdAt: Date.now(),
            });
            this.saveEntryContexts();
        }
        this.openTabOf(TAB_REVIEW, { scope, cram, entry });
    }

    closeMobileHubDialog(): void {
        if (this.mobileHubDialog) {
            try { this.mobileHubDialog.close(); } catch { /* 已销毁 */ }
            this.mobileHubDialog = null;
        }
    }

    closeMobileReviewDialog(): void {
        if (this.mobileReviewDialog) {
            try { this.mobileReviewDialog.close(); } catch { /* 已销毁 */ }
            this.mobileReviewDialog = null;
        }
    }

    public openSiYuanTarget(docOrBlockId: string, zoomIn = false): void {
        if (!docOrBlockId) return;
        this.closeMobileReviewDialog();
        this.closeMobileHubDialog();
        if (this.isMobileHost() && typeof openMobileFileById === "function") {
            openMobileFileById(this.app, docOrBlockId, ["cb-get-focus", "cb-get-hl"] as TProtyleAction[]);
            return;
        }
        openTab({ app: this.app, doc: zoomIn ? { id: docOrBlockId, zoomIn: true } : { id: docOrBlockId } });
    }

    /** BI-3：入口返回点导航（doc:<文档ID> / hub:<Hub 页签>） */
    returnToEntryPoint(returnPoint: string) {
        const target = parseReturnPoint(returnPoint);
        if (target.type === "doc") {
            this.openSiYuanTarget(target.docId);
        } else if (target.type === "hub") {
            this.openTabOf(TAB_DASHBOARD, { tab: target.tab });
        }
    }

    /** 对话框懒加载失败时给出可见反馈，避免入口点击后静默拒绝。 */
    private reportDialogOpenFailure(kind: string, error: unknown): void {
        const detail = error instanceof Error ? error.message : String(error);
        lvLog("error", `[dialog] ${kind} open failed: ${detail}`);
        const prefix = this.i18n.chunkLoadFailedDetail ?? "加载失败";
        showMessage(`${prefix}\n${detail}`, 4000, "error");
    }

    /** AI 制卡向导（M2·FR6-10）：生成回调 + 批次记录落库；initialSource 用于 leech 改写预填 */
    /** T10 修卡演练（docs/13 §12）：独立样例、零网络零写入、进度不迁入真实学习 */
    private async openRepairDrill() {
        try {
            const Drill = await loadRepairDrill();
            svelteDialog(buildRepairDrillDialogArgs(this.i18n, Drill));
        } catch (e) {
            this.reportDialogOpenFailure(this.i18n.drillTitle, e);
        }
    }

    private async openChallenge() {
        try {
            const ChallengeMode = await loadChallengeMode();
            svelteDialog(buildChallengeDialogArgs(this.i18n, ChallengeMode));
        } catch (e) {
            this.reportDialogOpenFailure((this.i18n as any).challenge?.title ?? "challenge", e);
        }
    }

    private async openPairing() {
        try {
            const PairingGame = await loadPairingGame();
            svelteDialog(buildPairingDialogArgs(this.i18n, PairingGame));
        } catch (e) {
            this.reportDialogOpenFailure((this.i18n as any).pairing?.title ?? "pairing", e);
        }
    }

    /** T13 ⌘K 命令面板：入口单实例，加载与宿主销毁均按本次身份收口。 */
    private async openPalette() {
        if (this.paletteState === undefined) return;
        if (this.paletteState) {
            this.paletteState.element?.querySelector<HTMLInputElement>("input")?.focus();
            return;
        }
        const state: NonNullable<typeof this.paletteState> = {};
        this.paletteState = state;
        const release = () => {
            if (this.paletteState === state) this.paletteState = null;
        };
        try {
            const createView = await loadPaletteView();
            if (this.paletteState !== state) return;
            const runners: Record<string, () => void> = {
                review: () => this.openTabOf(TAB_REVIEW),
                cram: () => this.openTabOf(TAB_REVIEW, { cram: true }),
                wizard: () => this.openAIWizard(),
                quick: () => this.openQuickCard(),
                pairing: () => this.openPairing(),
                drill: () => this.openRepairDrill(),
                settings: () => this.openSettingsDialog(),
                imports: () => this.openSettingsDialog(undefined, "imports"),
                overview: () => this.openTabOf(TAB_DASHBOARD),
                manage: () => this.openTabOf(TAB_DASHBOARD, { tab: "manage" }),
                authoring: () => this.openTabOf(TAB_DASHBOARD, { tab: "authoring" }),
                goals: () => this.openTabOf(TAB_DASHBOARD, { tab: "goals" }),
                inbox: () => this.openTabOf(TAB_DASHBOARD, { tab: "inbox" }),
                    exam: () => this.openTabOf(TAB_DASHBOARD, { tab: "exam" }),
                    maintenance: () => this.openTabOf(TAB_DASHBOARD, { tab: "maintenance" }),
                    "dynamic-board": () => this.openOrCreateDynamicBoardDoc(),
                };
            const handle = svelteDialog({
                ...createView({ modules: this.settings.modules, uiMode: this.settings.uiMode, i18n: this.i18n },
                    (cmd: PaletteCommand) => {
                        if (this.paletteState !== state) return;
                        // Release the old trap before another action takes focus.
                        state.close?.();
                        release();
                        runners[cmd.id]?.();
                    }, release),
                callback: release,
            });
            state.close = handle.close;
            state.element = handle.dialog.element;
        } catch (e) {
            if (this.paletteState === state) {
                release();
                this.reportDialogOpenFailure(this.i18n.cmdPalette, e);
            }
        }
    }

    private async createAIWizardView(
        initialSource = "",
        onCreated?: () => void,
        initialSources: { label: string; content: string; docId?: string; nbId?: string; inboxId?: string }[] = [],
        onImportComplete?: (ids: string[]) => void,
        recoveryJobId?: string,
        embedded = false,
    ): Promise<{ Component: any; props: Record<string, any>; mount?: (comp: any, target: HTMLElement, props: Record<string, any>) => { destroy(): void } }> {
        const view: { Component: any; mount?: (comp: any, target: HTMLElement, props: Record<string, any>) => { destroy(): void } } = embedded
            ? await loadAIWizardEmbedded()
            : { Component: await loadAIWizard() };
        const Component = view.Component;
        const recoveryJob = recoveryJobId ? await this.getReviewableAIJob(recoveryJobId) : null;
        if (recoveryJobId && !recoveryJob) {
            throw new Error((this.i18n as any).recoveryCenter?.aiReviewUnavailable ?? "This AI review can no longer be restored safely.");
        }
        return {
            Component,
            ...(view.mount ? { mount: view.mount } : {}),
            props: {
                i18n: this.i18n,
                initialSource,
                initialSources,
                onImportComplete,
                recoveryJob,
                loadCurrentDoc: () => this.loadCurrentDoc(),
                loadNotebookMaterial: (nbId: string) => this.loadNotebookMaterial(nbId),
                loadNotebooks: () => getNotebooks(),
                // T02：来源清单「回源」——按文档 ID 跳回原文档
                openDocById: (docId: string) => {
                    this.openSiYuanTarget(docId);
                },
                // AQ-14：signal 随调用传入——向导关闭/换源/重生取消后，晚到响应不写回、不触发 fallback
                // ADR-7 第 3 步：生成阶段入账作业生命周期（drafting→generating→reviewing / failed/canceled）
                generate: async (source: string, cfg: { count: number; language: string; type: "qa" | "cloze" }, opts?: { signal?: AbortSignal; provenance?: { notebookIds?: string[]; docIds?: string[] } }) => {
                    // BU-24（v0.196.0）：月度 token 预算——超限在组装 prompt 前阻断（fallback 不会启动，绝不偷换端点）
                    const budget = budgetState(this.costLedger, {
                        enabled: this.settings.aiCostBudgetEnabled,
                        monthlyTokenCap: this.settings.aiCostMonthlyCap,
                    });
                    // BW-9（v0.190.0）：来源级禁止外发——来源 provenance 任一命中 deny 规则即阻断（组装 prompt 前）
                    const prov = opts?.provenance;
                    const denyHit = [
                        ...(prov?.docIds ?? []).map(docId => ({ docId })),
                        ...(prov?.notebookIds ?? []).map(notebookId => ({ notebookId })),
                    ].map(p => isDenied(this.aiDenyList, p)).some(v => v.denied);
                    // BU-33（v0.172.0）：组装 prompt 前的前置检查（阻断+给手工/本地替代；不把环境失败归因模型质量）
                    const elig = checkEligibility({
                        hasMaterial: source.trim().length > 0,
                        // siyuan 模式由内核网关管理视为已配置；custom 模式需端点+密钥
                        aiConfigured: this.settings.aiMode === "siyuan" || Boolean(this.settings.aiEndpoint && this.settings.aiKey),
                        online: typeof navigator !== "undefined" ? navigator.onLine : undefined,
                        // BW-9：deny 规则 = eligibility sensitive 事实源（BL-5 deny 名单的落地形态）
                        sensitive: denyHit,
                        // BU-24：月度预算超限 = eligibility costExceeded 事实源（BU-33 预留位落地）
                        costExceeded: budget.exceeded,
                    });
                    if (!elig.ok) {
                        const e = (this.i18n as any).aiElig;
                        const b = elig.block!;
                        throw new Error(`${e[b.reason]} ${e.alt[b.reason]}`);
                    }
                    // BU-31（v0.173.0）：紧急停用/撤销同意前置（总闸优先；provider/model/task 目标粒度）
                    const killReason = killSwitchBlock(this.killSwitch, [...this.aiProviderTargets(), "task:cards-generate"]);
                    if (killReason) {
                        const e = (this.i18n as any).aiKill;
                        throw new Error(killReason === "consent-revoked" ? e.consentRevoked : e.targetDisabled);
                    }
                    // BU-35（v0.171.0）：提示组装收编流水线单一入口（模板解析/围栏/隔离条款/预算/审计）
                    const assembled = assembleGeneratePrompt({
                        task: "cards-generate",
                        customTemplate: this.settings.aiPromptTemplate,
                        defaultSystem: this.i18n.aiSystemPrompt,
                        userTemplate: this.i18n.aiUserPrompt,
                        source,
                        cfg,
                        typeClozeHint: this.i18n.aiTypeClozeHint,
                        typeQaHint: this.i18n.aiTypeQaHint,
                        guardClause: (this.i18n as any).aiInjectionGuard,
                        untrustedLabel: (this.i18n as any).aiUntrustedLabel,
                        // BU-18：custom 模式按登记模型收紧预算（siyuan 模式模型由内核管理，不判）
                        modelId: this.settings.aiMode === "custom" ? this.settings.aiModel : "",
                    });
                    const { system, user } = assembled;
                    // AuditSink（lvLog）：仅非敏感字段（task/模板来源/token 数/写入目标）
                    lvLog("info", "[ai-pipeline] " + assembled.audit.modelId);
                    if (assembled.needsBatching) {
                        throw new Error(this.i18n.aiTooLong);
                    }
                    const jobId = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
                    let job = createJob(jobId, { type: this.settings.aiMode, label: source.slice(0, 50), excerpt: source.slice(0, 200) }, cfg);
                    job = transitionJob(job, { type: "GENERATE_START" }).job;
                    const beforeJobStart = normalizeAIJobs(cloneStore(this.aiJobs));
                    this.upsertAIJob(job);
                    await this.persistAIJobs(beforeJobStart);
                    let fallbackNotified = false;
                    try {
                        const raw = await aiChat(
                            {
                                mode: this.settings.aiMode,
                                endpoint: this.settings.aiEndpoint,
                                apiKey: this.settings.aiKey,
                                model: this.settings.aiModel,
                                fallbackEndpoint: this.settings.aiFallbackEndpoint || undefined,
                                fallbackApiKey: this.settings.aiFallbackKey || undefined,
                                fallbackModel: this.settings.aiFallbackModel || undefined,
                            },
                            system, user,
                            {
                                signal: opts?.signal,
                                onProvider: p => {
                                    if (p === "fallback" && !fallbackNotified) {
                                        fallbackNotified = true;
                                        // BU-28：呈现实际降级路径 + 费用提示（不做静默 fallback）
                                        const deg = (this.i18n as any).aiDegrad;
                                        showMessage(`${deg.usedFallback}（${deg.mayCost}）`, 3000, "info");
                                    }
                                },
                            },
                        );
                        // BU-11：非 JSON 输出（典型=模型拒答文本）不得透传原始 SyntaxError——
                        // 与空响应同走「格式失败」拒答呈现（审计 F-6：拒答文本曾泄漏 JSON 异常）
                        let parsed: ReturnType<typeof parseCards>;
                        let parseFailedDetail = "";
                        try {
                            parsed = parseCards(raw).slice(0, cfg.count);
                        } catch {
                            parsed = [];
                            parseFailedDetail = raw.slice(0, 60);
                        }
                        if (parsed.length === 0) {
                            // BU-11：空响应/不可解析按「格式失败」拒答呈现（可读原因 + 有序下一步，不偷偷重试/换端点）
                            const refusal = evaluateRefusal({ "format-failure": parseFailedDetail || "empty" });
                            const dict = (this.i18n as any).aiRefusal;
                            const parts = [
                                dict?.kind?.[refusal.kind] ?? (this.i18n as any).aiWizard?.emptyResult ?? "AI returned no cards",
                                ...refusal.nextKeys.map(k => dict?.next?.[k.replace("aiRefusal.next.", "")]).filter(Boolean),
                            ];
                            throw new Error(parts.join("；"));
                        }
                        job = transitionJob(job, {
                            type: "GENERATE_OK",
                            candidates: parsed.map(c => ({ q: c.q, a: c.a, d: c.d, keep: true, status: "pending" as const })),
                        }).job;
                        const beforeJobReady = normalizeAIJobs(cloneStore(this.aiJobs));
                        this.upsertAIJob(job);
                        await this.persistAIJobs(beforeJobReady);
                        // 批次元数据（质量反哺数据源，P2 消费）；tokens 供消耗历史（299）
                        // BU-19：批次 pin——生成环境快照落盘（modelId/templateHash/来源 hash，均指纹不含密钥与原文）
                        const previousBatches = normalizeAIBatches(cloneStore(this.aiBatches));
                        const batchesVersion = ++this.aiBatchesMutationVersion;
                        this.aiBatches.batches.push({
                            id: `ai-${Date.now().toString(36)}`,
                            date: todayDate(),
                            deckID: "",
                            blockIDs: [],
                            tokens: estimateTokens(system) + estimateTokens(user) + estimateTokens(raw),
                            pin: {
                                mode: this.settings.aiMode,
                                modelId: assembled.audit.modelId,
                                templateHash: fnv1a(system),
                                sourceHash: fnv1a(source),
                                pinnedAt: Date.now(),
                            },
                        });
                        if (this.aiBatches.batches.length > 200) {
                            this.aiBatches.batches = this.aiBatches.batches.slice(-200);
                        }
                        const batchesSnapshot = cloneStore(this.aiBatches);
                        try {
                            await this.persist.save(AI_BATCHES_DATA, batchesSnapshot);
                            if (batchesVersion === this.aiBatchesMutationVersion) {
                                this.persistedAIBatchesSnapshot = cloneStore(batchesSnapshot);
                            }
                        } catch {
                            if (batchesVersion === this.aiBatchesMutationVersion) {
                                this.aiBatches = cloneStore(this.persistedAIBatchesSnapshot ?? previousBatches);
                            }
                            this.showStorageFail();
                        }
                        // BU-25（v0.196.0）：用量入账（估算显式标记；价格未知=null 不编数字；不含 key 与原文）
                        const tokensIn = estimateTokens(system) + estimateTokens(user);
                        const tokensOut = estimateTokens(raw);
                        const previousCostLedger = normalizeCostLedger(cloneStore(this.costLedger));
                        const costVersion = ++this.costLedgerMutationVersion;
                        const nextCostLedger = recordEntry(this.costLedger, {
                            at: Date.now(),
                            task: "cards-generate",
                            mode: this.settings.aiMode,
                            modelId: assembled.audit.modelId,
                            tokens: tokensIn + tokensOut,
                            est: true,
                            costUsd: assembled.audit.modelId
                                ? estimateCallCostUsd(assembled.audit.modelId, tokensIn, tokensOut)
                                : null,
                            algorithm: "chars/4",
                            priceVersion: MODEL_PRICE_SNAPSHOT,
                        });
                        this.costLedger = nextCostLedger;
                        const costSnapshot = cloneStore(nextCostLedger);
                        try {
                            await this.persist.save(AI_COST_LEDGER_DATA, costSnapshot);
                            if (costVersion === this.costLedgerMutationVersion) {
                                this.persistedCostLedgerSnapshot = cloneStore(costSnapshot);
                            }
                        } catch {
                            if (costVersion === this.costLedgerMutationVersion) {
                                this.costLedger = cloneStore(this.persistedCostLedgerSnapshot ?? previousCostLedger);
                            }
                            this.showStorageFail();
                        }
                        // BU-24：预算预警（80% 阈值，到顶前提醒；超限已在下一轮请求前置阻断）
                        if (budgetState(this.costLedger, { enabled: this.settings.aiCostBudgetEnabled, monthlyTokenCap: this.settings.aiCostMonthlyCap }).warn) {
                            showMessage((this.i18n as any).aiCost?.warn ?? "AI cost budget warning", 3000, "info");
                        }
                        // BU-15：生成环境快照随结果返回（mode/modelId/templateHash；不含 key），向导记入版本链
                        return {
                            cards: parsed,
                            jobId,
                            gen: {
                                mode: this.settings.aiMode,
                                modelId: assembled.audit.modelId,
                                templateHash: fnv1a(system),
                            },
                        };
                    } catch (e) {
                        // 取消与失败都落账：取消记 CANCEL，失败记 GENERATE_FAIL——重开向导可续传
                        job = transitionJob(job, isAICanceled(e)
                            ? { type: "CANCEL" }
                            : { type: "GENERATE_FAIL", error: e instanceof Error ? e.message : String(e) }).job;
                        this.upsertAIJob(job);
                        const failedJobSnapshot = cloneStore(this.aiJobs);
                        const failedJobVersion = this.aiJobsMutationVersion;
                        await this.persist.save(AI_JOBS_DATA, failedJobSnapshot).then(() => {
                            if (failedJobVersion === this.aiJobsMutationVersion) {
                                this.persistedAIJobsSnapshot = cloneStore(failedJobSnapshot);
                            }
                        }).catch(() => { /* onFail 已记录 */ });
                        throw e;
                    }
                },
                onCreate: async (cards: { q: string; a: string; origIndex: number }[], deckID: string, deckName: string, jobId: string, sourceMeta?: { docId?: string; label?: string }) => {
                    const r = await this.createAICards(cards, deckID, deckName, jobId, sourceMeta);
                    // BI-4：收件箱制卡成功回调（清收件箱 + 记内容生命周期，失败不影响制卡结果）
                    if (onCreated) {
                        try {
                            onCreated();
                        } catch { /* 清理旁路 */ }
                    }
                    return r;
                },
                // ADR-7 恢复入口：上次导入中断的续传/放弃
                getUnfinishedJob: () => this.getUnfinishedAIJob(),
                // BW-9：来源级禁止外发——载入前拦截 + 来源条目一键登记（规则落 ai-deny-list.json）
                isSourceDenied: (kind: "doc" | "notebook", id: string) =>
                    isDenied(this.aiDenyList, kind === "doc" ? { docId: id } : { notebookId: id }).denied,
                onDenySource: (kind: "doc" | "notebook", id: string) => {
                    const previous = normalizeDenyList(cloneStore(this.aiDenyList));
                    const next = addDenyRule(this.aiDenyList, kind, id, Date.now());
                    const version = ++this.aiDenyMutationVersion;
                    this.aiDenyList = next;
                    void this.persist.save(AI_DENY_LIST_DATA, next).then(() => {
                        this.persistedAIDenyListSnapshot = cloneStore(next);
                        lvLog("info", `[ai-deny] +${kind}:${id}`);
                        showMessage((this.i18n as any).aiWizard.deniedToast, 3000, "info");
                    }).catch(() => {
                        if (version === this.aiDenyMutationVersion) {
                            this.aiDenyList = cloneStore(this.persistedAIDenyListSnapshot ?? previous);
                        }
                        this.showStorageFail();
                    });
                },
                // BU-8：自定义敏感词（逗号分隔，仅本地）
                sensitiveTerms: this.settings.aiSensitiveTerms,
                // BU-14：模型可信度——siyuan 内核网关视为已配置；custom 模式按注册表登记状态
                modelTrustKnown: () => this.settings.aiMode === "siyuan" || isSelectableModel(this.settings.aiModel),
                // BU-36：上下文包预览——组装纯函数零网络，返回分层预算报告供发送前展示
                previewBudget: (source: string, cfg: { count: number; language: string; type: "qa" | "cloze" }) => {
                    return buildBudgetPreview({
                        source,
                        cfg,
                        promptTemplate: this.settings.aiPromptTemplate,
                        aiMode: this.settings.aiMode,
                        aiModel: this.settings.aiModel,
                        i18n: this.i18n,
                    });
                },
                onClose: noop,
            },
        };
    }

    private async openAIWizard(initialSource = "", onCreated?: () => void) {
        try {
            const mobile = this.isMobileHost();
            const view = await this.createAIWizardView(initialSource, onCreated);
            let unbindVv: (() => void) | null = null;
            let closeWizardDialog = () => {};
            const baseOpenDocById = view.props.openDocById;
            view.props.openDocById = (docId: string) => {
                closeWizardDialog();
                baseOpenDocById?.(docId);
            };
            const { dialog } = svelteDialog({
                title: this.i18n.aiWizardTitle,
                component: view.Component,
                // T03：候选审核需要来源/编辑/卡面对照空间，加宽至 860；手机端全屏自适应 visualViewport
                width: mobile ? "100vw" : "min(860px, 94vw)",
                height: mobile ? "100dvh" : undefined,
                props: view.props,
                callback: () => {
                    unbindVv?.();
                    unbindVv = null;
                },
            });
            closeWizardDialog = () => dialog.destroy();
            if (mobile) {
                dialog.element.classList.add("lv-mobile-sheet-dialog");
                dialog.element.querySelector(".b3-dialog")?.classList.add("lv-mobile-sheet-dialog");
                unbindVv = bindMobileVisualViewport(dialog.element);
            }
        } catch (e) {
            this.reportDialogOpenFailure(this.i18n.aiWizardTitle, e);
        }
    }

    /** ADR-7 第 3 步：逐卡提交 + 断点记录——每卡 appendBlock+入组成功即持久化，中断续传只处理 pending */
    private async createAICards(cards: { q: string; a: string; origIndex: number }[], deckID: string, _deckName: string, jobId: string, sourceMeta?: { docId?: string; label?: string }) {
        const operationID = jobId || `cards:${deckID}:${cards.map(card => card.origIndex).join(",")}`;
        const existing = this.aiCommitFlights.get(operationID);
        if (existing) return existing;
        const operation = this.createAICardsOnce(cards, deckID, _deckName, jobId, sourceMeta);
        this.aiCommitFlights.set(operationID, operation);
        operation.finally(() => {
            if (this.aiCommitFlights.get(operationID) === operation) this.aiCommitFlights.delete(operationID);
        }).catch(() => { /* 原始 Promise 负责把错误交给调用方 */ });
        return operation;
    }

    private async createAICardsOnce(cards: { q: string; a: string; origIndex: number }[], deckID: string, _deckName: string, jobId: string, sourceMeta?: { docId?: string; label?: string }) {
        const qualityIssues = findAiCardGateIssues(cards);
        if (qualityIssues.some(issues => issues.length > 0)) {
            throw new Error((this.i18n as any).aiWizard.qualityBlocked);
        }
        try {
            for (const card of cards) serializeQaCard(card.q, card.a);
        } catch {
            throw new Error((this.i18n as any).aiWizard.invalidDraft);
        }
        const nb = await this.targetNotebook();
        if (!nb) {
            throw new Error(this.i18n.onboardingNoNotebook);
        }
        let job: AIJob | undefined = jobId ? this.aiJobs.jobs.find(j => j.id === jobId) : undefined;
        const date = todayDate();
        let docID = job?.targetDocID;
        if (!docID) {
            docID = (await createDocWithMd(nb.id, `/小驴闪卡/AI 制卡/${date}`, "")) ?? undefined;
            if (!docID) {
                throw new Error(this.i18n.quickCardFail);
            }
            // 稍作缓冲，确保新文档元数据在 SQLite 与内存中完全就绪
            await new Promise(r => setTimeout(r, 120));
        }
        if (job) {
            if (job.targetDocID !== docID) {
                job = { ...job, targetDocID: docID };
                this.upsertAIJob(job);
                await this.persistAIJobsOnce(`${job.id}:doc:${docID}`);
            }
            job = transitionJob(job, { type: "COMMIT_START", deckID }).job;
            this.upsertAIJob(job);
            await this.persistAIJobsOnce(`${job.id}:commit-start:${deckID}`);
        }
        const blockIDs: string[] = [];
        await withDocLock(docID, async () => {
            for (const card of cards) {
                // 断点恢复只处理 pending 候选；已创建候选保留原 blockID，
                // 避免重试/双击在内核中生成重复卡片。
                const candidate = job?.candidates[card.origIndex];
                if (candidate?.status === "created" && candidate.blockID) {
                    blockIDs.push(candidate.blockID);
                    await this.rememberSourceFingerprint(candidate.blockID, docID);
                    continue;
                }
                // 写入前先按作业+候选稳定标记查找。若内核写成功后进程在记账前崩溃，
                // 重试会复用原块而不是再造一张重复卡；标记是 HTML 注释，不会出现在卡面。
                const marker = buildAiCardMarker(job?.id, card.origIndex);
                let blockID = "";
                if (marker) {
                    try {
                        const escapedDoc = docID.replace(/'/g, "''");
                        const escapedMarker = marker.replace(/'/g, "''");
                        const rows = await sqlQuery(`SELECT id FROM blocks WHERE root_id='${escapedDoc}' AND markdown LIKE '%${escapedMarker}%' LIMIT 1`);
                        blockID = String(rows[0]?.id ?? "");
                    } catch {
                        // 查询不可用时仍允许继续写入；成功后候选状态会阻止同一进程内重复。
                    }
                }
                let cardMarkdown = buildAiCardBlockMarkdown(card.q, card.a, marker);
                if (sourceMeta?.docId) {
                    const cleanLabel = (sourceMeta.label || "原笔记").replace(/["\n\r]/g, " ").trim();
                    cardMarkdown += `\n\n> 来源：(( ${sourceMeta.docId} "${cleanLabel}" ))`;
                }
                if (!blockID) {
                    const ids = await appendBlock("markdown", cardMarkdown, docID);
                    blockID = ids[0] ?? "";
                }
                if (!blockID) throw new Error(this.i18n.quickCardFail);
                blockIDs.push(blockID);
                if (sourceMeta?.docId) {
                    void setBlockAttrs(blockID, {
                        "custom-lv-source-doc": sourceMeta.docId,
                    }).catch(() => {});
                }
                // 微小缓冲，避免连续高频写锁造成内核 SQLite 元数据未就绪
                await new Promise(r => setTimeout(r, 60));
                // ADR-7：逐卡入组成功即记账（单卡批），origIndex 指向作业 candidates 原位（✕ 移除后仍正确）
                await addRiffCards(deckID, [blockID]);
                await this.rememberSourceFingerprint(blockID, docID, cardMarkdown);
                if (job) {
                    const r = transitionJob(job, { type: "CARD_CREATED", index: card.origIndex, blockID });
                    if (r.ok) {
                        job = r.job;
                        this.upsertAIJob(job);
                        await this.persistAIJobsOnce(`${job.id}:card:${card.origIndex}:${blockID}`);
                    }
                }
            }
        });
        // 未勾选/被移除的候选记 CARD_SKIPPED，使 COMMIT_DONE 可通过（保留勾选但未导入的语义留痕）
        if (job) {
            for (let idx = 0; idx < job.candidates.length; idx++) {
                if (job.candidates[idx].status === "pending") {
                    const r = transitionJob(job, { type: "CARD_SKIPPED", index: idx });
                    if (r.ok) { job = r.job; }
                }
            }
            this.upsertAIJob(job);
            await this.persistAIJobsOnce(`${job.id}:skipped`);
            const done = transitionJob(job, { type: "COMMIT_DONE" });
            if (done.ok) {
                job = done.job;
                this.upsertAIJob(job);
                await this.persistAIJobsOnce(`${job.id}:done`);
            }
        }
        // docs/14 §8：cards-created 事件从「预留」转正（ADR-7 落地后有了确定 payload）
        // AT-4：新卡即时到期，共享 due 缓存同步失效
        invalidateDueCache();
        try {
            (this.eventBus as any).emit(LV_EVENTS.cardsCreated, cardsCreatedEvent({
                deckID, count: blockIDs.length, blockIDs,
            }));
        } catch { /* 事件旁路 */ }
        notifyBatchCardCreation(this.i18n.deckAdded.replace("${n}", String(blockIDs.length)));
    }

    /** Replace one job snapshot in-place; duplicated IDs make recovery read stale state. */
    private upsertAIJob(job: AIJob) {
        this.aiJobsMutationVersion += 1;
        this.aiJobs.jobs = pruneJobs([...this.aiJobs.jobs.filter(existing => existing.id !== job.id), job]);
    }

    /** 持久化作业快照；失败时恢复调用前的完整作业列表，避免恢复页读到假成功。 */
    private async persistAIJobs(previous: AIJobsData): Promise<void> {
        const version = this.aiJobsMutationVersion;
        const next = cloneStore(this.aiJobs);
        try {
            await this.persist.save(AI_JOBS_DATA, next);
            this.persistedAIJobsSnapshot = cloneStore(next);
        } catch (error) {
            if (version === this.aiJobsMutationVersion) {
                this.aiJobs = cloneStore(this.persistedAIJobsSnapshot ?? previous);
            }
            throw error;
        }
    }

    /** Persist one idempotent job checkpoint and advance the rollback baseline only
     * after the write has actually succeeded. */
    private async persistAIJobsOnce(operationId: string): Promise<void> {
        const next = cloneStore(this.aiJobs);
        const version = this.aiJobsMutationVersion;
        try {
            await this.persist.saveOnce(AI_JOBS_DATA, operationId, next);
            this.persistedAIJobsSnapshot = cloneStore(next);
        } catch (error) {
            if (version === this.aiJobsMutationVersion && this.persistedAIJobsSnapshot) {
                this.aiJobs = cloneStore(this.persistedAIJobsSnapshot);
            }
            throw error;
        }
    }

    /** ADR-7：只提示写入阶段的未完成作业，恢复页负责安全核对或审核恢复。 */
    private getUnfinishedAIJob(): { id: string; done: number; total: number; failed: { index: number; q: string; error: string }[] } | null {
        return findUnfinishedAIJob(this.aiJobs.jobs);
    }

    private async getReviewableAIJob(jobId: string) {
        const job = this.aiJobs.jobs.find(item => item.id === jobId);
        if (!job) return null;
        const prepared = prepareReviewableJob(job, this.i18n.unknown);
        if (!prepared) return null;
        if (prepared.resumed) {
            this.upsertAIJob(prepared.job);
            await this.persistAIJobs(this.persistedAIJobsSnapshot ?? this.aiJobs);
        }
        return prepared.view;
    }

    /** Summary only; raw candidate text stays in the AI wizard. */
    getRecoverableAIJobs(): {
        id: string; status: string; pending: number; failed: number; created: number; source: string;
        canReview: boolean; needsWriteCheck: boolean; deckID: string;
    }[] {
        return getRecoverableJobSummaries(this.aiJobs.jobs, this.i18n.unknown);
    }

    /** 原生事件幂等去重（AQ-5）：eventId / cardID+1s 时间窗 */
    private nativeDeduper = new NativeEventDeduper();

    /** 思源文档编辑 WebSocket 事件防抖同步（TODO-L1）：在思源编辑器中修改文档或块时，防抖 1.5s 通知插件静默刷新 */
    private onWsMain = (event: CustomEvent<any>) => {
        try {
            const cmd = event?.detail?.cmd;
            if (cmd === "transactions" || cmd === "savedoc" || cmd === "syncMergeResult") {
                if (this.docSyncTimer) {
                    clearTimeout(this.docSyncTimer);
                }
                this.docSyncTimer = setTimeout(() => {
                    this.docSyncTimer = null;
                    try {
                        invalidateDueCache();
                        this.refreshDueBadge();
                        (this.eventBus as any).emit(LV_EVENTS.storesChanged, storesChangedEvent());
                    } catch {
                        // 旁路通知，异常不抛出
                    }
                }, 1500);
            }
        } catch {
            // 防御外部事件结构变动
        }
    };

    private onNativeCardAction = (event: CustomEvent) => {
        try {
            const normalized = normalizeNativeCardAction(event?.detail, Date.now());
            // 非法评分（5、-1、2.5）或缺卡 ID：丢弃并进诊断，不产生脏 revlog
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
        } catch {
            // 统计属于旁路功能，绝不影响主流程
        }
    };

    private appendRevlog(entry: Omit<RevlogEntry, "ts"> & { ts?: number }) {
        if (!this.persistedRevlogSnapshot) {
            this.persistedRevlogSnapshot = cloneStore(this.revlog);
        }
        this.revlogMutationVersion += 1;
        const today = todayDate();
        const prevCount = this.revlog.days[today]?.review ?? 0;
        const streakBefore = calcStreak(this.revlog);
        appendRevlog(this.revlog, { ts: entry.ts ?? Date.now(), ...entry } as RevlogEntry);
        const streakAfter = calcStreak(this.revlog);
        this.scheduleRevlogSave();
        const entryBlockID = entry.blockID;
        if (entryBlockID) {
            const { lapsesMap } = this.getRevlogBlockIndex();
            const lapses = lapsesMap[entryBlockID] ?? 0;
            const threshold = this.settings.leechThreshold || DEFAULT_LEECH_THRESHOLD;
            if (lapses >= threshold) {
                void setBlockAttrs(entryBlockID, buildLeechAttrs(true, lapses)).catch(() => {});
            }
        }
        // AT-4：评分事实先失效共享 due 缓存（插件/原生两路都经此漏斗），badge/总览下一次读取即拉新
        invalidateDueCache();
        this.refreshDueBadge();
        // M8·FR1：目标跨越庆祝；M11·FR1：生态事件广播
        const target = this.settings.dailyReviewTarget;
        if (target > 0 && prevCount < target && (this.revlog.days[today]?.review ?? 0) >= target && !this.inQuietHours()) {
            showMessage(this.i18n.dailyTargetReached, 3000, "info");
        }
        try {
            (this.eventBus as any).emit(LV_EVENTS.reviewed, reviewedEvent({
                cardID: entry.cardID, deckID: entry.deckID, blockID: entry.blockID,
                rating: entry.rating, source: entry.source,
            }));
            if (streakAfter !== streakBefore) {
                (this.eventBus as any).emit(LV_EVENTS.streakChanged, streakChangedEvent(streakAfter));
            }
            dispatchCardReviewedEvent({
                cardID: entry.cardID,
                deckID: entry.deckID,
                blockID: entry.blockID,
                rating: entry.rating,
                source: entry.source,
                ts: entry.ts,
            });
        } catch { /* 事件旁路 */ }
    }

    public rollbackRevlog(cardID?: string): RevlogEntry | null {
        if (!this.persistedRevlogSnapshot) {
            this.persistedRevlogSnapshot = cloneStore(this.revlog);
        }
        this.revlogMutationVersion += 1;
        const removed = rollbackLastRevlogEntry(this.revlog, cardID);
        if (removed) {
            this.scheduleRevlogSave();
            invalidateDueCache();
            this.refreshDueBadge();
        }
        return removed;
    }

    private scheduleRevlogSave() {
        if (this.saveRevlogTimer) {
            clearTimeout(this.saveRevlogTimer);
        }
        this.saveRevlogTimer = setTimeout(() => this.flushRevlogSave(), 2000);
    }

    private flushRevlogSave() {
        if (this.saveRevlogTimer) {
            clearTimeout(this.saveRevlogTimer);
            this.saveRevlogTimer = null;
        }
        // AQ-4：重试与失败记录统一由 persist 队列承担。若最终失败，
        // 只有在写入期间没有产生新评分时才恢复快照，避免覆盖更新的运行态。
        const version = this.revlogMutationVersion;
        const next = cloneStore(this.revlog);
        this.persist.save(REVLOG_DATA, next).then(() => {
            this.persistedRevlogSnapshot = next;
        }).catch(() => {
            if (version === this.revlogMutationVersion) {
                this.revlog = cloneStore(this.persistedRevlogSnapshot ?? next);
                this.refreshDueBadge();
                this.showStorageFail();
            }
        });
    }

    /** BK-1/BK-2：知识对象/关系图的落盘入口（未来 UI 修改后调用；persist 队列承担重试与失败记录） */
    saveKnowledgeObjects() {
        return this.persist.save(KNOWLEDGE_OBJECTS_DATA, cloneStore(this.knowledgeObjects)).catch(() => { /* onFail 已记录 */ });
    }

    saveCardRelations() {
        return this.persist.save(CARD_RELATIONS_DATA, cloneStore(this.cardRelations)).catch(() => { /* onFail 已记录 */ });
    }

    /** BJ-4：遗忘卡错误原因标注（旁路增强；同步写入思源块属性 custom-lv-error-reason） */
    tagErrorReason(cardID: string, reason: ErrorReason, blockID?: string) {
        const previous = cloneStore(this.persistedErrorTagsSnapshot ?? normalizeErrorTags(cloneStore(this.errorTags)));
        if (tagError(this.errorTags, cardID, reason, todayDate())) {
            const version = ++this.errorTagMutationVersion;
            const next = cloneStore(this.errorTags);
            void this.persist.save(ERROR_TAGS_DATA, next).then(() => {
                this.persistedErrorTagsSnapshot = cloneStore(next);
            }).catch(() => {
                if (version === this.errorTagMutationVersion) this.errorTags = cloneStore(this.persistedErrorTagsSnapshot ?? previous);
                this.showStorageFail();
            });
            const targetBlockID = blockID || (this.revlog.entries.slice().reverse().find(e => e.cardID === cardID)?.blockID);
            if (targetBlockID) {
                void setBlockAttrs(targetBlockID, buildErrorReasonAttrs(reason)).catch(() => {});
            }
        }
    }

    /** BI-4：材料收件箱落盘入口（未来筛选 UI 修改后调用；persist 队列承担重试与失败记录） */
    saveInbox() {
        const next = cloneStore(this.inbox);
        return this.persist.save(INBOX_DATA, next).then(() => {
            this.persistedInboxSnapshot = cloneStore(next);
        }).catch(() => { /* onFail 已记录 */ });
    }

    /** 收件箱允许乐观更新，但写入失败必须恢复完整快照，避免 UI 与磁盘分叉。 */
    private mutateInbox(mutate: (next: InboxData) => number | boolean | void): void {
        // Always roll back to the last confirmed disk snapshot. Using the
        // current in-memory value here would preserve an earlier failed
        // optimistic mutation after two writes overlap.
        const previous = cloneStore(this.persistedInboxSnapshot ?? normalizeInbox(cloneStore(this.inbox)));
        const changed = mutate(this.inbox);
        if (changed === false || changed === 0) return;
        const version = ++this.inboxMutationVersion;
        this.notifyInboxChanged();
        const next = cloneStore(this.inbox);
        void this.persist.save(INBOX_DATA, next).then(() => {
            this.persistedInboxSnapshot = cloneStore(next);
        }).catch(() => {
            if (version === this.inboxMutationVersion) {
                this.inbox = previous;
                this.notifyInboxChanged();
            }
            this.showStorageFail();
        });
    }

    /** BI-4：收件箱变更监听（BX-10：块菜单收集等外部变更通知 Hub 收件箱页自动刷新） */
    private inboxListeners = new Set<() => void>();

    subscribeInbox(cb: () => void): () => void {
        this.inboxListeners.add(cb);
        return () => this.inboxListeners.delete(cb);
    }

    private notifyInboxChanged() {
        for (const cb of this.inboxListeners) {
            try {
                cb();
            } catch { /* 监听器旁路 */ }
        }
    }

    /** BI-4：块菜单收集入口（返回新增数；已存在的不重复计） */
    addInboxItems(blockIDs: string[]): number {
        let added = 0;
        this.mutateInbox(inbox => {
            for (const id of blockIDs) {
                if (addInboxItem(inbox, id)) added++;
            }
            return added;
        });
        return added;
    }

    /** BI-4：收件箱材料送入 Hub 向导时保留块与文档身份，便于来源审核和禁止外发规则生效。 */
    async loadInboxSources(blockIDs: string[]) {
        if (blockIDs.length === 0) return [];
        const ids = blockIDs.map(id => `'${id.replace(/'/g, "''")}'`).join(",");
        const rows = await sqlQuery(`SELECT id, type, content, root_id FROM blocks WHERE id IN (${ids})`);
        const byID = new Map(rows.map(r => [String(r.id), {
            type: String(r.type ?? ""),
            content: String(r.content ?? "").trim(),
            rootID: String(r.root_id ?? ""),
        }]));
        for (const [id, item] of byID) {
            if (item.type === "d") item.content = (await exportMdContent(id)).content;
        }
        return blockIDs.flatMap(id => {
            const item = byID.get(id);
            if (!item?.content) return [];
            const label = item.content.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim().slice(0, 40) || id.slice(0, 8);
            return [{ label, content: item.content, docId: item.rootID || undefined, inboxId: id }];
        });
    }

    /** 只有候选成功写入后才把对应来源从收件箱移出。 */
    completeInboxCards(blockIDs: string[]) {
        const unique = [...new Set(blockIDs.filter(Boolean))];
        if (unique.length === 0) return;
        this.mutateInbox(inbox => {
            let changed = 0;
            for (const id of unique) if (removeInboxItem(inbox, id)) changed++;
            return changed;
        });
        for (const id of unique) {
            void this.transitionContentState(id, "candidate", "收件箱入选")
                .then(() => this.transitionContentState(id, "reviewed", "向导逐张确认"))
                .then(() => this.transitionContentState(id, "stocked", "制卡入库"))
                .catch(() => { /* 生命周期旁路失败由持久化错误提示承接 */ });
        }
    }

    /** BI-1/BI-3/BI-5：学习旅程三存储的落盘入口（未来 UI 修改后调用；persist 队列承担重试与失败记录） */
    saveLearningGoals() {
        return this.persist.save(LEARNING_GOALS_DATA, cloneStore(this.learningGoals)).catch(() => { /* onFail 已记录 */ });
    }

    saveEntryContexts() {
        return this.persist.save(ENTRY_CONTEXTS_DATA, cloneStore(this.entryContexts)).catch(() => { /* onFail 已记录 */ });
    }

    saveContentLifecycles() {
        return this.persist.save(CONTENT_LIFECYCLES_DATA, cloneStore(this.contentLifecycles)).catch(() => { /* onFail 已记录 */ });
    }

    /** BU-31：紧急停用状态落盘 */
    saveKillSwitch() {
        return this.persist.save(AI_KILL_SWITCH_DATA, cloneStore(this.killSwitch)).catch(() => { /* onFail 已记录 */ });
    }

    /** AI 安全开关采用“新快照先落盘、成功后发布”的原子写入口。 */
    private async mutateKillSwitch(mutate: (next: AIKillSwitchData) => void): Promise<AIKillSwitchData> {
        const operation = this.killSwitchMutationQueue.then(async () => {
            const previous = cloneStore(this.killSwitch);
            const next = normalizeKillSwitch(cloneStore(this.killSwitch));
            mutate(next);
            try {
                await this.persist.save(AI_KILL_SWITCH_DATA, next);
                this.killSwitch = next;
                return this.killSwitch;
            } catch (error) {
                // Persist-first means the live state has not changed yet; keep
                // the last committed value even when a prior caller mutated it.
                this.killSwitch = previous;
                throw error;
            }
        });
        this.killSwitchMutationQueue = operation.then(() => undefined, () => undefined);
        return operation;
    }

    /** BU-31：当前 provider/model 目标键（紧急停用粒度） */
    private aiProviderTargets(): string[] {
        const targets = [`provider:${this.settings.aiMode}:${this.settings.aiMode === "custom" ? this.settings.aiEndpoint : "siyuan"}`];
        if (this.settings.aiModel) targets.push(`model:${this.settings.aiModel}`);
        return targets;
    }

    /** BU-31：清理待发队列（活动态作业 → canceled；验收「清理待发队列」） */
    private cancelPendingAiJobs(): number {
        const result = cancelAllActiveJobs(this.aiJobs.jobs);
        if (result.modified) {
            this.aiJobs.jobs = result.jobs;
            const version = this.aiJobsMutationVersion;
            const next = cloneStore(this.aiJobs);
            this.persist.save(AI_JOBS_DATA, next).then(() => {
                this.persistedAIJobsSnapshot = cloneStore(next);
            }).catch(() => {
                if (version === this.aiJobsMutationVersion && this.persistedAIJobsSnapshot) {
                    this.aiJobs = cloneStore(this.persistedAIJobsSnapshot);
                }
            });
        }
        return result.canceledCount;
    }

    private learningGoalsMutation = createSnapshotMutationQueue<LearningGoalsData>(
        () => this.learningGoals,
        current => ({
            version: 1,
            goals: current.goals.map(goal => ({
                ...goal,
                materialBlockIDs: [...goal.materialBlockIDs],
                criteriaHistory: goal.criteriaHistory?.map(item => ({ ...item })),
            })),
        }),
        next => this.persist.save(LEARNING_GOALS_DATA, next),
        next => { this.learningGoals = next; },
    );

    /** BI-1：目标写入串行化；先持久化不可变快照，成功后才替换运行态。 */
    private mutateLearningGoals(mutate: (next: LearningGoalsData) => void): Promise<LearningGoalsData> {
        return this.learningGoalsMutation(mutate);
    }

    /** BI-1：目标 upsert（空 id 自动生成）；持久化失败时保留旧运行态并向页面抛错。 */
    saveLearningGoal(goal: LearningGoal): Promise<LearningGoalsData> {
        return this.mutateLearningGoals(next => {
            const g: LearningGoal = { ...goal, updatedAt: Date.now(), materialBlockIDs: [...goal.materialBlockIDs], criteriaHistory: goal.criteriaHistory?.map(item => ({ ...item })) };
            if (!g.id) g.id = `goal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            const i = next.goals.findIndex(x => x.id === g.id);
            if (i >= 0) next.goals[i] = g;
            else next.goals.push(g);
        });
    }

    /** BI-1：删除目标；确认后持久化失败时保留旧运行态并向页面抛错。 */
    deleteLearningGoal(id: string): Promise<LearningGoalsData> {
        return this.mutateLearningGoals(next => { next.goals = next.goals.filter(goal => goal.id !== id); });
    }

    /** 兼容 Hub 既有命名，同时确保删除走同一事务队列。 */
    removeLearningGoal(id: string): Promise<LearningGoalsData> {
        return this.deleteLearningGoal(id);
    }

    /** BI-5：内容状态转移入口（校验+落盘一体；非法转移返回 false 不写盘） */
    async transitionContentState(blockID: string, to: ContentState, reason: string): Promise<boolean> {
        let changed = false;
        await this.contentLifecyclesMutations(next => {
            changed = transition(ensureLifecycle(next, blockID), to, reason, Date.now());
            if (!changed) throw new Error("invalid content lifecycle transition");
        });
        return changed;
    }

    /** Mobile Spec v1/v2：手机端闪卡中心宿主——全屏 Dialog，复用页签同源装配属性（buildHubMountProps 防双份漂移） */
    private async openHubMobileDialog(data?: Record<string, unknown>) {
        this.closeMobileReviewDialog();
        if (this.mobileHubDialog && this.mobileHubDialog.element.isConnected) {
            // 单例去重：仅切换子页（与桌面页签 lv-switch-tab 契约一致）
            if (data?.tab) {
                this.mobileHubDialog.element
                    .querySelector(".lv-hub")
                    ?.dispatchEvent(new CustomEvent("lv-switch-tab", {
                        detail: { tab: String(data.tab), focusBlockID: data?.focusBlockID },
                    }));
            }
            return;
        }
        this.mobileHubDialog = null;
        try {
            const deps: TabDeps = { loadHubMount, loadReviewMount, mountChunkFallback, loadHubServices };
            const mnt = await loadHubMount();
            const container = document.createElement("div");
            container.className = "lv-hub-mobile-host";
            let unbindVv: (() => void) | null = null;
            const handle = mnt(container, buildHubMountProps(this as any, deps, data, {
                onCloseMobile: () => {
                    this.mobileHubDialog?.close();
                },
            }));
            const { dialog, close } = simpleDialog({
                title: this.i18n.menuDashboard ?? "闪卡中心",
                ele: container,
                width: "100vw",
                height: "100dvh",
                callback: () => {
                    unbindVv?.();
                    unbindVv = null;
                    this.mobileHubDialog = null;
                    handle.destroy();
                },
            });
            dialog.element.classList.add("lv-hub-mobile-dialog");
            dialog.element.querySelector(".b3-dialog")?.classList.add("lv-hub-mobile-dialog");
            unbindVv = bindMobileVisualViewport(dialog.element);
            this.mobileHubDialog = { close, element: dialog.element };
        } catch (e) {
            this.mobileHubDialog = null;
            this.reportDialogOpenFailure(this.i18n.menuDashboard ?? "闪卡中心", e);
        }
    }

    /** Mobile Spec v2：手机端复习工作台全屏 Dialog 宿主（复用 buildReviewMountProps 同源装配，支持与闪卡中心双向流转） */
    private async openReviewMobileDialog(data?: Record<string, unknown>) {
        if (this.mobileReviewDialog && this.mobileReviewDialog.element.isConnected) {
            this.mobileReviewDialog.element
                .querySelector(".lv-review")
                ?.dispatchEvent(new CustomEvent("lv-switch-scope", {
                    detail: { ...(data ?? {}), cram: Boolean(data?.cram) },
                }));
            return;
        }
        this.mobileReviewDialog = null;
        try {
            const mnt = await loadReviewMount();
            const container = document.createElement("div");
            container.className = "lv-hub-mobile-host lv-review-mobile-host";
            let unbindVv: (() => void) | null = null;
            const handle = mnt(container, buildReviewMountProps(this as any, data, {
                onOpenDashboard: (tab?: string) => {
                    const prevReview = this.mobileReviewDialog;
                    this.mobileReviewDialog = null;
                    prevReview?.close();
                    void this.openHubMobileDialog(tab ? { tab } : undefined);
                },
                onClose: () => {
                    this.mobileReviewDialog?.close();
                },
            }));
            const { dialog, close } = simpleDialog({
                title: this.i18n.menuReview ?? "闪卡复习",
                ele: container,
                width: "100vw",
                height: "100dvh",
                callback: () => {
                    unbindVv?.();
                    unbindVv = null;
                    this.mobileReviewDialog = null;
                    handle.destroy();
                },
            });
            dialog.element.classList.add("lv-hub-mobile-dialog", "lv-review-mobile-dialog");
            dialog.element.querySelector(".b3-dialog")?.classList.add("lv-hub-mobile-dialog", "lv-review-mobile-dialog");
            unbindVv = bindMobileVisualViewport(dialog.element);
            this.mobileReviewDialog = { close, element: dialog.element };
        } catch (e) {
            this.mobileReviewDialog = null;
            this.reportDialogOpenFailure(this.i18n.menuReview ?? "闪卡复习", e);
        }
    }

    private openTabOf(type: string, data?: Record<string, unknown>) {
        // Mobile Spec v1/v2：手机端宿主无页签模型——闪卡中心与复习工作台统一改为全屏 Dialog 宿主（100vw/var(--lv-vv-h, 100dvh) + safe-area）
        if (this.isMobileHost()) {
            if (type === TAB_DASHBOARD) {
                void this.openHubMobileDialog(data);
                return;
            }
            if (type === TAB_REVIEW) {
                void this.openReviewMobileDialog(data);
                return;
            }
        }
        // 真机验收修正（v0.110.2）：Plugin 实例在 3.8.6 上没有 openTab 方法（旧实例 API 已移除，
        // 仅剩模块级 openTab 函数）——此前经 anySelf 绕过类型检查，真机点击入口即抛
        // "this.openTab is not a function"。改用模块级 openTab + custom 页签契约。
        // 注意 id 必须与 addTab 注册键一致：bundle 中 addTab 以 this.name + type「无分隔符」
        // 登记 models（source: common.js addTab 实现），带 "-" 会查不到模型导致页签空白。
        // T13 去重（docs/40 UX 待办收敛）：中心/复习为单实例工作面——已存在同型页签时激活复用，
        // 不再新开（连点顶栏/命令面板反复入不再堆重复页签）；带 data 的定点打开（scope/cram/子页）
        // 对中心走 lv-switch-tab 事件切换子页，对复习保持新开（有意进入特定状态）。
        const existing = getAllTabs(`${this.name}${type}`)[0];
        if (existing) {
            existing.headElement.click();
            if (type === TAB_DASHBOARD) {
                const targetTab = (typeof data?.tab === "string" && data.tab) ? data.tab : "overview";
                existing.panelElement
                    ?.querySelector(".lv-hub")
                    ?.dispatchEvent(new CustomEvent("lv-switch-tab", { detail: { tab: targetTab, focusBlockID: data?.focusBlockID } }));
            } else if (type === TAB_REVIEW) {
                existing.panelElement
                    ?.querySelector(".lv-review")
                    ?.dispatchEvent(new CustomEvent("lv-switch-scope", {
                        detail: { ...(data ?? {}), cram: Boolean(data?.cram) },
                    }));
            }
            return;
        }
        openTab({
            app: this.app,
            custom: {
                id: `${this.name}${type}`,
                icon: "iconLvCards",
                title: type === TAB_REVIEW ? this.i18n.menuReview : this.i18n.menuDashboard,
                data,
            },
        });
    }

    public togglePresentationPrivacy() {
        const state = this.presentationPrivacyController.getState();
        if (state.enabled) {
            this.presentationPrivacyController.exit();
            showMessage(this.i18n.presentationPrivacyTipExited ?? "已退出演示模式", 2500, "info");
        } else {
            this.presentationPrivacyController.enter("screen-sharing");
            showMessage(this.i18n.presentationPrivacyTipActive ?? "私密演示模式已启用", 3500, "info");
        }
    }

    /** 顶栏右键菜单（官方 addTopBar contextMenu 通道）：条目追加进思源原生 subMenu，不拦截原生菜单 */
    private showTopbarMenu(menu: subMenu) {
        appendPluginTopbarMenuItems({
            v2State: this.flashcardV2 ? this.flashcardV2.state : null,
            modules: this.settings.modules,
            presentationPrivacy: {
                enabled: this.presentationPrivacyController.getState().enabled,
                profile: this.presentationPrivacyController.getState().profile,
            },
            i18n: this.i18n,
            actions: {
                openDashboard: () => this.openTabOf(TAB_DASHBOARD),
                openReview: () => this.openTabOf(TAB_REVIEW),
                openManager: () => this.openTabOf(TAB_DASHBOARD, { tab: "manage" }),
                openQuickCard: () => this.openQuickCard(),
                openOnboarding: () => this.openOnboarding(),
                openAIWizard: () => this.openAIWizard(),
                openSettingsDialog: () => this.openSettingsDialog(),
                togglePresentationPrivacy: () => this.togglePresentationPrivacy(),
            },
        }, menu);

        const stat = this.revlog.days[todayDate()];
        if (stat && this.settings.dailyReviewTarget > 0 && stat.review >= this.settings.dailyReviewTarget) {
            showMessage(this.i18n.dailyTargetReached, 3000, "info");
        }
    }

    private async openSettingsDialog(onSaved?: () => void, initialSection?: "imports") {
        try {
            const mobile = this.isMobileHost();
            const SettingsPanel = await loadSettingsPanel();
            let unbindVv: (() => void) | null = null;
            const { close, dialog } = svelteDialog({
                title: this.i18n.settingsTitle,
                component: SettingsPanel,
                width: mobile ? "100vw" : "min(620px, 94vw)",
                // 完整设置内容远超一屏；明确限制弹窗高度后，设置面板才能建立可滚动边界。
                height: mobile ? "100dvh" : "min(860px, calc(100vh - 48px))",
                callback: () => {
                    unbindVv?.();
                    unbindVv = null;
                },
                props: {
                    initialSection,
                    ctx: {
                    i18n: this.i18n,
                    settings: this.settings,
                    close: () => close(),
                    save: async (s: LvCardsSettings) => {
                        const previous = this.settings;
                        this.settings = s;
                        try {
                            await this.saveSettingsNow();
                        } catch (e) {
                            this.settings = previous;
                            this.setupBadgeTimer();
                            throw e;
                        }
                        showMessage(this.i18n.settingsSaved, 2000, "info");
                        onSaved?.();
                    },
                    exportRevlog: () => this.exportRevlog(),
                    clearRevlog: () => this.clearRevlog(),
                    // BU-24/25：AI 用量账本（导出/清空 + 本月已用显示）
                    costLedger: {
                        export: () => this.exportCostLedger(),
                        clear: () => this.clearCostLedger(),
                        monthUsed: () => budgetState(this.costLedger, { enabled: false, monthlyTokenCap: 0 }).monthUsed,
                    },
                    // 备份与恢复中心（docs/38 P2）：导出 bundle / 从文件恢复（预览→确认→应用）
                    backup: {
                        export: () => this.exportBackup(),
                        restore: (text: string) => this.restoreBackupFromFile(text),
                    },
                    // Obsidian SR 导入弱台账（幂等重导）；可选——旧宿主不传则不持久化
                    obLedger: {
                        load: async () => this.obLedger,
                        save: async (entries: unknown) => {
                            const previous = this.obLedger;
                            const next = normalizeObLedger(entries);
                            try {
                                await this.persist.save(OB_LEDGER_DATA, next);
                                this.obLedger = next;
                            } catch (e) {
                                this.obLedger = previous;
                                throw e;
                            }
                        },
                    },
                    // Anki M3：guid 导入台账（幂等重导）——启动已装载，读写内存副本
                    ankiLedger: {
                        load: async () => this.ankiLedger,
                        save: async (entries: unknown) => {
                            const previous = this.ankiLedger;
                            const next = normalizeLedger(entries);
                            try {
                                await this.persist.save(ANKI_LEDGER_DATA, next);
                                this.ankiLedger = next;
                            } catch (e) {
                                this.ankiLedger = previous;
                                throw e;
                            }
                        },
                    },
                    rememberSourceFingerprint: (blockID: string, rootID?: string, markdown?: string) => this.rememberSourceFingerprint(blockID, rootID, markdown),
                    // BU-31：紧急停用/撤销同意（停用即清理待发队列；事件记录不含敏感内容）
                    killswitch: {
                        snapshot: () => this.killSwitch,
                        stopCurrent: async () => {
                            const targets = this.aiProviderTargets();
                            this.cancelPendingAiJobs();
                            return this.mutateKillSwitch(next => {
                                for (const t of targets) disableTarget(next, t, Date.now());
                            });
                        },
                        resumeAll: async () => {
                            const targets = this.aiProviderTargets();
                            return this.mutateKillSwitch(next => {
                                for (const t of targets) enableTarget(next, t, Date.now());
                            });
                        },
                        revoke: async () => {
                            this.cancelPendingAiJobs();
                            return this.mutateKillSwitch(next => revokeConsent(next, Date.now()));
                        },
                        grant: async () => {
                            return this.mutateKillSwitch(next => grantConsent(next, Date.now()));
                        },
                    },
                    redetectV2: async () => {
                        this.flashcardV2 = await detectFlashcardV2();
                        const state = this.flashcardV2 ? this.flashcardV2.state : "N/A (<3.9.0)";
                        this.settings.gatewayState = state;
                        this.saveSettingsSoon();
                        // gateway-changed（M11 事件契约）：网关状态变化广播
                        try {
                            (this.eventBus as any).emit(LV_EVENTS.gatewayChanged, gatewayChangedEvent(state));
                        } catch { /* 事件旁路 */ }
                        return state;
                    },
                    getV2Status: () => this.flashcardV2 ? this.flashcardV2.state : "N/A (<3.9.0)",
                    getSuspendedCount: () => this.suspendToday.cardIDs.length,
                    restoreAllSuspended: async () => {
                        const ids = [...this.suspendToday.cardIDs];
                        if (ids.length === 0) return;
                        try {
                            await this.suspendTodayMutations.unsuspend(ids);
                            showMessage(this.i18n.settingsSaved, 2000, "info");
                        } catch {
                            this.toastStorageFail();
                        }
                    },
                    testAnkiClient: (url?: string, key?: string) => this.testAnkiClient(url, key),
                    storageStats: () => this.storageStats(),
                    generateExamReport: (plan: ExamPlan) => this.generateExamReport(plan),
                    exportSettings: () => this.exportSettings(),
                    getNotebooks: async () => {
                        try {
                            return await getNotebooks();
                        } catch {
                            return [];
                        }
                    },
                    importSettings: async (fileText: string) => {
                        const previous = this.settings;
                        const next = normalizeSettings(JSON.parse(fileText));
                        this.settings = next;
                        try {
                            await this.saveSettingsNow();
                        } catch (e) {
                            this.settings = previous;
                            this.setupBadgeTimer();
                            throw e;
                        }
                    },
                    exportRevlogCsv: () => this.exportRevlogCsv(),
                    openDynamicBoardDoc: () => this.openOrCreateDynamicBoardDoc(),
                    importRevlogCsv: async (fileText: string) => {
                        const imported = parseRevlogCsv(fileText);
                        const previous = this.revlog;
                        const next = normalizeRevlog(cloneStore(previous));
                        const result = mergeRevlog(next, imported);
                        const version = ++this.revlogMutationVersion;
                        this.revlog = next;
                        this.refreshDueBadge();
                        await this.persist.save(REVLOG_DATA, cloneStore(next)).then(() => {
                            if (version === this.revlogMutationVersion) this.persistedRevlogSnapshot = cloneStore(next);
                        }).catch(error => {
                            if (version === this.revlogMutationVersion) {
                                this.revlog = cloneStore(this.persistedRevlogSnapshot ?? previous);
                                this.refreshDueBadge();
                            }
                            throw error;
                        });
                        return result;
                    },
                    importRevlogMerge: async (fileText: string, onFork?: "skip" | "preferImport") => {
                        let imported: unknown;
                        try {
                            imported = JSON.parse(fileText);
                        } catch {
                            throw new Error("导入数据格式无效，不是合法的 JSON 文件");
                        }
                        const previous = this.revlog;
                        const next = normalizeRevlog(cloneStore(previous));
                        const result = mergeRevlog(next, imported, { onFork });
                        const version = ++this.revlogMutationVersion;
                        this.revlog = next;
                        this.refreshDueBadge();
                        await this.persist.save(REVLOG_DATA, cloneStore(next)).then(() => {
                            if (version === this.revlogMutationVersion) this.persistedRevlogSnapshot = cloneStore(next);
                        }).catch(error => {
                            if (version === this.revlogMutationVersion) {
                                this.revlog = cloneStore(this.persistedRevlogSnapshot ?? previous);
                                this.refreshDueBadge();
                            }
                            throw error;
                        });
                        return result;
                    },
                    },
                },
            });
            dialog.element.classList.add("lv-dialog--settings");
            if (mobile) {
                dialog.element.classList.add("lv-mobile-sheet-dialog");
                dialog.element.querySelector(".b3-dialog")?.classList.add("lv-mobile-sheet-dialog");
                unbindVv = bindMobileVisualViewport(dialog.element);
            }
        } catch (e) {
            this.reportDialogOpenFailure(this.i18n.settingsTitle, e);
        }
    }

    /** 导出本地复习日志（M10·FR1） */
    private exportRevlog() {
        exportRevlogJson(this.revlog, todayDate());
    }

    /** 导出设置为 JSON 文件 */
    private exportSettings() {
        exportSettingsJson(this.settings, todayDate());
    }

    /** 导出 CSV（带 BOM，Excel 友好） */
    private exportRevlogCsv() {
        exportRevlogToCsv(this.revlog, todayDate());
    }

    /** 清空本地复习日志（热力图与连击归零；不影响内核调度） */
    private async clearRevlog() {
        const previous = cloneStore(this.persistedRevlogSnapshot ?? this.revlog);
        const next = emptyRevlog();
        const version = ++this.revlogMutationVersion;
        this.revlog = next;
        this.refreshDueBadge();
        try {
            await this.persist.save(REVLOG_DATA, next);
            if (version === this.revlogMutationVersion) this.persistedRevlogSnapshot = next;
            showMessage(this.i18n.settingsSaved, 2000, "info");
        } catch {
            if (version === this.revlogMutationVersion) {
                this.revlog = cloneStore(this.persistedRevlogSnapshot ?? previous);
                this.refreshDueBadge();
            }
            this.toastStorageFail();
        }
    }

    /** BU-25：导出 AI 用量账本（聚合视图 + 明细；不含 key 与原文） */
    private exportCostLedger() {
        exportAiCostLedger(this.costLedger, todayDate());
    }

    /** BU-25：清空 AI 用量账本（预算随之归零重计） */
    private async clearCostLedger() {
        const previous = cloneStore(this.persistedCostLedgerSnapshot ?? this.costLedger);
        const next = emptyCostLedger();
        const version = ++this.costLedgerMutationVersion;
        this.costLedger = next;
        try {
            await this.persist.save(AI_COST_LEDGER_DATA, next);
            if (version === this.costLedgerMutationVersion) this.persistedCostLedgerSnapshot = next;
            showMessage(this.i18n.settingsSaved, 2000, "info");
        } catch {
            if (version === this.costLedgerMutationVersion) {
                this.costLedger = cloneStore(this.persistedCostLedgerSnapshot ?? previous);
            }
            this.toastStorageFail();
        }
    }

    /** 备份与恢复中心：导出全部私有存储为单文件 bundle（manifest 含校验和；含用户内容，用户自管） */
    private exportBackup() {
        this.readAllStores().then(files => {
            exportAllBackupBundle(files, todayDate());
        });
    }

    /** 备份与恢复中心：导入恢复——预览（校验+逐 key 对比）→ 确认 → 队列落盘 → 内存重载。
     * 预览失败直接抛可读原因（不改任何状态）；确认前当前状态不受影响（可先导出回滚）。 */
    private async restoreBackupFromFile(text: string) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            throw new Error((this.i18n as any).backup?.badJson ?? "invalid JSON");
        }
        const current = await this.readAllStores();
        const preview = previewRestore(parsed, current, [...LvCardsPlugin.STORE_KEYS]);
        const dict = (this.i18n as any).backup ?? {};
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
        if (!ok) {
            return;
        }
        await applyRestoreTransaction({
            restoreFiles: preview.files,
            currentFiles: current,
            saveFile: (key, data) => this.persist.save(key, cloneStore(data)),
            logError: (msg) => lvLog("error", msg),
        });
        // 内存态与磁盘对齐（重载走与 onload 同一装配路径）
        await this.applyLoadedStores(await this.readAllStores());
        this.refreshDueBadge();
        showMessage(dict.restoreDone ?? "restored", 2500, "info");
        lvLog("info", "[backup] restored");
    }

    /** 学习报告写入思源文档（M5·FR6 深化） */
    async writeReportDoc(md: string) {
        const nb = await this.targetNotebook();
        if (!nb) {
            throw new Error(this.i18n.onboardingNoNotebook);
        }
        const docID = await createDocWithMd(nb.id, `小驴闪卡/学习报告/${todayDate()}`, md);
        if (!docID) {
            throw new Error(this.i18n.quickCardFail);
        }
        // AR-5：成功回显路径并打开文档（失败由调用方 catch 展示，报告可重试）
        showMessage((this.i18n as any).dashboard?.reportWritten ?? docID, 2500, "info");
        this.openSiYuanTarget(docID);
    }

    /** T-周报（docs/41 P1）：自动把上周复盘写入「小驴闪卡/学习周报」文档——静默写入，不自动打开（区别于手动报告） */
    private async maybeWriteWeeklyReport() {
        return maybeWriteWeeklyReport({
            settings: this.settings,
            revlog: this.revlog,
            i18n: this.i18n,
            targetNotebook: () => this.targetNotebook(),
            saveSettingsSoon: () => this.saveSettingsSoon(),
        });
    }
}
