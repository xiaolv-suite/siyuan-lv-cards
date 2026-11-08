/**
 * 小驴闪卡 页签装配器（Tab Registrars）
 *
 * 负责闪卡中心（TAB_DASHBOARD）与复习工作台（TAB_REVIEW）的加载挂载、
 * 视图销毁守护、多领域上下文（dashboardBase、managerCtx、exam、inbox、goals、maintenance）装配，
 * 将庞大的生命周期装配与主入口解耦，使 src/index.ts 保持高度轻量与高内聚。
 */

import { openTab } from "siyuan";
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
import { normalizeSettings } from "@/core/settings";
import { normalizeSessionState, type SessionState } from "@/core/session-state";
import { isGoalActive, daysUntilDeadline, type LearningGoal } from "@/core/learning-goal";
import { LV_EVENTS, sessionFinishedEvent } from "@/libs/events";
import { SESSION_STATE_DATA } from "@/bootstrap/storage-keys";
import type { BatchRepairProposal } from "@/core/maintenance-repair";

function cloneStore<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

export const TAB_DASHBOARD = "lv-cards-dashboard";
export const TAB_REVIEW = "lv-cards-review";

const todayDate = () => localDate(Date.now());

export interface TabDeps {
    loadHubMount: () => Promise<(el: HTMLElement, props: any) => { destroy(): void }>;
    loadReviewMount: () => Promise<(el: HTMLElement, props: any) => { destroy(): void }>;
    mountChunkFallback: (el: HTMLElement, i18n: any, error: unknown) => void;
    loadHubServices?: () => Promise<any>;
}

export function registerDashboardTab(plugin: any, deps: TabDeps): void {
    plugin.addTab({
        type: TAB_DASHBOARD,
        init() {
            const div = document.createElement("div");
            div.style.height = "100%";
            let handle: { destroy(): void } | null = null;
            let hubDisposed = false;

            void deps.loadHubMount().then((mnt) => {
                if (hubDisposed) return;
                handle = mnt(div, buildHubMountProps(plugin, deps, this.data));
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
    plugin: any,
    deps: TabDeps,
    data?: Record<string, unknown>,
    hooks?: { onCloseMobile?: () => void },
): Record<string, unknown> {
    return {
        i18n: plugin.i18n,
        initialTab: (data?.tab as string) || "overview",
        initialBlockID: typeof data?.focusBlockID === "string" ? data.focusBlockID : "",
        onCloseMobile: hooks?.onCloseMobile,
                    uiMode: plugin.settings.uiMode,
                    openWizard: () => plugin.openAIWizard(),
                    openDrill: () => plugin.openRepairDrill(),
                    openChallenge: () => plugin.openChallenge(),
                    openPairing: () => plugin.openPairing(),
                    openQuickCard: () => plugin.openQuickCard(),
                    loadWizardView: (sources?: { label: string; content: string; docId?: string; nbId?: string; inboxId?: string }[], onImportComplete?: (ids: string[]) => void, recoveryJobId?: string) =>
                        plugin.createAIWizardView("", undefined, sources, onImportComplete, recoveryJobId, true),
                    loadQuickCardView: () => plugin.createQuickCardView(true),
                    openSettings: (onSaved?: () => void) => plugin.openSettingsDialog(onSaved),
                    getSettingsHealth: () => ({
                        aiConfigured: plugin.settings.aiMode === "siyuan" || Boolean(plugin.settings.aiEndpoint && plugin.settings.aiKey),
                    }),
                    openPalette: () => plugin.openPalette(),
                    onTabChange: (id: string) => {
                        plugin.settings.lastHubTab = id;
                        plugin.saveSettingsSoon();
                    },
                    dashboardBase: {
                        i18n: plugin.i18n,
                        app: plugin.app,
                        getRevlog: () => plugin.revlog,
                        getV2Status: () => plugin.flashcardV2,
                        getDailyTargets: () => ({
                            new: plugin.settings.dailyNewTarget,
                            review: plugin.settings.dailyReviewTarget,
                        }),
                        getSessionState: () => plugin.sessionState,
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
                        getInboxOpenCount: () => plugin.inbox.items.filter((i: any) => i.status !== "dismissed").length,
                        getSuspendedCount: () => plugin.suspendToday.cardIDs.length,
                        getMaintenanceDebtCount: () => {
                            return plugin.sourceHealth.entries.filter((e: any) => e.history.some((h: any) => !h.resolved)).length;
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
                            return items.map((i: any) => ({ blockID: i.blockID, lapses: i.lapses }));
                        },
                        rewriteWithAI: (blockID: string) => plugin.openAIWizard(blockID),
                        writeReportDoc: (md: string) => plugin.writeReportDoc(md),
                        getExamCountdown: () => {
                            const plan = plugin.examPlans.plans.find((p: any) => p.enabled && p.examDate && !p.archived);
                            const left = plan ? daysLeft(plan.examDate) : null;
                            if (plan && left !== null && left >= 0) {
                                return { name: plan.name, days: left };
                            }
                            if ((plugin as any).cachedExamLinkage && (plugin as any).cachedExamLinkage.days >= 0) {
                                return (plugin as any).cachedExamLinkage;
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
                                const blockIDs = Array.from<string>(new Set(plugin.revlog.entries.filter((e: any) => e.rating > 0 && e.blockID).map((e: any) => String(e.blockID))));
                                if (blockIDs.length === 0) {
                                    return { docs: [], unattributed: 0 };
                                }
                                const docMap = await getBlockDocMap(blockIDs);
                                const agg = docCoverage(plugin.revlog, (blockID: string) => docMap.get(blockID)?.rootID ?? null);
                                const titles = await getDocTitles(agg.docs.map((d: any) => d.docID));
                                const docs = agg.docs
                                    .map((d: any) => ({ docID: d.docID, title: titles.get(d.docID) || "", seen: d.seen }))
                                    .sort((a: any, b: any) => b.seen - a.seen);
                                return { docs, unattributed: agg.unattributed };
                            } catch {
                                return null;
                            }
                        },
                        getHeatmapWeeks: () => plugin.settings.heatmapWeeks,
                        getCapabilityShare: () => {
                            const all = plugin.knowledgeObjects.objects.flatMap((o: any) => o.instances);
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
                                ...plugin.settings.savedFilters.filter((f: any) => f.name !== name),
                                { name, filter },
                            ];
                            void plugin.saveSettingsNow().catch(() => {
                                plugin.settings = previous;
                                plugin.setupBadgeTimer();
                            });
                        },
                        deleteFilter: (name: string) => {
                            const previous = normalizeSettings(cloneStore(plugin.settings));
                            plugin.settings.savedFilters = plugin.settings.savedFilters.filter((f: any) => f.name !== name);
                            void plugin.saveSettingsNow().catch(() => {
                                plugin.settings = previous;
                                plugin.setupBadgeTimer();
                            });
                        },
                        getLeechCards: () => {
                            const items = leechCards(plugin.revlog, plugin.settings.leechThreshold);
                            return items.map((i: any) => ({ blockID: i.blockID, lapses: i.lapses }));
                        },
                        getStarredCardIDs: () => plugin.settings.starredCards,
                        toggleStarCard: async (id: string) => plugin.toggleStarCard(id),
                        isNewBlock: (blockID: string) => !plugin.getRevlogBlockIndex().reviewedSet.has(blockID),
                        getLapsesMap: () => plugin.getRevlogBlockIndex().lapsesMap,
                        getBlockHistory: (blockID: string) =>
                            plugin.revlog.entries
                                .filter((e: any) => e.blockID === blockID)
                                .map((e: any) => ({ rating: e.rating, ts: e.ts, dur: e.dur ?? null })),
                        getBlockIssues: (blockID: string) =>
                            plugin.inbox.items
                                .filter((i: any) => i.blockID === blockID && i.status !== "dismissed")
                                .map((i: any) => ({ addedAt: i.addedAt, status: i.status })),
                        getDueBlockIDs: () => cachedDueBlockIDs(),
                        relationsOfBlock: (blockID: string) => relationsOf(plugin.cardRelations, blockID),
                        addRelation: async (from: string, to: string, type: string) => {
                            await plugin.cardRelationsMutations((next: any) => {
                                if (!addRelation(next, from, to, type as RelationType)) {
                                    throw new Error((plugin.i18n as any).review?.relations?.errDuplicate ?? "关系已存在");
                                }
                            });
                        },
                        removeRelation: async (from: string, to: string, type: string) => {
                            await plugin.cardRelationsMutations((next: any) => {
                                if (!removeRelation(next, from, to, type as RelationType)) {
                                    throw new Error((plugin.i18n as any).review?.relations?.errMissing ?? "关系不存在");
                                }
                            });
                        },
                        detachCards: async (blockIDs: string[]) => {
                            if (!blockIDs.length) return;
                            await plugin.cardRelationsMutations((next: any) => {
                                for (const id of blockIDs) {
                                    detachCard(next, id);
                                }
                            });
                        },
                        ko: {
                            snapshot: (blockID: string) => {
                                const obj = findBySource(plugin.knowledgeObjects, blockID);
                                return obj
                                    ? { registered: true, fact: obj.fact, instances: obj.instances.map((i: any) => ({ ...i })) }
                                    : { registered: false, fact: "", instances: [] };
                            },
                            register: async (blockID: string, fact: string) => {
                                await plugin.knowledgeObjectsMutations((next: any) => {
                                    if (findBySource(next, blockID)) {
                                        throw new Error((plugin.i18n as any).review?.ko?.alreadyRegistered ?? "已登记对象");
                                    }
                                    registerObject(next, fact, blockID);
                                });
                            },
                            toggle: async (blockID: string, cardID: string, disabled: boolean) => {
                                await plugin.knowledgeObjectsMutations((next: any) => {
                                    const obj = findBySource(next, blockID);
                                    if (!obj || !toggleInstance(obj, cardID, disabled)) {
                                        throw new Error((plugin.i18n as any).review?.ko?.instanceChanged ?? "实例已变化");
                                    }
                                });
                            },
                            remove: async (blockID: string, cardID: string) => {
                                await plugin.knowledgeObjectsMutations((next: any) => {
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
                                await plugin.knowledgeObjectsMutations((next: any) => {
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
                                const found = plugin.contentLifecycles.lifecycles.find((l: any) => l.blockID === blockID);
                                return found ? { state: found.state, history: found.history.map((h: any) => ({ ...h })) } : null;
                            },
                            open: async (blockID: string) => {
                                await plugin.contentLifecyclesMutations((next: any) => { ensureLifecycle(next, blockID); });
                            },
                            transition: async (blockID: string, to: ContentState, reason: string) => {
                                let changed = false;
                                await plugin.contentLifecyclesMutations((next: any) => {
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
                                    void plugin.transitionContentState(blockID, "candidate", reason.candidate)
                                        .then(() => plugin.transitionContentState(blockID, "reviewed", reason.reviewed))
                                        .then(() => plugin.transitionContentState(blockID, "stocked", reason.stocked))
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
                        subscribe: (cb: () => void) => plugin.subscribeExamPlans(cb),
                        onSavePlan: (plan: ExamPlan) => plugin.saveExamPlan(plan),
                        onDeletePlan: (id: string) => plugin.deleteExamPlan(id),
                        onReport: (plan: ExamPlan) => plugin.generateExamReport(plan),
                        onWriteReport: (plan: ExamPlan) => plugin.writeExamReportDoc(plan),
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
                            plugin.mutateInbox((inbox: any) => bulkSetStatus(inbox, blockIDs, status));
                            return plugin.inbox;
                        },
                        undoSelection: (blockIDs: string[]) => {
                            plugin.mutateInbox((inbox: any) => undoSelection(inbox, blockIDs));
                            return plugin.inbox;
                        },
                        remove: (blockIDs: string[]) => {
                            plugin.mutateInbox((inbox: any) => {
                                let changed = 0;
                                for (const id of blockIDs) if (removeInboxItem(inbox, id)) changed++;
                                return changed;
                            });
                            return plugin.inbox;
                        },
                        add: (blockIDs: string[]) => {
                            let added = 0;
                            plugin.mutateInbox((inbox: any) => {
                                for (const id of blockIDs) {
                                    if (addInboxItem(inbox, id)) added++;
                                }
                                return added;
                            });
                            return added;
                        },
                        loadSourcesForCards: (blockIDs: string[]) => plugin.loadInboxSources(blockIDs),
                        completeCards: (blockIDs: string[]) => plugin.completeInboxCards(blockIDs),
                        titles: (ids: string[]) => getDocTitles(ids),
                        openSource: async (blockID: string) => {
                            try {
                                openTab({ app: plugin.app, doc: { id: blockID, zoomIn: false } });
                            } catch {
                                const rows = await sqlQuery(`SELECT root_id FROM blocks WHERE id='${blockID.replace(/'/g, "''")}'`);
                                openTab({ app: plugin.app, doc: { id: rows[0]?.root_id ? String(rows[0].root_id) : blockID } });
                            }
                        },
                    } : null,
                    goals: {
                        get: () => plugin.learningGoals,
                        save: (goal: LearningGoal) => plugin.saveLearningGoal(goal),
                        remove: (id: string) => plugin.removeLearningGoal(id),
                        narrate: (blockIDs: string[]) => {
                            if (blockIDs.length === 0) return {};
                            const ids = new Set(blockIDs);
                            return lifecycleStats(plugin.contentLifecycles.lifecycles.filter((lc: any) => ids.has(lc.blockID)));
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
                                    for (const r of rows) info.set(String(r.id), { md: String(r.markdown ?? ""), root: String(r.root_id ?? ""), ial: String(r.ial ?? ""), memo: String(r.memo ?? "") });
                                }
                                const occlusionIds = new Set<string>();
                                const occlusionCandidates = [...info.entries()].filter(([, meta]) => meta.ial.includes("lv-occlusion") && hasImageContent(meta.md));
                                await Promise.all(occlusionCandidates.map(async ([id, meta]) => {
                                    if (await plugin.hasValidOcclusionCard(id, meta.md)) occlusionIds.add(id);
                                }));
                                const states = new Map<string, string>(plugin.contentLifecycles.lifecycles.map((l: any) => [String(l.blockID), String(l.state)]));
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
                        previewRepair: (proposals: BatchRepairProposal[]) => plugin.previewMaintenanceRepair(proposals),
                        applyRepair: (previewID: string) => plugin.applyMaintenanceRepair(previewID),
                        getLastRepairRecord: () => {
                            const entry = plugin.repairJournal.entries.find((e: any) => e.diffRecord.status === "applied");
                            return entry ? {
                                previewID: entry.previewID,
                                appliedAt: entry.appliedAt,
                                summary: entry.summary,
                                diffs: entry.diffs,
                            } : null;
                        },
                        rollbackLastRepair: () => plugin.rollbackLastMaintenanceRepair(),
                        acknowledgeSourceHealth: (blockID: string) => plugin.acknowledgeSourceHealth(blockID),
                        suspendToday: (blockIDs: string[]) => plugin.suspendTodayMutations.suspend(blockIDs),
                        unsuspendToday: (blockIDs: string[]) => plugin.suspendTodayMutations.unsuspend(blockIDs),
                        isSuspendedToday: (blockID: string) => isSuspended(plugin.suspendToday, blockID),
                        openSource: async (blockID: string) => {
                            try {
                                openTab({ app: plugin.app, doc: { id: blockID, zoomIn: false } });
                            } catch {
                                const rows = await sqlQuery(`SELECT root_id FROM blocks WHERE id='${blockID.replace(/'/g, "''")}'`);
                                openTab({ app: plugin.app, doc: { id: rows[0]?.root_id ? String(rows[0].root_id) : blockID } });
                            }
                        },
                        openCard: (blockID: string) => plugin.openTabOf(TAB_DASHBOARD, { tab: "manage", focusBlockID: blockID }),
                        openDynamicBoardDoc: () => plugin.openOrCreateDynamicBoardDoc(),
                    },
                    recovery: {
                        load: async () => ({
                            aiJobs: plugin.getRecoverableAIJobs(),
                            inboxCount: plugin.inbox.items.filter((item: any) => item.status !== "dismissed").length,
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
    plugin: any,
    data?: Record<string, unknown>,
    hooks?: {
        onOpenDashboard?: (tab?: string) => void;
        onClose?: () => void;
    },
): Record<string, unknown> {
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
                .filter((c: any) => c.scopeKey === scope && isContextFresh(c, Date.now()));
            return fresh.length ? { ...fresh[fresh.length - 1] } : null;
        })(),
        ctx: {
            i18n: plugin.i18n,
            app: plugin.app,
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
                const cap = obj.instances.find((i: any) => !i.disabled && i.capability)?.capability ?? null;
                return { fact: obj.fact, capability: cap };
            },
            getRevlog: () => plugin.revlog,
            isSuspendedToday: (cardID: string) => isSuspended(plugin.suspendToday, cardID),
            suspendToday: (cardID: string) => {
                void plugin.suspendTodayMutations.suspend([cardID]).catch(() => {});
            },
            removeFromDeck: (blockID: string) => plugin.removeCardsFromDeck([blockID]),
            openDashboard: (tab?: string) => {
                if (hooks?.onOpenDashboard) {
                    hooks.onOpenDashboard(tab);
                    return;
                }
                plugin.openTabOf(TAB_DASHBOARD, tab ? { tab } : undefined);
            },
            returnToEntry: (returnPoint: string) => plugin.returnToEntryPoint(returnPoint),
            dismissEntry: (entryKind: EntryKind, sourceID: string) => {
                if (removeContext(plugin.entryContexts, entryKind, sourceID)) {
                    plugin.saveEntryContexts();
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
                const next = normalizeSessionState(s, todayDate());
                plugin.sessionState = next;
                void plugin.persist.save(SESSION_STATE_DATA, next).then(() => {
                    plugin.persistedSessionStateSnapshot = cloneStore(next);
                }).catch(() => {
                    if (version === plugin.sessionMutationVersion) {
                        plugin.sessionState = cloneStore(plugin.persistedSessionStateSnapshot ?? previous);
                    }
                    showMessage(plugin.i18n.storageWriteFail, 4000, "error");
                });
            },
            clearSessionState: () => {
                const previous = plugin.sessionState;
                const version = ++plugin.sessionMutationVersion;
                plugin.sessionState = { date: "", reviewedIDs: [], skippedIDs: [], counters: { new: 0, review: 0, forget: 0, skip: 0 } };
                const next = plugin.sessionState;
                void plugin.persist.save(SESSION_STATE_DATA, next).then(() => {
                    plugin.persistedSessionStateSnapshot = cloneStore(next);
                }).catch(() => {
                    if (version === plugin.sessionMutationVersion) {
                        plugin.sessionState = cloneStore(plugin.persistedSessionStateSnapshot ?? previous);
                    }
                    showMessage(plugin.i18n.storageWriteFail, 4000, "error");
                });
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
                const active = plugin.learningGoals.goals.filter((g: any) => isGoalActive(g, today));
                const deadlines = active
                    .map((g: any) => daysUntilDeadline(g, today))
                    .filter((n: any): n is number => n !== null);
                const stats = lifecycleStats(plugin.contentLifecycles.lifecycles);
                let dueCount = 0;
                try {
                    dueCount = (await dueCache.get("")).cards?.length ?? 0;
                } catch {}
                const lastTs = plugin.revlog.entries.reduce((m: number, e: any) => Math.max(m, e.ts ?? 0), 0);
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
                const sibs = await sqlQuery(`SELECT id FROM blocks WHERE root_id='${rootId}' AND type IN ('p','t','h','c','ta','tb') ORDER BY sort, id`);
                const idx = sibs.findIndex((b: any) => String(b.id) === blockID);
                if (idx < 0) { return []; }
                const window = sibs.slice(Math.max(0, idx - 2), idx + 3).filter((b: any) => String(b.id) !== blockID);
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

export function registerReviewTab(plugin: any, deps: TabDeps): void {
    plugin.addTab({
        type: TAB_REVIEW,
        init() {
            const div = document.createElement("div");
            div.style.height = "100%";
            this.element.appendChild(div);
            let isDisposed = false;
            let reviewHandle: { destroy(): void } | null = null;
            this.destroy = () => {
                isDisposed = true;
                reviewHandle?.destroy();
            };
            deps.loadReviewMount().then(mnt => {
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
