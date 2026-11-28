/**
 * 宿主领域委托控制器（Host Delegates）
 *
 * 承接从 src/index.ts 剥离的真实业务委托（内容生命周期队列、考试计划同步、收件箱来源与入库闭环、
 * 学习目标持久化队列、入口返回点路由），以 WeakMap 为每个宿主实例维护独立串行队列，
 * 避免膨胀主入口行数同时保持 100% 强类型契约与零空壳假桩。
 */

import { lvLog } from "@/libs/log";
import { exportMdContent, sqlQuery } from "@/api/siyuan";
import { createSnapshotMutationQueue } from "@/core/snapshot-mutation-queue";
import { ensureLifecycle, transition, type ContentLifecyclesData, type ContentState } from "@/core/content-lifecycle";
import { type ExamPlan, type ExamPlansData } from "@/core/exam";
import {
    createExamPlansChangedNotice,
    EXAM_PLANS_PUBLISH_RPC,
    isKernelPluginRunning,
    persistThenNotify,
} from "@/core/exam-plan-sync";
import { normalizeInbox, removeInboxItem, type InboxData } from "@/core/inbox";
import { type LearningGoal, type LearningGoalsData } from "@/core/learning-goal";
import { parseReturnPoint } from "@/core/palette-navigation";
import { LV_EVENTS } from "@/libs/events";
import {
    CONTENT_LIFECYCLES_DATA,
    EXAM_PLANS_DATA,
    INBOX_DATA,
    LEARNING_GOALS_DATA,
} from "@/bootstrap/storage-keys";
import { TAB_DASHBOARD } from "@/bootstrap/tab-constants";
import type { TabRegistrarHost } from "@/bootstrap/tab-host";

function cloneStore<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

export interface InboxSourceEntry {
    label: string;
    content: string;
    docId?: string;
    inboxId: string;
}

export interface HostDelegates {
    contentLifecyclesMutations: (mutate: (next: ContentLifecyclesData) => void) => Promise<ContentLifecyclesData>;
    transitionContentState: (blockID: string, to: ContentState, reason: string) => Promise<boolean>;
    subscribeExamPlans: (cb: () => void) => () => void;
    saveExamPlan: (plan: ExamPlan) => Promise<ExamPlansData>;
    deleteExamPlan: (id: string) => Promise<ExamPlansData>;
    mutateInbox: (mutate: (next: InboxData) => number | boolean | void) => Promise<void>;
    loadInboxSources: (blockIDs: string[]) => Promise<InboxSourceEntry[]>;
    completeInboxCards: (blockIDs: string[]) => void;
    saveLearningGoal: (goal: LearningGoal) => Promise<LearningGoalsData>;
    removeLearningGoal: (id: string) => Promise<LearningGoalsData>;
    returnToEntryPoint: (returnPoint: string) => void;
}

const delegateCache = new WeakMap<TabRegistrarHost, HostDelegates>();

export function getHostDelegates(plugin: TabRegistrarHost): HostDelegates {
    const cached = delegateCache.get(plugin);
    if (cached) return cached;

    const rawContentLifecyclesQueue = createSnapshotMutationQueue<ContentLifecyclesData>(
        () => plugin.contentLifecycles,
        (current) => ({
            version: 1,
            lifecycles: current.lifecycles.map((item) => ({
                ...item,
                history: item.history.map((entry) => ({ ...entry })),
            })),
        }),
        (next) => plugin.storageCoordinator.save(CONTENT_LIFECYCLES_DATA, next),
        (next) => {
            plugin.contentLifecycles = next;
        },
    );

    const contentLifecyclesMutations = async (
        mutate: (next: ContentLifecyclesData) => void,
    ): Promise<ContentLifecyclesData> => {
        if (!plugin.tier2Ready) {
            await plugin.ensureTier2Loaded();
        }
        return rawContentLifecyclesQueue(mutate);
    };

    const transitionContentState = async (
        blockID: string,
        to: ContentState,
        reason: string,
    ): Promise<boolean> => {
        let changed = false;
        await contentLifecyclesMutations((next) => {
            changed = transition(ensureLifecycle(next, blockID), to, reason, Date.now());
            if (!changed) throw new Error("invalid content lifecycle transition");
        });
        return changed;
    };

    const examPlansQueue = createSnapshotMutationQueue<ExamPlansData>(
        () => plugin.examPlans,
        (current) => ({ version: 1, plans: current.plans.map((plan) => ({ ...plan })) }),
        (next) => plugin.storageCoordinator.save(EXAM_PLANS_DATA, next),
        (next) => {
            plugin.examPlans = next;
        },
    );

    const persistExamPlansAndNotify = (mutate: (plans: ExamPlansData) => void): Promise<ExamPlansData> =>
        persistThenNotify(
            () => examPlansQueue(mutate),
            async () => {
                if (!plugin.kernel?.rpc || !isKernelPluginRunning(plugin.kernel?.state?.code)) return;
                const notice = createExamPlansChangedNotice(plugin.examPlansSourceID, ++plugin.examPlansSequence);
                await plugin.kernel.rpc.call[EXAM_PLANS_PUBLISH_RPC](notice);
            },
            (error) => lvLog("warn", `[exam-plans-sync] notification failed: ${error instanceof Error ? error.message : String(error)}`),
        );

    const subscribeExamPlans = (cb: () => void): (() => void) => {
        const handler = () => cb();
        (plugin.eventBus as any).on(LV_EVENTS.storesChanged, handler);
        return () => (plugin.eventBus as any).off(LV_EVENTS.storesChanged, handler);
    };

    const saveExamPlan = (plan: ExamPlan): Promise<ExamPlansData> =>
        persistExamPlansAndNotify((plans) => {
            const i = plans.plans.findIndex((x) => x.id === plan.id);
            if (i >= 0) plans.plans[i] = plan;
            else plans.plans.push(plan);
        });

    const deleteExamPlan = (id: string): Promise<ExamPlansData> =>
        persistExamPlansAndNotify((plans) => {
            plans.plans = plans.plans.filter((plan) => plan.id !== id);
        });

    const mutateInbox = async (mutate: (next: InboxData) => number | boolean | void): Promise<void> => {
        if (!plugin.tier2Ready) {
            await plugin.ensureTier2Loaded();
        }
        const previous = cloneStore(plugin.persistedInboxSnapshot ?? normalizeInbox(cloneStore(plugin.inbox)));
        const changed = mutate(plugin.inbox);
        if (changed === false || changed === 0) return;
        const version = ++plugin.inboxMutationVersion;
        plugin.notifyInboxChanged();
        const next = cloneStore(plugin.inbox);
        void plugin.storageCoordinator.save(INBOX_DATA, next).then(() => {
            plugin.persistedInboxSnapshot = cloneStore(next);
        }).catch(() => {
            if (version === plugin.inboxMutationVersion) {
                plugin.inbox = previous;
                plugin.notifyInboxChanged();
            }
            plugin.showStorageFail();
        });
    };

    const loadInboxSources = async (blockIDs: string[]): Promise<InboxSourceEntry[]> => {
        if (blockIDs.length === 0) return [];
        const ids = blockIDs.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
        const rows = await sqlQuery(`SELECT id, type, content, root_id FROM blocks WHERE id IN (${ids})`);
        const byID = new Map(rows.map((r: any) => [String(r.id), {
            type: String(r.type ?? ""),
            content: String(r.content ?? "").trim(),
            rootID: String(r.root_id ?? ""),
        }]));
        for (const [id, item] of byID) {
            if (item.type === "d") item.content = (await exportMdContent(id)).content;
        }
        return blockIDs.flatMap((id) => {
            const item = byID.get(id);
            if (!item?.content) return [];
            const label = item.content.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim().slice(0, 40) || id.slice(0, 8);
            return [{ label, content: item.content, docId: item.rootID || undefined, inboxId: id }];
        });
    };

    const completeInboxCards = (blockIDs: string[]): void => {
        const unique = [...new Set(blockIDs.filter(Boolean))];
        if (unique.length === 0) return;
        void mutateInbox((inbox) => {
            let changed = 0;
            for (const id of unique) if (removeInboxItem(inbox, id)) changed++;
            return changed;
        });
        for (const id of unique) {
            void transitionContentState(id, "candidate", "收件箱入选")
                .then(() => transitionContentState(id, "reviewed", "向导逐张确认"))
                .then(() => transitionContentState(id, "stocked", "制卡入库"))
                .catch(() => { /* 生命周期旁路失败由持久化错误提示承接 */ });
        }
    };

    const rawLearningGoalsQueue = createSnapshotMutationQueue<LearningGoalsData>(
        () => plugin.learningGoals,
        (current) => ({
            version: 1,
            goals: current.goals.map((goal) => ({
                ...goal,
                materialBlockIDs: [...goal.materialBlockIDs],
                criteriaHistory: goal.criteriaHistory?.map((item) => ({ ...item })),
            })),
        }),
        (next) => plugin.storageCoordinator.save(LEARNING_GOALS_DATA, next),
        (next) => {
            plugin.learningGoals = next;
        },
    );

    const mutateLearningGoals = async (mutate: (next: LearningGoalsData) => void): Promise<LearningGoalsData> => {
        if (!plugin.tier2Ready) {
            await plugin.ensureTier2Loaded();
        }
        return rawLearningGoalsQueue(mutate);
    };

    const saveLearningGoal = (goal: LearningGoal): Promise<LearningGoalsData> =>
        mutateLearningGoals((next) => {
            const g: LearningGoal = {
                ...goal,
                updatedAt: Date.now(),
                materialBlockIDs: [...goal.materialBlockIDs],
                criteriaHistory: goal.criteriaHistory?.map((item) => ({ ...item })),
            };
            if (!g.id) g.id = `goal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            const i = next.goals.findIndex((x) => x.id === g.id);
            if (i >= 0) next.goals[i] = g;
            else next.goals.push(g);
        });

    const removeLearningGoal = (id: string): Promise<LearningGoalsData> =>
        mutateLearningGoals((next) => {
            next.goals = next.goals.filter((goal) => goal.id !== id);
        });

    const returnToEntryPoint = (returnPoint: string): void => {
        const target = parseReturnPoint(returnPoint);
        if (target.type === "doc") {
            plugin.openSiYuanTarget(target.docId);
        } else if (target.type === "hub") {
            plugin.openTabOf(TAB_DASHBOARD, { tab: target.tab });
        }
    };

    const delegates: HostDelegates = {
        contentLifecyclesMutations,
        transitionContentState,
        subscribeExamPlans,
        saveExamPlan,
        deleteExamPlan,
        mutateInbox,
        loadInboxSources,
        completeInboxCards,
        saveLearningGoal,
        removeLearningGoal,
        returnToEntryPoint,
    };

    delegateCache.set(plugin, delegates);
    return delegates;
}
