<script lang="ts">
    // BI-25 维护债务队列（Hub 懒加载子页）：卡面无效/重复/泄漏/过长/待审核只读诊断。
    // 「暂缓今日」=今日不学（可逆，次日恢复，不改变 due 语义）；「打开来源」回原文档。
    import { onDestroy, onMount } from "svelte";
    import LvPage from "./kit/LvPage.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import LvSkeleton from "./kit/LvSkeleton.svelte";
    import LvEmpty from "./kit/LvEmpty.svelte";
    import LvError from "./kit/LvError.svelte";
    import LvIcon from "./kit/LvIcon.svelte";
    import { groupDebts, detectDebts, DEBT_KINDS, type DebtItem, type DebtKind } from "@/core/maintenance-queue";
    import { diffLines } from "@/core/line-diff";
    import type { SourceHealthHistoryItem } from "@/core/source-health-store";
    import MisconceptionPanel from "./misconception-panel.svelte";
    import type { MisconceptionCluster } from "@/core/misconception-cluster";
    import { proposeLegacyCardUpgrades } from "@/core/delimited-qa";

    let {
        i18n,
        maintenance,
    }: {
        i18n: any;
        maintenance: {
            scan: () => Promise<{
                items: { blockID: string; md: string; baselineMarkdown?: string; memo?: string; state?: string; rootID?: string; occlusion?: boolean; exists?: boolean; mediaRefs?: string[]; mediaBroken?: string[]; mediaUnknown?: string[]; sourceHealthIssues?: { kind: string; detail: string }[] }[];
                sourceHealthHistory?: SourceHealthHistoryItem[];
                approximateDuplicates?: { blockIDs: [string, string]; similarity: number; method: "containment" | "ngram" }[];
                error?: string;
            }>;
            previewRepair: (proposals: { blockID: string; afterMarkdown: string; expectedMarkdown?: string; reason?: string }[]) => Promise<{
                previewID: string;
                ok: boolean;
                errors: string[];
                diffs: { blockID: string; action: string; beforeMarkdown?: string; afterMarkdown?: string; errors?: string[] }[];
                summary: { update: number; unchanged: number; rejected: number };
            }>;
            applyRepair: (previewID: string) => Promise<{ blockIDs: string[] }>;
            getLastRepairRecord?: () => {
                previewID: string;
                appliedAt: number;
                summary: { update: number; unchanged: number; rejected: number };
                diffs: { blockID: string; action: string; beforeMarkdown?: string; afterMarkdown?: string; errors?: string[] }[];
            } | null;
            rollbackLastRepair?: () => Promise<{ blockIDs: string[]; previewID: string }>;
            /** Explicitly accept the current source and move its fingerprint baseline. */
            acknowledgeSourceHealth?: (blockID: string) => Promise<void>;
            suspendToday: (blockIDs: string[]) => Promise<void>;
            unsuspendToday: (blockIDs: string[]) => Promise<void>;
            isSuspendedToday: (blockID: string) => boolean;
            openSource: (blockID: string) => Promise<void>;
            openCard: (blockID: string) => void;
            openDynamicBoardDoc?: () => void | Promise<void>;
            getMisconceptionClusters?: () => Promise<MisconceptionCluster[]>;
        };
    } = $props();

    const t = $derived(i18n.maintenance);

    let scanning = $state(true);
    let scanSeq = 0;
    let errorMsg = $state("");
    let groups = $state<Record<DebtKind, DebtItem[]>>(groupDebts([]));
    let excerpts = $state<Map<string, string>>(new Map());
    let cardMap = $state<Map<string, { md: string; baselineMarkdown?: string; memo?: string; rootID?: string; mediaRefs?: string[]; mediaBroken?: string[]; mediaUnknown?: string[]; sourceHealthIssues?: { kind: string; detail: string }[] }>>(new Map());
    let sourceHistories = $state<SourceHealthHistoryItem[]>([]);
    let historyExpanded = $state(false);
    let historyLimits = $state<Record<string, number>>({});
    let approximateDuplicates = $state<{ blockIDs: [string, string]; similarity: number; method: "containment" | "ngram" }[]>([]);
    type SimilarDecision = { action: "keep"; blockID: string } | { action: "ignore" };
    const SIMILAR_DECISIONS_KEY = "lv-cards.maintenance.approximate-duplicates.v1";
    let similarDecisions = $state<Record<string, SimilarDecision>>({});
    let misconceptionClusters = $state<MisconceptionCluster[]>([]);

    type LastRepair = NonNullable<ReturnType<NonNullable<typeof maintenance.getLastRepairRecord>>>;
    let lastRepair = $state<LastRepair | null>(null);
    let lastRepairDiffOpen = $state(false);
    let rollbackBusy = $state(false);
    let rollbackError = $state("");
    let rollbackSuccess = $state("");

    function refreshLastRepair() {
        lastRepair = maintenance.getLastRepairRecord?.() ?? null;
    }
    let suspended = $state<Set<string>>(new Set());
    let live = $state("");
    type SuspendAction = { type: "suspend" | "resume"; ids: string[]; message: string; group?: DebtKind };
    let pendingAction = $state<SuspendAction | null>(null);
    let failedAction = $state<SuspendAction | null>(null);
    let actionError = $state("");
    let sourcePendingId = $state("");
    let sourceError = $state("");
    let sourceErrorId = $state("");
    let sourceHealthPendingId = $state("");
    let sourceHealthError = $state("");
    let sourceHealthErrorId = $state("");
    type RepairPreview = {
        previewID: string;
        ok: boolean;
        errors: string[];
        diffs: { blockID: string; action: string; beforeMarkdown?: string; afterMarkdown?: string; errors?: string[] }[];
        summary: { update: number; unchanged: number; rejected: number };
    };
    let repairDrafts = $state<Record<string, string>>({});
    let repairPreview = $state<RepairPreview | null>(null);
    let repairBusy = $state(false);
    let repairError = $state("");
    const repairableKinds = new Set<DebtKind>(["invalidCard", "leak", "tooLong", "sourceHealth"]);
    const repairText = (key: string, fallback: string): string => t[key] ?? fallback;

    function healthKindLabel(kind: string): string {
        return t.sourceHealthKinds?.[kind] ?? kind;
    }

    function healthDate(at?: number): { iso: string; text: string } | null {
        if (typeof at !== "number" || !Number.isFinite(at)) return null;
        const date = new Date(at);
        if (!Number.isFinite(date.getTime())) return null;
        return { iso: date.toISOString(), text: date.toLocaleString() };
    }

    function historySummary(records: SourceHealthHistoryItem["records"]): string {
        const unresolved = records.filter(record => !record.resolved).length;
        return t.sourceHealthHistoryCount.replace("${open}", String(unresolved)).replace("${resolved}", String(records.length - unresolved));
    }

    function lastHealthEvent(source: SourceHealthHistoryItem): number {
        return source.records.reduce((latest, record) => Math.max(latest, record.at, record.resolvedAt ?? record.at), 0);
    }

    function excerpt(md: string): string {
        const text = (md ?? "").replace(/==([^=]*)==/g, "$1").replace(/\s+/g, " ").trim();
        return text.length > 60 ? `${text.slice(0, 60)}…` : text;
    }

    /**
     * Keep the decision attached to the pair's IDs rather than its scan order.
     * A later scan can return the same pair in the opposite order.
     */
    function similarPairKey(blockIDs: readonly [string, string]): string {
        return [...blockIDs].map(String).sort().join("\u001f");
    }

    function loadSimilarDecisions() {
        try {
            const raw = window.localStorage.getItem(SIMILAR_DECISIONS_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as unknown;
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
            const next: Record<string, SimilarDecision> = {};
            for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
                if (!value || typeof value !== "object" || Array.isArray(value)) continue;
                const item = value as Record<string, unknown>;
                if (item.action === "ignore") next[key] = { action: "ignore" };
                else if (item.action === "keep" && typeof item.blockID === "string" && item.blockID) {
                    next[key] = { action: "keep", blockID: item.blockID };
                }
            }
            similarDecisions = next;
        } catch {
            // Private mode or a blocked storage API should never stop the scan.
        }
    }

    function persistSimilarDecisions() {
        try {
            window.localStorage.setItem(SIMILAR_DECISIONS_KEY, JSON.stringify(similarDecisions));
        } catch {
            // Decisions are advisory UI state; an unavailable local store is safe.
        }
    }

    function decideSimilar(candidate: { blockIDs: [string, string] }, decision: SimilarDecision) {
        const key = similarPairKey(candidate.blockIDs);
        similarDecisions = { ...similarDecisions, [key]: decision };
        persistSimilarDecisions();
        live = decision.action === "ignore" ? t.decisionIgnored : t.decisionKept;
    }

    function decisionFor(candidate: { blockIDs: [string, string] }): SimilarDecision | undefined {
        return similarDecisions[similarPairKey(candidate.blockIDs)];
    }

    function addRepairDraft(blockID: string, initialMd?: string) {
        const card = cardMap.get(blockID);
        if (!card) return;
        repairDrafts = { ...repairDrafts, [blockID]: initialMd ?? card.md };
        repairPreview = null;
        repairError = "";
    }

    function updateRepairDraft(blockID: string, value: string) {
        repairDrafts = { ...repairDrafts, [blockID]: value };
        repairPreview = null;
        repairError = "";
    }

    function removeRepairDraft(blockID: string) {
        const next = { ...repairDrafts };
        delete next[blockID];
        repairDrafts = next;
        repairPreview = null;
        repairError = "";
    }

    async function previewRepairs() {
        if (repairBusy || rollbackBusy || scanning || sourceHealthPendingId) return;
        const proposals = Object.entries(repairDrafts).map(([blockID, afterMarkdown]) => ({
            blockID,
            afterMarkdown,
            expectedMarkdown: cardMap.get(blockID)?.md,
            reason: "maintenance-manual-repair",
        }));
        if (proposals.length === 0) return;
        repairBusy = true;
        repairError = "";
        try {
            repairPreview = await maintenance.previewRepair(proposals);
        } catch (e) {
            repairPreview = null;
            repairError = e instanceof Error ? e.message : String(e);
        } finally {
            repairBusy = false;
        }
    }

    async function rollbackRepair() {
        if (rollbackBusy || repairBusy || scanning || sourceHealthPendingId || !lastRepair || !maintenance.rollbackLastRepair) return;
        const confirmText = repairText("rollbackConfirm", "确定撤销上次批量修复？卡片将恢复为修复前快照；若某张卡片已发生后续编辑，将自动阻断以保护最新内容。");
        if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(confirmText)) return;
        rollbackBusy = true;
        rollbackError = "";
        rollbackSuccess = "";
        try {
            await maintenance.rollbackLastRepair();
            rollbackSuccess = repairText("rollbackSuccess", "已成功撤销上次批量修复，卡片已恢复为修复前快照。");
            live = rollbackSuccess;
            repairPreview = null;
            refreshLastRepair();
            await runScan();
        } catch (e) {
            rollbackError = e instanceof Error ? e.message : String(e);
        } finally {
            rollbackBusy = false;
        }
    }

    async function applyRepairs() {
        if (repairBusy || rollbackBusy || scanning || sourceHealthPendingId || !repairPreview?.ok) return;
        const confirmText = repairText("repairConfirm", "将写入 ${n} 张卡片并保留修复前快照，确定继续吗？")
            .replace("${n}", String(repairPreview.summary.update));
        if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(confirmText)) return;
        repairBusy = true;
        repairError = "";
        try {
            await maintenance.applyRepair(repairPreview.previewID);
            live = repairText("repairDone", "批量修复已完成");
            repairDrafts = {};
            repairPreview = null;
            refreshLastRepair();
            await runScan();
        } catch (e) {
            repairError = e instanceof Error ? e.message : String(e);
        } finally {
            repairBusy = false;
        }
    }

    async function runScan() {
        const seq = ++scanSeq;
        scanning = true;
        repairPreview = null;
        errorMsg = "";
        try {
            const result = await maintenance.scan();
            if (seq !== scanSeq) return;
            const scannedCards = result.items;
            groups = groupDebts(detectDebts(scannedCards));
            excerpts = new Map(scannedCards.map(c => [c.blockID, excerpt(c.md)]));
            cardMap = new Map(scannedCards.map(c => [c.blockID, { md: c.md, baselineMarkdown: c.baselineMarkdown, memo: (c as any).memo, rootID: c.rootID, mediaRefs: c.mediaRefs, mediaBroken: c.mediaBroken, mediaUnknown: c.mediaUnknown, sourceHealthIssues: c.sourceHealthIssues }]));
            sourceHistories = [...(result.sourceHealthHistory ?? [])].sort((left, right) => lastHealthEvent(right) - lastHealthEvent(left));
            approximateDuplicates = result.approximateDuplicates ?? [];
            suspended = new Set(scannedCards.filter(c => maintenance.isSuspendedToday(c.blockID)).map(c => c.blockID));
            errorMsg = result.error ? i18n.scanPartial.replace("${error}", result.error) : "";
            if (maintenance.getMisconceptionClusters) {
                try {
                    misconceptionClusters = await maintenance.getMisconceptionClusters();
                } catch {
                    misconceptionClusters = [];
                }
            }
            live = t.scanned;
        } catch (e: any) {
            if (seq === scanSeq) errorMsg = e?.message ?? String(e);
        } finally {
            if (seq === scanSeq) scanning = false;
        }
    }

    async function runSuspendAction(action: SuspendAction) {
        if (pendingAction) return;
        pendingAction = action;
        actionError = "";
        try {
            if (action.type === "suspend") await maintenance.suspendToday(action.ids);
            else await maintenance.unsuspendToday(action.ids);
            const next = new Set(suspended);
            for (const id of action.ids) {
                if (action.type === "suspend") next.add(id);
                else next.delete(id);
            }
            suspended = next;
            live = action.message;
            failedAction = null;
        } catch (e) {
            failedAction = action;
            const detail = e instanceof Error ? e.message : String(e);
            actionError = t.actionFailed.replace("${error}", detail);
        } finally {
            pendingAction = null;
        }
    }

    function retryAction() {
        if (failedAction) void runSuspendAction(failedAction);
    }

    function suspendOne(id: string) {
        void runSuspendAction({ type: "suspend", ids: [id], message: t.suspendedToday });
    }

    function suspendGroup(kind: DebtKind) {
        const ids = groups[kind].map(d => d.blockID);
        if (ids.length === 0) return;
        void runSuspendAction({ type: "suspend", ids, group: kind, message: t.suspendedGroup.replace("${n}", String(ids.length)) });
    }

    function resumeOne(id: string) {
        void runSuspendAction({ type: "resume", ids: [id], message: t.resumedToday });
    }

    function resumeGroup(kind: DebtKind) {
        const ids = groups[kind].map(d => d.blockID).filter(id => suspended.has(id));
        if (ids.length === 0) return;
        void runSuspendAction({ type: "resume", ids, group: kind, message: t.resumedGroup.replace("${n}", String(ids.length)) });
    }

    const allDebtBlockIds = $derived.by(() => {
        const set = new Set<string>();
        for (const k of DEBT_KINDS) {
            for (const item of groups[k]) {
                set.add(item.blockID);
            }
        }
        return Array.from(set);
    });

    const unSuspendedDebtCount = $derived(
        allDebtBlockIds.filter(id => !suspended.has(id)).length
    );

    function suspendAllDebts() {
        const ids = allDebtBlockIds.filter(id => !suspended.has(id));
        if (ids.length === 0) return;
        void runSuspendAction({
            type: "suspend",
            ids,
            message: `已批量暂挂 ${ids.length} 张体检异常卡片（今日不学）`,
        });
    }

    function resumeAllDebts() {
        const ids = allDebtBlockIds.filter(id => suspended.has(id));
        if (ids.length === 0) return;
        void runSuspendAction({
            type: "resume",
            ids,
            message: `已批量恢复 ${ids.length} 张体检异常卡片`,
        });
    }

    function actionIsPending(type: SuspendAction["type"], id: string): boolean {
        return pendingAction?.type === type && pendingAction.ids.includes(id);
    }

    function groupIsPending(type: SuspendAction["type"], kind: DebtKind): boolean {
        return pendingAction?.type === type && pendingAction.group === kind;
    }

    async function openSource(blockID: string) {
        if (sourcePendingId) return;
        sourcePendingId = blockID;
        sourceError = "";
        sourceErrorId = "";
        try {
            await maintenance.openSource(blockID);
        } catch (e) {
            const detail = e instanceof Error ? e.message : String(e);
            sourceError = t.openFailed.replace("${error}", detail);
            sourceErrorId = blockID;
        } finally {
            sourcePendingId = "";
        }
    }

    async function acknowledgeSource(blockID: string) {
        const acknowledge = maintenance.acknowledgeSourceHealth;
        if (!acknowledge || sourceHealthPendingId || repairBusy || rollbackBusy || scanning) return;
        const confirmText = repairText("sourceHealthConfirm", "确认当前来源内容，并将它设为新的健康基线吗？");
        if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(confirmText)) return;
        sourceHealthPendingId = blockID;
        sourceHealthError = "";
        sourceHealthErrorId = "";
        try {
            await acknowledge(blockID);
            await runScan();
            historyExpanded = true;
            live = repairText("sourceHealthUpdated", "来源健康基线已更新");
        } catch (e) {
            const detail = e instanceof Error ? e.message : String(e);
            sourceHealthError = repairText("sourceHealthUpdateFailed", "更新来源健康基线失败：${error}").replace("${error}", detail);
            sourceHealthErrorId = blockID;
        } finally {
            sourceHealthPendingId = "";
        }
    }

    let legacyUpgradeStatus = $state("");
    async function upgradeLegacyCards() {
        if (repairBusy || rollbackBusy || scanning) return;

        // 转化卡片前严肃警示用户：完全可以不转换，原笔记直接兼容复习
        const warnText = [
            "【重要提示：您可以不进行任何转换】",
            "小驴闪卡已经完全支持直接复习思源原生闪卡、块备注及第三方插件语法（::、Q/A），在不转换的情况下也能直接正常复习！",
            "",
            "如果您希望保留笔记原本的纯净格式与排版习惯，请直接点击【取消】，无需修改任何笔记。",
            "",
            "若点击【确定】，插件将仅为您生成可审计的修改预览，在您后续二次核对并明确点击“确认写入”前，绝不会修改您的任何笔记。确定要生成预览吗？",
        ].join("\n");
        if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(warnText)) return;

        legacyUpgradeStatus = "";
        const candidates: Array<{ blockID: string; md: string; memo?: string }> = [];
        for (const [id, c] of cardMap.entries()) {
            candidates.push({ blockID: id, md: c.md, memo: (c as any).memo });
        }
        const proposals = proposeLegacyCardUpgrades(candidates);
        if (proposals.length === 0) {
            legacyUpgradeStatus = "未发现待规范化的存量卡片（所有闪卡均已符合标准挖空格式）";
            return;
        }
        legacyUpgradeStatus = `已找到 ${proposals.length} 张可规范化的存量闪卡，正在生成修复差异预览（核对无误前不会写入笔记）…`;
        for (const p of proposals) {
            repairDrafts[p.blockID] = p.afterMarkdown;
        }
        await previewRepairs();
    }

    function total(): number {
        return DEBT_KINDS.reduce((sum, k) => sum + groups[k].length, 0);
    }

    onMount(() => {
        refreshLastRepair();
        loadSimilarDecisions();
        void runScan();
    });
    onDestroy(() => { scanSeq += 1; });

    function onKeydown(e: KeyboardEvent) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
        if (e.key === "r" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (!scanning && !pendingAction && !sourceHealthPendingId && !repairBusy && !rollbackBusy) {
                e.preventDefault();
                void runScan();
            }
        }
    }
</script>

<svelte:window on:keydown={onKeydown} />

<LvPage eyebrow="WORKSPACE / RECOVER" title={t.title} subtitle={t.queueCount.replace("${n}", String(total()))}>
    {#snippet actions()}
        <button
            type="button"
            class="b3-button b3-button--small b3-button--outline lv-btn-tool"
            disabled={scanning || !!pendingAction || !!sourceHealthPendingId || repairBusy || rollbackBusy}
            title={t.dynamicBoardDocTip ?? "在思源笔记中打开实时 SQL 动态错题看板"}
            onclick={() => maintenance.openDynamicBoardDoc?.()}
        >
            <LvIcon name="book" size={13} /> <span>{t.dynamicBoardDocBtn ?? "动态错题看板"}</span>
        </button>
        {#if allDebtBlockIds.length > 0}
            {#if unSuspendedDebtCount > 0}
                <button
                    type="button"
                    class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                    disabled={scanning || !!pendingAction || !!sourceHealthPendingId || repairBusy || rollbackBusy}
                    title="一键将排查出的所有体检坏卡暂挂至今日不学，保护日常复习心流"
                    onclick={suspendAllDebts}
                >
                    <LvIcon name="ban" size={13} />
                    <span>批量暂挂坏卡 ({unSuspendedDebtCount})</span>
                </button>
            {:else}
                <button
                    type="button"
                    class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                    disabled={scanning || !!pendingAction || !!sourceHealthPendingId || repairBusy || rollbackBusy}
                    title="恢复所有已暂挂的体检坏卡"
                    onclick={resumeAllDebts}
                >
                    <LvIcon name="check" size={13} />
                    <span>已全部暂挂 (恢复)</span>
                </button>
            {/if}
        {/if}
        <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" disabled={scanning || !!pendingAction || !!sourceHealthPendingId || repairBusy || rollbackBusy} onclick={upgradeLegacyCards}>
            <LvIcon name="zap" size={13} /> <span>存量格式规范化 (可选)</span>
        </button>
        <button
            class="b3-button b3-button--small lv-btn-primary"
            disabled={scanning || !!pendingAction || !!sourceHealthPendingId || repairBusy || rollbackBusy}
            aria-keyshortcuts="r"
            title={`${scanning ? t.scanning : t.scan} (r)`}
            onclick={runScan}
        >
            <LvIcon name="refresh" size={13} /> <span>{scanning ? t.scanning : t.scan}</span>
        </button>
    {/snippet}

    {#if legacyUpgradeStatus}
        <div class="lv-notice lv-notice--good" role="status" style="margin-bottom: var(--lv-sp-2)">
            {legacyUpgradeStatus}
        </div>
    {/if}

    <div class="lv-notice" style="margin-bottom: var(--lv-sp-3); display: flex; align-items: center; gap: 8px">
        <LvIcon name="lightbulb" size={16} />
        <span><strong>无损兼容保障</strong>：小驴闪卡已全面支持直接复习思源原生闪卡、块备注及第三方插件语法（::、Q/A），<strong>无需修改原笔记即可直接复习</strong>。</span>
    </div>

    <div class="lv-maint-note ft__smaller ft__on-surface">{t.impactNote}</div>

    {#if Object.keys(repairDrafts).length > 0}
        <section class="lv-card2 lv-maint-repair" aria-labelledby="lv-maint-repair-title">
            <div class="lv-maint-group-head">
                <LvChip tone="warn">{repairText("repairTitle", "批量修复草稿")}</LvChip>
                <span id="lv-maint-repair-title" class="ft__smaller ft__on-surface">{repairText("repairNote", "先编辑并预览，确认后才会写入来源块。")}</span>
            </div>
            {#each Object.entries(repairDrafts) as [blockID, draft] (blockID)}
                <div class="lv-maint-repair-draft">
                    <div class="lv-maint-repair-draft-head"><code>{blockID}</code><button class="b3-button b3-button--small" disabled={repairBusy} onclick={() => removeRepairDraft(blockID)}>{repairText("repairRemove", "移除")}</button></div>
                    <textarea class="b3-text-field fn__block" rows="4" value={draft} disabled={repairBusy || rollbackBusy || scanning} aria-label={`${repairText("repairDraft", "修复内容")} ${blockID}`} oninput={(event) => updateRepairDraft(blockID, (event.currentTarget as HTMLTextAreaElement).value)}></textarea>
                </div>
            {/each}
            {#if repairError}<div class="lv-maint-repair-error" role="alert" aria-live="assertive">{repairError}</div>{/if}
            {#if repairPreview}
                <div class="lv-maint-repair-preview" role="status">
                    <strong>{repairText("repairPreview", "预览结果")}</strong>
                    <span>{repairText("repairSummary", "将更新 ${u} 张，保持 ${n} 张，拒绝 ${r} 张")
                        .replace("${u}", String(repairPreview.summary.update)).replace("${n}", String(repairPreview.summary.unchanged)).replace("${r}", String(repairPreview.summary.rejected))}</span>
                    {#if repairPreview.errors.length > 0}<div class="lv-maint-repair-error">{repairPreview.errors.join("；")}</div>{/if}
                    {#each repairPreview.diffs as diff (diff.blockID)}
                        <details class="lv-maint-repair-diff">
                            <summary>{diff.blockID} · {diff.action}</summary>
                            {#if diff.beforeMarkdown !== undefined}<pre><strong>{repairText("repairBefore", "修复前")}</strong>
{diff.beforeMarkdown}</pre>{/if}
                            {#if diff.afterMarkdown !== undefined}<pre><strong>{repairText("repairAfter", "修复后")}</strong>
{diff.afterMarkdown}</pre>{/if}
                        </details>
                    {/each}
                </div>
            {/if}
            <div class="lv-maint-repair-actions">
                <button class="b3-button b3-button--outline lv-btn-tool" disabled={repairBusy || rollbackBusy || scanning || !!sourceHealthPendingId} aria-busy={repairBusy} onclick={previewRepairs}>
                    <LvIcon name="eye" size={13} />
                    <span>{repairBusy ? t.saving : repairText("repairPreviewBtn", "生成预览")}</span>
                </button>
                {#if repairPreview?.ok}
                    <button class="b3-button lv-btn-primary lv-btn-tool" disabled={repairBusy || rollbackBusy || scanning || !!sourceHealthPendingId} onclick={applyRepairs}>
                        <LvIcon name="check" size={13} />
                        <span>{repairText("repairApply", "确认写入")}</span>
                    </button>
                {/if}
            </div>
        </section>
    {/if}

    {#if lastRepair}
        <section class="lv-card2 lv-maint-repair" aria-labelledby="lv-maint-last-repair-title" style="margin-bottom: var(--lv-sp-4);">
            <div class="lv-maint-repair-draft-head">
                <div>
                    <h3 id="lv-maint-last-repair-title" style="margin: 0; font-size: 15px; font-weight: var(--lv-fw-semibold);">{repairText("lastRepairTitle", "上次批量修复记录")}</h3>
                    <span class="ft__smaller ft__on-surface" style="margin-top: calc(var(--lv-space-unit) * 2); display: block; font-variant-numeric: tabular-nums;">
                        {repairText("lastRepairApplied", "已更新 ${n} 张卡片 · ${time}").replace("${n}", String(lastRepair.summary.update)).replace("${time}", new Date(lastRepair.appliedAt).toLocaleString())}
                    </span>
                </div>
                <div style="display: flex; gap: var(--lv-sp-2); align-items: center; flex-wrap: wrap;">
                    <button class="b3-button b3-button--small lv-btn-ghost lv-btn-tool" onclick={() => (lastRepairDiffOpen = !lastRepairDiffOpen)}>
                        <LvIcon name="eye" size={12} />
                        <span>{lastRepairDiffOpen ? repairText("lastRepairHideDiff", "收起差异") : repairText("lastRepairViewDiff", "查看修改差异")}</span>
                    </button>
                    <button class="b3-button b3-button--small lv-btn-primary lv-btn-tool" disabled={rollbackBusy || repairBusy || scanning || !!sourceHealthPendingId} aria-busy={rollbackBusy} onclick={rollbackRepair}>
                        <LvIcon name="refresh" size={12} />
                        <span>{rollbackBusy ? repairText("rollbackRepairBusy", "正在撤销…") : repairText("rollbackRepairBtn", "撤销此次修复")}</span>
                    </button>
                </div>
            </div>
            {#if rollbackError}
                <div class="lv-maint-repair-error" role="alert" aria-live="assertive" style="margin-top: var(--lv-sp-2);">{rollbackError}</div>
            {/if}
            {#if lastRepairDiffOpen}
                <div class="lv-maint-repair-preview" style="margin-top: var(--lv-sp-3);">
                    {#each lastRepair.diffs as diff (diff.blockID)}
                        <div class="lv-maint-repair-diff">
                            <span class="ft__smaller ft__on-surface">ID {diff.blockID}</span>
                            <pre>{diff.beforeMarkdown !== undefined ? `【修复前】\n${diff.beforeMarkdown}\n\n` : ""}【修复后】\n{diff.afterMarkdown ?? ""}</pre>
                        </div>
                    {/each}
                </div>
            {/if}
        </section>
    {/if}
    {#if rollbackSuccess}
        <div class="lv-notice" role="status" style="color: var(--lv-color-success); margin-bottom: var(--lv-sp-4);">{rollbackSuccess}</div>
    {/if}

    {#if scanning}
        <div class="lv-maint-list">
            {#each [0, 1, 2] as i (i)}
                <LvSkeleton height={48} />
            {/each}
        </div>
    {:else}
        {#if actionError}<LvError message={actionError} onretry={failedAction && !pendingAction ? retryAction : undefined} retryLabel={t.retry} />{/if}
        {#if errorMsg}<LvError message={errorMsg} onretry={runScan} retryLabel={i18n.dashboard.refresh} />{/if}
        {#if sourceError}<LvError message={sourceError} onretry={sourceErrorId && !sourcePendingId ? () => openSource(sourceErrorId) : undefined} retryLabel={t.retry} />{/if}
        {#if sourceHealthError}<LvError message={sourceHealthError} onretry={sourceHealthErrorId && !sourceHealthPendingId ? () => acknowledgeSource(sourceHealthErrorId) : undefined} retryLabel={t.retry} />{/if}
        {#if total() === 0 && !errorMsg}<LvEmpty text={t.none} />{/if}
        {#each DEBT_KINDS as kind (kind)}
            {#if groups[kind].length > 0}
                <div class="lv-maint-group">
                    <div class="lv-maint-group-head">
                        <LvChip tone={kind === "needsReview" ? "warn" : "error"}>{(t.kinds as Record<string, string>)[kind]} {groups[kind].length}</LvChip>
                        <div class="fn__flex-1"></div>
                        {#if groups[kind].length > 0 && groups[kind].every(d => suspended.has(d.blockID))}
                            <button class="b3-button b3-button--small lv-btn-tool" disabled={!!pendingAction} aria-busy={groupIsPending("resume", kind)} onclick={() => resumeGroup(kind)}>
                                <LvIcon name="refresh" size={12} />
                                <span>{groupIsPending("resume", kind) ? t.saving : t.resumeGroup}</span>
                            </button>
                        {:else}
                            <button class="b3-button b3-button--small lv-btn-tool" disabled={!!pendingAction} aria-busy={groupIsPending("suspend", kind)} onclick={() => suspendGroup(kind)}>
                                <LvIcon name="moon" size={12} />
                                <span>{groupIsPending("suspend", kind) ? t.saving : t.suspendGroup}</span>
                            </button>
                        {/if}
                    </div>
                    {#each groups[kind] as d (d.blockID + d.kind)}
                        <div class="lv-card2 lv-maint-row">
                            <div class="lv-maint-main">
                                <div class="lv-maint-excerpt">{excerpts.get(d.blockID) || d.blockID}</div>
                                {#if kind === "sourceHealth"}
                                    {@const healthCard = cardMap.get(d.blockID)}
                                    <ul class="lv-maint-health-issues ft__smaller ft__on-surface">
                                        {#each healthCard?.sourceHealthIssues ?? [] as issue (issue.kind)}
                                            <li>{healthKindLabel(issue.kind)}: {issue.kind === "changed" && healthCard?.baselineMarkdown ? "原块内容已变更（可展开下方并排对比或直接修卡）" : issue.detail}</li>
                                        {/each}
                                    </ul>
                                    {#if healthCard?.baselineMarkdown && healthCard.baselineMarkdown !== healthCard.md}
                                        <div class="lv-maint-source-diff" role="group" aria-label="来源变更并排对比">
                                            <div class="lv-maint-similar-cards">
                                                <article class="lv-maint-similar-card">
                                                    <header class="lv-maint-similar-card-head">
                                                        <strong>变更前基线</strong>
                                                    </header>
                                                    <pre class="lv-maint-similar-face">{healthCard.baselineMarkdown}</pre>
                                                </article>
                                                <article class="lv-maint-similar-card">
                                                    <header class="lv-maint-similar-card-head">
                                                        <strong>当前来源内容</strong>
                                                    </header>
                                                    <pre class="lv-maint-similar-face">{healthCard.md}</pre>
                                                </article>
                                            </div>
                                            <div class="lv-maint-inline-diff">
                                                {#each diffLines(healthCard.baselineMarkdown, healthCard.md) as row, ri (ri)}
                                                    <div class="lv-maint-diff-line lv-maint-diff-{row.kind}">{row.kind === "add" ? "+ " : row.kind === "del" ? "− " : "  "}{row.text}</div>
                                                {/each}
                                            </div>
                                            <div class="lv-maint-repair-actions" style="margin-top: 6px;">
                                                <button
                                                    type="button"
                                                    class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                                                    disabled={repairBusy}
                                                    onclick={() => addRepairDraft(d.blockID, healthCard.baselineMarkdown)}
                                                >
                                                    <LvIcon name="refresh" size={12} />
                                                    <span>用基线原文恢复草稿</span>
                                                </button>
                                            </div>
                                        </div>
                                    {/if}
                                {:else if d.detail}<div class="ft__smaller ft__on-surface">{kind === "invalidCard" ? (t.qualityReasons?.[d.detail] ?? d.detail) : d.detail}</div>{/if}
                                {#if cardMap.has(d.blockID)}
                                    {@const card = cardMap.get(d.blockID)!}
                                    <details class="lv-maint-preview">
                                        <summary>{t.preview}</summary>
                                        <div class="lv-maint-preview-face">{card.md || d.blockID}</div>
                                        {#if card.mediaRefs?.length}
                                            <div class="ft__smaller ft__on-surface">{t.mediaRefs}: {card.mediaRefs.join(", ")}</div>
                                        {/if}
                                        {#if card.mediaBroken?.length}
                                            <div class="ft__smaller lv-maint-media-broken">{t.mediaBroken}: {card.mediaBroken.join(", ")}</div>
                                        {/if}
                                        {#if card.mediaUnknown?.length}
                                            <div class="ft__smaller ft__on-surface">{t.mediaUnknown}: {card.mediaUnknown.join(", ")}</div>
                                        {/if}
                                        {#if card.rootID}
                                            <div class="ft__smaller ft__on-surface">{t.sourceBlock}: {card.rootID}</div>
                                        {/if}
                                    </details>
                                {/if}
                            </div>
                            {#if suspended.has(d.blockID)}
                                <button class="b3-button b3-button--small lv-btn-tool" disabled={!!pendingAction} aria-busy={actionIsPending("resume", d.blockID)} onclick={() => resumeOne(d.blockID)}>
                                    <LvIcon name="refresh" size={12} />
                                    <span>{actionIsPending("resume", d.blockID) ? t.saving : t.resumeTodayBtn}</span>
                                </button>
                                <LvChip>{t.suspendedToday}</LvChip>
                            {:else}
                                <button class="b3-button b3-button--small lv-btn-tool" disabled={!!pendingAction} aria-busy={actionIsPending("suspend", d.blockID)} onclick={() => suspendOne(d.blockID)}>
                                    <LvIcon name="moon" size={12} />
                                    <span>{actionIsPending("suspend", d.blockID) ? t.saving : t.suspendTodayBtn}</span>
                                </button>
                            {/if}
                            {#if repairableKinds.has(kind)}
                                <button class="b3-button b3-button--small lv-btn-tool" disabled={repairBusy || Object.prototype.hasOwnProperty.call(repairDrafts, d.blockID)} onclick={() => addRepairDraft(d.blockID)}>
                                    <LvIcon name="zap" size={12} />
                                    <span>{repairText("repairAdd", "加入修复")}</span>
                                </button>
                            {/if}
                            {#if kind === "sourceHealth" && maintenance.acknowledgeSourceHealth && cardMap.get(d.blockID)?.sourceHealthIssues?.some(issue => issue.kind === "moved" || issue.kind === "changed" || issue.kind === "license-changed")}
                                <button class="b3-button b3-button--small lv-btn-tool" disabled={!!sourceHealthPendingId || repairBusy || rollbackBusy} aria-busy={sourceHealthPendingId === d.blockID} onclick={() => acknowledgeSource(d.blockID)}>
                                    <LvIcon name="check" size={12} />
                                    <span>{sourceHealthPendingId === d.blockID ? repairText("sourceHealthUpdating", "更新中…") : repairText("sourceHealthAcknowledge", "确认当前来源")}</span>
                                </button>
                            {/if}
                            <button class="b3-button b3-button--small lv-btn-ghost lv-btn-tool" disabled={!!sourcePendingId} aria-busy={sourcePendingId === d.blockID} onclick={() => openSource(d.blockID)}>
                                <LvIcon name="eye" size={12} />
                                <span>{sourcePendingId === d.blockID ? t.opening : t.open}</span>
                            </button>
                            <button class="b3-button b3-button--small lv-btn-primary lv-btn-tool" onclick={() => maintenance.openCard(d.blockID)}>
                                <LvIcon name="edit" size={12} />
                                <span>{t.editCard}</span>
                            </button>
                        </div>
                    {/each}
                </div>
            {/if}
        {/each}
        {#if sourceHistories.length > 0}
            <details class="lv-card2 lv-maint-health-history" bind:open={historyExpanded}>
                <summary>{t.sourceHealthHistory} · {sourceHistories.length}</summary>
                {#if historyExpanded}
                    <p class="ft__smaller ft__on-surface">{t.sourceHealthHistoryNote}</p>
                    {#each sourceHistories as source (source.blockID)}
                        <details class="lv-maint-health-source">
                            <summary>
                                <span>{excerpts.get(source.blockID) || source.blockID}</span>
                                <span class="ft__smaller ft__on-surface">{historySummary(source.records)}</span>
                            </summary>
                            <code class="lv-maint-health-block">{source.blockID}</code>
                            {#if !cardMap.has(source.blockID)}<p class="ft__smaller ft__on-surface">{t.sourceHealthOutsideScan}</p>{/if}
                            <ol class="lv-maint-health-records">
                                {#each source.records.map((record, index) => ({ record, index })).slice(-(historyLimits[source.blockID] ?? 20)).reverse() as { record, index } (index)}
                                    {@const discovered = healthDate(record.at)}
                                    {@const resolved = healthDate(record.resolvedAt)}
                                    <li>
                                        <div class="lv-maint-health-record-head">
                                            <span class={record.resolved ? "lv-maint-health-resolved" : "lv-maint-health-open"}>{record.resolved ? t.sourceHealthResolved : t.sourceHealthOpen}</span>
                                            <strong>{healthKindLabel(record.kind)}</strong>
                                        </div>
                                        <div class="lv-maint-health-detail">{record.detail}</div>
                                        <div class="ft__smaller ft__on-surface">{t.sourceHealthDiscovered}: {#if discovered}<time datetime={discovered.iso}>{discovered.text}</time>{:else}{t.sourceHealthUnknownDate}{/if}</div>
                                        {#if record.resolved}
                                            <div class="ft__smaller ft__on-surface">{t.sourceHealthResolvedTime}: {#if resolved}<time datetime={resolved.iso}>{resolved.text}</time>{:else}{t.sourceHealthUnknownDate}{/if}</div>
                                        {/if}
                                    </li>
                                {/each}
                            </ol>
                            {#if source.records.length > (historyLimits[source.blockID] ?? 20)}
                                <button class="b3-button b3-button--small" onclick={() => { historyLimits = { ...historyLimits, [source.blockID]: (historyLimits[source.blockID] ?? 20) + 20 }; }}>{t.sourceHealthShowEarlier}</button>
                            {/if}
                            <div class="lv-maint-repair-actions">
                                <button class="b3-button b3-button--small" disabled={!!sourcePendingId} onclick={() => openSource(source.blockID)}>{t.open}</button>
                                {#if cardMap.has(source.blockID)}<button class="b3-button b3-button--small" onclick={() => maintenance.openCard(source.blockID)}>{t.editCard}</button>{/if}
                            </div>
                        </details>
                    {/each}
                {/if}
            </details>
        {/if}
        {#if approximateDuplicates.length > 0}
            <section class="lv-maint-group lv-maint-similar" aria-labelledby="lv-maint-similar-title">
                <div class="lv-maint-group-head">
                    <LvChip tone="warn">{t.approximateDuplicates} {approximateDuplicates.length}</LvChip>
                </div>
                <p id="lv-maint-similar-title" class="ft__smaller ft__on-surface">{t.approximateDuplicatesNote}</p>
                {#each approximateDuplicates as candidate (candidate.blockIDs.join(":"))}
                    {@const leftID = candidate.blockIDs[0]}
                    {@const rightID = candidate.blockIDs[1]}
                    {@const leftCard = cardMap.get(leftID)}
                    {@const rightCard = cardMap.get(rightID)}
                    {@const decision = decisionFor(candidate)}
                    <div class="lv-card2 lv-maint-similar-row">
                        <div class="lv-maint-main">
                            <div class="lv-maint-excerpt">{t.compareCards}</div>
                            <div class="ft__smaller ft__on-surface">{t.similarity}: {Math.round(candidate.similarity * 100)}% · {candidate.method === "containment" ? t.containment : t.ngram}</div>
                            <div class="lv-maint-similar-cards" role="group" aria-label={t.compareCards}>
                                <article class="lv-maint-similar-card">
                                    <header class="lv-maint-similar-card-head">
                                        <strong>{t.cardA}</strong>
                                        <code>{leftID}</code>
                                    </header>
                                    <pre class="lv-maint-similar-face">{leftCard?.md || leftID}</pre>
                                    {#if leftCard?.mediaRefs?.length}
                                        <div class="ft__smaller ft__on-surface">{t.mediaRefs}: {leftCard.mediaRefs.join(", ")}</div>
                                    {/if}
                                    {#if leftCard?.mediaBroken?.length}
                                        <div class="ft__smaller lv-maint-media-broken">{t.mediaBroken}: {leftCard.mediaBroken.join(", ")}</div>
                                    {/if}
                                </article>
                                <article class="lv-maint-similar-card">
                                    <header class="lv-maint-similar-card-head">
                                        <strong>{t.cardB}</strong>
                                        <code>{rightID}</code>
                                    </header>
                                    <pre class="lv-maint-similar-face">{rightCard?.md || rightID}</pre>
                                    {#if rightCard?.mediaRefs?.length}
                                        <div class="ft__smaller ft__on-surface">{t.mediaRefs}: {rightCard.mediaRefs.join(", ")}</div>
                                    {/if}
                                    {#if rightCard?.mediaBroken?.length}
                                        <div class="ft__smaller lv-maint-media-broken">{t.mediaBroken}: {rightCard.mediaBroken.join(", ")}</div>
                                    {/if}
                                </article>
                            </div>
                            {#if decision?.action === "keep"}
                                <LvChip tone="primary">{t.decisionKept}: {decision.blockID}</LvChip>
                            {:else if decision?.action === "ignore"}
                                <LvChip>{t.decisionIgnored}</LvChip>
                            {:else}
                                <LvChip tone="warn">{t.decisionPending}</LvChip>
                            {/if}
                        </div>
                        <div class="lv-maint-similar-actions">
                            <div class="lv-maint-similar-action-row">
                                <button class="b3-button b3-button--small" disabled={!!sourcePendingId} onclick={() => openSource(leftID)}>{t.open} · {t.cardA}</button>
                                <button class="b3-button b3-button--small" disabled={!!sourcePendingId} onclick={() => openSource(rightID)}>{t.open} · {t.cardB}</button>
                            </div>
                            <div class="lv-maint-similar-action-row">
                                <button class="b3-button b3-button--small" onclick={() => maintenance.openCard(leftID)}>{t.editCard} · {t.cardA}</button>
                                <button class="b3-button b3-button--small" onclick={() => maintenance.openCard(rightID)}>{t.editCard} · {t.cardB}</button>
                            </div>
                            <div class="lv-maint-similar-action-row">
                                <button class="b3-button b3-button--small" class:lv-maint-decision-active={decision?.action === "keep" && decision.blockID === leftID} onclick={() => decideSimilar(candidate, { action: "keep", blockID: leftID })}>{t.keepCard} · {t.cardA}</button>
                                <button class="b3-button b3-button--small" class:lv-maint-decision-active={decision?.action === "keep" && decision.blockID === rightID} onclick={() => decideSimilar(candidate, { action: "keep", blockID: rightID })}>{t.keepCard} · {t.cardB}</button>
                                <button class="b3-button b3-button--small" class:lv-maint-decision-active={decision?.action === "ignore"} onclick={() => decideSimilar(candidate, { action: "ignore" })}>{t.ignoreCandidate}</button>
                            </div>
                        </div>
                    </div>
                {/each}
            </section>
        {/if}
        <!-- BT-3 误解簇交互地图：阶段 A 裁决隐藏未接线无数据源空面板（docs/54 F2 TODO-03），仅当宿主注入数据源且存在真实聚类时展示 -->
        {#if maintenance.getMisconceptionClusters && misconceptionClusters.length > 0}
            <MisconceptionPanel
                clusters={misconceptionClusters}
                i18n={i18n}
                onOpenCard={(id) => maintenance.openCard(id)}
            />
        {/if}
    {/if}
</LvPage>

<!-- AS-4 读屏播报 -->
<div class="lv-visually-hidden" aria-live="polite">{live}</div>

<style>
    :global(.lv-pagehead-actions .b3-button),
    .lv-maint-row .b3-button,
    .lv-maint-similar-row .b3-button,
    .lv-maint-repair .b3-button {
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
    .lv-maint-note {
        margin-bottom: var(--lv-sp-3);
        max-width: 48em;
        text-wrap: pretty;
        line-height: var(--lv-lh-reading, 1.65);
    }
    .lv-maint-list { display: flex; flex-direction: column; gap: var(--lv-sp-2); }
    .lv-maint-group { margin-bottom: var(--lv-sp-4); }
    .lv-maint-group-head {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-2);
    }
    .lv-maint-row {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-2);
        padding: calc(var(--lv-space-unit) * 4) calc(var(--lv-space-unit) * 5);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        background: var(--lv-color-surface);
        box-shadow: var(--lv-shadow-card), var(--lv-inset-shine);
        content-visibility: auto;
        contain-intrinsic-size: 0 60px;
        transition: transform var(--lv-dur-2) var(--lv-ease),
            border-color var(--lv-dur-1) var(--lv-ease),
            box-shadow var(--lv-dur-2) var(--lv-ease);

        &:hover {
            transform: translateY(-2px);
            border-color: var(--lv-primary-border);
            box-shadow: var(--lv-shadow-card-hover), var(--lv-inset-shine);
        }
    }
    .lv-maint-main { flex: 1; min-width: 0; }
    .lv-maint-excerpt { font-size: var(--lv-type-body-size); overflow-wrap: anywhere; }
    .lv-maint-preview { margin-top: var(--lv-sp-1); }
    .lv-maint-preview summary { cursor: pointer; color: var(--lv-color-brand); font-size: var(--lv-type-caption-size); }
    .lv-maint-preview-face { margin-top: var(--lv-sp-1); padding: var(--lv-sp-2); border-radius: var(--lv-r-m); background: var(--lv-color-surface); white-space: pre-wrap; overflow-wrap: anywhere; max-width: 48em; text-wrap: pretty; }
    .lv-maint-media-broken { color: var(--lv-color-danger); overflow-wrap: anywhere; }
    .lv-maint-health-issues { margin: var(--lv-sp-1) 0 0; padding-left: var(--lv-sp-4); overflow-wrap: anywhere; }
    .lv-maint-source-diff { margin-top: var(--lv-sp-2); display: flex; flex-direction: column; gap: var(--lv-sp-2); }
    .lv-maint-inline-diff {
        padding: var(--lv-sp-2);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-s);
        background: var(--lv-color-canvas);
        font-family: var(--b3-font-family-code, monospace);
        font-size: var(--lv-type-caption-size);
        max-height: 160px;
        overflow: auto;
        white-space: pre-wrap;
    }
    .lv-maint-diff-add { color: var(--lv-color-success); background: color-mix(in srgb, var(--lv-color-success) 10%, transparent); }
    .lv-maint-diff-del { color: var(--lv-color-danger); background: color-mix(in srgb, var(--lv-color-danger) 10%, transparent); text-decoration: line-through; }
    .lv-maint-health-history { margin-bottom: var(--lv-sp-4); padding: var(--lv-sp-3); }
    .lv-maint-health-history summary { cursor: pointer; color: var(--lv-color-brand); font-size: var(--lv-type-caption-size); }
    .lv-maint-health-source { padding: var(--lv-sp-2) 0; border-top: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent); }
    .lv-maint-health-source summary { overflow-wrap: anywhere; }
    .lv-maint-health-source summary span + span { margin-left: var(--lv-sp-2); }
    .lv-maint-health-block { display: block; margin-top: var(--lv-sp-2); overflow-wrap: anywhere; }
    .lv-maint-health-records { margin: var(--lv-sp-2) 0; padding-left: var(--lv-sp-4); }
    .lv-maint-health-records li { padding: var(--lv-sp-2) 0; overflow-wrap: anywhere; }
    .lv-maint-health-record-head { display: flex; flex-wrap: wrap; gap: var(--lv-sp-2); }
    .lv-maint-health-detail { margin: var(--lv-sp-1) 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .lv-maint-health-open { color: var(--lv-color-danger); }
    .lv-maint-health-resolved { color: var(--lv-color-success); }
    .lv-maint-repair { margin-bottom: var(--lv-sp-4); }
    .lv-maint-repair-draft { margin-top: var(--lv-sp-2); }
    .lv-maint-repair-draft-head { display: flex; align-items: center; justify-content: space-between; gap: var(--lv-sp-2); margin-bottom: var(--lv-sp-1); }
    .lv-maint-repair-draft textarea { resize: vertical; min-height: 84px; }
    .lv-maint-repair-actions { display: flex; flex-wrap: wrap; gap: var(--lv-sp-2); margin-top: var(--lv-sp-3); }
    .lv-maint-repair-preview { display: flex; flex-direction: column; gap: var(--lv-sp-1); margin-top: var(--lv-sp-3); padding: var(--lv-sp-2); border: 1px solid var(--lv-border); border-radius: var(--lv-r-m); }
    .lv-maint-repair-diff summary { cursor: pointer; color: var(--lv-color-brand); }
    .lv-maint-repair-diff pre { max-height: 150px; margin: var(--lv-sp-1) 0 0; padding: var(--lv-sp-2); overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--lv-color-surface); font: inherit; }
    .lv-maint-repair-error {
        color: var(--lv-color-danger);
        margin-top: var(--lv-sp-1);
        overflow-wrap: anywhere;
        max-width: 48em;
        text-wrap: pretty;
        line-height: var(--lv-lh-reading, 1.65);
    }
    .lv-maint-similar-row {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-2);
        padding: calc(var(--lv-space-unit) * 4) calc(var(--lv-space-unit) * 5);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        background: var(--lv-color-surface);
        box-shadow: var(--lv-shadow-card), var(--lv-inset-shine);
        content-visibility: auto;
        contain-intrinsic-size: 0 60px;
        transition: transform var(--lv-dur-2) var(--lv-ease),
            border-color var(--lv-dur-1) var(--lv-ease),
            box-shadow var(--lv-dur-2) var(--lv-ease);

        &:hover {
            transform: translateY(-2px);
            border-color: var(--lv-primary-border);
            box-shadow: var(--lv-shadow-card-hover), var(--lv-inset-shine);
        }
    }
    .lv-maint-similar-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--lv-sp-2); margin-top: var(--lv-sp-2); }
    .lv-maint-similar-card { min-width: 0; padding: var(--lv-sp-2); border: 1px solid var(--lv-border); border-radius: var(--lv-r-m); background: var(--lv-color-surface); }
    .lv-maint-similar-card-head { display: flex; align-items: baseline; gap: var(--lv-sp-1); margin-bottom: var(--lv-sp-1); }
    .lv-maint-similar-card-head code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--lv-color-text-muted); font-size: var(--lv-type-caption-size); }
    .lv-maint-similar-face { max-height: 220px; margin: 0; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: var(--lv-lh-reading-tight); }
    .lv-maint-similar-actions { display: flex; flex-direction: column; gap: var(--lv-sp-1); }
    .lv-maint-similar-action-row { display: flex; flex-wrap: wrap; gap: var(--lv-sp-1); }
    .lv-maint-decision-active { outline: 2px solid var(--lv-color-brand); outline-offset: 1px; }
    @media (max-width: 740px) {
        .lv-maint-row, .lv-maint-similar-row { align-items: flex-start; flex-wrap: wrap; }
        .lv-maint-row .lv-maint-main, .lv-maint-similar-row .lv-maint-main { flex: 1 1 100%; }
        .lv-maint-similar-cards { grid-template-columns: 1fr; }
        .lv-maint-similar-actions { width: 100%; }
    }
    .lv-visually-hidden {
        position: absolute;
        width: 1px; height: 1px; margin: calc(var(--lv-space-hairline) * -1); padding: 0;
        overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
    }
</style>
