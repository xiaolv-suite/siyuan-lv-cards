<script lang="ts">
    import LvIcon from "../kit/LvIcon.svelte";

    interface Props {
        showAnswer?: boolean;
        cardMemo?: string;
        isCustomPluginAnswer?: boolean;
        cardHtml?: string;
        occl?: any;
        faceError?: string | boolean;
        t: any;
        onEditMemo?: () => void;
    }

    let {
        showAnswer = false,
        cardMemo = "",
        isCustomPluginAnswer = false,
        cardHtml = "",
        occl: _occl = null,
        faceError = "",
        t,
        onEditMemo = () => {},
    }: Props = $props();

    let memoTitle = $derived(
        isCustomPluginAnswer
            ? (t?.review?.customAnswerTitle ?? "参考答案（来自生态插件）")
            : !cardHtml?.includes('data-type="mark"')
            ? (t?.review?.memoAnswerTitle ?? "参考答案（来自思源块备注）")
            : (t?.review?.memoTitle ?? "助记线索")
    );
</script>

{#if showAnswer}
    {#if cardMemo}
        <!-- 汲取自渐进学习与闪卡小助手插件：展示备注与生态插件答案 -->
        <div class="lv-card-memo-callout" data-testid="review-card-memo">
            <span class="lv-memo-icon"><LvIcon name="lightbulb" size={18} /></span>
            <div class="lv-memo-body">
                <strong>{memoTitle}</strong>
                <p>{cardMemo}</p>
            </div>
            <button
                type="button"
                class="b3-button b3-button--text b3-button--small lv-memo-edit-btn"
                title={`${t?.review?.memoEdit ?? "修改助记线索"} (m)`}
                aria-label={t?.review?.memoEdit ?? "修改助记线索"}
                aria-keyshortcuts="m"
                onclick={onEditMemo}
                data-testid="review-memo-edit-btn"
            >
                <LvIcon name="edit" size={13} />
            </button>
        </div>
    {:else if cardHtml && !faceError}
        <!-- 翻面后轻量静默入口：随时为该卡记录口诀与线索（精简释放首屏高度） -->
        <div class="lv-memo-prompt" data-testid="review-memo-prompt">
            <button
                type="button"
                class="lv-memo-add-btn"
                title={`${t?.review?.memoModalTitle ?? "给未来的自己留助记线索"} (m)`}
                aria-label={t?.review?.memoModalTitle ?? "给未来的自己留助记线索"}
                aria-keyshortcuts="m"
                onclick={onEditMemo}
                data-testid="review-memo-add-btn"
            >
                <span><LvIcon name="lightbulb" size={15} /> {t?.review?.tbMemo ?? "助记便签"}</span>
            </button>
        </div>
    {/if}
{/if}

<style lang="scss">
    .lv-card-memo-callout {
        display: flex;
        align-items: flex-start;
        gap: calc(var(--lv-space-unit) * 3);
        padding: calc(var(--lv-space-unit) * 3) calc(var(--lv-space-unit) * 4);
        margin-top: var(--lv-sp-3);
        border: 1px solid color-mix(in srgb, var(--lv-color-warning) 30%, transparent);
        border-radius: var(--lv-r-m);
        background: color-mix(in srgb, var(--lv-warn-soft) 70%, var(--lv-color-surface));
        font-size: var(--lv-type-control-size);
        animation: lv-modal-pop var(--lv-dur-2) var(--lv-ease);

        .lv-memo-icon { font-size: var(--lv-type-title-size); flex: none; line-height: 1.3; }
        .lv-memo-body {
            flex: 1;
            strong {
                display: block;
                font-weight: var(--lv-fw-semibold);
                color: var(--lv-color-warning);
                font-size: var(--lv-type-meta-size);
                text-transform: uppercase;
                letter-spacing: 0.05em;
                margin-bottom: calc(var(--lv-space-unit) * 1);
                text-wrap: balance;
            }
            p {
                margin: 0;
                color: var(--lv-color-text);
                line-height: var(--lv-lh-reading, 1.65);
                font-size: var(--lv-type-control-size);
                max-width: 48em;
                text-wrap: pretty;
            }
        }
        .lv-memo-edit-btn {
            flex: none;
            opacity: 0.7;
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;
            &:hover { opacity: 1; }
            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
                opacity: 1;
            }
        }
    }

    .lv-memo-prompt {
        display: flex;
        justify-content: flex-end;
        margin-top: var(--lv-sp-2);
    }
    .lv-memo-add-btn {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 2);
        border: 1px dashed var(--lv-border);
        border-radius: var(--lv-r-pill);
        background: transparent;
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-meta-size);
        padding: calc(var(--lv-space-unit) * 1) calc(var(--lv-space-unit) * 4);
        cursor: pointer;
        opacity: 0.75;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        transition: transform var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease), border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease), opacity var(--lv-dur-1) var(--lv-ease);

        &:hover {
            opacity: 1;
            color: var(--lv-color-brand);
            border-color: var(--lv-primary-border);
            background: var(--lv-surface-hover);
            transform: translateY(-1px);
        }
        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
            border-color: var(--lv-color-brand);
            opacity: 1;
        }
        &:active {
            transform: translateY(1px);
        }
    }
</style>
