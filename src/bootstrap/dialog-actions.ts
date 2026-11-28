/**
 * 闪卡对话框与辅助界面动作集（Dialog Actions）
 * 统管设置中心、卡包选择器、快速制卡、引导、命令面板、AI向导、标记制卡、挑战/配对/演练游戏与动态看板等弹窗。
 */

import {
    svelteDialog,
    confirmDialogBool,
    bindMobileVisualViewport,
} from "@/libs/dialog";
import { lvLog, lvLogDump } from "@/libs/log";
import {
    getNotebooks,
    createDocWithMd,
    sqlQuery,
    flushTransaction,
    exportMdContent,
    appendBlock,
    setBlockAttrs,
} from "@/api/siyuan";
import { getAllEditor } from "siyuan";
import { addRiffCards, formatRiffCardEntryError } from "@/api/due-shared";
import { notifyBatchCardCreation } from "@/libs/notice";
import { validateCardEntry } from "@/core/card-entry-gate";
import { executeQuickCardCreation } from "@/core/card-operations";
import { serializeQaCard } from "@/core/flashcard-quality";
import { isSelectableModel } from "@/core/ai-model-registry";
import { normalizeSettings, stripSecretsForStorage, hasSiyuanAiApiKey, type LvCardsSettings } from "@/core/settings";
import { CARDS_SECRET_SLOTS, readCardsSecretSlot, bindCardsSecretSlots, type CardsSecretField } from "@/core/secrets";
import { normalizeRevlog, mergeRevlog, localDate } from "@/core/revlog";
import { budgetState } from "@/core/ai-cost-ledger";
import { normalizeObLedger, normalizeLedger } from "@/core/import-ledgers";
import { disableTarget, enableTarget, revokeConsent, grantConsent } from "@/core/ai-kill-switch";
import { detectFlashcardV2 } from "@/api/v2-detect";
import { LV_EVENTS, gatewayChangedEvent } from "@/libs/events";
import {
    buildRepairDrillDialogArgs,
    buildChallengeDialogArgs,
    buildPairingDialogArgs,
} from "@/bootstrap/dialog-openers";
import {
    loadDeckPicker,
    loadQuickCard,
    loadQuickCardEmbedded,
    loadOnboarding,
    loadSettingsPanel,
    loadPaletteView,
    loadAIWizard,
    loadAIWizardEmbedded,
    loadMarkerCards,
    loadChallengeMode,
    loadPairingGame,
    loadRepairDrill,
    loadHubServices,
} from "@/bootstrap/chunk-loaders";
import {
    OB_LEDGER_DATA,
    ANKI_LEDGER_DATA,
    REVLOG_DATA,
} from "@/bootstrap/storage-keys";
import { TAB_DASHBOARD, TAB_REVIEW } from "@/bootstrap/tab-constants";
import type { PaletteCommand } from "@/core/palette";
import type { ExamPlan } from "@/core/exam";

const noop = () => {};
const sampleBusyHosts = new WeakSet<object>();
const sampleWsBusyHosts = new WeakSet<object>();

function cloneStore<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

const todayDate = () => localDate(Date.now());

export function reportDialogOpenFailure(plugin: any, kind: string, error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error);
    lvLog("error", `[dialog] ${kind} open failed: ${detail}`);
    const prefix = plugin.i18n.chunkLoadFailedDetail ?? "加载失败";
    plugin.showNotice(`${prefix}\n${detail}`, 4000, "error");
}

export async function openPluginPalette(plugin: any): Promise<void> {
    if (plugin.paletteState === undefined) return;
    if (plugin.paletteState) {
        (plugin.paletteState.element?.querySelector("input") as HTMLInputElement | null)?.focus();
        return;
    }
    const state: NonNullable<typeof plugin.paletteState> = {};
    plugin.paletteState = state;
    const release = () => {
        if (plugin.paletteState === state) plugin.paletteState = null;
    };
    try {
        const createView = await loadPaletteView();
        if (plugin.paletteState !== state) return;
        const runners: Record<string, () => void> = {
            review: () => plugin.openTabOf(TAB_REVIEW),
            cram: () => plugin.openTabOf(TAB_REVIEW, { cram: true }),
            wizard: () => plugin.openAIWizard(),
            quick: () => plugin.openQuickCard(),
            pairing: () => plugin.openPairing(),
            drill: () => plugin.openRepairDrill(),
            settings: () => plugin.openSettingsDialog(),
            imports: () => plugin.openSettingsDialog(undefined, "imports"),
            overview: () => plugin.openTabOf(TAB_DASHBOARD),
            manage: () => plugin.openTabOf(TAB_DASHBOARD, { tab: "manage" }),
            authoring: () => plugin.openTabOf(TAB_DASHBOARD, { tab: "authoring" }),
            goals: () => plugin.openTabOf(TAB_DASHBOARD, { tab: "goals" }),
            inbox: () => plugin.openTabOf(TAB_DASHBOARD, { tab: "inbox" }),
            exam: () => plugin.openTabOf(TAB_DASHBOARD, { tab: "exam" }),
            maintenance: () => plugin.openTabOf(TAB_DASHBOARD, { tab: "maintenance" }),
            "dynamic-board": () => plugin.openOrCreateDynamicBoardDoc(),
        };
        const handle = svelteDialog({
            ...createView({ modules: plugin.settings.modules, uiMode: plugin.settings.uiMode, i18n: plugin.i18n },
                (cmd: PaletteCommand) => {
                    if (plugin.paletteState !== state) return;
                    state.close?.();
                    release();
                    runners[cmd.id]?.();
                }, release),
            callback: release,
        });
        state.close = handle.close;
        state.element = handle.dialog.element;
    } catch (e) {
        if (plugin.paletteState === state) {
            release();
            reportDialogOpenFailure(plugin, plugin.i18n.cmdPalette ?? "命令面板", e);
        }
    }
}

export async function openPluginDeckPicker(plugin: any, blockIDs: string[], opts: { skipAdd?: boolean; onPicked?: (deckID: string) => void } = {}): Promise<void> {
    const DeckPicker = await loadDeckPicker();
    svelteDialog({
        title: plugin.i18n.deckPickerTitle,
        component: DeckPicker,
        width: "min(420px, 92vw)",
        props: {
            newNamePlaceholder: plugin.i18n.deckNewName,
            firstDeckNamePlaceholder: plugin.i18n.deckNewNameFirst,
            emptyDeckText: plugin.i18n.deckEmpty,
            retryLabel: plugin.i18n.refresh,
            confirmLabel: plugin.i18n.deckConfirm,
            loadingLabel: plugin.i18n.deckLoading,
            busyLabel: plugin.i18n.deckSaving,
            onBeforeConfirm: async () => {
                if (opts.skipAdd) return;
                try {
                    await flushTransaction();
                } catch {
                    await new Promise(r => setTimeout(r, 300));
                }
                const escapedIDs = blockIDs.map(id => `'${id.replace(/'/g, "''")}'`).join(",");
                const rows = await sqlQuery(`SELECT id, markdown, ial FROM blocks WHERE id IN (${escapedIDs})`);
                const rowsById = new Map(rows.map((row: any) => [String(row.id), row]));
                const invalidIds: string[] = [];
                for (const id of blockIDs) {
                    const row: any = rowsById.get(id);
                    const markdown = String(row?.markdown ?? "");
                    const ial = String(row?.ial ?? "");
                    const attrs: Record<string, string> = {};
                    for (const m of ial.matchAll(/([a-zA-Z0-9_-]+)=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
                        attrs[m[1]] = m[2] ?? m[3] ?? m[4] ?? "";
                    }
                    const occlusionValid = await plugin.hasValidOcclusionCard(id, markdown);
                    const decision = validateCardEntry({
                        blockID: id,
                        markdown,
                        attrs,
                        exists: Boolean(row),
                        occlusionValid,
                        allowLegacyFormat: true,
                    });
                    if (!decision.ok) invalidIds.push(id);
                }
                if (invalidIds.length > 0) {
                    const reason = plugin.i18n.flashcardNeedsAnswer || "选中的块尚未设置问题或挖空，无法加入卡组";
                    plugin.showNotice(reason, 3000, "error");
                    throw new Error(reason);
                }
                const { checkDuplicateCards } = await loadHubServices();
                const dupes = await checkDuplicateCards(blockIDs);
                if (dupes > 0) {
                    return confirmDialogBool({
                        title: plugin.i18n.dupTitle,
                        content: `<div class="b3-typography">${plugin.i18n.dupConfirm.replace("${n}", String(dupes))}</div>`,
                    });
                }
                return true;
            },
            onConfirm: async (deckID: string) => {
                if (!opts.skipAdd) {
                    try {
                        await addRiffCards(deckID, blockIDs);
                        await Promise.all(blockIDs.map(id => plugin.rememberSourceFingerprint(id)));
                    } catch (error) {
                        const errText = formatRiffCardEntryError(error, plugin.i18n);
                        plugin.showNotice(errText, 3000, "error");
                        throw new Error(errText);
                    }
                    notifyBatchCardCreation(plugin.i18n.deckAdded.replace("${n}", String(blockIDs.length)));
                }
                opts.onPicked?.(deckID);
                return true;
            },
            onClose: noop,
        },
    });
}

export async function createQuickCard(
    plugin: any,
    markdown: string,
    deckID: string,
    _deckName: string,
    q?: string,
    a?: string,
    docID?: string,
    options?: { sourceDocID?: string; sourceBlockID?: string; sourceTitle?: string; inPlace?: boolean; examAttrs?: Record<string, string> },
) {
    const nb = await plugin.targetNotebook();
    if (!nb) throw new Error(plugin.i18n.onboardingNoNotebook);
    const created = await executeQuickCardCreation({
        nbId: nb.id,
        markdown,
        deckID,
        qualityErrorMessage: plugin.i18n.flashcardNeedsAnswer,
        q,
        a,
        docID,
        sourceDocID: options?.sourceDocID,
        sourceBlockID: options?.sourceBlockID,
        sourceTitle: options?.sourceTitle,
        inPlaceDocID: options?.inPlace && options.sourceDocID ? options.sourceDocID : undefined,
        examAttrs: options?.examAttrs,
        mutateKnowledgeObjects: (mutator: any) => plugin.knowledgeObjectsMutations(mutator),
    });
    await plugin.rememberSourceFingerprint(created.blockID, created.docID, markdown);
    plugin.showNotice(options?.inPlace ? (plugin.i18n.quickCardDocInPlaceDone ?? "已在当前笔记就地制卡并加入卡组") : plugin.i18n.quickCardDone, 2000, "info");
    return created;
}

export async function createQuickCardView(plugin: any, embedded = false, prefillQ = "") {
    const view: { Component: any; mount?: (comp: any, target: HTMLElement, props: Record<string, any>) => { destroy(): void } } = embedded
        ? await loadQuickCardEmbedded()
        : { Component: await loadQuickCard() };
    const activeDoc = await loadCurrentDoc().catch(() => null);
    return {
        Component: view.Component,
        ...(view.mount ? { mount: view.mount } : {}),
        props: {
            i18n: plugin.i18n,
            activeDoc: activeDoc ? { name: activeDoc.name, docId: activeDoc.docId } : null,
            initialDeckID: plugin.settings.lastQuickCardDeck ?? "",
            initialQ: prefillQ,
            onDeckUsed: (deckID: string) => {
                if (!deckID || plugin.settings.lastQuickCardDeck === deckID) return;
                plugin.settings.lastQuickCardDeck = deckID;
                plugin.saveSettingsSoon();
            },
            onCreate: (markdown: string, deckID: string, deckName: string, q?: string, a?: string, docID?: string, options?: any) =>
                createQuickCard(plugin, markdown, deckID, deckName, q, a, docID, options),
            onClose: noop,
        },
    };
}

export async function openPluginQuickCard(plugin: any, prefillQ = ""): Promise<void> {
    try {
        const mobile = plugin.isMobileHost();
        const view = await createQuickCardView(plugin, mobile, prefillQ);
        let unbindVv: (() => void) | null = null;
        const { dialog } = svelteDialog({
            title: plugin.i18n.quickCardTitle,
            component: view.Component,
            width: mobile ? "100vw" : "min(620px, 94vw)",
            height: mobile ? "100dvh" : "min(820px, calc(100vh - 48px))",
            props: view.props,
            callback: () => {
                unbindVv?.();
                unbindVv = null;
            },
        });
        if (mobile) {
            dialog.element.classList.add("lv-mobile-sheet-dialog");
            dialog.element.querySelector(".b3-dialog")?.classList.add("lv-mobile-sheet-dialog");
            unbindVv = bindMobileVisualViewport(dialog.element);
        }
    } catch (e) {
        reportDialogOpenFailure(plugin, plugin.i18n.quickCardTitle, e);
    }
}

export async function openPluginQuickCardFromSelection(plugin: any, blockID: string, selectionText: string): Promise<void> {
    try {
        const mobile = plugin.isMobileHost();
        const view = await createQuickCardView(plugin, false, selectionText);
        let unbindVv: (() => void) | null = null;
        const { dialog } = svelteDialog({
            title: plugin.i18n.quickCardTitle,
            component: view.Component,
            width: mobile ? "100vw" : "min(620px, 94vw)",
            height: mobile ? "100dvh" : "min(820px, calc(100vh - 48px))",
            props: {
                ...view.props,
                activeDoc: await loadCurrentDoc().then(d => d ? { name: d.name, docId: d.docId ?? "" } : null).catch(() => null),
                onCreate: (markdown: string, deckID: string, deckName: string, q?: string, a?: string, docID?: string, options?: any) =>
                    createQuickCard(plugin, markdown, deckID, deckName, q, a, docID, {
                        ...options,
                        sourceBlockID: blockID,
                        sourceDocID: options?.sourceDocID,
                    }),
            },
            callback: () => {
                unbindVv?.();
                unbindVv = null;
            },
        });
        if (mobile) {
            dialog.element.classList.add("lv-mobile-sheet-dialog");
            dialog.element.querySelector(".b3-dialog")?.classList.add("lv-mobile-sheet-dialog");
            unbindVv = bindMobileVisualViewport(dialog.element);
        }
    } catch (e) {
        reportDialogOpenFailure(plugin, plugin.i18n.quickCardTitle, e);
    }
}

export async function openPluginOnboarding(plugin: any): Promise<void> {
    try {
        const Onboarding = await loadOnboarding();
        let closeOnboardingDialog = () => {};
        const { dialog } = svelteDialog({
            title: plugin.i18n.onboardingTitle,
            component: Onboarding,
            width: "min(560px, 94vw)",
            props: {
                i18n: plugin.i18n,
                applyPersona: async (id: "exam" | "notes" | "language") => {
                    const { PERSONA_PRESETS } = await loadHubServices();
                    const preset = PERSONA_PRESETS.find(p => p.id === id);
                    if (!preset) return;
                    plugin.settings = {
                        ...plugin.settings,
                        modules: { ...plugin.settings.modules, ...preset.modules },
                        ...preset.params,
                        persona: id,
                    };
                    await plugin.saveSettingsNow();
                },
                createSampleCards: (nbId: string) => createSampleCards(plugin, nbId),
                openHelp: () => { closeOnboardingDialog(); void openPluginHelpDoc(plugin); },
                openSampleDoc: (docId: string) => { closeOnboardingDialog(); plugin.openSiYuanTarget(docId); },
                openReview: () => { closeOnboardingDialog(); plugin.openTabOf(TAB_REVIEW); },
                onClose: () => plugin.markOnboarded(),
            },
        });
        closeOnboardingDialog = () => dialog.destroy();
    } catch (e) {
        reportDialogOpenFailure(plugin, plugin.i18n.onboardingTitle, e);
    }
}

export async function createSampleCards(plugin: any, nbId: string): Promise<string | null> {
    if (sampleBusyHosts.has(plugin)) return null;
    sampleBusyHosts.add(plugin);
    try {
        const { createOnboardingSampleCards } = await loadHubServices();
        return await createOnboardingSampleCards(nbId, plugin.i18n);
    } finally {
        sampleBusyHosts.delete(plugin);
    }
}

export async function openPluginSettingsDialog(plugin: any, onSaved?: () => void, initialSection?: "imports"): Promise<void> {
    try {
        const mobile = plugin.isMobileHost();
        const [SettingsPanel, hubSvc] = await Promise.all([
            loadSettingsPanel(),
            loadHubServices(),
            typeof plugin.ensureTier2Loaded === "function" ? plugin.ensureTier2Loaded().catch(() => {}) : Promise.resolve(),
        ]);

        let unbindVv: (() => void) | null = null;
        let beforeClose: (() => boolean | "keep") | null = null;
        const { close, dialog } = svelteDialog({
            title: plugin.i18n.settingsTitle,
            component: SettingsPanel,
            width: mobile ? "100vw" : "min(620px, 94vw)",
            height: mobile ? "100dvh" : "min(860px, calc(100vh - 48px))",
            onBeforeDismiss: () => beforeClose?.(),
            callback: () => {
                unbindVv?.();
                unbindVv = null;
            },
            props: {
                initialSection,
                ctx: {
                    i18n: plugin.i18n,
                    settings: plugin.settings,
                    close: () => close(),
                    registerBeforeClose: (fn: (() => boolean | "keep") | null) => {
                        beforeClose = fn;
                    },
                    save: async (s: LvCardsSettings & { __clearSecrets?: Partial<Record<CardsSecretField, boolean>> }) => {
                        const previous = plugin.settings;
                        const clearFlags = s.__clearSecrets || {};
                        delete (s as any).__clearSecrets;

                        const secretUpdates: Partial<Record<(typeof CARDS_SECRET_SLOTS)[CardsSecretField], string>> = {};
                        const resolveNextSecret = (field: CardsSecretField): { key: string; configured: boolean } => {
                            const slot = CARDS_SECRET_SLOTS[field];
                            const typed = typeof s[field] === "string" ? s[field].trim() : "";
                            if (clearFlags[field]) {
                                secretUpdates[slot] = "";
                                return { key: "", configured: false };
                            }
                            if (typed) {
                                secretUpdates[slot] = typed;
                                return { key: typed, configured: true };
                            }
                            const existing = readCardsSecretSlot(plugin, slot) || (typeof previous?.[field] === "string" ? previous[field] : "");
                            return { key: existing, configured: Boolean(existing || previous?.[`${field}Configured`]) };
                        };

                        const nextAiKey = resolveNextSecret("aiKey");
                        const nextFallbackKey = resolveNextSecret("aiFallbackKey");
                        const nextAnkiKey = resolveNextSecret("ankiClientKey");

                        let bindOk = false;
                        if (Object.keys(secretUpdates).length > 0) {
                            const bindRes = await bindCardsSecretSlots({ updates: secretUpdates, plugin });
                            if (!bindRes.ok && !bindRes.readOnlyFallback) {
                                throw new Error(`保存安全密钥失败：${bindRes.reason}`);
                            }
                            bindOk = bindRes.ok;
                        }

                        if (!plugin.secretSlotBound) plugin.secretSlotBound = {};
                        for (const field of ["aiKey", "aiFallbackKey", "ankiClientKey"] as const) {
                            if (clearFlags[field]) {
                                plugin.secretSlotBound[field] = false;
                            } else if (secretUpdates[CARDS_SECRET_SLOTS[field]]) {
                                plugin.secretSlotBound[field] = bindOk;
                            }
                        }

                        s.aiKey = nextAiKey.key;
                        s.aiKeyConfigured = nextAiKey.configured;
                        s.aiFallbackKey = nextFallbackKey.key;
                        s.aiFallbackKeyConfigured = nextFallbackKey.configured;
                        s.ankiClientKey = nextAnkiKey.key;
                        s.ankiClientKeyConfigured = nextAnkiKey.configured;

                        plugin.settings = s;
                        try {
                            await plugin.saveSettingsNow();
                        } catch (e) {
                            plugin.settings = previous;
                            plugin.setupBadgeTimer();
                            throw e;
                        }
                        plugin.showNotice(plugin.i18n.settingsSaved, 2000, "info");
                        onSaved?.();
                    },
                    resolveSecret: (field: CardsSecretField) => {
                        const slot = CARDS_SECRET_SLOTS[field];
                        return readCardsSecretSlot(plugin, slot) || String(plugin.settings?.[field] || "");
                    },
                    exportRevlog: () => { void loadHubServices().then(h => h.exportRevlogJson(plugin.revlog, todayDate())); },
                    clearRevlog: () => plugin.sessionService.clearRevlog(),
                    costLedger: {
                        export: () => { void loadHubServices().then(h => h.exportAiCostLedger(plugin.costLedger, todayDate())); },
                        clear: () => plugin.aiCardService.clearCostLedger(),
                        monthUsed: () => budgetState(plugin.costLedger, { enabled: false, monthlyTokenCap: 0 }).monthUsed,
                    },
                    backup: {
                        export: () => {
                            void Promise.all([
                                plugin.ensureTier2Loaded().then(() => plugin.readAllStores()),
                                loadHubServices(),
                            ]).then(([stores, h]) => {
                                h.exportAllBackupBundle(stores, todayDate());
                            }).catch((e: any) => {
                                lvLog("error", `exportBackup failed: ${e instanceof Error ? e.message : String(e)}`);
                                plugin.showNotice(plugin.i18n.backupExportFail ?? "备份导出失败", 3000, "error");
                            });
                        },
                        restore: (text: string) => plugin.sessionService.restoreBackupFromFile(text),
                    },
                    obLedger: {
                        load: async () => plugin.obLedger,
                        save: async (entries: unknown) => {
                            const previous = plugin.obLedger;
                            const next = normalizeObLedger(entries);
                            try {
                                await plugin.storageCoordinator.save(OB_LEDGER_DATA, next);
                                plugin.obLedger = next;
                            } catch (e) {
                                plugin.obLedger = previous;
                                throw e;
                            }
                        },
                    },
                    ankiLedger: {
                        load: async () => plugin.ankiLedger,
                        save: async (entries: unknown) => {
                            const previous = plugin.ankiLedger;
                            const next = normalizeLedger(entries);
                            try {
                                await plugin.storageCoordinator.save(ANKI_LEDGER_DATA, next);
                                plugin.ankiLedger = next;
                            } catch (e) {
                                plugin.ankiLedger = previous;
                                throw e;
                            }
                        },
                    },
                    rememberSourceFingerprint: (blockID: string, rootID?: string, markdown?: string) => plugin.rememberSourceFingerprint(blockID, rootID, markdown),
                    killswitch: {
                        snapshot: () => plugin.killSwitch,
                        stopCurrent: async () => {
                            const targets = plugin.aiProviderTargets();
                            await plugin.cancelPendingAiJobs();
                            return plugin.mutateKillSwitch((next: any) => {
                                for (const t of targets) disableTarget(next, t, Date.now());
                            });
                        },
                        resumeAll: async () => {
                            const targets = plugin.aiProviderTargets();
                            return plugin.mutateKillSwitch((next: any) => {
                                const toEnable = new Set<string>(targets);
                                for (const t of next.disabledTargets || []) {
                                    if (typeof t === "string" && (t.startsWith("provider:") || t.startsWith("model:"))) {
                                        toEnable.add(t);
                                    }
                                }
                                for (const t of toEnable) enableTarget(next, t, Date.now());
                            });
                        },
                        revoke: async () => {
                            await plugin.cancelPendingAiJobs();
                            return plugin.mutateKillSwitch((next: any) => revokeConsent(next, Date.now()));
                        },
                        grant: async () => {
                            return plugin.mutateKillSwitch((next: any) => grantConsent(next, Date.now()));
                        },
                    },
                    redetectV2: async () => {
                        plugin.flashcardV2 = await detectFlashcardV2();
                        const state = plugin.flashcardV2 ? plugin.flashcardV2.state : "N/A (<3.9.0)";
                        plugin.settings.gatewayState = state;
                        plugin.saveSettingsSoon();
                        try {
                            (plugin.eventBus as any).emit(LV_EVENTS.gatewayChanged, gatewayChangedEvent(state));
                        } catch {}
                        return state;
                    },
                    getV2Status: () => plugin.flashcardV2 ? plugin.flashcardV2.state : "N/A (<3.9.0)",
                    getSuspendedCount: () => plugin.suspendToday.cardIDs.length,
                    restoreAllSuspended: async () => {
                        const ids = [...plugin.suspendToday.cardIDs];
                        if (ids.length === 0) return;
                        try {
                            await plugin.suspendTodayMutations.unsuspend(ids);
                            plugin.showNotice(plugin.i18n.settingsSaved, 2000, "info");
                        } catch {
                            plugin.toastStorageFail();
                        }
                    },
                    testAnkiClient: async (url?: string, key?: string) => {
                        const effectiveKey = key || readCardsSecretSlot(plugin, CARDS_SECRET_SLOTS.ankiClientKey) || plugin.settings.ankiClientKey;
                        const { probeAnkiConnection } = await loadHubServices();
                        return probeAnkiConnection(url ?? plugin.settings.ankiClientUrl, effectiveKey, plugin.i18n);
                    },
                    storageStats: () => hubSvc.computeStorageStats({
                        settingsVersion: plugin.settings.version,
                        revlogCount: plugin.revlog.entries.length,
                        suspendTodayCount: plugin.suspendToday.cardIDs.length,
                        examPlansCount: plugin.examPlans.plans.length,
                        aiBatchesCount: plugin.aiBatches.batches.length,
                        aiJobsCount: plugin.aiJobs.jobs.length,
                        knowledgeObjectsCount: plugin.knowledgeObjects.objects.length,
                        relationsCount: plugin.cardRelations.relations.length,
                        errorTagsCount: plugin.errorTags.tags.length,
                        inboxCount: plugin.inbox.items.length,
                        learningGoalsCount: plugin.learningGoals.goals.length,
                        entryContextsCount: plugin.entryContexts.contexts.length,
                        contentLifecyclesCount: plugin.contentLifecycles.lifecycles.length,
                        killSwitchDisabledCount: plugin.killSwitch.disabledTargets.length,
                        killSwitchQuarantinedCount: plugin.killSwitch.quarantinedJobs.length,
                        storageLastWrite: plugin.storageLastWrite,
                    }),
                    generateExamReport: (plan: ExamPlan) => writeExamReportDoc(plugin, plan),
                    exportSettings: () => { void loadHubServices().then(h => h.exportSettingsJson(stripSecretsForStorage(plugin.settings), todayDate())); },
                    getNotebooks: async () => {
                        try {
                            return await getNotebooks();
                        } catch {
                            return [];
                        }
                    },
                    importSettings: async (fileText: string) => {
                        let parsed: unknown;
                        try {
                            parsed = JSON.parse(fileText);
                        } catch {
                            throw new Error(plugin.i18n.settingsBadJson || "设置文件不是合法的 JSON 格式");
                        }
                        const previous = plugin.settings;
                        const next = normalizeSettings(parsed as any);
                        plugin.settings = next;
                        try {
                            await plugin.saveSettingsNow();
                        } catch (e) {
                            plugin.settings = previous;
                            plugin.setupBadgeTimer();
                            throw e;
                        }
                    },
                    exportRevlogCsv: () => { void loadHubServices().then(h => h.exportRevlogToCsv(plugin.revlog, todayDate())); },
                    openDynamicBoardDoc: () => openOrCreateDynamicBoardDoc(plugin),
                    openOnboarding: () => { close(); void plugin.openOnboarding(); },
                    presentationPrivacy: plugin.presentationPrivacyController ? {
                        isEnabled: () => plugin.presentationPrivacyController.getState().enabled,
                        toggle: () => plugin.togglePresentationPrivacy(),
                    } : undefined,
                    importRevlogCsv: async (fileText: string) => {
                        const { parseRevlogCsv } = await loadHubServices();
                        const imported = parseRevlogCsv(fileText);
                        const previous = plugin.revlog;
                        const next = normalizeRevlog(cloneStore(previous));
                        const result = mergeRevlog(next, imported);
                        const version = ++plugin.revlogMutationVersion;
                        plugin.revlog = next;
                        plugin.refreshDueBadge();
                        await plugin.storageCoordinator.save(REVLOG_DATA, cloneStore(next)).then(() => {
                            if (version === plugin.revlogMutationVersion) plugin.persistedRevlogSnapshot = cloneStore(next);
                        }).catch((error: any) => {
                            if (version === plugin.revlogMutationVersion) {
                                plugin.revlog = cloneStore(plugin.persistedRevlogSnapshot ?? previous);
                                plugin.refreshDueBadge();
                            }
                            throw error;
                        });
                        return result;
                    },
                    importRevlogMerge: async (fileText: string, onFork?: "skip" | "preferImport") => {
                        let imported: unknown;
                        try {
                            imported = JSON.parse(fileText);
                        } catch {
                            throw new Error("导入数据格式无效，不是合法的 JSON 文件");
                        }
                        const previous = plugin.revlog;
                        const next = normalizeRevlog(cloneStore(previous));
                        const result = mergeRevlog(next, imported, { onFork });
                        const version = ++plugin.revlogMutationVersion;
                        plugin.revlog = next;
                        plugin.refreshDueBadge();
                        await plugin.storageCoordinator.save(REVLOG_DATA, cloneStore(next)).then(() => {
                            if (version === plugin.revlogMutationVersion) plugin.persistedRevlogSnapshot = cloneStore(next);
                        }).catch((error: any) => {
                            if (version === plugin.revlogMutationVersion) {
                                plugin.revlog = cloneStore(plugin.persistedRevlogSnapshot ?? previous);
                                plugin.refreshDueBadge();
                            }
                            throw error;
                        });
                        return result;
                    },
                },
            },
        });
        dialog.element.classList.add("lv-dialog--settings");
        if (mobile) {
            dialog.element.classList.add("lv-mobile-sheet-dialog");
            dialog.element.querySelector(".b3-dialog")?.classList.add("lv-mobile-sheet-dialog");
            unbindVv = bindMobileVisualViewport(dialog.element);
        }
        const ensureSettingsFocused = () => {
            if (!dialog.element.isConnected) return;
            const openDialogs = document.querySelectorAll(".b3-dialog--open");
            if (openDialogs.length > 0 && openDialogs[openDialogs.length - 1] !== dialog.element && !dialog.element.contains(openDialogs[openDialogs.length - 1])) {
                return;
            }
            if (dialog.element.contains(document.activeElement)) return;
            const target = (dialog.element.querySelector(
                ".lv-settings input:not([disabled]):not([type='hidden']), .lv-settings button:not([disabled]), .b3-dialog__close, button:not([disabled]), [tabindex]:not([tabindex='-1'])",
            ) as HTMLElement | null) ?? dialog.element;
            if (target === dialog.element && dialog.element.tabIndex < 0) {
                dialog.element.tabIndex = -1;
            }
            try { target.focus({ preventScroll: true }); } catch {}
        };
        ensureSettingsFocused();
        if (typeof queueMicrotask === "function") queueMicrotask(ensureSettingsFocused);
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(ensureSettingsFocused);
    } catch (e) {
        reportDialogOpenFailure(plugin, plugin.i18n.settingsTitle, e);
    }
}

export async function loadCurrentDoc(): Promise<{ name: string; content: string; docId?: string } | null> {
    const editors: any[] = (getAllEditor() as any) ?? [];
    if (editors.length === 0) return null;
    const active = editors.find(e => e?.headElement?.classList?.contains("item--focus")) ?? editors[editors.length - 1];
    const rootID: string = active?.protyle?.block?.rootID ?? "";
    if (!rootID) return null;
    const md = await exportMdContent(rootID);
    return { name: md.hPath, content: md.content, docId: rootID };
}

export async function loadNotebookMaterial(nbId: string): Promise<string> {
    const { queryNotebookMaterialText } = await loadHubServices();
    return queryNotebookMaterialText(nbId, (sql) => sqlQuery(sql));
}

export async function createAIWizardView(
    plugin: any,
    initialSource = "",
    onCreated?: () => void,
    initialSources: { label: string; content: string; docId?: string; nbId?: string; inboxId?: string }[] = [],
    onImportComplete?: (ids: string[]) => void,
    recoveryJobId?: string,
    embedded = false,
) {
    const [view, hubSvc] = await Promise.all([
        (embedded
            ? loadAIWizardEmbedded()
            : loadAIWizard().then(Component => ({ Component }))),
        loadHubServices(),
    ]) as [{ Component: any; mount?: (comp: any, target: HTMLElement, props: Record<string, any>) => { destroy(): void } }, Awaited<ReturnType<typeof loadHubServices>>];
    const Component = view.Component;
    const recoveryJob = recoveryJobId ? await plugin.aiCardService.getReviewableAIJob(recoveryJobId) : null;
    if (recoveryJobId && !recoveryJob) {
        throw new Error((plugin.i18n as any).recoveryCenter?.aiReviewUnavailable ?? "This AI review can no longer be restored safely.");
    }
    const aiConfigured = plugin.settings?.aiMode === "siyuan"
        ? hasSiyuanAiApiKey()
        : Boolean(plugin.settings?.aiEndpoint && (plugin.settings?.aiKey || plugin.settings?.aiKeyConfigured || readCardsSecretSlot(plugin, CARDS_SECRET_SLOTS.aiKey)));
    return {
        Component,
        ...(view.mount ? { mount: view.mount } : {}),
        props: {
            i18n: plugin.i18n,
            aiConfigured,
            openSettings: () => { void plugin.openSettingsDialog(); },
            initialSource,
            initialSources,
            onImportComplete: onImportComplete ?? onCreated,
            recoveryJob,
            loadCurrentDoc: () => loadCurrentDoc(),
            loadNotebookMaterial: (nbId: string) => loadNotebookMaterial(nbId),
            loadNotebooks: () => getNotebooks(),
            openDocById: (docId: string) => { plugin.openSiYuanTarget(docId); },
            generate: (source: string, cfg: any, opts: any) => plugin.aiCardService.generate(source, cfg, opts),
            onCreate: async (cards: any, deckID: string, deckName: string, jobId: string, sourceMeta?: any) => {
                const r = await plugin.aiCardService.createAICards(cards, deckID, deckName, jobId, sourceMeta);
                if (onCreated) {
                    try { onCreated(); } catch {}
                }
                return r;
            },
            getUnfinishedJob: () => plugin.aiCardService.getUnfinishedAIJob(),
            isSourceDenied: (kind: any, id: string) => plugin.aiCardService.isSourceDenied(kind, id),
            onDenySource: (kind: any, id: string) => { plugin.aiCardService.onDenySource(kind, id); },
            sensitiveTerms: plugin.settings.aiSensitiveTerms,
            modelTrustKnown: () => plugin.settings.aiMode === "siyuan" || isSelectableModel(plugin.settings.aiModel),
            previewBudget: (source: string, cfg: any) => hubSvc.buildBudgetPreview({
                source,
                cfg,
                promptTemplate: plugin.settings.aiPromptTemplate,
                aiMode: plugin.settings.aiMode,
                aiModel: plugin.settings.aiModel,
                i18n: plugin.i18n,
            }),
            onClose: noop,
        },
    };
}

export async function openPluginAIWizard(plugin: any, initialSource = "", onCreated?: () => void): Promise<void> {
    try {
        const mobile = plugin.isMobileHost();
        const view = await createAIWizardView(plugin, initialSource, onCreated);
        let unbindVv: (() => void) | null = null;
        let closeWizardDialog = () => {};
        const baseOpenDocById = view.props.openDocById;
        view.props.openDocById = (docId: string) => {
            closeWizardDialog();
            baseOpenDocById?.(docId);
        };
        view.props.openSettings = () => {
            closeWizardDialog();
            void plugin.openSettingsDialog();
        };
        const { dialog } = svelteDialog({
            title: plugin.i18n.aiWizardTitle,
            component: view.Component,
            width: mobile ? "100vw" : "min(860px, 94vw)",
            height: mobile ? "100dvh" : undefined,
            props: view.props,
            callback: () => {
                unbindVv?.();
                unbindVv = null;
            },
        });
        closeWizardDialog = () => dialog.destroy();
        if (mobile) {
            dialog.element.classList.add("lv-mobile-sheet-dialog");
            dialog.element.querySelector(".b3-dialog")?.classList.add("lv-mobile-sheet-dialog");
            unbindVv = bindMobileVisualViewport(dialog.element);
        }
    } catch (e) {
        reportDialogOpenFailure(plugin, plugin.i18n.aiWizardTitle, e);
    }
}

export async function openPluginMarkerCards(plugin: any): Promise<void> {
    if (!plugin.settings.markerEnabled) {
        plugin.showNotice(plugin.i18n.markerDisabled, 2500, "info");
        return;
    }
    const editors: any[] = (getAllEditor() as any) ?? [];
    const active = editors.find((e: any) => e?.protyle?.element?.classList?.contains("protyle--focus")) ||
        editors[editors.length - 1];
    const rootID: string = active?.protyle?.block?.rootID ?? "";
    if (!rootID) {
        plugin.showNotice(plugin.i18n.markerNoDoc, 2500, "error");
        return;
    }
    plugin.openDeckPicker([], {
        title: plugin.i18n.markerPickDeck ?? "选择制卡卡组",
        onPicked: async (deckID: string) => {
            const safe = rootID.replace(/'/g, "''");
            const [rows, { extractMarkerCardItems }] = await Promise.all([
                sqlQuery(`SELECT id, markdown FROM blocks WHERE root_id='${safe}' AND type IN ('p','h') ORDER BY sort, id LIMIT 2000`),
                loadHubServices(),
            ]);
            const { items } = extractMarkerCardItems(rows);
            if (items.length === 0) {
                plugin.showNotice(plugin.i18n.markerNone, 2500, "info");
                return;
            }
            const MarkerCards = await loadMarkerCards();
            svelteDialog({
                title: plugin.i18n.markerTitle ?? "标记符制卡",
                component: MarkerCards,
                width: "min(680px, 92vw)",
                props: {
                    i18n: plugin.i18n,
                    items,
                    onCreate: async (picked: any[]) => {
                        const nb = await plugin.targetNotebook();
                        if (!nb) throw new Error(plugin.i18n.onboardingNoNotebook);
                        const today = localDate(Date.now());
                        const docID = await createDocWithMd(nb.id, `小驴闪卡/标记制卡/${today}`, "");
                        if (!docID) throw new Error(plugin.i18n.quickCardFail);
                        const qaIds: string[] = [];
                        await plugin.hostBridge.withDocLock(docID, async () => {
                            for (const it of picked.filter((p: any) => p.kind === "qa")) {
                                const rawQa = serializeQaCard(it.front, it.back);
                                const cardMarkdown = `${rawQa}\n\n> 来源：(( ${it.blockID} "原笔记" ))`;
                                const ids = await appendBlock("markdown", cardMarkdown, docID);
                                if (ids?.length) {
                                    qaIds.push(ids[0]);
                                    void setBlockAttrs(ids[0], { "custom-lv-source-doc": rootID }).catch(() => {});
                                }
                            }
                        });
                        const wholeIds = picked.filter((p: any) => p.kind === "whole").map((p: any) => p.blockID);
                        const allCardIds = [...qaIds, ...wholeIds];
                        if (allCardIds.length > 0) {
                            await addRiffCards(deckID, allCardIds);
                            await Promise.all(allCardIds.map((id) => plugin.rememberSourceFingerprint(id, docID)));
                            plugin.showNotice(plugin.i18n.deckAdded.replace("${n}", String(allCardIds.length)), 2000, "info");
                        }
                    },
                },
            });
        },
    });
}

export async function openPluginChallenge(plugin: any): Promise<void> {
    try {
        const ChallengeMode = await loadChallengeMode();
        svelteDialog(buildChallengeDialogArgs(plugin.i18n, ChallengeMode));
    } catch (e) {
        reportDialogOpenFailure(plugin, plugin.i18n.challengeModeTitle ?? "限时挑战", e);
    }
}

export async function openPluginPairing(plugin: any): Promise<void> {
    try {
        const PairingGame = await loadPairingGame();
        svelteDialog(buildPairingDialogArgs(plugin.i18n, PairingGame));
    } catch (e) {
        reportDialogOpenFailure(plugin, plugin.i18n.pairingTitle ?? "配对挑战", e);
    }
}

export async function openPluginRepairDrill(plugin: any): Promise<void> {
    try {
        const Drill = await loadRepairDrill();
        svelteDialog(buildRepairDrillDialogArgs(plugin.i18n, Drill));
    } catch (e) {
        reportDialogOpenFailure(plugin, plugin.i18n.repairDrillTitle ?? "修卡演练", e);
    }
}

export async function openPluginHelpDoc(plugin: any): Promise<void> {
    try {
        const nb = await plugin.targetNotebook();
        if (!nb) {
            plugin.showNotice(plugin.i18n.onboardingNoNotebook, 2500, "error");
            return;
        }
        const { helpMarkdown } = await loadHubServices();
        const lang = (window as any).siyuan?.languages?.lang ?? "zh_CN";
        const docID = await createDocWithMd(nb.id, "小驴闪卡/使用帮助", helpMarkdown(lang));
        if (!docID) {
            plugin.showNotice(plugin.i18n.quickCardFail, 2500, "error");
            return;
        }
        plugin.openSiYuanTarget(docID);
    } catch (e: any) {
        plugin.showNotice(e?.message ?? String(e), 3000, "error");
    }
}

export async function createSampleWorkspace(plugin: any): Promise<void> {
    if (sampleWsBusyHosts.has(plugin)) return;
    sampleWsBusyHosts.add(plugin);
    try {
        const nb = await plugin.targetNotebook();
        if (!nb) {
            plugin.showNotice(plugin.i18n.onboardingNoNotebook, 2500, "error");
            return;
        }
        const { createFullSampleWorkspace } = await loadHubServices();
        const res = await createFullSampleWorkspace(nb.id, plugin.i18n);
        const msg = res.alreadyExisted
            ? ((plugin.i18n as any).sampleExists ?? plugin.i18n.sampleDone.replace("${n}", "0"))
            : plugin.i18n.sampleDone.replace("${n}", res.createdCount);
        plugin.showNotice(msg, 2500, "info");
        plugin.openSiYuanTarget(res.docID);
    } catch (e: any) {
        plugin.showNotice(e?.message ?? String(e), 3000, "error");
    } finally {
        sampleWsBusyHosts.delete(plugin);
    }
}

export async function openOrCreateDynamicBoardDoc(plugin: any): Promise<string> {
    const nb = await plugin.targetNotebook();
    if (!nb) {
        plugin.showNotice(plugin.i18n.onboardingNoNotebook, 2500, "error");
        throw new Error(plugin.i18n.onboardingNoNotebook);
    }
    const { DYNAMIC_BOARD_DOC_PATH, buildDynamicBoardMarkdown } = await loadHubServices();
    const docPath = DYNAMIC_BOARD_DOC_PATH;
    const { findDocIDByHPath } = await import("@/api/siyuan");
    let docID = await findDocIDByHPath(nb.id, docPath);
    if (!docID) {
        const md = buildDynamicBoardMarkdown();
        docID = await createDocWithMd(nb.id, docPath, md);
    }
    if (!docID) {
        plugin.showNotice(plugin.i18n.quickCardFail, 2500, "error");
        throw new Error(plugin.i18n.quickCardFail);
    }
    plugin.openSiYuanTarget(docID);
    plugin.showNotice((plugin.i18n as any).dynamicBoardOpened ?? "已打开《闪卡动态看板与错题本》", 2500, "info");
    return docID;
}

export async function buildExamReportMarkdown(plugin: any, plan: ExamPlan): Promise<string> {
    const { renderExamReportMarkdown, queryNotebookBlockIDs } = await loadHubServices();
    let inScope: ((e: { deckID?: string; blockID?: string }) => boolean) | undefined;
    if (plan.scopeKind === "deck") {
        inScope = e => e.deckID === plan.scopeId;
    } else if (plan.scopeKind === "notebook" && plan.scopeId) {
        const window = plugin.revlog.entries.filter((e: any) => e.rating > 0);
        const ids = await queryNotebookBlockIDs(plan.scopeId, [...new Set(window.map((e: any) => e.blockID).filter(Boolean))] as string[], (sql) => sqlQuery(sql));
        inScope = e => ids.has(e.blockID ?? "");
    }
    return renderExamReportMarkdown({
        plan,
        entries: plugin.revlog.entries,
        inScopeFilter: inScope,
    });
}

export async function generateExamReport(plugin: any, plan: ExamPlan): Promise<void> {
    const md = await buildExamReportMarkdown(plugin, plan);
    try {
        await navigator.clipboard.writeText(md);
        plugin.showNotice(plugin.i18n.examReportCopied, 2500, "info");
    } catch {
        plugin.showNotice(plugin.i18n.diagFail ?? "复制到剪贴板失败", 3000, "error");
    }
}

export async function writeExamReportDoc(plugin: any, plan: ExamPlan): Promise<void> {
    const nb = await plugin.targetNotebook();
    if (!nb) {
        plugin.showNotice(plugin.i18n.onboardingNoNotebook, 2500, "error");
        throw new Error(plugin.i18n.onboardingNoNotebook);
    }
    const md = await buildExamReportMarkdown(plugin, plan);
    const date = todayDate();
    const docID = await createDocWithMd(nb.id, `/小驴闪卡/考试复盘/${plan.name}-${date}`, md);
    if (!docID) throw new Error(plugin.i18n.quickCardFail);
    plugin.showNotice(plugin.i18n.examReportWritten, 2000, "info");
    plugin.openSiYuanTarget(docID);
}

export async function writeReportDoc(plugin: any, md: string): Promise<void> {
    const nb = await plugin.targetNotebook();
    if (!nb) {
        throw new Error(plugin.i18n.onboardingNoNotebook);
    }
    const docID = await createDocWithMd(nb.id, `小驴闪卡/学习报告/${todayDate()}`, md);
    if (!docID) {
        throw new Error(plugin.i18n.quickCardFail);
    }
    plugin.showNotice((plugin.i18n as any).dashboard?.reportWritten ?? docID, 2500, "info");
    plugin.openSiYuanTarget(docID);
}

export async function copyDiagnostics(plugin: any): Promise<void> {
    try {
        const text = JSON.stringify(await getDiagnostics(plugin), null, 2);
        await navigator.clipboard.writeText(text);
        plugin.showNotice(plugin.i18n.diagCopied, 2000, "info");
    } catch {
        plugin.showNotice(plugin.i18n.diagFail, 3000, "error");
    }
}

export async function getDiagnostics(plugin: any): Promise<Record<string, unknown>> {
    const [{ kernelVersion }, { computeStorageStats, probeAnkiConnection }] = await Promise.all([
        import("@/api/siyuan"),
        loadHubServices(),
    ]);
    const stats = computeStorageStats({
        settingsVersion: plugin.settings.version,
        revlogCount: plugin.revlog.entries.length,
        suspendTodayCount: plugin.suspendToday.cardIDs.length,
        examPlansCount: plugin.examPlans.plans.length,
        aiBatchesCount: plugin.aiBatches.batches.length,
        aiJobsCount: plugin.aiJobs.jobs.length,
        knowledgeObjectsCount: plugin.knowledgeObjects.objects.length,
        relationsCount: plugin.cardRelations.relations.length,
        errorTagsCount: plugin.errorTags.tags.length,
        inboxCount: plugin.inbox.items.length,
        learningGoalsCount: plugin.learningGoals.goals.length,
        entryContextsCount: plugin.entryContexts.contexts.length,
        contentLifecyclesCount: plugin.contentLifecycles.lifecycles.length,
        killSwitchDisabledCount: plugin.killSwitch.disabledTargets.length,
        killSwitchQuarantinedCount: plugin.killSwitch.quarantinedJobs.length,
        storageLastWrite: plugin.storageLastWrite,
    });
    const ankiOnline = await probeAnkiConnection(plugin.settings.ankiClientUrl, plugin.settings.ankiClientKey, plugin.i18n);
    return {
        version: plugin.version || "0.233.9",
        kernel: await kernelVersion().catch(() => "unknown"),
        ankiOnline,
        storage: stats,
        recentLogs: lvLogDump(),
    };
}
