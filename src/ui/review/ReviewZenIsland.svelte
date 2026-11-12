<script lang="ts">
    import LvIcon from "@/ui/kit/LvIcon.svelte";

    let {
        t,
        isStarred = false,
        disabled = false,
        onAdjustFontScale,
        onToggleStar,
        onOpenMemo,
        onExitZen,
    }: {
        t: any;
        isStarred?: boolean;
        disabled?: boolean;
        onAdjustFontScale: (delta: number) => void;
        onToggleStar: () => void;
        onOpenMemo: () => void;
        onExitZen: () => void;
    } = $props();
</script>

<div class="lv-zen-island" role="toolbar" aria-label="专注模式工具栏">
    <button
        type="button"
        class="lv-zen-tool-btn"
        title="缩小卡面字号"
        onclick={(e) => { e.stopPropagation(); onAdjustFontScale(-0.1); }}
    >
        A−
    </button>
    <button
        type="button"
        class="lv-zen-tool-btn"
        title="放大卡面字号"
        onclick={(e) => { e.stopPropagation(); onAdjustFontScale(0.1); }}
    >
        A+
    </button>
    <div class="lv-zen-island-sep" aria-hidden="true"></div>
    <button
        type="button"
        class="lv-zen-tool-btn"
        class:lv-zen-starred={isStarred}
        title={isStarred ? "已星标重点 (*)" : "星标重点 (*)"}
        aria-label="星标重点"
        aria-keyshortcuts="*"
        {disabled}
        onclick={(e) => { e.stopPropagation(); onToggleStar(); }}
    >
        <LvIcon name="star" size={13} />
    </button>
    <button
        type="button"
        class="lv-zen-tool-btn"
        title={t.review?.tbMemo ?? "助记便签"}
        aria-label="助记便签"
        {disabled}
        onclick={(e) => { e.stopPropagation(); onOpenMemo(); }}
    >
        <LvIcon name="lightbulb" size={13} />
    </button>
    <div class="lv-zen-island-sep" aria-hidden="true"></div>
    <button
        type="button"
        class="lv-zen-exit-btn"
        title="退出专注模式 (z)"
        aria-keyshortcuts="z"
        onclick={(e) => { e.stopPropagation(); onExitZen(); }}
    >
        <span>退出专注 (z)</span>
    </button>
</div>

<style>
    .lv-zen-island {
        position: absolute;
        top: max(14px, calc(env(safe-area-inset-top, 0px) + 8px));
        left: 50%;
        transform: translateX(-50%);
        z-index: var(--lv-z-sticky);
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 3);
        padding: calc(var(--lv-space-unit) * 2) calc(var(--lv-space-unit) * 5);
        border-radius: var(--lv-r-pill);
        background: var(--lv-color-surface);
        border: 1px solid var(--lv-border);
        box-shadow: var(--lv-shadow-2), var(--lv-inset-shine);
        pointer-events: auto;

        @supports (backdrop-filter: blur(16px)) or (-webkit-backdrop-filter: blur(16px)) {
            background: color-mix(in srgb, var(--lv-color-surface) 86%, transparent);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
        }
    }
    .lv-zen-island-sep {
        width: 1px;
        height: 14px;
        background: var(--lv-border);
        margin: 0 calc(var(--lv-space-unit) * 1);
    }
    .lv-zen-tool-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 26px;
        height: 26px;
        padding: 0 calc(var(--lv-space-unit) * 3);
        border: none;
        border-radius: var(--lv-r-pill);
        background: transparent;
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-control-size);
        font-weight: var(--lv-fw-semibold);
        cursor: pointer;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        transition: transform var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease), border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease), opacity var(--lv-dur-1) var(--lv-ease);

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
    .lv-zen-tool-btn:hover:not(:disabled) {
        background: var(--lv-surface-hover);
        color: var(--lv-color-text);
    }
    .lv-zen-tool-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
    }
    .lv-zen-tool-btn.lv-zen-starred {
        color: var(--lv-color-warning);
    }
    .lv-zen-exit-btn {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 2);
        height: 26px;
        padding: 0 calc(var(--lv-space-unit) * 5);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-pill);
        background: var(--lv-surface-hover);
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-meta-size);
        cursor: pointer;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        transition: transform var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease), border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease), opacity var(--lv-dur-1) var(--lv-ease);

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
    .lv-zen-exit-btn:hover {
        background: color-mix(in srgb, var(--lv-color-brand) 12%, var(--lv-surface-hover));
        color: var(--lv-color-brand);
        border-color: var(--lv-primary-border);
    }
    @media (pointer: coarse) {
        .lv-zen-tool-btn,
        .lv-zen-exit-btn {
            min-width: 36px;
            min-height: 36px;
        }
    }
</style>
