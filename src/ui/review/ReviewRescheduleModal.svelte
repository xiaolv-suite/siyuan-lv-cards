<script lang="ts">
    let {
        open = false,
        rescheduleDays = $bindable(1),
        previewTargetLabel = "",
        rescheduleBusy = false,
        rescheduleError = "",
        retryReschedule = null,
        actionBusy = false,
        t,
        onReschedule,
        onClose,
    }: {
        open?: boolean;
        rescheduleDays?: number;
        previewTargetLabel?: string;
        rescheduleBusy?: boolean;
        rescheduleError?: string;
        retryReschedule?: any;
        actionBusy?: boolean;
        t: any;
        onReschedule: () => void;
        onClose: () => void;
    } = $props();

    const invalidRescheduleDays = $derived(!Number.isSafeInteger(rescheduleDays) || rescheduleDays < 1 || rescheduleDays > 36500);

    const confirmLabel = $derived(
        rescheduleBusy
            ? (t.dashboard?.loading ?? "正在改期…")
            : retryReschedule && rescheduleError
            ? (t.review?.rescheduleRetrySame ?? "重试改期")
            : (typeof window !== "undefined" && (window as any).siyuan?.languages?.confirm ? (window as any).siyuan.languages.confirm : "确认")
    );
</script>

{#if open}
    <div
        class="lv-reschedule lv-card2"
        role="region"
        aria-label={t.review?.helpReschedule ?? "快速改期"}
        aria-busy={rescheduleBusy}
    >
        <div class="lv-reschedule-inputs">
            <span class="ft__smaller ft__on-surface">{t.review?.rescheduleIn ?? "安排在"}</span>
            <input
                class="b3-text-field"
                style="width: 70px"
                type="number"
                inputMode="numeric"
                min="1"
                max="36500"
                step="1"
                bind:value={rescheduleDays}
                aria-invalid={invalidRescheduleDays}
                aria-describedby={invalidRescheduleDays ? "lv-reschedule-error" : undefined}
                onkeydown={(e) => {
                    if (e.key === "Enter" && !invalidRescheduleDays && !actionBusy) {
                        e.preventDefault();
                        onReschedule();
                    } else if (e.key === "Escape") {
                        e.preventDefault();
                        onClose();
                    }
                }}
            />
            <span class="ft__smaller ft__on-surface">{t.review?.rescheduleDays ?? "天后复习"}</span>
            {#if previewTargetLabel}
                <span class="ft__smaller ft__on-surface lv-reschedule-preview">
                    {t.review?.rescheduleTarget ?? "目标到期日"}: <strong>{previewTargetLabel}</strong>
                </span>
            {/if}
        </div>
        {#if invalidRescheduleDays}
            <span id="lv-reschedule-error" class="ft__smaller" role="alert" aria-live="assertive" style="color: var(--lv-color-danger); max-width: 48em; text-wrap: pretty; line-height: var(--lv-lh-reading, 1.65);">
                {t.review?.rescheduleRange ?? "天数范围应为 1 ~ 36500"}
            </span>
        {/if}
        {#if rescheduleError}
            <div class="ft__smaller lv-reschedule-error" role="alert" aria-live="assertive">
                <strong>{t.review?.rescheduleErrorPreserved ?? "改期未生效"}</strong>: {rescheduleError}
            </div>
        {/if}
        <div class="lv-reschedule-actions">
            <button type="button" class="b3-button b3-button--text b3-button--small" onclick={onClose}>
                {t.review?.rescheduleCancel ?? "取消"}
            </button>
            <button
                type="button"
                class="b3-button b3-button--small lv-btn-primary"
                disabled={actionBusy || invalidRescheduleDays}
                aria-busy={rescheduleBusy}
                onclick={onReschedule}
            >
                {confirmLabel}
            </button>
        </div>
        <span class="ft__smaller ft__on-surface lv-reschedule-hint">
            {t.review?.rescheduleTargetHint ?? "精准到期重试时会保持精确时间戳不变。"}
        </span>
    </div>
{/if}

<style lang="scss">
    .lv-reschedule {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);
        padding: var(--lv-sp-3);
        margin: var(--lv-sp-2) 0;
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        background: var(--lv-color-surface-subtle);
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

        .b3-text-field {
            touch-action: manipulation;
            transition: border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease);

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
                border-color: var(--lv-color-brand);
            }
        }

        .lv-reschedule-inputs {
            display: flex;
            gap: var(--lv-sp-2);
            align-items: center;
            flex-wrap: wrap;

            .lv-reschedule-preview {
                color: var(--lv-color-brand);
                margin-left: var(--lv-sp-2);
                font-variant-numeric: tabular-nums;
            }
        }

        .lv-reschedule-error {
            color: var(--lv-color-danger);
            background: var(--lv-danger-soft);
            padding: var(--lv-sp-1) var(--lv-sp-2);
            border-radius: var(--lv-r-compact);
            max-width: 48em;
            text-wrap: pretty;
            line-height: var(--lv-lh-reading, 1.65);
        }

        .lv-reschedule-actions {
            display: flex;
            gap: var(--lv-sp-2);
            align-items: center;
            justify-content: flex-end;
        }

        .lv-reschedule-hint {
            opacity: 0.75;
            font-size: var(--lv-type-meta-size);
            max-width: 48em;
            text-wrap: pretty;
            line-height: var(--lv-lh-reading, 1.65);
        }
    }
</style>
