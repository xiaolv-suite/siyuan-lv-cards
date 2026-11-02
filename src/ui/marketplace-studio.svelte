<script lang="ts">
    import LvIcon from "./kit/LvIcon.svelte";
    import {
        type MarketplaceCatalog,
        type MarketplaceItem,
        type MarketplaceCategory,
        DEFAULT_MARKETPLACE_CATALOG,
        filterMarketplaceItems,
        marketplaceItemToLvCardsPackage,
    } from "@/core/marketplace";
    import {
        fetchMarketplaceCatalog,
        installMarketplaceItemToDeck,
        loadMarketplaceSources,
        saveMarketplaceSources,
        type CustomMarketplaceSource,
    } from "@/core/marketplace-service";
    import { serializeLvCardsPackage } from "@/core/lvcards-package";
    import { showMessage } from "siyuan";

    interface Props {
        i18n: any;
        onDeckCreated?: (deckId: string, deckName: string) => void;
        onOpenDeck?: (deckId: string, deckName: string) => void;
    }

    let { i18n, onDeckCreated, onOpenDeck }: Props = $props();

    let catalog = $state<MarketplaceCatalog>(DEFAULT_MARKETPLACE_CATALOG);
    let searchQuery = $state("");
    let selectedCategory = $state<MarketplaceCategory>("all");
    let previewItemId = $state<string | null>(null);
    let previewFlipped = $state<Record<string, boolean>>({});
    let installingId = $state<string | null>(null);
    let installedDeckIds = $state<Record<string, { deckId: string; deckName: string }>>({});

    // 自定义订阅源管理
    let customSources = $state<CustomMarketplaceSource[]>([]);
    let currentSourceUrl = $state<string>("official");
    let addSourcePanelOpen = $state(false);
    let newSourceName = $state("");
    let newSourceUrl = $state("");
    let loadingCatalog = $state(false);
    let catalogError = $state<string | null>(null);

    $effect(() => {
        customSources = loadMarketplaceSources();
        void refreshCatalog(currentSourceUrl);
    });

    async function refreshCatalog(url: string) {
        loadingCatalog = true;
        catalogError = null;
        try {
            const res = await fetchMarketplaceCatalog(url);
            catalog = res.catalog;
            if (res.error) {
                catalogError = res.error;
            }
        } catch (e) {
            catalogError = String(e instanceof Error ? e.message : e);
        } finally {
            loadingCatalog = false;
        }
    }

    const filteredItems = $derived(
        filterMarketplaceItems(catalog.items, searchQuery, selectedCategory),
    );

    const totalCardCount = $derived(
        catalog.items.reduce((sum, item) => sum + (item.itemCount || 0), 0),
    );

    async function handleInstall(item: MarketplaceItem) {
        if (installingId) return;
        installingId = item.id;
        try {
            const res = await installMarketplaceItemToDeck(item);
            if (res.success && res.deckId) {
                installedDeckIds[item.id] = { deckId: res.deckId, deckName: res.deckName || item.title };
                installedDeckIds = { ...installedDeckIds };
                showMessage(`已成功获取《${item.title}》并入库（共 ${res.count} 张闪卡）✓`, 3200, "info");
                onDeckCreated?.(res.deckId, res.deckName || item.title);
            } else {
                showMessage(`入库失败：${res.error || "未知原因"}`, 3500, "error");
            }
        } catch (e) {
            showMessage(`入库发生异常：${String(e instanceof Error ? e.message : e)}`, 3500, "error");
        } finally {
            installingId = null;
        }
    }

    function handleExportLvCards(item: MarketplaceItem) {
        try {
            const pkg = marketplaceItemToLvCardsPackage(item);
            const jsonStr = serializeLvCardsPackage(pkg.deck, pkg.cards);
            const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${item.title}.lvcards`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showMessage(`已导出《${item.title}》闪卡分享包 (.lvcards) ✓`, 2800, "info");
        } catch (e) {
            showMessage(`导出闪卡包失败：${String(e instanceof Error ? e.message : e)}`, 3500, "error");
        }
    }

    function handleAddCustomSource() {
        const name = newSourceName.trim();
        const url = newSourceUrl.trim();
        if (!name || !url) {
            showMessage("请完整填写订阅源名称与直链 URL", 2500, "error");
            return;
        }
        const newSrc: CustomMarketplaceSource = {
            id: "src-" + Date.now(),
            name,
            url,
            enabled: true,
            addedAt: new Date().toISOString().slice(0, 10),
        };
        customSources = [...customSources, newSrc];
        saveMarketplaceSources(customSources);
        newSourceName = "";
        newSourceUrl = "";
        addSourcePanelOpen = false;
        currentSourceUrl = url;
        void refreshCatalog(url);
        showMessage(`已添加并切换至第三方订阅源「${name}」✓`, 2800, "info");
    }

    const categories: Array<{ id: MarketplaceCategory; label: string }> = [
        { id: "all", label: "全部领域" },
        { id: "math", label: "📐 数理公式" },
        { id: "computer", label: "💻 计算机/408" },
        { id: "language", label: "🔤 外语词汇" },
        { id: "qualification", label: "⚖️ 法考/公考" },
        { id: "humanities", label: "📖 人文经典" },
        { id: "science", label: "🔬 经典物理" },
        { id: "general", label: "💡 逻辑/通识" },
    ];

    function getCategoryColor(cat: MarketplaceCategory): string {
        switch (cat) {
            case "math": return "var(--lv-brand, #3b82f6)";
            case "computer": return "var(--lv-info, #0ea5e9)";
            case "language": return "var(--lv-success, #10b981)";
            case "qualification": return "var(--lv-danger, #ef4444)";
            case "humanities": return "var(--lv-warning, #f59e0b)";
            case "science": return "var(--lv-brand-secondary, #6366f1)";
            case "general": return "var(--lv-brand, #3b82f6)";
            default: return "var(--b3-theme-surface)";
        }
    }
</script>

<div class="lv-marketplace-studio">
    <!-- 顶栏与生态大标题 -->
    <div class="lv-market-head">
        <div class="lv-market-head-main">
            <h1 class="lv-market-title">
                <span class="lv-market-icon">🏛️</span>
                <span>{i18n?.marketplaceTitle || "闪卡与知识公共集市"}</span>
            </h1>
            <span class="lv-market-badge">公版精选 · 零版权争议</span>
            <span class="lv-market-subtitle">
                {i18n?.marketplaceSubtitle || "去中心化公共知识集市。精选公共领域常识、国家新课标与学术公式，支持第三方直链订阅与 FSRS 一键入库。"}
            </span>
        </div>
        <div class="lv-market-actions">
            <button
                type="button"
                class="lv-btn sm lv-btn--ghost"
                onclick={() => (addSourcePanelOpen = !addSourcePanelOpen)}
                title="添加自定义第三方网络订阅源"
            >
                <LvIcon name="plus" size={13} />
                <span>{addSourcePanelOpen ? "收起订阅设置" : "➕ 自定义订阅源"}</span>
            </button>
        </div>
    </div>

    <!-- 添加外部订阅源折叠面板 -->
    {#if addSourcePanelOpen}
        <div class="lv-market-source-panel">
            <div class="lv-market-source-title">🔗 添加第三方网络订阅源 (URL)</div>
            <p class="lv-market-source-desc">
                支持输入托管在 GitHub Gist、自建服务器或开放网盘的 <code>catalog.json</code> 订阅直链（模式同开源阅读书源），思源客户端直连拉取，官方零存储、零中转。
            </p>
            <div class="lv-market-source-inputs">
                <input
                    class="lv-input"
                    style="flex: 1; min-width: 160px;"
                    bind:value={newSourceName}
                    placeholder="订阅源名称（如：考研专业课精选源）"
                />
                <input
                    class="lv-input"
                    style="flex: 2; min-width: 260px;"
                    bind:value={newSourceUrl}
                    placeholder="https://example.com/catalog.json"
                />
                <button type="button" class="lv-btn sm lv-btn--primary" onclick={handleAddCustomSource}>
                    添加并载入
                </button>
            </div>
            {#if customSources.length > 0}
                <div class="lv-market-source-chips">
                    <span class="lv-muted" style="font-size: 12px;">已添加订阅源：</span>
                    {#each customSources as src (src.id)}
                        <button
                            type="button"
                            class="lv-chip sm"
                            class:active={currentSourceUrl === src.url}
                            onclick={() => { currentSourceUrl = src.url; void refreshCatalog(src.url); }}
                        >
                            {src.name}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}

    <!-- 集市全局生态统计概览 -->
    <div class="lv-market-stats-card">
        <div class="lv-market-stats-row">
            <div class="lv-market-stat-item">
                <span class="lv-stat-emoji">🏛️</span>
                <div>
                    <div class="lv-stat-label">公版精选卡包</div>
                    <div class="lv-stat-value brand">{catalog.items.length} 门核心学科</div>
                </div>
            </div>
            <div class="lv-stat-divider"></div>
            <div class="lv-market-stat-item">
                <span class="lv-stat-emoji">🗂️</span>
                <div>
                    <div class="lv-stat-label">卡片覆盖总量</div>
                    <div class="lv-stat-value success">{totalCardCount}+ 深度记忆卡</div>
                </div>
            </div>
            <div class="lv-stat-divider"></div>
            <div class="lv-market-stat-item">
                <span class="lv-stat-emoji">🛡️</span>
                <div>
                    <div class="lv-stat-label">知识版权安全</div>
                    <div class="lv-stat-value">100% 公有领域 / CC-BY / MIT</div>
                </div>
            </div>
        </div>
        <div class="lv-market-stats-meta">
            <span class="lv-chip sm lv-chip--acc">双向生态互通</span>
            <span>支持开箱一键入库，并可导出 <code>.lvcards</code> 标准包</span>
        </div>
    </div>

    <!-- 搜索与领域分类工具栏 -->
    <div class="lv-market-filter-card">
        <div class="lv-market-filter-top">
            <div class="lv-market-search-box">
                <input
                    class="lv-input lv-market-search-input"
                    bind:value={searchQuery}
                    placeholder="🔍 搜索题库、卡包或考点关键词（如：TCP、导数、四六级、民法典、逻辑）..."
                />
                {#if searchQuery}
                    <button
                        type="button"
                        class="lv-btn sm lv-btn--ghost lv-search-clear"
                        onclick={() => (searchQuery = "")}
                    >
                        ✕
                    </button>
                {/if}
            </div>

            <div class="lv-market-source-selector">
                <button
                    type="button"
                    class="lv-chip sm"
                    class:active={currentSourceUrl === "official"}
                    onclick={() => { currentSourceUrl = "official"; void refreshCatalog("official"); }}
                >
                    🌐 官方精选公版源
                </button>
                {#if customSources.length > 0}
                    <select
                        class="lv-select sm"
                        bind:value={currentSourceUrl}
                        onchange={(e) => void refreshCatalog((e.target as HTMLSelectElement).value)}
                    >
                        <option value="official">官方精选公版源</option>
                        {#each customSources as cs (cs.id)}
                            <option value={cs.url}>{cs.name}</option>
                        {/each}
                    </select>
                {/if}
            </div>
        </div>

        <!-- 领域分类胶囊 -->
        <div class="lv-market-categories">
            {#each categories as cat (cat.id)}
                {@const count = cat.id === "all" ? catalog.items.length : catalog.items.filter((i) => i.category === cat.id).length}
                <button
                    type="button"
                    class="lv-chip"
                    class:active={selectedCategory === cat.id}
                    onclick={() => (selectedCategory = cat.id)}
                >
                    {cat.label} <span class="lv-muted" style="font-size: 11px;">({count})</span>
                </button>
            {/each}
        </div>
    </div>

    {#if catalogError}
        <div class="lv-market-error-banner">
            <LvIcon name="warning" size={14} />
            <span>{catalogError}</span>
        </div>
    {/if}

    <!-- 卡片网格展示 (宽幅响应式布局) -->
    {#if loadingCatalog}
        <div class="lv-market-loading">
            <LvIcon name="timer" size={32} />
            <div style="margin-top: 10px; font-size: 14px;">正在拉取知识集市资源列表…</div>
        </div>
    {:else if filteredItems.length === 0}
        <div class="lv-market-empty">
            <LvIcon name="cards" size={36} />
            <div class="lv-empty-title">未找到匹配的闪卡包</div>
            <p class="lv-empty-desc">尝试清空关键词或切换上方的学科分类。</p>
        </div>
    {:else}
        <div class="lv-market-grid">
            {#each filteredItems as item (item.id)}
                {@const installed = installedDeckIds[item.id]}
                {@const isInstalling = installingId === item.id}
                <div
                    class="lv-card lv-deck-card"
                    style="border-top: 4px solid {getCategoryColor(item.category)};"
                >
                    <div class="lv-deck-card-body">
                        <div class="lv-deck-card-header">
                            <span class="lv-chip sm lv-chip--acc">
                                {item.kind === "both" ? "题卡通用" : item.kind === "flashcard_deck" ? "记忆闪卡" : "题库试卷"}
                            </span>
                            <div class="lv-deck-header-meta">
                                {#if item.verified}
                                    <span class="lv-chip sm verified-tag" title="零版权争议认证">
                                        ✓ 公版认证
                                    </span>
                                {/if}
                                <span class="lv-deck-count num">{item.itemCount} 张卡</span>
                            </div>
                        </div>

                        <h3 class="lv-deck-card-title">{item.title}</h3>
                        {#if item.subtitle}
                            <p class="lv-deck-card-sub">{item.subtitle}</p>
                        {/if}
                        <p class="lv-deck-card-desc">{item.description}</p>

                        <div class="lv-deck-card-tags">
                            {#each item.tags.slice(0, 4) as tag}
                                <span class="lv-chip sm tag-chip">#{tag}</span>
                            {/each}
                        </div>
                    </div>

                    <div class="lv-deck-card-footer">
                        <div class="lv-deck-meta-info">
                            <span>作者: {item.author.name}</span>
                            <span class="lv-chip sm num">{item.license}</span>
                        </div>

                        <!-- 试看抽屉/手风琴 -->
                        {#if item.previewItems && item.previewItems.length > 0}
                            <div class="lv-deck-preview-section">
                                <button
                                    type="button"
                                    class="lv-btn sm lv-btn--ghost lv-preview-toggle-btn"
                                    onclick={() => (previewItemId = previewItemId === item.id ? null : item.id)}
                                >
                                    <LvIcon name="eye" size={13} />
                                    <span>{previewItemId === item.id ? "收起试看卡片" : "👁️ 试看闪卡形态（前 2 张）"}</span>
                                </button>

                                {#if previewItemId === item.id}
                                    <div class="lv-deck-preview-box">
                                        <div class="lv-preview-hint">
                                            <span>🗂️ 闪卡试看形态（点击卡片翻面）</span>
                                            <span class="lv-muted" style="font-size: 11px;">FSRS 推荐难度</span>
                                        </div>

                                        {#each item.previewItems.slice(0, 2) as prev, pi}
                                            {@const flipKey = `${item.id}-${pi}`}
                                            {@const isFlipped = Boolean(previewFlipped[flipKey])}
                                            <div
                                                class="lv-interactive-preview-card"
                                                role="button"
                                                tabindex="0"
                                                onclick={() => { previewFlipped[flipKey] = !isFlipped; }}
                                                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { previewFlipped[flipKey] = !isFlipped; } }}
                                            >
                                                {#if !isFlipped}
                                                    <div class="lv-preview-face front">
                                                        <div class="lv-face-label">
                                                            <span>第 {pi + 1} 张 · 卡片正面（问题/线索）</span>
                                                            <span class="lv-flip-tip">点击翻面 ↻</span>
                                                        </div>
                                                        <div class="lv-face-stem">{prev.stem}</div>
                                                        {#if prev.options?.length}
                                                            <div class="lv-face-options">{prev.options.join(" · ")}</div>
                                                        {/if}
                                                    </div>
                                                {:else}
                                                    <div class="lv-preview-face back">
                                                        <div class="lv-face-label">
                                                            <span>第 {pi + 1} 张 · 卡片背面（答案/记忆便签）</span>
                                                            <span class="lv-flip-tip">点击翻回 ↻</span>
                                                        </div>
                                                        <div class="lv-face-answer">
                                                            <strong>答案：</strong>{prev.answer}
                                                        </div>
                                                        {#if prev.analysis}
                                                            <div class="lv-face-memo">
                                                                💡 <strong>助记便签：</strong>{prev.analysis}
                                                            </div>
                                                        {/if}
                                                    </div>
                                                {/if}
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        {/if}

                        <!-- 卡片操作区 -->
                        <div class="lv-deck-actions">
                            <button
                                type="button"
                                class="lv-btn sm lv-btn--ghost"
                                onclick={() => handleExportLvCards(item)}
                                title="导出为 .lvcards 单文件分享包"
                            >
                                <LvIcon name="cards" size={13} />
                                <span>导出包</span>
                            </button>

                            {#if installed}
                                <button
                                    type="button"
                                    class="lv-btn sm lv-btn--secondary"
                                    onclick={() => onOpenDeck?.(installed.deckId, installed.deckName)}
                                >
                                    <LvIcon name="check" size={13} />
                                    <span>已入库 · 立即复习</span>
                                </button>
                            {:else}
                                <button
                                    type="button"
                                    class="lv-btn sm lv-btn--primary"
                                    disabled={isInstalling}
                                    onclick={() => void handleInstall(item)}
                                >
                                    {#if isInstalling}
                                        <LvIcon name="timer" size={13} />
                                        <span>正在入库…</span>
                                    {:else}
                                        <LvIcon name="plus" size={13} />
                                        <span>获取入库</span>
                                    {/if}
                                </button>
                            {/if}
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .lv-marketplace-studio {
        box-sizing: border-box;
        width: 100%;
        padding: 16px 20px 32px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .lv-market-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
    }

    .lv-market-head-main {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
    }

    .lv-market-title {
        font-size: 18px;
        font-weight: 700;
        margin: 0;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--b3-theme-on-background);
    }

    .lv-market-badge {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(16, 185, 129, 0.12);
        color: var(--lv-success, #10b981);
    }

    .lv-market-subtitle {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.75;
    }

    .lv-market-source-panel {
        padding: 14px 18px;
        background: var(--b3-theme-surface);
        border-radius: var(--lv-r-2, 8px);
        border: 1px dashed var(--b3-border-color, rgba(0, 0, 0, 0.1));
    }

    .lv-market-source-title {
        font-weight: 700;
        font-size: 13px;
        margin-bottom: 6px;
        color: var(--b3-theme-on-background);
    }

    .lv-market-source-desc {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.8;
        margin: 0 0 10px;
    }

    .lv-market-source-inputs {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 8px;
    }

    .lv-market-source-chips {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
        margin-top: 8px;
    }

    .lv-market-stats-card {
        padding: 12px 18px;
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.08));
        border-radius: var(--lv-r-2, 8px);
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
    }

    .lv-market-stats-row {
        display: flex;
        align-items: center;
        gap: 20px;
        flex-wrap: wrap;
    }

    .lv-market-stat-item {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .lv-stat-emoji {
        font-size: 20px;
    }

    .lv-stat-label {
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.7;
    }

    .lv-stat-value {
        font-size: 14px;
        font-weight: 700;
        color: var(--b3-theme-on-background);
    }

    .lv-stat-value.brand {
        color: var(--lv-brand, #3b82f6);
    }

    .lv-stat-value.success {
        color: var(--lv-success, #10b981);
    }

    .lv-stat-divider {
        width: 1px;
        height: 24px;
        background: var(--b3-border-color, rgba(0, 0, 0, 0.08));
    }

    .lv-market-stats-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.8;
    }

    .lv-market-filter-card {
        padding: 12px 16px;
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.08));
        border-radius: var(--lv-r-2, 8px);
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .lv-market-filter-top {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
    }

    .lv-market-search-box {
        position: relative;
        flex: 1;
        min-width: 260px;
    }

    .lv-market-search-input {
        width: 100%;
        box-sizing: border-box;
        padding-right: 28px;
    }

    .lv-search-clear {
        position: absolute;
        right: 6px;
        top: 50%;
        transform: translateY(-50%);
        padding: 2px 6px;
    }

    .lv-market-source-selector {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .lv-market-categories {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
    }

    .lv-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        font-size: 12px;
        border-radius: 999px;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.1));
        cursor: pointer;
        color: var(--b3-theme-on-background);
        transition: all 0.15s ease;
    }

    .lv-chip.sm {
        padding: 2px 8px;
        font-size: 11px;
    }

    .lv-chip.active {
        background: var(--lv-brand, #3b82f6);
        color: #fff;
        border-color: transparent;
    }

    .lv-chip--acc {
        background: rgba(59, 130, 246, 0.1);
        color: var(--lv-brand, #3b82f6);
        border-color: transparent;
    }

    .verified-tag {
        color: var(--lv-success, #10b981);
        background: rgba(16, 185, 129, 0.1);
        border-color: transparent;
    }

    .lv-market-error-banner {
        padding: 10px 14px;
        background: rgba(239, 68, 68, 0.1);
        color: var(--lv-danger, #ef4444);
        border-radius: var(--lv-r-2, 6px);
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
    }

    .lv-market-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 16px;
    }

    .lv-deck-card {
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.08));
        border-radius: var(--lv-r-2, 8px);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 16px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .lv-deck-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }

    .lv-deck-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
    }

    .lv-deck-header-meta {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .lv-deck-count {
        font-size: 12px;
        font-weight: 700;
        color: var(--b3-theme-on-surface);
    }

    .lv-deck-card-title {
        font-size: 15px;
        font-weight: 700;
        margin: 0 0 4px;
        color: var(--b3-theme-on-background);
        line-height: 1.4;
    }

    .lv-deck-card-sub {
        font-size: 12px;
        margin: 0 0 6px;
        color: var(--b3-theme-on-surface);
        opacity: 0.85;
        line-height: 1.4;
    }

    .lv-deck-card-desc {
        font-size: 12px;
        margin: 0 0 10px;
        color: var(--b3-theme-on-surface);
        opacity: 0.7;
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .lv-deck-card-tags {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
        margin-bottom: 8px;
    }

    .tag-chip {
        font-size: 11px;
        padding: 2px 6px;
        background: var(--b3-theme-background);
    }

    .lv-deck-card-footer {
        margin-top: 12px;
        border-top: 1px dashed var(--b3-border-color, rgba(0, 0, 0, 0.08));
        padding-top: 10px;
    }

    .lv-deck-meta-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.7;
        margin-bottom: 8px;
    }

    .lv-deck-preview-section {
        margin-bottom: 10px;
    }

    .lv-preview-toggle-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
    }

    .lv-deck-preview-box {
        margin-top: 8px;
        padding: 10px;
        background: var(--b3-theme-background);
        border-radius: 6px;
        border: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.08));
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .lv-preview-hint {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
    }

    .lv-interactive-preview-card {
        padding: 8px 10px;
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.1));
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.15s ease;
    }

    .lv-interactive-preview-card:hover {
        background: rgba(59, 130, 246, 0.04);
    }

    .lv-preview-face.front {
        border-left: 3px solid var(--lv-brand, #3b82f6);
        padding-left: 6px;
    }

    .lv-preview-face.back {
        border-left: 3px solid var(--lv-success, #10b981);
        padding-left: 6px;
    }

    .lv-face-label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 10px;
        font-weight: 700;
        color: var(--b3-theme-on-surface);
        opacity: 0.7;
        margin-bottom: 4px;
    }

    .lv-flip-tip {
        font-size: 10px;
        color: var(--lv-brand, #3b82f6);
    }

    .lv-face-stem {
        font-size: 12px;
        font-weight: 600;
        color: var(--b3-theme-on-background);
        line-height: 1.4;
    }

    .lv-face-options {
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.8;
        margin-top: 4px;
    }

    .lv-face-answer {
        font-size: 12px;
        color: var(--lv-success, #10b981);
        font-weight: 600;
    }

    .lv-face-memo {
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.85;
        margin-top: 4px;
        line-height: 1.4;
    }

    .lv-deck-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
    }

    .lv-market-loading,
    .lv-market-empty {
        text-align: center;
        padding: 60px 20px;
        color: var(--b3-theme-on-surface);
        opacity: 0.7;
    }

    .lv-empty-title {
        font-size: 15px;
        font-weight: 700;
        margin-top: 10px;
    }

    .lv-empty-desc {
        font-size: 12px;
        margin-top: 4px;
    }
</style>
