import {
    downloadFile,
    formatRevlogExportCsv,
    buildCostLedgerExportPayload,
} from "@/core/data-transfer";
import type { RevlogData } from "@/core/revlog";
import type { LvCardsSettings } from "@/core/settings";
import type { CostLedgerData } from "@/core/ai-cost-ledger";
import { buildBackupBundle } from "@/core/backup";

/**
 * 导出本地复习日志 JSON（M10·FR1）
 */
export function exportRevlogJson(revlog: RevlogData, today: string) {
    downloadFile(`lv-cards-revlog-${today}.json`, JSON.stringify(revlog), "application/json");
}

/**
 * 导出设置为 JSON 文件
 */
export function exportSettingsJson(settings: LvCardsSettings, today: string) {
    downloadFile(`lv-cards-settings-${today}.json`, JSON.stringify(settings), "application/json");
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
 * 备份中心：导出全部私有存储为单文件 bundle
 */
export function exportAllBackupBundle(files: Record<string, unknown>, today: string) {
    downloadFile(`lv-cards-backup-${today}.json`, JSON.stringify(buildBackupBundle(files)), "application/json");
}
