/**
 * 小驴闪卡 页签装配器（Tab Registrars）
 *
 * 负责闪卡中心（TAB_DASHBOARD）与复习工作台（TAB_REVIEW）的加载挂载、
 * 视图销毁守护、多领域上下文（dashboardBase、managerCtx、exam、inbox、goals、maintenance）装配，
 * 将庞大的生命周期装配与主入口解耦，使 src/index.ts 保持高度轻量与高内聚。
 */

import { showMessage } from "@/libs/notice";
import { getBlockDOM, sqlQuery, probeAssetRefs, getBlockDocMap, getDocTitles, setBlockAttrs } from "@/api/siyuan";
import { buildLeechAttrs } from "@/core/block-attributes";
import { getRiffCards, getRiffCardsByBlockIDs } from "@/api/riff";
import { leechCards, localDate, docCoverage } from "@/core/revlog";
import { daysLeft, type ExamPlan } from "@/core/exam";
import { cachedDueBlockIDs, dueCache } from "@/api/due-shared";
import { relationsOf, addRelation, removeRelation, detachCard, type RelationType } from "@/core/card-relations";
import { findBySource, registerObject, toggleInstance, removeInstance, deriveInstance } from "@/core/knowledge-objects";
import { capabilityShare } from "@/core/capability-types";
import { errorReasonStats, type ErrorReason } from "@/core/error-reasons";
import { ensureLifecycle, transition, lifecycleStats, type ContentState } from "@/core/content-lifecycle";
import { appendVersion, versionsOf } from "@/core/content-versions";
import { bulkSetStatus, undoSelection, removeInboxItem, addInboxItem, type InboxStatus } from "@/core/inbox";
import { scanAllMaintenanceCardIds } from "@/core/maintenance-scan";
import { hasImageContent } from "@/core/flashcard-quality";
import { extractMediaRefs } from "@/core/media-refs";
import { sourceHealthHistories } from "@/core/source-health-store";
import { isSuspended } from "@/core/suspend-today";
import { isContextFresh, removeContext, type EntryKind } from "@/core/entry-context";
import { normalizeSettings, hasSiyuanAiApiKey } from "@/core/settings";
import { CARDS_SECRET_SLOTS, readCardsSecretSlot } from "@/core/secrets";
import { normalizeSessionState, type SessionState } from "@/core/session-state";
import { isGoalActive, daysUntilDeadline, type LearningGoal } from "@/core/learning-goal";
import { LV_EVENTS, sessionFinishedEvent } from "@/libs/events";
import { SESSION_STATE_DATA } from "@/bootstrap/storage-keys";
import { DEFAULT_HUB_HOME_TAB, TAB_DASHBOARD, TAB_REVIEW } from "@/bootstrap/tab-constants";
import type { TabRegistrarHost } from "@/bootstrap/tab-host";
import { getHostDelegates } from "@/bootstrap/host-delegates";
import {
    createAIWizardView,
    createQuickCardView,
    generateExamReport,
    writeExamReportDoc,
    writeReportDoc,
} from "@/bootstrap/dialog-actions";
import type { BatchRepairProposal } from "@/core/maintenance-repair";

function cloneStore<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

export { TAB_DASHBOARD, TAB_REVIEW };

const todayDate = () => localDate(Date.now());

export interface TabDeps {
    loadHubMount: () => Promise<(el: HTMLElement, props: any) => { destroy(): void }>;
    loadReviewMount: () => Promise<(el: HTMLElement, props: any) => { destroy(): void }>;
    mountChunkFallback: (el: HTMLElement, i18n: any, error: unknown) => void;
    loadHubServices?: () => Promise<any>;
}

export function registerDashboardTab(plugin: TabRegistrarHost, deps: TabDeps): void {
    plugin.addTab({
        type: TAB_DASHBOARD,
        init() {
            const div = document.createElement("div");
            div.className = "lv-cards-root";
            div.style.height = "100%";
            let handle: { destroy(): void } | null = null;
            let hubDisposed = false;

            const capturedPending = plugin.pendingHubRequest;
            plugin.pendingHubRequest = null;

            const tier2Promise = typeof (plugin as any).ensureTier2Loaded === "function"
                ? (plugin as any).ensureTier2Loaded().catch(() => {})
                : Promise.resolve();
            void deps.loadHubMount().then(async (mnt) => {
                await tier2Promise;
                if (hubDisposed) return;
                const latestPending = plugin.pendingHubRequest ?? capturedPending;
                plugin.pendingHubRequest = null;
                const effectiveData = latestPending?.tab
                    ? {
                        ...(this.data ?? {}),
                        tab: latestPending.tab,
                        ...(latestPending.focusBlockID !== undefined ? { focusBlockID: latestPending.focusBlockID } : {}),
                    }
                    : this.data;
                handle = mnt(div, buildHubMountProps(plugin, deps, effectiveData));
            }).catch((e: unknown) => {
                if (!hubDisposed) deps.mountChunkFallback(div, plugin.i18n, e);
            });
            this.element.appendChild(div);
            this.destroy = () => {
                hubDisposed = true;
                handle?.destroy();
            };
        },
    });
}

/**
 * 闪卡中心（Hub）宿主装配属性（Mobile Spec v1）：
 * 页签 init 与手机端全屏 Dialog 宿主共用同源装配，避免双份 props 漂移。
 * data 为页签/入口携带的打开参数（tab、focusBlockID）。
 */
export function buildHubMountProps(
    plugin: TabRegistrarHost,
    deps: TabDeps,
    data?: Record<string, unknown>,
    hooks?: { onCloseMobile?: () => void },
): Record<string, unknown> {
    const delegates = getHostDelegates(plugin);
    return {
        i18n: plugin.i18n,
        initialTab: (typeof data?.tab === "string" && data.tab) ? data.tab : DEFAULT_HUB_HOME_TAB,
        initialBlockID: typeof data?.focusBlockID === "string" ? data.focusBlockID : "",
        onCloseMobile: hooks?.onCloseMobile,
        uiMode: plugin.settings.uiMode,
        openWizard: () => plugin.openAIWizard(),
        openDrill: () => plugin.openRepairDrill(),
        openChallenge: () => plugin.openChallenge(),
        openPairing: () => plugin.openPairing(),
        openQuickCard: () => plugin.openQuickCard(),
        loadWizardView: (sources?: { label: string; content: string; docId?: string; nbId?: string; inboxId?: string }[], onImportComplete?: (ids: string[]) => void, recoveryJobId?: string) =>
            createAIWizardView(plugin, "", undefined, sources, onImportComplete, recoveryJobId, true),
        loadQuickCardView: () => createQuickCardView(plugin, true),
        openSettings: (onSaved?: () => void) => plugin.openSettingsDialog(onSaved),
        getSettingsHealth: () => ({
            aiConfigured: plugin.settings.aiMode === "siyuan"
                ? hasSiyuanAiApiKey()
                : Boolean(plugin.settings.aiEndpoint && (plugin.settings.aiKey || plugin.settings.aiKeyConfigured || readCardsSecretSlot(plugin as any, CARDS_SECRET_SLOTS.aiKey))),
        }),
        presentationPrivacy: plugin.togglePresentationPrivacy ? {
            isEnabled: () => Boolean(plugin.presentationPrivacyController?.getState().enabled),
            toggle: () => plugin.togglePresentationPrivacy?.(),
        } : undefined,
        openPalette: () => plugin.openPalette(),
        onTabChange: (id: string) => {
            plugin.settings.lastHubTab = id;
            plugin.saveSettingsSoon();
        },
        dashboardBase: {
            i18n: plugin.i18n,
            app: plugin.app,
            openDoc: (id: string, zoomIn?: boolean) => plugin.openSiYuanTarget(id, Boolean(zoomIn)),
            getRevlog: () => plugin.revlog,
            getV2Status: () => plugin.flashcardV2,
            getDailyTargets: () => ({
                new: plugin.settings.dailyNewTarget,
                review: plugin.settings.dailyReviewTarget,
            }),
            getSessionState: () => plugin.sessionState,
            clearSessionState: () => plugin.clearSessionState(),
            openQuickCard: () => plugin.openQuickCard(),
            getSessionBudget: () => plugin.settings.sessionBudgetMin,
            setSessionBudget: (min: number) => {
                plugin.settings.sessionBudgetMin = min;
                plugin.saveSettingsSoon();
            },
            getDeepStatsOpen: () => plugin.settings.deepStatsOpen,
            setDeepStatsOpen: (open: boolean) => {
                plugin.settings.deepStatsOpen = open;
                plugin.saveSettingsSoon();
            },
            getInboxOpenCount: () => plugin.inbox.items.filter((i) => i.status !== "dismissed").length,
            getSuspendedCount: () => plugin.suspendToday.cardIDs.length,
            getMaintenanceDebtCount: () => {
                return plugin.sourceHealth.entries.filter((e) => e.history.some((h) => !h.resolved)).length;
            },
            restoreSuspendedToday: async () => {
                const ids = [...plugin.suspendToday.cardIDs];
                await plugin.suspendTodayMutations.unsuspend(ids);
                return plugin.suspendToday.cardIDs.length;
            },
            openReview: (options?: { scope?: string; cram?: boolean }) => plugin.openTabOf(TAB_REVIEW, options),
            openReviewScope: (scopeKey: string, cram?: boolean) => plugin.openTabOf(TAB_REVIEW, { scope: scopeKey, cram: Boolean(cram) }),
            openOnboarding: () => plugin.openOnboarding(),
            getAIBatches: () => plugin.aiBatches.batches,
            getLeechCards: () => {
                const items = leechCards(plugin.revlog, plugin.settings.leechThreshold);
                return items.map((i) => ({ blockID: i.blockID, lapses: i.lapses }));
            },
            rewriteWithAI: (blockID: string) => {
                const safeId = String(blockID || "").replace(/'/g, "''");
                if (!safeId) {
                    void plugin.openAIWizard("");
                    return;
                }
                void sqlQuery(`SELECT content, markdown FROM blocks WHERE id = '${safeId}' LIMIT 1`)
                    .then((rows: any[]) => {
                        const row = Array.isArray(rows) ? rows[0] : null;
                        const material = String(row?.markdown || row?.content || "").trim();
                        void plugin.openAIWizard(material);
                    })
                    .catch(() => {
                        void plugin.openAIWizard("");
                    });
            },
            writeReportDoc: (md: string) => writeReportDoc(plugin, md),
            getExamCountdown: () => {
                const plan = plugin.examPlans.plans.find((p) => p.enabled && p.examDate && !p.archived);
                const left = plan ? daysLeft(plan.examDate) : null;
                if (plan && left !== null && left >= 0) {
                    return { name: plan.name, days: left };
                }
                if (plugin.cachedExamLinkage && plugin.cachedExamLinkage.days >= 0) {
                    return plugin.cachedExamLinkage;
                }
                return null;
            },
            getXpEnabled: () => plugin.settings.xpEnabled,
            onSessionFinished: (cb: () => void) => {
                const handler = () => cb();
                (plugin.eventBus as any).on(LV_EVENTS.sessionFinished, handler);
                return () => (plugin.eventBus as any).off(LV_EVENTS.sessionFinished, handler);
            },
            onReviewed: (cb: () => void) => {
                const handler = () => cb();
                (plugin.eventBus as any).on(LV_EVENTS.reviewed, handler);
                return () => (plugin.eventBus as any).off(LV_EVENTS.reviewed, handler);
            },
            onStoresChanged: (cb: () => void) => {
                const handler = () => cb();
                (plugin.eventBus as any).on(LV_EVENTS.storesChanged, handler);
                return () => (plugin.eventBus as any).off(LV_EVENTS.storesChanged, handler);
            },
            getDocCoverage: async () => {
                try {
                    const blockIDs = Array.from<string>(new Set(plugin.revlog.entries.filter((e) => e.rating > 0 && e.blockID).map((e) => String(e.blockID))));
                    if (blockIDs.length === 0) {
                        return { docs: [], unattributed: 0 };
                    }
                    const docMap = await getBlockDocMap(blockIDs);
                    const agg = docCoverage(plugin.revlog, (blockID: string) => docMap.get(blockID)?.rootID ?? null);
                    const titles = await getDocTitles(agg.docs.map((d) => d.docID));
                    const docs = agg.docs
                        .map((d) => ({ docID: d.docID, title: titles.get(d.docID) || "", seen: d.seen }))
                        .sort((a, b) => b.seen - a.seen);
                    return { docs, unattributed: agg.unattributed };
                } catch {
                    return null;
                }
            },
            getHeatmapWeeks: () => plugin.settings.heatmapWeeks,
            getCapabilityShare: () => {
                const all = plugin.knowledgeObjects.objects.flatMap((o) => o.instances);
                return capabilityShare(all);
            },
            getErrorReasonStats: () => {
                const stats = errorReasonStats(plugin.errorTags.tags);
                return Object.entries(stats)
                    .filter(([, count]) => count > 0)
                    .map(([reason, count]) => ({ reason, count }));
            },
        },
        managerCtx: {
            i18n: plugin.i18n,
            app: plugin.app,
            openDoc: (id: string, zoomIn?: boolean) => plugin.openSiYuanTarget(id, Boolean(zoomIn)),
            openOnboarding: () => plugin.openOnboarding(),
            uiMode: plugin.settings.uiMode,
            onReviewed: (cb: () => void) => {
                const handler = () => cb();
                (plugin.eventBus as any).on(LV_EVENTS.reviewed, handler);
                return () => (plugin.eventBus as any).off(LV_EVENTS.reviewed, handler);
            },
            onStoresChanged: (cb: () => void) => {
                const handler = () => cb();
                (plugin.eventBus as any).on(LV_EVENTS.storesChanged, handler);
                return () => (plugin.eventBus as any).off(LV_EVENTS.storesChanged, handler);
            },
            savedFilters: () => plugin.settings.savedFilters,
            view: {
                initial: plugin.settings.lastManagerView || null,
                save: (v: string) => {
                    plugin.settings.lastManagerView = v;
                    plugin.saveSettingsSoon();
                },
            },
            saveFilter: (name: string, filter: string) => {
                const previous = normalizeSettings(cloneStore(plugin.settings));
                plugin.settings.savedFilters = [
                    ...plugin.settings.savedFilters.filter((f) => f.name !== name),
                    { name, filter },
                ];
                void plugin.saveSettingsNow().catch(() => {
                    plugin.settings = previous;
                    plugin.setupBadgeTimer();
                });
            },
            deleteFilter: (name: string) => {
                const previous = normalizeSettings(cloneStore(plugin.settings));
                plugin.settings.savedFilters = plugin.settings.savedFilters.filter((f) => f.name !== name);
                void plugin.saveSettingsNow().catch(() => {
                    plugin.settings = previous;
                    plugin.setupBadgeTimer();
                });
            },
            getLeechCards: () => {
                const items = leechCards(plugin.revlog, plugin.settings.leechThreshold);
                return items.map((i) => ({ blockID: i.blockID, lapses: i.lapses }));
            },
            getStarredCardIDs: () => plugin.settings.starredCards,
            toggleStarCard: async (id: string) => plugin.toggleStarCard(id),
            isNewBlock: (blockID: string) => !plugin.getRevlogBlockIndex().reviewedSet.has(blockID),
            getLapsesMap: () => plugin.getRevlogBlockIndex().lapsesMap,
            getBlockHistory: (blockID: string) =>
                plugin.revlog.entries
                    .filter((e) => e.blockID === blockID)
                    .map((e) => ({ rating: e.rating, ts: e.ts, dur: e.dur ?? null })),
            getBlockIssues: (blockID: string) =>
                plugin.inbox.items
                    .filter((i) => i.blockID === blockID && i.status !== "dismissed")
                    .map((i) => ({ addedAt: i.addedAt, status: i.status })),
            getDueBlockIDs: () => cachedDueBlockIDs(),
            relationsOfBlock: (blockID: string) => relationsOf(plugin.cardRelations, blockID),
            addRelation: async (from: string, to: string, type: string) => {
                await plugin.cardRelationsMutations((next) => {
                    if (!addRelation(next, from, to, type as RelationType)) {
                        throw new Error((plugin.i18n as any).review?.relations?.errDuplicate ?? "关系已存在");
                    }
                });
            },
            removeRelation: async (from: string, to: string, type: string) => {
                await plugin.cardRelationsMutations((next) => {
                    if (!removeRelation(next, from, to, type as RelationType)) {
                        throw new Error((plugin.i18n as any).review?.relations?.errMissing ?? "关系不存在");
                    }
                });
            },
            detachCards: async (blockIDs: string[]) => {
                if (!blockIDs.length) return;
                await plugin.cardRelationsMutations((next) => {
                    for (const id of blockIDs) {
                        detachCard(next, id);
                    }
                });
            },
            ko: {
                snapshot: (blockID: string) => {
                    const obj = findBySource(plugin.knowledgeObjects, blockID);
                    return obj
                        ? { registered: true, fact: obj.fact, instances: obj.instances.map((i) => ({ ...i })) }
                        : { registered: false, fact: "", instances: [] };
                },
                register: async (blockID: string, fact: string) => {
                    await plugin.knowledgeObjectsMutations((next) => {
                        if (findBySource(next, blockID)) {
                            throw new Error((plugin.i18n as any).review?.ko?.alreadyRegistered ?? "已登记对象");
                        }
                        registerObject(next, fact, blockID);
                    });
                },
                toggle: async (blockID: string, cardID: string, disabled: boolean) => {
                    await plugin.knowledgeObjectsMutations((next) => {
                        const obj = findBySource(next, blockID);
                        if (!obj || !toggleInstance(obj, cardID, disabled)) {
                            throw new Error((plugin.i18n as any).review?.ko?.instanceChanged ?? "实例已变化");
                        }
                    });
                },
                remove: async (blockID: string, cardID: string) => {
                    await plugin.knowledgeObjectsMutations((next) => {
                        const obj = findBySource(next, blockID);
                        if (!obj || !removeInstance(obj, cardID)) {
                            throw new Error((plugin.i18n as any).review?.ko?.instanceChanged ?? "实例已变化");
                        }
                    });
                },
                derive: async (blockID: string, cardType: string) => {
                    if (!findBySource(plugin.knowledgeObjects, blockID)) {
                        throw new Error((plugin.i18n as any).review?.ko?.instanceChanged ?? "对象不存在");
                    }
                    const { blocks } = await getRiffCardsByBlockIDs([blockID]);
                    const cardID = blocks?.[0]?.id;
                    if (!cardID) throw new Error((plugin.i18n as any).review?.ko?.deriveSourceMissing ?? "未找到实例");
                    await plugin.knowledgeObjectsMutations((next) => {
                        const obj = findBySource(next, blockID);
                        if (!obj) throw new Error((plugin.i18n as any).review?.ko?.instanceChanged ?? "对象不存在");
                        if (!deriveInstance(obj, { cardID, cardType })) {
                            throw new Error((plugin.i18n as any).review?.ko?.deriveDuplicate ?? "卡型已有实例");
                        }
                    });
                },
            },
            lc: {
                snapshot: (blockID: string) => {
                    const found = plugin.contentLifecycles.lifecycles.find((l) => l.blockID === blockID);
                    return found ? { state: found.state, history: found.history.map((h) => ({ ...h })) } : null;
                },
                open: async (blockID: string) => {
                    await delegates.contentLifecyclesMutations((next) => { ensureLifecycle(next, blockID); });
                },
                transition: async (blockID: string, to: ContentState, reason: string) => {
                    let changed = false;
                    await delegates.contentLifecyclesMutations((next) => {
                        changed = transition(ensureLifecycle(next, blockID), to, reason, Date.now());
                    });
                    return changed;
                },
                openReview: (cram: boolean, blockID = "") => plugin.openReviewWithEntry("all", cram, blockID
                    ? { entryKind: "card", sourceID: blockID, returnPoint: "hub:manage" }
                    : undefined),
                makeCards: (blockID: string, content: string) => {
                    void plugin.openAIWizard(content, () => {
                        const reason = (plugin.i18n as any).lc.reason;
                        void delegates.transitionContentState(blockID, "candidate", reason.candidate)
                            .then(() => delegates.transitionContentState(blockID, "reviewed", reason.reviewed))
                            .then(() => delegates.transitionContentState(blockID, "stocked", reason.stocked))
                            .catch(() => {});
                    });
                },
            },
            blockContent: async (blockID: string) => {
                try {
                    const rows = await sqlQuery(`SELECT markdown FROM blocks WHERE id='${blockID.replace(/'/g, "''")}'`);
                    const md = rows[0]?.markdown;
                    if (typeof md === "string" && md.trim() && plugin.contentVersions && versionsOf(plugin.contentVersions, blockID).length === 0) {
                        plugin.contentVersions = appendVersion(plugin.contentVersions, blockID, md, Date.now(), "editor");
                    }
                    return typeof md === "string" ? md : null;
                } catch {
                    return null;
                }
            },
            saveBlockContent: async (blockID: string, md: string) => {
                try {
                    return await plugin.saveBlockContentVersion(blockID, md);
                } catch (error) {
                    return error instanceof Error ? error.message : false;
                }
            },
            contentVersionsOf: (blockID: string) => versionsOf(plugin.contentVersions, blockID),
            acceptContentAt: async (blockID: string, at: number) => {
                await plugin.acceptContentVersion(blockID, at);
            },
        },
        exam: plugin.settings.modules.exam ? {
            plans: plugin.examPlans,
            getPlans: () => plugin.examPlans,
            subscribe: (cb: () => void) => delegates.subscribeExamPlans(cb),
            onSavePlan: (plan: ExamPlan) => delegates.saveExamPlan(plan),
            onDeletePlan: (id: string) => delegates.deleteExamPlan(id),
            onReport: (plan: ExamPlan) => generateExamReport(plugin, plan),
            onWriteReport: (plan: ExamPlan) => writeExamReportDoc(plugin, plan),
            onError: (message: string) => showMessage(message, 3500, "error"),
            onReviewScope: (kind: "all" | "deck" | "notebook", scopeId: string, cram: boolean, planId = "") =>
                plugin.openReviewScope(kind, scopeId, cram, planId),
            getRevlog: () => plugin.revlog,
            getDailyCap: () => plugin.settings.dailyReviewTarget,
        } : null,
        inbox: plugin.settings.modules.inbox ? {
            get: () => plugin.inbox,
            subscribe: (cb: () => void) => plugin.subscribeInbox(cb),
            setStatus: (blockIDs: string[], status: InboxStatus) => {
                void delegates.mutateInbox((inbox) => bulkSetStatus(inbox, blockIDs, status));
                return plugin.inbox;
            },
            undoSelection: (blockIDs: string[]) => {
                void delegates.mutateInbox((inbox) => undoSelection(inbox, blockIDs));
                return plugin.inbox;
            },
            remove: (blockIDs: string[]) => {
                void delegates.mutateInbox((inbox) => {
                    let changed = 0;
                    for (const id of blockIDs) if (removeInboxItem(inbox, id)) changed++;
                    return changed;
                });
                return plugin.inbox;
            },
            add: (blockIDs: string[]) => {
                let added = 0;
                void delegates.mutateInbox((inbox) => {
                    for (const id of blockIDs) {
                        if (addInboxItem(inbox, id)) added++;
                    }
                    return added;
                });
                return added;
            },
            loadSourcesForCards: (blockIDs: string[]) => delegates.loadInboxSources(blockIDs),
            completeCards: (blockIDs: string[]) => delegates.completeInboxCards(blockIDs),
            titles: (ids: string[]) => getDocTitles(ids),
            openSource: async (blockID: string) => {
                try {
                    plugin.openSiYuanTarget(blockID, false);
                } catch {
                    const rows = await sqlQuery(`SELECT root_id FROM blocks WHERE id='${blockID.replace(/'/g, "''")}'`);
                    plugin.openSiYuanTarget(rows[0]?.root_id ? String(rows[0].root_id) : blockID, false);
                }
            },
        } : null,
        goals: {
            get: () => plugin.learningGoals,
            save: (goal: LearningGoal) => delegates.saveLearningGoal(goal),
            remove: (id: string) => delegates.removeLearningGoal(id),
            narrate: (blockIDs: string[]) => {
                if (blockIDs.length === 0) return {};
                const ids = new Set(blockIDs);
                return lifecycleStats(plugin.contentLifecycles.lifecycles.filter((lc) => ids.has(lc.blockID)));
            },
        },
        maintenance: {
            scan: async () => {
                const hubSvc = deps.loadHubServices ? await deps.loadHubServices() : null;
                const findDups = hubSvc?.findApproximateDuplicateCandidates ?? (() => []);
                const out: { blockID: string; md: string; baselineMarkdown?: string; memo?: string; state?: string; rootID?: string; occlusion?: boolean; exists?: boolean; mediaRefs?: string[]; mediaBroken?: string[]; mediaUnknown?: string[]; sourceHealthIssues?: { kind: string; detail: string }[] }[] = [];
                let error = "";
                try {
                    const scan = await scanAllMaintenanceCardIds((page, pageSize) => getRiffCards("", page, pageSize));
                    const ids = scan.ids;
                    error = scan.error ?? (scan.issue
                        ? ((plugin.i18n as any).maintenance[scan.issue.kind === "empty-page" ? "scanEmptyPage" : "scanRepeatedPage"] as string)
                            .replace("${page}", String(scan.issue.page))
                        : "");
                    const info = new Map<string, { md: string; root: string; ial: string; memo: string }>();
                    for (let i = 0; i < ids.length; i += 50) {
                        const chunk = ids.slice(i, i + 50);
                        const rows = await sqlQuery(`SELECT id, markdown, root_id, ial, memo FROM blocks WHERE id IN (${chunk.map(id => `'${id.replace(/'/g, "''")}'`).join(",")})`);
                        for (const r of rows) {
                            const rIal = typeof r.ial === "string" ? r.ial : (r.ial && typeof r.ial === "object" ? JSON.stringify(r.ial) : String(r.ial ?? ""));
                            info.set(String(r.id), { md: String(r.markdown ?? ""), root: String(r.root_id ?? ""), ial: rIal, memo: String(r.memo ?? "") });
                        }
                    }
                    const occlusionIds = new Set<string>();
                    const occlusionCandidates = [...info.entries()].filter(([, meta]) => meta.ial.includes("lv-occlusion") && hasImageContent(meta.md));
                    await Promise.all(occlusionCandidates.map(async ([id, meta]) => {
                        if (await plugin.hasValidOcclusionCard(id, meta.md)) occlusionIds.add(id);
                    }));
                    const states = new Map<string, string>(plugin.contentLifecycles.lifecycles.map((l) => [String(l.blockID), String(l.state)]));
                    for (const id of ids) {
                        const meta = info.get(id);
                        const md = meta?.md ?? "";
                        out.push({
                            blockID: id,
                            md,
                            memo: meta?.memo,
                            rootID: meta?.root ?? "",
                            state: states.get(id),
                            occlusion: occlusionIds.has(id),
                            exists: Boolean(meta),
                            mediaRefs: extractMediaRefs(md).map(ref => ref.normalized),
                        });
                    }
                    const refs = [...new Set(out.flatMap(card => card.mediaRefs ?? []))];
                    if (refs.length > 0) {
                        const probe = await probeAssetRefs(refs);
                        const missing = new Set(probe.missing);
                        const unknown = new Set(probe.unknown.filter(ref => /^assets\//i.test(ref)));
                        for (const card of out) {
                            const broken = (card.mediaRefs ?? []).filter(ref => missing.has(ref));
                            const unresolved = (card.mediaRefs ?? []).filter(ref => unknown.has(ref));
                            if (broken.length > 0) card.mediaBroken = broken;
                            if (unresolved.length > 0) card.mediaUnknown = unresolved;
                        }
                    }
                    await plugin.reconcileSourceHealthForScan(out);
                    const leeches = leechCards(plugin.revlog, plugin.settings.leechThreshold);
                    for (const l of leeches) {
                        void setBlockAttrs(l.blockID, buildLeechAttrs(true, l.lapses)).catch(() => {});
                    }
                } catch (e) { error = e instanceof Error ? e.message : String(e); }
                return {
                    items: out,
                    sourceHealthHistory: sourceHealthHistories(plugin.sourceHealth),
                    approximateDuplicates: findDups(out),
                    error: error || undefined,
                };
            },
            previewRepair: (proposals: BatchRepairProposal[]) => plugin.maintenanceService.preview(proposals),
            applyRepair: (previewID: string) => plugin.maintenanceService.apply(previewID),
            getLastRepairRecord: () => {
                const entry = plugin.repairJournal.entries.find((e) => e.diffRecord.status === "applied");
                return entry ? {
                    previewID: entry.previewID,
                    appliedAt: entry.appliedAt,
                    summary: entry.summary,
                    diffs: entry.diffs,
                } : null;
            },
            rollbackLastRepair: () => plugin.maintenanceService.rollback(),
            acknowledgeSourceHealth: (blockID: string) => plugin.acknowledgeSourceHealth(blockID),
            suspendToday: (blockIDs: string[]) => plugin.suspendTodayMutations.suspend(blockIDs),
            unsuspendToday: (blockIDs: string[]) => plugin.suspendTodayMutations.unsuspend(blockIDs),
            isSuspendedToday: (blockID: string) => isSuspended(plugin.suspendToday, blockID),
            openSource: async (blockID: string) => {
                try {
                    plugin.openSiYuanTarget(blockID, false);
                } catch {
                    const rows = await sqlQuery(`SELECT root_id FROM blocks WHERE id='${blockID.replace(/'/g, "''")}'`);
                    plugin.openSiYuanTarget(rows[0]?.root_id ? String(rows[0].root_id) : blockID, false);
                }
            },
            openCard: (blockID: string) => plugin.openTabOf(TAB_DASHBOARD, { tab: "manage", focusBlockID: blockID }),
            openDynamicBoardDoc: () => plugin.openOrCreateDynamicBoardDoc(),
        },
        recovery: {
            load: async () => ({
                aiJobs: plugin.aiCardService.getRecoverableAIJobs(),
                inboxCount: plugin.inbox.items.filter((item) => item.status !== "dismissed").length,
                suspendedCount: plugin.suspendToday.cardIDs.length,
                session: (() => {
                    const state = plugin.sessionState;
                    const today = todayDate();
                    const reviewed = state.date === today ? state.reviewedIDs.length : 0;
                    const skipped = state.date === today ? state.skippedIDs.length : 0;
                    return reviewed > 0 || skipped > 0 ? { date: state.date, reviewed, skipped } : null;
                })(),
            }),
        },
    };
}

/**
 * 复习工作台（Review）宿主装配属性（Mobile Spec v2）：
 * 桌面页签 init 与手机端全屏 Dialog 宿主共用同源装配，避免双份 props 漂移。
 */
export function buildReviewMountProps(
    plugin: TabRegistrarHost,
    data?: Record<string, unknown>,
    hooks?: {
        onOpenDashboard?: (tab?: string) => void;
        onClose?: () => void;
    },
): Record<string, unknown> {
    const delegates = getHostDelegates(plugin);
    return {
        initialScope: (data?.scope as string) ?? plugin.settings.lastReviewScope,
        initialCram: data?.cram === true,
        initialEntry: ((): { entryKind: EntryKind; sourceID: string; scopeKey: string; returnPoint: string; createdAt: number } | null => {
            const direct = data?.entry as { entryKind: EntryKind; sourceID: string; returnPoint: string } | undefined;
            if (direct?.sourceID) {
                return { ...direct, scopeKey: String((data?.scope as string) ?? ""), createdAt: Date.now() };
            }
            const scope = (data?.scope as string) ?? plugin.settings.lastReviewScope ?? "";
            const fresh = plugin.entryContexts.contexts
                .filter((c) => c.scopeKey === scope && isContextFresh(c, Date.now()));
            return fresh.length ? { ...fresh[fresh.length - 1] } : null;
        })(),
        ctx: {
            i18n: plugin.i18n,
            app: plugin.app,
            isMobile: typeof plugin.isMobileHost === "function" ? plugin.isMobileHost() : false,
            closeMobileReviewDialog: hooks?.onClose ?? (() => plugin.mobileDialogController.closeReview()),
            onClose: hooks?.onClose,
            preferredBudgetMin: () => plugin.settings.sessionBudgetMin,
            settings: () => ({
                ratingStyle: plugin.settings.ratingStyle,
                timeoutMode: plugin.settings.timeoutMode,
                timeoutSeconds: plugin.settings.timeoutSeconds,
                randomOrder: plugin.settings.randomOrder,
                cardMaxWidth: plugin.settings.cardMaxWidth,
                choiceEnabled: plugin.settings.choiceEnabled,
                mixedRotation: plugin.settings.mixedRotation,
                ttsEnabled: plugin.settings.ttsEnabled,
                ttsRate: plugin.settings.ttsRate,
                ttsVoice: plugin.settings.ttsVoice,
                dictationEnabled: plugin.settings.dictationEnabled,
                requeueAgain: plugin.settings.requeueAgain,
                dailyReviewTarget: plugin.settings.dailyReviewTarget,
                cardFontScale: plugin.settings.cardFontScale,
                ratingDensity: plugin.settings.ratingDensity,
                hideMetaUntilAnswer: plugin.settings.hideMetaUntilAnswer,
                reverseOrder: plugin.settings.reverseOrder,
                dailyTipEnabled: plugin.settings.dailyTipEnabled,
                sfxEnabled: plugin.settings.sfxEnabled,
                sfxStyle: plugin.settings.sfxStyle,
                batchLimit: plugin.settings.batchLimit,
                typingEnabled: plugin.settings.typingEnabled,
                typingStrict: plugin.settings.typingStrict,
                answerTimeCapSec: plugin.settings.answerTimeCapSec,
                burySiblings: plugin.settings.burySiblings,
                customCardCss: plugin.settings.customCardCss,
                checkinItemId: plugin.settings.checkinItemId,
                leechThreshold: plugin.settings.leechThreshold,
            }),
            getStarredCardIDs: () => plugin.settings.starredCards,
            toggleStarCard: async (id: string) => plugin.toggleStarCard(id),
            appendRevlog: (e: any) => plugin.appendRevlog(e),
            rollbackRevlog: (cardID?: string) => plugin.rollbackRevlog(cardID),
            tagErrorReason: (cardID: string, reason: string, blockID?: string) => {
                plugin.tagErrorReason(cardID, reason as ErrorReason, blockID);
            },
            getKOBySource: (blockID: string) => {
                const obj = findBySource(plugin.knowledgeObjects, blockID);
                if (!obj) return null;
                const cap = obj.instances.find((i) => !i.disabled && i.capability)?.capability ?? null;
                return { fact: obj.fact, capability: cap };
            },
            getRevlog: () => plugin.revlog,
            isSuspendedToday: (cardID: string) => isSuspended(plugin.suspendToday, cardID),
            suspendToday: (cardID: string) => plugin.suspendTodayMutations.suspend([cardID]),
            unsuspendToday: (cardID: string) => plugin.suspendTodayMutations.unsuspend([cardID]),
            removeFromDeck: (blockID: string, deckID?: string) => plugin.removeCardsFromDeck([blockID], deckID),
            openDashboard: (tab?: string) => {
                if (hooks?.onOpenDashboard) {
                    hooks.onOpenDashboard(tab);
                    return;
                }
                plugin.openTabOf(TAB_DASHBOARD, tab ? { tab } : undefined);
            },
            returnToEntry: (returnPoint: string) => delegates.returnToEntryPoint(returnPoint),
            dismissEntry: (entryKind: EntryKind, sourceID: string) => {
                if (removeContext(plugin.entryContexts, entryKind, sourceID)) {
                    void plugin.saveEntryContexts();
                }
            },
            onScopePersist: (key: string) => {
                const previous = normalizeSettings(cloneStore(plugin.settings));
                plugin.settings.lastReviewScope = key;
                void plugin.saveSettingsNow().catch(() => {
                    plugin.settings = previous;
                    plugin.setupBadgeTimer();
                });
            },
            getSessionState: () => plugin.sessionState,
            saveSessionState: (s: SessionState) => {
                const previous = plugin.sessionState;
                const version = ++plugin.sessionMutationVersion;
                const next = normalizeSessionState(s, s?.date || todayDate());
                plugin.sessionState = next;
                const ensureReady = (!plugin.tier2Ready && typeof (plugin as any).ensureTier2Loaded === "function")
                    ? (plugin as any).ensureTier2Loaded()
                    : Promise.resolve();
                void ensureReady.then(() => plugin.persist.save(SESSION_STATE_DATA, next)).then(() => {
                    plugin.persistedSessionStateSnapshot = cloneStore(next);
                }).catch(() => {
                    if (version === plugin.sessionMutationVersion) {
                        plugin.sessionState = cloneStore(plugin.persistedSessionStateSnapshot ?? previous);
                    }
                });
            },
            clearSessionState: () => {
                void plugin.clearSessionState();
            },
            emitSessionFinished: (summary: { new: number; review: number; forget: number; skip: number }) => {
                try {
                    (plugin.eventBus as any).emit(LV_EVENTS.sessionFinished, sessionFinishedEvent(summary));
                } catch {}
                plugin.refreshDueBadge();
            },
            onSettingsChanged: (cb: () => void) => {
                const handler = () => cb();
                (plugin.eventBus as any).on(LV_EVENTS.settingsChanged, handler);
                return () => (plugin.eventBus as any).off(LV_EVENTS.settingsChanged, handler);
            },
            getReturnCheckFacts: async () => {
                const today = todayDate();
                const active = plugin.learningGoals.goals.filter((g) => isGoalActive(g, today));
                const deadlines = active
                    .map((g) => daysUntilDeadline(g, today))
                    .filter((n): n is number => n !== null);
                const stats = lifecycleStats(plugin.contentLifecycles.lifecycles);
                let dueCount = 0;
                try {
                    dueCount = (await dueCache.get("")).cards?.length ?? 0;
                } catch {}
                const lastTs = plugin.revlog.entries.reduce((m, e) => Math.max(m, e.ts ?? 0), 0);
                return {
                    activeGoals: active.length,
                    nearestDeadlineDays: deadlines.length ? Math.min(...deadlines) : null,
                    staleCount: stats.stale ?? 0,
                    needsRevisionCount: stats.needsRevision ?? 0,
                    dueCount,
                    daysSinceLastStudy: lastTs > 0 ? Math.floor((Date.now() - lastTs) / 86400000) : null,
                    clockSkewSuspect: lastTs > Date.now(),
                    crossDeviceRestore: false,
                };
            },
            getContextBlocks: async (blockID: string) => {
                const safe = blockID.replace(/'/g, "''");
                const root = await sqlQuery(`SELECT root_id FROM blocks WHERE id='${safe}' LIMIT 1`);
                if (!root.length) { return []; }
                const rootId = String(root[0].root_id ?? "").replace(/'/g, "''");
                const sibs = await sqlQuery(`SELECT id FROM blocks WHERE root_id='${rootId}' AND type IN ('p','t','h','c','ta','tb') ORDER BY sort, id LIMIT 2000`);
                const idx = sibs.findIndex((b) => String(b.id) === blockID);
                if (idx < 0) { return []; }
                const window = sibs.slice(Math.max(0, idx - 2), idx + 3).filter((b) => String(b.id) !== blockID);
                const out: { id: string; html: string }[] = [];
                for (const b of window) {
                    try {
                        const dom = await getBlockDOM(String(b.id));
                        if (dom) {
                            out.push({ id: String(b.id), html: dom });
                        }
                    } catch {}
                }
                return out;
            },
        },
    };
}

export function registerReviewTab(plugin: TabRegistrarHost, deps: TabDeps): void {
    plugin.addTab({
        type: TAB_REVIEW,
        init() {
            const div = document.createElement("div");
            div.className = "lv-cards-root";
            div.style.height = "100%";
            this.element.appendChild(div);
            let isDisposed = false;
            let reviewHandle: { destroy(): void } | null = null;
            this.destroy = () => {
                isDisposed = true;
                reviewHandle?.destroy();
            };
            const tier2Promise = typeof (plugin as any).ensureTier2Loaded === "function"
                ? (plugin as any).ensureTier2Loaded().catch(() => {})
                : Promise.resolve();
            deps.loadReviewMount().then(async (mnt) => {
                await tier2Promise;
                if (isDisposed || !div.isConnected) {
                    return;
                }
                reviewHandle = mnt(div, buildReviewMountProps(plugin, this.data));
            }).catch((e: unknown) => {
                if (!isDisposed && div.isConnected) deps.mountChunkFallback(div, plugin.i18n, e);
            });
        },
    });
}
