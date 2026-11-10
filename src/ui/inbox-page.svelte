<script lang="ts">
    // BI-4 材料筛选收件箱子页（Hub 懒加载 chunk，不占主包预算）。
    // 品质线对齐 manager 页：LvPage 页头 + LvSegmented 筛选 + 毛玻璃批量条（LvChip 计数）
    // + 行级 LvSkeleton 标题加载 + LvEmpty 空态 + LvLive 读屏播报 + 破坏性操作 confirmDialog
    // + 行内打开来源（BI-6 openSource 建议）。流转：inbox → staged → selected / dismissed；
    // 只读收集不产生 due。
    import { showMessage } from "@/libs/notice";
    import { confirmDialog } from "@/libs/dialog";
    import LvPage from "./kit/LvPage.svelte";
    import LvSegmented from "./kit/LvSegmented.svelte";
    import LvEmpty from "./kit/LvEmpty.svelte";
    import LvSkeleton from "./kit/LvSkeleton.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import LvIcon from "./kit/LvIcon.svelte";
    import LvLive from "./kit/LvLive.svelte";
    import type { InboxData, InboxItem, InboxStatus } from "@/core/inbox";

    let {
        i18n,
        inbox,
    }: {
        i18n: any;
        inbox: {
            get: () => InboxData;
            subscribe: (cb: () => void) => () => void;
            setStatus: (blockIDs: string[], status: InboxStatus) => InboxData;
            undoSelection: (blockIDs: string[]) => InboxData;
            remove: (blockIDs: string[]) => InboxData;
            add: (blockIDs: string[]) => number;
            makeCards: (blockIDs: string[]) => Promise<void>;
            openSource: (blockID: string) => Promise<void>;
            titles: (ids: string[]) => Promise<Map<string, string>>;
        };
    } = $props();

    const t = $derived(i18n.inbox);

    // BX-10：订阅收件箱变更（块菜单收集/其他入口），自动同步快照——不再依赖手动 ⟳
    $effect(() => {
        const unsub = inbox.subscribe(() => {
            snapshot = inbox.get();
        });
        return unsub;
    });

    const FILTERS: { id: InboxStatus; labelKey: string }[] = [
        { id: "inbox", labelKey: "tabInbox" },
        { id: "staged", labelKey: "tabStaged" },
        { id: "selected", labelKey: "tabSelected" },
        { id: "dismissed", labelKey: "tabDismissed" },
    ];

    // svelte-ignore state_referenced_locally -- 初值快照刻意的：后续变更经 inbox 订阅/操作回调整体替换 snapshot（BX-10）
    let snapshot = $state<InboxData>(inbox.get());
    let filter = $state<InboxStatus>("inbox");
    let searchQuery = $state("");
    let checked = $state<string[]>([]);
    let titles = $state<Map<string, string>>(new Map());
    let making = $state(false);
    let makeError = $state("");
    // 来源打开是异步宿主操作：逐行锁定重复点击，并保留可重试错误。
    let sourcePendingId = $state("");
    let sourceError = $state("");
    let sourceErrorId = $state("");
    let live = $state("");

    const visible = $derived(
        snapshot.items
            .filter(i => i.status === filter)
            .filter(i => {
                if (!searchQuery.trim()) return true;
                const q = searchQuery.trim().toLowerCase();
                const title = (titles.get(i.blockID) ?? "").toLowerCase();
                return title.includes(q) || i.blockID.toLowerCase().includes(q);
            })
            .sort((a, b) => a.addedAt - b.addedAt),
    );
    const checkedSet = $derived(new Set(checked));
    const counts = $derived(
        snapshot.items.reduce(
            (acc, i) => { acc[i.status]++; return acc; },
            { inbox: 0, staged: 0, selected: 0, dismissed: 0 } as Record<InboxStatus, number>,
        ),
    );
    const allChecked = $derived(visible.length > 0 && visible.every(i => checkedSet.has(i.blockID)));

    // 块菜单或向导可能在当前页打开时更新收件箱；清理已经不存在的选择，
    // 避免批量操作误作用于隐藏或已删除的记录。
    $effect(() => {
        const ids = new Set(snapshot.items.map(i => i.blockID));
        const next = checked.filter(id => ids.has(id));
        if (next.length !== checked.length) checked = next;
    });

    // 标题解析：块 content 首行（失败置空串→回退短 ID，行骨架随之解除）
    const pendingTitles = new Set<string>();
    $effect(() => {
        const missing = visible
            .map(i => i.blockID)
            .filter(id => !titles.has(id) && !pendingTitles.has(id));
        if (missing.length === 0) { return; }
        for (const id of missing) { pendingTitles.add(id); }
        inbox.titles(missing).then(m => {
            const merged = new Map(titles);
            for (const id of missing) {
                merged.set(id, m.get(id) ?? "");
                pendingTitles.delete(id);
            }
            titles = merged;
        }).catch(() => {
            const merged = new Map(titles);
            for (const id of missing) {
                merged.set(id, "");
                pendingTitles.delete(id);
            }
            titles = merged;
        });
    });

    function stripHtml(html: string): string {
        const div = document.createElement("div");
        div.innerHTML = html ?? "";
        return (div.textContent ?? "").trim();
    }

    function titleOf(item: InboxItem): string {
        const text = stripHtml(titles.get(item.blockID) ?? "");
        return text || item.blockID.slice(0, 8);
    }

    function snippetOf(item: InboxItem): string {
        const s = titleOf(item);
        return s.length > 80 ? `${s.slice(0, 80)}…` : s;
    }

    function announce(msg: string) {
        live = msg;
    }

    function toggle(id: string) {
        checked = checkedSet.has(id) ? checked.filter(x => x !== id) : [...checked, id];
    }

    function toggleAll() {
        checked = allChecked ? [] : visible.map(i => i.blockID);
    }

    function statusLabel(status: InboxStatus): string {
        const f = FILTERS.find(x => x.id === status);
        return f ? (t[f.labelKey] ?? status) : status;
    }

    function applyStatus(status: InboxStatus) {
        if (checked.length === 0) { return; }
        const n = checked.length;
        snapshot = inbox.setStatus(checked, status);
        checked = [];
        const msg = t.bulkDone.replace("${n}", String(n)).replace("${status}", statusLabel(status));
        showMessage(msg, 2000, "info");
        announce(msg);
    }

    function undoSel() {
        if (checked.length === 0) { return; }
        const n = checked.length;
        snapshot = inbox.undoSelection(checked);
        checked = [];
        const msg = t.undoneNotice.replace("${n}", String(n));
        showMessage(msg, 2000, "info");
        announce(msg);
    }

    function removeChecked() {
        if (checked.length === 0) { return; }
        const n = checked.length;
        confirmDialog({
            title: t.remove,
            content: `<div class="b3-typography">${t.deleteConfirm.replace("${n}", String(n))}</div>`,
            confirm: () => {
                snapshot = inbox.remove(checked);
                checked = [];
                showMessage(t.removedNotice, 2000, "info");
                announce(t.removedNotice);
            },
        });
    }

    // 送去制卡：向导成功回调里清收件箱；完成后手动刷新快照
    async function sendToCards() {
        if (checked.length === 0 || making) { return; }
        making = true;
        makeError = "";
        try {
            await inbox.makeCards(checked);
            checked = [];
            snapshot = inbox.get();
        } catch (e: any) {
            makeError = e?.message ?? t.makeCardsFailed;
            showMessage(makeError, 3500, "error");
        }
        making = false;
    }

    async function openSource(blockID: string) {
        if (sourcePendingId) return;
        sourcePendingId = blockID;
        sourceError = "";
        sourceErrorId = "";
        try {
            await inbox.openSource(blockID);
        } catch (e) {
            const detail = e instanceof Error ? e.message : String(e);
            sourceError = (t.openFailed ?? "打开来源失败：${error}，请重试").replace("${error}", detail);
            sourceErrorId = blockID;
            showMessage(sourceError, 3500, "error");
        } finally {
            sourcePendingId = "";
        }
    }

    function refresh() {
        snapshot = inbox.get();
        checked = [];
        showMessage(t.refreshedNotice, 1500, "info");
    }

    function onWindowKeydown(e: KeyboardEvent) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
        if (e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f")) {
            e.preventDefault();
            const input = document.querySelector(".lv-inbox-search-input") as HTMLInputElement | null;
            input?.focus();
            input?.select();
        } else if (e.key === "r" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            refresh();
        } else if (e.key === "a" && !e.ctrlKey && !e.metaKey && !e.altKey && visible.length > 0) {
            e.preventDefault();
            toggleAll();
        }
    }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<LvPage eyebrow="CAPTURE / INBOX" title={t.title} subtitle={`${t.tabInbox} ${counts.inbox} · ${t.tabStaged} ${counts.staged} · ${t.tabSelected} ${counts.selected} · ${t.tabDismissed} ${counts.dismissed}`}>
    {#snippet actions()}
        <input
            class="b3-text-field lv-inbox-search-input"
            type="search"
            placeholder={i18n.settings?.searchPlaceholder ?? "搜索材料…"}
            aria-label="搜索材料"
            title="搜索材料 (/)"
            aria-keyshortcuts="/"
            spellcheck="false"
            autocomplete="off"
            bind:value={searchQuery}
            onkeydown={(e) => { if (e.key === "Escape" && searchQuery) { e.stopPropagation(); searchQuery = ""; } }}
        />
        <LvSegmented
            options={FILTERS.map(f => ({ value: f.id, label: `${t[f.labelKey]} (${counts[f.id]})` }))}
            value={filter}
            onchange={(id: string) => { filter = id as InboxStatus; checked = []; }}
            ariaLabel={t.filterGroupLabel}
        />
        <button
            class="b3-button b3-button--small b3-button--outline lv-btn-tool"
            title={`${allChecked ? t.unselectAll : t.selectAll} (a)`}
            aria-keyshortcuts="a"
            disabled={visible.length === 0}
            onclick={toggleAll}
        >
            <LvIcon name="check" size={12} />
            <span>{allChecked ? t.unselectAll : t.selectAll}</span>
        </button>
        <button
            class="b3-button b3-button--small b3-button--outline lv-btn-tool"
            title={`${t.refresh} (r)`}
            aria-keyshortcuts="r"
            onclick={refresh}
        >
            <LvIcon name="refresh" size={13} />
            <span>{t.refresh}</span>
        </button>
    {/snippet}

    {#if makeError}<div class="lv-inbox-error" role="alert" aria-live="assertive">{makeError}</div>{/if}
    {#if sourceError}
        <div class="lv-inbox-error" role="alert" aria-live="assertive">
            <span>{sourceError}</span>
            {#if sourceErrorId && !sourcePendingId}
                <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" onclick={() => openSource(sourceErrorId)}><LvIcon name="refresh" size={12} /> <span>{t.retry ?? "重试"}</span></button>
            {/if}
        </div>
    {/if}
    {#if visible.length === 0}
        <LvEmpty text={t.empty} />
    {:else}
        {#if checked.length > 0}
            <div class="lv-glass lv-batchbar">
                <LvChip tone="primary">{t.selectedCount.replace("${n}", String(checked.length))}</LvChip>
                <div class="fn__flex-1"></div>
                {#if filter === "inbox"}
                    <button class="b3-button b3-button--outline lv-btn-tool" disabled={making} onclick={() => applyStatus("staged")}><LvIcon name="inbox" size={12} /> <span>{t.stage}</span></button>
                    <button class="b3-button b3-button--outline lv-btn-tool" disabled={making} onclick={() => applyStatus("selected")}><LvIcon name="check" size={12} /> <span>{t.select}</span></button>
                    <button class="b3-button b3-button--outline lv-btn-tool" disabled={making} onclick={() => applyStatus("dismissed")}><LvIcon name="close" size={12} /> <span>{t.dismiss}</span></button>
                {:else if filter === "staged"}
                    <button class="b3-button b3-button--outline lv-btn-tool" disabled={making} onclick={() => applyStatus("selected")}><LvIcon name="check" size={12} /> <span>{t.select}</span></button>
                    <button class="b3-button b3-button--outline lv-btn-tool" disabled={making} onclick={() => applyStatus("dismissed")}><LvIcon name="close" size={12} /> <span>{t.dismiss}</span></button>
                    <button class="b3-button b3-button--outline lv-btn-tool" disabled={making} onclick={() => applyStatus("inbox")}><LvIcon name="chevron-left" size={12} /> <span>{t.back}</span></button>
                {:else if filter === "selected"}
                    <button class="b3-button lv-btn-primary lv-btn-tool" disabled={making} onclick={sendToCards}><LvIcon name="cards" size={12} /> <span>{t.sendToCards}</span></button>
                    <button class="b3-button b3-button--outline lv-btn-tool" disabled={making} onclick={undoSel}><LvIcon name="refresh" size={12} /> <span>{t.undoSelection}</span></button>
                {:else}
                    <button class="b3-button b3-button--outline lv-btn-tool" disabled={making} onclick={() => applyStatus("inbox")}><LvIcon name="refresh" size={12} /> <span>{t.restore}</span></button>
                    <button class="b3-button b3-button--outline lv-btn-tool" style="color: var(--lv-color-danger)" disabled={making} onclick={removeChecked}><LvIcon name="trash" size={12} /> <span>{t.remove}</span></button>
                {/if}
                <button class="b3-button b3-button--small lv-btn-tool" disabled={making} onclick={() => (checked = [])}><span>{t.batchCancel}</span></button>
            </div>
        {/if}
        <div class="lv-list">
            {#each visible as item (item.blockID)}
                <div class="lv-row" class:lv-row--selected={checkedSet.has(item.blockID)}>
                    <input
                        type="checkbox"
                        class="lv-check"
                        aria-label={t.selectItem}
                        checked={checkedSet.has(item.blockID)}
                        onclick={(e: Event) => { e.stopPropagation(); toggle(item.blockID); }}
                    />
                    <button type="button" class="lv-content" onclick={() => toggle(item.blockID)}>
                        {#if titles.has(item.blockID)}
                            <div class="lv-text" title={titleOf(item)}>{snippetOf(item)}</div>
                        {:else}
                            <div class="lv-text"><LvSkeleton shape="row" count={1} height={14} /></div>
                        {/if}
                        <div class="lv-meta ft__smaller ft__on-surface">{new Date(item.addedAt).toLocaleString()}</div>
                    </button>
                    <button
                        class="b3-button b3-button--small lv-btn-ghost lv-btn-tool"
                        title={t.openSource}
                        disabled={Boolean(sourcePendingId)}
                        aria-busy={sourcePendingId === item.blockID}
                        onclick={(e: Event) => { e.stopPropagation(); void openSource(item.blockID); }}
                    >
                        <LvIcon name="eye" size={12} />
                        <span>{sourcePendingId === item.blockID ? (t.opening ?? "打开中…") : t.openSource}</span>
                    </button>
                </div>
            {/each}
        </div>
    {/if}
</LvPage>

<LvLive message={live} />

<style>
    .b3-button {
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
    .lv-inbox-search-input {
        width: 160px;
        height: 28px;
        padding: 0 calc(var(--lv-space-unit) * 5);
        border-radius: var(--lv-r-pill);
        font-size: var(--lv-type-control-size);
        touch-action: manipulation;
        transition: border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-2) var(--lv-ease);
        &:focus-visible,
        &:focus {
            outline: none;
            border-color: var(--lv-color-brand);
            box-shadow: var(--lv-focus-ring);
        }
    }
    .lv-inbox-error {
        color: var(--lv-color-danger);
        background: var(--lv-danger-soft);
        border: 1px solid var(--lv-danger-border);
        border-radius: var(--lv-r-m);
        padding: var(--lv-sp-2) var(--lv-sp-3);
        margin-bottom: var(--lv-sp-3);
        font-size: var(--lv-type-body-size);
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        max-width: 48em;
        text-wrap: pretty;
        line-height: var(--lv-lh-reading, 1.65);
    }
    .lv-batchbar {
        position: sticky;
        top: var(--lv-sp-2);
        z-index: var(--lv-z-review-peek);
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        flex-wrap: wrap;
        padding: calc(var(--lv-space-unit) * 3) var(--lv-sp-3);
        border: 1px solid var(--lv-primary-border);
        border-radius: var(--lv-r-m);
        background: var(--lv-primary-soft);
        box-shadow: var(--lv-shadow-2), var(--lv-inset-shine);
        margin-bottom: var(--lv-sp-3);
        animation: lv-modal-pop var(--lv-dur-1) var(--lv-ease);

        @supports (backdrop-filter: blur(10px)) or (-webkit-backdrop-filter: blur(10px)) {
            background: color-mix(in srgb, var(--lv-primary-soft) 85%, var(--lv-color-surface));
            backdrop-filter: blur(10px) saturate(1.15);
            -webkit-backdrop-filter: blur(10px) saturate(1.15);
        }
    }
    .lv-list {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);
    }
    .lv-row {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-3);
        padding: var(--lv-sp-3) var(--lv-sp-4);
        background: var(--lv-color-surface);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-l);
        box-shadow: var(--lv-shadow-1);
        content-visibility: auto;
        contain-intrinsic-size: 0 52px;
        transition: border-color var(--lv-dur-2) var(--lv-ease),
            box-shadow var(--lv-dur-2) var(--lv-ease),
            transform var(--lv-dur-1) var(--lv-ease);
        position: relative;
        cursor: default;
    }
    .lv-row:hover {
        transform: translateY(-1px);
        border-color: var(--lv-border-strong);
        box-shadow: var(--lv-shadow-2);
    }
    .lv-row--selected {
        background: color-mix(in srgb, var(--lv-primary-soft) 40%, var(--lv-color-surface));
        border-color: var(--lv-primary-border);
    }
    .lv-row--selected::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
        border-radius: var(--lv-r-m) 0 0 var(--lv-r-m);
        background: var(--lv-color-brand);
    }
    .lv-check { cursor: pointer; }
    .lv-content {
        flex: 1;
        min-width: 0;
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
    }
    .lv-content:focus-visible {
        outline: none;
        box-shadow: var(--lv-focus-ring);
        border-radius: var(--lv-r-s);
    }
    .lv-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lv-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }

    @media (max-width: 740px) {
        .lv-batchbar {
            flex-wrap: nowrap;
            overflow-x: auto;
            max-width: 100%;
            box-sizing: border-box;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
            &::-webkit-scrollbar { display: none; }
            .fn__flex-1 { display: none; }
            > * { flex: 0 0 auto; white-space: nowrap; }
        }
        .lv-row { flex-wrap: wrap; }
        .lv-row > .b3-button { margin-left: calc(var(--lv-space-unit) * 14); }
    }
    @media (max-width: 420px) {
        .lv-row {
            padding: var(--lv-sp-2) var(--lv-sp-3);
            gap: var(--lv-sp-2);
            .lv-content { flex-basis: calc(100% - 28px); }
            > .b3-button { width: calc(100% - 28px); margin-left: 28px; }
        }
    }
</style>
