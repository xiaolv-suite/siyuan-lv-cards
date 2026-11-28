/**
 * 页签与宿主装配强类型窄契约（Tab Host Contracts）
 *
 * 彻底替代 tab-openers.ts / tab-registrars.ts 中的 `plugin: any` 逃逸，
 * 由主类 `LvCardsPlugin extends Plugin implements TabHostPlugin` 静态校验证明全部属性/方法真实现存。
 * 本文件仅承载纯类型与接口（零运行时导入），严禁反向引入 index.ts 或其他 bootstrap 控制器以免成环。
 */

import type { App, Custom, EventBus, IKernelPlugin, Tab } from "siyuan";
import type { HostBridge } from "@/api/host-bridge";
import type { MigrationStatus } from "@/api/flashcardV2";
import type { PersistQueue } from "@/libs/persist";
import type { LvCardsSettings } from "@/core/settings";
import type { RevlogData } from "@/core/revlog";
import type { SuspendTodayData } from "@/core/suspend-today";
import type { ExamPlansData } from "@/core/exam";
import type { SessionState } from "@/core/session-state";
import type { InboxData } from "@/core/inbox";
import type { SourceHealthData } from "@/core/source-health-store";
import type { AIBatchesData } from "@/core/ai-batches";
import type { AIJobsData } from "@/core/ai-jobs";
import type { KnowledgeObjectsData } from "@/core/knowledge-objects";
import type { ErrorReason, ErrorTagsData } from "@/core/error-reasons";
import type { CardRelationsData } from "@/core/card-relations";
import type { ContentLifecyclesData } from "@/core/content-lifecycle";
import type { ContentVersionsData } from "@/core/content-versions";
import type { LearningGoalsData } from "@/core/learning-goal";
import type { EntryContextData, EntryKind } from "@/core/entry-context";
import type { BatchRepairPreview, BatchRepairProposal, MaintenanceRepairJournal } from "@/core/maintenance-repair";
import type { StorageCoordinator } from "@/core/storage-coordinator";
import type { ReviewCoordinator } from "@/core/review-coordinator";
import type { AICardService } from "@/core/ai-card-service";
import type { MaintenanceService } from "@/core/maintenance-service";
import type { createSuspendTodayMutations } from "@/core/suspend-today-persistence";
import type { createSnapshotMutationQueue } from "@/core/snapshot-mutation-queue";

export interface MobileDialogControllerLike {
    openHubMobileDialog(tab?: string | Record<string, unknown>): Promise<void>;
    openReviewMobileDialog(data?: Record<string, unknown>): Promise<void>;
    closeHub(): void;
    closeReview(): void;
    closeAll(): void;
}

export interface PendingHubRequest {
    tab: string;
    focusBlockID?: string;
}

export interface TabOpenerHost {
    readonly name: string;
    readonly app: App;
    readonly i18n: Record<string, any>;
    readonly hostBridge: HostBridge;
    readonly mobileDialogController: MobileDialogControllerLike;
    pendingHubRequest?: PendingHubRequest | null;
    isMobileHost(): boolean;
    openHubMobileDialog(tab?: string | Record<string, unknown>): Promise<void>;
    openReviewMobileDialog(data?: Record<string, unknown>): Promise<void>;
}

export interface TabRegistrarHost extends TabOpenerHost {
    readonly eventBus: EventBus;
    readonly kernel?: IKernelPlugin;
    readonly persist: PersistQueue;
    readonly storageCoordinator: StorageCoordinator;
    readonly maintenanceService: MaintenanceService;
    readonly aiCardService: AICardService;
    readonly reviewCoordinator: ReviewCoordinator;
    readonly tier2Ready: boolean;

    settings: LvCardsSettings;
    revlog: RevlogData;
    flashcardV2: MigrationStatus | null;
    sessionState: SessionState;
    persistedSessionStateSnapshot: SessionState | null;
    sessionMutationVersion: number;
    inbox: InboxData;
    persistedInboxSnapshot: InboxData | null;
    inboxMutationVersion: number;
    suspendToday: SuspendTodayData;
    suspendTodayMutations: ReturnType<typeof createSuspendTodayMutations>;
    sourceHealth: SourceHealthData;
    aiBatches: AIBatchesData;
    aiJobs: AIJobsData;
    examPlans: ExamPlansData;
    readonly examPlansSourceID: string;
    examPlansSequence: number;
    cachedExamLinkage: { name: string; days: number; source: string } | null;
    knowledgeObjects: KnowledgeObjectsData;
    knowledgeObjectsMutations: ReturnType<typeof createSnapshotMutationQueue<KnowledgeObjectsData>>;
    cardRelations: CardRelationsData;
    cardRelationsMutations: ReturnType<typeof createSnapshotMutationQueue<CardRelationsData>>;
    errorTags: ErrorTagsData;
    contentLifecycles: ContentLifecyclesData;
    contentVersions: ContentVersionsData;
    learningGoals: LearningGoalsData;
    repairJournal: MaintenanceRepairJournal;
    entryContexts: EntryContextData;
    presentationPrivacyController?: { getState: () => { enabled: boolean; profile?: string } };
    togglePresentationPrivacy?: () => void;

    addTab(options: {
        type: string;
        destroy?: (this: Custom) => void;
        beforeDestroy?: (this: Custom) => void;
        resize?: (this: Custom) => void;
        update?: (this: Custom) => void;
        init: (this: Custom, custom: Custom) => void;
    }): (options: { tab: Tab; data: any }) => Custom;

    ensureTier2Loaded(): Promise<void>;
    saveSettingsSoon(): void;
    saveSettingsNow(): Promise<void>;
    setupBadgeTimer(): void;
    openSiYuanTarget(docOrBlockId: string, zoomIn?: boolean): void;
    openTabOf(type: string, data?: Record<string, unknown>): void;
    clearSessionState(): Promise<void>;
    openAIWizard(initialSource?: string, onCreated?: () => void): Promise<void>;
    openRepairDrill(): Promise<void>;
    openChallenge(): Promise<void>;
    openPairing(): Promise<void>;
    openQuickCard(prefillQ?: string): Promise<void>;
    openSettingsDialog(onSaved?: () => void, initialSection?: "imports"): Promise<void>;
    openPalette(): Promise<void>;
    openOnboarding(): Promise<void>;
    toggleStarCard(id: string): Promise<boolean>;
    getRevlogBlockIndex(): { reviewedSet: Set<string>; lapsesMap: Record<string, number> };
    openReviewWithEntry(scope: string, cram: boolean, entry?: { entryKind: EntryKind; sourceID: string; returnPoint: string }): void;
    openReviewScope(scopeKindOrKey: string, scopeIdOrCram?: string | boolean, cram?: boolean, planId?: string): void;
    saveInbox(): Promise<void>;
    subscribeInbox(cb: () => void): () => void;
    notifyInboxChanged(): void;
    hasValidOcclusionCard(blockID: string, markdown?: string): Promise<boolean>;
    reconcileSourceHealthForScan(cards: Array<{ blockID: string; md: string; baselineMarkdown?: string; rootID?: string; exists?: boolean; mediaRefs?: string[]; mediaBroken?: string[]; mediaUnknown?: string[]; sourceHealthIssues?: { kind: string; detail: string }[] }>): Promise<void>;
    acknowledgeSourceHealth(blockID: string): Promise<void>;
    saveBlockContentVersion(blockID: string, markdown: string, recovery?: any): Promise<boolean | string>;
    acceptContentVersion(blockID: string, at: number): Promise<void>;
    openOrCreateDynamicBoardDoc(): Promise<string>;
    appendRevlog(entry: any): void;
    rollbackRevlog(cardID?: string): unknown;
    tagErrorReason(cardID: string, reason: ErrorReason, blockID?: string): void;
    removeCardsFromDeck(ids: string[], deckID?: string): Promise<{ success: boolean; removedCount?: number; error?: string } | void>;
    saveEntryContexts(): Promise<void>;
    refreshDueBadge(): void;
    targetNotebook(): Promise<{ id: string; name: string } | null>;
    showNotice(message: string, timeout?: number, icon?: "info" | "error"): void;
    showStorageFail(): void;
}

export interface TabHostPlugin extends TabRegistrarHost {}

export type MaintenancePreviewFn = (proposals: BatchRepairProposal[]) => Promise<BatchRepairPreview>;
