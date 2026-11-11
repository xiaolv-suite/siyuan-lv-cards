<script lang="ts">
    import type { Snippet } from "svelte";

    let { title = "", sub = "", id, children, actions }: {
        title?: string;
        sub?: string;
        id?: string;
        children?: Snippet;
        /** 头部右侧操作区（导出/开关等） */
        actions?: Snippet;
    } = $props();
</script>

<div {id} class="lv-card2 lv-section2">
    {#if title}
        <div class="lv-secthead">
            <span>{title}
                {#if sub}<span class="lv-secthead-sub">· {sub}</span>{/if}
            </span>
            {#if actions}<span class="lv-secthead-actions">{@render actions()}</span>{/if}
        </div>
    {/if}
    {@render children?.()}
</div>

<style>
    .lv-section2 {
        margin-bottom: var(--lv-sp-4);
        /* 吸顶导航栏（桌面 44px / 移动端约 52px）+ 呼吸间距，锚点落点不被遮挡 */
        scroll-margin-top: 64px;
    }
    /* Global .lv-secthead owns typography/spacing; this component only adds
       the section-specific action alignment. Keep the selector scoped so it
       cannot redefine headings in unrelated views. */
    .lv-section2 > .lv-secthead {
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--lv-sp-2);

        span:first-child {
            text-wrap: balance;
            min-width: 0;
        }
    }
    .lv-section2 > .lv-secthead .lv-secthead-actions {
        display: inline-flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--lv-sp-1);

        :global(.b3-button) {
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }
        }
    }
</style>
