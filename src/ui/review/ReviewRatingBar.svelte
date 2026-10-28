<script lang="ts">
    import LvKbd from "@/ui/kit/LvKbd.svelte";
    import type { Rating } from "@/api/riff";

    let {
        showAnswer = false,
        stepRevealedCount = 0,
        faceReady = true,
        pressedKeyFeedback = null,
        ratingStyle = "four",
        suggestedRating = null,
        actionBusy = false,
        compact = false,
        dueText = () => "",
        t,
        onRevealAnswer,
        onRevealNextCloze,
        onRate,
    }: {
        showAnswer?: boolean;
        stepRevealedCount?: number;
        faceReady?: boolean;
        pressedKeyFeedback?: string | null;
        ratingStyle?: "four" | "three";
        suggestedRating?: number | null;
        actionBusy?: boolean;
        compact?: boolean;
        dueText?: (rating: string) => string;
        t: any;
        onRevealAnswer: () => void;
        onRevealNextCloze?: () => void;
        onRate: (rating: Rating) => void;
    } = $props();
</script>

<div class="lv-actions" class:lv-actions-compact={compact} role="group" aria-label={t.review?.ratingAriaLabel ?? "评分操作区"}>
    {#if !showAnswer}
        {#if stepRevealedCount > 0}
            <div class="fn__flex lv-step-wrap">
                <button
                    type="button"
                    class="b3-button lv-btn-primary fn__flex-1 lv-btn-wide"
                    class:lv-btn-pressed={pressedKeyFeedback === " "}
                    disabled={!faceReady}
                    onclick={() => {
                        if (onRevealNextCloze) {
                            onRevealNextCloze();
                        } else {
                            onRevealAnswer();
                        }
                    }}
                >
                    {t.review?.clozeRevealNext ?? "揭晓下一空"}
                    <span class="lv-btn-wide-kbd">Space</span>
                </button>
                <button
                    type="button"
                    class="b3-button b3-button--outline lv-btn-small-pill"
                    title="全部揭晓（Shift+Space）"
                    onclick={onRevealAnswer}
                >
                    {t.review?.clozeRevealAll ?? "全部揭晓"}
                </button>
            </div>
        {:else}
            <button
                type="button"
                class="b3-button lv-btn-primary lv-btn-wide"
                class:lv-btn-pressed={pressedKeyFeedback === " "}
                disabled={!faceReady}
                onclick={onRevealAnswer}
            >
                {t.review?.showAnswer ?? "显示答案"}
                <span class="lv-btn-wide-kbd">Space</span>
            </button>
        {/if}
    {:else if ratingStyle === "three"}
        <button
            type="button"
            class="b3-button lv-btn-rate lv-b1"
            class:lv-btn-suggested={suggestedRating === 1}
            class:lv-btn-pressed={pressedKeyFeedback === "1"}
            disabled={actionBusy}
            onclick={() => onRate(1)}
        >
            <span class="lv-rate-top">
                <span class="lv-rate-label">{t.review?.unknown ?? "重来"}</span>
                <LvKbd k="1" />
            </span>
            <small>{dueText("1")}</small>
        </button>
        <button
            type="button"
            class="b3-button lv-btn-rate lv-b2"
            class:lv-btn-suggested={suggestedRating === 2}
            class:lv-btn-pressed={pressedKeyFeedback === "2"}
            disabled={actionBusy}
            onclick={() => onRate(2)}
        >
            <span class="lv-rate-top">
                <span class="lv-rate-label">{t.review?.vague ?? "模糊"}</span>
                <LvKbd k="2" />
            </span>
            <small>{dueText("2")}</small>
        </button>
        <button
            type="button"
            class="b3-button lv-btn-rate lv-b3"
            class:lv-btn-suggested={suggestedRating === 3}
            class:lv-btn-pressed={pressedKeyFeedback === "3"}
            disabled={actionBusy}
            onclick={() => onRate(3)}
        >
            <span class="lv-rate-top">
                <span class="lv-rate-label">{t.review?.know ?? "认识"}</span>
                <LvKbd k="3" />
            </span>
            <small>{dueText("3")}</small>
        </button>
    {:else}
        <button
            type="button"
            class="b3-button lv-btn-rate lv-b1"
            class:lv-btn-suggested={suggestedRating === 1}
            class:lv-btn-pressed={pressedKeyFeedback === "1"}
            disabled={actionBusy}
            onclick={() => onRate(1)}
        >
            <span class="lv-rate-top">
                <span class="lv-rate-label">{t.review?.againBtn ?? "重来"}</span>
                <LvKbd k="1" />
            </span>
            <small>{dueText("1")}</small>
        </button>
        <button
            type="button"
            class="b3-button lv-btn-rate lv-b2"
            class:lv-btn-suggested={suggestedRating === 2}
            class:lv-btn-pressed={pressedKeyFeedback === "2"}
            disabled={actionBusy}
            onclick={() => onRate(2)}
        >
            <span class="lv-rate-top">
                <span class="lv-rate-label">{t.review?.hard ?? "困难"}</span>
                <LvKbd k="2" />
            </span>
            <small>{dueText("2")}</small>
        </button>
        <button
            type="button"
            class="b3-button lv-btn-rate lv-b3"
            class:lv-btn-suggested={suggestedRating === 3}
            class:lv-btn-pressed={pressedKeyFeedback === "3"}
            disabled={actionBusy}
            onclick={() => onRate(3)}
        >
            <span class="lv-rate-top">
                <span class="lv-rate-label">{t.review?.good ?? "良好"}</span>
                <LvKbd k="3" />
            </span>
            <small>{dueText("3")}</small>
        </button>
        <button
            type="button"
            class="b3-button lv-btn-rate lv-b4"
            class:lv-btn-suggested={suggestedRating === 4}
            class:lv-btn-pressed={pressedKeyFeedback === "4"}
            disabled={actionBusy}
            onclick={() => onRate(4)}
        >
            <span class="lv-rate-top">
                <span class="lv-rate-label">{t.review?.easy ?? "简单"}</span>
                <LvKbd k="4" />
            </span>
            <small>{dueText("4")}</small>
        </button>
    {/if}
</div>

<style lang="scss">
    .lv-actions {
        display: flex;
        gap: var(--lv-sp-3);
        justify-content: center;
        max-width: 640px;
        width: 100%;
        margin: var(--lv-sp-2) auto 0;
        padding-bottom: var(--lv-sp-2);
        box-sizing: border-box;

        .lv-step-wrap {
            width: 100%;
            gap: var(--lv-sp-2);
        }

        :global(.lv-btn-pressed) {
            transform: scale(0.94) !important;
            border-color: var(--lv-color-brand) !important;
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--lv-color-brand) 35%, transparent) !important;
            transition: all 0.1s var(--lv-ease) !important;
        }

        &.lv-actions-compact {
            gap: var(--lv-sp-2);
            .lv-btn-rate {
                max-width: 150px;
                padding: 10px 14px;
                min-height: 52px;
            }
        }

        .lv-btn-wide {
            flex: 1;
            min-height: 46px;
            border-radius: var(--lv-r-pill);
            background: linear-gradient(135deg, var(--lv-brand, #E11D48) 0%, color-mix(in srgb, var(--lv-brand, #E11D48) 86%, black) 100%);
            color: #FFFFFF !important;
            font-weight: var(--lv-fw-semibold);
            box-shadow: 0 4px 18px color-mix(in srgb, var(--lv-brand) 36%, transparent), var(--lv-inset-shine);
            transition: transform var(--lv-dur-1) var(--lv-ease),
                box-shadow var(--lv-dur-2) var(--lv-ease),
                filter var(--lv-dur-1) var(--lv-ease);

            &:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 24px color-mix(in srgb, var(--lv-brand) 48%, transparent);
            }
            &:active {
                transform: translateY(0.5px);
            }

            .lv-btn-wide-kbd {
                margin-left: calc(var(--lv-space-unit) * 6);
                padding: calc(var(--lv-space-unit) * 1) calc(var(--lv-space-unit) * 4);
                border-radius: var(--lv-r-pill);
                background: rgba(255, 255, 255, 0.22);
                border: 1px solid rgba(255, 255, 255, 0.35);
                font-size: var(--lv-type-meta-size);
                font-weight: var(--lv-fw-semibold);
                color: #fff;
            }
        }

        @keyframes lv-rating-reveal {
            from {
                opacity: 0;
                transform: translate3d(0, 5px, 0);
            }
            to {
                opacity: 1;
                transform: translate3d(0, 0, 0);
            }
        }

        .lv-btn-rate {
            flex: 1;
            max-width: 180px;
            animation: lv-rating-reveal var(--lv-dur-2) var(--lv-ease);
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 5px;
            text-align: left;
            border-radius: var(--lv-r-m);
            border: 1px solid var(--lv-border);
            padding: calc(var(--lv-space-unit) * 7) calc(var(--lv-space-unit) * 8 + var(--lv-space-hairline));
            min-height: 80px;
            background: var(--lv-color-surface);
            box-shadow: var(--lv-shadow-card), var(--lv-inset-shine);
            transition: transform var(--lv-dur-1) var(--lv-ease),
                background var(--lv-dur-1) var(--lv-ease),
                box-shadow var(--lv-dur-2) var(--lv-ease),
                border-color var(--lv-dur-1) var(--lv-ease),
                filter var(--lv-dur-1) var(--lv-ease);

            &:hover {
                transform: translateY(-2px);
                box-shadow: var(--lv-shadow-card-hover), var(--lv-inset-shine);
                border-color: var(--lv-border-strong);
            }
            &:active {
                transform: translateY(1px) scale(0.98);
                filter: brightness(0.96);
            }

            .lv-rate-top {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--lv-sp-2);
                font-weight: 600;
            }
            small {
                opacity: 0.7;
                font-size: 11px;
                font-variant-numeric: tabular-nums;
            }
        }

        @media (max-width: 740px) {
            display: grid;
            grid-template-columns: 1fr 1fr;
            .lv-btn-rate {
                max-width: none;
            }
        }

        .lv-b1,
        .lv-b2,
        .lv-b3,
        .lv-b4 {
            background: var(--lv-color-surface);
            color: var(--lv-color-text);
        }
        .lv-b1 {
            box-shadow: inset 0 2.5px 0 0 color-mix(in srgb, var(--lv-color-danger) 70%, transparent), var(--lv-shadow-card);
            &:hover {
                border-color: var(--lv-danger-border);
                background: color-mix(in srgb, var(--lv-color-danger) 6%, var(--lv-color-surface));
                box-shadow: inset 0 3px 0 0 var(--lv-color-danger), var(--lv-shadow-card-hover);
            }
            &:active {
                background: color-mix(in srgb, var(--lv-color-danger) 14%, var(--lv-color-surface));
            }
        }
        .lv-b2 {
            box-shadow: inset 0 2.5px 0 0 color-mix(in srgb, var(--lv-color-warning) 70%, transparent), var(--lv-shadow-card);
            &:hover {
                border-color: color-mix(in srgb, var(--lv-color-warning) 35%, transparent);
                background: color-mix(in srgb, var(--lv-color-warning) 6%, var(--lv-color-surface));
                box-shadow: inset 0 3px 0 0 var(--lv-color-warning), var(--lv-shadow-card-hover);
            }
            &:active {
                background: color-mix(in srgb, var(--lv-color-warning) 14%, var(--lv-color-surface));
            }
        }
        .lv-b3 {
            box-shadow: inset 0 2.5px 0 0 color-mix(in srgb, var(--lv-color-brand) 70%, transparent), var(--lv-shadow-card);
            &:hover {
                border-color: var(--lv-primary-border);
                background: color-mix(in srgb, var(--lv-color-brand) 6%, var(--lv-color-surface));
                box-shadow: inset 0 3px 0 0 var(--lv-color-brand), var(--lv-shadow-card-hover);
            }
            &:active {
                background: color-mix(in srgb, var(--lv-color-brand) 14%, var(--lv-color-surface));
            }
        }
        .lv-b4 {
            box-shadow: inset 0 2.5px 0 0 color-mix(in srgb, var(--lv-color-success) 70%, transparent), var(--lv-shadow-card);
            &:hover {
                border-color: color-mix(in srgb, var(--lv-color-success) 35%, transparent);
                background: color-mix(in srgb, var(--lv-color-success) 6%, var(--lv-color-surface));
                box-shadow: inset 0 3px 0 0 var(--lv-color-success), var(--lv-shadow-card-hover);
            }
            &:active {
                background: color-mix(in srgb, var(--lv-color-success) 14%, var(--lv-color-surface));
            }
        }
    }
</style>
