/**
 * AI 服务与任务管线中枢（AICardService）
 * 集中管理 AI 作业状态机、批次持久化、熔断守卫、月度预算、来源禁用名单及候选卡片原子提交。
 * 纯逻辑与领域编排封装，彻底剥离原 index.ts 内联逻辑。
 */

import { lvLog } from "@/libs/log";
import { fnv1a } from "./ai-provenance";
import { localDate } from "./revlog";
import { estimateTokens, parseCards } from "@/api/ai-parse";
import { AICanceledError, isAICanceled } from "@/api/ai-errors";
import {
    killSwitchBlock,
    normalizeKillSwitch,
    type AIKillSwitchData,
} from "./ai-kill-switch";
import {
    addDenyRule,
    isDenied,
    normalizeDenyList,
    type DenyListData,
} from "./ai-source-deny";
import {
    budgetState,
    recordEntry,
    normalizeCostLedger,
    emptyCostLedger,
    type CostLedgerData,
} from "./ai-cost-ledger";
import {
    MODEL_PRICE_SNAPSHOT,
    estimateCallCostUsd,
} from "./ai-model-registry";
import {
    createJob,
    transitionJob,
    pruneJobs,
    normalizeAIJobs,
    type AIJobsData,
    type AIJob,
} from "./ai-jobs";
import { normalizeAIBatches, type AIBatchesData } from "./ai-batches";
import { serializeQaCard } from "./flashcard-quality";
import { loadHubServices, loadAiChat } from "@/bootstrap/chunk-loaders";
import {
    findUnfinishedAIJob,
    prepareReviewableJob,
    getRecoverableJobSummaries,
    cancelAllActiveJobs,
} from "./ai-job-recovery";
import { addRiffCards, invalidateDueCache } from "@/api/due-shared";
import { createDocWithMd, appendBlock, setBlockAttrs, sqlQuery } from "@/api/siyuan";
import { cardsCreatedEvent, LV_EVENTS } from "@/libs/events";
import { notifyBatchCardCreation } from "@/libs/notice";
import {
    AI_BATCHES_DATA,
    AI_JOBS_DATA,
    AI_COST_LEDGER_DATA,
    AI_DENY_LIST_DATA,
    AI_KILL_SWITCH_DATA,
} from "@/bootstrap/storage-keys";
import { hasSiyuanAiApiKey, type LvCardsSettings } from "./settings";
import { CARDS_SECRET_SLOTS, readCardsSecretSlot } from "./secrets";

function cloneStore<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

const todayDate = () => localDate(Date.now());

export interface AICardServiceOptions {
    getSettings: () => LvCardsSettings;
    getI18n: () => Record<string, any>;
    getKillSwitch: () => AIKillSwitchData;
    setKillSwitch: (val: AIKillSwitchData) => void;
    getCostLedger: () => CostLedgerData;
    setCostLedger: (val: CostLedgerData) => void;
    getAIDenyList: () => DenyListData;
    setAIDenyList: (val: DenyListData) => void;
    getAIBatches: () => AIBatchesData;
    setAIBatches: (val: AIBatchesData) => void;
    getAIJobs: () => AIJobsData;
    setAIJobs: (val: AIJobsData) => void;
    saveSlot: (key: string, data: unknown) => Promise<void>;
    saveSlotOnce: (key: string, operationId: string, data: unknown) => Promise<void>;
    showNotice: (msg: string, timeout?: number, icon?: "info" | "error") => void;
    withDocLock: <T>(docId: string, action: () => Promise<T>) => Promise<T>;
    targetNotebook: () => Promise<{ id: string; name: string } | null>;
    rememberSourceFingerprint: (blockID: string, docID?: string, md?: string) => Promise<void>;
    getSecret?: (name: string) => string;
    eventBus?: any;
    persistJobs?: (previous: AIJobsData) => Promise<void>;
    persistJobsOnce?: (operationId: string) => Promise<void>;
}

export class AICardService {
    private readonly options: AICardServiceOptions;

    private aiBatchesMutationVersion = 0;
    private costLedgerMutationVersion = 0;
    private aiDenyMutationVersion = 0;
    private aiJobsMutationVersion = 0;

    private persistedAIBatchesSnapshot: AIBatchesData | null = null;
    private persistedCostLedgerSnapshot: CostLedgerData | null = null;
    private persistedAIDenyListSnapshot: DenyListData | null = null;
    private persistedAIJobsSnapshot: AIJobsData | null = null;

    private killSwitchMutationQueue: Promise<void> = Promise.resolve();
    private aiCommitFlights = new Map<string, Promise<void>>();

    constructor(options: AICardServiceOptions) {
        this.options = options;
    }

    public aiProviderTargets(): string[] {
        const settings = this.options.getSettings();
        const targets = [
            `provider:${settings.aiMode}:${settings.aiMode === "custom" ? settings.aiEndpoint : "siyuan"}`,
        ];
        if (settings.aiModel) targets.push(`model:${settings.aiModel}`);
        return targets;
    }

    public isSourceDenied(kind: "doc" | "notebook", id: string): boolean {
        const denyList = this.options.getAIDenyList();
        return isDenied(denyList, kind === "doc" ? { docId: id } : { notebookId: id }).denied;
    }

    public async onDenySource(kind: "doc" | "notebook", id: string): Promise<void> {
        const denyList = this.options.getAIDenyList();
        const previous = normalizeDenyList(cloneStore(denyList));
        const next = addDenyRule(denyList, kind, id, Date.now());
        const version = ++this.aiDenyMutationVersion;
        this.options.setAIDenyList(next);

        try {
            await this.options.saveSlot(AI_DENY_LIST_DATA, next);
            this.persistedAIDenyListSnapshot = cloneStore(next);
            lvLog("info", `[ai-deny] +${kind}:${id}`);
            const i18n = this.options.getI18n();
            this.options.showNotice((i18n as any).aiWizard?.deniedToast ?? "已加入禁止外发名单", 3000, "info");
        } catch {
            if (version === this.aiDenyMutationVersion) {
                this.options.setAIDenyList(cloneStore(this.persistedAIDenyListSnapshot ?? previous));
            }
            this.options.showNotice(this.options.getI18n().storageWriteFail ?? "写入失败", 6000, "error");
        }
    }

    public async clearCostLedger(): Promise<void> {
        const costLedger = this.options.getCostLedger();
        const previous = cloneStore(this.persistedCostLedgerSnapshot ?? costLedger);
        const next = emptyCostLedger();
        const version = ++this.costLedgerMutationVersion;
        this.options.setCostLedger(next);

        try {
            await this.options.saveSlot(AI_COST_LEDGER_DATA, next);
            if (version === this.costLedgerMutationVersion) {
                this.persistedCostLedgerSnapshot = next;
            }
            const i18n = this.options.getI18n();
            this.options.showNotice(i18n.settingsSaved ?? "设置已保存", 2000, "info");
        } catch (e) {
            if (version === this.costLedgerMutationVersion) {
                this.options.setCostLedger(cloneStore(this.persistedCostLedgerSnapshot ?? previous));
            }
            throw e;
        }
    }

    public async cancelPendingAiJobs(): Promise<number> {
        const aiJobs = this.options.getAIJobs();
        const result = cancelAllActiveJobs(aiJobs.jobs);
        if (result.modified) {
            aiJobs.jobs = result.jobs;
            const version = this.aiJobsMutationVersion;
            const next = cloneStore(aiJobs);
            void this.options.saveSlot(AI_JOBS_DATA, next).then(() => {
                this.persistedAIJobsSnapshot = cloneStore(next);
            }).catch(() => {
                if (version === this.aiJobsMutationVersion && this.persistedAIJobsSnapshot) {
                    this.options.setAIJobs(cloneStore(this.persistedAIJobsSnapshot));
                }
            });
        }
        return result.canceledCount;
    }

    public async mutateKillSwitch(mutate: (next: AIKillSwitchData) => void): Promise<AIKillSwitchData> {
        const operation = this.killSwitchMutationQueue.then(async () => {
            const previous = cloneStore(this.options.getKillSwitch());
            const next = normalizeKillSwitch(cloneStore(this.options.getKillSwitch()));
            mutate(next);
            try {
                await this.options.saveSlot(AI_KILL_SWITCH_DATA, next);
                this.options.setKillSwitch(next);
                return this.options.getKillSwitch();
            } catch (error) {
                this.options.setKillSwitch(previous);
                throw error;
            }
        });
        this.killSwitchMutationQueue = operation.then(() => undefined, () => undefined);
        return operation;
    }

    public upsertAIJob(job: AIJob): void {
        const aiJobs = this.options.getAIJobs();
        this.aiJobsMutationVersion += 1;
        aiJobs.jobs = pruneJobs([...aiJobs.jobs.filter(existing => existing.id !== job.id), job]);
    }

    public async persistAIJobs(previous: AIJobsData): Promise<void> {
        if (this.options.persistJobs) {
            return this.options.persistJobs(previous);
        }
        const version = this.aiJobsMutationVersion;
        const next = cloneStore(this.options.getAIJobs());
        try {
            await this.options.saveSlot(AI_JOBS_DATA, next);
            this.persistedAIJobsSnapshot = cloneStore(next);
        } catch (error) {
            if (version === this.aiJobsMutationVersion) {
                this.options.setAIJobs(cloneStore(this.persistedAIJobsSnapshot ?? previous));
            }
            throw error;
        }
    }

    public async persistAIJobsOnce(operationId: string): Promise<void> {
        if (this.options.persistJobsOnce) {
            return this.options.persistJobsOnce(operationId);
        }
        const next = cloneStore(this.options.getAIJobs());
        const version = this.aiJobsMutationVersion;
        try {
            await this.options.saveSlotOnce(AI_JOBS_DATA, operationId, next);
            this.persistedAIJobsSnapshot = cloneStore(next);
        } catch (error) {
            if (version === this.aiJobsMutationVersion && this.persistedAIJobsSnapshot) {
                this.options.setAIJobs(cloneStore(this.persistedAIJobsSnapshot));
            }
            throw error;
        }
    }

    public getUnfinishedAIJob(): { id: string; done: number; total: number; failed: { index: number; q: string; error: string }[] } | null {
        return findUnfinishedAIJob(this.options.getAIJobs().jobs);
    }

    public async getReviewableAIJob(jobId: string) {
        const job = this.options.getAIJobs().jobs.find(item => item.id === jobId);
        if (!job) return null;
        const i18n = this.options.getI18n();
        const prepared = prepareReviewableJob(job, i18n.unknown ?? "未知来源");
        if (!prepared) return null;
        if (prepared.resumed) {
            this.upsertAIJob(prepared.job);
            await this.persistAIJobs(this.persistedAIJobsSnapshot ?? this.options.getAIJobs());
        }
        return prepared.view;
    }

    public getRecoverableAIJobs(): {
        id: string; status: string; pending: number; failed: number; created: number; source: string;
        canReview: boolean; needsWriteCheck: boolean; deckID: string;
    }[] {
        const i18n = this.options.getI18n();
        return getRecoverableJobSummaries(this.options.getAIJobs().jobs, i18n.unknown ?? "未知来源");
    }

    public async generate(
        source: string,
        cfg: { count: number; language: string; type: "qa" | "cloze" },
        opts?: { signal?: AbortSignal; provenance?: { notebookIds?: string[]; docIds?: string[] } },
    ) {
        const { checkEligibility, assembleGeneratePrompt, evaluateRefusal } = await loadHubServices();
        const settings = this.options.getSettings();
        const i18n = this.options.getI18n();
        const costLedger = this.options.getCostLedger();
        const denyList = this.options.getAIDenyList();
        const killSwitch = this.options.getKillSwitch();

        // 1. 月度 token 预算检查
        const budget = budgetState(costLedger, {
            enabled: settings.aiCostBudgetEnabled,
            monthlyTokenCap: settings.aiCostMonthlyCap,
        });

        // 2. 来源级禁止外发规则
        const prov = opts?.provenance;
        const denyHit = [
            ...(prov?.docIds ?? []).map(docId => ({ docId })),
            ...(prov?.notebookIds ?? []).map(notebookId => ({ notebookId })),
        ].map(p => isDenied(denyList, p)).some(v => v.denied);

        const resolvedAiKey = settings.aiKey || readCardsSecretSlot(this.options, CARDS_SECRET_SLOTS.aiKey);
        const resolvedFallbackKey = settings.aiFallbackKey || readCardsSecretSlot(this.options, CARDS_SECRET_SLOTS.aiFallbackKey);

        // 3. 前置可用性检查
        const elig = checkEligibility({
            hasMaterial: source.trim().length > 0,
            aiConfigured: settings.aiMode === "siyuan"
                ? hasSiyuanAiApiKey()
                : Boolean(settings.aiEndpoint && (resolvedAiKey || settings.aiKeyConfigured)),
            online: typeof navigator !== "undefined" ? navigator.onLine : undefined,
            sensitive: denyHit,
            costExceeded: budget.exceeded,
        });

        if (!elig.ok) {
            const e = (i18n as any).aiElig;
            const b = elig.block!;
            throw new Error(`${e[b.reason]} ${e.alt[b.reason]}`);
        }

        // 4. 熔断前置
        const killReason = killSwitchBlock(killSwitch, [...this.aiProviderTargets(), "task:cards-generate"]);
        if (killReason) {
            const e = (i18n as any).aiKill;
            throw new Error(killReason === "consent-revoked" ? e.consentRevoked : e.targetDisabled);
        }

        // 5. 提示词流水线组装
        const assembled = assembleGeneratePrompt({
            task: "cards-generate",
            customTemplate: settings.aiPromptTemplate,
            defaultSystem: i18n.aiSystemPrompt,
            userTemplate: i18n.aiUserPrompt,
            source,
            cfg,
            typeClozeHint: i18n.aiTypeClozeHint,
            typeQaHint: i18n.aiTypeQaHint,
            guardClause: (i18n as any).aiInjectionGuard,
            untrustedLabel: (i18n as any).aiUntrustedLabel,
            modelId: settings.aiMode === "custom" ? settings.aiModel : "",
        });

        const { system, user } = assembled;
        lvLog("info", "[ai-pipeline] " + assembled.audit.modelId);
        if (assembled.needsBatching) {
            throw new Error(i18n.aiTooLong);
        }

        const jobId = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        let job = createJob(jobId, { type: settings.aiMode, label: source.slice(0, 50), excerpt: source.slice(0, 200) }, cfg);
        job = transitionJob(job, { type: "GENERATE_START" }).job;

        const beforeJobStart = normalizeAIJobs(cloneStore(this.options.getAIJobs()));
        this.upsertAIJob(job);
        await this.persistAIJobs(beforeJobStart);

        let fallbackNotified = false;
        try {
            const aiChat = await loadAiChat();
            if (opts?.signal?.aborted) {
                throw new AICanceledError();
            }
            const raw = await aiChat(
                {
                    mode: settings.aiMode,
                    endpoint: settings.aiEndpoint,
                    apiKey: resolvedAiKey,
                    model: settings.aiModel,
                    fallbackEndpoint: settings.aiFallbackEndpoint || undefined,
                    fallbackApiKey: resolvedFallbackKey || undefined,
                    fallbackModel: settings.aiFallbackModel || undefined,
                },
                system,
                user,
                {
                    signal: opts?.signal,
                    onProvider: p => {
                        if (p === "fallback" && !fallbackNotified) {
                            fallbackNotified = true;
                            const deg = (i18n as any).aiDegrad;
                            this.options.showNotice(`${deg.usedFallback}（${deg.mayCost}）`, 3000, "info");
                        }
                    },
                },
            );

            let parsed: ReturnType<typeof parseCards>;
            let parseFailedDetail = "";
            try {
                parsed = parseCards(raw).slice(0, cfg.count);
            } catch {
                parsed = [];
                parseFailedDetail = raw.slice(0, 60);
            }

            if (parsed.length === 0) {
                const refusal = evaluateRefusal({ "format-failure": parseFailedDetail || "empty" });
                const dict = (i18n as any).aiRefusal;
                const parts = [
                    dict?.kind?.[refusal.kind] ?? (i18n as any).aiWizard?.emptyResult ?? "AI returned no cards",
                    ...refusal.nextKeys.map(k => dict?.next?.[k.replace("aiRefusal.next.", "")]).filter(Boolean),
                ];
                throw new Error(parts.join("；"));
            }

            job = transitionJob(job, {
                type: "GENERATE_OK",
                candidates: parsed.map(c => ({ q: c.q, a: c.a, d: c.d, keep: true, status: "pending" as const })),
            }).job;

            const beforeJobReady = normalizeAIJobs(cloneStore(this.options.getAIJobs()));
            this.upsertAIJob(job);
            await this.persistAIJobs(beforeJobReady);

            // 批次元数据与用量账本记录
            const aiBatches = this.options.getAIBatches();
            const previousBatches = normalizeAIBatches(cloneStore(aiBatches));
            const batchesVersion = ++this.aiBatchesMutationVersion;
            aiBatches.batches.push({
                id: `ai-${Date.now().toString(36)}`,
                date: todayDate(),
                deckID: "",
                blockIDs: [],
                tokens: estimateTokens(system) + estimateTokens(user) + estimateTokens(raw),
                pin: {
                    mode: settings.aiMode,
                    modelId: assembled.audit.modelId,
                    templateHash: fnv1a(system),
                    sourceHash: fnv1a(source),
                    pinnedAt: Date.now(),
                },
            });

            if (aiBatches.batches.length > 200) {
                aiBatches.batches = aiBatches.batches.slice(-200);
            }

            const batchesSnapshot = cloneStore(aiBatches);
            try {
                await this.options.saveSlot(AI_BATCHES_DATA, batchesSnapshot);
                if (batchesVersion === this.aiBatchesMutationVersion) {
                    this.persistedAIBatchesSnapshot = cloneStore(batchesSnapshot);
                }
            } catch {
                if (batchesVersion === this.aiBatchesMutationVersion) {
                    this.options.setAIBatches(cloneStore(this.persistedAIBatchesSnapshot ?? previousBatches));
                }
                this.options.showNotice(i18n.storageWriteFail ?? "写入失败", 6000, "error");
            }

            // 用量入账
            const tokensIn = estimateTokens(system) + estimateTokens(user);
            const tokensOut = estimateTokens(raw);
            const currentCostLedger = this.options.getCostLedger();
            const previousCostLedger = normalizeCostLedger(cloneStore(currentCostLedger));
            const costVersion = ++this.costLedgerMutationVersion;
            const nextCostLedger = recordEntry(currentCostLedger, {
                at: Date.now(),
                task: "cards-generate",
                mode: settings.aiMode,
                modelId: assembled.audit.modelId,
                tokens: tokensIn + tokensOut,
                est: true,
                costUsd: assembled.audit.modelId
                    ? estimateCallCostUsd(assembled.audit.modelId, tokensIn, tokensOut)
                    : null,
                algorithm: "chars/4",
                priceVersion: MODEL_PRICE_SNAPSHOT,
            });

            this.options.setCostLedger(nextCostLedger);
            const costSnapshot = cloneStore(nextCostLedger);
            try {
                await this.options.saveSlot(AI_COST_LEDGER_DATA, costSnapshot);
                if (costVersion === this.costLedgerMutationVersion) {
                    this.persistedCostLedgerSnapshot = cloneStore(costSnapshot);
                }
            } catch {
                if (costVersion === this.costLedgerMutationVersion) {
                    this.options.setCostLedger(cloneStore(this.persistedCostLedgerSnapshot ?? previousCostLedger));
                }
                this.options.showNotice(i18n.storageWriteFail ?? "写入失败", 6000, "error");
            }

            // 预算预警
            if (budgetState(nextCostLedger, { enabled: settings.aiCostBudgetEnabled, monthlyTokenCap: settings.aiCostMonthlyCap }).warn) {
                this.options.showNotice((i18n as any).aiCost?.warn ?? "AI cost budget warning", 3000, "info");
            }

            return {
                cards: parsed,
                jobId,
                gen: {
                    mode: settings.aiMode,
                    modelId: assembled.audit.modelId,
                    templateHash: fnv1a(system),
                },
            };
        } catch (e) {
            job = transitionJob(job, isAICanceled(e)
                ? { type: "CANCEL" }
                : { type: "GENERATE_FAIL", error: e instanceof Error ? e.message : String(e) }).job;
            this.upsertAIJob(job);
            const failedJobSnapshot = cloneStore(this.options.getAIJobs());
            const failedJobVersion = this.aiJobsMutationVersion;
            await this.options.saveSlot(AI_JOBS_DATA, failedJobSnapshot).then(() => {
                if (failedJobVersion === this.aiJobsMutationVersion) {
                    this.persistedAIJobsSnapshot = cloneStore(failedJobSnapshot);
                }
            }).catch(() => {});
            throw e;
        }
    }

    public async createAICards(
        cards: { q: string; a: string; origIndex: number }[],
        deckID: string,
        deckName: string,
        jobId: string,
        sourceMeta?: { docId?: string; label?: string },
    ) {
        const operationID = jobId || `cards:${deckID}:${cards.map(card => card.origIndex).join(",")}`;
        const existing = this.aiCommitFlights.get(operationID);
        if (existing) return existing;
        const operation = this.createAICardsOnce(cards, deckID, deckName, jobId, sourceMeta);
        this.aiCommitFlights.set(operationID, operation);
        operation.finally(() => {
            if (this.aiCommitFlights.get(operationID) === operation) this.aiCommitFlights.delete(operationID);
        }).catch(() => {});
        return operation;
    }

    private async createAICardsOnce(
        cards: { q: string; a: string; origIndex: number }[],
        deckID: string,
        _deckName: string,
        jobId: string,
        sourceMeta?: { docId?: string; label?: string },
    ) {
        const i18n = this.options.getI18n();
        const { findAiCardGateIssues, buildAiCardMarker, buildAiCardBlockMarkdown } = await loadHubServices();
        const qualityIssues = findAiCardGateIssues(cards);
        if (qualityIssues.some(issues => issues.length > 0)) {
            throw new Error((i18n as any).aiWizard?.qualityBlocked ?? "质量门禁拦截");
        }
        try {
            for (const card of cards) serializeQaCard(card.q, card.a);
        } catch {
            throw new Error((i18n as any).aiWizard?.invalidDraft ?? "卡片格式错误");
        }

        const nb = await this.options.targetNotebook();
        if (!nb) {
            throw new Error(i18n.onboardingNoNotebook ?? "请先选择目标笔记本");
        }

        const aiJobs = this.options.getAIJobs();
        let job: AIJob | undefined = jobId ? aiJobs.jobs.find(j => j.id === jobId) : undefined;
        const date = todayDate();
        let docID = job?.targetDocID;
        if (!docID) {
            docID = (await createDocWithMd(nb.id, `/小驴闪卡/AI 制卡/${date}`, "")) ?? undefined;
            if (!docID) {
                throw new Error(i18n.quickCardFail ?? "快速制卡失败");
            }
            await new Promise(r => setTimeout(r, 120));
        }

        if (job) {
            if (job.targetDocID !== docID) {
                job = { ...job, targetDocID: docID };
                this.upsertAIJob(job);
                await this.persistAIJobsOnce(`${job.id}:doc:${docID}`);
            }
            job = transitionJob(job, { type: "COMMIT_START", deckID }).job;
            this.upsertAIJob(job);
            await this.persistAIJobsOnce(`${job.id}:commit-start:${deckID}`);
        }

        const blockIDs: string[] = [];
        await this.options.withDocLock(docID, async () => {
            for (const card of cards) {
                const candidate = job?.candidates[card.origIndex];
                if (candidate?.status === "created" && candidate.blockID) {
                    blockIDs.push(candidate.blockID);
                    await this.options.rememberSourceFingerprint(candidate.blockID, docID);
                    continue;
                }

                const marker = buildAiCardMarker(job?.id, card.origIndex);
                let blockID = "";
                if (marker) {
                    try {
                        const escapedDoc = docID.replace(/'/g, "''");
                        const escapedMarker = marker.replace(/'/g, "''");
                        const rows = await sqlQuery(`SELECT id FROM blocks WHERE root_id='${escapedDoc}' AND markdown LIKE '%${escapedMarker}%' LIMIT 1`);
                        blockID = String(rows[0]?.id ?? "");
                    } catch {}
                }

                let cardMarkdown = buildAiCardBlockMarkdown(card.q, card.a, marker);
                if (sourceMeta?.docId) {
                    const cleanLabel = (sourceMeta.label || "原笔记").replace(/["\n\r]/g, " ").trim();
                    cardMarkdown += `\n\n> 来源：(( ${sourceMeta.docId} "${cleanLabel}" ))`;
                }

                if (!blockID) {
                    let ids = await appendBlock("markdown", cardMarkdown, docID);
                    blockID = ids[0] ?? "";
                    if (!blockID && job?.targetDocID) {
                        const recreatedDocID = (await createDocWithMd(nb.id, `/小驴闪卡/AI 制卡/${date}`, "")) ?? "";
                        if (recreatedDocID) {
                            docID = recreatedDocID;
                            job = { ...job, targetDocID: docID };
                            this.upsertAIJob(job);
                            await new Promise(r => setTimeout(r, 120));
                            ids = await appendBlock("markdown", cardMarkdown, docID);
                            blockID = ids[0] ?? "";
                        }
                    }
                }

                if (!blockID) throw new Error(i18n.quickCardFail ?? "快速制卡失败");
                blockIDs.push(blockID);

                if (sourceMeta?.docId) {
                    void setBlockAttrs(blockID, {
                        "custom-lv-source-doc": sourceMeta.docId,
                    }).catch(() => {});
                }

                await new Promise(r => setTimeout(r, 60));
                await addRiffCards(deckID, [blockID]);
                await this.options.rememberSourceFingerprint(blockID, docID, cardMarkdown);

                if (job) {
                    const r = transitionJob(job, { type: "CARD_CREATED", index: card.origIndex, blockID });
                    if (r.ok) {
                        job = r.job;
                        this.upsertAIJob(job);
                        await this.persistAIJobsOnce(`${job.id}:card:${card.origIndex}:${blockID}`);
                    }
                }
            }
        });

        if (job) {
            for (let idx = 0; idx < job.candidates.length; idx++) {
                if (job.candidates[idx].status === "pending") {
                    const r = transitionJob(job, { type: "CARD_SKIPPED", index: idx });
                    if (r.ok) { job = r.job; }
                }
            }
            this.upsertAIJob(job);
            await this.persistAIJobsOnce(`${job.id}:skipped`);
            const done = transitionJob(job, { type: "COMMIT_DONE" });
            if (done.ok) {
                job = done.job;
                this.upsertAIJob(job);
                await this.persistAIJobsOnce(`${job.id}:done`);
            }
        }

        invalidateDueCache();
        try {
            if (this.options.eventBus) {
                this.options.eventBus.emit(LV_EVENTS.cardsCreated, cardsCreatedEvent({
                    deckID, count: blockIDs.length, blockIDs,
                }));
            }
        } catch {}

        notifyBatchCardCreation(i18n.deckAdded?.replace("${n}", String(blockIDs.length)) ?? `已将 ${blockIDs.length} 张卡片加入卡组`);
    }
}

export function createAICardService(options: AICardServiceOptions): AICardService {
    return new AICardService(options);
}
