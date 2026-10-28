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
    }

    let {
        breadcrumbs = null,
        hpath = "",
        hideParentPath = $bindable(false),
        t,
        onToggleContext = () => {},
        onToggleParentPath = () => {},
    }: Props = $props();

    function handleToggleParent(e: MouseEvent | KeyboardEvent) {
        e.stopPropagation();
        hideParentPath = !hideParentPath;
        onToggleParentPath();
    }

    function handleKeyDown(e: KeyboardEvent) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleToggleParent(e);
        }
    }
</script>

{#if breadcrumbs && breadcrumbs.nodes.length > 0}
    <!-- 汲取自闪卡小助手 ZY 与 RemNote：卡面来源文档知识语境层级面包屑 -->
    <button
        type="button"
        class="lv-card-source-breadcrumb"
        title={(breadcrumbs.formattedText || hpath) + " · " + (t.review?.breadcrumbHint ?? "点击查阅来源文档上下文")}
        onclick={onToggleContext}
        data-testid="review-breadcrumbs-btn"
    >
        <span class="lv-breadcrumb-icon"><LvIcon name="book" size={16} /></span>
        <span class="lv-breadcrumb-text">
            {#each (hideParentPath && breadcrumbs.nodes.length > 1 ? [breadcrumbs.nodes[breadcrumbs.nodes.length - 1]] : breadcrumbs.nodes) as node, idx}
                {#if idx > 0}<span class="lv-breadcrumb-sep" aria-hidden="true">›</span>{/if}
                <span class="lv-breadcrumb-node" title={node.fullTitle}>{node.displayTitle}</span>
            {/each}
        </span>
        {#if breadcrumbs.nodes.length > 1}
            <span
                role="button"
                tabindex="0"
                class="lv-breadcrumb-toggle"
                title={hideParentPath ? (t.review?.breadcrumbShowParent ?? "显示完整父路径") : (t.review?.breadcrumbHideParent ?? "隐藏父路径（仅保留末级文档）")}
                onclick={handleToggleParent}
                onkeydown={handleKeyDown}
            >
                <LvIcon name={hideParentPath ? "chevron-right" : "chevron-left"} size={11} />
            </span>
        {/if}
    </button>
{:else if hpath}
    <!-- 汲取自闪卡小助手 ZY 与 RemNote：卡面来源文档知识语境面包屑 -->
    <button
        type="button"
        class="lv-card-source-breadcrumb"
        title={t.review?.breadcrumbHint ?? "点击查阅来源文档上下文"}
        onclick={onToggleContext}
    >
        <span class="lv-breadcrumb-icon"><LvIcon name="book" size={16} /></span>
        <span class="lv-breadcrumb-text">{hpath}</span>
    </button>
{/if}

<style lang="scss">
    .lv-card-source-breadcrumb {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 2);
        max-width: 100%;
        padding: calc(var(--lv-space-unit) * 2) calc(var(--lv-space-unit) * 6);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-pill);
        background: color-mix(in srgb, var(--lv-color-canvas) 85%, transparent);
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-meta-size);
        margin-bottom: var(--lv-sp-3);
        cursor: pointer;
        box-shadow: 0 1px 2px color-mix(in srgb, black 3%, transparent);
        transition: background var(--lv-dur-1) var(--lv-ease),
            color var(--lv-dur-1) var(--lv-ease),
            border-color var(--lv-dur-1) var(--lv-ease),
            transform var(--lv-dur-1) var(--lv-ease),
            box-shadow var(--lv-dur-2) var(--lv-ease);

        &:hover {
            background: var(--lv-surface-hover);
            color: var(--lv-color-brand);
            border-color: var(--lv-primary-border);
            transform: translateY(-1.5px);
            box-shadow: 0 2px 6px color-mix(in srgb, var(--lv-color-brand) 12%, transparent);
        }
        &:active {
            transform: translateY(0.5px);
        }
        .lv-breadcrumb-icon {
            font-size: var(--lv-type-control-size);
            flex-shrink: 0;
            color: var(--lv-color-brand);
            opacity: 0.85;
        }
        .lv-breadcrumb-text {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            display: inline-flex;
            align-items: center;
            gap: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline));
        }
        .lv-breadcrumb-sep {
            opacity: 0.4;
            font-weight: 300;
            padding: 0 var(--lv-space-hairline);
        }
        .lv-breadcrumb-toggle {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-left: calc(var(--lv-space-unit) * 1);
            opacity: 0.6;
            padding: 0 calc(var(--lv-space-unit) * 1);
            border-radius: var(--lv-r-circle);
            transition: opacity var(--lv-dur-1) var(--lv-ease), background-color var(--lv-dur-1) var(--lv-ease);

            &:hover {
                opacity: 1;
                background-color: color-mix(in srgb, var(--lv-color-brand) 15%, transparent);
                color: var(--lv-color-brand);
            }
        }
    }
</style>
