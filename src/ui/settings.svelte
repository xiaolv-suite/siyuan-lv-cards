<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { showMessage, lvEcosystem } from "@/libs/notice";
    import { MODULE_DEFS } from "@/core/modules";
    import { scopeCustomCardCss } from "@/core/card-face";
    import { PERSONA_PRESETS, type PersonaPreset } from "@/core/personas";
    import { confirmDialog, confirmDialogBool } from "@/libs/dialog";
    import { trapFocus } from "@/libs/focus-trap";
    import { defaultSettings, type LvCardsSettings } from "@/core/settings";
    import LvSection from "./kit/LvSection.svelte";
    import LvRow from "./kit/LvRow.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import LvSegmented from "./kit/LvSegmented.svelte";
    import LvSlider from "./kit/LvSlider.svelte";
    import LvSwitch from "./kit/LvSwitch.svelte";
    import LvSelect from "./kit/LvSelect.svelte";
    import LvInput from "./kit/LvInput.svelte";
    import LvIcon from "./kit/LvIcon.svelte";
    import { PROMPT_TEMPLATES } from "@/core/prompt-templates";
    // BU-18 模型能力注册表：快选列表 + 登记状态提示 + 端点预设
    import { lookupModel, selectableModelOptions, formatModelContext, ENDPOINT_PRESETS } from "@/core/ai-model-registry";
    // Anki M3：本地 .apkg 导入（docs/39 §3）——宿主适配 + 解析/预览/编排
    import { detectSqlite, openSqliteFile } from "@/api/anki-host";
    import { getNotebooks, createNotebook, createDocWithMd, sqlQuery, setBlockAttrs } from "@/api/siyuan";
    import { createRiffDeck, getRiffDecks, getRiffCards } from "@/api/riff";
    import { addRiffCards, formatRiffCardEntryError } from "@/api/due-shared";
    import { parseAnkiPackage } from "@/core/anki-package";
    import { buildImportPreview } from "@/core/anki-preview";
    import { composeImportMarkdown, pairImportedBlocks, partitionNew, normalizeLedger, mergeLedger } from "@/core/anki-import";
    import { validateFlashcardMarkdown } from "@/core/flashcard-quality";
    import { validateCardEntry } from "@/core/card-entry-gate";
    import { parseLvCardsPackage, previewLvCardsImport } from "@/core/lvcards-package";
    import { LvCardsImportError, pairLvCardsBlocks, readLvCardsDeckIDs, readLvCardsExisting, sqlString, applyPackageCardMetadata } from "@/core/lvcards-import";
    import { inspectLvCardsImportDiff, buildImportExecutionPlan, type ImportResolveAction } from "@/core/lvcards-diff-inspector";
    // Obsidian SR 导入（v0.202.0）：块级解析 → 计划（去重/剥 tag）→ 一卡一段落落库 → 按序对位
    import { planObsidianImport, composeObsidianImportMarkdown, deckNameFor, groupByDeckHint, partitionByLedger, normalizeObLedger, mergeObLedger, type ObLedgerEntry } from "@/core/obsidian-import";
    import { getBridgeSafely, type CheckinBridgeApi, type CheckinItem } from "@/libs/ecosystem-bridge-kit";
    import { aiChat } from "@/api/ai";

    export interface SettingsCtx {
        i18n: any;
        settings: LvCardsSettings;
        save: (s: LvCardsSettings) => void | Promise<void>;
        close: () => void;
        exportRevlog: () => void;
        clearRevlog: () => void;
        /** 备份与恢复中心（可选——旧宿主不传则不显示） */
        backup?: {
            export: () => void;
            restore: (text: string) => Promise<void>;
        };
        /** BU-24/25：AI 用量账本（可选——旧宿主不传则不显示相关行） */
        costLedger?: {
            export: () => void;
            clear: () => void;
            monthUsed: () => number;
        };
        /** Anki M3：guid 导入台账（幂等重导）；可选——旧宿主不传则不持久化 */
        ankiLedger?: {
            load: () => Promise<unknown>;
            save: (entries: unknown) => Promise<void>;
        };
        /** Obsidian SR 导入弱台账（指纹幂等重导）；可选——旧宿主不传则不持久化 */
        obLedger?: {
            load: () => Promise<unknown>;
            save: (entries: unknown) => Promise<void>;
        };
        /** 来源健康基线：导入成功后登记来源指纹。 */
        rememberSourceFingerprint?: (blockID: string, rootID?: string, markdown?: string) => Promise<void>;
        /** BU-31：紧急停用/撤销同意（可选——旧宿主不传则不显示该行） */
        killswitch?: {
            snapshot: () => any;
            stopCurrent: () => any;
            resumeAll: () => any;
            revoke: () => any;
            grant: () => any;
        };
        redetectV2: () => Promise<string>;
        getV2Status: () => string;
        getSuspendedCount: () => number;
        restoreAllSuspended: () => void | Promise<void>;
        testAnkiClient: (url?: string, key?: string) => Promise<string>;
        storageStats: () => { file: string; size: string; lastWrite: number }[];
        exportSettings: () => void;
        /** 笔记本清单（605 落盘笔记本选择） */
        getNotebooks: () => Promise<{ id: string; name: string }[]>;
        exportRevlogCsv: () => void;
        openDynamicBoardDoc?: () => void | Promise<void>;
        importRevlogCsv: (fileText: string) => Promise<{ added: number; skipped: number }>;
        importRevlogMerge: (fileText: string, onFork?: "skip" | "preferImport") => Promise<{ added: number; skipped: number; forks: number }>;
    }

    let { ctx, initialSection }: { ctx: SettingsCtx; initialSection?: "imports" } = $props();
    const t = $derived(ctx.i18n);
    let searchInput: HTMLInputElement;
    let personaFile = $state<HTMLInputElement>();
    let ankiFile = $state<HTMLInputElement>();
    let lvcardsFile = $state<HTMLInputElement>();
    let obFile = $state<HTMLInputElement>();

    // BU-31：紧急停用/撤销同意（设置页本地镜像，操作后回读快照）
    // svelte-ignore state_referenced_locally -- 初值快照刻意的：操作经 applyKill 回读替换
    let ks = $state<any>(ctx.killswitch?.snapshot?.() ?? null);
    function applyKill(action: "stopCurrent" | "resumeAll" | "revoke" | "grant") {
        if (!ctx.killswitch) return;
        ks = ctx.killswitch[action]();
        showMessage(t.settings.aiKillApplied, 2000, "info");
    }
    const providerDisabled = $derived(ks?.disabledTargets?.some((x: string) => x.startsWith("provider:")) ?? false);
    function lastEventText(): string {
        const ev = ks?.events?.[ks.events.length - 1];
        if (!ev) return t.settings.aiKillNone;
        return `${ev.kind} · ${new Date(ev.at).toLocaleString()}`;
    }

    // 初值语义：draft 是打开设置时的快照，保存前不随源变化
    // svelte-ignore state_referenced_locally
    let draft: LvCardsSettings = $state(JSON.parse(JSON.stringify(ctx.settings)));
    /** 外观预览里的自定义卡面 CSS，只作用于预览卡片，输错选择器也不会影响设置弹窗本身 */
    const previewCssTag = $derived.by(() => {
        const scoped = scopeCustomCardCss(draft.customCardCss, ".lv-settings-card-preview");
        return scoped ? `<style>${scoped}</style>` : "";
    });

    // Anki M3：本地 .apkg 导入（docs/39 §3）——解析/预览/建文档/配对/制卡/台账，幂等重导
    let ankiBusy = $state(false);
    let ankiTestBusy = $state(false);
    let revlogImportBusy = $state(false);
    let revlogImportStatus = $state("");
    let restoreSuspendedBusy = $state(false);
    let restoreSuspendedError = $state("");
    const ankiHost = detectSqlite();
    let ankiStatus = $state<{ kind: "info" | "warn" | "error"; text: string } | null>(null);
    // Anki M3：损失明细（导入完成时可一键复制）
    let ankiLosses = $state<string[]>([]);
    let checkinItems = $state<CheckinItem[]>([]);
    let checkinInstalled = $state(false);
    function escapeDialogHtml(value: string): string {
        return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
    }
    /** Obsidian SR 导入（W2）：台账幂等分区 → 确认 → 建文档（一卡一段落）→ 按序对位 → deckHint 分卡组入组。
     * 数量不符即中止（防错位）；双向卡按正向导入（诚实计数）。 */
    let obBusy = $state(false);
    let obStatus = $state<{ kind: "info" | "warn"; text: string } | null>(null);
    async function importObsidian(e: Event) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (!file || obBusy) { return; }
        obBusy = true;
        obStatus = null;
        try {
            const plan = planObsidianImport(await file.text());
            if (plan.cards.length === 0) {
                obStatus = { kind: "info", text: t.settings.obImportNone };
                return;
            }
            const rawLedger = ctx.obLedger ? await ctx.obLedger.load() : [];
            const ledger = normalizeObLedger(rawLedger);
            const { fresh, already } = partitionByLedger(plan.cards, ledger);
            if (fresh.length === 0) {
                obStatus = { kind: "info", text: (t.settings.obImportDone || "已导入 ${ok} 张（文件内去重 ${dup}）").replace("${ok}", "0").replace("${dup}", String(plan.duplicates)).replace("${skip}", String(already.length)) };
                return;
            }
            const base = file.name.replace(/\.(md|markdown)$/i, "");
            const summary = (t.settings.obImportConfirm || "")
                .replace("${n}", String(plan.cards.length))
                .replace("${qa}", String(fresh.filter(c => c.kind === "qa").length))
                .replace("${cloze}", String(fresh.filter(c => c.kind === "cloze").length))
                .replace("${rev}", String(plan.reversed))
                .replace("${dup}", String(plan.duplicates + already.length))
                .replace("${skip}", String(already.length))
                .replace("${deck}", deckNameFor(base, ""));
            const okGo = await confirmDialogBool({
                title: t.settings.obImportLabel,
                content: `<div class="b3-typography">${escapeDialogHtml(summary)}</div>`,
            });
            if (!okGo) { return; }
            // 落点笔记本：存在同名即用，缺失创建（与 Anki 导入同模式）
            const nbName = t.settings.obImportNbName || "Obsidian SR Import";
            const boxes = await getNotebooks();
            let nbId = boxes.find((b) => b.name === nbName)?.id;
            if (!nbId) { nbId = (await createNotebook(nbName)) ?? ""; }
            const docID = await createDocWithMd(nbId, `Obsidian SR/${base} ${new Date().toISOString().slice(0, 10)}`, composeObsidianImportMarkdown(fresh));
            if (!docID) { throw new Error("createDocWithMd 返回空"); }
            // 一卡一段落对位：数量不符中止（防错位，诚实失败）
            const blockRows = await sqlQuery(`SELECT id, markdown FROM blocks WHERE root_id='${docID}' AND type IN ('p','h','u','o') ORDER BY sort`);
            if (blockRows.length !== fresh.length) {
                throw new Error((t.settings.obImportMismatch || "落块数 ${a} 与卡数 ${b} 不一致，已中止")
                    .replace("${a}", String(blockRows.length)).replace("${b}", String(fresh.length)));
            }
            const invalidMarkdown = blockRows.find(row => validateFlashcardMarkdown(String(row.markdown ?? "")) !== null);
            if (invalidMarkdown) throw new Error(t.settings.obImportInvalidCard ?? "导入内容未生成有效答案标记，已停止入组");
            const blockIDs = blockRows.map((r) => String(r.id));
            // deckHint 分卡组：同名牌组复用，缺失创建；blockID 按全局序归组
            const existingDecks = await getRiffDecks();
            const deckIdByName = new Map<string, string>();
            for (const d of existingDecks) {
                deckIdByName.set(d.name, d.id);
            }
            const now = Date.now();
            let ledgerState = normalizeObLedger(rawLedger);
            let added = 0;
            for (const group of groupByDeckHint(fresh)) {
                const name = deckNameFor(base, group.hint);
                let deckID = deckIdByName.get(name) ?? "";
                if (!deckID) {
                    const deck = await createRiffDeck(name) as any;
                    deckID = deck?.id ?? deck?.deck?.id ?? "";
                    deckIdByName.set(name, deckID);
                }
                // blockIDs follow fresh's document order. Use each card's original
                // index so interleaved hints (A, B, A) keep their correct blocks.
                const groupBlocks = group.indices.map(index => blockIDs[index] ?? "");
                if (groupBlocks.length !== group.cards.length || groupBlocks.some(id => !id)) {
                    throw new Error(t.settings.obImportMismatch ?? "落块数与卡数不一致，已中止");
                }
                await addRiffCards(deckID, groupBlocks);
                await Promise.all(groupBlocks.map(id => ctx.rememberSourceFingerprint?.(id, docID)));
                added += groupBlocks.length;
                const groupLedgerAdditions: ObLedgerEntry[] = group.cards.map((c, i) => ({
                    fingerprint: c.fingerprint,
                    deckID,
                    blockID: groupBlocks[i]!,
                    importedAt: now,
                }));
                // Persist after every successful group. If a later group fails,
                // completed groups remain in the ledger and reruns stay idempotent.
                if (ctx.obLedger) {
                    ledgerState = mergeObLedger(ledgerState, groupLedgerAdditions);
                    await ctx.obLedger.save(ledgerState);
                }
            }
            obStatus = { kind: "info", text: (t.settings.obImportDone || "已导入 ${ok} 张（文件内去重 ${dup}）").replace("${ok}", String(added)).replace("${dup}", String(plan.duplicates)).replace("${skip}", String(already.length)) };
        } catch (e: any) {
            const detail = formatRiffCardEntryError(e, t, e?.message ?? String(e));
            obStatus = { kind: "warn", text: (t.settings.obImportFail || "导入失败：${m}").replace("${m}", detail) };
        } finally {
            obBusy = false;
        }
    }

    let lvcardsBusy = $state(false);
    let lvcardsStatus = $state<{ kind: "info" | "warn"; text: string } | null>(null);
    async function importLvCards(e: Event) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (!file || lvcardsBusy) return;
        lvcardsBusy = true;
        lvcardsStatus = null;
        let retainedDocID = "";
        let docRequested = false;
        let addRequested = false;
        try {
            const rawText = await file.text();
            const parsedRes = parseLvCardsPackage(rawText);
            if (!parsedRes.ok) {
                lvcardsStatus = { kind: "warn", text: t.settings.lvcardsImportFail.replace("${m}", (parsedRes as { ok: false; error: string }).error) };
                return;
            }
            const pkg = parsedRes.package;
            if (pkg.cards.length === 0) {
                lvcardsStatus = { kind: "info", text: t.settings.lvcardsImportEmpty };
                return;
            }
            // 查询已有卡组与卡片以进行自动去重
            const decks = await getRiffDecks();
            let deckID = decks.find(d => d.name === pkg.deck.name)?.id ?? "";
            let existingCards: { id: string; markdown: string }[] = [];
            if (deckID) {
                try { existingCards = await readLvCardsExisting(deckID, getRiffCards, sqlQuery); }
                catch { throw new LvCardsImportError("incomplete-deck"); }
            }
            const preview = previewLvCardsImport(pkg, existingCards);
            let toImportCards = preview.newCards;
            let toUpdateMeta: { blockId: string; markdown: string; memo?: string; tags?: string[] }[] = [];
            let retainedLocalMemo = 0;

            // BX-12 / docs/53 TODO-08：冲突卡片差异摘要与可选解决策略（默认保留本地，可选另存新卡或合并便签）
            if (preview.updatedCards.length > 0) {
                const diffSummary = inspectLvCardsImportDiff({
                    deckName: pkg.deck.name,
                    packageCards: pkg.cards,
                    existingCards,
                });

                const conflictSamples = diffSummary.reports
                    .filter(r => r.status === "modified-content" || r.status === "modified-metadata")
                    .slice(0, 5)
                    .map(r => escapeDialogHtml(r.packageCard.markdown.replace(/\s+/g, " ").trim().slice(0, 48)));

                const dialogBody = document.createElement("div");
                dialogBody.className = "b3-typography";
                dialogBody.innerHTML = `
                    <p>分享包中有 <strong>${diffSummary.modifiedContentCount + diffSummary.modifiedMetadataCount}</strong> 张卡片在本地已存在修改（另有 ${diffSummary.newCount} 张全新卡片）。</p>
                    ${conflictSamples.length > 0 ? `<ul style="margin: var(--lv-sp-2) 0; padding-left: 1.25em; font-size: var(--lv-type-caption-size); color: var(--lv-color-text-muted);">${conflictSamples.map(s => `<li>${s}</li>`).join("")}</ul>` : ""}
                    <label style="display: block; margin-top: var(--lv-sp-2); font-size: var(--lv-type-caption-size);">
                        <span>冲突处理方式：</span>
                        <select class="b3-select" data-testid="lvcards-conflict-strategy" style="margin-top: var(--lv-sp-1); width: 100%;">
                            <option value="keep-local">保留本地修改，仅导入全新卡片（推荐）</option>
                            <option value="fork-new">保留本地原卡，冲突卡片另存为新卡</option>
                            <option value="merge-memo">保留本地正文，合并双方便签与标签</option>
                        </select>
                    </label>
                `;

                const confirmDiff = await confirmDialogBool({
                    title: t.settings.lvcardsConflictTitle ?? "发现卡片内容冲突",
                    content: dialogBody,
                });

                if (!confirmDiff) {
                    lvcardsStatus = { kind: "warn", text: t.settings.lvcardsImportConflict.replace("${n}", String(preview.updatedCards.length)) };
                    return;
                }

                const picked = dialogBody.querySelector<HTMLSelectElement>("select")?.value;
                const chosenStrategy: ImportResolveAction =
                    picked === "fork-new" || picked === "merge-memo" ? picked : "keep-local";

                const plan = buildImportExecutionPlan({
                    reports: diffSummary.reports,
                    defaultAction: chosenStrategy,
                });
                toImportCards = plan.toCreate;
                toUpdateMeta = plan.toUpdate;
                retainedLocalMemo = plan.retainedLocalMemoCount;
            }

            if (toImportCards.length === 0 && toUpdateMeta.length === 0) {
                lvcardsStatus = {
                    kind: "info",
                    text: (t.settings.lvcardsImportDuplicate ?? "全部 ${n} 张卡片在「${deck}」中均已存在。")
                        .replace("${n}", String(preview.total)).replace("${deck}", pkg.deck.name)
                        + (retainedLocalMemo > 0 ? ` 已保护 ${retainedLocalMemo} 条本地私有便签。` : ""),
                };
                return;
            }
            if (toImportCards.length === 0 && toUpdateMeta.length > 0) {
                const mergedCount = await applyPackageCardMetadata(
                    toUpdateMeta.map(u => ({ id: u.blockId, markdown: u.markdown, kind: "qa" as const, memo: u.memo, tags: u.tags })),
                    toUpdateMeta.map(u => u.blockId),
                    setBlockAttrs,
                );
                lvcardsStatus = {
                    kind: "info",
                    text: `已为 ${mergedCount} 张本地卡片合并分享包便签与标签（正文保持本地不变）。`,
                };
                return;
            }
            if (toImportCards.some(card => !validateCardEntry({ blockID: card.id, markdown: card.markdown }).ok)) {
                lvcardsStatus = { kind: "warn", text: t.settings.lvcardsImportInvalid };
                return;
            }
            const values = { deck: pkg.deck.name, total: preview.total, n: toImportCards.length, dup: preview.duplicateCards.length };
            const summary = t.settings.lvcardsImportConfirm.replace(/\$\{(deck|total|n|dup)\}/g, (_match: string, key: keyof typeof values) => String(values[key]));
            const confirmed = await confirmDialogBool({
                title: t.settings.lvcardsImportLabel ?? "导入小驴闪卡分享包",
                content: `<div class="b3-typography">${escapeDialogHtml(summary).replace(/\n/g, "<br>")}</div>`,
            });
            if (!confirmed) return;

            // 目标笔记本
            const nbName = "小驴闪卡/分享导入";
            const boxes = await getNotebooks();
            let nbId = boxes.find(b => b.name === nbName)?.id;
            if (!nbId) nbId = (await createNotebook(nbName)) ?? "";
            if (!nbId?.trim()) throw new Error(t.settings.lvcardsImportNoTarget);

            // 生成 Markdown 文档
            const docMarkdown = toImportCards.map(c => c.markdown).join("\n\n");
            docRequested = true;
            const docID = await createDocWithMd(nbId, `${pkg.deck.name} ${new Date().toISOString().slice(0, 10)}`, docMarkdown);
            if (!docID?.trim()) throw new Error(t.settings.lvcardsImportNoTarget);
            retainedDocID = docID;

            // One extra row detects a multi-block card instead of silently admitting only a prefix.
            const blockRows = await sqlQuery(`SELECT id, markdown, root_id, parent_id, type FROM blocks WHERE root_id=${sqlString(docID)} AND parent_id=${sqlString(docID)} AND type != 'd' ORDER BY sort LIMIT ${toImportCards.length + 1}`);
            const blockIDs = pairLvCardsBlocks(toImportCards, blockRows, docID);

            if (!deckID) {
                const newDeck = await createRiffDeck(pkg.deck.name) as any;
                deckID = newDeck?.id ?? newDeck?.deck?.id ?? "";
            }
            if (!deckID?.trim()) throw new Error(t.settings.lvcardsImportNoTarget);
            addRequested = true;
            await addRiffCards(deckID, blockIDs);
            const enrolledIDs = new Set(await readLvCardsDeckIDs(deckID, getRiffCards));
            if (blockIDs.some(id => !enrolledIDs.has(id))) throw new LvCardsImportError("enrollment-mismatch");
            // 恢复可选元数据（助记便签 memo、标签 tags）至新块属性，必须与实际落盘的 toImportCards 对齐（TODO-08）
            await applyPackageCardMetadata(toImportCards, blockIDs, setBlockAttrs);
            if (toUpdateMeta.length > 0) {
                await applyPackageCardMetadata(
                    toUpdateMeta.map(u => ({ id: u.blockId, markdown: u.markdown, kind: "qa" as const, memo: u.memo, tags: u.tags })),
                    toUpdateMeta.map(u => u.blockId),
                    setBlockAttrs,
                );
            }
            lvcardsStatus = {
                kind: "info",
                text: (t.settings.lvcardsImportDone ?? "已成功导入 ${n} 张新卡片（自动跳过 ${dup} 张重复项）")
                    .replace("${n}", String(blockIDs.length))
                    .replace("${dup}", String(preview.duplicateCards.length)),
            };
        } catch (err: any) {
            const message = err instanceof LvCardsImportError
                ? (err.code === "incomplete-deck" ? t.settings.lvcardsImportIncomplete
                    : err.code === "enrollment-mismatch" ? t.settings.lvcardsImportEnrollmentMismatch : t.settings.lvcardsImportMismatch)
                : formatRiffCardEntryError(err, t, err?.message ?? String(err));
            lvcardsStatus = { kind: "warn", text: t.settings.lvcardsImportFail.replace("${m}", message)
                + (retainedDocID ? ` ${t.settings.lvcardsImportRetained.replace("${id}", retainedDocID)}`
                    : docRequested ? ` ${t.settings.lvcardsImportDocUncertain}` : "")
                + (addRequested ? ` ${t.settings.lvcardsImportUncertain}` : "") };
        } finally {
            lvcardsBusy = false;
        }
    }

    async function importAnki(e: Event) {        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (!file || ankiBusy) return;
        const probe = detectSqlite();
        if (!probe.available) {
            ankiStatus = { kind: "error", text: (t.settings.ankiImportNoSqlite ?? "当前宿主不支持本地解析").replace("${r}", probe.reason ?? "") };
            return;
        }
        ankiBusy = true;
        ankiLosses = [];
        ankiStatus = { kind: "info", text: t.settings.ankiImportParsing };
        try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            // M1 解析器契约：传入"打开器"（由解析器自行打开字节），关闭句柄在此收口
            let closeDb: (() => void) | null = null;
            let pkg;
            try {
                pkg = parseAnkiPackage(bytes, (dbBytes) => {
                    const h = openSqliteFile(dbBytes);
                    closeDb = h.close;
                    return h.adapter;
                });
            } finally {
                closeDb?.();
            }
            const preview = buildImportPreview(pkg);
            const rawLedger = ctx.ankiLedger ? await ctx.ankiLedger.load() : [];
            const ledger = normalizeLedger(rawLedger);
            const { fresh, already } = partitionNew(preview.cards, ledger);
            if (fresh.length === 0) {
                ankiStatus = { kind: "info", text: t.settings.ankiImportDone.replace("${ok}", "0").replace("${skip}", String(already.length)).replace("${loss}", String(preview.losses.length)) };
                return;
            }
            const details = preview.losses.slice(0, 8).map(l => escapeDialogHtml(`[${l.guid}] ${l.reason}`)).join("<br>");
            const remaining = preview.losses.length > 8 ? `<br>… ${preview.losses.length - 8}` : "";
            const proceed = await confirmDialogBool({
                title: t.settings.ankiImportPreviewTitle,
                content: `<div class="b3-typography">${t.settings.ankiImportPreviewBody.replace("${n}", String(fresh.length)).replace("${skip}", String(already.length)).replace("${loss}", String(preview.losses.length))}<br>${details}${remaining}</div>`,
            });
            if (!proceed) return;
            // 落点笔记本：存在同名即用，缺失创建
            const nbName = t.settings.ankiNbName || "Anki Import";
            const boxes = await getNotebooks();
            let nbId = boxes.find((b) => b.name === nbName)?.id;
            if (!nbId) nbId = (await createNotebook(nbName)) ?? "";
            const base = file.name.replace(/\.(apkg|colpkg)$/i, "");
            const docID = await createDocWithMd(nbId, `Anki/${base} ${new Date().toISOString().slice(0, 10)}`, composeImportMarkdown(fresh));
            if (!docID) throw new Error("createDocWithMd 返回空");
            const blockRows = await sqlQuery(`SELECT id, content, markdown FROM blocks WHERE root_id='${docID}' AND type='p' ORDER BY sort`);
            const { byGuid } = pairImportedBlocks(
                blockRows.map((r) => ({ id: String(r.id), content: String(r.content ?? "") })),
                fresh,
                { orderFallback: true },
            );
            if (byGuid.size !== fresh.length) throw new Error(`卡片与落块未能完整配对（${byGuid.size}/${fresh.length}），已停止入组`);
            const blockIDs = fresh.map((c) => byGuid.get(c.guid)).filter((x): x is string => Boolean(x));
            const markdownByID = new Map(blockRows.map(row => [String(row.id), String(row.markdown ?? "")]));
            if (blockIDs.some(id => validateFlashcardMarkdown(markdownByID.get(id) ?? "") !== null)) {
                throw new Error(t.settings.ankiImportInvalidCard ?? "导入内容未生成有效答案标记，已停止入组");
            }
            const deck = await createRiffDeck(`Anki: ${base}`) as any;
            const deckID = deck?.id ?? deck?.deck?.id ?? "";
            await addRiffCards(deckID, blockIDs);
            await Promise.all(blockIDs.map(id => ctx.rememberSourceFingerprint?.(id, docID, markdownByID.get(id))));
            const now = Date.now();
            if (ctx.ankiLedger) {
                await ctx.ankiLedger.save(mergeLedger(rawLedger, fresh.map((c) => ({ guid: c.guid, deckID, blockID: byGuid.get(c.guid) ?? "", importedAt: now }))));
            }
            ankiStatus = {
                kind: "warn",
                text: t.settings.ankiImportDone.replace("${ok}", String(blockIDs.length)).replace("${skip}", String(already.length)).replace("${loss}", String(preview.losses.length)),
            };
            if (preview.losses.length > 0) {
                ankiLosses = preview.losses.map((l) => `[${l.guid}] ${l.reason}`);
            }
        } catch (e) {
            const detail = formatRiffCardEntryError(e, t, e instanceof Error ? e.message : String(e));
            ankiStatus = { kind: "error", text: (t.settings.ankiImportFail || "导入失败").replace("${m}", detail) };
        } finally {
            ankiBusy = false;
        }
    }

    // T09 三件套（docs/40）：搜索定位——按分组标题+代表字段标签匹配（i18n 值，中英皆可搜）
    let searchQuery = $state("");
    // 任务入口只控制本次视图；切回全部不改设置草稿或持久化配置。
    // svelte-ignore state_referenced_locally
    let sectionScope = $state(initialSection);
    function showAllSettings() {
        sectionScope = undefined;
        searchQuery = "";
        if (searchInput) {
            searchInput.value = "";
            searchInput.focus();
        }
    }
    const SECTION_KEYWORDS: Record<string, string[]> = {
        persona: ["personaSection", "personaManage", "personaActive", "personaImport", "极客", "应试", "轻量", "极简", "画像"],
        modules: ["modules", "gateway", "review", "stats", "功能模块", "开关", "制卡", "消字", "挖空", "听写", "打字"],
        studyRhythm: ["studyRhythm", "dailyNewTarget", "dailyReviewTarget", "checkinIntegration", "backlogDays", "exam", "examEnabled", "examDate", "节奏", "目标", "打卡", "积压", "考试"],
        studyAnswer: ["studyAnswer", "ratingStyle", "ratingKeyScheme", "timeoutMode", "timeoutForget", "timeoutSeconds", "randomOrder", "burySiblings", "typingEnabled", "typingStrict", "dictationEnabled", "choiceEnabled", "mixedRotation", "requeueAgain", "answerTimeCapSec", "评分", "快捷键", "键盘", "人体工学", "超时", "防剧透", "兄弟卡", "打字", "听写", "选择题", "轮换", "封顶", "jkl"],
        studyVoice: ["studyVoice", "ttsEnabled", "ttsRate", "ttsVoice", "sfxEnabled", "sfxStyle", "语音", "朗读", "语速", "音效", "木鱼", "清音", "铃声"],
        studyNotify: ["studyNotify", "notifyDue", "dailyTipEnabled", "quietStart", "quietEnd", "reminderEnabled", "reminderTime", "提醒", "免打扰", "每日一语", "小贴士", "通知"],
        aiSection: ["aiSection", "aiEndpoint", "aiModel", "aiPromptTemplate", "aiKillTitle", "aiFallbackEndpoint", "aiSensitiveTerms", "aiCostBudgetEnabled", "aiCostMonthlyCap", "端点", "模型", "预算", "敏感词", "脱敏", "提示词", "token"],
        ankiSection: ["ankiSection", "ankiSectionHint", "ankiImport", "ankiImportHint", "ankiImportPick", "lvcardsImportLabel", "lvcardsImportHint", "obImportLabel", "obImportHint", "obImportPick", "导入", "导出", "anki", "obsidian", "闪卡包"],
        appearance: ["appearance", "cardFontScale", "uiMode", "cardMaxWidth", "customCardCss", "ratingDensity", "hideMetaUntilAnswer", "heatmapWeeks", "外观", "字号", "缩放", "宽度", "css", "紧凑", "热力图", "样式"],
        dataSection: ["dataSection", "importMerge", "importMergeHint", "importCsv", "backupExport", "backupHint", "exportRevlog", "exportSettings", "数据", "日志", "清空", "备份", "导出", "重置"],
    };
    function sectionMatches(id: string): boolean {
        if (sectionScope === "imports" && id !== "ankiSection" && id !== "dataSection") return false;
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;
        const dict = t.settings as Record<string, unknown>;
        const list = SECTION_KEYWORDS[id] ?? [];
        const hay = list.map((k) => String(dict[k] ?? k)).join(" ").toLowerCase();
        return hay.includes(q);
    }

    const matchedSectionCount = $derived.by(() => {
        if (!searchQuery.trim()) return 0;
        return Object.keys(SECTION_KEYWORDS).filter(sectionMatches).length;
    });

    /**
     * CF-13: 按单分组一键重置默认值
     */
    function resetSectionDefaults(sectionId: string) {
        const defaults = defaultSettings();
        if (sectionId === "studyRhythm") {
            draft.dailyNewTarget = defaults.dailyNewTarget;
            draft.dailyReviewTarget = defaults.dailyReviewTarget;
            draft.checkinItemId = defaults.checkinItemId;
            draft.backlogDays = defaults.backlogDays;
            draft.examEnabled = defaults.examEnabled;
            draft.examDate = defaults.examDate;
            showMessage("已恢复「学习节奏」默认设置", 1500, "info");
        } else if (sectionId === "studyAnswer") {
            draft.ratingStyle = defaults.ratingStyle;
            draft.ratingKeyScheme = defaults.ratingKeyScheme;
            draft.timeoutMode = defaults.timeoutMode;
            draft.timeoutSeconds = defaults.timeoutSeconds;
            draft.randomOrder = defaults.randomOrder;
            draft.burySiblings = defaults.burySiblings;
            draft.typingEnabled = defaults.typingEnabled;
            draft.typingStrict = defaults.typingStrict;
            draft.dictationEnabled = defaults.dictationEnabled;
            draft.choiceEnabled = defaults.choiceEnabled;
            draft.mixedRotation = defaults.mixedRotation;
            draft.requeueAgain = defaults.requeueAgain;
            draft.answerTimeCapSec = defaults.answerTimeCapSec;
            showMessage("已恢复「作答偏好」默认设置", 1500, "info");
        } else if (sectionId === "studyVoice") {
            draft.ttsEnabled = defaults.ttsEnabled;
            draft.ttsRate = defaults.ttsRate;
            draft.ttsVoice = defaults.ttsVoice;
            draft.sfxEnabled = defaults.sfxEnabled;
            draft.sfxStyle = defaults.sfxStyle;
            showMessage("已恢复「语音与音效」默认设置", 1500, "info");
        } else if (sectionId === "studyNotify") {
            draft.quietStart = defaults.quietStart;
            draft.quietEnd = defaults.quietEnd;
            draft.reminderEnabled = defaults.reminderEnabled;
            draft.reminderTime = defaults.reminderTime;
            draft.dailyTipEnabled = defaults.dailyTipEnabled;
            showMessage("已恢复「提醒与免打扰」默认设置", 1500, "info");
        } else if (sectionId === "appearance") {
            draft.cardFontScale = defaults.cardFontScale;
            draft.customCardCss = defaults.customCardCss;
            draft.cardMaxWidth = defaults.cardMaxWidth;
            draft.ratingDensity = defaults.ratingDensity;
            draft.hideMetaUntilAnswer = defaults.hideMetaUntilAnswer;
            draft.heatmapWeeks = defaults.heatmapWeeks;
            draft.uiMode = defaults.uiMode;
            showMessage("已恢复「外观与卡面」默认设置", 1500, "info");
        } else if (sectionId === "aiSection") {
            draft.aiMode = defaults.aiMode;
            draft.aiEndpoint = defaults.aiEndpoint;
            draft.aiKey = defaults.aiKey;
            draft.aiModel = defaults.aiModel;
            draft.aiFallbackEndpoint = defaults.aiFallbackEndpoint;
            draft.aiFallbackKey = defaults.aiFallbackKey;
            draft.aiFallbackModel = defaults.aiFallbackModel;
            draft.aiSensitiveTerms = defaults.aiSensitiveTerms;
            draft.aiCostBudgetEnabled = defaults.aiCostBudgetEnabled;
            draft.aiCostMonthlyCap = defaults.aiCostMonthlyCap;
            draft.aiPromptTemplate = defaults.aiPromptTemplate;
            showMessage("已恢复「AI 配置」默认设置", 1500, "info");
        }
    }

    function scrollToSection(id: string) {
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    /** BU-18：模型登记状态提示（登记→窗口规模；失效→建议更换；未登记→保守默认口径） */
    function modelRegistryHint(): string {
        const id = (draft.aiModel ?? "").trim();
        if (!id) { return ""; }
        const m = lookupModel(id);
        const dict = t.settings as Record<string, string>;
        if (!m) { return dict.aiModelUnknown ?? ""; }
        if (m.status !== "active") { return dict.aiModelStale ?? ""; }
        return (dict.aiModelCtx ?? "").replace("{n}", formatModelContext(m.contextWindow));
    }
    // svelte-ignore state_referenced_locally
    let v2Label = $state(ctx.getV2Status());
    // 重新探测是异步读操作：锁定重复点击并把失败留在页面上，避免未处理 rejection。
    let v2Busy = $state(false);
    let v2Error = $state("");
    let voices = $state<{ name: string }[]>([]);
    /** 笔记本清单（605） */
    let notebooks = $state<{ id: string; name: string }[]>([]);
    let notebookLoading = $state(true);
    let notebookHasSnapshot = $state(false);
    let notebookError = $state("");
    let notebookRequestSeq = 0;

    async function loadNotebooks() {
        const seq = ++notebookRequestSeq;
        notebookLoading = true;
        try {
            const result = await ctx.getNotebooks();
            if (seq !== notebookRequestSeq) return;
            notebooks = Array.isArray(result)
                ? result.filter(n => n && typeof n.id === "string" && n.id.length > 0 && typeof n.name === "string")
                : [];
            notebookHasSnapshot = true;
            notebookError = "";
        } catch (e) {
            if (seq === notebookRequestSeq) {
                const reason = e instanceof Error ? e.message : String(e);
                notebookError = `${t.settings.targetNotebookLoadFail ?? "读取笔记本失败"}: ${reason}`;
            }
        } finally {
            if (seq === notebookRequestSeq) notebookLoading = false;
        }
    }

    let voiceSynthesis: SpeechSynthesis | null = null;
    let onVoicesChanged: (() => void) | null = null;

    onMount(() => {
        try {
            if ("speechSynthesis" in window) {
                voiceSynthesis = window.speechSynthesis;
                onVoicesChanged = () => (voices = voiceSynthesis?.getVoices().map(v => ({ name: v.name })) ?? []);
                onVoicesChanged();
                voiceSynthesis.addEventListener("voiceschanged", onVoicesChanged);
            }
        } catch { /* 旁路 */ }
        try {
            const checkinBridge = getBridgeSafely<CheckinBridgeApi>("checkin");
            if (checkinBridge && typeof checkinBridge.queryItems === "function") {
                checkinItems = checkinBridge.queryItems();
                checkinInstalled = true;
            }
        } catch { /* 旁路 */ }
        void loadNotebooks();
    });

    onDestroy(() => {
        if (voiceSynthesis && onVoicesChanged) {
            voiceSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        }
        voiceSynthesis = null;
        onVoicesChanged = null;
    });
    let ankiLabel = $state("");

    async function testAnki() {
        if (ankiTestBusy) return;
        ankiTestBusy = true;
        ankiLabel = "";
        try {
            ankiLabel = await ctx.testAnkiClient(draft.ankiClientUrl, draft.ankiClientKey);
        } catch (e: any) {
            ankiLabel = `${t.settings.ankiTestFail ?? "Connection failed"}: ${e?.message ?? String(e)}`;
        } finally {
            ankiTestBusy = false;
        }
    }

    let aiTestingBusy = $state(false);
    let aiTestResult = $state<{ ok: boolean; msg: string } | null>(null);

    async function testCustomAi() {
        if (aiTestingBusy || !draft.aiEndpoint) return;
        aiTestingBusy = true;
        aiTestResult = null;
        try {
            await aiChat(
                {
                    mode: "custom",
                    endpoint: draft.aiEndpoint,
                    apiKey: draft.aiKey,
                    model: draft.aiModel || "gpt-4o-mini",
                },
                "You are an AI connection tester.",
                "ping",
                { timeoutMs: 10000 }
            );
            aiTestResult = { ok: true, msg: "连接成功：服务商响应正常" };
        } catch (e: any) {
            aiTestResult = { ok: false, msg: `连接失败: ${e?.message ?? String(e)}` };
        } finally {
            aiTestingBusy = false;
        }
    }

    let saveBusy = $state(false);
    let saveError = $state("");

    function toggleModule(id: string, ev: boolean | Event) {
        draft.modules[id] = typeof ev === "boolean" ? ev : (ev.target as HTMLInputElement).checked;
        draft.persona = "custom";
    }

    /** 画像应用 diff 预览（61·P0）：确认框逐项列出将改动的模块开关与参数 */
    const PERSONA_PARAM_LABELS: Record<string, string> = {
        ratingStyle: "ratingStyle",
        timeoutMode: "timeoutMode",
        timeoutSeconds: "timeoutSeconds",
        dailyNewTarget: "dailyNewTarget",
        dailyReviewTarget: "dailyReviewTarget",
    };

    function applyPersona(preset: PersonaPreset) {
        const moduleMap = new Map(MODULE_DEFS.map(m => [m.id, m.nameKey]));
        const modLines: string[] = [];
        for (const [id, v] of Object.entries(preset.modules)) {
            if (id in draft.modules && draft.modules[id] !== v) {
                const label = moduleMap.get(id) ? (t.modules as any)[moduleMap.get(id)!] ?? id : id;
                modLines.push(`<div>• ${label}：${draft.modules[id] ? "✓" : "✕"} → ${v ? "✓" : "✕"}</div>`);
            }
        }
        const paramLines: string[] = [];
        for (const [k, v] of Object.entries(preset.params)) {
            const cur = (draft as any)[k];
            if (cur !== undefined && cur !== v) {
                const label = (t.settings as any)[PERSONA_PARAM_LABELS[k] ?? k] ?? k;
                paramLines.push(`<div>• ${label}：${cur} → ${v}</div>`);
            }
        }
        const diffHtml = [...modLines, ...paramLines].join("");
        const diffBlock = diffHtml
            ? `<hr style="margin: calc(var(--lv-space-unit) * 4) 0"><div style="max-height:180px;overflow:auto;font-size: var(--lv-type-control-size)">${diffHtml}</div>`
            : `<hr style="margin: calc(var(--lv-space-unit) * 4) 0"><div style="font-size: var(--lv-type-control-size)">${t.settings.personaNoChange}</div>`;
        confirmDialog({
            title: t.personaApplyTitle,
            content: `<div class="b3-typography">${t[preset.nameKey]}：${t[preset.descKey]}<br><small>${t.personaApplyHint}</small></div>${diffBlock}`,
            confirm: () => {
                draft.persona = preset.id;
                draft.modules = { ...draft.modules, ...preset.modules };
                Object.assign(draft, preset.params);
            },
        });
    }

    /** 画像分享（M12·FR6）：导出/导入当前 模块开关+推荐参数 组合 */
    const PERSONA_PARAM_KEYS = ["ratingStyle", "timeoutMode", "timeoutSeconds", "dailyNewTarget", "dailyReviewTarget"] as const;

    function exportPersona() {
        const params: Record<string, unknown> = {};
        for (const k of PERSONA_PARAM_KEYS) {
            params[k] = (draft as any)[k];
        }
        const payload = { app: "lv-cards", type: "persona", v: 1, persona: draft.persona, modules: { ...draft.modules }, params };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "lv-cards-persona.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function importPersona(ev: Event) {
        const input = ev.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            return;
        }
        if (file.size > 256 * 1024) {
            showMessage(t.settings.importTooLarge, 3000, "error");
            input.value = "";
            return;
        }
        try {
            const obj = JSON.parse(await file.text());
            if (obj?.app !== "lv-cards" || obj?.type !== "persona") {
                throw new Error("not a persona file");
            }
            if (obj.modules && typeof obj.modules === "object") {
                for (const [k, v] of Object.entries(obj.modules)) {
                    if (typeof v === "boolean" && k in draft.modules) {
                        draft.modules[k] = v as boolean;
                    }
                }
            }
            if (obj.params && typeof obj.params === "object") {
                for (const k of PERSONA_PARAM_KEYS) {
                    if (obj.params[k] !== undefined) {
                        (draft as any)[k] = obj.params[k];
                    }
                }
            }
            draft.persona = "custom";
            showMessage(t.settings.personaImported, 2500, "info");
        } catch {
            showMessage(t.settings.personaImportBad, 3000, "error");
        } finally {
            input.value = "";
        }
    }

    async function redetectV2() {
        if (v2Busy) return;
        v2Busy = true;
        v2Error = "";
        try {
            v2Label = await ctx.redetectV2();
            showMessage(t.settings.redetectOk, 1500, "info");
        } catch (e: any) {
            const reason = e?.message ?? String(e);
            v2Error = `${t.settings.redetectFail ?? "探测失败，请重试"}${reason ? `：${reason}` : ""}`;
            showMessage(v2Error, 3000, "error");
        } finally {
            v2Busy = false;
        }
    }

    async function restoreAllSuspended() {
        if (restoreSuspendedBusy || ctx.getSuspendedCount() === 0) return;
        restoreSuspendedBusy = true;
        restoreSuspendedError = "";
        try {
            await ctx.restoreAllSuspended();
            showMessage(t.settings.suspendedRestored ?? "已恢复今日暂缓卡", 2000, "info");
        } catch (e: any) {
            restoreSuspendedError = `${t.settings.suspendedRestoreFail ?? "恢复失败，请重试"}${e?.message ? `：${e.message}` : ""}`;
            showMessage(restoreSuspendedError, 3000, "error");
        } finally {
            restoreSuspendedBusy = false;
        }
    }

    async function importCsv(ev: Event) {
        const input = ev.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file || revlogImportBusy) {
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showMessage(t.settings.importTooLarge, 3000, "error");
            input.value = "";
            return;
        }
        revlogImportBusy = true;
        revlogImportStatus = t.settings.importing ?? "正在导入…";
        try {
            const r = await ctx.importRevlogCsv(await file.text());
            revlogImportStatus = t.settings.importResult.replace("${a}", String(r.added)).replace("${s}", String(r.skipped));
            showMessage(revlogImportStatus, 3000, "info");
        } catch (e: any) {
            revlogImportStatus = e?.message || t.settings.importInvalid;
            showMessage(revlogImportStatus, 3000, "error");
        } finally {
            input.value = "";
            revlogImportBusy = false;
        }
    }

    /** 备份与恢复中心：从 bundle 文件恢复（宿主内预览→确认→应用；失败 toast 可读原因） */
    let backupBusy = $state(false);
    async function restoreBackup(ev: Event) {
        const input = ev.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (!file || !ctx.backup || backupBusy) {
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            showMessage(t.settings.importTooLarge, 3000, "error");
            return;
        }
        backupBusy = true;
        try {
            const text = await file.text();
            await ctx.backup.restore(text);
        } catch (e: any) {
            showMessage(e?.message ?? String(e), 4000, "error");
        } finally {
            backupBusy = false;
        }
    }

    async function importMerge(ev: Event) {
        const input = ev.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file || revlogImportBusy) {
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showMessage(t.settings.importTooLarge, 3000, "error");
            input.value = "";
            return;
        }
        revlogImportBusy = true;
        revlogImportStatus = t.settings.importing ?? "正在导入…";
        try {
            const text = await file.text();
            const result = await ctx.importRevlogMerge(text);
            let finalResult = result;
            if (result.forks > 0) {
                // 等待分叉确认及第二次合并完成后再解锁，避免重复导入覆盖正在确认的操作。
                const preferImport = await confirmDialogBool({
                    title: t.settings.forkTitle,
                    content: `<div class="b3-typography">${t.settings.forkConfirm.replace("${n}", String(result.forks))}</div>`,
                });
                if (preferImport) finalResult = await ctx.importRevlogMerge(text, "preferImport");
            }
            revlogImportStatus = t.settings.importResult.replace("${a}", String(finalResult.added)).replace("${s}", String(finalResult.skipped));
            showMessage(revlogImportStatus, 3000, "info");
        } catch (e: any) {
            revlogImportStatus = e?.message || t.settings.importInvalid;
            showMessage(revlogImportStatus, 3000, "error");
        } finally {
            input.value = "";
            revlogImportBusy = false;
        }
    }

    function requestClose() {
        if (saveBusy) return;
        if (JSON.stringify(draft) === JSON.stringify(ctx.settings)) {
            ctx.close();
            return;
        }
        confirmDialog({
            title: t.settings.unsavedTitle,
            content: `<div class="b3-typography">${t.settings.unsavedDesc}</div>`,
            confirm: () => ctx.close(),
        });
    }

    async function save() {
        if (saveBusy) return;
        draft.dailyNewTarget = Math.max(0, Number(draft.dailyNewTarget) || 0);
        draft.dailyReviewTarget = Math.max(0, Number(draft.dailyReviewTarget) || 0);
        draft.timeoutSeconds = Math.min(3600, Math.max(5, Number(draft.timeoutSeconds) || 60));
        draft.answerTimeCapSec = Math.min(3600, Math.max(5, Number(draft.answerTimeCapSec) || 60));
        draft.leechThreshold = Math.max(1, Number(draft.leechThreshold) || 8);
        saveBusy = true;
        saveError = "";
        try {
            await ctx.save(draft);
            ctx.close();
        } catch (e: any) {
            saveError = e?.message || t.settings.saveFail || t.storageWriteFail || "Save failed, try again";
        } finally {
            saveBusy = false;
        }
    }

    const isDirty = $derived(JSON.stringify(draft) !== JSON.stringify(ctx.settings));

    function onWindowKeydown(e: KeyboardEvent) {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !saveBusy) {
            e.preventDefault();
            void save();
        }
    }
</script>

<svelte:window on:keydown={onWindowKeydown} />

<div class="lv-settings b3-typography" use:trapFocus={{ onEscape: requestClose }}>

    <!-- T09 三件套（docs/40）：搜索定位 + 本地样例预览（虚构内容，不触真实卡片） -->
    <div class="lv-searchbar">
        <span class="lv-searchbar-icon"><LvIcon name="search" size={14} /></span>
        <input
            bind:this={searchInput}
            class="b3-text-field fn__flex-1"
            placeholder={t.settings.searchPlaceholder ?? "搜索配置项 (如: 快捷键 / 音效 / 目标 / AI / 导出)..."}
            aria-label={t.settings.searchPlaceholder ?? "搜索配置项"}
            spellcheck="false"
            autocomplete="off"
            bind:value={searchQuery}
            onkeydown={(e) => { if (e.key === "Escape" && searchQuery) { e.stopPropagation(); searchQuery = ""; } }}
        />
        {#if searchQuery.trim()}
            <button
                type="button"
                class="b3-button b3-button--small b3-button--text lv-searchbar-clear"
                title="清空搜索"
                onclick={() => { searchQuery = ""; searchInput?.focus(); }}
            >
                <LvIcon name="close" size={13} />
            </button>
        {/if}
    </div>
    {#if searchQuery.trim() && matchedSectionCount > 0}
        <div class="lv-search-summary">
            <span class="ft__smaller ft__on-surface">找到 {matchedSectionCount} 个匹配的设置分组 (按 Esc 清空)</span>
        </div>
    {/if}
    {#if !searchQuery.trim() && sectionScope !== "imports"}
        <nav class="lv-settings-nav-rail" aria-label="设置快速导航">
            <button type="button" class="lv-settings-nav-chip" onclick={() => scrollToSection("sec-persona")}>
                <LvIcon name="target" size={13} /> <span>{t.settings.personaSection ?? "学习画像"}</span>
            </button>
            <button type="button" class="lv-settings-nav-chip" onclick={() => scrollToSection("sec-modules")}>
                <LvIcon name="cards" size={13} /> <span>{t.settings.modules ?? "功能模块"}</span>
            </button>
            <button type="button" class="lv-settings-nav-chip" onclick={() => scrollToSection("sec-studyRhythm")}>
                <LvIcon name="timer" size={13} /> <span>{t.settings.studyRhythm ?? "学习节奏"}</span>
            </button>
            <button type="button" class="lv-settings-nav-chip" onclick={() => scrollToSection("sec-studyAnswer")}>
                <LvIcon name="zap" size={13} /> <span>{t.settings.studyAnswer ?? "作答偏好"}</span>
            </button>
            <button type="button" class="lv-settings-nav-chip" onclick={() => scrollToSection("sec-studyVoice")}>
                <LvIcon name="bell" size={13} /> <span>{t.settings.studyVoice ?? "语音朗读"}</span>
            </button>
            <button type="button" class="lv-settings-nav-chip" onclick={() => scrollToSection("sec-appearance")}>
                <LvIcon name="image" size={13} /> <span>{t.settings.appearance ?? "外观卡面"}</span>
            </button>
            <button type="button" class="lv-settings-nav-chip" onclick={() => scrollToSection("sec-aiSection")}>
                <LvIcon name="cards" size={13} /> <span>{t.settings.aiSection ?? "AI服务商"}</span>
            </button>
            <button type="button" class="lv-settings-nav-chip" onclick={() => scrollToSection("sec-ankiSection")}>
                <LvIcon name="book" size={13} /> <span>{t.settings.ankiSection ?? "导入导出"}</span>
            </button>
            <button type="button" class="lv-settings-nav-chip" onclick={() => scrollToSection("sec-dataSection")}>
                <LvIcon name="moon" size={13} /> <span>{t.settings.dataSection ?? "数据备份"}</span>
            </button>
        </nav>
    {/if}
    {#if sectionScope === "imports"}
        <div class="lv-notice lv-import-scope">
            <strong>{t.settings.importsTitle}</strong>
            <span>{t.settings.importsHint}</span>
            <button type="button" class="b3-button b3-button--outline" onclick={showAllSettings}>{t.settings.showAllSettings}</button>
        </div>
    {/if}
    {#if searchQuery.trim() && !Object.keys(SECTION_KEYWORDS).some(sectionMatches)}
        <div class="lv-notice" role="status">{t.settings.searchEmpty}</div>
    {/if}
    {#if sectionMatches("persona")}
    <LvSection id="sec-persona" title={t.settings.personaSection}>
        <div class="fn__flex fn__flex-wrap lv-personas">
            {#each PERSONA_PRESETS as p (p.id)}
                <button
                    class="lv-persona"
                    class:lv-persona-active={draft.persona === p.id}
                    onclick={() => applyPersona(p)}
                >
                    <div class="lv-persona-name">{t[p.nameKey]}</div>
                    <div class="ft__smaller ft__on-surface">{t[p.descKey]}</div>
                </button>
            {/each}
            <div class="lv-persona lv-persona--custom" class:lv-persona-active={draft.persona === "custom"}>
                <div class="lv-persona-name">{t.personaCustom}</div>
                <div class="ft__smaller ft__on-surface">{t.personaCustom_desc}</div>
            </div>
        </div>
        <div class="fn__flex" style="gap: var(--lv-sp-2); margin-top: var(--lv-sp-2)">
            <button class="b3-button b3-button--outline b3-button--small lv-btn-tool" onclick={exportPersona}>
                <LvIcon name="book" size={12} />
                <span>{t.settings.personaExport}</span>
            </button>
            <button type="button" class="b3-button b3-button--outline b3-button--small lv-btn-tool" aria-label={t.settings.personaImport} onclick={() => personaFile?.click()}>
                <LvIcon name="inbox" size={12} />
                <span>{t.settings.personaImport}</span>
            </button>
            <input bind:this={personaFile} type="file" accept="application/json,.json" hidden onchange={importPersona} />
        </div>
    </LvSection>
    {/if}

    {#if sectionMatches("modules")}
    <LvSection id="sec-modules" title={t.settings.modules}>
        <!-- BI-14：界面模式（simple=隐藏考试/维护等高级入口；纯显示控制，不删配置） -->
        <LvRow label={t.settings.uiModeLabel} hint={t.settings.uiModeHint}>
            {#snippet children()}
                <LvSelect
                    bind:value={draft.uiMode}
                    options={[
                        { value: "simple", label: t.settings.uiModeSimple },
                        { value: "advanced", label: t.settings.uiModeAdvanced },
                    ]}
                />
            {/snippet}
        </LvRow>
        {#each MODULE_DEFS as m (m.id)}
            <LvRow label={t.modules[m.nameKey]} hint={m.locked ? t.settings.lockedModule : t.modules[m.descKey]}>
                {#snippet children()}
                    <LvChip tone={m.phase === "v0.1" ? "primary" : m.phase === "v0.9" ? "warn" : "default"}>{m.phase}</LvChip>
                    <LvSwitch
                        checked={m.locked ? true : Boolean(draft.modules[m.id])}
                        disabled={m.locked}
                        ariaLabel={t.modules[m.nameKey]}
                        onchange={(val) => toggleModule(m.id, val)}
                    />
                {/snippet}
            </LvRow>
        {/each}
    </LvSection>
    {/if}

    <!-- 学习偏好四区（13-W10）：节奏与目标 / 评分与作答 / 朗读与音效 / 提醒与免打扰 -->
    {#if sectionMatches("studyRhythm")}
    <LvSection id="sec-studyRhythm" title={t.settings.studyRhythm}>
        {#snippet actions()}
            <button
                type="button"
                class="b3-button b3-button--small b3-button--text lv-btn-tool"
                title="恢复学习节奏默认设置"
                onclick={() => resetSectionDefaults("studyRhythm")}
            >
                <LvIcon name="refresh" size={12} />
                <span>恢复本组默认</span>
            </button>
        {/snippet}
        <LvRow label={t.settings.dailyNewTarget} hint="推荐默认 10 张，设为 0 则不设每日目标">
            <input class="b3-text-field fn__size-60" type="number" inputMode="numeric" min="0" bind:value={draft.dailyNewTarget} />
            inputMode="numeric"
        </LvRow>
        <LvRow label={t.settings.dailyReviewTarget} hint="推荐默认 20 张，设为 0 则不设每日目标">
            <input class="b3-text-field fn__size-60" type="number" inputMode="numeric" min="0" bind:value={draft.dailyReviewTarget} />
            inputMode="numeric"
        </LvRow>
        <LvRow label={t.settings.topbarDirectReview}>
            <LvSwitch bind:checked={draft.topbarDirectReview} />
        </LvRow>
        <LvRow label={t.settings.batchLimit} hint={t.settings.batchLimitHint}>
            <input class="b3-text-field fn__size-60" type="number" inputMode="numeric" min="0" bind:value={draft.batchLimit} />
            inputMode="numeric"
        </LvRow>
        <LvRow label={t.settings.randomOrder}>
            <LvSwitch bind:checked={draft.randomOrder} />
        </LvRow>
        <LvRow label={t.settings.burySiblings ?? "同源兄弟卡防剧透推迟"} hint={t.settings.burySiblingsHint}>
            <LvSwitch bind:checked={draft.burySiblings} />
        </LvRow>
        <LvRow label={t.settings.checkinIntegration ?? "小驴打卡生态联动"} hint={t.settings.checkinIntegrationHint ?? "完成复习时自动记录打卡计数；留空将自动匹配包含「闪卡」或「复习」的项目"}>
            {#if checkinInstalled && checkinItems.length > 0}
                <select class="b3-select fn__flex-1" bind:value={draft.checkinItemId} aria-label="小驴打卡联动条目">
                    <option value="">{t.settings.checkinNone ?? "智能自动匹配（默认）"}</option>
                    {#each checkinItems as item (item.id)}
                        {@const isRec = item.name.includes("闪卡") || item.name.includes("复习") || item.name.toLowerCase().includes("cards")}
                        <option value={item.id}>{item.name} ({item.kind || "计数"}){isRec ? " ★推荐" : ""}</option>
                    {/each}
                </select>
            {:else}
                <input class="b3-text-field fn__size-200" type="text" placeholder={t.settings.checkinPlaceholder ?? "输入小驴打卡项目 ID（如 chk-xxx）"} bind:value={draft.checkinItemId} />
            {/if}
        </LvRow>
        <LvRow label={t.settings.reverseOrder} hint={t.settings.reverseOrderHint}>
            <LvSwitch bind:checked={draft.reverseOrder} />
        </LvRow>
        <LvRow label={t.settings.hideMetaUntilAnswer} hint={t.settings.hideMetaHint}>
            <LvSwitch bind:checked={draft.hideMetaUntilAnswer} />
        </LvRow>
        <LvRow label={t.settings.requeueAgain} hint={t.settings.requeueAgainHint}>
            <LvSwitch bind:checked={draft.requeueAgain} />
        </LvRow>
        <LvRow label={t.settings.xpEnabled} hint={t.settings.xpEnabledHint}>
            <LvSwitch bind:checked={draft.xpEnabled} />
        </LvRow>
        <LvRow label={t.settings.dailyTipEnabled} hint={t.settings.dailyTipHint}>
            <LvSwitch bind:checked={draft.dailyTipEnabled} />
        </LvRow>
        <LvRow label={t.settings.leechThreshold} hint="默认 8 次，达到该遗忘次数时标记为易混淆卡">
            <input class="b3-text-field fn__size-60" type="number" inputMode="numeric" min="1" bind:value={draft.leechThreshold} />
            inputMode="numeric"
        </LvRow>
    </LvSection>
    {/if}

    {#if sectionMatches("studyAnswer")}
    <LvSection id="sec-studyAnswer" title={t.settings.studyAnswer}>
        {#snippet actions()}
            <button
                type="button"
                class="b3-button b3-button--small b3-button--text lv-btn-tool"
                title="恢复作答偏好默认设置"
                onclick={() => resetSectionDefaults("studyAnswer")}
            >
                <LvIcon name="refresh" size={12} />
                <span>恢复本组默认</span>
            </button>
        {/snippet}
        <LvRow label={t.settings.ratingStyle}>
            <LvSegmented
                options={[
                    { value: "four", label: t.settings.ratingFour },
                    { value: "three", label: t.settings.ratingThree },
                ]}
                value={draft.ratingStyle}
                onchange={(v) => (draft.ratingStyle = v as "four" | "three")}
            />
        </LvRow>

        <LvRow label={t.settings.ratingKeyScheme ?? "评分快捷键方案"}>
            <LvSegmented
                options={[
                    { value: "number", label: t.settings.ratingKeySchemeNumber ?? "数字键 (1-4)" },
                    { value: "jkl", label: t.settings.ratingKeySchemeJkl ?? "人体工学 (J/K/L/;)" },
                    { value: "both", label: t.settings.ratingKeySchemeBoth ?? "双键位并存" },
                ]}
                value={draft.ratingKeyScheme || "both"}
                onchange={(v) => (draft.ratingKeyScheme = v as "number" | "jkl" | "both")}
            />
        </LvRow>

        <!-- T09：生效来源显示（docs/40）——全局默认 + 本场覆盖口径 -->
        <div class="lv-notice">{t.settings.effectiveSource.replace("${v}", draft.ratingStyle === "four" ? t.settings.ratingFour : t.settings.ratingThree)}</div>
        <LvRow label={t.settings.timeoutMode}>
        <LvSelect
            bind:value={draft.timeoutMode}
            options={[
                { value: "off", label: t.settings.timeoutOff },
                { value: "reveal", label: t.settings.timeoutReveal },
                { value: "forget", label: t.settings.timeoutForget },
            ]}
        />
        </LvRow>
        {#if draft.timeoutMode !== "off"}
            <LvRow label={t.settings.timeoutSeconds}>
                <LvSlider value={draft.timeoutSeconds} min={5} max={600} step={5} suffix="s" onchange={(v) => (draft.timeoutSeconds = v)} />
            </LvRow>
        {/if}
        <!-- AQ-13：单卡作答耗时封顶（只影响本地统计，不改评分与到期） -->
        <LvRow label={t.settings.answerTimeCap} hint={t.settings.answerTimeCapHint}>
            <LvSlider value={draft.answerTimeCapSec} min={5} max={600} step={5} suffix="s" onchange={(v) => (draft.answerTimeCapSec = v)} />
        </LvRow>
        <LvRow label={t.settings.typingEnabled}>
            <LvSwitch bind:checked={draft.typingEnabled} />
        </LvRow>
        {#if draft.typingEnabled}
            <LvRow label={t.settings.typingStrict}>
                <LvSwitch bind:checked={draft.typingStrict} />
            </LvRow>
            <LvRow label={t.settings.dictationEnabled}>
                <LvSwitch bind:checked={draft.dictationEnabled} />
            </LvRow>
        {/if}
        <LvRow label={t.settings.choiceEnabled}>
            <LvSwitch bind:checked={draft.choiceEnabled} />
        </LvRow>
        <LvRow label={t.settings.mixedRotationLabel} hint={t.settings.mixedRotationHint}>
            <LvSwitch bind:checked={draft.mixedRotation} />
        </LvRow>
    </LvSection>
    {/if}

    {#if sectionMatches("studyVoice")}
    <LvSection id="sec-studyVoice" title={t.settings.studyVoice}>
        {#snippet actions()}
            <button
                type="button"
                class="b3-button b3-button--small b3-button--text lv-btn-tool"
                title="恢复语音与音效默认设置"
                onclick={() => resetSectionDefaults("studyVoice")}
            >
                <LvIcon name="refresh" size={12} />
                <span>恢复本组默认</span>
            </button>
        {/snippet}
        <LvRow label={t.settings.ttsEnabled}>
            <LvSwitch bind:checked={draft.ttsEnabled} />
        </LvRow>
        {#if draft.ttsEnabled}
            <LvRow label={t.settings.ttsRate}>
                <input class="b3-text-field fn__size-60" type="number" inputMode="numeric" min="0.5" max="2" step="0.1" bind:value={draft.ttsRate} />
                inputMode="numeric"
            </LvRow>
            <LvRow label={t.settings.ttsVoice} hint={t.settings.ttsVoiceHint}>
                {#snippet children()}
                    <select class="b3-select fn__size-200" bind:value={draft.ttsVoice}>
                        <option value="">{t.settings.ttsVoiceDefault}</option>
                        {#each voices as v (v.name)}<option value={v.name}>{v.name}</option>{/each}
                    </select>
                {/snippet}
            </LvRow>
        {/if}
        <LvRow label={t.settings.sfxEnabled} hint={t.settings.sfxHint}>
            <LvSwitch bind:checked={draft.sfxEnabled} />
        </LvRow>
        {#if draft.sfxEnabled}
            <LvRow label={t.settings.sfxStyle}>
                <LvSegmented
                    options={[
                        { value: "chime", label: t.settings.sfxChime },
                        { value: "wood", label: t.settings.sfxWood },
                        { value: "bell", label: t.settings.sfxBell },
                    ]}
                    value={draft.sfxStyle}
                    onchange={(v) => (draft.sfxStyle = v as "chime" | "wood" | "bell")}
                />
            </LvRow>
        {/if}
    </LvSection>
    {/if}

    {#if sectionMatches("studyNotify")}
    <LvSection id="sec-studyNotify" title={t.settings.studyNotify}>
        {#snippet actions()}
            <button
                type="button"
                class="b3-button b3-button--small b3-button--text lv-btn-tool"
                title="恢复提醒与免打扰默认设置"
                onclick={() => resetSectionDefaults("studyNotify")}
            >
                <LvIcon name="refresh" size={12} />
                <span>恢复本组默认</span>
            </button>
        {/snippet}
        <LvRow label={t.settings.quietStart} hint={t.settings.quietHint}>
            <input class="b3-text-field fn__size-60" type="time" bind:value={draft.quietStart} />
        </LvRow>
        <LvRow label={t.settings.quietEnd}>
            <input class="b3-text-field fn__size-60" type="time" bind:value={draft.quietEnd} />
        </LvRow>
        <LvRow label={t.settings.reminderEnabled}>
            <LvSwitch bind:checked={draft.reminderEnabled} />
        </LvRow>
        {#if draft.weeklyReportEnabled}
            <p class="hint" style="margin: 0 0 calc(var(--lv-space-unit) * 4)">{t.settings.weeklyReportHint}</p>
        {/if}
        <LvRow label={t.settings.weeklyReportEnabled}>
            <LvSwitch bind:checked={draft.weeklyReportEnabled} />
        </LvRow>
        {#if draft.reminderEnabled}
            <LvRow label={t.settings.reminderTime}>
                <input class="b3-text-field fn__size-60" type="time" bind:value={draft.reminderTime} />
            </LvRow>
            <LvRow label={t.settings.backlogDays}>
                <input class="b3-text-field fn__size-60" type="number" inputMode="numeric" min="1" bind:value={draft.backlogDays} />
                inputMode="numeric"
            </LvRow>
        {/if}
    </LvSection>
    {/if}

    {#if sectionMatches("aiSection")}
    <LvSection id="sec-aiSection" title={t.settings.aiSection} sub={t.settings.aiSectionHint}>
        {#snippet actions()}
            <button
                type="button"
                class="b3-button b3-button--small b3-button--text lv-btn-tool"
                title="恢复 AI 配置默认设置"
                onclick={() => resetSectionDefaults("aiSection")}
            >
                <LvIcon name="refresh" size={12} />
                <span>恢复本组默认</span>
            </button>
        {/snippet}
        <LvRow label={t.settings.targetNotebook} hint={t.settings.targetNotebookHint}>
            <div style="display:flex;flex-direction:column;align-items:flex-start;gap:var(--lv-sp-1);max-width:320px">
                <LvSelect
                    bind:value={draft.targetNotebookId}
                    disabled={notebookLoading && !notebookHasSnapshot || notebooks.length === 0}
                    options={[{ value: "", label: t.settings.targetNotebookFirst }, ...notebooks.map(n => ({ value: n.id, label: n.name }))]}
                />
                {#if notebookLoading}<span class="ft__smaller ft__on-surface" role="status" aria-busy="true">{t.settings.targetNotebookLoading}</span>{/if}
                {#if notebookError}
                    <div role="alert" aria-live="assertive" style="display:flex;flex-wrap:wrap;align-items:center;gap:var(--lv-sp-2);color: var(--lv-color-danger);overflow-wrap:anywhere;max-width:48em;text-wrap:pretty;line-height:var(--lv-lh-reading, 1.65);">
                        <span>{notebookError}</span>
                        <button class="b3-button b3-button--small" disabled={notebookLoading} onclick={loadNotebooks}>{t.settings.targetNotebookRetry}</button>
                    </div>
                {:else if notebookHasSnapshot && notebooks.length === 0}
                    <span class="ft__smaller ft__on-surface" role="status">{t.settings.targetNotebookEmpty}</span>
                {/if}
            </div>
        </LvRow>
        <LvRow label={t.settings.markerEnabled} hint={t.settings.markerEnabledHint}>
            <LvSwitch bind:checked={draft.markerEnabled} />
        </LvRow>
        <LvRow label={t.settings.aiMode}>
            {#snippet children()}
                <LvSelect
                    bind:value={draft.aiMode}
                    options={[
                        { value: "siyuan", label: t.settings.aiModeSiyuan },
                        { value: "custom", label: t.settings.aiModeCustom },
                    ]}
                />
            {/snippet}
        </LvRow>
            {#if draft.aiMode === "custom"}
                <LvRow label={t.settings.aiEndpointPreset ?? "服务商快速预设"}>
                    {#snippet children()}
                        <select
                            class="b3-select b3-button--small"
                            aria-label={t.settings.aiEndpointPreset ?? "服务商快速预设"}
                            onchange={(e: Event) => {
                                const val = (e.target as HTMLSelectElement).value;
                                const p = ENDPOINT_PRESETS.find(x => x.id === val);
                                if (p) {
                                    draft.aiEndpoint = p.apiBase;
                                    draft.aiModel = p.defaultModel;
                                    if (p.isLocal && !draft.aiKey) {
                                        draft.aiKey = "ollama";
                                    }
                                }
                                (e.target as HTMLSelectElement).value = "";
                            }}
                        >
                            <option value="">{t.settings.aiEndpointPresetSelect ?? "选择预设 (OpenAI / DeepSeek / Ollama 本地 / LM Studio...)"}</option>
                            {#each ENDPOINT_PRESETS as p (p.id)}
                                <option value={p.id}>{p.label}</option>
                            {/each}
                        </select>
                    {/snippet}
                </LvRow>
                <LvRow label={t.settings.aiEndpoint}>
                <LvInput bind:value={draft.aiEndpoint} placeholder="https://api.example.com/v1" width="200px" />
                </LvRow>
            <LvRow label={t.settings.aiModel} hint={modelRegistryHint()}>
                {#snippet children()}
                    <div class="fn__flex" style="gap: calc(var(--lv-space-unit) * 3); align-items: center; flex-wrap: wrap">
                        <LvInput bind:value={draft.aiModel} placeholder="gpt-4o-mini" width="160px" />
                        <!-- BU-18 模型能力注册表：快选只列 active 在册模型（失效模型不出现） -->
                        <select
                            class="b3-select b3-button--small"
                            aria-label={t.settings.aiModelPreset}
                            onchange={(e: Event) => {
                                const id = (e.target as HTMLSelectElement).value;
                                if (id) { draft.aiModel = id; }
                                (e.target as HTMLSelectElement).value = "";
                            }}
                        >
                            <option value="">{t.settings.aiModelPreset}</option>
                            {#each selectableModelOptions() as o (o.value)}
                                <option value={o.value}>{o.label}</option>
                            {/each}
                        </select>
                    </div>
                {/snippet}
            </LvRow>
            <LvRow label={t.settings.aiKey} hint={t.settings.aiKeyHint}>
                <LvInput bind:value={draft.aiKey} type="password" width="200px" />
            </LvRow>
            <LvRow label="连通性测试" hint="向当前配置的自定义服务商端点发送测试消息以验证可用性">
                {#snippet children()}
                    <div class="fn__flex" style="gap: var(--lv-sp-2); align-items: center; flex-wrap: wrap">
                        <button
                            type="button"
                            class="b3-button b3-button--outline lv-btn-tool"
                            disabled={aiTestingBusy || !draft.aiEndpoint}
                            onclick={testCustomAi}
                        >
                            <LvIcon name="zap" size={13} />
                            <span>{aiTestingBusy ? "测试中…" : "测试 AI 连接"}</span>
                        </button>
                        {#if aiTestResult}
                            <span class="ft__smaller" style={aiTestResult.ok ? "color: var(--lv-color-success)" : "color: var(--lv-color-danger)"}>
                                {aiTestResult.msg}
                            </span>
                        {/if}
                    </div>
                {/snippet}
            </LvRow>
            <LvRow label={t.settings.aiFallbackEndpoint} hint={t.settings.aiFallbackHint}>
                <LvInput bind:value={draft.aiFallbackEndpoint} placeholder="https://backup.example.com/v1" width="200px" />
            </LvRow>
            {#if draft.aiFallbackEndpoint}
                <LvRow label={t.settings.aiFallbackModel}>
                    <LvInput bind:value={draft.aiFallbackModel} placeholder="gpt-4o-mini" width="200px" />
                </LvRow>
                <LvRow label={t.settings.aiFallbackKey}>
                    <LvInput bind:value={draft.aiFallbackKey} type="password" width="200px" />
                </LvRow>
            {/if}
            <LvRow label={t.settings.aiPromptTemplate} hint={t.settings.aiPromptTemplateHint}>
                {#snippet children()}
                    <!-- BU-5 收口（v0.163.0）：预置模板单一事实源=注册表（10 模板），不再散落 i18n 字符串 -->
                    <div class="fn__flex fn__flex-wrap" style="gap: calc(var(--lv-space-unit) * 3); margin-bottom: 6px">
                        <select
                            class="b3-select b3-button--small"
                            aria-label={t.settings.aiPromptTemplate}
                            onchange={(e: Event) => {
                                const id = (e.target as HTMLSelectElement).value;
                                const tpl = PROMPT_TEMPLATES.find(x => x.id === id);
                                if (tpl) { draft.aiPromptTemplate = tpl.systemPrompt; }
                            }}
                        >
                            <option value="">{t.settings.aiPromptPick}</option>
                            {#each PROMPT_TEMPLATES as tpl (tpl.id)}
                                <option value={tpl.id}>{(t as any)[tpl.nameKey] ?? tpl.nameKey}</option>
                            {/each}
                        </select>
                        <button class="b3-button b3-button--small" onclick={() => (draft.aiPromptTemplate = "")}>{t.settings.aiPromptReset}</button>
                    </div>
                    <textarea class="b3-text-field fn__size-200" rows="4" style="width: 100%; resize: vertical" bind:value={draft.aiPromptTemplate}></textarea>
                {/snippet}
            </LvRow>
            {/if}
            {#if ctx.killswitch}
                <!-- BU-31：紧急停用/撤销同意（停用即清理待发队列；卡片与正式复习不受影响）。
                     安全阀对思源内置 AI 同样有意义，不能随 custom 模式条件块隐藏（审计 F-2 修复） -->
                <LvRow label={t.settings.aiKillTitle} hint={t.settings.aiKillHint}>
                    {#snippet children()}
                        <div class="fn__flex fn__flex-wrap" style="gap: calc(var(--lv-space-unit) * 3); align-items: center">
                            {#if ks.revoked}
                                <button class="b3-button b3-button--small" onclick={() => applyKill("grant")}>{t.settings.aiKillGrant}</button>
                                <LvChip tone="error">{t.settings.aiKillRevokedChip}</LvChip>
                            {:else}
                                <button class="b3-button b3-button--small" onclick={() => applyKill("revoke")}>{t.settings.aiKillRevoke}</button>
                            {/if}
                            {#if providerDisabled}
                                <button class="b3-button b3-button--small" onclick={() => applyKill("resumeAll")}>{t.settings.aiKillResume}</button>
                                <LvChip tone="warn">{t.settings.aiKillStoppedChip}</LvChip>
                            {:else}
                                <button class="b3-button b3-button--small" onclick={() => applyKill("stopCurrent")}>{t.settings.aiKillStop}</button>
                            {/if}
                        </div>
                        <div class="ft__smaller ft__on-surface" style="margin-top: calc(var(--lv-space-unit) * 2)">
                            {t.settings.aiKillLast}{lastEventText()}
                        </div>
                    {/snippet}
                </LvRow>
            {/if}
            <!-- BU-8：自定义敏感词（发送前扫描提示脱敏，仅本地；思源内置 AI 与自定义端点都生效） -->
            <LvRow label={t.settings.aiSensitiveTerms} hint={t.settings.aiSensitiveTermsHint}>
                <LvInput bind:value={draft.aiSensitiveTerms} placeholder="projectblue, 项目代号" width="200px" />
            </LvRow>
            {#if ctx.costLedger}
                <!-- BU-24：月度 token 预算（超限阻断出卡；手工路径不受限；账本只记 token/模型，不含内容） -->
                <LvRow label={t.settings.aiCostBudget} hint={t.settings.aiCostBudgetHint}>
                    {#snippet children()}
                        <div class="fn__flex" style="gap: calc(var(--lv-space-unit) * 4); align-items: center; flex-wrap: wrap">
                            <LvSwitch bind:checked={draft.aiCostBudgetEnabled} />
                            <span class="ft__smaller ft__on-surface">{t.settings.aiCostMonthlyCap}</span>
                            <input class="b3-text-field fn__size-60" type="number" inputMode="numeric" min="0" bind:value={draft.aiCostMonthlyCap} />
                            inputMode="numeric"
                            <span class="ft__smaller ft__on-surface">{t.settings.aiCostUsed.replace("${n}", String(ctx.costLedger.monthUsed()))}</span>
                        </div>
                    {/snippet}
                </LvRow>
            {/if}
    </LvSection>
    {/if}

    {#if sectionMatches("ankiSection")}
    <LvSection id="sec-ankiSection" title={t.settings.ankiSection} sub={t.settings.ankiSectionHint}>
        <LvRow label={t.settings.ankiUrl}>
            <input class="b3-text-field fn__size-200" aria-label={t.settings.ankiUrl} bind:value={draft.ankiClientUrl} />
        </LvRow>
        <LvRow label={t.settings.ankiKey}>
            <input class="b3-text-field fn__size-200" type="password" aria-label={t.settings.ankiKey} bind:value={draft.ankiClientKey} />
        </LvRow>
        <LvRow label={t.settings.ankiTest}>
            {#snippet children()}
                {#if ankiLabel}<span class="ft__smaller ft__on-surface">{ankiLabel}</span>{/if}
                <button class="b3-button b3-button--outline lv-btn-tool" aria-label={t.settings.ankiTest} disabled={ankiTestBusy} onclick={testAnki}>
                    <LvIcon name="zap" size={13} />
                    <span>{ankiTestBusy ? "…" : t.settings.ankiTest}</span>
                </button>
            {/snippet}
        </LvRow>
        <!-- Anki M3：本地 .apkg 导入（docs/39 §3）——解析/预览/建文档/制卡/台账，幂等重导 -->
        <LvRow label={t.settings.ankiImport} hint={t.settings.ankiImportHint}>
            {#snippet children()}
                {#if ankiBusy}<span class="ft__smaller ft__on-surface">{t.settings.ankiImportParsing}</span>{/if}
                {#if ankiHost.available}
                    <button type="button" class="b3-button b3-button--outline lv-btn-tool" aria-label={t.settings.ankiImportPick} disabled={ankiBusy} aria-busy={ankiBusy} onclick={() => ankiFile?.click()}>
                        <LvIcon name="book" size={13} />
                        <span>{t.settings.ankiImportPick}</span>
                    </button>
                    <input bind:this={ankiFile} type="file" accept=".apkg,.colpkg" hidden disabled={ankiBusy} onchange={importAnki} />
                {:else}
                    <span class="lv-notice lv-notice--warn" role="status">
                        {(t.settings.ankiImportNoSqlite ?? "当前宿主不支持本地解析：${r}").replace("${r}", ankiHost.reason ?? "")}
                    </span>
                {/if}
            {/snippet}
        </LvRow>
        {#if ankiStatus}
            <div class="lv-notice {ankiStatus.kind === 'info' ? '' : 'lv-notice--warn'}" style="max-height: 180px; overflow: auto">
                <div style="display: flex; align-items: center; gap: calc(var(--lv-space-unit) * 4); flex-wrap: wrap">
                    <span style="flex: 1; min-width: 200px">{ankiStatus.text}</span>
                    {#if ankiStatus.kind === "warn" && ankiLosses.length > 0}
                        <!-- Anki M3：损失明细一键复制（诊断对账用） -->
                        <button
                            class="b3-button b3-button--small lv-btn-tool"
                            onclick={() => {
                                navigator.clipboard.writeText(ankiLosses.join("\n")).then(
                                    () => showMessage(t.settings.ankiLossCopied, 1500, "info"),
                                    () => { /* 剪贴板不可用静默 */ },
                                );
                            }}
                        >
                            <LvIcon name="check" size={12} />
                            <span>{t.settings.ankiLossCopy}</span>
                        </button>
                    {/if}
                </div>
            </div>
        {/if}
        <!-- 原生小驴闪卡分享包导入（.lvcards，P1 生态互通）：格式校验 + 自动去重 + 对齐卡组 -->
        <LvRow label={t.settings.lvcardsImportLabel ?? "小驴闪卡分享包导入（.lvcards）"} hint={t.settings.lvcardsImportHint ?? "支持小驴闪卡原生 .lvcards 单文件分享包，自动校验格式，按卡组归组并去重入库"}>
            {#snippet children()}
                {#if lvcardsBusy}<span class="ft__smaller ft__on-surface">{t.settings.ankiImportParsing}</span>{/if}
                <button type="button" class="b3-button b3-button--outline lv-btn-tool" aria-label={t.settings.lvcardsImportPick ?? "选择 .lvcards 文件"} disabled={lvcardsBusy} aria-busy={lvcardsBusy} onclick={() => lvcardsFile?.click()}>
                    <LvIcon name="cards" size={13} />
                    <span>{t.settings.lvcardsImportPick ?? "选择 .lvcards 文件"}</span>
                </button>
                <input bind:this={lvcardsFile} type="file" accept=".lvcards,.json,application/json" hidden disabled={lvcardsBusy} onchange={importLvCards} />
            {/snippet}
        </LvRow>
        {#if lvcardsStatus}
            <div class="lv-notice {lvcardsStatus.kind === 'info' ? '' : 'lv-notice--warn'}">
                <span>{lvcardsStatus.text}</span>
            </div>
        {/if}
        <!-- Obsidian SR 导入（v0.202.0）：#flashcards/::/:::/==挖空== md → 一卡一段落落库 → 按序对位入新卡组 -->
        <LvRow label={t.settings.obImportLabel} hint={t.settings.obImportHint}>
            {#snippet children()}
                {#if obBusy}<span class="ft__smaller ft__on-surface">{t.settings.ankiImportParsing}</span>{/if}
                <button type="button" class="b3-button b3-button--outline lv-btn-tool" aria-label={t.settings.obImportPick} disabled={obBusy} aria-busy={obBusy} onclick={() => obFile?.click()}>
                    <LvIcon name="edit" size={13} />
                    <span>{t.settings.obImportPick}</span>
                </button>
                <input bind:this={obFile} type="file" accept=".md,.markdown,text/markdown" hidden disabled={obBusy} onchange={importObsidian} />
            {/snippet}
        </LvRow>
        {#if obStatus}
            <div class="lv-notice {obStatus.kind === 'info' ? '' : 'lv-notice--warn'}">
                <span>{obStatus.text}</span>
            </div>
        {/if}
    </LvSection>
    {/if}

    {#if sectionMatches("appearance")}
    <LvSection id="sec-appearance" title={t.settings.appearance}>
        {#snippet actions()}
            <button
                type="button"
                class="b3-button b3-button--small b3-button--text lv-btn-tool"
                title="恢复外观与卡面默认设置"
                onclick={() => resetSectionDefaults("appearance")}
            >
                <LvIcon name="refresh" size={12} />
                <span>恢复本组默认</span>
            </button>
        {/snippet}
        <div class="lv-notice" style="display: flex; gap: var(--lv-sp-4); align-items: center; flex-wrap: wrap; margin-bottom: var(--lv-sp-3)">
            <div style="flex: 1; min-width: 220px">
                <div class="lv-eyebrow">{t.settings.previewTitle}</div>
                <div class="ft__smaller ft__on-surface" style="margin-top: calc(var(--lv-space-unit) * 2)">{t.settings.previewSub}</div>
            </div>
            <div class="lv-card2 lv-settings-card-preview" style={`max-width: 340px; font-size: ${draft.cardFontScale || 1}em; flex: 1; padding: calc(var(--lv-space-unit) * 6) calc(var(--lv-space-unit) * 8);`}>
                {#if previewCssTag}
                    {@html previewCssTag}
                {/if}
                <div class="lv-card-content">
                    <strong>{t.settings.previewQ}</strong>
                    <div class="ft__smaller ft__on-surface" style="margin-top: calc(var(--lv-space-unit) * 2)">{t.settings.previewA}</div>
                </div>
                <div class="lv-settings-preview-rating" style="margin-top: var(--lv-sp-3); display: flex; gap: var(--lv-sp-1); flex-wrap: wrap;">
                    {#if draft.ratingStyle === "three"}
                        <span class="lv-chip2 lv-chip2--warn">{t.review?.unknown ?? "不认识"}</span>
                        <span class="lv-chip2 lv-chip2--default">{t.review?.vague ?? "模糊"}</span>
                        <span class="lv-chip2 lv-chip2--primary">{t.review?.know ?? "认识"}</span>
                    {:else}
                        <span class="lv-chip2 lv-chip2--warn">{t.review?.againBtn ?? "遗忘"}</span>
                        <span class="lv-chip2 lv-chip2--default">{t.review?.hard ?? "困难"}</span>
                        <span class="lv-chip2 lv-chip2--primary">{t.review?.good ?? "良好"}</span>
                        <span class="lv-chip2 lv-chip2--primary">{t.review?.easy ?? "简单"}</span>
                    {/if}
                </div>
            </div>
        </div>
        <LvRow label={t.settings.cardFontScale}>
            <LvSlider value={draft.cardFontScale} min={0.85} max={1.25} step={0.05} suffix="×" onchange={(v) => (draft.cardFontScale = v)} />
        </LvRow>
        <LvRow label={t.settings.customCardCss ?? "自定义卡面样式（CSS）"} hint={t.settings.customCardCssHint ?? "注入自定义 CSS 规则，仅作用于卡面内容（如字体、颜色、字间距等）"}>
            {#snippet children()}
                <textarea
                    class="b3-text-field fn__block"
                    rows="3"
                    placeholder={t.settings.customCardCssPlaceholder ?? ".lv-card-content { font-family: sans-serif; }"}
                    bind:value={draft.customCardCss}
                ></textarea>
            {/snippet}
        </LvRow>
        <LvRow label={t.settings.ratingDensity}>
            <LvSegmented
                options={[
                    { value: "cozy", label: t.settings.densityCozy },
                    { value: "compact", label: t.settings.densityCompact },
                ]}
                value={draft.ratingDensity}
                onchange={(v) => (draft.ratingDensity = v as "cozy" | "compact")}
            />
        </LvRow>
        <LvRow label={t.settings.heatmapWeeks}>
            <select class="b3-select fn__size-200" bind:value={draft.heatmapWeeks}>
                <option value={17}>17 {t.settings.weeks}</option>
                <option value={26}>26 {t.settings.weeks}</option>
                <option value={52}>52 {t.settings.weeks}</option>
            </select>
        </LvRow>
        <LvRow label={t.settings.badgeRefreshSec} hint={t.settings.badgeRefreshSecHint}>
            <select class="b3-select fn__size-200" bind:value={draft.badgeRefreshSec}>
                <option value={0}>{t.settings.badgeOff}</option>
                <option value={30}>30s</option>
                <option value={60}>60s</option>
            </select>
        </LvRow>
    </LvSection>
    {/if}

    {#if sectionMatches("dataSection")}
    <LvSection id="sec-dataSection" title={t.settings.dataSection}>
        <LvRow label="Flashcard V2" hint={t.dashboard.v2Active}>
            {#snippet children()}
                <LvChip tone={v2Label.startsWith("Active") ? "primary" : v2Label === "N/A (<3.9.0)" ? "default" : "warn"}>{v2Label}</LvChip>
                <button class="b3-button b3-button--outline lv-btn-tool" aria-label={t.settings.redetectV2} disabled={v2Busy} aria-busy={v2Busy} onclick={redetectV2}>
                    <LvIcon name="refresh" size={12} />
                    <span>{v2Busy ? "…" : t.settings.redetectV2}</span>
                </button>
            {/snippet}
        </LvRow>
        {#if v2Error}<div class="lv-notice lv-notice--warn" role="alert" aria-live="assertive">{v2Error}</div>{/if}
        <LvRow label={t.settings.suspendedManage} hint={t.settings.suspendedHint.replace("${n}", String(ctx.getSuspendedCount()))}>
            {#snippet children()}
                <button class="b3-button b3-button--outline lv-btn-tool" aria-label={t.settings.suspendedRestore} disabled={restoreSuspendedBusy || ctx.getSuspendedCount() === 0} aria-busy={restoreSuspendedBusy} onclick={restoreAllSuspended}>
                    <LvIcon name="refresh" size={12} />
                    <span>{restoreSuspendedBusy ? (t.settings.suspendedRestoring ?? "恢复中…") : t.settings.suspendedRestore}</span>
                </button>
            {/snippet}
        </LvRow>
        {#if restoreSuspendedError}<div class="lv-notice lv-notice--warn" role="alert" aria-live="assertive">{restoreSuspendedError} <button class="b3-button b3-button--text" disabled={restoreSuspendedBusy} onclick={restoreAllSuspended}>{t.settings.retry ?? "重试"}</button></div>{/if}
        {#if ctx.openDynamicBoardDoc}
            <LvRow label={t.settings.dynamicBoardDoc} hint={t.settings.dynamicBoardDocHint}>
                {#snippet children()}
                    <button type="button" class="b3-button b3-button--outline lv-btn-tool" onclick={() => {
                        try {
                            const res = ctx.openDynamicBoardDoc?.();
                            if (res && typeof (res as any).catch === "function") {
                                (res as any).catch(() => {});
                            }
                        } catch { /* 旁路 */ }
                    }}>
                        <LvIcon name="book" size={12} />
                        <span>{t.settings.openDynamicBoardBtn}</span>
                    </button>
                {/snippet}
            </LvRow>
        {/if}
        <LvRow label={t.settings.exportRevlog} hint={t.settings.storageNote}>
            {#snippet children()}
                <button class="b3-button b3-button--outline lv-btn-tool" aria-label={`${t.settings.exportRevlog} · JSON`} onclick={ctx.exportRevlog}>
                    <LvIcon name="book" size={12} />
                    <span>JSON</span>
                </button>
                <button class="b3-button b3-button--outline lv-btn-tool" aria-label={`${t.settings.exportRevlog} · CSV`} onclick={ctx.exportRevlogCsv}>
                    <LvIcon name="book" size={12} />
                    <span>CSV</span>
                </button>
            {/snippet}
        </LvRow>
        <LvRow label={t.settings.exportSettings}>
            {#snippet children()}
                <button class="b3-button b3-button--outline lv-btn-tool" aria-label={t.settings.exportSettings} onclick={ctx.exportSettings}>
                    <LvIcon name="settings" size={12} />
                    <span>{t.settings.exportSettings}</span>
                </button>
            {/snippet}
        </LvRow>
        <LvRow label={t.settings.importMerge} hint={t.settings.importMergeHint}>
            {#snippet children()}
                <input class="b3-button b3-button--outline lv-btn-tool" type="file" accept=".json,application/json" aria-label={t.settings.importMerge} disabled={revlogImportBusy} onchange={importMerge} />
                <input class="b3-button b3-button--outline lv-btn-tool" type="file" accept=".csv,text/csv" aria-label={t.settings.importCsv} disabled={revlogImportBusy} onchange={importCsv} />
                {#if revlogImportStatus}<span class="ft__smaller ft__on-surface" role={revlogImportBusy ? "status" : "alert"} aria-live={revlogImportBusy ? "polite" : "assertive"} aria-busy={revlogImportBusy}>{revlogImportStatus}</span>{/if}
            {/snippet}
        </LvRow>
        {#if ctx.backup}
            <!-- 备份与恢复中心（docs/38 P2）：导出 bundle 快照 / 从文件恢复（预览→确认→应用） -->
            <LvRow label={t.settings.backupExport} hint={t.settings.backupHint}>
                {#snippet children()}
                    <button class="b3-button b3-button--outline lv-btn-tool" aria-label={`${t.settings.backupExport} · JSON`} onclick={ctx.backup.export}>
                        <LvIcon name="inbox" size={12} />
                        <span>JSON</span>
                    </button>
                    <input class="b3-button b3-button--outline lv-btn-tool" type="file" accept=".json,application/json" aria-label={t.settings.backupRestore} disabled={backupBusy} onchange={restoreBackup} />
                    <span class="ft__smaller ft__on-surface">{backupBusy ? "…" : ""}</span>
                {/snippet}
            </LvRow>
        {/if}
        <div class="lv-storage">
            <div class="fn__flex lv-st-head ft__smaller ft__on-surface">
                <span>file</span><div class="fn__flex-1"></div><span>{t.settings.storageLastWrite}</span>
            </div>
            {#each ctx.storageStats() as row (row.file)}
                <div class="fn__flex lv-st-row">
                    <span>{row.file}</span>
                    <div class="fn__flex-1"></div>
                    <span class="ft__smaller ft__on-surface">{row.size}</span>
                    <span class="ft__smaller ft__on-surface lv-lw">{row.lastWrite ? new Date(row.lastWrite).toLocaleString() : "—"}</span>
                </div>
            {/each}
        </div>
        <LvRow label={t.settings.clearRevlog}>
            {#snippet children()}
                <button
                    class="b3-button b3-button--outline lv-btn-tool lv-menu-danger"
                    aria-label={t.settings.clearRevlog}
                    onclick={() => confirmDialog({
                        title: t.settings.clearRevlog,
                        content: `<div class="b3-typography">${t.settings.clearRevlogConfirm}</div>`,
                        confirm: () => {
                            ctx.exportRevlog(); // 清空前自动备份（AK）
                            ctx.clearRevlog();
                        },
                    })}
                >
                    <LvIcon name="trash" size={12} />
                    <span>{t.settings.clearRevlog}</span>
                </button>
            {/snippet}
        </LvRow>
        {#if ctx.costLedger}
            <!-- BU-25：账本可导出（聚合+明细）与删除 -->
            <LvRow label={t.settings.exportCostLedger}>
                {#snippet children()}
                    <button class="b3-button b3-button--outline" onclick={ctx.costLedger.export}>JSON</button>
                    <button
                        class="b3-button b3-button--outline lv-btn-tool lv-menu-danger"
                        onclick={() => confirmDialog({
                            title: t.settings.clearCostLedger,
                            content: `<div class="b3-typography">${t.settings.clearCostLedgerConfirm}</div>`,
                            confirm: () => ctx.costLedger!.clear(),
                        })}
                    >
                        <LvIcon name="trash" size={12} />
                        <span>{t.settings.clearCostLedger}</span>
                    </button>
                {/snippet}
            </LvRow>
        {/if}
        <LvRow label="小驴全家桶协同状态" hint="当前思源工作区中小驴系列插件自协商与生态健康状态">
            {#snippet children()}
                <span class="ft__smaller" style="color: var(--lv-color-text-muted); padding: 4px 10px; border-radius: 999px; background: color-mix(in srgb, var(--lv-color-surface) 80%, transparent); border: 1px solid var(--lv-border);">
                    {lvEcosystem.getStatusBadgeText()}
                </span>
            {/snippet}
        </LvRow>
    </LvSection>
    {/if}

    {#if saveError}
        <div class="lv-notice lv-notice--warn" role="alert" aria-live="assertive" style="margin-bottom: var(--lv-sp-2)">{saveError}</div>
    {/if}
    <div class="b3-dialog__action lv-settings-sticky-footer">
        {#if isDirty}
            <span class="lv-settings-dirty-hint ft__smaller ft__on-surface">
                <span class="lv-dot-warn"></span>
                <span>{t.settings.unsavedTitle ?? "有未保存的更改"}</span>
            </span>
        {/if}
        <button
            class="b3-button b3-button--cancel"
            disabled={saveBusy}
            title={`${window.siyuan.languages.cancel} (Esc)`}
            aria-keyshortcuts="Escape"
            onclick={requestClose}
        >{window.siyuan.languages.cancel}</button>
        <div class="fn__space"></div>
        <button
            class="b3-button lv-btn-primary"
            disabled={saveBusy}
            title={`${window.siyuan.languages.confirm} (Ctrl+Enter)`}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            onclick={save}
        >{saveBusy ? "…" : window.siyuan.languages.confirm}</button>
    </div>
</div>

<style lang="scss">
    .lv-settings {
        padding: var(--lv-sp-4);
        flex: 1 1 auto;
        min-width: 0;
        min-height: 0;
        width: 100%;
        height: auto;
        overflow-y: auto;
        overscroll-behavior: contain;
        scroll-padding-top: 52px;
        box-sizing: border-box;
        max-width: 720px;
        margin: 0 auto;

        .lv-settings-sticky-footer {
            position: sticky;
            bottom: 0;
            z-index: var(--lv-z-sticky, 100);
            background: var(--lv-color-surface);
            box-shadow: var(--lv-shadow-2);
            margin: var(--lv-sp-4) calc(var(--lv-sp-4) * -1) calc(var(--lv-sp-4) * -1);
            padding: var(--lv-sp-3) var(--lv-sp-4);
            border-top: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent);
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: var(--lv-sp-2);

            @supports (backdrop-filter: blur(10px)) or (-webkit-backdrop-filter: blur(10px)) {
                background: color-mix(in srgb, var(--lv-color-surface) 94%, transparent);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
            }
        }
        .lv-settings-dirty-hint {
            display: inline-flex;
            align-items: center;
            gap: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline));
            margin-right: auto;
            color: var(--lv-color-warning);
        }
        .lv-dot-warn {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--lv-color-warning);
            display: inline-block;
        }

        .b3-dialog__action { justify-content: flex-end; }
        .lv-settings-nav-rail {
            position: sticky;
            top: 0;
            z-index: var(--lv-z-elevated, 2);
            background: var(--lv-color-surface);
            display: flex;
            gap: var(--lv-sp-2);
            flex-wrap: wrap;
            margin: calc(var(--lv-sp-4) * -1) calc(var(--lv-sp-4) * -1) var(--lv-sp-3);
            padding: var(--lv-sp-2) var(--lv-sp-4);
            border-bottom: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent);

            @supports (backdrop-filter: blur(8px)) or (-webkit-backdrop-filter: blur(8px)) {
                background: color-mix(in srgb, var(--lv-color-surface) 95%, transparent);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
            }
        }
        .lv-settings-nav-chip {
            display: inline-flex;
            align-items: center;
            gap: calc(var(--lv-space-unit) * 2);
            height: 28px;
            padding: 0 calc(var(--lv-space-unit) * 5);
            border-radius: var(--lv-r-pill);
            background: color-mix(in srgb, var(--lv-color-text) 5%, transparent);
            border: 1px solid var(--lv-border);
            color: var(--lv-color-text-muted);
            font-size: var(--lv-type-meta-size);
            font-weight: var(--lv-fw-medium);
            cursor: pointer;
            user-select: none;
            -webkit-user-select: none;
            touch-action: manipulation;
            transition: all var(--lv-dur-1) var(--lv-ease);

            &:hover {
                color: var(--lv-color-brand);
                border-color: var(--lv-primary-border);
                background: var(--lv-primary-soft);
                transform: translateY(-1px);
            }
            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }
        }
        .b3-button {
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }
        }
        .lv-searchbar {
            position: relative;
            display: flex;
            align-items: center;
            margin-bottom: var(--lv-sp-2);
            .lv-searchbar-icon {
                position: absolute;
                left: 14px;
                color: var(--lv-color-text-muted);
                pointer-events: none;
                display: flex;
                align-items: center;
            }
            .b3-text-field {
                border-radius: var(--lv-r-pill);
                padding: calc(var(--lv-space-unit) * 4) calc(var(--lv-space-unit) * 8) calc(var(--lv-space-unit) * 4) 36px;
                box-shadow: var(--lv-shadow-1);
                transition: border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-2) var(--lv-ease);
                &:focus {
                    border-color: var(--lv-color-brand);
                    box-shadow: var(--lv-focus-ring);
                }
            }
            .lv-searchbar-clear {
                position: absolute;
                right: 8px;
                padding: 4px;
                color: var(--lv-color-text-muted);
            }
        }
        .lv-search-summary {
            margin: 0 0 var(--lv-sp-3) 8px;
        }
        .lv-import-scope { display: flex; flex-wrap: wrap; align-items: center; gap: var(--lv-sp-2); }
        .lv-import-scope > span { flex: 1 1 220px; }
        :global(.lv-row2-control) { min-width: 0; flex-wrap: wrap; }
        :global(input) { max-width: 100%; min-width: 0; box-sizing: border-box; }

        .lv-storage {
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-m);
            background: var(--lv-color-surface);
            box-shadow: var(--lv-shadow-1), var(--lv-inset-shine);
            padding: var(--lv-sp-3);
            .lv-st-head, .lv-st-row { gap: var(--lv-sp-3); align-items: center; padding: calc(var(--lv-space-unit) * 1) 0; }
            .lv-st-head { border-bottom: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent); padding-bottom: var(--lv-sp-1); font-weight: var(--lv-fw-semibold); }
            .lv-lw { margin-left: var(--lv-sp-3); font-variant-numeric: tabular-nums; }
        }

        .lv-personas { gap: var(--lv-sp-2); }
        .lv-persona {
            flex: 1 1 130px;
            padding: var(--lv-sp-3);
            cursor: pointer;
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;
            border: 1px solid var(--lv-border);
            background: var(--lv-color-surface);
            text-align: left;
            border-radius: var(--lv-r-m);
            box-shadow: var(--lv-shadow-1), var(--lv-inset-shine);
            transition: border-color var(--lv-dur-2) var(--lv-ease),
                transform var(--lv-dur-2) var(--lv-ease),
                box-shadow var(--lv-dur-2) var(--lv-ease);

            &:hover {
                transform: translateY(-2px);
                box-shadow: var(--lv-shadow-2), var(--lv-inset-shine);
                border-color: var(--lv-border-strong);
            }

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }

            &.lv-persona--custom {
                cursor: default;
                &:hover {
                    transform: none;
                    box-shadow: var(--lv-shadow-1), var(--lv-inset-shine);
                    border-color: var(--lv-border);
                }
            }
        }
        .lv-persona-active {
            border-color: var(--lv-color-brand);
            background: var(--lv-primary-soft);
            box-shadow: 0 0 0 1px var(--lv-color-brand), var(--lv-shadow-card);
        }
        .lv-persona-name { font-weight: var(--lv-fw-semibold); margin-bottom: 2px; text-wrap: balance; }

        @media (max-width: 680px) {
            padding: var(--lv-sp-3);
            max-width: 100%;

            .lv-settings-nav-rail {
                flex-wrap: nowrap;
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
                scrollbar-width: none;
                margin: calc(var(--lv-sp-3) * -1) calc(var(--lv-sp-3) * -1) var(--lv-sp-3);
                padding: var(--lv-sp-2) var(--lv-sp-3);
                &::-webkit-scrollbar {
                    display: none;
                }
            }
            .lv-settings-nav-chip {
                flex: 0 0 auto;
                white-space: nowrap;
                height: 32px;
            }
            .lv-settings-sticky-footer {
                margin: var(--lv-sp-3) calc(var(--lv-sp-3) * -1) calc(var(--lv-sp-3) * -1);
                padding: var(--lv-sp-2) var(--lv-sp-3) max(var(--lv-sp-2), env(safe-area-inset-bottom, 0px));
                flex-wrap: wrap;
            }
        }
    }
</style>
