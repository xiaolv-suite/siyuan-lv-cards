<script lang="ts">
    import LvIcon from "@/ui/kit/LvIcon.svelte";
    import { ERROR_REASON_IDS, type ErrorReasonId } from "@/core/error-tags";

    let {
        open = false,
        t,
        onTagError,
        onClose,
    }: {
        open?: boolean;
        t: any;
        onTagError: (reasonId: ErrorReasonId) => void;
        onClose: () => void;
    } = $props();
</script>

{#if open}
    <!-- BJ-4：遗忘卡错误原因标注（旁路增强；点选后自动隐藏） -->
    <div class="lv-err-tags" role="region" aria-label={t.review?.errTagPrompt ?? "遗忘原因标注"}>
        <span class="ft__smaller ft__on-surface">{t.review?.errTagPrompt ?? "标记遗忘原因（可选）："}</span>
        {#each ERROR_REASON_IDS as rid (rid)}
            <button
                type="button"
                class="b3-button b3-button--small lv-err-tag"
                onclick={() => onTagError(rid)}
            >
                {t.review?.ko?.errReasons?.[rid] ?? rid}
            </button>
        {/each}
        <button
            type="button"
            class="b3-button b3-button--small b3-button--outline lv-btn-tool"
            onclick={onClose}
            aria-label={t.review?.skip ?? "跳过"}
        >
            <LvIcon name="close" size={13} />
        </button>
    </div>
{/if}

<style lang="scss">
    .lv-err-tags {
        display: flex;
        flex-wrap: wrap;
        gap: calc(var(--lv-space-unit) * 3);
        align-items: center;
        padding: var(--lv-sp-2) var(--lv-sp-3);
        margin: 0 auto;
        font-size: var(--lv-type-control-size);
        background: var(--lv-color-surface);
        border-radius: var(--b3-border-radius);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        max-width: var(--lv-card-max, 880px);
        width: 100%;
        border: 1px solid var(--lv-border);
        margin-bottom: var(--lv-sp-2);
        box-sizing: border-box;

        .b3-button {
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }
        }

        .lv-err-tag {
            border-radius: var(--lv-r-m);
            background: var(--lv-surface-hover);
            color: var(--lv-color-text);
            border: 1px solid var(--lv-border);
            transition: transform var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease), border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease), opacity var(--lv-dur-1) var(--lv-ease);
            &:hover {
                border-color: var(--lv-color-brand);
                background: var(--lv-primary-soft);
                color: var(--lv-color-brand);
            }
        }
    }
</style>
