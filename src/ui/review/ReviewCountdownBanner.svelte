<script lang="ts">
    import LvIcon from "@/ui/kit/LvIcon.svelte";

    let {
        budgetMin = 0,
        budgetExpired = false,
        showAnswer = false,
        timeoutExpired = false,
        reviewedCount = 0,
        t,
        onRest,
        onContinue,
    }: {
        budgetMin?: number;
        budgetExpired?: boolean;
        showAnswer?: boolean;
        timeoutExpired?: boolean;
        reviewedCount?: number;
        t: any;
        onRest: () => void;
        onContinue: () => void;
    } = $props();
</script>

{#if budgetMin === 25 && budgetExpired && showAnswer}
    <!-- 汲取自番茄闪卡 sy-tomato：25 分钟番茄专注周期达成，温和建议休息保护精力 -->
    <div class="lv-notice lv-notice--warn lv-pomodoro-alert" role="status" aria-live="polite" aria-label={t.review?.pomodoroDoneTitle ?? "番茄专注周期达成"}>
        <span class="lv-pomodoro-icon"><LvIcon name="timer" size={18} /></span>
        <div class="lv-pomodoro-text">
            <strong>{t.review?.pomodoroDoneTitle ?? "25 分钟番茄专注达成！"}</strong>
            <p>{(t.review?.pomodoroDoneDesc ?? "已完成本轮专注复习（已评 ${n} 张），建议休息 5 分钟，让大脑巩固记忆再继续。").replace("${n}", String(reviewedCount))}</p>
        </div>
        <div class="lv-pomodoro-actions">
            <button type="button" class="b3-button b3-button--small lv-btn-primary" onclick={onRest}>
                {t.review?.pomodoroRest ?? "休息并返回今日"}
            </button>
            <button type="button" class="b3-button b3-button--small b3-button--outline" onclick={onContinue}>
                {t.review?.pomodoroContinue ?? "继续复习"}
            </button>
        </div>
    </div>
{:else if timeoutExpired && showAnswer}
    <!-- docs/13 §6：限时到点不自动记分，评分由用户确认 -->
    <div class="lv-notice lv-notice--warn lv-timeout-expired-note" role="status" aria-live="polite" style="margin-bottom: var(--lv-sp-2)">
        {t.review?.timeoutExpiredNote ?? "已到答题时限，请对照答案并自评"}
    </div>
{/if}

<style lang="scss">
    .lv-pomodoro-alert {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-3);
        margin-bottom: var(--lv-sp-2);
        padding: var(--lv-sp-3) var(--lv-sp-4);
        border-radius: var(--lv-r-m);
        border: 1px solid color-mix(in srgb, var(--lv-color-warning) 30%, transparent);
        background: color-mix(in srgb, var(--lv-warn-soft) 80%, var(--lv-color-surface));
        box-shadow: var(--lv-shadow-card);
        animation: lv-modal-pop var(--lv-dur-2) var(--lv-ease);
        box-sizing: border-box;

        .lv-pomodoro-icon {
            font-size: var(--lv-type-page-size);
            flex: none;
            color: var(--lv-color-warning);
        }
        .lv-pomodoro-text {
            flex: 1;
            strong {
                font-weight: var(--lv-fw-semibold);
                display: block;
                font-size: var(--lv-type-body-size);
                color: var(--lv-color-text);
                text-wrap: balance;
            }
            p {
                margin: calc(var(--lv-space-unit) * 1) 0 0;
                font-size: var(--lv-type-meta-size);
                color: var(--lv-color-text-muted);
                max-width: 48em;
                text-wrap: pretty;
                line-height: var(--lv-lh-reading, 1.65);
                font-variant-numeric: tabular-nums;
            }
        }
        .lv-pomodoro-actions {
            display: flex;
            gap: var(--lv-sp-2);
            flex-shrink: 0;

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
    }

    .lv-timeout-expired-note {
        padding: var(--lv-sp-2) var(--lv-sp-3);
        border-radius: var(--lv-r-m);
        background: var(--lv-warn-soft);
        color: var(--lv-color-warning);
        font-size: var(--lv-type-control-size);
        box-sizing: border-box;
    }
</style>
