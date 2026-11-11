<script lang="ts">
    import { showMessage } from "@/libs/notice";
    import { getBlockDOM, sqlQuery } from "@/api/siyuan";
    import { safeDocTitleFromHPath, showDocTreeNativeMenu } from "@/libs/lv-notice-kit";
    import { diffLines, type DiffRow } from "@/core/line-diff";
    import { isSuperBlockHtml, renderSuperBlockAnswerFace } from "@/core/card-face";
    import { renderMathIn } from "@/libs/math-render";
    import type { SearchBlock } from "@/api/riff";
    import LvDrawer from "./kit/LvDrawer.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import LvIcon from "./kit/LvIcon.svelte";
    import RelationsPanel from "./relations-panel.svelte";
    import KoPanel from "./ko-panel.svelte";
    import LifecyclePanel from "./lifecycle-panel.svelte";
    import CardEditor from "./card-editor.svelte";
    import type { LcSnapshot } from "./lifecycle-panel.svelte";
    import type { ContentState } from "@/core/content-lifecycle";
    import type { NextAction } from "@/core/next-action";

    let { block, t, onOpenDoc, onClose, relationsCtx, koCtx, lcCtx, editorCtx, onSaved, historyEntries = [], issues = [], versions = [], acceptVersion }: {
        block: SearchBlock;
        t: any;
        onOpenDoc: () => void;
        onClose: () => void;
        /** T05 分面（docs/40）：块学习记录与关联疑问（可选——旧宿主不传则分面显示空态） */
        historyEntries?: { rating: number; ts: number; dur: number | null }[];
        issues?: { addedAt: number; status: string }[];
        /** T05 内容版本快照（最新在前；可选——旧宿主不传则不显示版本） */
        versions?: { md: string; at: number; via: "editor" | "ai"; accepted?: boolean }[];
        /** T05：用户核对确认某版本（可选） */
        acceptVersion?: (at: number) => void | Promise<void>;
        /** BI-5/6/7：内容状态面板数据与操作（宿主注入；缺省=不显示内容状态区） */
        lcCtx?: {
            snapshot: LcSnapshot | null;
            onopen: () => void | Promise<void>;
            ontransition: (to: ContentState, reason: string) => boolean | Promise<boolean>;
            onaction: (action: NextAction) => void;
        };
        /** BK-2：关系面板数据与持久化回调（宿主注入；缺省=不显示关系区） */
        relationsCtx?: {
            relations: { relation: { from: string; to: string; type: string; createdAt: number }; direction: "outgoing" | "incoming" }[];
            onadd: (from: string, to: string, type: string) => void | Promise<void>;
            onremove: (from: string, to: string, type: string) => void | Promise<void>;
        };
        /** BK-1：知识对象面板数据与操作回调（宿主注入；缺省=不显示知识对象区） */
        koCtx?: {
            snapshot: { registered: boolean; fact: string; instances: { cardID: string; cardType: string; capability: string | null; disabled: boolean }[] };
            deriving: boolean;
            onregister: () => void | Promise<void>;
            ontoggle: (cardID: string, disabled: boolean) => void | Promise<void>;
            onremove: (cardID: string) => void | Promise<void>;
            onderive?: (cardType: string) => void | Promise<void>;
        };
        /** BX-2 W2：卡片内容编辑（宿主注入；缺省=不显示编辑入口） */
        editorCtx?: {
            load: () => Promise<string | null>;
            save: (md: string) => Promise<boolean | string>;
        };
        /** 保存成功且预览回读完成后的导航钩子（例如维护页重扫）。 */
        onSaved?: (blockID: string) => void | Promise<void>;
    } = $props();

    let html = $state("");
    let previewEl = $state<HTMLElement | null>(null);

    $effect(() => {
        // 详情预览与复习卡面同源：内核数学空壳节点在此补渲染
        if (html) void renderMathIn(previewEl);
    });
    let previewLoading = $state(false);
    let previewError = $state(false);
    let loadSeq = 0;
    let cardSeq = 0;
    // T05 内容版本（docs/40）：历史列表折叠 + 单版本展开 + 对比当前（逐行 diff）
    let versionsOpen = $state(false);
    let verOpenAt = $state<number | null>(null);
    let diffAt = $state<number | null>(null);
    let diffRows = $state<DiffRow[]>([]);
    let diffBusy = $state(false);
    let diffError = $state(false);
    let koRegisterBusy = $state(false);
    let koRegisterError = $state("");
    let acceptBusyAt = $state<number | null>(null);
    let acceptError = $state("");
    let restoreBusyAt = $state<number | null>(null);
    let restoreError = $state("");

    async function handleAcceptVersion(at: number) {
        if (!acceptVersion || acceptBusyAt !== null) return;
        acceptBusyAt = at;
        acceptError = "";
        try {
            await acceptVersion(at);
        } catch (error) {
            acceptError = error instanceof Error && error.message
                ? error.message
                : (t.detail?.acceptFailed ?? "版本核对保存失败，请重试。");
        } finally {
            acceptBusyAt = null;
        }
    }

    async function restoreVersionToCard(at: number, versionMd: string) {
        if (!editorCtx || restoreBusyAt !== null) return;
        restoreBusyAt = at;
        restoreError = "";
        try {
            const ok = await saveEdit(versionMd);
            if (typeof ok === "string") {
                restoreError = ok;
            } else if (ok !== true) {
                restoreError = t.editor?.saveFail ?? "恢复历史版本失败，请重试。";
            } else {
                diffAt = null;
            }
        } catch (error) {
            restoreError = error instanceof Error && error.message
                ? error.message
                : (t.editor?.saveFail ?? "恢复历史版本失败，请重试。");
        } finally {
            restoreBusyAt = null;
        }
    }
    async function compareWithCurrent(at: number, versionMd: string) {
        if (diffBusy) return;
        if (diffAt === at) { diffAt = null; diffError = false; return; }
        if (!editorCtx) return;
        const blockID = block.id;
        const seq = cardSeq;
        const load = editorCtx.load;
        diffBusy = true;
        diffError = false;
        try {
            const cur = await load();
            if (seq !== cardSeq || block.id !== blockID) return;
            if (cur === null) throw new Error("Current content is unavailable");
            diffRows = diffLines(versionMd, cur);
            diffAt = at;
        } catch {
            if (seq !== cardSeq || block.id !== blockID) return;
            diffAt = null;
            diffError = true;
        } finally {
            if (seq === cardSeq && block.id === blockID) diffBusy = false;
        }
    }
    async function loadPreview(blockID: string): Promise<void> {
        const seq = ++loadSeq;
        html = "";
        previewLoading = true;
        previewError = false;
        try {
            // AQ-20：统一内核响应校验，非 0/缺字段直接进错误态
            const dom = await getBlockDOM(blockID);
            if (seq === loadSeq) html = dom;
        } catch {
            if (seq === loadSeq) {
                html = "";
                previewError = true;
            }
        } finally {
            if (seq === loadSeq) previewLoading = false;
        }
    }

    async function openNativeDocMenu(e: MouseEvent) {
        let boxId = typeof block.box === "string" ? block.box : "";
        let rootId = typeof block.rootID === "string" ? block.rootID : "";
        if (!boxId || !rootId) {
            try {
                const rows = await sqlQuery(`SELECT box, root_id FROM blocks WHERE id = '${block.id.replace(/'/g, "''")}' LIMIT 1`);
                if (rows && rows[0]) {
                    boxId = boxId || String(rows[0].box ?? "");
                    rootId = rootId || String(rows[0].root_id ?? "");
                }
            } catch {}
        }
        if (boxId) {
            await showDocTreeNativeMenu({
                notebookId: boxId,
                docId: rootId || block.id,
                position: { x: e.clientX, y: e.clientY },
            });
        }
    }

    async function registerKnowledgeObject() {
        if (koRegisterBusy || !koCtx) return;
        const blockID = block.id;
        const seq = cardSeq;
        const register = koCtx.onregister;
        koRegisterBusy = true;
        koRegisterError = "";
        try {
            await register();
        } catch (error) {
            if (seq === cardSeq && block.id === blockID) koRegisterError = error instanceof Error && error.message ? error.message : (t.review?.ko?.actionFailed ?? "保存失败，请重试。");
        } finally {
            if (seq === cardSeq && block.id === blockID) koRegisterBusy = false;
        }
    }

    // 切换块时重置折叠/对比状态，并清空旧预览后加载当前块。
    $effect(() => {
        const blockID = block.id;
        cardSeq += 1;
        versionsOpen = false;
        verOpenAt = null;
        diffAt = null;
        diffError = false;
        diffBusy = false;
        diffRows = [];
        editing = false;
        editorMd = "";
        editorLoadBusy = false;
        editorLoadFail = false;
        koRegisterBusy = false;
        koRegisterError = "";
        acceptBusyAt = null;
        acceptError = "";
        restoreBusyAt = null;
        restoreError = "";
        void loadPreview(blockID);
        return () => {
            // 使卸载或切换前发出的请求失效，晚到的响应不能覆盖当前块。
            loadSeq += 1;
            cardSeq += 1;
        };
    });
    // T05 分面（docs/40）：内容/来源/学习记录/问题
    type Facet = "content" | "source" | "history" | "issues";
    let facet = $state<Facet>("content");
    const facetTabs = $derived([
        { id: "content" as Facet, label: t.detail.facetContent },
        { id: "source" as Facet, label: t.detail.facetSource },
        { id: "history" as Facet, label: t.detail.facetHistory },
        { id: "issues" as Facet, label: t.detail.facetIssues },
    ]);
    function onFacetKeydown(e: KeyboardEvent) {
        const focused = (e.target as HTMLElement | null)?.closest<HTMLElement>("[role=tab]");
        const focusedId = focused?.id.startsWith("lv-facet-tab-") ? focused.id.slice("lv-facet-tab-".length) : "";
        const idx = facetTabs.findIndex((f) => f.id === (focusedId || facet));
        if (idx < 0) return;
        let next: number | null = null;
        if (e.key === "ArrowRight") next = (idx + 1) % facetTabs.length;
        else if (e.key === "ArrowLeft") next = (idx - 1 + facetTabs.length) % facetTabs.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = facetTabs.length - 1;
        if (next === null) return;
        e.preventDefault();
        facet = facetTabs[next].id;
        document.getElementById(`lv-facet-tab-${facetTabs[next].id}`)?.focus();
    }
    const ratingTone = (r: number): "error" | "warn" | "primary" | "default" => {
        if (r === 1) return "error";
        if (r === 2) return "warn";
        if (r >= 3) return "primary";
        return "default";
    };
    const ratingLabel = (r: number) => {
        if (r === 1) return t.review?.againBtn ?? t.review?.unknown ?? "遗忘";
        if (r === 2) return t.review?.hard ?? t.review?.vague ?? "困难";
        if (r === 3) return t.review?.good ?? t.review?.know ?? "良好";
        if (r === 4) return t.review?.easy ?? "简单";
        return "—";
    };
    const histSummary = $derived.by(() => {
        const reviews = historyEntries.filter((e) => e.rating > 0);
        const forgets = historyEntries.filter((e) => e.rating === 1).length;
        const last = reviews.reduce((m, e) => Math.max(m, e.ts), 0);
        return { reviews: reviews.length, forgets, last };
    });
    // BX-2 W2：编辑态（原文加载成功才进入；保存成功回读预览）
    let editing = $state(false);
    let editorMd = $state("");
    let editorLoadFail = $state(false);
    let editorLoadBusy = $state(false);

    async function startEdit() {
        if (!editorCtx || editorLoadBusy) return;
        const blockID = block.id;
        const seq = cardSeq;
        const load = editorCtx.load;
        editorLoadBusy = true;
        try {
            const md = await load();
            if (seq !== cardSeq || block.id !== blockID) return;
            if (md === null) {
                editorLoadFail = true;
                return;
            }
            editorLoadFail = false;
            editorMd = md;
            editing = true;
        } catch {
            if (seq === cardSeq && block.id === blockID) editorLoadFail = true;
        } finally {
            if (seq === cardSeq && block.id === blockID) editorLoadBusy = false;
        }
    }

    async function saveEdit(md: string): Promise<boolean | string> {
        if (!editorCtx) return false;
        const blockID = block.id;
        const seq = cardSeq;
        const saved = onSaved;
        const ok = await editorCtx.save(md);
        if (seq !== cardSeq || block.id !== blockID) return ok;
        if (ok === true) {
            editing = false;
            // 写回成功后刷新预览（失败保留旧卡面）
            await loadPreview(blockID);
            if (seq === cardSeq && block.id === blockID) await saved?.(blockID);
        }
        return ok;
    }

    function safeClose() {
        if (editing) {
            const confirmed = window.confirm(t.editor?.discardConfirm ?? "当前卡片正在编辑中，确定放弃未保存的修改并关闭吗？");
            if (!confirmed) return;
        }
        onClose();
    }
</script>

<LvDrawer open title={t.manager.detailTitle} closeLabel={t.manager.close} width="min(560px, 92vw)" onclose={safeClose}>
    {#snippet actions()}
        {#if editorCtx && !editing}
            <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" disabled={editorLoadBusy} aria-busy={editorLoadBusy} onclick={startEdit}><LvIcon name="edit" size={12} /> <span>{editorLoadBusy ? "…" : t.editor.edit}</span></button>
        {/if}
        <button
            type="button"
            class="b3-button b3-button--small b3-button--outline lv-btn-tool"
            title={t.manager.copyRef ?? "复制块引用 ((id '内容'))"}
            onclick={async () => {
                const cleanText = (block.content || "闪卡").replace(/<[^>]+>/g, "").slice(0, 30);
                const text = `(( ${block.id} "${cleanText}" ))`;
                try {
                    await navigator.clipboard.writeText(text);
                    showMessage(t.manager.copyRefSuccess ?? "已复制块引用到剪贴板", 2000, "info");
                } catch {
                    showMessage("复制失败", 2000, "error");
                }
            }}
        >
            <LvIcon name="book" size={12} />
            <span>{t.manager.copyRef ?? "复制块引"}</span>
        </button>
        <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" onclick={onOpenDoc}><LvIcon name="target" size={12} /> <span>{t.manager.openDoc}</span></button>
    {/snippet}
    <!-- T05 分面导航（docs/40）：内容 / 来源 / 学习记录 / 问题 -->
    <div class="lv-facets" role="tablist" aria-orientation="horizontal" tabindex="-1" onkeydown={onFacetKeydown}>
        {#each facetTabs as f, i (f.id)}
            <button
                type="button"
                class="lv-facet"
                role="tab"
                id={`lv-facet-tab-${f.id}`}
                aria-selected={facet === f.id}
                aria-controls="lv-facet-panel"
                tabindex={facet === f.id || (i === 0 && !facetTabs.some((tab) => tab.id === facet)) ? 0 : -1}
                class:lv-facet-active={facet === f.id}
                onclick={() => (facet = f.id)}
            >{f.label}</button>
        {/each}
    </div>
    <div
        id="lv-facet-panel"
        class="lv-facet-panel"
        role="tabpanel"
        aria-labelledby={`lv-facet-tab-${facet}`}
        tabindex="0"
    >
    {#if facet === "content"}
        <!-- T05 内容版本（docs/40）：保存即留快照；可展开回看历史内容 -->
        {#if versions.length > 0}
            <div style="margin-bottom: var(--lv-sp-2); display: flex; align-items: center; gap: 6px">
                <LvChip tone="primary">{t.detail.version} {versions.length}</LvChip>
                <button
                    class="b3-button b3-button--small lv-btn-tool"
                    aria-label={`${t.detail.versionHistory} ${versionsOpen ? "▴" : "▾"}`}
                    onclick={() => (versionsOpen = !versionsOpen)}
                >
                    <span>{t.detail.versionHistory}</span>
                    <LvIcon name={versionsOpen ? "chevron-up" : "chevron-down"} size={12} />
                </button>
            </div>
            {#if versionsOpen}
                {#if acceptError}
                    <div class="lv-detail-preview-error" role="alert" aria-live="assertive">{acceptError}</div>
                {/if}
                {#if restoreError}
                    <div class="lv-detail-preview-error" role="alert" aria-live="assertive">{restoreError}</div>
                {/if}
                <div class="lv-ver-list">
                    {#each versions as v (v.at)}
                        <div class="lv-ver-row">
                            <div class="fn__flex" style="gap: calc(var(--lv-space-unit) * 2); align-items: center; flex-wrap: wrap;">
                                <button class="b3-button b3-button--small" onclick={() => (verOpenAt = verOpenAt === v.at ? null : v.at)}>
                                    {new Date(v.at).toLocaleString()} · {v.via === "ai" ? t.detail.viaAI : t.detail.viaEditor}
                                </button>
                                {#if v.accepted}<LvChip tone="primary">{t.detail.accepted}</LvChip>{/if}
                                <button
                                    class="b3-button b3-button--small"
                                    disabled={v.accepted || !acceptVersion || acceptBusyAt !== null}
                                    aria-busy={acceptBusyAt === v.at}
                                    title={v.accepted ? t.detail.accepted : acceptVersion ? t.detail.acceptVer : t.detail.acceptUnavailable}
                                    aria-label={`${v.accepted ? t.detail.accepted : acceptVersion ? t.detail.acceptVer : t.detail.acceptUnavailable}: ${new Date(v.at).toLocaleString()}`}
                                    onclick={() => void handleAcceptVersion(v.at)}
                                >
                                    <LvIcon name="check" size={12} />
                                </button>
                                <button
                                    class="b3-button b3-button--small lv-btn-tool"
                                    disabled={diffBusy || !editorCtx}
                                    title={!editorCtx ? t.detail.diffUnavailable : undefined}
                                    onclick={() => compareWithCurrent(v.at, v.md)}
                                >
                                    <LvIcon name="swap" size={12} />
                                    <span>{t.detail.diffCompare}</span>
                                </button>
                                {#if editorCtx}
                                    <button
                                        class="b3-button b3-button--small lv-btn-tool"
                                        disabled={restoreBusyAt !== null || diffBusy}
                                        aria-busy={restoreBusyAt === v.at}
                                        onclick={() => void restoreVersionToCard(v.at, v.md)}
                                    >
                                        <LvIcon name="refresh" size={12} />
                                        <span>{t.detail?.restoreVer ?? "恢复此版本"}</span>
                                    </button>
                                {/if}
                            </div>
                            {#if verOpenAt === v.at}
                                <div class="ft__smaller" style="white-space: pre-wrap; max-height: 160px; overflow: auto; margin-top: 4px; padding: calc(var(--lv-space-unit) * 4); border: 1px solid var(--lv-border); border-radius: var(--lv-r-compact)">{v.md}</div>
                            {/if}
                            {#if diffAt === v.at}
                                <div class="lv-diff">
                                    {#each diffRows as r, ri (ri)}
                                        <div class="lv-diff-row lv-diff-{r.kind}">{r.kind === "add" ? "+ " : r.kind === "del" ? "− " : "  "}{r.text}</div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
            {#if diffBusy}<div class="ft__smaller ft__on-surface" role="status" aria-busy="true">{t.dashboard.loading}</div>{/if}
            {#if diffError}<div class="ft__smaller ft__on-surface" role="alert" aria-live="assertive">{t.detail.diffLoadFail}</div>{/if}
        {/if}
        {#if previewLoading}
            <div class="lv-detail-preview-state" role="status" aria-busy="true">{t.dashboard.loading}</div>
        {:else if previewError}
            <div class="lv-detail-preview-error" role="alert" aria-live="assertive">
                <span>{t.detail.diffLoadFail}</span>
                <button class="b3-button b3-button--small lv-btn-tool" onclick={() => loadPreview(block.id)}>
                    <LvIcon name="refresh" size={12} />
                    <span>{t.dashboard.refresh}</span>
                </button>
            </div>
        {/if}
        {#if html && isSuperBlockHtml(html)}
            <div style="margin-bottom: var(--lv-sp-2)">
                <span class="lv-chip2 lv-chip2--default"><LvIcon name="cards" size={13} /> {t.cardTypeBadgeSuperBlock ?? "超级块"}</span>
            </div>
        {/if}
        <div class="lv-detail-preview lv-unified-face b3-typography" bind:this={previewEl}>{@html (html && isSuperBlockHtml(html)) ? renderSuperBlockAnswerFace(html) : (html || (block.content ?? ""))}</div>
        {#if editing}
            <CardEditor t={t} original={editorMd} onsave={saveEdit} oncancel={() => (editing = false)} />
        {:else if editorLoadFail}
            <div class="ft__smaller ft__on-surface">{t.editor.loadFail}</div>
        {/if}
        {#if lcCtx}
            <LifecyclePanel
                t={t}
                snapshot={lcCtx.snapshot}
                onopen={lcCtx.onopen}
                ontransition={lcCtx.ontransition}
                onaction={lcCtx.onaction}
            />
        {/if}
    {:else if facet === "source"}
        <div class="lv-detail-meta ft__smaller ft__on-surface">
            <div>{t.manager.detailBlockId}: {block.id}</div>
            {#if block.hPath}<div>{safeDocTitleFromHPath(block, block.hPath)}</div>{/if}
        </div>
        <div style="display: flex; gap: var(--lv-sp-2); margin-top: var(--lv-sp-2); flex-wrap: wrap;">
            <button
                class="b3-button b3-button--outline"
                type="button"
                title={`${t.manager.openDoc}（右键呼出原生菜单）`}
                onclick={onOpenDoc}
                oncontextmenu={async (e) => { e.preventDefault(); await openNativeDocMenu(e); }}
            >{t.manager.openDoc}</button>
            <button
                class="b3-button b3-button--outline"
                type="button"
                title={t.manager?.docTreeMenu ?? "原生文档树菜单"}
                onclick={openNativeDocMenu}
            >{t.manager?.docTreeMenu ?? "文档菜单"}</button>
        </div>
    {:else if facet === "history"}
        {#if historyEntries.length === 0}
            <div class="lv-hint">{t.detail.histEmpty}</div>
        {:else}
            <div class="ft__smaller ft__on-surface" style="margin-bottom: var(--lv-sp-2)">
                {t.detail.histSummary.replace("${r}", String(histSummary.reviews)).replace("${f}", String(histSummary.forgets))}
            </div>
            <div class="lv-hist-list">
                {#each [...historyEntries].reverse() as e (e.ts)}
                    <div class="lv-todo-row lv-hist-row">
                        <span class="lv-hist-ts">{new Date(e.ts).toLocaleString()}</span>
                        <div class="lv-hist-meta">
                            <LvChip tone={ratingTone(e.rating)}>{ratingLabel(e.rating)}</LvChip>
                            {#if e.dur}<span class="ft__smaller ft__on-surface">{Math.round(e.dur / 1000)}s</span>{/if}
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    {:else}
        {#if issues.length === 0}
            <div class="lv-hint">{t.detail.issuesEmpty}</div>
        {:else}
            {#each issues as it (it.addedAt)}
                <div class="lv-todo-row lv-issue-row">
                    <span class="lv-issue-ts">{new Date(it.addedAt).toLocaleDateString()}</span>
                    <span class="ft__smaller ft__on-surface">{t.detail.issueStatus}: {it.status}</span>
                </div>
            {/each}
            <div class="ft__smaller ft__on-surface lv-issues-hint" style="margin-top: var(--lv-sp-2)">{t.detail.issuesHint}</div>
        {/if}
    {/if}
    </div>
    {#if koCtx}
        {#if koCtx.snapshot.registered}
            <KoPanel
                fact={koCtx.snapshot.fact}
                instances={koCtx.snapshot.instances}
                deriving={koCtx.deriving}
                t={t}
                ontoggle={koCtx.ontoggle}
                onremove={koCtx.onremove}
                onderive={koCtx.onderive}
            />
        {:else}
            <!-- ko 文案在 i18n 的 review.ko 组（与 ko-panel 同源）；t.ko 顶层不存在（v0.124 起的潜伏笔误） -->
            <button class="b3-button b3-button--text" disabled={koRegisterBusy} aria-busy={koRegisterBusy} onclick={registerKnowledgeObject}>
                {koRegisterBusy ? (t.review?.ko?.saving ?? "保存中…") : (t.review?.ko?.register ?? t.ko?.register ?? "")}
            </button>
            {#if koRegisterError}<div class="lv-detail-preview-error" role="alert" aria-live="assertive">{koRegisterError} <button class="b3-button b3-button--text" disabled={koRegisterBusy} onclick={registerKnowledgeObject}>{t.review?.ko?.retryAction ?? "重试"}</button></div>{/if}
        {/if}
    {/if}
    {#if relationsCtx}
        <RelationsPanel
            entityId={block.id}
            relations={relationsCtx.relations}
            t={t}
            onadd={relationsCtx.onadd}
            onremove={relationsCtx.onremove}
        />
    {/if}
</LvDrawer>

<style>
    .lv-hist-row,
    .lv-issue-row {
        padding: var(--lv-sp-2) 0;
        border-bottom: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent);
        content-visibility: auto;
        contain-intrinsic-size: 0 38px;
        &:last-child { border-bottom: none; }
    }
    .lv-hist-ts,
    .lv-issue-ts {
        font-variant-numeric: tabular-nums;
    }
    .lv-issues-hint {
        max-width: 48em;
        text-wrap: pretty;
        line-height: var(--lv-lh-reading, 1.65);
    }
    .lv-hist-meta {
        display: inline-flex;
        align-items: center;
        gap: var(--lv-sp-2);
    }
    .lv-detail-preview {
        margin-bottom: var(--lv-sp-4);
        overflow-wrap: anywhere;
        padding: calc(var(--lv-space-unit) * 8) calc(var(--lv-space-unit) * 9);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        background: var(--lv-color-surface);
        box-shadow: var(--lv-shadow-card), var(--lv-inset-shine);
        line-height: var(--lv-lh-reading);

        :global(p) {
            max-width: 48em;
            margin: var(--lv-sp-2) 0;
            text-wrap: pretty;
        }

        :global(img) {
            max-width: 100%;
            max-height: 48vh;
            height: auto;
            object-fit: contain;
            display: block;
            margin: var(--lv-sp-2) auto;
            border-radius: var(--lv-r-m);
        }
        :global(pre),
        :global(.language-math),
        :global(.katex-display) {
            overflow-x: auto;
            scrollbar-width: thin;
        }
    }
    .lv-detail-preview-state,
    .lv-detail-preview-error {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-2);
        color: var(--lv-color-text-muted);
    }
    .lv-detail-preview-error {
        color: var(--lv-color-danger);
        max-width: 48em;
        text-wrap: pretty;
        line-height: var(--lv-lh-reading, 1.65);
    }
    .lv-detail-meta div { padding: calc(var(--lv-space-unit) * 1) 0; }

    /* T05 分面导航（R52 segmented 同构，现代圆润胶囊排） */
    .lv-facets {
        display: flex;
        gap: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline));
        padding: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline));
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-pill);
        background: color-mix(in srgb, var(--lv-color-text) 7%, transparent);
        margin-bottom: var(--lv-sp-4);
    }
    .lv-facet {
        flex: 1;
        border: none;
        background: transparent;
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-control-size);
        font-weight: var(--lv-fw-emphasis);
        padding: calc(var(--lv-space-unit) * 3) calc(var(--lv-space-unit) * 5);
        border-radius: var(--lv-r-pill);
        cursor: pointer;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        transition: background var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease);
        white-space: nowrap;
        text-align: center;

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }

        @media (max-width: 400px) {
            padding: calc(var(--lv-space-unit) * 2) calc(var(--lv-space-unit) * 3);
            font-size: var(--lv-type-meta-size);
        }
    }
    .lv-facet:hover:not(.lv-facet-active) {
        color: var(--lv-color-text);
        background: color-mix(in srgb, var(--lv-color-text) 4%, transparent);
    }
    .lv-facet-active {
        background: var(--lv-color-surface);
        color: var(--lv-color-brand);
        font-weight: var(--lv-fw-bold);
        box-shadow: var(--lv-shadow-1);
    }
    .lv-hist-list { max-height: 320px; overflow: auto; }

    /* T05 版本对比（docs/40）：逐行差异 */
    :global(.b3-button) {
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
    .lv-ver-row .b3-button {
        font-variant-numeric: tabular-nums;
    }
    .lv-hint {
        color: var(--lv-color-text-muted);
        max-width: 48em;
        text-wrap: pretty;
        line-height: var(--lv-lh-reading, 1.65);
    }
    .lv-diff {
        margin-top: calc(var(--lv-space-unit) * 2);
        padding: calc(var(--lv-space-unit) * 2) calc(var(--lv-space-unit) * 3);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        max-height: 220px;
        overflow: auto;
        font-size: var(--lv-type-control-size);
        line-height: var(--lv-lh-reading);
        background: var(--lv-color-canvas);
    }
    .lv-diff-row {
        white-space: pre-wrap;
        word-break: break-word;
        padding: calc(var(--lv-space-unit) * 1) calc(var(--lv-space-unit) * 3);
        border-radius: var(--lv-r-xs);
        margin: var(--lv-space-hairline) 0;
    }
    .lv-diff-del {
        background: var(--lv-danger-soft);
        color: var(--lv-color-danger);
        border-left: 3px solid var(--lv-color-danger);
    }
    .lv-diff-add {
        background: var(--lv-good-soft);
        color: var(--lv-color-success);
        border-left: 3px solid var(--lv-color-success);
    }
    .lv-diff-same { opacity: 0.65; }
</style>
