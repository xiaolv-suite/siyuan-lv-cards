<script lang="ts">
    /** 标记符制卡预览（M2·FR4）：勾选扫描结果 → 确认制卡（:: 问答新建块，？整块直加） */
    import { inspectCardLearnability } from "@/core/flashcard-quality";
    import LvKbd from "./kit/LvKbd.svelte";
    import LvIcon from "./kit/LvIcon.svelte";

    export interface MarkerItem {
        blockID: string;
        kind: "qa" | "whole";
        front: string;
        back: string;
    }

    let { i18n, items, onCreate, onClose }: {
        i18n: any;
        items: MarkerItem[];
        onCreate: (picked: MarkerItem[]) => Promise<void>;
        onClose: () => void;
    } = $props();
    const t = $derived(i18n);

    // 初值语义：扫描结果一次性传入，默认全选后由用户勾选
    // svelte-ignore state_referenced_locally
    let picked = $state<Set<string>>(new Set(items.map(i => i.blockID)));
    let busy = $state(false);
    let errorMsg = $state("");

    function toggle(id: string) {
        const next = new Set(picked);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        picked = next;
    }

    async function confirm() {
        const list = items.filter(i => picked.has(i.blockID));
        if (list.length === 0 || busy) {
            return;
        }
        busy = true;
        errorMsg = "";
        try {
            await onCreate(list);
            onClose();
        } catch (e) {
            errorMsg = e instanceof Error ? e.message : String(e);
        } finally {
            busy = false;
        }
    }

    const isMac = typeof navigator !== "undefined" && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || navigator.platform || "");
    const allPicked = $derived(items.length > 0 && items.every(i => picked.has(i.blockID)));
    const itemInspections = $derived(
        items.map(it =>
            inspectCardLearnability({
                question: it.front,
                answer: it.back,
                template: it.kind === "qa" ? "qa" : "whole",
            }),
        ),
    );
    const warnItemCount = $derived(itemInspections.filter(ins => ins.overloaded).length);

    function pickCleanOnly() {
        picked = new Set(items.filter((_, idx) => !itemInspections[idx]?.overloaded).map(i => i.blockID));
    }

    function toggleAll() {
        if (allPicked) {
            picked = new Set();
        } else {
            picked = new Set(items.map(i => i.blockID));
        }
    }

    function onKeydown(e: KeyboardEvent) {
        if (busy) return;
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            if (picked.size > 0) {
                e.preventDefault();
                void confirm();
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        } else if (e.key === "a" && !e.ctrlKey && !e.metaKey && !e.altKey && items.length > 0) {
            e.preventDefault();
            toggleAll();
        }
    }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="lv-marker b3-typography">
    <div class="lv-marker-header">
        <div class="lv-marker-hint">
            <span>{t.markerHint.replace("${n}", String(items.length))}</span>
            {#if warnItemCount > 0}
                <span class="lv-chip2 lv-chip2--warn" style="margin-left: 6px" title="部分条目存在过长、多问或答案泄漏，仍可直接制卡，也可先精简">{warnItemCount} 条可学性提醒</span>
            {/if}
        </div>
        {#if items.length > 0}
            <div style="display: inline-flex; gap: 6px; align-items: center;">
                {#if warnItemCount > 0 && warnItemCount < items.length}
                    <button
                        type="button"
                        class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                        onclick={pickCleanOnly}
                    >
                        <span>只选良构项</span>
                    </button>
                {/if}
                <button
                    type="button"
                    class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                    title={`${allPicked ? (t.unselectAll ?? "取消全选") : (t.selectAll ?? "全选")} (a)`}
                    aria-keyshortcuts="a"
                    onclick={toggleAll}
                >
                    <LvIcon name="check" size={12} />
                    <span>{allPicked ? (t.unselectAll ?? "取消全选") : (t.selectAll ?? "全选")}</span>
                </button>
            </div>
        {/if}
    </div>
    {#if errorMsg}<div class="lv-marker-error" role="alert" aria-live="assertive">{errorMsg}</div>{/if}
    {#if items.length === 0}
        <div class="lv-marker-empty lv-card2" role="status">
            <div class="lv-marker-empty-icon" aria-hidden="true">✦</div>
            <div>{t.markerEmpty ?? "当前文档没有找到可制卡的标记内容"}</div>
            <div class="ft__smaller ft__on-surface">{t.markerEmptyHint ?? "请先添加 :: 问答或？整块标记，再重新扫描。"}</div>
            <button
                class="b3-button b3-button--outline lv-btn-tool"
                aria-keyshortcuts="Escape"
                title={`${t.markerCancel} (Esc)`}
                onclick={onClose}
            >
                <LvIcon name="close" size={12} /> <span>{t.markerCancel}</span>
            </button>
        </div>
    {:else}
    <div class="lv-marker-list">
        {#each items as it, idx (it.blockID)}
            <label class="lv-marker-item" class:lv-marker-item--checked={picked.has(it.blockID)}>
                <input type="checkbox" class="lv-check" checked={picked.has(it.blockID)} onchange={() => toggle(it.blockID)} />
                <span class="lv-chip2 lv-chip2--default lv-marker-kind">{it.kind === "qa" ? t.markerKindQa : t.markerKindWhole}</span>
                <span class="lv-marker-text" title={it.kind === "qa" ? `${it.front} :: ${it.back}` : it.front}>
                    {it.kind === "qa" ? `${it.front} → ${it.back}` : it.front}
                </span>
                {#each itemInspections[idx]?.issues ?? [] as issue (issue.kind)}
                    <span class="lv-chip2 lv-chip2--warn lv-marker-kind" title={issue.detail}>{issue.label}</span>
                {/each}
            </label>
        {/each}
    </div>
    {/if}
    <div class="fn__flex lv-marker-actions">
        <span class="fn__flex-1"></span>
        <button
            class="b3-button b3-button--cancel"
            aria-keyshortcuts="Escape"
            title={`${t.markerCancel} (Esc)`}
            onclick={onClose}
        >
            {t.markerCancel}
        </button>
        <button
            class="b3-button lv-btn-primary"
            disabled={picked.size === 0 || busy}
            aria-busy={busy}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            title={`${busy ? (t.markerSaving ?? "正在制卡…") : t.markerConfirm.replace("${n}", String(picked.size))} (${isMac ? "⌘↵" : "Ctrl+↵"})`}
            onclick={confirm}
        >
            {busy ? (t.markerSaving ?? "正在制卡…") : t.markerConfirm.replace("${n}", String(picked.size))} <LvKbd k={isMac ? "⌘ ↵" : "Ctrl ↵"} />
        </button>
    </div>
</div>

<style>
    .lv-marker {
        width: 100%;
        box-sizing: border-box;
        padding: var(--lv-sp-4) var(--lv-sp-5);
    }
    .lv-marker .b3-button {
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
    .lv-marker-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-3);
    }
    .lv-marker-hint {
        font-size: var(--lv-type-control-size);
        color: var(--lv-color-text-muted);
        margin: 0;
        max-width: 48em;
        text-wrap: pretty;
        line-height: var(--lv-lh-reading, 1.65);
        font-variant-numeric: tabular-nums;
    }
    .lv-marker-error {
        margin-bottom: var(--lv-sp-2);
        color: var(--lv-color-danger);
        font-size: var(--lv-type-control-size);
        max-width: 48em;
        text-wrap: pretty;
    }
    .lv-marker-list {
        max-height: 46vh;
        overflow: auto;
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        padding: var(--lv-sp-2);
    }
    .lv-marker-item {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        padding: var(--lv-sp-2) var(--lv-sp-3);
        border-radius: var(--lv-r-s);
        border-bottom: 1px dashed var(--lv-border);
        cursor: pointer;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        content-visibility: auto;
        contain-intrinsic-size: 0 40px;
        transition: background var(--lv-dur-1) var(--lv-ease);

        &:focus-within {
            outline: none;
            box-shadow: inset 0 0 0 1.5px var(--lv-color-brand);
        }
    }
    .lv-marker-item:hover {
        background: var(--lv-surface-hover);
    }
    .lv-marker-item--checked {
        background: color-mix(in srgb, var(--lv-primary-soft) 40%, var(--lv-color-surface));
    }
    .lv-marker-item:last-child { border-bottom: none; }
    .lv-marker-kind { flex-shrink: 0; }
    .lv-marker-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: var(--lv-type-body-size);
    }
    .lv-marker-actions { margin-top: var(--lv-sp-3); gap: var(--lv-sp-2); }
    .lv-marker-empty {
        display: flex; flex-direction: column; align-items: center; gap: var(--lv-sp-2);
        padding: var(--lv-sp-5); text-align: center; color: var(--lv-color-text-muted);
        max-width: 48em; text-wrap: pretty; line-height: var(--lv-lh-reading, 1.65);
    }
    .lv-marker-empty-icon {
        width: 44px; height: 44px; border-radius: var(--lv-r-circle); display: flex; align-items: center;
        justify-content: center; background: var(--lv-primary-soft); color: var(--lv-color-brand); font-size: 18px;
    }
</style>
