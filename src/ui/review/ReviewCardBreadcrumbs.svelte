<script lang="ts">
    import LvIcon from "../kit/LvIcon.svelte";
    import type { ReviewBreadcrumbChain } from "@/core/review-breadcrumbs";

    interface Props {
        breadcrumbs?: ReviewBreadcrumbChain | null;
        hpath?: string;
        hideParentPath?: boolean;
        t: any;
        onToggleContext?: () => void;
        onToggleParentPath?: () => void;
        onOpenInEditor?: () => void;
        onContextMenu?: (e: MouseEvent) => void;
    }

    let {
        breadcrumbs = null,
        hpath = "",
        hideParentPath = $bindable(false),
        t,
        onToggleContext = () => {},
        onToggleParentPath = () => {},
        onOpenInEditor = () => {},
        onContextMenu,
    }: Props = $props();

    function handleToggleParent(e: MouseEvent | KeyboardEvent) {
        e.stopPropagation();
        hideParentPath = !hideParentPath;
        onToggleParentPath();
    }
</script>

{#if breadcrumbs && breadcrumbs.nodes.length > 0}
    <!-- 汲取自闪卡小助手 ZY 与 RemNote：卡面来源文档知识语境层级面包屑 -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
        class="lv-card-source-breadcrumb"
        title={(breadcrumbs.formattedText || hpath) + " · " + (t.review?.breadcrumbHint ?? "点击查阅来源文档上下文")}
        onclick={onToggleContext}
        data-testid="review-breadcrumbs-btn"
    >
        <button
            type="button"
            class="lv-breadcrumb-btn"
            title={(breadcrumbs.formattedText || hpath) + " · " + (t.review?.breadcrumbHint ?? "点击查阅来源文档上下文")}
            aria-label={(breadcrumbs.formattedText || hpath) + "，" + (t.review?.breadcrumbHint ?? "点击查阅来源文档上下文")}
            onclick={(e) => { e.stopPropagation(); onToggleContext(); }}
            data-testid="review-breadcrumb-locate-btn"
        >
            <span class="lv-breadcrumb-icon"><LvIcon name="book" size={16} /></span>
            <span class="lv-breadcrumb-text">
                {#each (hideParentPath && breadcrumbs.nodes.length > 1 ? [breadcrumbs.nodes[breadcrumbs.nodes.length - 1]] : breadcrumbs.nodes) as node, idx}
                    {#if idx > 0}<span class="lv-breadcrumb-sep" aria-hidden="true">›</span>{/if}
                    <span class="lv-breadcrumb-node" title={node.fullTitle}>{node.displayTitle}</span>
                {/each}
            </span>
        </button>
        {#if breadcrumbs.nodes.length > 1}
            <button
                type="button"
                class="lv-breadcrumb-toggle"
                title={hideParentPath ? (t.review?.breadcrumbShowParent ?? "显示完整父路径") : (t.review?.breadcrumbHideParent ?? "隐藏父路径（仅保留末级文档）")}
                aria-label={hideParentPath ? (t.review?.breadcrumbShowParent ?? "显示完整父路径") : (t.review?.breadcrumbHideParent ?? "隐藏父路径（仅保留末级文档）")}
                onclick={handleToggleParent}
            >
                <LvIcon name={hideParentPath ? "chevron-right" : "chevron-left"} size={11} />
            </button>
        {/if}
        <button
            type="button"
            class="lv-breadcrumb-locate-btn"
            title={(t.review?.locateInSiYuan ?? "在思源中定位原块") + "（右键呼出原生菜单）"}
            aria-label={t.review?.locateInSiYuan ?? "在思源中定位原块"}
            onclick={(e) => { e.stopPropagation(); onOpenInEditor(); }}
            oncontextmenu={(e) => { e.stopPropagation(); onContextMenu?.(e); }}
            data-testid="review-locate-source-btn"
        >
            <LvIcon name="edit" size={12} />
        </button>
    </div>
{:else if hpath}
    <!-- 汲取自闪卡小助手 ZY 与 RemNote：卡面来源文档知识语境面包屑 -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
        class="lv-card-source-breadcrumb"
        title={t.review?.breadcrumbHint ?? "点击查阅来源文档上下文"}
        onclick={onToggleContext}
        data-testid="review-breadcrumbs-btn"
    >
        <button
            type="button"
            class="lv-breadcrumb-btn"
            title={t.review?.breadcrumbHint ?? "点击查阅来源文档上下文"}
            aria-label={hpath + "，" + (t.review?.breadcrumbHint ?? "点击查阅来源文档上下文")}
            onclick={(e) => { e.stopPropagation(); onToggleContext(); }}
            data-testid="review-breadcrumb-locate-btn"
        >
            <span class="lv-breadcrumb-icon"><LvIcon name="book" size={16} /></span>
            <span class="lv-breadcrumb-text">{hpath}</span>
        </button>
        <button
            type="button"
            class="lv-breadcrumb-locate-btn"
            title={(t.review?.locateInSiYuan ?? "在思源中定位原块") + "（右键呼出原生菜单）"}
            aria-label={t.review?.locateInSiYuan ?? "在思源中定位原块"}
            onclick={(e) => { e.stopPropagation(); onOpenInEditor(); }}
            oncontextmenu={(e) => { e.stopPropagation(); onContextMenu?.(e); }}
            data-testid="review-locate-source-btn"
        >
            <LvIcon name="edit" size={12} />
        </button>
    </div>
{/if}

<style lang="scss">
    .lv-card-source-breadcrumb {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 1);
        max-width: min(calc(100% - var(--lv-sp-2)), 520px);
        box-sizing: border-box;
        padding: calc(var(--lv-space-unit) * 1) calc(var(--lv-space-unit) * 3);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-pill);
        background: color-mix(in srgb, var(--lv-color-canvas) 85%, transparent);
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-meta-size);
        margin-bottom: var(--lv-sp-3);
        margin-right: var(--lv-sp-2);
        box-shadow: var(--lv-shadow-1);
        user-select: none;
        -webkit-user-select: none;
        transition: background var(--lv-dur-1) var(--lv-ease),
            color var(--lv-dur-1) var(--lv-ease),
            border-color var(--lv-dur-1) var(--lv-ease);

        &:hover {
            border-color: var(--lv-primary-border);
        }

        .lv-breadcrumb-btn {
            background: transparent;
            border: none;
            padding: calc(var(--lv-space-unit) * 1) calc(var(--lv-space-unit) * 2);
            margin: 0;
            font: inherit;
            color: inherit;
            cursor: pointer;
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;
            display: inline-flex;
            align-items: center;
            gap: calc(var(--lv-space-unit) * 2);
            overflow: hidden;
            min-width: 0;

            &:hover {
                color: var(--lv-color-brand);
            }

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
                border-radius: var(--lv-r-pill);
            }
        }

        .lv-breadcrumb-icon {
            font-size: var(--lv-type-control-size);
            flex-shrink: 0;
            color: var(--lv-color-brand);
            opacity: 0.85;
            display: inline-flex;
            align-items: center;
        }
        .lv-breadcrumb-text {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            display: inline-flex;
            align-items: center;
            gap: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline));
            min-width: 0;
        }
        .lv-breadcrumb-node {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 150px;
        }
        .lv-breadcrumb-sep {
            opacity: 0.4;
            font-weight: var(--lv-fw-regular, 400);
            padding: 0 var(--lv-space-hairline);
        }
        .lv-breadcrumb-toggle {
            background: transparent;
            border: none;
            cursor: pointer;
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            opacity: 0.6;
            padding: calc(var(--lv-space-unit) * 1);
            border-radius: var(--lv-r-circle);
            color: inherit;
            transition: opacity var(--lv-dur-1) var(--lv-ease), background-color var(--lv-dur-1) var(--lv-ease);

            &:hover {
                opacity: 1;
                background-color: color-mix(in srgb, var(--lv-color-brand) 15%, transparent);
                color: var(--lv-color-brand);
            }

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
                opacity: 1;
            }
        }
        .lv-breadcrumb-locate-btn {
            background: transparent;
            border: none;
            cursor: pointer;
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            opacity: 0.6;
            min-width: 28px;
            min-height: 28px;
            box-sizing: border-box;
            padding: calc(var(--lv-space-unit) * 1);
            border-radius: var(--lv-r-circle);
            color: inherit;
            transition: opacity var(--lv-dur-1) var(--lv-ease), background-color var(--lv-dur-1) var(--lv-ease);

            &:hover {
                opacity: 1;
                background-color: color-mix(in srgb, var(--lv-color-brand) 15%, transparent);
                color: var(--lv-color-brand);
            }

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
                opacity: 1;
            }
        }
    }
    @media (max-width: 680px), (pointer: coarse) {
        .lv-card-source-breadcrumb :is(.lv-breadcrumb-btn, .lv-breadcrumb-toggle, .lv-breadcrumb-locate-btn) {
            min-width: 36px; min-height: 36px;
        }
    }
    :global(.lv-mobile) .lv-card-source-breadcrumb :is(.lv-breadcrumb-toggle, .lv-breadcrumb-locate-btn),
    :global([data-mobile="true"]) .lv-card-source-breadcrumb :is(.lv-breadcrumb-toggle, .lv-breadcrumb-locate-btn) {
        min-width: 36px; min-height: 36px;
    }
</style>
