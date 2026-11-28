<script lang="ts">
    import type { Snippet } from "svelte";
    import { fade } from "svelte/transition";
    import { trapFocus, type FocusTrap } from "@/libs/focus-trap";
    import { getMotionDuration } from "./motion";
    import LvIcon from "./LvIcon.svelte";

    /** 抽屉（Kit）：右侧滑出面板，焦点限制在面板内，遮罩点击关闭 */
    let { open = false, title = "", width = "min(480px, 92vw)", closeLabel = "close", children, actions, onclose }: {
        open: boolean;
        title?: string;
        width?: string;
        /** 关闭按钮的可访问名称，由宿主按当前语言传入。 */
        closeLabel?: string;
        children?: Snippet;
        /** 头部操作区（关闭按钮左侧） */
        actions?: Snippet;
        onclose: () => void;
    } = $props();

    const drawerId = $props.id();
    const titleId = `${drawerId}-title`;
    let drawerEl = $state<HTMLElement | null>(null);

    // 抽屉打开后把焦点移入并限制 Tab 循环；销毁时由 focus-trap 归还原焦点。
    $effect(() => {
        if (!open || !drawerEl) return;
        const trap: FocusTrap = trapFocus(drawerEl, { onEscape: onclose });
        return () => trap.release();
    });
</script>

{#if open}
    <div class="lv-drawer-mask" transition:fade={{ duration: getMotionDuration("fast") }} onclick={onclose} role="presentation"></div>
    <!-- AS-1：焦点由 focus-trap 限制在模态抽屉内，标题通过 labelledby 关联。 -->
    <div
        class="lv-drawer b3-typography"
        style={`width:${width}`}
        transition:fade={{ duration: getMotionDuration("panel") }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : "Drawer"}
        tabindex="-1"
        bind:this={drawerEl}
    >
        <div class="lv-drawer-head">
            <span id={titleId} class="lv-drawer-title">{title}</span>
            <span class="lv-drawer-actions">
                {#if actions}{@render actions()}{/if}
                <button
                    class="b3-button b3-button--small b3-button--outline lv-btn-tool lv-drawer-close"
                    onclick={onclose}
                    aria-label={closeLabel}
                    aria-keyshortcuts="Escape"
                    title={`${closeLabel} (Esc)`}
                >
                    <LvIcon name="close" size={13} />
                </button>
            </span>
        </div>
        <div class="lv-drawer-body">
            {@render children?.()}
        </div>
    </div>
{/if}

<style>
    .lv-drawer-mask {
        position: fixed;
        inset: 0;
        background: color-mix(in srgb, black 32%, transparent);
        z-index: var(--lv-z-drawer, 300);

        @supports (backdrop-filter: blur(4px)) or (-webkit-backdrop-filter: blur(4px)) {
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
        }
    }
    .lv-drawer {
        position: fixed;
        top: 14px;
        right: 14px;
        bottom: 14px;
        z-index: calc(var(--lv-z-drawer, 300) + 1);
        display: flex;
        flex-direction: column;
        max-width: calc(100vw - 28px);
        background: var(--lv-color-surface);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-dialog);
        box-shadow: var(--lv-shadow-3), var(--lv-inset-shine);
        overflow: hidden;
    }
    .lv-drawer-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--lv-sp-2);
        padding: calc(var(--lv-space-unit) * 11) calc(var(--lv-space-unit) * 12) calc(var(--lv-space-unit) * 8 + var(--lv-space-hairline));
        border-bottom: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent);
    }
    .lv-drawer-title { font-weight: var(--lv-fw-bold); font-size: var(--lv-type-title-size); text-wrap: balance; min-width: 0; }
    .lv-drawer-actions {
        display: inline-flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--lv-sp-2);
        margin-left: auto;

        button {
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }
        }
    }
    .lv-drawer-body {
        flex: 1;
        min-height: 0;
        min-width: 0;
        container-type: inline-size;
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;
        padding: calc(var(--lv-space-unit) * 11) calc(var(--lv-space-unit) * 12);
    }

    @media (max-width: 680px) {
        .lv-drawer {
            inset: 0 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            height: 100vh !important;
            height: var(--lv-vv-h, 100dvh) !important;
            border-radius: 0 !important;
            border: none !important;
            box-shadow: none !important;
        }
        .lv-drawer-head {
            padding: calc(env(safe-area-inset-top, 0px) + var(--lv-sp-2)) var(--lv-sp-3) var(--lv-sp-2);
            gap: var(--lv-sp-2);
        }
        .lv-drawer-actions {
            gap: var(--lv-sp-1);
        }
        .lv-drawer-close {
            width: 44px !important;
            height: 44px !important;
            min-width: 44px !important;
            min-height: 44px !important;
            padding: 0 !important;
            justify-content: center;
        }
        .lv-drawer-body {
            padding: var(--lv-sp-3) var(--lv-sp-3) max(var(--lv-sp-4), env(safe-area-inset-bottom, 0px));
        }
    }
</style>
