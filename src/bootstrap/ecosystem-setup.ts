/**
 * 小驴全生态互联与协议集成器（Ecosystem Setup）
 * 统管小驴罗盘、穿透搜索、全生态灾备、跨插件自动化（错题联动/拾遗联动/雷切联邦）与对外窗口桥。
 */

import {
    lvNotify,
    lvTicker,
    notifyBatchCardCreation,
    lvBackup,
    lvLaunchpad,
    lvOmnisearch,
    lvAutomation,
    lvBlockAssistant,
    lvSnapshotVault,
    type LvSearchResultItem,
} from "@/libs/notice";
import { lvLog } from "@/libs/log";
import { localDate, calcStreak } from "@/core/revlog";
import { rollDateIfNeeded } from "@/core/suspend-today";
import { cachedDueCount, dueCache, invalidateDueCache, addRiffCards } from "@/api/due-shared";
import { mountCardsBridge } from "@/api/external-bridge";
import { registerRaikiriModuleSafely } from "@/libs/ecosystem-bridge-kit";
import { createExternalCardIntake, INTAKE_JOURNAL, type IntakeInput } from "@/core/external-card-intake";
import { type ExtractEnvelope } from "@/core/incremental-learning";
import { validateCardEntry } from "@/core/card-entry-gate";
import { executeQuickCardCreation } from "@/core/card-operations";
import { readPluginJsonFile, writePluginJsonFile } from "@/api/plugin-json-file";
import { openTab, fetchSyncPost } from "siyuan";
import { getNotebooks, createDocWithMd, setBlockAttrs, sqlQuery, canOpenMobileFile, openMobileFile } from "@/api/siyuan";
import { addInboxItem, normalizeInbox } from "@/core/inbox";
import { storesChangedEvent, LV_EVENTS } from "@/libs/events";
import { SUSPEND_TODAY_DATA, INBOX_DATA } from "@/bootstrap/storage-keys";
import { TAB_DASHBOARD, TAB_REVIEW } from "@/bootstrap/tab-registrars";
import { registerPluginCommands } from "@/bootstrap/commands";
import { findActiveProtyleBlockElement, findFloatingPillAnchor } from "@/core/block-dom-utils";
import { isCardEditorBlock } from "@/core/editor-qa-service";
import { isBlockFlashcardExcluded } from "@/core/block-attributes";
import { createCardsVaultAdapter } from "@/core/vault-adapter";

const todayDate = () => localDate(Date.now());

function cloneStore<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

export function isTransientKernelError(detail: string): boolean {
    return /access is denied|timeout|econn|network|fetch failed|failed to fetch|connection reset|socket|is busy|database.*locked|code=-1/i.test(detail || "");
}

export async function retryTransientKernel<T>(fn: () => Promise<T>, maxRetries = 2, baseDelayMs = 500): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            const detail = err instanceof Error ? err.message : String(err);
            if (attempt >= maxRetries || !isTransientKernelError(detail)) throw err;
            await new Promise<void>((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
        }
    }
    throw lastErr;
}

export function friendlyCardGateMessage(detail: string): string {
    const issueMap: Array<[RegExp, string]> = [
        [/missing-block/i, "来源块不存在或已被删除（题目原文可能已被移动/清理，已尝试新建独立卡片兜底）"],
        [/empty-card/i, "卡片内容为空"],
        [/missing-answer/i, "缺少答案，无法成卡"],
        [/missing-question/i, "缺少题干，无法成卡"],
        [/invalid-markup/i, "卡片标记格式无法识别"],
        [/invalid-occlusion/i, "遮挡卡目标缺失"],
    ];
    for (const [re, text] of issueMap) {
        if (re.test(detail)) return `${text}（原文: ${detail}）`;
    }
    if (isTransientKernelError(detail)) return `内核瞬时抖动，已自动重试仍失败（原文: ${detail}）`;
    return detail;
}

export async function createCardFromWrongQuestion(plugin: any, payload: any): Promise<boolean> {
    if (!payload) return false;
    try {
        const question = String(payload.question || payload.title || payload.stem || "").trim();
        const answer = String(payload.answer || payload.standardAnswer || "").trim();
        const analysis = String(payload.analysis || payload.explanation || payload.memo || "").trim();
        const sourceBlockId = payload.blockId || payload.blockID;

        const riff = await import("@/api/riff");
        const decks = await riff.getRiffDecks().catch(() => []);
        let deckID = decks[0]?.id ?? "";
        if (!deckID) {
            try {
                const created = await riff.createRiffDeck("小驴考试错题回炉");
                deckID = created.id;
            } catch {
                deckID = "default";
            }
        }

        if (sourceBlockId) {
            try {
                await retryTransientKernel(() => addRiffCards(deckID, [String(sourceBlockId)]), 2, 500);
                notifyBatchCardCreation(`已自动同步错题到待复习闪卡`);
                return true;
            } catch {}
        }

        if (!question) return false;
        const cleanQ = question.replace(/==/g, "").replace(/\s*\n+\s*/g, " ").trim();
        const cleanA = (answer || "见题目解析").replace(/==/g, "").replace(/\s*\n+\s*/g, " ").trim();
        const cardMd = `${cleanQ} ==${cleanA}==`;

        const nbs = await getNotebooks();
        const nbList = Array.isArray(nbs) ? nbs : ((nbs as any)?.notebooks ?? []);
        const preferredNb = nbList.find((n: any) => n?.id === plugin.settings?.targetNotebookId)
            ?? nbList.find((n: any) => /(🐴\s*)?小驴(生态|空间|笔记本|闪卡)/.test(n?.name || ""))
            ?? nbList[0];
        const defaultNb = preferredNb?.id;
        if (!defaultNb) return false;

        const created = await retryTransientKernel(() => executeQuickCardCreation({
            nbId: defaultNb,
            deckID,
            markdown: cardMd,
            sourceBlockID: sourceBlockId ? String(sourceBlockId) : undefined,
            sourceTitle: payload.examName || payload.paperName || "小驴考试错题",
            examAttrs: payload.examType ? { "custom-exam-type": String(payload.examType) } : undefined,
        }), 2, 500);

        if (analysis) {
            try {
                await retryTransientKernel(() => setBlockAttrs(created.blockID, { memo: analysis.replace(/==/g, "").trim() }));
            } catch {}
        }

        notifyBatchCardCreation(`已自动将考试错题转化为闪卡入库`);
        return true;
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        lvLog("warn", `[lvAutomation] createCardFromWrongQuestion failed: ${detail}`);
        try {
            lvNotify.silent({
                source: "小驴闪卡",
                category: "exam-card-sync-fail",
                message: `[错题联动] 自动制卡失败: ${friendlyCardGateMessage(detail)}`,
                level: "warn",
            });
        } catch {}
        return false;
    }
}

export function getExternalIntake(plugin: any) {
    if (!plugin.externalIntake) plugin.externalIntake = createExternalCardIntake({
        load: () => readPluginJsonFile(plugin.name, INTAKE_JOURNAL),
        save: async (data: any) => {
            await writePluginJsonFile(plugin.name, INTAKE_JOURNAL, data);
        },
        targetNotebook: async () => {
            const nbs = await getNotebooks();
            return (nbs.find(n => n.id === plugin.settings?.targetNotebookId)
                ?? nbs.find(n => /(🐴\s*)?小驴(生态|空间|笔记本|闪卡)/.test(n.name)) ?? nbs[0])?.id ?? "";
        },
        find: async (nb: string, path: string) => {
            const { findDocIDByHPath } = await import("@/api/siyuan");
            const direct = await findDocIDByHPath(nb, path);
            if (direct || !path.startsWith("/小驴闪卡/")) return direct;
            for (const alias of ["05-小驴闪卡", "05-小驴闪卡 · 记忆与复习", "06-小驴闪卡 (siyuan-lv-cards)"]) {
                const found = await findDocIDByHPath(nb, path.replace("/小驴闪卡/", `/${alias}/`));
                if (found) return found;
            }
            return null;
        },
        create: createDocWithMd,
        attrs: setBlockAttrs,
        firstBlock: async (docID: string) => {
            const { getChildBlocks } = await import("@/api/siyuan");
            const blocks = await getChildBlocks(docID);
            const first = blocks.find((block: any) => block.type === "p" || block.type === "l");
            if (!first?.id) throw new Error("Atomic card block not confirmed");
            return first.id;
        },
        ensureDeck: async () => {
            const riff = await import("@/api/riff");
            const decks = await riff.getRiffDecks();
            return decks[0]?.id || (await riff.createRiffDeck("外部原子卡")).id;
        },
        enroll: async (deck: string, block: string) => { await addRiffCards(deck, [block]); },
        inbox: async (docID: string) => {
            const current = await readPluginJsonFile(plugin.name, INBOX_DATA) as { version?: number; items?: unknown } | null;
            if (current && (current.version !== 1 || !Array.isArray(current.items))) throw new Error("Invalid material inbox; no replacement written");
            const next = normalizeInbox(current);
            addInboxItem(next, docID);
            await writePluginJsonFile(plugin.name, INBOX_DATA, next);
            const raw = await readPluginJsonFile(plugin.name, INBOX_DATA);
            if (!normalizeInbox(raw).items.some(item => item.blockID === docID)) throw new Error("Extract inbox readback failed");
            plugin.inbox = next;
            plugin.persistedInboxSnapshot = cloneStore(next);
            plugin.notifyInboxChanged();
        },
    });
    return plugin.externalIntake;
}

export function receiveCardsExtract(plugin: any, envelope: ExtractEnvelope) {
    return getExternalIntake(plugin)(envelope, "extract");
}

export function createCardsExternalAtomicCard(plugin: any, input: IntakeInput) {
    const content = input.content.replace(/\s*\n+\s*/g, " ").trim();
    const decision = validateCardEntry({ blockID: "external-draft", markdown: content });
    if (!decision.ok) return Promise.resolve({ ok: false as const, code: "invalid-card", message: "Atomic card requires an independently recallable question and answer" });
    return getExternalIntake(plugin)({ ...input, content }, "atomic");
}

export function handleCardsQuickAction(plugin: any, action: string): void {
    const act = String(action || "").toLowerCase();
    if (act.includes("复习") || act.includes("review") || act.includes("会话")) {
        plugin.openReviewTab();
    } else if (act.includes("抽取") || act.includes("选区") || act.includes("制卡")) {
        plugin.openQuickCard();
    } else if (act.includes("重新计算") || act.includes("曲线") || act.includes("排期") || act.includes("fsrs")) {
        invalidateDueCache();
        plugin.refreshDueBadge();
        plugin.showNotice("已重新计算卡片遗忘曲线排期与待复习卡池", 2500, "info");
    } else if (act.includes("水蛭")) {
        plugin.openTabOf(TAB_DASHBOARD, { tab: "maintenance" });
    } else if (act.includes("牌组") || act.includes("卡组") || act.includes("卡包")) {
        plugin.openTabOf(TAB_DASHBOARD, { tab: "decks" });
    } else if (act.includes("管理")) {
        plugin.openTabOf(TAB_DASHBOARD, { tab: "manage" });
    } else {
        plugin.openTabOf(TAB_DASHBOARD);
    }
}

const registeredLaunchpadPlugins = new WeakSet<object>();

export function registerCardsLaunchpad(plugin: any): void {
    const due = plugin.getDueCount();
    const badge = due > 0 ? `${due} 待复习` : undefined;
    const topBarElement = plugin.ensureTopBarElement() || undefined;
    if (registeredLaunchpadPlugins.has(plugin)) {
        lvLaunchpad.updateItem("siyuan-lv-cards", { badge, topBarElement });
        return;
    }
    registeredLaunchpadPlugins.add(plugin);
    const unreg = lvLaunchpad.register({
        id: "siyuan-lv-cards",
        name: "闪卡",
        fullName: "小驴闪卡",
        svgIcon: "iconLvCards",
        color: "#f43f5e",
        desc: "间隔复习 · 记忆曲线",
        digit: 6,
        badge,
        badgeType: "error",
        badgeProvider: () => {
            const n = plugin.getDueCount();
            return n > 0 ? `${n} 待复习` : undefined;
        },
        actions: [
            "开始今日复习",
            "快速制卡",
            "水蛭卡预警",
            "管理卡组",
        ],
        topBarElement,
        onClick: () => plugin.openTabOf(TAB_DASHBOARD),
        onAction: (action: string) => handleCardsQuickAction(plugin, action),
    });
    plugin.disposerRegistry.register(() => {
        registeredLaunchpadPlugins.delete(plugin);
        unreg();
    });
}

export async function searchCardsForOmnisearch(plugin: any, keyword: string): Promise<LvSearchResultItem[]> {
    const kw = (keyword || "").trim();
    if (!kw) return [];
    const safeKw = kw.replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/%/g, "\\%").replace(/_/g, "\\_");
    const results: LvSearchResultItem[] = [];
    try {
        const { getRiffDecks } = await import("@/api/riff");
        const decks = await getRiffDecks().catch(() => []);
        const isDeckGenericQuery = kw.includes("牌组") || kw.includes("卡组") || kw.includes("卡包") || kw.includes("deck");
        for (const deck of decks) {
            if (deck.name && (isDeckGenericQuery || deck.name.toLowerCase().includes(kw.toLowerCase()))) {
                results.push({
                    id: `deck-${deck.id}`,
                    source: "闪卡",
                    category: "deck",
                    title: `牌组: ${deck.name}`,
                    snippet: `共包含 ${deck.size ?? 0} 张闪卡`,
                    badge: `${deck.size ?? 0} 张`,
                    onClick: () => {
                        plugin.openTabOf(TAB_DASHBOARD, { tab: "manage" });
                    },
                });
            }
        }
        const rows = await sqlQuery(
            `SELECT id, content, markdown, ial, root_id, updated FROM blocks WHERE (ial LIKE '%custom-riff-decks=%' OR ial LIKE '%custom-flashcard%' OR ial LIKE '%data-flashcard-source="true"%') AND (content LIKE '%${safeKw}%' ESCAPE '\\\\' OR markdown LIKE '%${safeKw}%' ESCAPE '\\\\') ORDER BY updated DESC LIMIT 15`
        ).catch(() => []);
        const seenCardIds = new Set<string>();
        if (Array.isArray(rows)) {
            for (const row of rows) {
                if (isBlockFlashcardExcluded(row.ial)) continue;
                const blockId = String(row.id);
                if (!blockId || seenCardIds.has(blockId)) continue;
                seenCardIds.add(blockId);
                const content = String(row.content || row.markdown || "").trim();
                const firstLine = content.split("\n")[0] || content;
                results.push({
                    id: blockId,
                    source: "闪卡",
                    category: "card",
                    title: firstLine.length > 36 ? firstLine.slice(0, 36) + "..." : firstLine,
                    snippet: content.length > 80 ? content.slice(0, 80) + "..." : content,
                    badge: "记忆卡",
                    linkBlockId: blockId,
                    onClick: () => {
                        plugin.openTabOf(TAB_REVIEW, { scope: `card:${blockId}` });
                    },
                });
            }
        }
        const v2BlockIDs = plugin.v2SourceIndex?.getAllSourceBlockIDs?.() as Set<string> | undefined;
        if (v2BlockIDs && v2BlockIDs.size > 0) {
            const v2Candidates = Array.from(v2BlockIDs).filter(id => !seenCardIds.has(id)).slice(0, 50);
            if (v2Candidates.length > 0) {
                const inList = v2Candidates.map(id => `'${String(id).replace(/'/g, "''")}'`).join(",");
                const v2Rows = await sqlQuery(
                    `SELECT id, content, markdown, ial, updated FROM blocks WHERE id IN (${inList}) AND (content LIKE '%${safeKw}%' ESCAPE '\\\\' OR markdown LIKE '%${safeKw}%' ESCAPE '\\\\') ORDER BY updated DESC LIMIT 15`
                ).catch(() => []);
                if (Array.isArray(v2Rows)) {
                    for (const row of v2Rows) {
                        if (isBlockFlashcardExcluded(row.ial)) continue;
                        const blockId = String(row.id);
                        if (!blockId || seenCardIds.has(blockId)) continue;
                        seenCardIds.add(blockId);
                        const content = String(row.content || row.markdown || "").trim();
                        const firstLine = content.split("\n")[0] || content;
                        results.push({
                            id: blockId,
                            source: "闪卡",
                            category: "card",
                            title: firstLine.length > 36 ? firstLine.slice(0, 36) + "..." : firstLine,
                            snippet: content.length > 80 ? content.slice(0, 80) + "..." : content,
                            badge: "V2 记忆卡",
                            linkBlockId: blockId,
                            onClick: () => {
                                plugin.openTabOf(TAB_REVIEW, { scope: `card:${blockId}` });
                            },
                        });
                    }
                }
            }
        }
    } catch {}
    return results;
}

function seedFlashcardActionsInStoreOnce(): void {
    try {
        if (typeof localStorage === "undefined") return;
        const SEED_KEY = "lv_cards_ba_actions_seeded_v1";
        if (localStorage.getItem(SEED_KEY) === "1") return;
        const cfg = lvBlockAssistant.getStoreConfig?.();
        if (cfg && Array.isArray(cfg.enabledActionIds)) {
            const nextEnabled = [...cfg.enabledActionIds];
            let changed = false;
            for (const id of ["remove-from-deck", "add-to-inbox"]) {
                if (!nextEnabled.includes(id)) {
                    nextEnabled.push(id);
                    changed = true;
                }
            }
            if (changed) {
                lvBlockAssistant.saveStoreConfig({ ...cfg, enabledActionIds: nextEnabled });
            }
        }
        localStorage.setItem(SEED_KEY, "1");
    } catch {}
}

export function setupEcosystemIntegrations(plugin: any): void {
    // 唯一块助手底座接管（不传入自定义 openMenuFn，由共享 #lv-shared-block-capsule 与纯 --b3-* .lv-bam 统一接管）
    if (typeof lvBlockAssistant?.ensureLeader === "function") {
        plugin.disposerRegistry.register(
            lvBlockAssistant.ensureLeader("siyuan-lv-cards"),
        );
    }

    if (typeof lvBlockAssistant?.registerBadgeProvider === "function") {
        plugin.disposerRegistry.register(
            lvBlockAssistant.registerBadgeProvider("siyuan-lv-cards", (blockID: string, blockEl?: HTMLElement | null) => {
                const targetEl = blockEl || (typeof document !== "undefined" ? findActiveProtyleBlockElement(blockID) : null);
                if (isBlockFlashcardExcluded(targetEl)) {
                    return null;
                }
                const isDomCard = Boolean(targetEl && isCardEditorBlock(targetEl));
                const isV2Card = Boolean(plugin.v2SourceIndex?.hasBlock?.(blockID));
                if (!isDomCard && !isV2Card) {
                    return null;
                }
                const q = (targetEl?.getAttribute?.("custom-riff-title") || targetEl?.getAttribute?.("custom-lv-question") || "").trim();
                return {
                    isCard: true,
                    tooltipHint: q ? `✦ 闪卡 · 问: ${q.slice(0, 40)}` : "✦ 闪卡",
                };
            }),
        );
    }

    if (typeof lvBlockAssistant?.registerAction === "function") {
        seedFlashcardActionsInStoreOnce();
        const flashcardActions = [
            {
                id: "edit-card-qa",
                group: "study" as const,
                label: "闪卡制卡 / 属性问答",
                subtitle: "零污染属性提问 · 主动回忆工作台",
                glyph: "✏️",
                sourceType: "ecosystem" as const,
                sourcePlugin: "小驴闪卡",
                sourcePluginId: "siyuan-lv-cards",
                requiresPlugin: "siyuan-lv-cards",
                featured: true,
                badgeText: "闪卡 · Alt+Q",
                singleOnly: true,
                preferredBlockKinds: ["paragraph", "quote"],
                installed: true,
                isAvailable: (s: any) => !s?.isDocument && !s?.isReadOnly,
                execute: async (blockID: string) => {
                    await plugin.openCardQuestionDialog(blockID);
                },
            },
            {
                id: "make-cloze",
                group: "study" as const,
                label: "挖空制卡",
                subtitle: "基于正文选中文本一键制作填空闪卡",
                glyph: "🎯",
                sourceType: "ecosystem" as const,
                sourcePlugin: "小驴闪卡",
                sourcePluginId: "siyuan-lv-cards",
                requiresPlugin: "siyuan-lv-cards",
                singleOnly: true,
                excludedBlockKinds: ["code", "math", "table"],
                installed: true,
                isAvailable: (s: any) => !s?.isDocument && !s?.isReadOnly && Boolean(s?.hasSelection) && s?.blockKind !== "code" && s?.blockKind !== "math" && s?.blockKind !== "table",
                execute: async (blockID: string) => {
                    plugin.makeClozeCard(blockID);
                },
            },
            {
                id: "make-occlusion",
                group: "study" as const,
                label: "制作遮挡卡",
                subtitle: "在图片区域标记并生成遮挡记忆卡",
                glyph: "🖼️",
                sourceType: "ecosystem" as const,
                sourcePlugin: "小驴闪卡",
                sourcePluginId: "siyuan-lv-cards",
                requiresPlugin: "siyuan-lv-cards",
                singleOnly: true,
                excludedBlockKinds: ["code", "math"],
                installed: true,
                isAvailable: (s: any) => !s?.isReadOnly && Boolean(s?.hasImage),
                execute: async (blockID: string) => {
                    await plugin.openDeckPicker([blockID], {
                        skipAdd: true,
                        onPicked: (deckID: string) => void plugin.openOcclusionEditor(blockID, deckID),
                    });
                },
            },
            {
                id: "add-to-deck",
                group: "study" as const,
                label: "加入卡组",
                subtitle: "收录入指定卡组并开启间隔重复复习",
                glyph: "📚",
                sourceType: "ecosystem" as const,
                sourcePlugin: "小驴闪卡",
                sourcePluginId: "siyuan-lv-cards",
                requiresPlugin: "siyuan-lv-cards",
                supportsBatch: true,
                installed: true,
                isAvailable: (s: any) => !s?.isDocument && !s?.isReadOnly && Boolean(s?.isCard || s?.hasCloze || s?.hasQaPattern),
                execute: async (blockID: string, _snap: any, batchIDs?: string[]) => {
                    const ids = batchIDs && batchIDs.length > 1 ? batchIDs : [blockID];
                    await plugin.openDeckPicker(ids);
                },
            },
            {
                id: "remove-from-deck",
                group: "study" as const,
                label: "移出卡组",
                subtitle: "将当前闪卡从复习卡组中移除（保留正文块）",
                glyph: "📤",
                sourceType: "ecosystem" as const,
                sourcePlugin: "小驴闪卡",
                sourcePluginId: "siyuan-lv-cards",
                requiresPlugin: "siyuan-lv-cards",
                destructive: true,
                supportsBatch: true,
                installed: true,
                isAvailable: (s: any) => !s?.isDocument && !s?.isReadOnly && Boolean(s?.isCard),
                execute: async (blockID: string, _snap: any, batchIDs?: string[]) => {
                    const ids = batchIDs && batchIDs.length > 1 ? batchIDs : [blockID];
                    await plugin.removeCardsFromDeck(ids);
                    lvBlockAssistant.refreshCapsule(blockID);
                },
            },
            {
                id: "add-to-inbox",
                group: "study" as const,
                label: "加入材料收件箱",
                subtitle: "暂存至制卡收集箱供集中批处理",
                glyph: "📥",
                sourceType: "ecosystem" as const,
                sourcePlugin: "小驴闪卡",
                sourcePluginId: "siyuan-lv-cards",
                requiresPlugin: "siyuan-lv-cards",
                supportsBatch: true,
                installed: true,
                isAvailable: (s: any) => !s?.isDocument && Boolean(s?.hasText || s?.hasImage),
                execute: async (blockID: string, _snap: any, batchIDs?: string[]) => {
                    const ids = batchIDs && batchIDs.length > 1 ? batchIDs : [blockID];
                    await plugin.addInboxItems(ids);
                    plugin.showNotice(`已将 ${ids.length} 个内容块收入闪卡材料收件箱`, 2200, "info");
                },
            },
        ];
        for (const act of flashcardActions) {
            plugin.disposerRegistry.register(lvBlockAssistant.registerAction(act));
        }
    }

    plugin.disposerRegistry.register(mountCardsBridge({
        getStats: async () => {
            const day = plugin.revlog.days[todayDate()];
            return {
                todayReviews: day?.review ?? 0,
                todayNew: day?.new ?? 0,
                todayForget: day?.forget ?? 0,
                streak: calcStreak(plugin.revlog),
                dueCount: await cachedDueCount().catch(() => 0),
                historyDays: Object.keys(plugin.revlog.days).length,
            };
        },
        getDueSummary: async () => {
            const d = await dueCache.get("").catch(() => null);
            const today = todayDate();
            const dayStat = plugin.revlog?.days?.[today];
            const todayReviewed = (dayStat?.new ?? 0) + (dayStat?.review ?? 0);
            return {
                unreviewedCount: d?.unreviewedCount ?? 0,
                unreviewedNewCardCount: d?.unreviewedNewCardCount ?? 0,
                unreviewedOldCardCount: d?.unreviewedOldCardCount ?? 0,
                todayReviewedCount: todayReviewed,
                updatedAt: new Date().toISOString(),
            };
        },
        openHub: (tab: any) => plugin.openTabOf(TAB_DASHBOARD, tab ? { tab } : undefined),
        openReview: (opts: any) => plugin.openTabOf(TAB_REVIEW, opts as Record<string, unknown>),
        receiveExtract: async (envelope: ExtractEnvelope) => receiveCardsExtract(plugin, envelope),
        createCard: async (input: IntakeInput) => createCardsExternalAtomicCard(plugin, input),
        openCardQuestionDialog: (blockID?: string) => void plugin.openCardQuestionDialog(blockID),
        openBlockActionCenter: (blockID: string, anchor?: HTMLElement) => void plugin.openBlockActionCenter(blockID, anchor || document.body),
        openDeckPicker: (blockIDs: string[]) => plugin.openDeckPicker(blockIDs),
        makeClozeCard: (blockID: string) => plugin.makeClozeCard(blockID),
        openOcclusionFlow: (blockID: string) => plugin.openDeckPicker([blockID], {
            skipAdd: true,
            onPicked: (deckID: string) => void plugin.openOcclusionEditor(blockID, deckID),
        }),
        removeCardsFromDeck: (blockIDs: string[]) => plugin.removeCardsFromDeck(blockIDs),
    }));

    plugin.disposerRegistry.register(registerRaikiriModuleSafely({
        moduleId: "cards-due-summary",
        title: "待复习闪卡",
        icon: "iconLvCards",
        category: "learning",
        supportedDevices: ["desktop", "sidebar", "mobile"],
        sizes: ["small", "medium", "wide"],
        description: "待复习闪卡统计与今日记忆节奏",
        source: { pluginId: "siyuan-lv-cards", name: "小驴闪卡" },
        read: async () => {
            const due = await dueCache.get("").catch(() => null);
            const today = todayDate();
            const todayReviewed = plugin.revlog?.days?.[today]?.review ?? 0;
            const streak = calcStreak(plugin.revlog);
            const totalDue = due?.unreviewedCount ?? 0;
            return {
                items: [
                    { label: "待复习", value: `${due?.unreviewedOldCardCount ?? 0} 张` },
                    { label: "新卡片", value: `${due?.unreviewedNewCardCount ?? 0} 张` },
                    { label: "今日已学", value: `${todayReviewed} 张` },
                ],
                stat: {
                    value: String(totalDue),
                    label: "今日待复习",
                    sub: `连续学习 ${streak} 天`,
                },
                emptyHint: totalDue === 0 ? "今日闪卡已全部复习完毕 🎉" : "",
                status: "ready",
            };
        },
        open: () => plugin.openTabOf(TAB_REVIEW),
    }));

    plugin.disposerRegistry.register(lvNotify.registerPlugin("siyuan-lv-cards"));

    plugin.disposerRegistry.register(lvBackup.register(
        "siyuan-lv-cards",
        async () => plugin.dumpData(),
        async (data: any) => plugin.restoreData(data),
    ));

    if (typeof lvSnapshotVault?.register === "function") {
        const vaultUnreg = lvSnapshotVault.register(createCardsVaultAdapter(plugin));
        plugin.disposerRegistry.register(() => {
            try { vaultUnreg(); } catch {}
            try { lvSnapshotVault.unregister("siyuan-lv-cards"); } catch {}
        });
    }

    plugin.disposerRegistry.register(lvTicker.onDateCross("siyuan-lv-cards", async (todayKey: string) => {
        lvLog("info", `[lvTicker] date crossed to ${todayKey}, recalculating due pool`);
        if (rollDateIfNeeded(plugin.suspendToday)) {
            await plugin.storageCoordinator.save(SUSPEND_TODAY_DATA, plugin.suspendToday);
        }
        invalidateDueCache();
        plugin.refreshDueBadge();
        try {
            (plugin.eventBus as any).emit(LV_EVENTS.storesChanged, storesChangedEvent([SUSPEND_TODAY_DATA]));
        } catch {}
    }));

    registerCardsLaunchpad(plugin);
    lvLaunchpad.registerHostApi({
        openTab,
        openMobileFileById: canOpenMobileFile() ? (app: any, id: string) => openMobileFile(app, id) : undefined,
        fetchSyncPost,
        app: plugin.app,
    });
    plugin.disposerRegistry.register(lvLaunchpad.ensureUnifiedEntry(plugin));

    plugin.disposerRegistry.register(lvOmnisearch.registerProvider("siyuan-lv-cards", (keyword) => {
        return searchCardsForOmnisearch(plugin, keyword);
    }));

    plugin.disposerRegistry.register(lvAutomation.registerRule({
        id: "rule-exam-to-cards",
        name: "考试做错题 ➔ 自动同步闪卡生成复习卡",
        desc: "小驴考试做错题时，自动在闪卡生成待复习卡片",
        enabled: true,
        triggerSource: "siyuan-exam",
        triggerType: "wrong-question",
        actionPlugin: "siyuan-lv-cards",
        actionName: "create-card",
        execute: async (payload: any) => {
            return await createCardFromWrongQuestion(plugin, payload);
        },
    }));

    plugin.disposerRegistry.register(lvAutomation.registerRule({
        id: "rule-glean-to-cards",
        name: "拾遗高亮 ➔ 自动同步闪卡生成复习卡",
        desc: "小驴拾遗高亮制卡请求时，自动在闪卡生成待复习新卡",
        enabled: true,
        triggerSource: "siyuan-glean",
        triggerType: "create-card-request",
        actionPlugin: "siyuan-lv-cards",
        actionName: "create-card",
        execute: async (payload: any) => {
            const content = String(payload?.front || "").trim() + (payload?.back ? ` ==${String(payload.back).replace(/\s*\n+\s*/g, " ").trim()}==` : "");
            return (await createCardsExternalAtomicCard(plugin, {
                content,
                sourceBlockId: payload?.sourceBlockId,
                sourceDocId: payload?.sourceDocId,
                sourceTitle: payload?.sourceTitle,
                tags: payload?.tags,
                requestId: payload?.requestId,
            })).ok;
        },
    }));

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        const onIncrementalExtract = (evt: Event) => {
            const detail = (evt as CustomEvent).detail;
            if (detail) {
                const envelope: ExtractEnvelope = {
                    content: String(detail?.text || detail?.content || detail?.front || ""),
                    sourceBlockId: String(detail?.sourceBlockId || ""),
                    sourceDocId: detail?.sourceDocId || detail?.docId,
                    sourceTitle: detail?.sourceTitle || detail?.docTitle,
                    tags: detail?.tags,
                    requestId: detail?.requestId,
                };
                void receiveCardsExtract(plugin, envelope);
            }
        };
        window.addEventListener("lv-cards:incremental-extract", onIncrementalExtract);
        plugin.disposerRegistry.register(() => {
            window.removeEventListener("lv-cards:incremental-extract", onIncrementalExtract);
        });
    }
}

export function setupPluginMenusAndCommands(plugin: any): void {
    plugin.protyleSlash = [
        {
            filter: ["flashcard", "card", "shanka", "zhika", "sk", "zk", "小驴闪卡", "闪卡", "制作闪卡"],
            html: `<div class="b3-list-item__first"><span class="b3-list-item__text">${plugin.i18n.slashMakeCard ?? "小驴闪卡：将当前块制卡"}</span><span class="b3-list-item__meta">Flashcard</span></div>`,
            id: "lv-cards-slash-make",
            callback: (_p: any, n: any) => { const id = n?.getAttribute("data-node-id"); if (id) void plugin.openDeckPicker([id]); else void plugin.openQuickCard(); },
        },
        {
            filter: ["qa", "q", "wd", "wenda", "question", "wentika", "属性问答", "问答卡", "设为问答卡", "免侵入制卡", "闪卡问题"],
            html: `<div class="b3-list-item__first"><span class="b3-list-item__text">${plugin.i18n.slashSetCardQuestion ?? "小驴闪卡：设为免侵入属性问答卡"}</span><span class="b3-list-item__meta">Alt+Q / Q&amp;A</span></div>`,
            id: "lv-cards-slash-attr-qa",
            callback: (_p: any, n: any) => {
                const id = n?.getAttribute("data-node-id") || n?.closest?.("[data-node-id]")?.getAttribute("data-node-id");
                if (id) void plugin.openCardQuestionDialog(id); else void plugin.openActiveBlockQuestionDialog();
            },
        },
        {
            filter: ["block", "action", "kuai", "kuaizhushou", "zhushou", "cz", "caozuo", "块助手", "操作中心", "块操作中心", "块级操作"],
            html: `<div class="b3-list-item__first"><span class="b3-list-item__text">${plugin.i18n.slashBlockActionCenter ?? "小驴块助手：打开块操作中心"}</span><span class="b3-list-item__meta">Alt+B / Action</span></div>`,
            id: "lv-cards-slash-block-action",
            callback: (_p: any, n: any) => {
                const id = n?.getAttribute("data-node-id") || n?.closest?.("[data-node-id]")?.getAttribute("data-node-id");
                if (id) {
                    const targetEl = (findActiveProtyleBlockElement(id, n) || n) as HTMLElement;
                    const anchor = findFloatingPillAnchor(id) || targetEl || document.body;
                    void plugin.openBlockActionCenter(id, anchor);
                } else void plugin.openActiveBlockActionCenter();
            },
        },
    ];

    registerPluginCommands({
        addCommand: (opts: any) => plugin.addCommand(opts), i18n: plugin.i18n,
        openDashboard: (tab?: string) => plugin.openTabOf(TAB_DASHBOARD, tab ? { tab } : undefined),
        openReview: (opts?: any) => plugin.openTabOf(TAB_REVIEW, opts),
        openManager: () => plugin.openTabOf(TAB_DASHBOARD, { tab: "manage" }),
        openQuickCard: () => plugin.openQuickCard(), openAIWizard: () => plugin.openAIWizard(),
        openRepairDrill: () => plugin.openRepairDrill(), openPalette: () => plugin.openPalette(),
        copyDiagnostics: () => plugin.copyDiagnostics(), openChallenge: () => plugin.openChallenge(),
        openMarkerCards: () => plugin.openMarkerCards(), openPairing: () => plugin.openPairing(),
        openHelpDoc: () => plugin.openHelpDoc(), createSampleWorkspace: () => plugin.createSampleWorkspace(),
        openDynamicBoard: () => plugin.openOrCreateDynamicBoardDoc(), togglePresentationPrivacy: () => plugin.togglePresentationPrivacy(),
        openCurrentBlockQuestionDialog: () => plugin.openActiveBlockQuestionDialog(), openBlockActionCenter: () => plugin.openActiveBlockActionCenter(),
        isBlockAssistantEnabled: () => lvBlockAssistant.isEnabled(),
    });

    plugin.eventBus.on("click-flashcard-action", plugin.sessionService.onNativeCardAction);
    plugin.disposerRegistry.register(() => plugin.eventBus.off("click-flashcard-action", plugin.sessionService.onNativeCardAction));
    plugin.eventBus.on("flashcard-review-card-shown", plugin.sessionService.onV2CardShown);
    plugin.disposerRegistry.register(() => plugin.eventBus.off("flashcard-review-card-shown", plugin.sessionService.onV2CardShown));
    plugin.eventBus.on("flashcard-review-rating-completed", plugin.sessionService.onV2RatingCompleted);
    plugin.disposerRegistry.register(() => plugin.eventBus.off("flashcard-review-rating-completed", plugin.sessionService.onV2RatingCompleted));
    plugin.eventBus.on("flashcard-review-undone", plugin.sessionService.onV2ReviewUndone);
    plugin.disposerRegistry.register(() => plugin.eventBus.off("flashcard-review-undone", plugin.sessionService.onV2ReviewUndone));
    plugin.eventBus.on("click-blockicon", plugin.editorMenuListeners.onBlockIcon);
    plugin.disposerRegistry.register(() => plugin.eventBus.off("click-blockicon", plugin.editorMenuListeners.onBlockIcon));
    plugin.eventBus.on("open-menu-content", plugin.editorMenuListeners.onMenuContent);
    plugin.disposerRegistry.register(() => plugin.eventBus.off("open-menu-content", plugin.editorMenuListeners.onMenuContent));
    plugin.eventBus.on("open-menu-doctree", plugin.editorMenuListeners.onDocTreeMenu);
    plugin.disposerRegistry.register(() => plugin.eventBus.off("open-menu-doctree", plugin.editorMenuListeners.onDocTreeMenu));
}

import { type TopbarMenuConfig } from "@/bootstrap/topbar-menu";

export function buildPluginTopbarMenuProps(plugin: any): TopbarMenuConfig {
    return {
        v2State: plugin.flashcardV2 ? plugin.flashcardV2.state : null,
        modules: plugin.settings.modules,
        presentationPrivacy: {
            enabled: plugin.presentationPrivacyController.getState().enabled,
            profile: plugin.presentationPrivacyController.getState().profile,
        },
        i18n: plugin.i18n,
        actions: {
            openDashboard: () => plugin.openTabOf(TAB_DASHBOARD),
            openReview: () => plugin.openTabOf(TAB_REVIEW),
            openManager: () => plugin.openTabOf(TAB_DASHBOARD, { tab: "manage" }),
            openQuickCard: () => plugin.openQuickCard(),
            openOnboarding: () => plugin.openOnboarding(),
            openAIWizard: () => plugin.openAIWizard(),
            openSettingsDialog: () => plugin.openSettingsDialog(),
            togglePresentationPrivacy: () => plugin.togglePresentationPrivacy(),
        },
    };
}
