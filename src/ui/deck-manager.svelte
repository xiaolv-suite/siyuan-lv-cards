<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "@/libs/notice";
    import {
        getRiffDecks,
        createRiffDeck,
        renameRiffDeck,
        removeRiffDeck,
        getRiffCards,
        addRiffCards,
        type RiffDeck,
    } from "@/api/riff";
    import { sqlQuery } from "@/api/siyuan";
    import { confirmDialog } from "@/libs/dialog";
    import {
        discoverLegacyDecks,
        syncDiscoveredDeckToRiff,
        mergeRiffDecks,
        findEmptyDecks,
        loadPinnedDeckIds,
        togglePinnedDeckId,
        sortDecksWithPins,
        getDeckEcosystemBadge,
        type DeckSortMode,
        type DiscoveredLegacyDeck,
        type RawScannedBlock,
    } from "@/core/deck-management";
    import { buildDeckDashboard, type DeckDashboardRow, type DeckDashDue } from "@/core/deck-dashboard";
    import { getBridgeSafely, openExamModuleSafely } from "@/libs/ecosystem-bridge-kit";
    import LvIcon from "./kit/LvIcon.svelte";

    interface Props {
        i18n: any;
        openReviewScope?: (scope: string, cram?: boolean) => void;
        openManagerDeck?: (deckID: string, deckName: string) => void;
        getRevlog?: () => any;
    }

    let {
        i18n,
        openReviewScope,
        openManagerDeck,
        getRevlog,
    }: Props = $props();

    const t = $derived(i18n);
    const hasExamBridge = $derived(Boolean(getBridgeSafely("exam")));

    let loading = $state(true);
    let scanning = $state(false);
    let busy = $state(false);
    let errorMsg = $state("");
    let noticeMsg = $state("");

    let decks = $state<RiffDeck[]>([]);
    let discoveredLegacy = $state<DiscoveredLegacyDeck[]>([]);
    let dashboardRows = $state<Map<string, DeckDashboardRow>>(new Map());

    let filterMode = $state<"all" | "active" | "empty" | "legacy">("all");
    let searchText = $state("");
    let pinnedDeckIds = $state<string[]>(loadPinnedDeckIds());
    let sortMode = $state<DeckSortMode>("default");

    function handleTogglePin(deckId: string) {
        pinnedDeckIds = togglePinnedDeckId(pinnedDeckIds, deckId);
    }

    // 新建卡包状态
    let newDeckName = $state("");
    let showNewDeckInput = $state(false);

    // 重命名卡包状态
    let editingDeckId = $state("");
    let editingDeckName = $state("");

    // 合并卡包状态
    let mergingDeckId = $state("");
    let targetMergeDeckId = $state("");
    let deleteSourceAfterMerge = $state(true);

    async function loadDecks() {
        loading = true;
        errorMsg = "";
        try {
            const rawDecks = await getRiffDecks();
            decks = rawDecks ?? [];

            // 聚合复习与保持率数据
            if (getRevlog) {
                const revlog = getRevlog();
                const entries = revlog?.entries ?? [];
                const dueMap = new Map<string, DeckDashDue>();
                for (const d of decks) {
                    dueMap.set(d.id, { due: 0, newCards: 0 });
                }
                const rows = buildDeckDashboard(entries, decks.map(d => d.id), dueMap);
                const map = new Map<string, DeckDashboardRow>();
                for (const r of rows) map.set(r.deckID, r);
                dashboardRows = map;
            }
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        } finally {
            loading = false;
        }
    }

    /**
     * 智能扫描思源全库存量与第三方插件卡包
     */
    async function scanLegacyAndForeignDecks() {
        if (scanning) return;
        scanning = true;
        noticeMsg = "";
        try {
            const query = `
                SELECT id, root_id, markdown, ial FROM blocks WHERE
                ial LIKE '%custom-riff-decks%' OR
                ial LIKE '%custom-flashcard-deck%' OR
                ial LIKE '%custom-deck%' OR
                ial LIKE '%custom-card-deck%' OR
                ial LIKE '%custom-card-pack%' OR
                ial LIKE '%custom-card-group%' OR
                markdown LIKE '%#deck/%' OR
                markdown LIKE '%#卡包/%' OR
                markdown LIKE '%#卡组/%'
                LIMIT 500
            `;
            const rows = await sqlQuery(query);
            if (Array.isArray(rows)) {
                const rawBlocks: RawScannedBlock[] = rows.map((r: any) => ({
                    id: String(r.id ?? ""),
                    root_id: r.root_id ? String(r.root_id) : undefined,
                    markdown: String(r.markdown ?? ""),
                    ial: String(r.ial ?? ""),
                }));
                discoveredLegacy = discoverLegacyDecks(rawBlocks, decks);
                if (discoveredLegacy.length > 0) {
                    noticeMsg = `扫描完成：发现 ${discoveredLegacy.length} 个存量/第三方插件卡包资产，可一键接入`;
                } else {
                    noticeMsg = "全库扫描完毕：当前所有闪卡已全部规范纳入原生卡包！";
                }
            }
        } catch (e: any) {
            errorMsg = `扫描存量卡包失败：${e?.message ?? String(e)}`;
        } finally {
            scanning = false;
        }
    }

    /**
     * 一键同步单个发现的存量/第三方卡包到原生 RiffDeck
     */
    async function syncDeck(item: DiscoveredLegacyDeck) {
        busy = true;
        try {
            const res = await syncDiscoveredDeckToRiff(item, {
                getRiffDecks,
                createRiffDeck,
                addRiffCards,
            });
            showMessage(`已将「${res.deckName}」（${res.addedCount} 张卡）成功接入小驴闪卡！`, 3000, "info");
            discoveredLegacy = discoveredLegacy.filter(d => d.name !== item.name);
            await loadDecks();
        } catch (e: any) {
            errorMsg = `接入卡包失败：${e?.message ?? String(e)}`;
        } finally {
            busy = false;
        }
    }

    /**
     * 一键全部接入所有发现的存量卡包
     */
    async function syncAllDiscovered() {
        if (discoveredLegacy.length === 0 || busy) return;
        busy = true;
        let totalCards = 0;
        let deckCount = 0;
        try {
            for (const item of [...discoveredLegacy]) {
                const res = await syncDiscoveredDeckToRiff(item, {
                    getRiffDecks,
                    createRiffDeck,
                    addRiffCards,
                });
                totalCards += res.addedCount;
                deckCount += 1;
            }
            showMessage(`成功全部接入 ${deckCount} 个存量卡包，共计 ${totalCards} 张闪卡！`, 3500, "info");
            discoveredLegacy = [];
            await loadDecks();
        } catch (e: any) {
            errorMsg = `批量接入失败：${e?.message ?? String(e)}`;
        } finally {
            busy = false;
        }
    }

    /**
     * 新建卡包
     */
    async function handleCreateDeck() {
        const name = newDeckName.trim();
        if (!name || busy) return;
        busy = true;
        try {
            await createRiffDeck(name);
            newDeckName = "";
            showNewDeckInput = false;
            showMessage(`卡包「${name}」已创建`, 2000, "info");
            await loadDecks();
        } catch (e: any) {
            errorMsg = `创建卡包失败：${e?.message ?? String(e)}`;
        } finally {
            busy = false;
        }
    }

    /**
     * 重命名卡包
     */
    async function handleRenameDeck(deckID: string) {
        const name = editingDeckName.trim();
        if (!name || !deckID || busy) return;
        busy = true;
        try {
            await renameRiffDeck(deckID, name);
            editingDeckId = "";
            editingDeckName = "";
            showMessage("卡包名称已更新", 2000, "info");
            await loadDecks();
        } catch (e: any) {
            errorMsg = `重命名失败：${e?.message ?? String(e)}`;
        } finally {
            busy = false;
        }
    }

    function askConfirm(title: string, content: string): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            confirmDialog({
                title,
                content,
                confirm: () => resolve(true),
                cancel: () => resolve(false),
            });
        });
    }

    /**
     * 删除卡包（安全确认：仅解散卡包，不删卡片块正文）
     */
    async function handleDeleteDeck(deck: RiffDeck) {
        if (busy) return;
        const confirmed = await askConfirm(
            (t.deckManagerDelete ?? "删除卡包") + `：${deck.name}`,
            (t.deckManagerDeletePrompt ?? "确定要删除卡包「${name}」吗？").replace("${name}", deck.name)
                + "\n\n" + (t.deckManagerDeleteSafeNote ?? "注意：仅解除卡包关联，原笔记中的卡片块完整保留在正文中。"),
        );
        if (!confirmed) return;
        busy = true;
        try {
            await removeRiffDeck(deck.id);
            showMessage(`卡包「${deck.name}」已删除`, 2000, "info");
            await loadDecks();
        } catch (e: any) {
            errorMsg = `删除卡包失败：${e?.message ?? String(e)}`;
        } finally {
            busy = false;
        }
    }

    /**
     * 合并卡包
     */
    async function handleMergeDeck(sourceDeckId: string) {
        if (!sourceDeckId || !targetMergeDeckId || sourceDeckId === targetMergeDeckId || busy) return;
        busy = true;
        try {
            const res = await mergeRiffDecks(sourceDeckId, targetMergeDeckId, {
                getRiffCards,
                addRiffCards,
                removeRiffDeck,
            }, { deleteSourceDeck: deleteSourceAfterMerge });
            showMessage((t.deckManagerMergedNotice ?? "已将 ${n} 张卡片合并至目标卡包").replace("${n}", String(res.mergedCount)), 3000, "info");
            mergingDeckId = "";
            targetMergeDeckId = "";
            await loadDecks();
        } catch (e: any) {
            errorMsg = `合并卡包失败：${e?.message ?? String(e)}`;
        } finally {
            busy = false;
        }
    }

    /**
     * 清理所有卡片数为 0 的冗余空卡包
     */
    async function handleCleanEmptyDecks() {
        const emptyDecks = findEmptyDecks(decks);
        if (emptyDecks.length === 0) {
            showMessage("当前没有需要清理的空卡包", 2000, "info");
            return;
        }
        const confirmed = await askConfirm(
            t.deckManagerCleanEmpty ?? "清理空卡包",
            `检测到 ${emptyDecks.length} 个卡片数为 0 的冗余空卡包（${emptyDecks.map(d => d.name).join("、")}），确定要批量清理吗？`,
        );
        if (!confirmed) return;
        busy = true;
        try {
            for (const d of emptyDecks) {
                await removeRiffDeck(d.id);
            }
            showMessage(`已清理 ${emptyDecks.length} 个空卡包`, 2500, "info");
            await loadDecks();
        } catch (e: any) {
            errorMsg = `清理空卡包失败：${e?.message ?? String(e)}`;
        } finally {
            busy = false;
        }
    }

    const totalCardsCount = $derived(decks.reduce((sum, d) => sum + (d.size ?? 0), 0));
    const emptyDecksCount = $derived(findEmptyDecks(decks).length);

    const filteredDecks = $derived.by(() => {
        let list = decks;
        if (filterMode === "active") list = list.filter(d => (d.size ?? 0) > 0);
        else if (filterMode === "empty") list = list.filter(d => (d.size ?? 0) === 0);

        if (searchText.trim()) {
            const q = searchText.trim().toLowerCase();
            list = list.filter(d => d.name.toLowerCase().includes(q));
        }
        return sortDecksWithPins(list, pinnedDeckIds, sortMode);
    });

    onMount(() => {
        void loadDecks();
        // 打开时自动做一次静默扫描，发现存量闪卡资产
        void scanLegacyAndForeignDecks();
    });
</script>

<div class="lv-deck-manager b3-typography" role="region" aria-label={t.deckManagerTitle ?? "卡包管理"}>
    <!-- 头部指标与操作区 -->
    <header class="lv-dm-header">
        <div class="lv-dm-header-main">
            <h2 class="lv-dm-title">
                <LvIcon name="cards" size={20} />
                <span>{t.deckManagerTitle ?? "卡包管理"}</span>
            </h2>
            <p class="lv-dm-subtitle">{t.deckManagerSubtitle ?? "统筹思源笔记全生态卡包资产：原生卡包、第三方插件卡包与标签卡包一键同步"}</p>
        </div>
        <div class="lv-dm-stats-pills">
            <span class="lv-dm-stat-pill">
                <strong>{decks.length}</strong> {t.deckManagerTotalDecks ?? "个卡包"}
            </span>
            <span class="lv-dm-stat-pill">
                <strong>{totalCardsCount}</strong> {t.deckManagerTotalCards ?? "张闪卡"}
            </span>
            {#if discoveredLegacy.length > 0}
                <span class="lv-dm-stat-pill lv-dm-stat-pill--warn">
                    <LvIcon name="zap" size={12} />
                    <strong>{discoveredLegacy.length}</strong> {t.deckManagerLegacyDiscovered ?? "待接入存量"}
                </span>
            {/if}
        </div>
    </header>

    <!-- 工具与操作栏 -->
    <div class="lv-dm-toolbar">
        <div class="lv-dm-actions">
            <button
                type="button"
                class="b3-button b3-button--small lv-btn-primary"
                disabled={busy}
                onclick={() => (showNewDeckInput = !showNewDeckInput)}
            >
                <LvIcon name="plus" size={13} /> <span>{t.deckManagerNewDeck ?? "新建卡包"}</span>
            </button>
            <button
                type="button"
                class="b3-button b3-button--small b3-button--outline"
                disabled={scanning || busy}
                onclick={scanLegacyAndForeignDecks}
                title="深度扫描思源正文中存量闪卡、第三方插件属性与 #deck 标签卡包"
            >
                {#if scanning}
                    <span aria-busy="true">…</span>
                {:else}
                    <LvIcon name="refresh" size={13} />
                {/if}
                <span>{scanning ? (t.deckManagerScanning ?? "正在扫描…") : (t.deckManagerScanLegacy ?? "扫描存量与第三方卡包")}</span>
            </button>
            {#if emptyDecksCount > 0}
                <button
                    type="button"
                    class="b3-button b3-button--small b3-button--text"
                    disabled={busy}
                    onclick={handleCleanEmptyDecks}
                    title="批量删除 0 张卡片的空卡包"
                >
                    <LvIcon name="trash" size={13} /> <span>{t.deckManagerCleanEmpty ?? "清理空卡包"} ({emptyDecksCount})</span>
                </button>
            {/if}
        </div>

        <div class="lv-dm-filters">
            <div class="lv-dm-segmented" role="group" aria-label="筛选">
                <button
                    type="button"
                    class="lv-dm-segment-btn"
                    class:lv-dm-segment-btn-active={filterMode === "all"}
                    onclick={() => (filterMode = "all")}
                >{t.deckManagerFilterAll ?? "全部"}</button>
                <button
                    type="button"
                    class="lv-dm-segment-btn"
                    class:lv-dm-segment-btn-active={filterMode === "active"}
                    onclick={() => (filterMode = "active")}
                >{t.deckManagerFilterActive ?? "活跃卡包"}</button>
                <button
                    type="button"
                    class="lv-dm-segment-btn"
                    class:lv-dm-segment-btn-active={filterMode === "empty"}
                    onclick={() => (filterMode = "empty")}
                >{t.deckManagerFilterEmpty ?? "空卡包"}</button>
                {#if discoveredLegacy.length > 0}
                    <button
                        type="button"
                        class="lv-dm-segment-btn lv-dm-segment-btn--highlight"
                        class:lv-dm-segment-btn-active={filterMode === "legacy"}
                        onclick={() => (filterMode = "legacy")}
                    >{t.deckManagerFilterLegacy ?? "待接入存量"} ({discoveredLegacy.length})</button>
                {/if}
            </div>
            <input
                class="b3-text-field lv-dm-search-input"
                bind:value={searchText}
                placeholder="搜索卡包名称…"
                aria-label="搜索卡包"
            />
            <select
                class="b3-select lv-dm-sort-select"
                bind:value={sortMode}
                aria-label="卡包排序方案"
            >
                <option value="default">默认排序</option>
                <option value="size-desc">卡片最多</option>
                <option value="name-asc">名称 A-Z</option>
            </select>
        </div>
    </div>

    <!-- 新建卡包内联输入框 -->
    {#if showNewDeckInput}
        <div class="lv-dm-new-card-row">
            <input
                class="b3-text-field fn__flex-1"
                bind:value={newDeckName}
                placeholder="输入新卡包名称，例如「考研英语核心词」"
                aria-label="新卡包名称"
                onkeydown={(e) => { if (e.isComposing || e.keyCode === 229) return; if (e.key === "Enter") handleCreateDeck(); }}
            />
            <button
                type="button"
                class="b3-button b3-button--small lv-btn-primary"
                disabled={!newDeckName.trim() || busy}
                onclick={handleCreateDeck}
            >创建</button>
            <button
                type="button"
                class="b3-button b3-button--small b3-button--cancel"
                onclick={() => { showNewDeckInput = false; newDeckName = ""; }}
            >取消</button>
        </div>
    {/if}

    <!-- 提示与错误通知 -->
    {#if errorMsg}
        <div class="lv-dm-error-banner" role="alert">
            <LvIcon name="warning" size={14} /> <span>{errorMsg}</span>
        </div>
    {/if}
    {#if noticeMsg}
        <div class="lv-dm-notice-banner" role="status">
            <LvIcon name="check" size={14} /> <span>{noticeMsg}</span>
        </div>
    {/if}

    <!-- 扫描发现的存量与第三方插件卡包接入区 -->
    {#if discoveredLegacy.length > 0 && (filterMode === "all" || filterMode === "legacy")}
        <section class="lv-dm-discovered-section" aria-label="待接入存量卡包">
            <div class="lv-dm-discovered-head">
                <div class="lv-dm-discovered-title">
                    <LvIcon name="zap" size={15} />
                    <strong>发现 {discoveredLegacy.length} 个思源存量 / 第三方插件卡包（可一键同步接入）</strong>
                </div>
                <button
                    type="button"
                    class="b3-button b3-button--small lv-btn-primary"
                    disabled={busy}
                    onclick={syncAllDiscovered}
                >
                    <LvIcon name="swap" size={13} /> <span>{t.deckManagerSyncAll ?? "一键全部接入"}</span>
                </button>
            </div>
            <div class="lv-dm-discovered-grid">
                {#each discoveredLegacy as item (item.name)}
                    <div class="lv-dm-discovered-card">
                        <div class="lv-dm-disc-main">
                            <div class="lv-dm-disc-name">
                                <strong>{item.name}</strong>
                                <span class="lv-chip-source">{item.sourcePlugin ?? "存量卡包"}</span>
                            </div>
                            <div class="ft__smaller ft__on-surface">
                                包含 {item.blockIDs.length} 张闪卡
                                {#if item.sampleBlockContent}
                                    <span class="lv-dm-disc-sample" title={item.sampleBlockContent}>· 样例：{item.sampleBlockContent}</span>
                                {/if}
                            </div>
                        </div>
                        <button
                            type="button"
                            class="b3-button b3-button--small b3-button--outline"
                            disabled={busy}
                            onclick={() => syncDeck(item)}
                        >
                            <LvIcon name="plus" size={12} /> <span>{t.deckManagerSyncSingle ?? "接入"}</span>
                        </button>
                    </div>
                {/each}
            </div>
        </section>
    {/if}

    <!-- 正式 Riff 卡包列表 -->
    {#if filterMode !== "legacy"}
        {#if loading}
            <div class="lv-dm-loading" role="status">
                <LvIcon name="refresh" size={18} /> <span>正在加载卡包列表…</span>
            </div>
        {:else if filteredDecks.length === 0}
            <div class="lv-dm-empty">
                <LvIcon name="cards" size={32} />
                <p>未找到符合条件的卡包</p>
                <button
                    type="button"
                    class="b3-button b3-button--small lv-btn-primary"
                    onclick={() => (showNewDeckInput = true)}
                >新建第一个卡包</button>
            </div>
        {:else}
            <div class="lv-dm-grid">
	                {#each filteredDecks as deck (deck.id)}
	                    {@const stats = dashboardRows.get(deck.id)}
	                    {@const ecoBadge = getDeckEcosystemBadge(deck.name)}
	                    <div class="lv-dm-deck-card">
	                        <!-- 卡包头部与名称 -->
	                        <div class="lv-dm-card-head">
	                            <div class="lv-dm-deck-meta">
	                                {#if editingDeckId === deck.id}
	                                    <div class="lv-dm-rename-box">
	                                        <input
	                                            class="b3-text-field"
	                                            bind:value={editingDeckName}
	                                            aria-label="修改卡包名称"
                                            onkeydown={(e) => {
                                                if (e.isComposing || e.keyCode === 229) return;
                                                if (e.key === "Enter") handleRenameDeck(deck.id);
                                                else if (e.key === "Escape") editingDeckId = "";
                                            }}
	                                        />
	                                        <button class="b3-button b3-button--small lv-btn-primary" onclick={() => handleRenameDeck(deck.id)}>保存</button>
	                                        <button class="b3-button b3-button--small b3-button--cancel" onclick={() => (editingDeckId = "")}>取消</button>
	                                    </div>
	                                {:else}
	                                    <button
	                                        type="button"
	                                        class="lv-dm-deck-name-btn"
	                                        title={deck.name}
	                                        onclick={() => openManagerDeck?.(deck.id, deck.name)}
	                                    >
	                                        <LvIcon name="cards" size={16} />
	                                        <h3 class="lv-dm-deck-name">{deck.name}</h3>
	                                    </button>
	                                {/if}
	                                {#if pinnedDeckIds.includes(deck.id)}
	                                    <span class="lv-dm-pinned-chip" title="置顶卡包"><LvIcon name="star" size={11} /> 置顶</span>
	                                {/if}
	                                {#if ecoBadge}
	                                    <span class="lv-dm-origin-chip lv-dm-origin-chip--{ecoBadge.origin}">
                                        <LvIcon name={ecoBadge.icon} size={11} /> {ecoBadge.label}
                                    </span>
                                {:else}
                                    <span class="lv-dm-origin-chip">思源原生</span>
                                {/if}
                            </div>
                        </div>

                        <!-- 卡包数据概览指标 -->
                        <div class="lv-dm-metrics">
                            <div class="lv-dm-metric">
                                <span class="lv-dm-metric-label">卡片总量</span>
                                <span class="lv-dm-metric-value">{deck.size ?? 0}</span>
                            </div>
                            <div class="lv-dm-metric">
                                <span class="lv-dm-metric-label">7天作答</span>
                                <span class="lv-dm-metric-value">{stats?.reviews7 ?? 0}</span>
                            </div>
                            <div class="lv-dm-metric">
                                <span class="lv-dm-metric-label">保持率</span>
                                <span class="lv-dm-metric-value">{stats?.retention !== null && stats?.retention !== undefined ? `${stats.retention}%` : "—"}</span>
                            </div>
                        </div>

                        <!-- 合并模式控制 -->
                        {#if mergingDeckId === deck.id}
                            <div class="lv-dm-merge-box">
                                <span class="ft__smaller ft__on-surface">合并到目标卡包：</span>
                                <select
                                    class="b3-select fn__flex-1"
                                    aria-label="选择合并目标卡包"
                                    bind:value={targetMergeDeckId}
                                    onchange={(e) => { targetMergeDeckId = e.currentTarget.value; }}
                                >
                                    <option value="">选择目标卡包…</option>
                                    {#each decks.filter(d => d.id !== deck.id) as targetDeck (targetDeck.id)}
                                        <option value={targetDeck.id}>{targetDeck.name}</option>
                                    {/each}
                                </select>
                                <label class="lv-dm-merge-opt">
                                    <input type="checkbox" bind:checked={deleteSourceAfterMerge} class="lv-check" />
                                    <span>{t.deckManagerDeleteSourceAfterMerge ?? "合并后删除源卡包"}</span>
                                </label>
                                <button
                                    type="button"
                                    class="b3-button b3-button--small lv-btn-primary"
                                    disabled={!targetMergeDeckId || busy}
                                    onclick={() => handleMergeDeck(deck.id)}
                                >确认合并</button>
                                <button
                                    type="button"
                                    class="b3-button b3-button--small b3-button--cancel"
                                    onclick={() => { mergingDeckId = ""; targetMergeDeckId = ""; }}
                                >取消</button>
                            </div>
                        {/if}

                        <!-- 卡包动作栏 -->
                        <div class="lv-dm-card-actions">
                            <button
                                type="button"
                                class="b3-button b3-button--small lv-btn-primary"
                                disabled={(deck.size ?? 0) === 0}
                                onclick={() => openReviewScope?.(`deck:${deck.id}`)}
                                title="开始正式记忆复习"
                            >
                                <LvIcon name="learn" size={13} /> <span>复习</span>
                            </button>
                            <button
                                type="button"
                                class="b3-button b3-button--small b3-button--outline"
                                disabled={(deck.size ?? 0) === 0}
                                onclick={() => openReviewScope?.(`deck:${deck.id}`, true)}
                                title="突击练习（全量刷题，不记入正式 FSRS 遗忘惩罚）"
                            >
                                <LvIcon name="zap" size={13} /> <span>突击</span>
                            </button>
                            <button
                                type="button"
                                class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                                onclick={() => openManagerDeck?.(deck.id, deck.name)}
                                title="查看并管理此卡包内的具体闪卡内容"
                            >
                                <LvIcon name="cards" size={13} /> <span>查看闪卡</span>
                            </button>
                            {#if ecoBadge?.origin === "exam" && hasExamBridge}
                                <button
                                    type="button"
                                    class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                                    onclick={() => openExamModuleSafely("practice")}
                                    title="直达小驴考试练习台刷题"
                                >
                                    <LvIcon name="graduation" size={13} /> <span>考试台</span>
                                </button>
                            {/if}
                            <button
                                type="button"
                                class="b3-button b3-button--small lv-btn-ghost lv-btn-tool"
                                class:lv-btn-pinned={pinnedDeckIds.includes(deck.id)}
                                onclick={() => handleTogglePin(deck.id)}
                                title={pinnedDeckIds.includes(deck.id) ? "取消置顶" : "置顶卡包"}
                            >
                                <LvIcon name="star" size={13} />
                            </button>
                            <button
                                type="button"
                                class="b3-button b3-button--small lv-btn-ghost lv-btn-tool"
                                onclick={() => { editingDeckId = deck.id; editingDeckName = deck.name; }}
                                title="重命名卡包"
                            >
                                <LvIcon name="edit" size={13} />
                            </button>
                            <button
                                type="button"
                                class="b3-button b3-button--small lv-btn-ghost lv-btn-tool"
                                onclick={() => { mergingDeckId = deck.id; targetMergeDeckId = ""; }}
                                title="合并卡片到其他卡包"
                            >
                                <LvIcon name="swap" size={13} />
                            </button>
                            <button
                                type="button"
                                class="b3-button b3-button--small lv-btn-ghost lv-btn-tool lv-btn-danger"
                                onclick={() => handleDeleteDeck(deck)}
                                title="删除卡包（原卡片块完整保留在笔记正文中）"
                            >
                                <LvIcon name="trash" size={13} />
                            </button>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    {/if}
</div>

<style>
    .lv-deck-manager {
        padding: var(--lv-sp-4);
        max-width: 1200px;
        margin: 0 auto;
    }
    .lv-dm-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--lv-sp-3);
        margin-bottom: var(--lv-sp-4);
        padding-bottom: var(--lv-sp-3);
        border-bottom: 1px solid var(--lv-border);
    }
    .lv-dm-title {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 0 0 2px;
        font-size: 16px;
        font-weight: 600;
        color: var(--lv-color-text);
    }
    .lv-dm-subtitle {
        margin: 0;
        font-size: 12px;
        color: var(--lv-color-text-muted);
    }
    .lv-dm-stats-pills {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .lv-dm-stat-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: var(--lv-r-tag);
        background: var(--lv-color-surface);
        border: 1px solid var(--lv-border);
        font-size: 12px;
        strong {
            font-size: 13px;
        }
    }
    .lv-dm-stat-pill--warn {
        border-color: color-mix(in srgb, var(--lv-color-warning) 50%, transparent);
        background: color-mix(in srgb, var(--lv-color-warning) 12%, transparent);
        color: var(--lv-color-warning);
    }
    .lv-dm-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-4);
    }
    .lv-dm-actions {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .lv-dm-filters {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .lv-dm-segmented {
        display: inline-flex;
        padding: 2px;
        background: var(--lv-color-surface);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        gap: 2px;
    }
    .lv-dm-segment-btn {
        padding: 3px 10px;
        border-radius: calc(var(--lv-r-m) - 2px);
        font-size: var(--lv-type-caption-size);
        border: none;
        background: transparent;
        color: var(--lv-color-text-muted);
        cursor: pointer;
    }
    .lv-dm-segment-btn-active {
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
        font-weight: var(--lv-fw-bold);
    }
    .lv-dm-segment-btn--highlight {
        color: var(--lv-color-warning);
    }
    .lv-dm-search-input {
        width: 160px;
        font-size: var(--lv-type-caption-size);
    }
    .lv-dm-new-card-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: var(--lv-sp-3);
        padding: 10px 14px;
        background: var(--lv-primary-soft);
        border: 1px solid var(--lv-primary-border);
        border-radius: var(--lv-r-m);
    }
    .lv-dm-discovered-section {
        margin-bottom: var(--lv-sp-4);
        padding: 14px 16px;
        border-radius: var(--lv-r-l);
        background: color-mix(in srgb, var(--lv-color-warning) 6%, var(--lv-color-surface));
        border: 1px solid color-mix(in srgb, var(--lv-color-warning) 30%, transparent);
    }
    .lv-dm-discovered-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
    }
    .lv-dm-discovered-title {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--lv-color-warning);
        font-size: 13px;
        font-weight: 600;
    }
    .lv-dm-discovered-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
        gap: var(--lv-sp-2);
    }
    .lv-dm-discovered-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        background: var(--lv-color-surface);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
    }
    .lv-chip-source {
        font-size: 10px;
        padding: 1px 5px;
        border-radius: 3px;
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
    }
    .lv-dm-disc-sample {
        color: var(--lv-color-text-muted);
        display: inline-block;
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        vertical-align: bottom;
    }
    .lv-dm-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
        gap: var(--lv-sp-3);
    }
    .lv-dm-deck-card {
        padding: 14px 16px;
        background: var(--lv-color-surface);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-l);
        box-shadow: var(--lv-shadow-1);
        display: flex;
        flex-direction: column;
        gap: 10px;
        transition: border-color 0.15s ease;
        &:hover {
            border-color: var(--lv-primary-border);
        }
    }
    .lv-dm-deck-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        min-width: 0;
        gap: 8px;
    }
    .lv-dm-deck-name-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: transparent;
        border: none;
        padding: 0;
        cursor: pointer;
        text-align: left;
        min-width: 0;
        flex: 1 1 auto;
    }
    .lv-dm-deck-name {
        margin: 0;
        font-size: 15px;
        color: var(--lv-color-text);
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        &:hover {
            color: var(--lv-color-brand);
        }
    }
    .lv-dm-pinned-chip {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 4px;
        background: color-mix(in srgb, var(--b3-theme-primary) 15%, transparent);
        color: var(--b3-theme-primary);
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 3px;
        flex-shrink: 0;
    }
    .lv-btn-pinned {
        color: var(--lv-color-warning) !important;
    }
    .lv-dm-sort-select {
        height: 26px;
        line-height: 24px;
        font-size: 12px;
        padding: 0 6px;
        max-width: 105px;
    }
    .lv-dm-origin-chip {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 4px;
        background: color-mix(in srgb, var(--lv-color-text-muted) 15%, transparent);
        color: var(--lv-color-text-muted);
        flex-shrink: 0;
    }
    .lv-dm-metrics {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-radius: var(--lv-r-m);
        background: color-mix(in srgb, var(--lv-border) 25%, var(--lv-color-surface));
    }
    .lv-dm-metric {
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    .lv-dm-metric-label {
        font-size: 11px;
        color: var(--lv-color-text-muted);
    }
    .lv-dm-metric-value {
        font-size: 14px;
        font-weight: var(--lv-fw-bold);
        color: var(--lv-color-text);
    }
    .lv-dm-merge-box,
    .lv-dm-rename-box {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        padding: 6px;
        background: var(--lv-primary-soft);
        border-radius: var(--lv-r-s);
    }
    .lv-dm-merge-opt {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: var(--lv-color-text-muted);
        cursor: pointer;
        user-select: none;
    }
    .lv-dm-card-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: auto;
        padding-top: 6px;
        border-top: 1px solid var(--lv-border);
    }
    .lv-dm-error-banner {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: var(--lv-sp-3);
        padding: 8px 12px;
        background: color-mix(in srgb, var(--lv-color-danger) 10%, var(--lv-color-surface));
        color: var(--lv-color-danger);
        border-radius: var(--lv-r-m);
        font-size: var(--lv-type-caption-size);
    }
    .lv-dm-notice-banner {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: var(--lv-sp-3);
        padding: 8px 12px;
        background: color-mix(in srgb, var(--lv-color-success) 10%, var(--lv-color-surface));
        color: var(--lv-color-success);
        border-radius: var(--lv-r-m);
        font-size: var(--lv-type-caption-size);
    }
    .lv-dm-loading,
    .lv-dm-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 48px 16px;
        color: var(--lv-color-text-muted);
    }

    @media (max-width: 560px) {
        .lv-deck-manager {
            padding: var(--lv-sp-3);
        }
        .lv-dm-header {
            gap: var(--lv-sp-2);
            margin-bottom: var(--lv-sp-3);
            padding-bottom: var(--lv-sp-2);
        }
        .lv-dm-stats-pills {
            flex-wrap: wrap;
        }
        .lv-dm-toolbar {
            flex-direction: column;
            align-items: stretch;
            gap: var(--lv-sp-2);
            margin-bottom: var(--lv-sp-3);
        }
        .lv-dm-actions {
            flex-wrap: wrap;
            gap: var(--lv-sp-2);
        }
        .lv-dm-filters {
            flex-wrap: wrap;
            width: 100%;
            min-width: 0;
            gap: var(--lv-sp-2);
        }
        .lv-dm-segmented {
            display: flex;
            width: 100%;
            max-width: 100%;
            overflow-x: auto;
            scrollbar-width: none;
            flex-wrap: nowrap;
            -webkit-overflow-scrolling: touch;
            &::-webkit-scrollbar { display: none; }
        }
        .lv-dm-segment-btn {
            flex: none;
            white-space: nowrap;
        }
        .lv-dm-search-input {
            flex: 1 1 140px;
            min-width: 0;
            width: auto;
        }
        .lv-dm-sort-select {
            flex: none;
            max-width: 118px;
        }
        .lv-dm-discovered-head {
            flex-wrap: wrap;
            gap: var(--lv-sp-2);
        }
        .lv-dm-deck-card {
            padding: var(--lv-sp-3);
        }
        .lv-dm-card-actions {
            flex-wrap: wrap;
            gap: var(--lv-sp-1);
        }
    }

    @container lv-hub (max-width: 560px) {
        .lv-deck-manager {
            padding: var(--lv-sp-3);
        }
        .lv-dm-header {
            gap: var(--lv-sp-2);
            margin-bottom: var(--lv-sp-3);
            padding-bottom: var(--lv-sp-2);
        }
        .lv-dm-stats-pills {
            flex-wrap: wrap;
        }
        .lv-dm-toolbar {
            flex-direction: column;
            align-items: stretch;
            gap: var(--lv-sp-2);
            margin-bottom: var(--lv-sp-3);
        }
        .lv-dm-actions {
            flex-wrap: wrap;
            gap: var(--lv-sp-2);
        }
        .lv-dm-filters {
            flex-wrap: wrap;
            width: 100%;
            min-width: 0;
            gap: var(--lv-sp-2);
        }
        .lv-dm-segmented {
            display: flex;
            width: 100%;
            max-width: 100%;
            overflow-x: auto;
            scrollbar-width: none;
            flex-wrap: nowrap;
            -webkit-overflow-scrolling: touch;
            &::-webkit-scrollbar { display: none; }
        }
        .lv-dm-segment-btn {
            flex: none;
            white-space: nowrap;
        }
        .lv-dm-search-input {
            flex: 1 1 140px;
            min-width: 0;
            width: auto;
        }
        .lv-dm-sort-select {
            flex: none;
            max-width: 118px;
        }
        .lv-dm-discovered-head {
            flex-wrap: wrap;
            gap: var(--lv-sp-2);
        }
        .lv-dm-deck-card {
            padding: var(--lv-sp-3);
        }
        .lv-dm-card-actions {
            flex-wrap: wrap;
            gap: var(--lv-sp-1);
        }
    }
</style>
