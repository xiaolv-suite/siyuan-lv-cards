import {
    downloadFile,
    formatRevlogExportCsv,
    buildCostLedgerExportPayload,
} from "@/core/data-transfer";
import type { RevlogData } from "@/core/revlog";
import { stripSecretsForStorage, type LvCardsSettings } from "@/core/settings";
import type { CostLedgerData } from "@/core/ai-cost-ledger";
import { buildBackupBundle } from "@/core/backup";

/**
 * 导出本地复习日志 JSON（M10·FR1）
 */
export function exportRevlogJson(revlog: RevlogData, today: string) {
    downloadFile(`lv-cards-revlog-${today}.json`, JSON.stringify(revlog), "application/json");
}

/**
 * 导出设置为 JSON 文件（强制密钥脱敏）
 */
export function exportSettingsJson(settings: LvCardsSettings, today: string) {
    downloadFile(`lv-cards-settings-${today}.json`, JSON.stringify(stripSecretsForStorage(settings)), "application/json");
}

/**
 * 导出 CSV（带 BOM，Excel 友好）
 */
export function exportRevlogToCsv(revlog: RevlogData, today: string) {
    downloadFile(`lv-cards-revlog-${today}.csv`, formatRevlogExportCsv(revlog), "text/csv");
}

/**
 * BU-25：导出 AI 用量账本（聚合视图 + 明细；不含 key 与原文）
 */
export function exportAiCostLedger(costLedger: CostLedgerData, today: string) {
    const payload = buildCostLedgerExportPayload(costLedger);
    downloadFile(`lv-cards-ai-cost-${today}.json`, JSON.stringify(payload), "application/json");
}

/**
 * 备份中心：导出全部私有存储为单文件 bundle（settings.json 强制执行密钥脱敏）
 */
export function exportAllBackupBundle(files: Record<string, unknown>, today: string) {
    const sanitized = { ...files };
    if (sanitized["settings.json"] && typeof sanitized["settings.json"] === "object") {
        sanitized["settings.json"] = stripSecretsForStorage(sanitized["settings.json"] as LvCardsSettings);
    }
    downloadFile(`lv-cards-backup-${today}.json`, JSON.stringify(buildBackupBundle(sanitized)), "application/json");
}
