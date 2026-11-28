/** Pure, on-demand services carried by the hub chunk. The shell owns all state and I/O. */
import { findApproximateDuplicateCandidates } from "./maintenance-queue";
import { applyBatchRepair, confirmBatchRepair, previewBatchRepair, rollbackBatchRepair, appendRepairJournalEntry, updateRepairJournalEntryStatus, normalizeRepairJournal } from "./maintenance-repair";
import { createMaintenanceRepairStorage } from "./maintenance-repair-storage";
import { createMaintenanceRepairController } from "./maintenance-repair-controller";
import { helpMarkdown } from "../help";
import { renderExamReportMarkdown, queryNotebookBlockIDs } from "./report-writer";
import { buildDiagnosticsText } from "./diagnostics";
import { createFullSampleWorkspace, createOnboardingSampleCards } from "./workspace-samples";
import { DYNAMIC_BOARD_DOC_PATH, buildDynamicBoardMarkdown } from "./dynamic-notebook";
import { parseRevlogCsv } from "./revlog-csv";
import { computeStorageStats, probeAnkiConnection } from "./storage-diagnostics";
import {
    buildBudgetPreview,
    queryNotebookMaterialText,
    buildAiCardMarker,
    buildAiCardBlockMarkdown,
} from "./ai-wizard-service";
import { assembleGeneratePrompt } from "./ai-pipeline";
import { checkEligibility } from "./ai-eligibility";
import { evaluateRefusal } from "./ai-refusal";
import { findAiCardGateIssues } from "./ai-card-gate";
import { PERSONA_PRESETS } from "./personas";
import { checkDuplicateCards } from "./card-operations";
import { extractMarkerCardItems } from "./marker-cards";
import { previewRestore } from "./backup";
import {
    exportAllBackupBundle,
    exportRevlogJson,
    exportSettingsJson,
    exportRevlogToCsv,
    exportAiCostLedger,
} from "../features/data-export-manager";

export const hubServices = {
    findApproximateDuplicateCandidates,
    applyBatchRepair,
    confirmBatchRepair,
    previewBatchRepair,
    rollbackBatchRepair,
    appendRepairJournalEntry,
    updateRepairJournalEntryStatus,
    createMaintenanceRepairStorage,
    createMaintenanceRepairController,
    normalizeRepairJournal,
    helpMarkdown,
    renderExamReportMarkdown,
    queryNotebookBlockIDs,
    buildDiagnosticsText,
    createFullSampleWorkspace,
    createOnboardingSampleCards,
    DYNAMIC_BOARD_DOC_PATH,
    buildDynamicBoardMarkdown,
    parseRevlogCsv,
    computeStorageStats,
    probeAnkiConnection,
    buildBudgetPreview,
    queryNotebookMaterialText,
    buildAiCardMarker,
    buildAiCardBlockMarkdown,
    assembleGeneratePrompt,
    checkEligibility,
    evaluateRefusal,
    findAiCardGateIssues,
    PERSONA_PRESETS,
    checkDuplicateCards,
    extractMarkerCardItems,
    exportAllBackupBundle,
    exportRevlogJson,
    exportSettingsJson,
    exportRevlogToCsv,
    exportAiCostLedger,
    previewRestore,
};

export type HubServices = typeof hubServices;
