/**
 * 维护债务与修复领域服务中枢（MaintenanceService）
 * 集中管理批量坏卡扫描、差异预览生成、带版本门禁的事务应用、一键回滚及块内容版本链审计。
 * 纯逻辑与领域编排封装，彻底下沉原 index.ts 内联逻辑。
 */

import { lvLog } from "@/libs/log";
import { fnv1a } from "./ai-provenance";
import { versionsOf, appendVersion, acceptVersion, type ContentVersionsData } from "./content-versions";
import {
    sourceBaselineMarkdown,
    acknowledgeSourceHealth as acknowledgeSourceHealthStore,
    type SourceHealthData,
} from "./source-health-store";
import { sqlQuery, updateBlock, getBlockAttrs } from "@/api/siyuan";
import { getRiffCardsByBlockIDs } from "@/api/riff";
import { validateCardEntry } from "./card-entry-gate";
import { extractMediaRefs } from "./media-refs";
import type {
    BatchRepairProposal,
    BatchRepairPreview,
    MaintenanceRepairJournal,
} from "./maintenance-repair";
import type { createMaintenanceRepairController } from "./maintenance-repair-controller";
import type { RepairSnapshotWrite } from "./maintenance-repair-storage";
import {
    MAINTENANCE_REPAIR_JOURNAL_DATA,
    CONTENT_VERSIONS_DATA,
} from "@/bootstrap/storage-keys";

export interface MaintenanceServiceOptions {
    getRepairJournal: () => MaintenanceRepairJournal;
    setRepairJournal: (journal: MaintenanceRepairJournal) => void;
    saveJournal: (key: string, journal: MaintenanceRepairJournal) => Promise<void>;
    getContentVersions: () => ContentVersionsData;
    setContentVersions: (val: ContentVersionsData) => void;
    saveContentVersions: (key: string, val: ContentVersionsData) => Promise<void>;
    getSourceHealth: () => SourceHealthData;
    sourceHealthMutations?: (mutator: (state: SourceHealthData) => void) => Promise<void>;
    ensureTier2Loaded?: () => Promise<void>;
    hasValidOcclusionCard: (blockID: string, md: string) => Promise<boolean>;
    loadHubServices: () => Promise<{ createMaintenanceRepairController: typeof createMaintenanceRepairController }>;
    getI18n: () => Record<string, any>;
    saveMarkdown?: (blockID: string, md: string, recovery?: RepairSnapshotWrite) => Promise<boolean | string>;
}

export class MaintenanceService {
    private readonly options: MaintenanceServiceOptions;
    public readonly previews = new Map<string, BatchRepairPreview>();
    public contentVersionQueue: Promise<void> = Promise.resolve();
    private controller: Promise<ReturnType<typeof createMaintenanceRepairController>> | null = null;

    constructor(options: MaintenanceServiceOptions) {
        this.options = options;
    }

    public async getController() {
        if (this.options.ensureTier2Loaded) {
            await this.options.ensureTier2Loaded();
        }
        return (this.controller ??= this.options.loadHubServices().then(({ createMaintenanceRepairController }) =>
            createMaintenanceRepairController({
                previews: this.previews,
                getJournal: () => this.options.getRepairJournal(),
                setJournal: (journal) => this.options.setRepairJournal(journal),
                saveJournal: (journal) => this.options.saveJournal(MAINTENANCE_REPAIR_JOURNAL_DATA, journal),
                querySources: sqlQuery,
                hasValidOcclusion: (blockID, markdown) => this.options.hasValidOcclusionCard(blockID, markdown),
                saveMarkdown: (blockID, markdown, recovery) => (this.options.saveMarkdown ? this.options.saveMarkdown(blockID, markdown, recovery) : this.saveBlockContentVersion(blockID, markdown, recovery)),
                logError: (message) => lvLog("error", message),
            }),
        ).catch((error) => {
            this.controller = null;
            throw error;
        }));
    }

    public async preview(proposals: BatchRepairProposal[]): Promise<BatchRepairPreview> {
        return (await this.getController()).preview(proposals);
    }

    public async apply(previewID: string): Promise<{ blockIDs: string[] }> {
        return (await this.getController()).apply(String(previewID ?? ""));
    }

    public async rollback(): Promise<{ blockIDs: string[]; previewID: string }> {
        return (await this.getController()).rollback();
    }

    public async saveBlockContentVersion(
        blockID: string,
        md: string,
        recovery?: RepairSnapshotWrite,
    ): Promise<boolean | string> {
        if (this.options.ensureTier2Loaded) {
            await this.options.ensureTier2Loaded();
        }

        const operation = this.contentVersionQueue.then(async () => {
            const restoring = recovery?.blockID === blockID && recovery.markdown === md;
            const riff = restoring ? null : await getRiffCardsByBlockIDs([blockID]);
            if (!restoring && (!riff?.blocks || riff.blocks.length === 0 || riff.blocks.some((block) => block.id === blockID))) {
                const attrs = await getBlockAttrs(blockID).catch(() => ({}));
                const decision = validateCardEntry({
                    blockID,
                    markdown: md,
                    attrs,
                    exists: true,
                    occlusionValid: await this.options.hasValidOcclusionCard(blockID, md),
                });
                if (!decision.ok) {
                    const i18n = this.options.getI18n();
                    const errorKey = decision.issue === "empty-card" ? "qualityEmpty"
                        : decision.issue === "missing-answer" ? "qualityMissingAnswer"
                            : decision.issue === "missing-question" ? "qualityMissingQuestion"
                                : decision.issue === "invalid-occlusion" ? "qualityInvalidOcclusion"
                                    : decision.issue === "missing-block" ? "qualityMissingBlock" : "qualityInvalidMarkup";
                    return ((i18n.editor as any)[errorKey] ?? (i18n.editor as any).qualityInvalidMarkup) as string;
                }
            }

            let baseVersions = this.options.getContentVersions();
            const sourceHealth = this.options.getSourceHealth();
            if (!restoring && sourceHealth && versionsOf(baseVersions, blockID).length === 0) {
                const prevMd = sourceBaselineMarkdown(sourceHealth, blockID);
                if (prevMd && prevMd.trim() && prevMd !== md) {
                    baseVersions = appendVersion(baseVersions, blockID, prevMd, Date.now() - 1, "editor");
                }
            }

            await updateBlock("markdown", md, blockID);
            const next = appendVersion(baseVersions, blockID, md, Date.now(), "editor");
            await this.options.saveContentVersions(CONTENT_VERSIONS_DATA, next);
            this.options.setContentVersions(next);

            if (sourceHealth?.entries?.some((e) => e.fingerprint.blockID === blockID) && typeof this.options.sourceHealthMutations === "function") {
                try {
                    const existingFp = sourceHealth.entries.find((e) => e.fingerprint.blockID === blockID)!.fingerprint;
                    await this.options.sourceHealthMutations((state) => {
                        const updated = acknowledgeSourceHealthStore(state, {
                            ...existingFp,
                            contentHash: fnv1a(md),
                            mediaRefs: extractMediaRefs(md).map((ref) => ref.normalized),
                            baselineMarkdown: md,
                        }, Date.now());
                        state.entries = updated.entries;
                    });
                } catch {
                    // 旁路收口
                }
            }

            return true;
        });

        this.contentVersionQueue = operation.then(() => undefined, () => undefined);
        return operation;
    }

    public async acceptContentVersion(blockID: string, at: number): Promise<void> {
        if (this.options.ensureTier2Loaded) {
            await this.options.ensureTier2Loaded();
        }

        const operation = this.contentVersionQueue.then(async () => {
            const next = acceptVersion(this.options.getContentVersions(), blockID, at);
            await this.options.saveContentVersions(CONTENT_VERSIONS_DATA, next);
            this.options.setContentVersions(next);
        });

        this.contentVersionQueue = operation.then(() => undefined, () => undefined);
        return operation;
    }
}

export function createMaintenanceService(options: MaintenanceServiceOptions): MaintenanceService {
    return new MaintenanceService(options);
}
