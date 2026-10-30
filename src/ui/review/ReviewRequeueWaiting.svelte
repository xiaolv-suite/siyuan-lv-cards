<script lang="ts">
    import LvIcon from "../kit/LvIcon.svelte";

    interface Props {
        headScopeLabel?: string;
        requeueWaitSeconds?: number;
        historyLength?: number;
        actionBusy?: boolean;
        t: any;
        onRefresh?: () => void;
        onUndo?: () => void;
    }

    let {
        headScopeLabel = "",
        requeueWaitSeconds = 0,
        historyLength = 0,
        actionBusy = false,
        t,
        onRefresh = () => {},
        onUndo = () => {},
    }: Props = $props();
</script>

<div class="lv-center lv-done" data-testid="review-requeue-waiting">
    <div class="lv-done-panel lv-empty-queue" role="status" aria-live="polite">
        <div class="lv-eyebrow">REVIEW / {headScopeLabel}</div>
        <div class="lv-empty-queue-title">{t?.review?.requeueWaitingTitle ?? "等待重考中"}</div>
        <p class="ft__smaller ft__on-surface" style="margin: calc(var(--lv-space-unit) * 3) 0 0">
            {t?.review?.requeueWaitingSub?.replace("${n}", String(requeueWaitSeconds)) ?? `还有 ${requeueWaitSeconds} 秒重试`}
        </p>
        <div class="fn__flex lv-done-actions" style="justify-content: center; margin-top: var(--lv-sp-4)">
            <button
                type="button"
                class="b3-button b3-button--outline lv-btn-tool"
                onclick={onRefresh}
                data-testid="review-requeue-refresh-btn"
            >
                <LvIcon name="refresh" size={13} />
                <span>{t?.dashboard?.refresh ?? "刷新"}</span>
            </button>
            <button
                type="button"
                class="b3-button b3-button--outline lv-btn-tool"
                disabled={historyLength === 0 || actionBusy}
                onclick={onUndo}
                data-testid="review-requeue-undo-btn"
            >
                <LvIcon name="chevron-left" size={13} />
                <span>{t?.review?.undoLast ?? "撤销上一张"}</span>
            </button>
        </div>
    </div>
</div>

<style lang="scss">
    .lv-empty-queue {
        text-align: center;
        .lv-empty-queue-title {
            margin-top: var(--lv-sp-3);
            font-size: var(--lv-type-title-lg-size);
            font-weight: var(--lv-fw-heading);
            letter-spacing: -0.02em;
            text-wrap: balance;
        }

        p {
            max-width: 48em;
            text-wrap: pretty;
            line-height: var(--lv-lh-reading, 1.65);
            font-variant-numeric: tabular-nums;
        }

        .b3-button {
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
