/**
 * 小驴闪卡 · 8 仓共用跨机容灾底座（lvSnapshotVault）适配器
 *
 * 职责：
 * 1. 导出全部核心配置、卡包/学习统计/模板/规则快照，排除高噪音瞬态槽；
 * 2. 强制剥离 aiKey / aiFallbackKey / ankiClientKey 及任意明文凭证；
 * 3. 精确统计非空记录数（空库返回 0，触发底座空库永不覆盖非空护栏）；
 * 4. 生成本机 vs 快照可读差异摘要，并安全恢复合并刷新内存。
 */

import type { LvVaultPluginAdapter } from "../libs/lv-notice-kit";
import { stripSecretsForStorage } from "./settings";
import {
    SETTINGS_DATA,
    REVLOG_DATA,
    SUSPEND_TODAY_DATA,
    EXAM_PLANS_DATA,
    SESSION_STATE_DATA,
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
    AI_DENY_LIST_DATA,
    AI_COST_LEDGER_DATA,
    OB_LEDGER_DATA,
    EXTERNAL_CARD_INTAKE_DATA,
    AI_BATCHES_DATA,
    AI_JOBS_DATA,
    CONTENT_VERSIONS_DATA,
    MAINTENANCE_REPAIR_JOURNAL_DATA,
} from "../bootstrap/storage-keys";

export const VAULT_EXCLUDED_SLOTS = new Set<string>([
    AI_BATCHES_DATA,
    AI_JOBS_DATA,
    CONTENT_VERSIONS_DATA,
    MAINTENANCE_REPAIR_JOURNAL_DATA,
]);

const SECRET_KEY_RE = /^(?:aiKey|aiFallbackKey|ankiClientKey|api[-_]?key|fallback[-_]?key|access[-_]?token|refresh[-_]?token|auth[-_]?token|bearer[-_]?token|gist[-_]?token|bot[-_]?token|client[-_]?secret|app[-_]?secret|secret[-_]?key|private[-_]?key|password|passwd|credential|webhookUrl|barkUrl|token|secret)$/i;
const PRESERVE_METADATA_KEYS = new Set([
    "aiKeyConfigured",
    "aiFallbackKeyConfigured",
    "ankiClientKeyConfigured",
    "hasSecret",
    "secretSlot",
    "secretSlots",
    "totalTokens",
    "promptTokens",
    "completionTokens",
    "tokenBudget",
]);
const SECRET_VALUE_PATTERNS = [
    /sk-[A-Za-z0-9_-]{8,}/g,
    /Bearer\s+[A-Za-z0-9._-]{6,}/gi,
    /ghp_[A-Za-z0-9]{10,}/g,
];

function scrubSecretsDeep(val: unknown): unknown {
    if (val == null) return val;
    if (typeof val === "string") {
        let s = val;
        for (const p of SECRET_VALUE_PATTERNS) {
            s = s.replace(p, "[REDACTED]");
        }
        return s;
    }
    if (Array.isArray(val)) {
        return val.map(scrubSecretsDeep);
    }
    if (typeof val === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
            if (!PRESERVE_METADATA_KEYS.has(k) && SECRET_KEY_RE.test(k)) {
                continue;
            }
            out[k] = scrubSecretsDeep(v);
        }
        return out;
    }
    return val;
}

export function sanitizeCardsSnapshot(raw: Record<string, unknown>): Record<string, unknown> {
    const cloned = JSON.parse(JSON.stringify(raw && typeof raw === "object" ? raw : {})) as Record<string, unknown>;
    const rawStores = (cloned.stores && typeof cloned.stores === "object" && !Array.isArray(cloned.stores))
        ? (cloned.stores as Record<string, unknown>)
        : cloned;

    const cleanStores: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawStores)) {
        if (VAULT_EXCLUDED_SLOTS.has(key)) continue;
        if (key === SETTINGS_DATA && value && typeof value === "object") {
            const stripped = stripSecretsForStorage(value as any);
            cleanStores[key] = scrubSecretsDeep(stripped);
        } else {
            cleanStores[key] = scrubSecretsDeep(value);
        }
    }

    return {
        v: 1,
        plugin: "siyuan-lv-cards",
        timestamp: typeof cloned.timestamp === "number" ? cloned.timestamp : Date.now(),
        exportedAt: typeof cloned.exportedAt === "string" ? cloned.exportedAt : new Date().toISOString(),
        stores: cleanStores,
    };
}

function unwrapStores(snapshot: Record<string, unknown> | null | undefined): Record<string, any> {
    if (!snapshot || typeof snapshot !== "object") return {};
    if (snapshot.stores && typeof snapshot.stores === "object" && !Array.isArray(snapshot.stores)) {
        return snapshot.stores as Record<string, any>;
    }
    return snapshot as Record<string, any>;
}

export function extractSnapshotBreakdown(snapshot: Record<string, unknown> | null | undefined): {
    total: number;
    revlogCount: number;
    examPlansCount: number;
    knowledgeCount: number;
    relationsCount: number;
    inboxCount: number;
    goalsCount: number;
    extraCount: number;
} {
    const stores = unwrapStores(snapshot);
    const revlog = stores[REVLOG_DATA];
    const revlogEntries = Array.isArray(revlog?.entries) ? revlog.entries.length : 0;
    const revlogDays = revlog?.days && typeof revlog.days === "object" ? Object.keys(revlog.days).length : 0;
    const revlogCount = Math.max(revlogEntries, revlogDays);

    const examPlansCount = Array.isArray(stores[EXAM_PLANS_DATA]?.plans) ? stores[EXAM_PLANS_DATA].plans.length : 0;
    const knowledgeCount = Array.isArray(stores[KNOWLEDGE_OBJECTS_DATA]?.objects) ? stores[KNOWLEDGE_OBJECTS_DATA].objects.length : 0;
    const relationsCount = Array.isArray(stores[CARD_RELATIONS_DATA]?.relations) ? stores[CARD_RELATIONS_DATA].relations.length : 0;
    const inboxCount = Array.isArray(stores[INBOX_DATA]?.items) ? stores[INBOX_DATA].items.length : 0;
    const goalsCount = Array.isArray(stores[LEARNING_GOALS_DATA]?.goals) ? stores[LEARNING_GOALS_DATA].goals.length : 0;

    const suspendCount = Array.isArray(stores[SUSPEND_TODAY_DATA]?.cardIDs) ? stores[SUSPEND_TODAY_DATA].cardIDs.length : 0;
    const errorTagItems = stores[ERROR_TAGS_DATA]?.items && typeof stores[ERROR_TAGS_DATA].items === "object"
        ? Object.keys(stores[ERROR_TAGS_DATA].items).length
        : (Array.isArray(stores[ERROR_TAGS_DATA]?.tags) ? stores[ERROR_TAGS_DATA].tags.length : 0);
    const entryContextsCount = stores[ENTRY_CONTEXTS_DATA]?.contexts && typeof stores[ENTRY_CONTEXTS_DATA].contexts === "object"
        ? Object.keys(stores[ENTRY_CONTEXTS_DATA].contexts).length
        : 0;
    const lifecyclesCount = stores[CONTENT_LIFECYCLES_DATA]?.items && typeof stores[CONTENT_LIFECYCLES_DATA].items === "object"
        ? Object.keys(stores[CONTENT_LIFECYCLES_DATA].items).length
        : 0;
    const sourceHealthCount = stores[SOURCE_HEALTH_DATA]?.records && typeof stores[SOURCE_HEALTH_DATA].records === "object"
        ? Object.keys(stores[SOURCE_HEALTH_DATA].records).length
        : 0;
    const ankiCount = Array.isArray(stores[ANKI_LEDGER_DATA]) ? stores[ANKI_LEDGER_DATA].length : 0;
    const obCount = Array.isArray(stores[OB_LEDGER_DATA]) ? stores[OB_LEDGER_DATA].length : 0;
    const denyRulesCount = Array.isArray(stores[AI_DENY_LIST_DATA]?.rules) ? stores[AI_DENY_LIST_DATA].rules.length : 0;
    const intakeCount = Array.isArray(stores[EXTERNAL_CARD_INTAKE_DATA]?.entries) ? stores[EXTERNAL_CARD_INTAKE_DATA].entries.length : 0;
    const sessionReviewedCount = Array.isArray(stores[SESSION_STATE_DATA]?.reviewedIDs) ? stores[SESSION_STATE_DATA].reviewedIDs.length : 0;
    const costLedgerCount = Array.isArray(stores[AI_COST_LEDGER_DATA]?.entries) ? stores[AI_COST_LEDGER_DATA].entries.length : 0;
    const killSwitchCount = stores[AI_KILL_SWITCH_DATA]?.disabled === true ? 1 : 0;

    const settings = stores[SETTINGS_DATA];
    const customSettingsCount = settings && typeof settings === "object"
        ? (Array.isArray(settings.starredCards) ? settings.starredCards.length : 0)
            + (Array.isArray(settings.customPromptTemplates) ? settings.customPromptTemplates.length : 0)
            + (settings.deckOrder && Array.isArray(settings.deckOrder) ? settings.deckOrder.length : 0)
        : 0;

    const extraCount = suspendCount + errorTagItems + entryContextsCount + lifecyclesCount
        + sourceHealthCount + ankiCount + obCount + denyRulesCount + intakeCount
        + sessionReviewedCount + costLedgerCount + killSwitchCount + customSettingsCount;

    const total = revlogCount + examPlansCount + knowledgeCount + relationsCount + inboxCount + goalsCount + extraCount;
    return {
        total,
        revlogCount,
        examPlansCount,
        knowledgeCount,
        relationsCount,
        inboxCount,
        goalsCount,
        extraCount,
    };
}

export function countCardsSnapshotRecords(snapshot: Record<string, unknown>): number {
    return extractSnapshotBreakdown(snapshot).total;
}

export function buildCardsVaultPreviewDiff(
    currentSnapshot: Record<string, unknown>,
    incomingSnapshot: Record<string, unknown>,
): { currentCount: number; incomingCount: number; summary: string } {
    const cur = extractSnapshotBreakdown(currentSnapshot);
    const inc = extractSnapshotBreakdown(incomingSnapshot);
    const summary = `本机 ${cur.total} 条（复习 ${cur.revlogCount} · 计划 ${cur.examPlansCount} · 收件箱 ${cur.inboxCount} · 知识 ${cur.knowledgeCount}） / 快照 ${inc.total} 条（复习 ${inc.revlogCount} · 计划 ${inc.examPlansCount} · 收件箱 ${inc.inboxCount} · 知识 ${inc.knowledgeCount}）`;
    return {
        currentCount: cur.total,
        incomingCount: inc.total,
        summary,
    };
}

export function createCardsVaultAdapter(plugin: {
    dumpData: () => Promise<Record<string, unknown>>;
    restoreData: (data: Record<string, unknown>) => Promise<boolean>;
    refreshDueBadge?: () => void;
}): LvVaultPluginAdapter {
    return {
        pluginId: "siyuan-lv-cards",
        label: "小驴闪卡",
        schemaVersion: 1,
        countRecords(snapshot: Record<string, unknown>): number {
            return countCardsSnapshotRecords(snapshot);
        },
        async exportSnapshot(): Promise<Record<string, unknown>> {
            const raw = await plugin.dumpData();
            return sanitizeCardsSnapshot(raw);
        },
        async previewDiff(incoming: Record<string, unknown>) {
            const current = sanitizeCardsSnapshot(await plugin.dumpData());
            return buildCardsVaultPreviewDiff(current, incoming);
        },
        async importMerge(incoming: Record<string, unknown>): Promise<boolean> {
            const sanitized = sanitizeCardsSnapshot(incoming);
            const ok = await plugin.restoreData(sanitized);
            if (ok) {
                try {
                    plugin.refreshDueBadge?.();
                } catch {}
            }
            return ok;
        },
    };
}
