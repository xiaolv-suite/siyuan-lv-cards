<script lang="ts">
    import LvIcon from "@/ui/kit/LvIcon.svelte";
    import type { RiffDeck } from "@/api/riff";

    let {
        headScopeLabel = "",
        qualityExcludedCardIDs = [],
        scopeKey = $bindable("all"),
        decks = [],
        notebooks = [],
        t,
        onScopeChange,
        onRecheckQualityExcluded,
        onOpenMaintenance,
        onStartCram,
        onScopeNew,
        onOpenAuthoring,
        onOpenInbox,
        onOpenManager,
        onOpenMarketplace,
        onCreateSampleCards,
        creatingSamples = false,
        onRefreshQueue,
        onReturnHome,
    }: {
        headScopeLabel?: string;
        qualityExcludedCardIDs?: string[];
        scopeKey?: string;
        decks?: RiffDeck[];
        notebooks?: { id: string; name: string }[];
        t: any;
        onScopeChange: () => void;
        onRecheckQualityExcluded: () => void;
        onOpenMaintenance: () => void;
        onStartCram: () => void;
        onScopeNew: () => void;
        onOpenAuthoring: () => void;
        onOpenInbox: () => void;
        onOpenManager: () => void;
        onOpenMarketplace?: () => void;
        onCreateSampleCards?: () => void;
        creatingSamples?: boolean;
        onRefreshQueue: () => void;
        onReturnHome: () => void;
    } = $props();

    const hasNonEmptyDeck = $derived(decks.some((d) => (Number(d.size) || 0) > 0));
    const visibleDecks = $derived(
        decks.filter((d) => {
            if ((Number(d.size) || 0) > 0) return true;
            if (scopeKey === `deck:${d.id}`) return true;
            return !hasNonEmptyDeck && !/^(lv-exam-preflight-|lv-dbg|e2e-)/i.test(d.name || "");
        }),
    );
    const totalDeckCards = $derived(decks.reduce((acc, d) => acc + (Number(d.size) || 0), 0));
    const isTrulyEmpty = $derived(
        Boolean(onOpenMarketplace || onCreateSampleCards)
            && totalDeckCards === 0
            && qualityExcludedCardIDs.length === 0,
    );

    function onWindowKeydown(e: KeyboardEvent) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
        if ((e.key === "Enter" || e.key === "Escape") && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            onReturnHome();
        } else if (e.key === "r" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            onRefreshQueue();
        }
    }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<!-- 复习就绪看板（Review Ready Dashboard）：Bento 便当盒排布，内聚隔离提示，提供丰富的后续步骤 -->
<div class="lv-center lv-ready-wrap" role="region" aria-label={t.review?.readyEmptyTitle ?? "复习就绪看板"}>
    <div class="lv-ready-hub">
        <!-- 顶部导航与状态条 -->
        <div class="lv-ready-header">
            <div class="lv-ready-title-group">
                <span class="lv-ready-eyebrow">
                    <LvIcon name="cards" size={13} /> REVIEW HUB · {headScopeLabel}
                </span>
                <h2 class="lv-ready-title">
                    {qualityExcludedCardIDs.length > 0
                        ? (t.review?.readyHasIssuesTitle ?? "当前队列暂无可学闪卡")
                        : isTrulyEmpty
                            ? "当前还没有可刷的闪卡"
                            : (t.review?.readyEmptyTitle ?? "今日复习任务已轻松搞定")}
                </h2>
                <p class="lv-ready-desc">
                    {qualityExcludedCardIDs.length > 0
                        ? (t.review?.readyHasIssuesDesc ?? "检测到当前范围内部分卡片存在异常并已被安全隔离保护，其它卡片均已完成。")
                        : isTrulyEmpty
                            ? "可从「卡组集市」一键导入精选卡组立即刷卡，或在电脑端从笔记批量制卡同步。"
                            : (t.review?.readyEmptyDesc ?? "当前选择的范围内没有到期的卡片，已有的复习进度与掌握度统计均已完好保存。")}
                </p>
            </div>

            <!-- 快捷范围切换胶囊 -->
            {#if !isTrulyEmpty}
            <div class="lv-ready-scope-pill">
                <span class="lv-ready-scope-label"><LvIcon name="book" size={14} /> {t.review?.scopeTitle ?? "范围"}</span>
                <select
                    class="b3-select lv-ready-scope-select"
                    aria-label={t.review?.scopeTitle ?? "范围"}
                    bind:value={scopeKey}
                    onchange={onScopeChange}
                >
                    <option value="all">{t.review?.scopeAll ?? "全部卡片"}</option>
                    <option value="new">{t.review?.scopeNew ?? "仅新卡"}</option>
                    <option value="old">{t.review?.scopeOld ?? "仅旧卡"}</option>
                    {#if visibleDecks.length > 0}
                        <optgroup label={t.dashboard?.decks ?? "卡组"}>
                            {#each visibleDecks as d (d.id)}
                                <option value={`deck:${d.id}`}>{d.name}</option>
                            {/each}
                        </optgroup>
                    {/if}
                    {#if notebooks.length > 0}
                        <optgroup label={t.review?.scopeNotebooks ?? "笔记本"}>
                            {#each notebooks as n (n.id)}
                                <option value={`notebook:${n.id}`}>{n.name}</option>
                            {/each}
                        </optgroup>
                    {/if}
                </select>
            </div>
            {/if}
        </div>

        <!-- 若存在被隔离的卡片：内聚为看板专属警告卡，不漂浮在视口顶部 -->
        {#if qualityExcludedCardIDs.length > 0}
            <div class="lv-ready-alert" role="status" aria-live="polite">
                <div class="lv-ready-alert-main">
                    <span class="lv-ready-alert-icon"><LvIcon name="warning" size={18} /></span>
                    <div class="lv-ready-alert-text">
                        <strong style="font-variant-numeric: tabular-nums;">{(t.review?.qualityExcluded ?? "有 ${n} 张卡片存在异常").replace("${n}", String(qualityExcludedCardIDs.length))}</strong>
                        <p>{t.review?.qualityExcludedHelp ?? "这通常是因为原笔记块被移动、删除或内容为空。它们已受安全保护，不会影响正常进度。"}</p>
                    </div>
                </div>
                <div class="lv-ready-alert-actions">
                    <button type="button" class="b3-button b3-button--small b3-button--outline" onclick={onRecheckQualityExcluded}>
                        <LvIcon name="refresh" size={14} /> {t.review?.qualityRecheck ?? "重新检查"}
                    </button>
                    <button type="button" class="b3-button b3-button--small lv-btn-primary" onclick={onOpenMaintenance}>
                        <LvIcon name="target" size={14} /> {t.review?.openMaintenance ?? "前往维护中心修复"}
                    </button>
                </div>
            </div>
        {/if}

        <!-- 便当盒功能矩阵：手机端优先突出刷卡与提前冲刺，制卡与整理降级收敛 -->
        <div class="lv-ready-grid">
            {#if isTrulyEmpty}
                <div class="lv-ready-card lv-ready-card--primary">
                    <div class="lv-ready-card-head">
                        <span class="lv-ready-icon-bubble lv-bubble--brand"><LvIcon name="cards" size={17} /></span>
                        <div>
                            <div class="lv-ready-card-title">一键导入精选卡组 · 立即开刷</div>
                            <div class="lv-ready-card-subtitle">内置丰富学科与通识记忆卡包，零制作成本</div>
                        </div>
                    </div>
                    <p class="lv-ready-card-desc">无需手动录入，直接从「卡组集市」安装现成卡组即可在手机上随时随地刷卡记忆。</p>
                    <div class="lv-ready-card-footer">
                        {#if onCreateSampleCards}
                            <button type="button" class="b3-button b3-button--small lv-btn-primary" disabled={creatingSamples} onclick={onCreateSampleCards}>
                                <LvIcon name="lightbulb" size={14} /> {creatingSamples ? "正在生成示例闪卡…" : "一键生成内置示例闪卡（13 张）"}
                            </button>
                        {/if}
                        <button type="button" class="b3-button b3-button--small {onCreateSampleCards ? 'b3-button--outline' : 'lv-btn-primary'}" onclick={() => (onOpenMarketplace ? onOpenMarketplace() : onReturnHome())}>
                            <LvIcon name="star" size={14} /> 前往卡组集市
                        </button>
                        <button type="button" class="b3-button b3-button--small b3-button--outline" onclick={onOpenAuthoring}>
                            + 快速新建闪卡
                        </button>
                    </div>
                </div>
            {:else}
            <!-- 便当 1：进阶练习与突击（手机首屏主焦点） -->
            <div class="lv-ready-card lv-ready-card--primary">
                <div class="lv-ready-card-head">
                    <span class="lv-ready-icon-bubble lv-bubble--brand"><LvIcon name="zap" size={17} /></span>
                    <div>
                        <div class="lv-ready-card-title">{t.review?.readyCramTitle ?? "自主提前巩固 · 随时刷卡"}</div>
                        <div class="lv-ready-card-subtitle">{t.review?.readyCramSubtitle ?? "无需等待到期，不干扰算法排期"}</div>
                    </div>
                </div>
                <p class="lv-ready-card-desc">{t.review?.readyCramDesc ?? "按遗忘次数智能排序，优先复习最易遗忘的薄弱知识点，让长效记忆更牢固。"}</p>
                <div class="lv-ready-card-footer">
                    <button type="button" class="b3-button b3-button--small lv-btn-primary" disabled={creatingSamples} onclick={onStartCram}>
                        <LvIcon name="flame" size={14} /> {t.review?.startCram ?? "开启 Cram 提前冲刺"}
                    </button>
                    <button type="button" class="b3-button b3-button--small b3-button--outline" onclick={onScopeNew}>
                        <LvIcon name="star" size={14} /> {t.review?.scopeNew ?? "仅学新卡"}
                    </button>
                    {#if onCreateSampleCards}
                        <button type="button" class="b3-button b3-button--small b3-button--outline" disabled={creatingSamples} onclick={onCreateSampleCards}>
                            <LvIcon name="lightbulb" size={14} /> {creatingSamples ? "生成中…" : "补充示例卡"}
                        </button>
                    {/if}
                </div>
            </div>
            {/if}

            <!-- 便当 2：扩充与积累知识（偏电脑端创作，手机端隐藏收敛） -->
            <div class="lv-ready-card lv-ready-card--secondary lv-ready-card--authoring">
                <div class="lv-ready-card-head">
                    <span class="lv-ready-icon-bubble lv-bubble--good"><LvIcon name="edit" size={17} /></span>
                    <div>
                        <div class="lv-ready-card-title">{t.review?.readyCreateTitle ?? "制作与积累新卡"}</div>
                        <div class="lv-ready-card-subtitle">{t.review?.readyCreateSubtitle ?? "建议在电脑端批量制卡与整理"}</div>
                    </div>
                </div>
                <p class="lv-ready-card-desc">{t.review?.readyCreateDesc ?? "支持自由回忆、问答、选区挖空（==答案==）及图片遮挡等多样化制卡形态。"}</p>
                <div class="lv-ready-card-footer">
                    <button type="button" class="b3-button b3-button--small b3-button--outline lv-btn-tool" onclick={onOpenAuthoring}>
                        + {t.review?.createCards ?? "快速制卡"}
                    </button>
                    <button type="button" class="b3-button b3-button--small b3-button--outline lv-btn-tool" onclick={onOpenInbox}>
                        <LvIcon name="inbox" size={14} /> {t.dashboard?.inbox ?? "材料收件箱"}
                    </button>
                </div>
            </div>

            <!-- 便当 3：卡库浏览与管理（偏电脑端管理，手机端精简呈现） -->
            <div class="lv-ready-card lv-ready-card--secondary">
                <div class="lv-ready-card-head">
                    <span class="lv-ready-icon-bubble lv-bubble--warn"><LvIcon name="cards" size={17} /></span>
                    <div>
                        <div class="lv-ready-card-title">{t.review?.readyManageTitle ?? "卡片库浏览与整理"}</div>
                        <div class="lv-ready-card-subtitle">{t.review?.readyManageSubtitle ?? "全面掌控沉淀的所有闪卡资产"}</div>
                    </div>
                </div>
                <p class="lv-ready-card-desc">{t.review?.readyManageDesc ?? "跨卡组搜索检索、批量归组迁移、查看历史复习表现与生命周期健康度。"}</p>
                <div class="lv-ready-card-footer">
                    <button type="button" class="b3-button b3-button--small b3-button--outline" onclick={onOpenManager}>
                        <LvIcon name="search" size={14} /> {t.menuManager ?? "闪卡管理器"}
                    </button>
                    <button type="button" class="b3-button b3-button--small b3-button--outline" onclick={onOpenMaintenance}>
                        <LvIcon name="target" size={14} /> {t.dashboard?.maintenance ?? "维护中心"}
                    </button>
                </div>
            </div>
        </div>

        <!-- 底栏全局主路径 -->
        <div class="lv-ready-bottom-bar">
            <button
                type="button"
                class="b3-button b3-button--cancel lv-ready-refresh-btn"
                title={`${t.dashboard?.refresh ?? "刷新状态"} (r)`}
                aria-keyshortcuts="r"
                onclick={onRefreshQueue}
            >
                <LvIcon name="refresh" size={14} /> {t.dashboard?.refresh ?? "刷新状态"}
            </button>
            <button
                type="button"
                class="b3-button lv-btn-primary lv-ready-home-btn"
                title={`${t.review?.returnHome ?? "返回闪卡主页"} (Enter)`}
                aria-keyshortcuts="Enter"
                onclick={onReturnHome}
            >
                <LvIcon name="home" size={15} /> {t.review?.returnHome ?? "返回闪卡主页"}
            </button>
        </div>
    </div>
</div>

<style lang="scss">
    .lv-ready-wrap {
        width: 100%;
        max-width: 820px;
        margin: var(--lv-sp-3) auto;
        padding: 0 var(--lv-sp-3);
        box-sizing: border-box;

        .lv-ready-hub {
            background: var(--lv-color-surface);
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-l);
            box-shadow: var(--lv-shadow-card), var(--lv-inset-shine);
            padding: var(--lv-sp-5);
            display: flex;
            flex-direction: column;
            gap: var(--lv-sp-4);
            animation: lv-modal-pop var(--lv-dur-2) var(--lv-ease);
            text-align: left;
        }

        .lv-ready-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: var(--lv-sp-4);
            flex-wrap: wrap;
            padding-bottom: var(--lv-sp-3);
            border-bottom: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent);

            .lv-ready-title-group {
                flex: 1;
                min-width: 260px;

                .lv-ready-eyebrow {
                    display: inline-flex;
                    align-items: center;
                    gap: calc(var(--lv-space-unit) * 3);
                    font-size: var(--lv-type-meta-size);
                    font-weight: var(--lv-fw-semibold);
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    color: var(--lv-color-brand);
                    background: var(--lv-primary-soft);
                    border: 1px solid var(--lv-primary-border);
                    border-radius: var(--lv-r-pill);
                    padding: calc(var(--lv-space-unit) * 1) calc(var(--lv-space-unit) * 5);
                    margin-bottom: var(--lv-sp-2);
                }

                .lv-ready-title {
                    font-size: var(--lv-type-title-lg-size);
                    font-weight: var(--lv-fw-heading);
                    color: var(--lv-color-text);
                    margin: 0 0 calc(var(--lv-space-unit) * 3) 0;
                    letter-spacing: -0.02em;
                    text-wrap: balance;
                }

                .lv-ready-desc {
                    margin: 0;
                    font-size: var(--lv-type-control-size);
                    color: var(--lv-color-text-muted);
                    line-height: var(--lv-lh-reading, 1.65);
                    max-width: 48em;
                    text-wrap: pretty;
                }
            }

            .lv-ready-scope-pill {
                display: flex;
                align-items: center;
                gap: calc(var(--lv-space-unit) * 4);
                padding: calc(var(--lv-space-unit) * 2) calc(var(--lv-space-unit) * 5);
                background: color-mix(in srgb, var(--lv-color-surface) 60%, var(--lv-color-canvas));
                border: 1px solid var(--lv-border);
                border-radius: var(--lv-r-pill);
                font-size: var(--lv-type-control-size);

                .lv-ready-scope-label {
                    display: inline-flex;
                    align-items: center;
                    gap: calc(var(--lv-space-unit) * 2);
                    color: var(--lv-color-text-muted);
                    white-space: nowrap;
                }

                .lv-ready-scope-select {
                    border: none;
                    background: transparent;
                    font-size: var(--lv-type-control-size);
                    font-weight: var(--lv-fw-semibold);
                    color: var(--lv-color-brand);
                    padding: calc(var(--lv-space-unit) * 1) calc(var(--lv-space-unit) * 2);
                    cursor: pointer;
                    touch-action: manipulation;
                    transition: box-shadow var(--lv-dur-1) var(--lv-ease);

                    &:focus-visible {
                        outline: none;
                        box-shadow: var(--lv-focus-ring);
                        border-radius: var(--lv-r-pill);
                    }
                }
            }
        }

        .lv-ready-alert {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--lv-sp-3);
            flex-wrap: wrap;
            padding: calc(var(--lv-space-unit) * 6) calc(var(--lv-space-unit) * 8);
            background: color-mix(in srgb, var(--lv-color-warning) 8%, var(--lv-color-surface));
            border: 1px solid color-mix(in srgb, var(--lv-color-warning) 30%, transparent);
            border-radius: var(--lv-r-m);

            .lv-ready-alert-main {
                display: flex;
                align-items: flex-start;
                gap: calc(var(--lv-space-unit) * 5);
                flex: 1;
                min-width: 240px;

                .lv-ready-alert-icon {
                    color: var(--lv-color-warning);
                    flex: none;
                    margin-top: calc(var(--lv-space-unit) * 1);
                }

                strong {
                    display: block;
                    font-size: var(--lv-type-body-size);
                    font-weight: var(--lv-fw-semibold);
                    color: var(--lv-color-warning);
                    margin-bottom: calc(var(--lv-space-unit) * 1);
                    text-wrap: balance;
                }

                p {
                    margin: 0;
                    font-size: var(--lv-type-control-size);
                    color: var(--lv-color-text-muted);
                    line-height: var(--lv-lh-reading, 1.65);
                    max-width: 48em;
                    text-wrap: pretty;
                }
            }

            .lv-ready-alert-actions {
                display: flex;
                align-items: center;
                gap: calc(var(--lv-space-unit) * 4);
                flex-wrap: wrap;

                .b3-button {
                    touch-action: manipulation;
                    user-select: none;
                    -webkit-user-select: none;

                    &:focus-visible {
                        outline: none;
                        box-shadow: var(--lv-focus-ring);
                    }
                }
            }
        }

        .lv-ready-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: var(--lv-sp-3);

            @media (max-width: 600px) {
                grid-template-columns: 1fr;
            }

            .lv-ready-card {
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                padding: var(--lv-sp-3) var(--lv-sp-4);
                background: color-mix(in srgb, var(--lv-color-canvas) 60%, var(--lv-color-surface));
                border: 1px solid var(--lv-border);
                border-radius: var(--lv-r-m);
                transition: all var(--lv-dur-2) var(--lv-ease);

                &:hover {
                    border-color: var(--lv-primary-border);
                    transform: translateY(-2px);
                    box-shadow: var(--lv-shadow-card-hover);
                }

                .lv-ready-card-head {
                    display: flex;
                    align-items: center;
                    gap: calc(var(--lv-space-unit) * 5);
                    margin-bottom: var(--lv-sp-2);

                    .lv-ready-icon-bubble {
                        width: 32px;
                        height: 32px;
                        border-radius: var(--lv-r-s);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex: none;

                        &.lv-bubble--brand {
                            background: var(--lv-primary-soft);
                            color: var(--lv-color-brand);
                        }
                        &.lv-bubble--good {
                            background: var(--lv-good-soft);
                            color: var(--lv-color-success);
                        }
                        &.lv-bubble--warn {
                            background: var(--lv-warn-soft);
                            color: var(--lv-color-warning);
                        }
                    }

                    .lv-ready-card-title {
                        font-size: var(--lv-type-body-sm-size);
                        font-weight: var(--lv-fw-semibold);
                        color: var(--lv-color-text);
                        text-wrap: balance;
                    }

                    .lv-ready-card-subtitle {
                        font-size: var(--lv-type-meta-size);
                        color: var(--lv-color-text-muted);
                    }
                }

                .lv-ready-card-desc {
                    margin: 0 0 var(--lv-sp-3) 0;
                    font-size: var(--lv-type-control-size);
                    color: var(--lv-color-text-muted);
                    line-height: var(--lv-lh-reading-tight);
                    flex: 1;
                    max-width: 48em;
                    text-wrap: pretty;
                }

                .lv-ready-card-footer {
                    display: flex;
                    gap: calc(var(--lv-space-unit) * 4);
                    flex-wrap: wrap;

                    .b3-button {
                        border-radius: var(--lv-r-pill);
                        font-size: var(--lv-type-meta-size);
                        touch-action: manipulation;
                        user-select: none;
                        -webkit-user-select: none;
                        &:focus-visible {
                            outline: none;
                            box-shadow: var(--lv-focus-ring);
                        }
                    }
                }
            }
        }

        .lv-ready-bottom-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--lv-sp-2);
            padding-top: var(--lv-sp-2);
            border-top: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent);

            .b3-button {
                touch-action: manipulation;
                user-select: none;
                -webkit-user-select: none;
                &:focus-visible {
                    outline: none;
                    box-shadow: var(--lv-focus-ring);
                }
            }

            .lv-ready-home-btn {
                border-radius: var(--lv-r-pill);
                padding: calc(var(--lv-space-unit) * 3) calc(var(--lv-space-unit) * 9);
                font-weight: var(--lv-fw-semibold);
            }

            .lv-ready-refresh-btn {
                border-radius: var(--lv-r-pill);
                font-size: var(--lv-type-control-size);
            }
        }

        @media (max-width: 680px) {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;

            .lv-ready-hub {
                padding: 12px !important;
                gap: 10px !important;
                border-radius: var(--lv-r-m);
            }

            .lv-ready-header {
                flex-direction: column;
                align-items: stretch;
                gap: 8px;
                padding-bottom: 8px;

                .lv-ready-title-group {
                    min-width: 0 !important;
                    width: 100%;

                    .lv-ready-eyebrow {
                        display: none;
                    }

                    .lv-ready-title {
                        font-size: 16px;
                        margin-bottom: 4px;
                    }

                    .lv-ready-desc {
                        font-size: 12px;
                        line-height: 1.45;
                    }
                }

                .lv-ready-scope-pill {
                    width: 100%;
                    box-sizing: border-box;
                    justify-content: space-between;
                    padding: 6px 12px;

                    .lv-ready-scope-select {
                        flex: 1 1 auto;
                        min-width: 0;
                        max-width: 65%;
                        text-overflow: ellipsis;
                    }
                }
            }

            .lv-ready-alert {
                padding: 10px 12px;
                gap: 8px;

                .lv-ready-alert-main {
                    min-width: 0 !important;
                }

                .lv-ready-alert-actions {
                    width: 100%;
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 8px;

                    .b3-button {
                        width: 100%;
                        justify-content: center;
                        min-height: 36px;
                    }
                }
            }

            .lv-ready-grid {
                grid-template-columns: 1fr !important;
                gap: 8px;

                .lv-ready-card--primary {
                    border-color: var(--lv-primary-border) !important;
                    background: linear-gradient(155deg, color-mix(in srgb, var(--lv-color-brand) 7%, var(--lv-color-surface)) 0%, var(--lv-color-surface) 100%) !important;
                    box-shadow: 0 6px 18px -4px color-mix(in srgb, var(--lv-color-brand) 16%, transparent) !important;
                    padding: 14px !important;
                }

                .lv-ready-card--authoring {
                    display: none !important;
                }

                .lv-ready-card--secondary {
                    padding: 9px 12px !important;
                    opacity: 0.92;

                    .lv-ready-card-desc,
                    .lv-ready-card-subtitle {
                        display: none !important;
                    }

                    .lv-ready-card-head {
                        margin-bottom: 6px !important;
                    }
                }

                .lv-ready-card {
                    padding: 10px 12px;

                    .lv-ready-card-head {
                        gap: 10px;
                        margin-bottom: 4px;

                        .lv-ready-icon-bubble {
                            width: 28px;
                            height: 28px;
                        }

                        > div {
                            flex: 1 1 auto;
                            min-width: 0;
                        }

                        .lv-ready-card-title {
                            font-size: 13.5px;
                        }

                        .lv-ready-card-subtitle {
                            font-size: 11.5px;
                        }
                    }

                    .lv-ready-card-desc {
                        font-size: 12px;
                        line-height: 1.42;
                        margin-bottom: 8px;
                    }

                    .lv-ready-card-footer {
                        display: grid;
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                        gap: 8px;

                        .b3-button {
                            width: 100%;
                            min-width: 0;
                            min-height: 36px;
                            padding: 0 8px;
                            justify-content: center;
                            white-space: nowrap;
                            overflow: hidden;
                            text-overflow: ellipsis;
                        }
                    }
                }
            }

            .lv-ready-bottom-bar {
                display: grid;
                grid-template-columns: 1fr 1.35fr;
                gap: 8px;
                padding-top: 8px;

                .b3-button {
                    width: 100%;
                    min-height: 40px;
                    padding: 0 10px;
                    justify-content: center;
                }
            }
        }
    }
</style>
