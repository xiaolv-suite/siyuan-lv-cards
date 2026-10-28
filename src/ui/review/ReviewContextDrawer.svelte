<script lang="ts">
    import LvSkeleton from "@/ui/kit/LvSkeleton.svelte";
    import LvIcon from "@/ui/kit/LvIcon.svelte";

    let {
        open = false,
        blocks = [],
        loading = false,
        currentBlockID = "",
        t,
        onClose,
    }: {
        open?: boolean;
        blocks?: { id: string; html: string }[];
        loading?: boolean;
        currentBlockID?: string;
        t: any;
        onClose?: () => void;
    } = $props();
</script>

{#if open}
    <div class="lv-ctxpanel b3-typography" role="region" aria-label={t.review?.ctxTitle ?? "来源上下文"}>
        <div class="lv-ctx-head">
            <span class="lv-ctx-title"><LvIcon name="book" size={14} /> {t.review?.ctxTitle ?? "来源上下文 (前后各 2 块)"}</span>
            <div class="fn__flex-1"></div>
            {#if onClose}
                <button type="button" class="b3-button b3-button--small b3-button--outline lv-btn-tool" onclick={onClose} aria-label="关闭">
                    <LvIcon name="close" size={12} />
                </button>
            {/if}
        </div>
        {#if loading}
            <LvSkeleton count={2} height={36} />
        {:else if blocks.length === 0}
            <div class="lv-hint">{t.review?.ctxNone ?? "暂无上下文信息"}</div>
        {:else}
            <div class="lv-ctx-list">
                {#each blocks as b (b.id)}
                    <div class="lv-ctx-block" class:lv-ctx-cur={currentBlockID && b.id === currentBlockID}>
                        {@html b.html}
                    </div>
                {/each}
            </div>
        {/if}
    </div>
{/if}

<style lang="scss">
    .lv-ctxpanel {
        max-width: var(--lv-card-max, 880px);
        width: 100%;
        margin: 0 auto;
        padding: var(--lv-sp-3);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        background: var(--lv-surface-hover);
        font-size: var(--lv-type-body-size);
        opacity: 0.92;
        box-sizing: border-box;

        .lv-ctx-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: var(--lv-sp-2);
        }

        .lv-ctx-title {
            font-size: var(--lv-type-control-size);
            color: var(--lv-color-text-muted);
            display: inline-flex;
            align-items: center;
            gap: calc(var(--lv-space-unit) * 2);
            font-weight: var(--lv-fw-semibold);
        }

        .lv-ctx-list {
            display: flex;
            flex-direction: column;
        }

        .lv-ctx-block {
            padding: var(--lv-sp-2);
            border-bottom: 1px dashed var(--lv-border);
            &:last-child {
                border-bottom: none;
            }
        }

        .lv-ctx-cur {
            border-left: 2px solid var(--lv-color-brand);
            background: var(--lv-primary-softer);
            border-radius: var(--lv-r-s);
        }
    }
</style>
