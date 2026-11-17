/**
 * 小驴闪卡 22 槽持久化存储批量装载器（Storage Loader）
 *
 * 负责：
 * 1. 22 槽持久化存储文件的并发批量读取；
 * 2. 单槽损坏/丢失时的防御性容错（单个坏键不影响其他槽位读取，不阻断插件启动）；
 * 3. 22 槽字段的白名单结构清洗与归一化（normalize）；
 * 4. 为所有乐观写入存储建立不可变回滚快照（persisted snapshots）。
 */

import { lvLog } from "@/libs/log";
import { zipLoaded, loadStore } from "@/libs/store";
import { localDate } from "@/core/revlog";
import { normalizeSettings } from "@/core/settings";
import { normalizeRevlog } from "@/core/revlog";
import { normalizeSuspendToday } from "@/core/suspend-today";
import { normalizeKillSwitch } from "@/core/ai-kill-switch";
import { normalizeExamPlans } from "@/core/exam";
import { normalizeSessionState } from "@/core/session-state";
import { normalizeKnowledgeObjects } from "@/core/knowledge-objects";
import { normalizeCardRelations } from "@/core/card-relations";
import { normalizeErrorTags } from "@/core/error-reasons";
import { normalizeInbox } from "@/core/inbox";
import { normalizeGoals } from "@/core/learning-goal";
import { normalizeEntryContexts } from "@/core/entry-context";
import { normalizeLifecycles } from "@/core/content-lifecycle";
import { normalizeSourceHealth } from "@/core/source-health-store";
import { normalizeLedger, normalizeObLedger } from "@/core/import-ledgers";
import { normalizeContentVersions } from "@/core/content-versions";
import { normalizeDenyList } from "@/core/ai-source-deny";
import { normalizeCostLedger } from "@/core/ai-cost-ledger";
import { emptyAIBatches, normalizeAIBatches } from "@/core/ai-batches";
import { emptyAIJobs, normalizeAIJobs } from "@/core/ai-jobs";
import {
    ALL_STORE_KEYS,
    SETTINGS_DATA,
    REVLOG_DATA,
    SUSPEND_TODAY_DATA,
    EXAM_PLANS_DATA,
    AI_BATCHES_DATA,
    SESSION_STATE_DATA,
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
} from "./storage-keys";

function cloneStore<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function createEmptyRepairJournal() {
    return { version: 1, entries: [] };
}

const todayDate = () => localDate(Date.now());

/**
 * 并发读取所有持久化存储文件，单槽损坏不阻断其余槽位
 */
export async function readAllPluginStores(
    dataLoader: (key: string) => Promise<unknown>,
    keys: readonly string[] = ALL_STORE_KEYS,
): Promise<Record<string, unknown>> {
    const values = await Promise.all(
        keys.map(async (key) => {
            try {
                return await dataLoader(key);
            } catch (e) {
                lvLog("error", `load ${key} failed: ${e instanceof Error ? e.message : String(e)}`);
                return undefined;
            }
        }),
    );
    return zipLoaded(keys, values);
}

export interface StorageApplyOptions {
    loadHubServices?: () => Promise<any>;
}

/**
 * 将读取到的原始数据经过结构清洗与归一化后写入宿主，并建立不可变磁盘快照
 */
export async function applyAllPluginStores(
    plugin: any,
    loaded: Record<string, unknown>,
    options?: StorageApplyOptions,
): Promise<void> {
    plugin.settings = normalizeSettings(loaded[SETTINGS_DATA]);
    plugin.revlog = normalizeRevlog(loaded[REVLOG_DATA]);
    plugin.revlogMutationVersion = (plugin.revlogMutationVersion ?? 0) + 1;
    plugin.suspendToday = normalizeSuspendToday(loaded[SUSPEND_TODAY_DATA]);
    plugin.killSwitch = normalizeKillSwitch(loaded[AI_KILL_SWITCH_DATA]);
    plugin.examPlans = normalizeExamPlans(loaded[EXAM_PLANS_DATA]);
    plugin.sessionState = normalizeSessionState(loaded[SESSION_STATE_DATA], todayDate());

    // 知识对象与关系图
    plugin.knowledgeObjects = normalizeKnowledgeObjects(loaded[KNOWLEDGE_OBJECTS_DATA]);
    plugin.cardRelations = normalizeCardRelations(loaded[CARD_RELATIONS_DATA]);
    plugin.errorTags = normalizeErrorTags(loaded[ERROR_TAGS_DATA]);
    plugin.inbox = normalizeInbox(loaded[INBOX_DATA]);
    plugin.learningGoals = normalizeGoals(loaded[LEARNING_GOALS_DATA]);
    plugin.entryContexts = normalizeEntryContexts(loaded[ENTRY_CONTEXTS_DATA]);
    plugin.contentLifecycles = normalizeLifecycles(loaded[CONTENT_LIFECYCLES_DATA]);
    plugin.sourceHealth = normalizeSourceHealth(loaded[SOURCE_HEALTH_DATA]);

    // 导入台账与版本控制
    plugin.ankiLedger = normalizeLedger(loaded[ANKI_LEDGER_DATA]);
    plugin.contentVersions = normalizeContentVersions(loaded[CONTENT_VERSIONS_DATA]);
    plugin.aiDenyList = normalizeDenyList(loaded[AI_DENY_LIST_DATA]);
    plugin.costLedger = normalizeCostLedger(loaded[AI_COST_LEDGER_DATA]);
    plugin.obLedger = normalizeObLedger(loaded[OB_LEDGER_DATA]);

    // 批量修复事务日志
    const rawJournal = loaded[MAINTENANCE_REPAIR_JOURNAL_DATA];
    if (rawJournal && Array.isArray((rawJournal as any).entries) && (rawJournal as any).entries.length && options?.loadHubServices) {
        try {
            const hubSvc = await options.loadHubServices();
            plugin.repairJournal = hubSvc.normalizeRepairJournal(rawJournal);
        } catch {
            plugin.repairJournal = createEmptyRepairJournal();
        }
    } else {
        plugin.repairJournal = createEmptyRepairJournal();
    }

    // AI 批次与任务
    plugin.aiBatches = await loadStore(plugin, {
        key: AI_BATCHES_DATA,
        fallback: emptyAIBatches,
        normalize: normalizeAIBatches,
    }, loaded[AI_BATCHES_DATA]);

    plugin.aiJobs = await loadStore(plugin, {
        key: AI_JOBS_DATA,
        fallback: emptyAIJobs,
        normalize: normalizeAIJobs,
    }, loaded[AI_JOBS_DATA]);

    // 建立不可变快照基线，供乐观写入失败时回滚
    plugin.persistedSettingsSnapshot = normalizeSettings(cloneStore(plugin.settings));
    plugin.persistedRevlogSnapshot = cloneStore(plugin.revlog);
    plugin.persistedSessionStateSnapshot = cloneStore(plugin.sessionState);
    plugin.persistedInboxSnapshot = cloneStore(plugin.inbox);
    plugin.persistedAIBatchesSnapshot = cloneStore(plugin.aiBatches);
    plugin.persistedCostLedgerSnapshot = cloneStore(plugin.costLedger);
    plugin.persistedAIJobsSnapshot = cloneStore(plugin.aiJobs);
    plugin.persistedAIDenyListSnapshot = cloneStore(plugin.aiDenyList);
    plugin.persistedErrorTagsSnapshot = cloneStore(plugin.errorTags);
}
