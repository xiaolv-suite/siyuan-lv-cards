<script lang="ts">
    import LvIcon from "./LvIcon.svelte";
    /** 错误态卡（Kit）：内联错误信息 + 可选重试按钮，永不白屏（AJ11 配套） */
    let { message = "", onretry, retryLabel = "" }: {
        message: string;
        onretry?: () => void;
        retryLabel?: string;
    } = $props();
</script>

<div class="lv-card2 lv-error2" role="alert" aria-live="assertive">
    <div class="lv-error2-icon"><LvIcon name="warning" size={18} /></div>
    <div class="lv-error2-msg">{message}</div>
    {#if onretry}
        <button class="b3-button b3-button--outline lv-error-retry-btn" onclick={onretry}>
            <LvIcon name="refresh" size={13} />
            <span>{retryLabel}</span>
        </button>
    {/if}
</div>

<style>
    .lv-error2 {
        border-color: var(--lv-danger-border);
        background: var(--lv-danger-soft);
        display: flex;
        align-items: center;
        gap: var(--lv-sp-3);
        flex-wrap: wrap;
        border-radius: var(--lv-r-m);
        padding: calc(var(--lv-space-unit) * 5) calc(var(--lv-space-unit) * 7);
        box-shadow: var(--lv-shadow-1);
    }
    .lv-error2-icon {
        color: var(--lv-color-danger);
        display: flex;
        align-items: center;
        flex-shrink: 0;
    }
    .lv-error2-msg {
        color: var(--lv-color-on-danger-soft);
        font-size: var(--lv-type-body-size);
        line-height: var(--lv-lh-body);
        overflow-wrap: anywhere;
        max-width: 48em;
        text-wrap: pretty;
        flex: 1;
        min-width: 200px;
    }
    .lv-error-retry-btn {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 2);
        border-radius: var(--lv-r-pill);
        padding: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 6);
        font-size: var(--lv-type-control-size);
        font-weight: var(--lv-fw-semibold);
        border-color: var(--lv-danger-border);
        color: var(--lv-color-danger);
        background: var(--lv-color-surface);
        box-shadow: var(--lv-shadow-1);
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        transition: transform var(--lv-dur-1) var(--lv-ease), background-color var(--lv-dur-1) var(--lv-ease);

        &:hover {
            transform: translateY(-1px);
            background: color-mix(in srgb, var(--lv-color-danger) 10%, var(--lv-color-surface));
            box-shadow: var(--lv-shadow-2);
        }
        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
</style>
