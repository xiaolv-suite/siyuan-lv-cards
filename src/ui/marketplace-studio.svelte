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
        type CardDeltaReport,
    } from "@/core/marketplace-sync";
    import { serializeLvCardsPackage } from "@/core/lvcards-package";
    import { localDate } from "@/core/revlog";
    import { showMessage } from "@/libs/notice";

    interface Props {
        i18n: any;
        onDeckCreated?: (deckId: string, deckName: string) => void;
        onOpenDeck?: (deckId: string, deckName: string) => void;
    }

    let { i18n, onDeckCreated, onOpenDeck }: Props = $props();

    // 2026-11-21 i18n 债务收敛：界面文案统一走 studio.* 键（fallback 为原中文）
    const text = (key: string, fallback: string, vars?: Record<string, string | number>): string => {
        let value = i18n?.[key] ?? fallback;
        if (vars) for (const [name, v] of Object.entries(vars)) value = value.split(`{${name}}`).join(String(v));
        return value;
    };

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

    let catalogSeq = 0;
    async function refreshCatalog(url: string) {
        const seq = ++catalogSeq;
        loadingCatalog = true;
        catalogError = null;
        try {
            const res = await fetchMarketplaceCatalog(url);
            if (seq !== catalogSeq) return;
            catalog = res.catalog;
            if (res.error) {
                catalogError = res.error;
            }
        } catch (e) {
            if (seq !== catalogSeq) return;
            catalogError = String(e instanceof Error ? e.message : e);
        } finally {
            if (seq === catalogSeq) {
                loadingCatalog = false;
            }
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
                showMessage(text("studio.installed", "已成功获取《{title}》并入库（共 {n} 张闪卡）✓", {title: item.title, n: res.count}), 3200, "info");
                onDeckCreated?.(res.deckId, res.deckName || item.title);
            } else {
                showMessage(text("studio.installFail", "入库失败：{reason}", {reason: res.error || "未知原因"}), 3500, "error");
            }
        } catch (e) {
            showMessage(text("studio.installError", "入库发生异常：{reason}", {reason: String(e instanceof Error ? e.message : e)}), 3500, "error");
        } finally {
            installingId = null;
        }
    }

    function handleExportLvCards(item: MarketplaceItem) {
        try {
            const pkg = marketplaceItemToLvCardsPackage(item);
            const jsonStr = serializeLvCardsPackage(pkg.deck, pkg.cards);
            downloadBlobFile(jsonStr, `${item.title}.lvcards`);
            showMessage(text("studio.exported", "已导出《{title}》闪卡分享包 (.lvcards) ✓", {title: item.title}), 2800, "info");
        } catch (e) {
            showMessage(text("studio.exportFail", "导出闪卡包失败：{reason}", {reason: String(e instanceof Error ? e.message : e)}), 3500, "error");
        }
    }

    function handleExportCart() {
        if (cart.length === 0) return;
        try {
            const pkg = cartItemsToLvCardsPackage(cart, text("studio.cartPackageName", "小驴公共集市挑选闪卡包"));
            const jsonStr = serializeLvCardsPackage(pkg.deck, pkg.cards);
            downloadBlobFile(jsonStr, "lvcards-export.lvcards");
            showMessage(text("studio.cartExported", "已将闪卡篮中 {n} 张卡片导出为 .lvcards 分享包 ✓", {n: cart.length}), 3000, "info");
        } catch (e) {
            showMessage(text("studio.exportFail", "导出闪卡包失败：{reason}", {reason: String(e instanceof Error ? e.message : e)}), 3500, "error");
        }
    }

    async function handleInstallCart() {
        if (cart.length === 0 || installingId) return;
        installingId = "cart";
        try {
            const pkg = cartItemsToLvCardsPackage(cart, text("studio.deckName", "小驴集市精选卡组"));
            const item: MarketplaceItem = {
                id: `cart-deck-${Date.now()}`,
                title: pkg.deck.name,
                description: pkg.deck.description || text("studio.deckDesc", "由集市闪卡篮精选创建"),
                kind: "flashcard_deck",
                category: "general",
                tags: [text("studio.tagCurated", "集市精选"), text("studio.tagCart", "闪卡篮")],
                author: { name: text("studio.cartAuthor", "小驴闪卡篮") },
                version: "1.0.0",
                itemCount: cart.length,
                license: "CC0",
                downloadUrl: "",
                updatedAt: localDate(Date.now()),
                embeddedCards: pkg.cards,
            };
            const res = await installMarketplaceItemToDeck(item);
            if (res.success && res.deckId) {
                showMessage(text("studio.cartInstalled", "已将闪卡篮中 {n} 张卡片入库至卡组「{deck}」✓", {n: res.count, deck: res.deckName}), 3200, "info");
                onDeckCreated?.(res.deckId, res.deckName || item.title);
                cart = clearCart();
                cartDrawerOpen = false;
            } else {
                showMessage(text("studio.installFail", "入库失败：{reason}", {reason: res.error || "未知原因"}), 3500, "error");
            }
        } catch (e) {
            showMessage(text("studio.installError", "入库发生异常：{reason}", {reason: String(e instanceof Error ? e.message : e)}), 3500, "error");
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
        showMessage(text("studio.addedToCart", "已将《{title}》的 {n} 张卡片加入闪卡篮 ✓", {title: item.title, n: items.length}), 2000, "info");
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
        // 2026-11-21 走查修复：本功能当前为演示预览（本地卡片为模拟数据、合并结果不落内核），
        // 原先弹「无损合并完成 ✓」属假成功回执，误导用户以为已更新。改为如实告知。
        showMessage(text("studio.deltaPreviewDone", "增量合并预览完成（演示模式）：本次未写入任何数据，真实增量合并将在后续版本接入"), 4000, "info");
        deltaReport = null;
    }

    function handleAddCustomSource() {
        const name = newSourceName.trim();
        const url = newSourceUrl.trim();
        if (!name || !url) {
            showMessage(text("studio.sourceIncomplete", "请完整填写订阅源名称与直链 URL"), 2500, "error");
            return;
        }
        const newSrc: CustomMarketplaceSource = {
            id: "src-" + Date.now(),
            name,
            url,
            enabled: true,
            addedAt: localDate(Date.now()),
        };
        customSources = [...customSources, newSrc];
        saveMarketplaceSources(customSources);
        newSourceName = "";
        newSourceUrl = "";
        addSourcePanelOpen = false;
        currentSourceUrl = url;
        void refreshCatalog(url);
        showMessage(text("studio.sourceAdded", "已添加并切换至第三方订阅源「{name}」✓", {name}), 2800, "info");
    }

    const categories: Array<{ id: MarketplaceCategory; label: string }> = [
        { id: "all", label: text("studio.catAll", "全部领域") },
        { id: "math", label: text("studio.catMath", "📐 数理公式") },
        { id: "computer", label: text("studio.catComputer", "💻 计算机/408") },
        { id: "language", label: text("studio.catLanguage", "🔤 外语词汇") },
        { id: "qualification", label: text("studio.catQualification", "⚖️ 法考/公考") },
        { id: "humanities", label: text("studio.catHumanities", "📖 人文经典") },
        { id: "science", label: text("studio.catScience", "🔬 经典物理") },
        { id: "general", label: text("studio.catGeneral", "💡 逻辑/通识") },
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
            <span class="lv-market-badge">{text("studio.badgePublic", "公版精选 · 零版权争议")}</span>
            <span class="lv-market-subtitle">
                {i18n?.marketplaceSubtitle || "去中心化公共知识集市。精选公共领域常识、国家新课标与学术公式，支持第三方直链订阅与一键入库。"}
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
                    <span>{text("studio.cartHeader", "🛒 闪卡篮 ({n})", {n: cart.length})}</span>
                </button>
            {/if}
            <button
                type="button"
                class="lv-btn sm lv-btn--ghost"
                onclick={() => (addSourcePanelOpen = !addSourcePanelOpen)}
                title={text("studio.addSourceTitle", "添加自定义第三方网络订阅源")}
            >
                <LvIcon name="plus" size={13} />
                <span>{addSourcePanelOpen ? text("studio.sourceCollapse", "收起订阅设置") : text("studio.sourceAdd", "✚ 自定义订阅源")}</span>
            </button>
        </div>
    </div>

    <!-- 添加外部订阅源折叠面板 -->
    {#if addSourcePanelOpen}
        <div class="lv-market-source-panel">
            <div class="lv-market-source-title">{text("studio.sourcePanelTitle", "🔗 添加第三方网络订阅源 (URL)")}</div>
            <p class="lv-market-source-desc">
                {text("studio.sourcePanelDesc", "支持输入托管在 GitHub Gist、自建服务器或开放网盘的 catalog.json 订阅直链（模式同开源阅读书源），思源客户端直连拉取，官方零存储、零中转。")}
            </p>
            <div class="lv-market-source-inputs">
                <input
                    class="lv-input"
                    style="flex: 1; min-width: 160px;"
                    bind:value={newSourceName}
                    placeholder={text("studio.sourceNamePlaceholder", "订阅源名称（如：考研专业课精选源）")}
                />
                <input
                    class="lv-input"
                    style="flex: 2; min-width: 260px;"
                    bind:value={newSourceUrl}
                    placeholder="https://example.com/catalog.json"
                />
                <button type="button" class="lv-btn sm lv-btn--primary" onclick={handleAddCustomSource}>
                    {text("studio.sourceAddLoad", "添加并载入")}
                </button>
            </div>
            {#if customSources.length > 0}
                <div class="lv-market-source-chips">
                    <span class="lv-muted" style="font-size: 12px;">{text("studio.sourcesAdded", "已添加订阅源：")}</span>
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
                    <div class="lv-stat-label">{text("studio.statPacks", "公版精选卡组")}</div>
                    <div class="lv-stat-value brand">{text("studio.statPacksValue", "{n} 门核心学科", {n: catalog.items.length})}</div>
                </div>
            </div>
            <div class="lv-stat-divider"></div>
            <div class="lv-market-stat-item">
                <span class="lv-stat-emoji">🗂️</span>
                <div>
                    <div class="lv-stat-label">{text("studio.statCards", "卡片覆盖总量")}</div>
                    <div class="lv-stat-value success">{text("studio.statCardsValue", "{n}+ 深度记忆卡", {n: totalCardCount})}</div>
                </div>
            </div>
            <div class="lv-stat-divider"></div>
            <div class="lv-market-stat-item">
                <span class="lv-stat-emoji">🛡️</span>
                <div>
                    <div class="lv-stat-label">{text("studio.statLicense", "知识版权安全")}</div>
                    <div class="lv-stat-value">{text("studio.statLicenseValue", "100% 公有领域 / CC-BY / MIT")}</div>
                </div>
            </div>
        </div>
        <div class="lv-market-stats-meta">
            <span class="lv-chip sm lv-chip--acc">{text("studio.chipInterop", "双向生态互通")}</span>
            <span>{text("studio.interopDesc", "支持开箱一键入库，并可导出 .lvcards 标准包")}</span>
        </div>
    </div>

    <!-- 搜索与领域分类工具栏 -->
    <div class="lv-market-filter-card">
        <div class="lv-market-filter-top">
            <div class="lv-market-search-box">
                <input
                    class="lv-input lv-market-search-input"
                    bind:value={searchQuery}
                    placeholder={text("studio.searchPlaceholder", "🔍 搜索题库、卡组或考点关键词…")}
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
                    {text("studio.sourceOfficial", "🌐 官方精选公版源")}
                </button>
                {#if customSources.length > 0}
                    <select
                        class="lv-select sm"
                        bind:value={currentSourceUrl}
                        onchange={(e) => void refreshCatalog((e.target as HTMLSelectElement).value)}
                    >
                        <option value="official">{text("studio.sourceOfficial", "🌐 官方精选公版源")}</option>
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
            <div style="margin-top: 10px; font-size: 14px;">{text("studio.loadingCatalog", "正在拉取知识集市资源列表…")}</div>
        </div>
    {:else if filteredItems.length === 0}
        <div class="lv-market-empty">
            <LvIcon name="cards" size={36} />
            <div class="lv-empty-title">{text("studio.emptyTitle", "未找到匹配的闪卡组")}</div>
            <p class="lv-empty-desc">{text("studio.emptyDesc", "尝试清空关键词或切换上方的学科分类。")}</p>
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
                                {item.kind === "both" ? text("studio.kindBoth", "题卡通用") : item.kind === "flashcard_deck" ? text("studio.kindDeck", "记忆闪卡") : text("studio.kindExam", "题库试卷")}
                            </span>
                            <div class="lv-deck-header-meta">
                                {#if item.verified}
                                    <span class="lv-chip sm verified-tag" title={text("studio.verifiedTitle", "零版权争议认证")}>
                                        {text("studio.verified", "✓ 公版认证")}
                                    </span>
                                {/if}
                                <span class="lv-deck-count num">{text("studio.cardCount", "{n} 张卡", {n: item.itemCount})}</span>
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
                                <span>{isQualityOpen ? text("studio.qualityCollapse", "收起品质画像") : text("studio.qualityOpen", "📊 查看品质画像 (难度/卡型)")}</span>
                            </button>
                            <span class="lv-muted" style="font-size: 11px;">
                                {text("studio.expansionRatio", "💡 便签覆盖率 {n}%", {n: metrics.expansionRatio})}
                            </span>
                        </div>

                        <!-- 品质画像看板面板 -->
                        {#if isQualityOpen}
                            <div class="lv-quality-dashboard">
                                <!-- 卡型分布 -->
                                <div class="lv-quality-section">
                                    <div class="lv-quality-label">{text("studio.typeComposition", "题卡类型构成：")}</div>
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
                                    <div class="lv-quality-label">{text("studio.difficultyLadder", "推荐难度阶梯：")}</div>
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
                            <span>{text("studio.author", "作者: {name}", {name: item.author.name})}</span>
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
                                        <span>{previewItemId === item.id ? text("studio.previewCollapse", "收起试看卡片") : text("studio.previewOpen", "👁️ 试看闪卡形态（前 2 张）")}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="lv-btn sm lv-btn--ghost"
                                        style="font-size: 11px; padding: 2px 6px;"
                                        onclick={() => handleAddDeckToCart(item)}
                                        title={text("studio.addAllToCart", "将全包卡片加入闪卡篮")}
                                    >
                                        {text("studio.addAllToCart", "🛒 全包入篮")}
                                    </button>
                                </div>

                                {#if previewItemId === item.id}
                                    <div class="lv-deck-preview-box">
                                        <div class="lv-preview-hint">
                                            <span>{text("studio.previewHint", "🗂️ 闪卡试看形态（点击卡片翻面）")}</span>
                                            <span class="lv-muted" style="font-size: 11px;">{text("studio.fsrsDifficulty", "推荐难度")}</span>
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
                                                                <span>{text("studio.previewFront", "第 {n} 张 · 卡片正面（问题/线索）", {n: pi + 1})}</span>
                                                                <span class="lv-flip-tip">{text("studio.flip", "点击翻面 ↻")}</span>
                                                            </div>
                                                            <div class="lv-face-stem">{prev.stem}</div>
                                                            {#if prev.options?.length}
                                                                <div class="lv-face-options">{prev.options.join(" · ")}</div>
                                                            {/if}
                                                        </div>
                                                    {:else}
                                                        <div class="lv-preview-face back">
                                                            <div class="lv-face-label">
                                                                <span>{text("studio.previewBack", "第 {n} 张 · 卡片背面（答案/记忆便签）", {n: pi + 1})}</span>
                                                                <span class="lv-flip-tip">{text("studio.flipBack", "点击翻回 ↻")}</span>
                                                            </div>
                                                            <div class="lv-face-answer">
                                                                <strong>{text("studio.answerLabel", "答案：")}</strong>{prev.answer}
                                                            </div>
                                                            {#if prev.analysis}
                                                                <div class="lv-face-memo">
                                                                    💡 <strong>{text("studio.mnemonicLabel", "助记便签：")}</strong>{prev.analysis}
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
                                                            {isInCart(cart, candidate.id) ? text("studio.inCart", "✓ 已在闪卡篮") : text("studio.putInCart", "+ 放入闪卡篮")}
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
                                title={text("studio.exportSingleTitle", "导出为 .lvcards 单文件分享包")}
                            >
                                <LvIcon name="cards" size={13} />
                                <span>{text("studio.exportPack", "导出包")}</span>
                            </button>

                            {#if installed}
                                <div class="lv-row" style="margin: 0; gap: 4px;">
                                    <button
                                        type="button"
                                        class="lv-btn sm lv-btn--ghost"
                                        onclick={() => handleCheckDelta(item)}
                                        title={text("studio.deltaPreviewTitle", "演示：基于模拟本地数据的差量预览（暂未写入本地）")}
                                    >
                                        <LvIcon name="refresh" size={13} />
                                        <span>{text("studio.deltaPreview", "增量预览")}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="lv-btn sm lv-btn--secondary"
                                        onclick={() => onOpenDeck?.(installed.deckId, installed.deckName)}
                                    >
                                        <LvIcon name="check" size={13} />
                                        <span>{text("studio.installed", "已入库")}</span>
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
                                        <span>{text("studio.installing", "正在入库…")}</span>
                                    {:else}
                                        <LvIcon name="plus" size={13} />
                                        <span>{text("studio.install", "获取入库")}</span>
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
                    <span>{text("studio.cartTitle", "🛒 跨学科闪卡篮")}</span>
                    <span class="lv-chip sm lv-chip--acc">{text("studio.cardCount", "{n} 张卡", {n: cart.length})}</span>
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
                        {text("studio.cartEmpty", "闪卡篮为空，可从左侧集市试看卡片时点击「+ 放入闪卡篮」")}
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
                                    class="b3-button b3-button--small b3-button--cancel"
                                    style="min-width: 28px; min-height: 28px; padding: 0 8px; color: var(--b3-theme-error, var(--lv-color-danger)); touch-action: manipulation; display: inline-flex; align-items: center; justify-content: center;"
                                    onclick={() => (cart = removeFromCart(cart, c.id))}
                                    aria-label={text("studio.removeFromCart", "从闪卡篮移除")}
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
                        {text("studio.clearCart", "清空")}
                    </button>
                    <div style="display: flex; gap: 6px;">
                        <button
                            type="button"
                            class="lv-btn sm lv-btn--secondary"
                            onclick={handleExportCart}
                        >
                            <LvIcon name="cards" size={13} />
                            <span>{text("studio.exportLvcards", "导出 .lvcards")}</span>
                        </button>
                        <button
                            type="button"
                            class="lv-btn sm lv-btn--primary"
                            disabled={installingId === "cart"}
                            onclick={() => void handleInstallCart()}
                        >
                            <LvIcon name="plus" size={13} />
                            <span>{installingId === "cart" ? text("studio.installing", "正在入库…") : text("studio.installAndStart", "一键入库开练")}</span>
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
                {text("studio.deltaTitle", "🔄 增量差量更新与无损合并：《{title}》", {title: deltaReport.item.title})}
            </h3>
            <p class="lv-muted" style="font-size: 12px; margin: 0 0 12px; line-height: 1.5;">
                {text("studio.deltaDemoNote", "🧪 演示预览：当前基于模拟本地数据演示差量算法，确认执行不会写入任何更改。正式版将自动比对本地已安装卡片与集市远端新版，绝对保留本地历史复习排期、错题状态与记忆曲线进度，仅增量补全新卡与正文修订。")}
            </p>

            <div class="lv-delta-stat-boxes">
                <div class="lv-delta-stat-box green">
                    <div class="lv-stat-num">{deltaReport.report.addedCount}</div>
                    <div class="lv-stat-txt">{text("studio.deltaAdded", "待追加新卡")}</div>
                </div>
                <div class="lv-delta-stat-box blue">
                    <div class="lv-stat-num">{deltaReport.report.updatedCount}</div>
                    <div class="lv-stat-txt">{text("studio.deltaUpdated", "待修订卡片")}</div>
                </div>
                <div class="lv-delta-stat-box gray">
                    <div class="lv-stat-num">{deltaReport.report.unchangedCount}</div>
                    <div class="lv-stat-txt">{text("studio.deltaUnchanged", "完全一致卡片")}</div>
                </div>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
                <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => (deltaReport = null)}>
                    {text("studio.cancel", "取消")}
                </button>
                <button type="button" class="lv-btn sm lv-btn--primary" onclick={handleApplyDeltaSync}>
                    {text("studio.finishPreview", "完成预览（不写入）")}
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
        transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, color 0.15s ease, opacity 0.15s ease;
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
        background: var(--b3-theme-surface-lighter, var(--lv-color-canvas, rgba(125, 125, 125, 0.12)));
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
        background: var(--b3-mask-background, rgba(0, 0, 0, 0.48));
        backdrop-filter: blur(2px);
        z-index: 998;
    }

    .lv-cart-drawer {
        position: fixed;
        right: 0;
        top: 0;
        bottom: 0;
        width: min(380px, 100vw);
        background: var(--b3-theme-surface);
        box-shadow: var(--b3-dialog-shadow, var(--lv-shadow-float, -4px 0 20px rgba(0, 0, 0, 0.15)));
        z-index: 999;
        display: flex;
        flex-direction: column;
    }

    /* 模态框通用按钮样式与无障碍保证 */
    .lv-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 32px;
        padding: 4px 12px;
        border-radius: var(--lv-r-control, 6px);
        border: 1px solid var(--b3-border-color, var(--lv-border));
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        font-size: 13px;
        cursor: pointer;
        touch-action: manipulation;
        transition: all 0.15s ease;

        &:hover {
            background: var(--b3-theme-surface-lighter);
        }

        &.sm {
            min-height: 28px;
            padding: 2px 10px;
            font-size: 12px;
        }

        &.lv-btn--primary {
            background: var(--b3-theme-primary);
            border-color: var(--b3-theme-primary);
            color: var(--b3-theme-on-primary, #ffffff);
            font-weight: 500;
            &:hover {
                filter: brightness(1.08);
            }
        }

        &.lv-btn--secondary {
            background: var(--lv-primary-soft, color-mix(in srgb, var(--b3-theme-primary) 12%, var(--b3-theme-surface)));
            border-color: var(--lv-primary-border, color-mix(in srgb, var(--b3-theme-primary) 30%, transparent));
            color: var(--b3-theme-primary);
            &:hover {
                background: color-mix(in srgb, var(--b3-theme-primary) 18%, var(--b3-theme-surface));
            }
        }

        &.lv-btn--ghost {
            background: transparent;
            border-color: transparent;
            color: var(--b3-theme-on-surface-light, var(--b3-theme-on-surface));
            &:hover {
                background: var(--b3-theme-surface-lighter);
                color: var(--b3-theme-on-surface);
            }
        }

        @media (max-width: 640px) {
            min-height: 40px;
            padding: 6px 14px;
            font-size: 13px;
            &.sm {
                min-height: 36px;
                padding: 4px 12px;
                font-size: 13px;
            }
        }
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
