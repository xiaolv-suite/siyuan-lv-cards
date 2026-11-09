/**
 * 小驴闪卡 22 槽持久化存储键名常量单一事实源
 */

export const SETTINGS_DATA = "settings.json";
export const REVLOG_DATA = "revlog.json";
export const SUSPEND_TODAY_DATA = "suspend-today.json";
export const EXAM_PLANS_DATA = "exam-plans.json";
export const AI_BATCHES_DATA = "ai-batches.json";
export const SESSION_STATE_DATA = "session-state.json";
export const AI_JOBS_DATA = "ai-jobs.json";
export const KNOWLEDGE_OBJECTS_DATA = "knowledge-objects.json";
export const CARD_RELATIONS_DATA = "relations.json";
export const ERROR_TAGS_DATA = "error-tags.json";
export const INBOX_DATA = "inbox.json";
export const LEARNING_GOALS_DATA = "learning-goals.json";
export const ENTRY_CONTEXTS_DATA = "entry-contexts.json";
export const CONTENT_LIFECYCLES_DATA = "content-lifecycles.json";
export const SOURCE_HEALTH_DATA = "source-health.json";
export const AI_KILL_SWITCH_DATA = "ai-killswitch.json";
/** Anki M3：guid 导入台账（幂等重导） */
export const ANKI_LEDGER_DATA = "anki-ledger.json";
/** T05：块内容版本快照（每块上限 10） */
export const CONTENT_VERSIONS_DATA = "content-versions.json";
/** BW-9：来源级 AI 禁止外发规则（笔记本/文档/块 ID，不含内容） */
export const AI_DENY_LIST_DATA = "ai-deny-list.json";
/** BU-24/25：AI 用量账本（token 估算/模型/任务，不含 key 与原文） */
export const AI_COST_LEDGER_DATA = "ai-cost-ledger.json";
/** Obsidian SR 导入弱台账（指纹→落点，幂等重导；不含卡片原文） */
export const OB_LEDGER_DATA = "ob-import-ledger.json";
/** 批量修复持久化事务日志（成功写入后落盘，供重启后审计与撤销） */
export const MAINTENANCE_REPAIR_JOURNAL_DATA = "maintenance-repair-journal.json";
export const EXTERNAL_CARD_INTAKE_DATA = "external-card-intake-v1.json";

export const ALL_STORE_KEYS = [
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
    EXTERNAL_CARD_INTAKE_DATA,
] as const;
