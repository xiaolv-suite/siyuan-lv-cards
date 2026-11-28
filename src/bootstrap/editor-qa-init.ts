/**
 * 编辑器问答装饰与块操作中枢集成（Editor QA & Block Action Integration）
 * 统管实时编辑器块装饰、免侵入属性问答设置、挖空制卡、块操作中心与遮挡卡挂载。
 */

import { startEditorQaService, refreshFloatingPill, suppressCapsuleAfterBlockDelete } from "@/core/editor-qa-service";
import { loadQuestionAttrDialog, loadOcclusionEditor, loadBlockActionRuntime } from "@/bootstrap/chunk-loaders";
import { lvBlockAssistant } from "@/libs/notice";
import { BLOCK_ACTIONS, isBlockElementReadOnly, WRITE_BLOCK_ACTION_IDS } from "@/core/block-actions";
import { findActiveProtyleBlockElement, findFloatingPillAnchor } from "@/core/block-dom-utils";
import { lvLog } from "@/libs/log";
import { sqlQuery, setBlockAttrs } from "@/api/siyuan";
import { getRiffDecks, createRiffDeck } from "@/api/riff";
import {
    extractCardQuestionAttr,
    extractCardAnswerAttr,
    extractAttrQaSubtype,
    extractAttrQaHint,
    extractAttrQaBidi,
    buildAttrQaSubtypeAttrs,
    buildAttrQaClearAttrs,
    type AttrQaSubtype,
} from "@/core/block-attributes";
import { addRiffCards, formatRiffCardEntryError } from "@/api/due-shared";
import { removeCardsFromDeckFlow } from "@/core/card-operations";
import { svelteDialog } from "@/libs/dialog";
import { buildOcclusionEditorDialogArgs } from "@/bootstrap/dialog-openers";
import { CARDS_SECRET_SLOTS, readCardsSecretSlot } from "@/core/secrets";
import type { RiffDeck } from "@/api/riff";

function isDocumentRootElement(el: Element | null): boolean {
    if (!el) return true;
    return el.classList.contains("protyle-wysiwyg")
        || el.classList.contains("protyle-title")
        || el.getAttribute("data-type") === "NodeDocument";
}

function findContentBlockFromNode(node: Node | null): HTMLElement | null {
    const el = node instanceof HTMLElement ? node : node?.parentElement;
    if (!el) return null;
    const candidate = el.closest?.(".protyle-wysiwyg [data-node-id]") as HTMLElement | null;
    if (!candidate || isDocumentRootElement(candidate)) return null;
    return candidate;
}

function resolveActiveEditorContentBlockId(options: { fallbackToFirstBlock?: boolean } = {}): string {
    if (typeof document === "undefined") return "";
    // 1. 优先从实时文本选区 / 光标（document.getSelection）解析正文块，彻底规避 activeElement 恒命中根文档 .protyle-wysiwyg[data-node-id]
    const sel = document.getSelection();
    if (sel && sel.rangeCount > 0) {
        const fromAnchor = findContentBlockFromNode(sel.anchorNode);
        if (fromAnchor) return fromAnchor.getAttribute("data-node-id") || "";
        const range = sel.getRangeAt(0);
        const fromRange = findContentBlockFromNode(range.commonAncestorContainer);
        if (fromRange) return fromRange.getAttribute("data-node-id") || "";
    }

    // 2. 次优从 activeElement 向上寻找正文块（排除文档根节点与文档标题）
    const activeEl = document.activeElement;
    if (activeEl instanceof HTMLElement) {
        const fromActive = findContentBlockFromNode(activeEl);
        if (fromActive) return fromActive.getAttribute("data-node-id") || "";
    }

    // 3. 多选块选中态（优先激活分屏）
    const activeSelectedEls = document.querySelectorAll(".layout__wnd--active .protyle:not(.fn__none) .protyle-wysiwyg--select[data-node-id]");
    const selectedEls = activeSelectedEls.length > 0
        ? activeSelectedEls
        : document.querySelectorAll(".protyle-wysiwyg--select[data-node-id]");
    for (let i = 0; i < selectedEls.length; i++) {
        const el = selectedEls[i];
        if (!isDocumentRootElement(el)) {
            const id = el.getAttribute("data-node-id") || "";
            if (id) return id;
        }
    }

    // 4. 若光标在文档标题或根编辑器游离态，回退当前活动编辑器内的首个正文块
    const inTitleOrRoot = (activeEl instanceof HTMLElement && (
        Boolean(activeEl.closest(".protyle-title"))
        || activeEl.classList.contains("protyle-title__input")
        || activeEl.classList.contains("protyle-wysiwyg")
    ));
    if (options.fallbackToFirstBlock || inTitleOrRoot) {
        const activeProtyle = (activeEl instanceof HTMLElement ? activeEl.closest(".protyle") : null)
            || document.querySelector(".layout__wnd--active .protyle:not(.fn__none)")
            || document.querySelector(".protyle:not(.fn__none)");
        const focusBlock = activeProtyle?.querySelector(".protyle-wysiwyg [data-node-id]:focus-within:not(.protyle-title)");
        if (focusBlock && !isDocumentRootElement(focusBlock)) {
            return focusBlock.getAttribute("data-node-id") || "";
        }
        const blocks = activeProtyle?.querySelectorAll(".protyle-wysiwyg > [data-node-id]") ?? [];
        for (let i = 0; i < blocks.length; i++) {
            const blk = blocks[i];
            if (!isDocumentRootElement(blk)) {
                const id = blk.getAttribute("data-node-id") || "";
                if (id) return id;
            }
        }
    }
    return "";
}

function wrapBlockAssistantToggleHook(): () => void {
    if (typeof window === "undefined") return () => {};
    try {
        // 确保 window.LvBlockAssistant 已初始化
        lvBlockAssistant.isEnabled();
        const winBa = (window as any).LvBlockAssistant;
        if (winBa && typeof winBa.setEnabled === "function" && !winBa.__lvCardsQaToggleHooked) {
            const origSetEnabled = winBa.setEnabled;
            const boundOrig = origSetEnabled.bind(winBa);
            const wrapped = (next: boolean) => {
                boundOrig(next);
                try {
                    window.dispatchEvent(new CustomEvent("lv-block-assistant-enabled-changed", {
                        detail: { enabled: Boolean(next) },
                    }));
                } catch { /* ignore */ }
            };
            winBa.setEnabled = wrapped;
            winBa.__lvCardsQaToggleHooked = true;
            return () => {
                try {
                    if (winBa.setEnabled === wrapped) {
                        winBa.setEnabled = origSetEnabled;
                    }
                    delete winBa.__lvCardsQaToggleHooked;
                } catch { /* ignore */ }
            };
        }
    } catch { /* ignore */ }
    return () => {};
}

let loadedBlockActionCloser: (() => void) | null = null;

function closeLoadedBlockActionMenu(): void {
    loadedBlockActionCloser?.();
}

async function getBlockActionRuntime() {
    const runtime = await loadBlockActionRuntime();
    loadedBlockActionCloser = runtime.closeBlockActionMenu;
    return runtime;
}

function isBlockActionPluginAlive(plugin: any): boolean {
    return Boolean(plugin)
        && !plugin.isUnloaded
        && !plugin.isUnloading
        && !plugin.disposerRegistry?.isDisposed;
}

function isBlockActionAnchorConnected(anchor: HTMLElement | null | undefined, allowMissingAnchor = false): boolean {
    if (allowMissingAnchor) return true;
    if (!anchor) return false;
    if (typeof (anchor as any).isConnected === "boolean") {
        return (anchor as any).isConnected;
    }
    return true;
}

function canProceedBlockAction(
    plugin: any,
    anchor?: HTMLElement | null,
    options: { allowMissingAnchor?: boolean } = {},
): boolean {
    if (!lvBlockAssistant.isEnabled() || !isBlockActionPluginAlive(plugin)) {
        closeLoadedBlockActionMenu();
        return false;
    }
    return isBlockActionAnchorConnected(anchor, options.allowMissingAnchor);
}

export function setupEditorQaIntegration(plugin: any) {
    const unwrapToggleHook = wrapBlockAssistantToggleHook();
    const centerContainer = typeof document !== "undefined"
        ? (document.querySelector(".layout__center") || document.querySelector(".protyle-content") || document.querySelector("#layouts"))
        : null;

    const qaService = startEditorQaService({
        targetContainer: centerContainer as HTMLElement | undefined,
        eventBus: plugin?.eventBus,
        isEnabled: () => lvBlockAssistant.isEnabled(),
        onDisableCleanup: () => {
            closeLoadedBlockActionMenu();
        },
        onEditQuestion: (blockID: string) => {
            setTimeout(() => { void openPluginCardQuestionDialog(plugin, blockID); }, 50);
        },
        onOpenBlockActions: (blockID: string, anchor: HTMLElement) => {
            void openPluginBlockActionCenter(plugin, blockID, anchor);
        },
        onPrefetch: () => {
            void loadQuestionAttrDialog().catch(() => {});
        },
        getPinnedActions: () => {
            const prefPinned = plugin.settings.blockActionPreferences?.pinnedActionIds;
            const pinnedIds = (Array.isArray(prefPinned) && prefPinned.length > 0)
                ? prefPinned
                : lvBlockAssistant.getPinnedActions().map(a => a.id);

            const all = lvBlockAssistant.getActions();
            const map = new Map(all.map(a => [a.id, a]));
            const result: Array<{ id: string; glyph: string; label: string; badgeText?: string }> = [];
            const seen = new Set<string>();
            for (const id of pinnedIds) {
                const a = map.get(id)
                    || (id === "toggle-fold-block" ? map.get("toggle-block-fold") : undefined)
                    || (id === "toggle-block-fold" ? map.get("toggle-fold-block") : undefined)
                    || (id === "native-clone-block" ? map.get("duplicate-block") : undefined)
                    || (id === "duplicate-block" ? map.get("native-clone-block") : undefined);
                if (a && !seen.has(a.id)) {
                    seen.add(a.id);
                    result.push({ id: a.id, glyph: a.glyph, label: a.label, badgeText: a.badgeText });
                }
            }
            return result;
        },
        onRunAction: async (actionId: string, blockID: string, anchor?: HTMLElement) => {
            if (!canProceedBlockAction(plugin, anchor, { allowMissingAnchor: !anchor })) {
                return;
            }
            let batchIDs: string[] | undefined;
            if (typeof document !== "undefined") {
                const activeSelected = document.querySelectorAll(".layout__wnd--active .protyle-wysiwyg--select[data-node-id], .protyle-wysiwyg--select[data-node-id]");
                const selectedIDs = Array.from(new Set(Array.from(activeSelected).map(e => e.getAttribute("data-node-id") || "").filter(Boolean)));
                if (selectedIDs.length > 1 && selectedIDs.includes(blockID)) {
                    batchIDs = selectedIDs;
                }
            }

            const localAction = BLOCK_ACTIONS.find(a => a.id === actionId);
            if (localAction) {
                if (batchIDs && localAction.singleOnly) {
                    plugin.showNotice("该快捷动作仅限单块操作，已为您展开批量操作中心", 2400, "info");
                    const targetEl = findActiveProtyleBlockElement(blockID, anchor);
                    const fallbackAnchor = anchor || findFloatingPillAnchor(blockID) || targetEl || document.body;
                    void openPluginBlockActionCenter(plugin, blockID, fallbackAnchor);
                    return;
                }
                await runPluginBlockAction(plugin, localAction, blockID, batchIDs, undefined, anchor);
                return;
            }
            const allActions = lvBlockAssistant.getActions();
            const matched = allActions.find(a => a.id === actionId);
            if (matched) {
                try {
                    const { buildBlockSnapshot } = await getBlockActionRuntime();
                    if (!canProceedBlockAction(plugin, anchor, { allowMissingAnchor: !anchor })) {
                        return;
                    }
                    const snap = await buildBlockSnapshot(blockID, batchIDs, anchor);
                    if (!canProceedBlockAction(plugin, anchor, { allowMissingAnchor: !anchor })) {
                        return;
                    }
                    if (snap.isReadOnly && (
                        WRITE_BLOCK_ACTION_IDS.has(actionId)
                        || (matched as any).mutatesBlock === true
                        || (matched as any).readonlySafe === false
                        || (matched as any).readOnlySafe === false
                    )) {
                        plugin.showNotice("当前文档处于只读锁定状态，已拦截写入操作", 2400, "info");
                        return;
                    }
                    if (actionId === "delete-block" || actionId === "cut-block" || actionId === "native-delete") {
                        closeLoadedBlockActionMenu();
                        suppressCapsuleAfterBlockDelete(900);
                    }
                    await matched.execute(blockID, { ...snap, blockId: (snap as any).blockId || (snap as any).blockID || blockID }, batchIDs);
                } catch (err: any) {
                    lvLog("error", `[block-action] run external action failed: ${err?.message || String(err)}`);
                    if (isBlockActionPluginAlive(plugin)) {
                        plugin.showNotice("执行块操作失败，请稍后重试", 2600, "info");
                    }
                }
            }
        },
    });

    return {
        scan: qaService.scan,
        dispose: () => {
            unwrapToggleHook();
            qaService.dispose();
        },
    };
}

export async function openPluginBlockActionCenter(plugin: any, blockID: string, anchor: HTMLElement): Promise<void> {
    if (!canProceedBlockAction(plugin, anchor)) {
        return;
    }
    let runtime: Awaited<ReturnType<typeof getBlockActionRuntime>> | null = null;
    try {
        runtime = await getBlockActionRuntime();
        if (!canProceedBlockAction(plugin, anchor)) {
            return;
        }
        const { openBlockActionMenu, buildBlockSnapshot, probeEcosystemPresence } = runtime;
        const snapshot = await buildBlockSnapshot(blockID, undefined, anchor);
        if (!canProceedBlockAction(plugin, anchor)) {
            return;
        }
        const presence = probeEcosystemPresence();
        let storeConfig: any = { version: 1, enabledActionIds: [], pinnedActionIds: [] };
        try {
            if (typeof lvBlockAssistant?.getStoreConfig === "function") {
                storeConfig = lvBlockAssistant.getStoreConfig();
            }
        } catch {}

        const localActionIds = new Set(BLOCK_ACTIONS.map(a => a.id));
        let externalActions: any[] = [];
        let hasNewDupInRaw = false;
        try {
            const rawActions = (typeof lvBlockAssistant?.getActions === "function" ? lvBlockAssistant.getActions() : []) || [];
            const installedRaw = rawActions.filter((a: any) => a && a.id && (a as any).installed !== false);
            const rawIds = new Set(installedRaw.map((a: any) => a.id));
            hasNewDupInRaw = rawIds.has("duplicate-block");
            const hasNewFold = rawIds.has("toggle-block-fold") || localActionIds.has("toggle-block-fold");
            const hasNewDup = hasNewDupInRaw || localActionIds.has("duplicate-block");
            externalActions = installedRaw
                .filter((a: any) => {
                    if (localActionIds.has(a.id)) return false;
                    if (hasNewFold && a.id === "toggle-fold-block") return false;
                    if (hasNewDup && a.id === "native-clone-block") return false;
                    if (localActionIds.has("native-clone-block") && a.id === "duplicate-block") return false;
                    return true;
                })
                .map(a => ({
                    id: a.id,
                    group: (a.group === "study" || a.group === "flashcard" ? "flashcard"
                           : a.group === "reading" || a.group === "knowledge" ? "knowledge"
                           : a.group === "organization" || a.group === "native" ? "native"
                           : a.group === "clipboard" ? "clipboard"
                           : a.group === "time" ? "time"
                           : "community") as any,
                    labelKey: a.id,
                    fallbackLabel: a.label || a.id,
                    subtitle: a.subtitle,
                    glyph: a.glyph || "⚡",
                    destructive: Boolean((a as any).destructive || (a as any).danger || a.id === "delete-block" || a.id === "cut-block"),
                    mutatesBlock: (a as any).mutatesBlock,
                    readonlySafe: (a as any).readonlySafe ?? (a as any).readOnlySafe,
                    supportsBatch: Boolean(a.supportsBatch),
                    singleOnly: Boolean(a.singleOnly),
                    sourcePlugin: a.sourcePlugin as any,
                    preferredBlockKinds: a.preferredBlockKinds as any,
                    excludedBlockKinds: a.excludedBlockKinds as any,
                    isAvailable: (s: any) => (typeof a.isAvailable === "function" ? Boolean(a.isAvailable({ ...s, blockId: s?.blockId || s?.blockID })) : true),
                    handler: (id: string, s: any, b?: string[]) => a.execute?.(id, { ...s, blockId: s?.blockId || s?.blockID }, b),
                }));
        } catch (extErr: any) {
            lvLog("warn", `[block-action] failed to resolve external actions: ${extErr?.message || String(extErr)}`);
        }

        const hasExtNewFold = externalActions.some(a => a.id === "toggle-block-fold");
        const allAvailableIds = [...BLOCK_ACTIONS, ...externalActions].map(a => a.id);
        let effectiveDisabled: string[] = [];
        if (Array.isArray(storeConfig?.enabledActionIds) && storeConfig.enabledActionIds.length > 0) {
            const enabledSet = new Set<string>(storeConfig.enabledActionIds);
            if (enabledSet.has("toggle-fold-block")) enabledSet.add("toggle-block-fold");
            if (enabledSet.has("toggle-block-fold")) enabledSet.add("toggle-fold-block");
            if (enabledSet.has("native-clone-block")) enabledSet.add("duplicate-block");
            if (enabledSet.has("duplicate-block")) enabledSet.add("native-clone-block");
            effectiveDisabled = allAvailableIds.filter(id => !enabledSet.has(id));
        } else {
            effectiveDisabled = [...(plugin.settings?.blockActionPreferences?.disabledActionIds ?? [])];
            if (effectiveDisabled.includes("toggle-fold-block") && !effectiveDisabled.includes("toggle-block-fold")) {
                effectiveDisabled.push("toggle-block-fold");
            }
            if (effectiveDisabled.includes("toggle-block-fold") && !effectiveDisabled.includes("toggle-fold-block")) {
                effectiveDisabled.push("toggle-fold-block");
            }
        }
        if (hasExtNewFold && !effectiveDisabled.includes("toggle-fold-block")) {
            effectiveDisabled.push("toggle-fold-block");
        }

        const rawPinned = (Array.isArray(storeConfig?.pinnedActionIds) && storeConfig.pinnedActionIds.length > 0)
            ? storeConfig.pinnedActionIds
            : (plugin.settings?.blockActionPreferences?.pinnedActionIds ?? []);
        const combinedPinned = Array.from(new Set<string>(rawPinned.map((id: string) => {
            if (hasExtNewFold && id === "toggle-fold-block") return "toggle-block-fold";
            if (!hasExtNewFold && id === "toggle-block-fold") return "toggle-fold-block";
            if (hasNewDupInRaw && id === "native-clone-block") return "duplicate-block";
            return id;
        })));

        if (!canProceedBlockAction(plugin, anchor)) {
            return;
        }
        openBlockActionMenu({
            snapshot,
            presence,
            preferences: { disabledActionIds: effectiveDisabled, pinnedActionIds: combinedPinned },
            externalActions,
            i18n: plugin.i18n,
            anchor,
            onAction: (action) => runPluginBlockAction(plugin, action, blockID, snapshot.batchBlockIDs, snapshot, anchor),
        });
    } catch (err: any) {
        lvLog("error", `[block-action] open center failed: ${err?.message || String(err)}`);
        if (!canProceedBlockAction(plugin, anchor)) {
            return;
        }
        if (!runtime) {
            plugin.showNotice("打开块操作中心失败，请稍后重试", 2600, "info");
            return;
        }
        try {
            const fallbackSnapshot = await runtime.buildBlockSnapshot(blockID);
            if (!canProceedBlockAction(plugin, anchor)) {
                return;
            }
            runtime.openBlockActionMenu({
                snapshot: fallbackSnapshot,
                presence: {},
                i18n: plugin.i18n,
                anchor,
                onAction: (action) => runPluginBlockAction(plugin, action, blockID, fallbackSnapshot.batchBlockIDs, fallbackSnapshot, anchor),
            });
        } catch (fatalErr: any) {
            lvLog("error", `[block-action] fallback failed: ${fatalErr?.message || String(fatalErr)}`);
            if (isBlockActionPluginAlive(plugin)) {
                plugin.showNotice("打开块操作中心失败，请稍后重试", 2600, "info");
            }
        }
    }
}

export async function runPluginBlockAction(
    plugin: any,
    action: any,
    blockID: string,
    batchBlockIDs?: string[],
    snapshot?: any,
    anchor?: HTMLElement,
): Promise<void> {
    const isDeleteOrCut = action?.id === "delete-block" || action?.id === "cut-block" || action?.id === "native-delete";
    if (!canProceedBlockAction(plugin, anchor, { allowMissingAnchor: !anchor })) {
        return;
    }
    if (isDeleteOrCut) {
        closeLoadedBlockActionMenu();
        suppressCapsuleAfterBlockDelete(900);
    }
    try {
        const { executeBlockAction } = await getBlockActionRuntime();
        if (!canProceedBlockAction(plugin, anchor, { allowMissingAnchor: !anchor || isDeleteOrCut })) {
            return;
        }
        await executeBlockAction(
            action,
            blockID,
            {
                i18n: plugin.i18n,
                openCardQuestionDialog: (id: string) => void openPluginCardQuestionDialog(plugin, id),
                openDeckPicker: (ids: string[], opts?: any) => plugin.openDeckPicker(ids, opts),
                makeClozeCard: (id: string) => makePluginClozeCard(plugin, id),
                openOcclusionFlow: (id: string) => plugin.openDeckPicker([id], {
                    skipAdd: true,
                    onPicked: (deckID: string) => void openPluginOcclusionEditor(plugin, id, deckID),
                }),
                addInboxItems: (ids: string[]) => plugin.addInboxItems(ids),
                removeCardsFromDeck: (ids: string[]) => void removePluginCardsFromDeck(plugin, ids),
                addDocToReview: (id: string) => void plugin.addDocToReview(id),
                removeDocFromReview: (id: string) => void plugin.removeDocFromReview(id),
                openDoc: (id: string, zoomIn?: boolean) => plugin.openSiYuanTarget(id, Boolean(zoomIn)),
            },
            batchBlockIDs,
            snapshot,
            { anchor },
        );
    } catch (err: any) {
        lvLog("error", `[block-action] run action failed: ${err?.message || String(err)}`);
        if (isBlockActionPluginAlive(plugin)) {
            plugin.showNotice("执行块操作失败，请稍后重试", 2600, "info");
        }
    }
}

export async function openPluginCardQuestionDialog(plugin: any, blockID?: string): Promise<void> {
    closeLoadedBlockActionMenu();
    let targetId = (blockID ?? "").trim();
    if (targetId && typeof document !== "undefined") {
        const explicitEl = document.querySelector(`[data-node-id="${targetId}"]`);
        if (explicitEl && isDocumentRootElement(explicitEl)) {
            targetId = "";
        }
    }
    if (!targetId) {
        targetId = resolveActiveEditorContentBlockId({ fallbackToFirstBlock: false });
    }
    if (!targetId) {
        plugin.showNotice(plugin.i18n.cardQuestionNoActiveBlock ?? "请将光标置于要提问的笔记段落中", 2500, "info");
        return;
    }

    const activeBlockForGuard = typeof document !== "undefined" ? findActiveProtyleBlockElement(targetId) : null;
    if (isBlockElementReadOnly(activeBlockForGuard)) {
        plugin.showNotice("当前文档处于只读锁定状态，已拦截写入操作", 2400, "info");
        return;
    }

    lvLog("info", `[attr-qa] opening question dialog for block: ${targetId}`);

    try {
        plugin.showNotice(plugin.i18n.cardQuestionOpening ?? "正在打开免侵入属性问答设置…", 800, "info");
        let previewText = "";
        const domAttrs: Record<string, string> = {};
        try {
            const activeBlockEl = findActiveProtyleBlockElement(targetId)
                || document.querySelector(`[data-node-id="${targetId}"]`);
            if (activeBlockEl) {
                const editable = activeBlockEl.querySelector('[contenteditable="true"]');
                previewText = (editable?.textContent ?? activeBlockEl.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
                const attrs = activeBlockEl.attributes;
                if (attrs) {
                    for (let i = 0; i < attrs.length; i++) {
                        const a = attrs[i];
                        if (a && a.name.startsWith("custom-")) {
                            domAttrs[a.name] = a.value;
                        }
                    }
                }
            }
        } catch {}

        if (!previewText || previewText === "(空内容块)") {
            try {
                const safeId = targetId.replace(/'/g, "''");
                const rows = await Promise.race([
                    sqlQuery(`SELECT content, markdown FROM blocks WHERE id = '${safeId}' LIMIT 1`),
                    new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 250)),
                ]);
                if (rows && rows[0]) {
                    previewText = (rows[0].content || rows[0].markdown || "").replace(/\s+/g, " ").trim().slice(0, 300);
                }
            } catch {}
        }

        if (!previewText) previewText = "(空内容块)";

        const currentQ = extractCardQuestionAttr(domAttrs);
        const currentA = extractCardAnswerAttr(domAttrs);
        const currentSubtype = extractAttrQaSubtype(domAttrs);
        const currentHint = extractAttrQaHint(domAttrs);
        const currentBidi = currentSubtype === "dual" ? extractAttrQaBidi(domAttrs) : true;
        const currentDecks = String(domAttrs["custom-riff-decks"] || "").trim();
        const isAlreadyCard = Boolean(currentDecks);

        const QuestionAttrComp = await loadQuestionAttrDialog();
        if (!QuestionAttrComp) throw new Error("加载问答弹窗组件失败");

        const initialDecks: RiffDeck[] = [];
        let dialogHandle: { close: () => void } | null = null;
        dialogHandle = svelteDialog({
            title: plugin.i18n.cardQuestionTitle ?? "设置属性问答卡 (问题 · 自定义答案)",
            component: QuestionAttrComp,
            width: "min(860px, 94vw)",
            props: {
                blockID: targetId,
                initialQuestion: currentQ,
                initialAnswer: currentA,
                initialSubtype: currentSubtype,
                initialHint: currentHint,
                initialBidi: currentBidi,
                isAlreadyCard,
                previewText,
                decks: initialDecks,
                t: plugin.i18n,
                aiSettings: {
                    aiMode: plugin.settings.aiMode,
                    aiEndpoint: plugin.settings.aiEndpoint,
                    aiKey: plugin.settings.aiKey || readCardsSecretSlot(plugin, CARDS_SECRET_SLOTS.aiKey),
                    aiModel: plugin.settings.aiModel,
                    aiSensitiveTerms: plugin.settings.aiSensitiveTerms,
                    killSwitch: plugin.killSwitch,
                    aiTargets: typeof plugin.aiProviderTargets === "function" ? plugin.aiProviderTargets() : [],
                    costLedger: plugin.costLedger,
                    aiCostBudgetEnabled: plugin.settings.aiCostBudgetEnabled,
                    aiCostMonthlyCap: plugin.settings.aiCostMonthlyCap,
                },
                onSave: async (payload: { question: string; answer?: string; targetDeckID?: string; subtype?: AttrQaSubtype; hint?: string; bidi?: boolean }) => {
                    const subtype: AttrQaSubtype = payload.subtype ?? (payload.question.trim() ? "recite" : "direct");
                    const newQ = payload.question.trim();
                    const newA = (payload.answer ?? "").trim();
                    const newHint = (payload.hint ?? "").trim();
                    if (subtype === "direct" && !newA) {
                        plugin.showNotice("直接问答型必须填写背面答案", 2000, "info");
                        return false;
                    }
                    if (subtype !== "direct" && !newQ) {
                        plugin.showNotice("提问内容不能为空", 2000, "info");
                        return false;
                    }
                    const patch = buildAttrQaSubtypeAttrs({
                        subtype,
                        question: newQ,
                        answer: newA,
                        hint: newHint,
                        bidi: payload.bidi,
                    });

                    try {
                        await setBlockAttrs(targetId, patch as any);
                    } catch {
                        await new Promise(r => setTimeout(r, 80));
                        await setBlockAttrs(targetId, patch as any);
                    }

                    let targetDeckID = payload.targetDeckID || "";
                    if (targetDeckID) {
                        const explicitPick = Boolean(payload.targetDeckID);
                        try {
                            await addRiffCards(targetDeckID, [targetId]);
                        } catch (deckErr: any) {
                            lvLog("warn", `[attr-qa] addRiffCards fallback: ${deckErr?.message || String(deckErr)}`);
                            if (explicitPick) {
                                plugin.showNotice(formatRiffCardEntryError(deckErr, plugin.i18n, deckErr?.message || "入组失败"), 3500, "error");
                                return false;
                            }
                        }
                    } else if (!isAlreadyCard) {
                        try {
                            const allDecks = await getRiffDecks().then(d => Array.isArray(d) ? d : []);
                            const defaultDeck = allDecks.find((d: any) => d.name === "小驴闪卡") || allDecks[0];
                            if (defaultDeck) {
                                targetDeckID = defaultDeck.id;
                            } else {
                                const newDeck = await createRiffDeck("小驴闪卡");
                                if (newDeck) targetDeckID = newDeck.id;
                            }
                            if (!targetDeckID) {
                                plugin.showNotice(plugin.i18n.deckJoinFail ?? "默认卡组不可用，入组失败", 3500, "error");
                                return false;
                            }
                            await addRiffCards(targetDeckID, [targetId]);
                        } catch (deckErr: any) {
                            lvLog("warn", `[attr-qa] addRiffCards fallback: ${deckErr?.message || String(deckErr)}`);
                            plugin.showNotice(formatRiffCardEntryError(deckErr, plugin.i18n, deckErr?.message || "入组失败"), 3500, "error");
                            return false;
                        }
                    }

                    refreshFloatingPill(targetId);
                    try {
                        document.dispatchEvent(new CustomEvent("flashcard-title-saved", { detail: { blockId: targetId, question: newQ, answer: newA, subtype } }));
                    } catch {}
                    plugin.showNotice(newA
                        ? (plugin.i18n.cardQaSavedBoth ?? "闪卡问题与自定义答案已保存至块属性")
                        : (plugin.i18n.cardQuestionSaved ?? "闪卡问题已保存至块属性"), 2000, "info");
                },
                onClear: async () => {
                    await setBlockAttrs(targetId, buildAttrQaClearAttrs());
                    try {
                        await removePluginCardsFromDeck(plugin, [targetId]);
                    } catch {}
                    refreshFloatingPill(targetId);
                    try {
                        document.dispatchEvent(new CustomEvent("flashcard-title-saved", { detail: { blockId: targetId, question: "", answer: "" } }));
                    } catch {}
                    plugin.showNotice(plugin.i18n.cardQuestionCleared ?? "已清空闪卡问题并移出卡组", 2000, "info");
                },
                onClose: () => dialogHandle?.close(),
            },
        });
        void getRiffDecks().then((decks) => {
            if (Array.isArray(decks) && decks.length > 0) {
                document.dispatchEvent(new CustomEvent("lv-cards:decks-updated", { detail: { blockID: targetId, decks } }));
            }
        }).catch(() => {});
    } catch (err: any) {
        plugin.showNotice(err?.message || "打开设置失败", 3000, "error");
    }
}

export function openPluginActiveBlockQuestionDialog(plugin: any): void {
    const blockID = resolveActiveEditorContentBlockId({ fallbackToFirstBlock: false });

    if (blockID) {
        setTimeout(() => { void openPluginCardQuestionDialog(plugin, blockID); }, 60);
    } else {
        plugin.showNotice(plugin.i18n.cardQuestionNoActiveBlock ?? "请将光标置于要提问的笔记段落中，正在为您打开快速制卡", 2500, "info");
        void plugin.openQuickCard();
    }
}

export function openPluginActiveBlockActionCenter(plugin: any): void {
    if (!lvBlockAssistant.isEnabled()) {
        closeLoadedBlockActionMenu();
        return;
    }
    const blockID = resolveActiveEditorContentBlockId({ fallbackToFirstBlock: true });

    if (!blockID) {
        plugin.showNotice(plugin.i18n.cardQuestionNoActiveBlock ?? "请将光标置于要操作的笔记块中", 2500, "info");
        return;
    }

    const targetEl = findActiveProtyleBlockElement(blockID);
    const safeTarget = (targetEl && !isDocumentRootElement(targetEl)) ? targetEl : null;
    const anchor = findFloatingPillAnchor(blockID)
        || safeTarget
        || document.body;
    void openPluginBlockActionCenter(plugin, blockID, anchor);
}

export function makePluginClozeCard(plugin: any, blockID: string, range?: Range | null, text?: string): void {
    const targetEl = typeof document !== "undefined" ? findActiveProtyleBlockElement(blockID) : null;
    if (isBlockElementReadOnly(targetEl)) {
        plugin.showNotice("当前文档处于只读锁定状态，已拦截写入操作", 2400, "info");
        return;
    }
    let useRange = range ?? null;
    let useText = (text ?? "").trim();
    if (!useRange || !useText) {
        const sel = document.getSelection();
        if (sel && sel.rangeCount > 0) {
            const live = sel.getRangeAt(0);
            const liveText = live.toString().trim();
            if (liveText) {
                useRange = live.cloneRange();
                useText = liveText;
            }
        }
    }
    if (!useRange || !useText) {
        plugin.showNotice("未划选挖空文本，正在为您打开免侵入属性问答制卡", 2500, "info");
        setTimeout(() => { void openPluginCardQuestionDialog(plugin, blockID); }, 80);
        return;
    }
    const sel = document.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(useRange);
    let ok = false;
    try {
        ok = document.execCommand("insertText", false, `==${useText}==`);
    } catch {
        ok = false;
    }
    if (!ok) {
        plugin.showNotice(plugin.i18n.clozeFail, 2500, "error");
        return;
    }
    plugin.openDeckPicker([blockID]);
}

export async function openPluginOcclusionEditor(plugin: any, blockID: string, deckID: string): Promise<void> {
    const targetEl = typeof document !== "undefined" ? findActiveProtyleBlockElement(blockID) : null;
    if (isBlockElementReadOnly(targetEl)) {
        plugin.showNotice("当前文档处于只读锁定状态，已拦截写入操作", 2400, "info");
        return;
    }
    const OcclusionEditor = await loadOcclusionEditor();
    svelteDialog(buildOcclusionEditorDialogArgs(plugin.i18n, OcclusionEditor, blockID, async () => {
        await addRiffCards(deckID, [blockID]);
        await plugin.rememberSourceFingerprint(blockID);
        plugin.showNotice((plugin.i18n as any).occlusion?.occlusionSaved ?? "遮挡卡保存成功", 2000, "info");
    }));
}

export async function removePluginCardsFromDeck(
    plugin: any,
    blockIDs: string[],
    deckID?: string,
): Promise<{ success: boolean; removedCount: number; error?: string }> {
    try {
        const result = await removeCardsFromDeckFlow(
            blockIDs,
            plugin.cardRelations,
            (mutator) => plugin.cardRelationsMutations(mutator),
            deckID ? { deckID } : undefined,
        );
        if (!result.hadCards) {
            const msg = plugin.i18n.deckNotCard ?? "该块还不是闪卡";
            plugin.showNotice(msg, 2000, "info");
            return { success: false, removedCount: 0, error: msg };
        }
        plugin.showNotice(plugin.i18n.deckRemoved.replace("${n}", String(result.removedCount)), 2000, "info");
        return { success: true, removedCount: result.removedCount };
    } catch (e: any) {
        const msg = formatRiffCardEntryError(e, plugin.i18n, e?.message ?? String(e));
        plugin.showNotice(msg, 3000, "error");
        return { success: false, removedCount: 0, error: msg };
    }
}
