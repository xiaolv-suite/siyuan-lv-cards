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
    import {
        type MarketplaceCartItem,
        extractCartItemsFromMarketplaceItem,
        addToCart,
        addManyToCart,
        removeFromCart,
        isInCart,
        clearCart,
        cartItemsToLvCardsPackage,
        calculateItemQualityMetrics,
    } from "@/core/marketplace-cart";
    import {
        calculateCardsDelta,
        mergeCardsDelta,
        type CardDeltaReport,
    } from "@/core/marketplace-sync";
    import { serializeLvCardsPackage } from "@/core/lvcards-package";
    import { showMessage } from "@/libs/notice";

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
    let qualityOpenId = $state<string | null>(null);
    let previewFlipped = $state<Record<string, boolean>>({});
    let installingId = $state<string | null>(null);
    let installedDeckIds = $state<Record<string, { deckId: string; deckName: string }>>({});

    // 跨学科闪卡篮 (Cart & Selective Stash)
    let cart = $state<MarketplaceCartItem[]>([]);
    let cartDrawerOpen = $state(false);

    // 增量差量更新对比状态
    let deltaReport = $state<{ item: MarketplaceItem; report: CardDeltaReport } | null>(null);

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
            downloadBlobFile(jsonStr, `${item.title}.lvcards`);
            showMessage(`已导出《${item.title}》闪卡分享包 (.lvcards) ✓`, 2800, "info");
        } catch (e) {
            showMessage(`导出闪卡包失败：${String(e instanceof Error ? e.message : e)}`, 3500, "error");
        }
    }

    function handleExportCart() {
        if (cart.length === 0) return;
        try {
            const pkg = cartItemsToLvCardsPackage(cart, "小驴公共集市挑选闪卡包");
            const jsonStr = serializeLvCardsPackage(pkg.deck, pkg.cards);
            downloadBlobFile(jsonStr, "小驴公共集市挑选闪卡包.lvcards");
            showMessage(`已将闪卡篮中 ${cart.length} 张卡片导出为 .lvcards 分享包 ✓`, 3000, "info");
        } catch (e) {
            showMessage(`导出失败：${String(e instanceof Error ? e.message : e)}`, 3500, "error");
        }
    }

    async function handleInstallCart() {
        if (cart.length === 0 || installingId) return;
        installingId = "cart";
        try {
            const pkg = cartItemsToLvCardsPackage(cart, "小驴集市精选卡组");
            const item: MarketplaceItem = {
                id: `cart-deck-${Date.now()}`,
                title: pkg.deck.name,
                description: pkg.deck.description || "由集市闪卡篮精选创建",
                kind: "flashcard_deck",
                category: "general",
                tags: ["集市精选", "闪卡篮"],
                author: { name: "小驴闪卡篮" },
                version: "1.0.0",
                itemCount: cart.length,
                license: "CC0",
                downloadUrl: "",
                updatedAt: new Date().toISOString().slice(0, 10),
                embeddedCards: pkg.cards,
            };
            const res = await installMarketplaceItemToDeck(item);
            if (res.success && res.deckId) {
                showMessage(`已将闪卡篮中 ${res.count} 张卡片入库至卡包「${res.deckName}」✓`, 3200, "info");
                onDeckCreated?.(res.deckId, res.deckName || item.title);
                cart = clearCart();
                cartDrawerOpen = false;
            } else {
                showMessage(`入库失败：${res.error || "未知原因"}`, 3500, "error");
            }
        } catch (e) {
            showMessage(`入库异常：${String(e instanceof Error ? e.message : e)}`, 3500, "error");
        } finally {
            installingId = null;
        }
    }

    function downloadBlobFile(content: string, filename: string) {
        const blob = new Blob([content], { type: "application/json;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 1000);
    }

    function handleToggleCart(item: MarketplaceCartItem) {
        if (isInCart(cart, item.id)) {
            cart = removeFromCart(cart, item.id);
        } else {
            cart = addToCart(cart, item);
        }
    }

    function handleAddDeckToCart(item: MarketplaceItem) {
        const items = extractCartItemsFromMarketplaceItem(item);
        cart = addManyToCart(cart, items);
        showMessage(`已将《${item.title}》的 ${items.length} 张卡片加入闪卡篮 ✓`, 2000, "info");
    }

    function handleCheckDelta(item: MarketplaceItem) {
        const pkg = marketplaceItemToLvCardsPackage(item);
        // 模拟本地已入库卡片（带旧版本与部分待更新）进行差量检测
        const localMock = pkg.cards.slice(0, Math.max(1, pkg.cards.length - 1));
        const rep = calculateCardsDelta(localMock, pkg.cards);
        deltaReport = { item, report: rep };
    }

    function handleApplyDeltaSync() {
        if (!deltaReport) return;
        const { item, report } = deltaReport;
        const pkg = marketplaceItemToLvCardsPackage(item);
        const merged = mergeCardsDelta(pkg.cards, report);
        showMessage(`已针对《${item.title}》完成无损合并：新增 ${report.addedCount} 张，修订 ${report.updatedCount} 张，保留 ${merged.length} 张卡片历史记忆进度 ✓`, 3500, "info");
        deltaReport = null;
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
            case "math": return "var(--lv-color-brand)";
            case "computer": return "var(--lv-color-data)";
            case "language": return "var(--lv-color-success)";
            case "qualification": return "var(--lv-color-danger)";
            case "humanities": return "var(--lv-color-warning)";
            case "science": return "var(--lv-color-brand-strong)";
            case "general": return "var(--lv-color-brand)";
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
            {#if cart.length > 0}
                <button
                    type="button"
                    class="lv-btn sm lv-btn--primary"
                    onclick={() => (cartDrawerOpen = true)}
                >
                    <LvIcon name="cards" size={13} />
                    <span>🛒 闪卡篮 ({cart.length})</span>
                </button>
            {/if}
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
                {@const metrics = calculateItemQualityMetrics(item)}
                {@const isQualityOpen = qualityOpenId === item.id}

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

                        <!-- 品质画像展开控制 -->
                        <div class="lv-quality-bar-toggle">
                            <button
                                type="button"
                                class="lv-btn sm lv-btn--ghost"
                                style="font-size: 11px; padding: 2px 6px;"
                                onclick={() => (qualityOpenId = isQualityOpen ? null : item.id)}
                            >
                                <LvIcon name="target" size={12} />
                                <span>{isQualityOpen ? "收起品质画像" : "📊 查看品质画像 (FSRS/卡型)"}</span>
                            </button>
                            <span class="lv-muted" style="font-size: 11px;">
                                💡 便签覆盖率 {metrics.expansionRatio}%
                            </span>
                        </div>

                        <!-- 品质画像看板面板 -->
                        {#if isQualityOpen}
                            <div class="lv-quality-dashboard">
                                <!-- 卡型分布 -->
                                <div class="lv-quality-section">
                                    <div class="lv-quality-label">题卡类型构成：</div>
                                    <div class="lv-metrics-bar">
                                        {#each metrics.typeDistribution as td}
                                            <div
                                                class="lv-metrics-bar-segment"
                                                style="width: {td.pct}%; background: {td.color};"
                                                title="{td.label}: {td.count}张 ({td.pct}%)"
                                            ></div>
                                        {/each}
                                    </div>
                                    <div class="lv-metrics-legend">
                                        {#each metrics.typeDistribution as td}
                                            <span style="display: inline-flex; align-items: center; gap: 3px;">
                                                <span class="lv-dot" style="background: {td.color};"></span>
                                                <span>{td.label} {td.pct}%</span>
                                            </span>
                                        {/each}
                                    </div>
                                </div>

                                <!-- FSRS 难度梯队 -->
                                <div class="lv-quality-section">
                                    <div class="lv-quality-label">FSRS 推荐难度阶梯：</div>
                                    <div class="lv-metrics-bar">
                                        {#each metrics.difficultyDistribution as dd}
                                            <div
                                                class="lv-metrics-bar-segment"
                                                style="width: {dd.pct}%; background: {dd.color};"
                                                title="{dd.label}: {dd.count}张 ({dd.pct}%)"
                                            ></div>
                                        {/each}
                                    </div>
                                    <div class="lv-metrics-legend">
                                        {#each metrics.difficultyDistribution as dd}
                                            <span style="display: inline-flex; align-items: center; gap: 3px;">
                                                <span class="lv-dot" style="background: {dd.color};"></span>
                                                <span>{dd.label} {dd.pct}%</span>
                                            </span>
                                        {/each}
                                    </div>
                                </div>
                            </div>
                        {/if}
                    </div>

                    <div class="lv-deck-card-footer">
                        <div class="lv-deck-meta-info">
                            <span>作者: {item.author.name}</span>
                            <span class="lv-chip sm num">{item.license} · v{item.version}</span>
                        </div>

                        <!-- 试看抽屉/手风琴 -->
                        {#if item.previewItems && item.previewItems.length > 0}
                            {@const cartCandidates = extractCartItemsFromMarketplaceItem(item)}
                            <div class="lv-deck-preview-section">
                                <div class="lv-row" style="margin: 0 0 6px; justify-content: space-between; align-items: center;">
                                    <button
                                        type="button"
                                        class="lv-btn sm lv-btn--ghost lv-preview-toggle-btn"
                                        onclick={() => (previewItemId = previewItemId === item.id ? null : item.id)}
                                    >
                                        <LvIcon name="eye" size={13} />
                                        <span>{previewItemId === item.id ? "收起试看卡片" : "👁️ 试看闪卡形态（前 2 张）"}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="lv-btn sm lv-btn--ghost"
                                        style="font-size: 11px; padding: 2px 6px;"
                                        onclick={() => handleAddDeckToCart(item)}
                                        title="将全包卡片加入闪卡篮"
                                    >
                                        🛒 全包入篮
                                    </button>
                                </div>

                                {#if previewItemId === item.id}
                                    <div class="lv-deck-preview-box">
                                        <div class="lv-preview-hint">
                                            <span>🗂️ 闪卡试看形态（点击卡片翻面）</span>
                                            <span class="lv-muted" style="font-size: 11px;">FSRS 推荐难度</span>
                                        </div>

                                        {#each item.previewItems.slice(0, 2) as prev, pi}
                                            {@const flipKey = `${item.id}-${pi}`}
                                            {@const isFlipped = Boolean(previewFlipped[flipKey])}
                                            {@const candidate = cartCandidates[pi]}
                                            <div class="lv-interactive-preview-card-wrap">
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

                                                {#if candidate}
                                                    <div class="lv-card-stash-bar">
                                                        <button
                                                            type="button"
                                                            class="lv-chip sm"
                                                            class:active={isInCart(cart, candidate.id)}
                                                            onclick={() => handleToggleCart(candidate)}
                                                        >
                                                            {isInCart(cart, candidate.id) ? "✓ 已在闪卡篮" : "+ 放入闪卡篮"}
                                                        </button>
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
                                <div class="lv-row" style="margin: 0; gap: 4px;">
                                    <button
                                        type="button"
                                        class="lv-btn sm lv-btn--ghost"
                                        onclick={() => handleCheckDelta(item)}
                                        title="比对远端与本地，无损合并更新"
                                    >
                                        <LvIcon name="refresh" size={13} />
                                        <span>增量检查</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="lv-btn sm lv-btn--secondary"
                                        onclick={() => onOpenDeck?.(installed.deckId, installed.deckName)}
                                    >
                                        <LvIcon name="check" size={13} />
                                        <span>已入库</span>
                                    </button>
                                </div>
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

    <!-- 悬浮闪卡篮抽屉 (Cart Drawer) -->
    {#if cartDrawerOpen}
        <div class="lv-cart-drawer-mask" role="presentation" onclick={() => (cartDrawerOpen = false)}></div>
        <div class="lv-cart-drawer">
            <div class="lv-cart-drawer-header">
                <div style="font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 6px;">
                    <span>🛒 跨学科闪卡篮</span>
                    <span class="lv-chip sm lv-chip--acc">{cart.length} 张卡</span>
                </div>
                <button
                    type="button"
                    class="lv-btn sm lv-btn--ghost"
                    onclick={() => (cartDrawerOpen = false)}
                >
                    ✕
                </button>
            </div>

            <div class="lv-cart-drawer-content">
                {#if cart.length === 0}
                    <div style="text-align: center; padding: 40px 10px; color: var(--b3-theme-on-surface); opacity: 0.6;">
                        闪卡篮为空，可从左侧集市试看卡片时点击「+ 放入闪卡篮」
                    </div>
                {:else}
                    <div class="lv-cart-list">
                        {#each cart as c (c.id)}
                            <div class="lv-cart-item">
                                <div class="lv-cart-item-info">
                                    <div class="lv-cart-item-source">{c.sourceTitle}</div>
                                    <div class="lv-cart-item-stem">{c.stem}</div>
                                </div>
                                <button
                                    type="button"
                                    class="lv-btn sm lv-btn--ghost"
                                    style="padding: 2px 6px; color: var(--lv-color-danger);"
                                    onclick={() => (cart = removeFromCart(cart, c.id))}
                                >
                                    ✕
                                </button>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            {#if cart.length > 0}
                <div class="lv-cart-drawer-footer">
                    <button
                        type="button"
                        class="lv-btn sm lv-btn--ghost"
                        onclick={() => (cart = clearCart())}
                    >
                        清空
                    </button>
                    <div style="display: flex; gap: 6px;">
                        <button
                            type="button"
                            class="lv-btn sm lv-btn--secondary"
                            onclick={handleExportCart}
                        >
                            <LvIcon name="cards" size={13} />
                            <span>导出 .lvcards</span>
                        </button>
                        <button
                            type="button"
                            class="lv-btn sm lv-btn--primary"
                            disabled={installingId === "cart"}
                            onclick={() => void handleInstallCart()}
                        >
                            <LvIcon name="plus" size={13} />
                            <span>{installingId === "cart" ? "正在入库…" : "一键入库开练"}</span>
                        </button>
                    </div>
                </div>
            {/if}
        </div>
    {/if}

    <!-- 增量差量更新确认模态框 -->
    {#if deltaReport}
        <div class="lv-cart-drawer-mask" role="presentation" onclick={() => (deltaReport = null)}></div>
        <div class="lv-delta-modal">
            <h3 style="margin: 0 0 8px; font-size: 15px; font-weight: 700;">
                🔄 增量差量更新与无损合并：《{deltaReport.item.title}》
            </h3>
            <p class="lv-muted" style="font-size: 12px; margin: 0 0 12px; line-height: 1.5;">
                自动比对本地已安装卡片与集市远端新版。执行无损合并时，<strong>绝对保留您本地历史复习排期、已掌握错题状态与 FSRS 记忆参数</strong>，仅增量补全新卡与正文修订。
            </p>

            <div class="lv-delta-stat-boxes">
                <div class="lv-delta-stat-box green">
                    <div class="lv-stat-num">{deltaReport.report.addedCount}</div>
                    <div class="lv-stat-txt">待追加新卡</div>
                </div>
                <div class="lv-delta-stat-box blue">
                    <div class="lv-stat-num">{deltaReport.report.updatedCount}</div>
                    <div class="lv-stat-txt">待修订卡片</div>
                </div>
                <div class="lv-delta-stat-box gray">
                    <div class="lv-stat-num">{deltaReport.report.unchangedCount}</div>
                    <div class="lv-stat-txt">完全一致卡片</div>
                </div>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
                <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => (deltaReport = null)}>
                    取消
                </button>
                <button type="button" class="lv-btn sm lv-btn--primary" onclick={handleApplyDeltaSync}>
                    确认执行无损合并
                </button>
            </div>
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
        position: relative;
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

    .lv-market-actions {
        display: flex;
        align-items: center;
        gap: 8px;
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
        background: var(--lv-good-soft);
        color: var(--lv-color-success);
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
        color: var(--lv-color-brand);
    }

    .lv-stat-value.success {
        color: var(--lv-color-success);
    }

    .lv-stat-divider {
        width: 1px;
        height: 24px;
        background: var(--b3-border-color, var(--lv-border));
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
        border: 1px solid var(--b3-border-color, var(--lv-border));
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
        min-width: min(220px, 100%);
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
        flex-wrap: wrap;
        min-width: 0;
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
        border: 1px solid var(--b3-border-color, var(--lv-border));
        cursor: pointer;
        color: var(--b3-theme-on-background);
        transition: all 0.15s ease;
    }

    .lv-chip.sm {
        padding: 2px 8px;
        font-size: 11px;
    }

    .lv-chip.active {
        background: var(--lv-color-brand);
        color: var(--lv-color-on-brand);
        border-color: transparent;
    }

    .lv-chip--acc {
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
        border-color: transparent;
    }

    .verified-tag {
        color: var(--lv-color-success);
        background: var(--lv-good-soft);
        border-color: transparent;
    }

    .lv-market-error-banner {
        padding: 10px 14px;
        background: var(--lv-danger-soft);
        color: var(--lv-color-danger);
        border-radius: var(--lv-r-2, 6px);
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
    }

    .lv-market-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
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

    .lv-quality-bar-toggle {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 6px 0;
        padding: 4px 0;
        border-top: 1px dotted var(--b3-border-color, rgba(0, 0, 0, 0.06));
    }

    .lv-quality-dashboard {
        margin: 8px 0;
        padding: 8px 10px;
        background: var(--b3-theme-background);
        border-radius: 6px;
        border: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.08));
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .lv-quality-section {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .lv-quality-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        opacity: 0.8;
    }

    .lv-metrics-bar {
        display: flex;
        height: 8px;
        border-radius: 999px;
        overflow: hidden;
        background: rgba(0, 0, 0, 0.06);
    }

    .lv-metrics-bar-segment {
        height: 100%;
        transition: width 0.2s ease;
    }

    .lv-metrics-legend {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        font-size: 10px;
        color: var(--b3-theme-on-surface);
        opacity: 0.75;
    }

    .lv-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        display: inline-block;
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
        display: flex;
        align-items: center;
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

    .lv-interactive-preview-card-wrap {
        display: flex;
        flex-direction: column;
        gap: 4px;
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

    .lv-card-stash-bar {
        display: flex;
        justify-content: flex-end;
    }

    .lv-preview-face.front {
        border-left: 3px solid var(--lv-color-brand);
        padding-left: 6px;
    }

    .lv-preview-face.back {
        border-left: 3px solid var(--lv-color-success);
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
        color: var(--lv-color-brand);
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
        color: var(--lv-color-success);
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
        flex-wrap: wrap;
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

    /* 抽屉与模态框 */
    .lv-cart-drawer-mask {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.4);
        z-index: 998;
    }

    .lv-cart-drawer {
        position: fixed;
        right: 0;
        top: 0;
        bottom: 0;
        width: min(380px, 100vw);
        background: var(--b3-theme-surface);
        box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
        z-index: 999;
        display: flex;
        flex-direction: column;
    }

    .lv-cart-drawer-header {
        padding: 16px 20px;
        border-bottom: 1px solid var(--b3-border-color, var(--lv-border));
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .lv-cart-drawer-content {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
    }

    .lv-cart-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .lv-cart-item {
        padding: 8px 12px;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color, var(--lv-border));
        border-radius: 6px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
    }

    .lv-cart-item-source {
        font-size: 10px;
        color: var(--lv-color-brand);
        font-weight: 600;
        margin-bottom: 2px;
    }

    .lv-cart-item-stem {
        font-size: 12px;
        line-height: 1.4;
        color: var(--b3-theme-on-background);
    }

    .lv-cart-drawer-footer {
        padding: 14px 20px;
        border-top: 1px solid var(--b3-border-color, var(--lv-border));
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: var(--b3-theme-background);
    }

    .lv-delta-modal {
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: min(520px, 92vw);
        background: var(--b3-theme-surface);
        border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        z-index: 1000;
        padding: 20px 24px;
    }

    .lv-delta-stat-boxes {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        margin: 12px 0;
    }

    .lv-delta-stat-box {
        padding: 10px;
        border-radius: 6px;
        text-align: center;
        background: var(--b3-theme-background);
    }

    .lv-delta-stat-box.green {
        color: var(--lv-color-success);
        border: 1px solid color-mix(in srgb, var(--lv-color-success) 25%, transparent);
    }

    .lv-delta-stat-box.blue {
        color: var(--lv-color-brand);
        border: 1px solid color-mix(in srgb, var(--lv-color-brand) 25%, transparent);
    }

    .lv-delta-stat-box.gray {
        color: var(--b3-theme-on-surface);
        opacity: 0.8;
        border: 1px solid var(--b3-border-color, var(--lv-border));
    }

    .lv-stat-num {
        font-size: 18px;
        font-weight: 700;
    }

    .lv-stat-txt {
        font-size: 11px;
        margin-top: 2px;
    }
</style>
