<script lang="ts">
    import LvIcon, { type LvIconName } from "./LvIcon.svelte";

    let { text, actionLabel = "", onaction, icon = "inbox" }: {
        text: string;
        actionLabel?: string;
        onaction?: () => void;
        icon?: LvIconName;
    } = $props();
</script>

<div class="lv-card2 lv-empty">
    <!-- 规律六：圆润体积感的情感化点缀，颜色取主题色三档明度，不干扰信息读取 -->
    <div class="lv-empty-icon" aria-hidden="true"><LvIcon name={icon} size={26} /></div>
    <div class="lv-empty-text">{text}</div>
    {#if actionLabel && onaction}
        <button class="b3-button b3-button--outline lv-empty-btn" onclick={onaction}>
            <LvIcon name="plus" size={13} />
            <span>{actionLabel}</span>
        </button>
    {/if}
</div>

<style>
    .lv-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--lv-sp-3);
        padding: clamp(var(--lv-sp-5), 5vw, calc(var(--lv-space-unit) * 18));
        text-align: center;
        color: var(--lv-color-text-muted);
        background: var(--lv-color-surface);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-card-radius);
    }
    .lv-empty-icon {
        width: 56px;
        height: 56px;
        border-radius: var(--lv-r-l);
        display: grid;
        place-items: center;
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
        box-shadow: 0 0 0 6px color-mix(in srgb, var(--lv-color-brand) 6%, transparent),
            0 4px 16px -2px color-mix(in srgb, var(--lv-color-brand) 18%, transparent);
        border: 1px solid var(--lv-primary-border);
        margin-bottom: var(--lv-sp-1);
    }
    .lv-empty-text {
        font-size: var(--lv-type-body-size);
        color: var(--lv-color-text);
        font-weight: var(--lv-fw-medium);
        max-width: 360px;
        line-height: var(--lv-lh-body);
        text-wrap: pretty;
    }
    .lv-empty-btn {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 2);
        border-radius: var(--lv-r-pill);
        padding: calc(var(--lv-space-unit) * 2) calc(var(--lv-space-unit) * 8);
        font-size: var(--lv-type-control-size);
        font-weight: var(--lv-fw-semibold);
        margin-top: var(--lv-sp-1);
        box-shadow: var(--lv-shadow-1);
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        transition: transform var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-2) var(--lv-ease);

        &:hover {
            transform: translateY(-1.5px);
            box-shadow: var(--lv-shadow-2);
        }
        &:active {
            transform: translateY(0.5px) scale(0.985);
        }
        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
</style>
