<script lang="ts">
    import type { Snippet } from "svelte";

    let { eyebrow = "", title = "", subtitle = "", pageId, onscroll, onfocusin, actions, children }: {
        /** 页眉线（如 TODAY / 2026.10.07），R53 .page-head 的 eyebrow 层 */
        eyebrow?: string;
        /** 页题（空则不渲染页头） */
        title?: string;
        subtitle?: string;
        /** 可选稳定 ID，供需要恢复滚动位置的页面定位自身滚动容器。 */
        pageId?: string;
        onscroll?: (event: Event) => void;
        onfocusin?: (event: FocusEvent) => void;
        actions?: Snippet;
        children?: Snippet;
    } = $props();
</script>

<div class="lv-page" id={pageId} role="main" aria-label={title || eyebrow || undefined} {onscroll} {onfocusin}>
    {#if title || actions}
        <div class="lv-pagehead">
            <div class="lv-pagehead-main">
                {#if eyebrow}<div class="lv-eyebrow">{eyebrow}</div>{/if}
                {#if title}<div class="lv-pagehead-title">{title}</div>{/if}
                {#if subtitle}<p class="lv-pagehead-sub">{subtitle}</p>{/if}
            </div>
            {#if actions}
                <div class="lv-pagehead-actions">{@render actions()}</div>
            {/if}
        </div>
    {/if}
    {@render children?.()}
</div>

<style>
    .lv-pagehead-title {
        text-wrap: balance;
    }
    .lv-pagehead-sub {
        max-width: 48em;
        text-wrap: pretty;
        line-height: var(--lv-lh-reading, 1.65);
    }
    .lv-pagehead-actions :global(.b3-button) {
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
</style>
