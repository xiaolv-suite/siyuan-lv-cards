<script lang="ts">
    import LvKbd from "@/ui/kit/LvKbd.svelte";
    import type { Rating } from "@/api/riff";
    import { notifyInline, lvLaunchpad } from "@/libs/notice";

    const isMobile = $derived(Boolean(lvLaunchpad?.isMobileFrontend?.()));

    let {
        showAnswer = false,
        stepRevealedCount = 0,
        faceReady = true,
        pressedKeyFeedback = null,
        ratingStyle = "four",
        ratingKeyScheme = "both",
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
        ratingKeyScheme?: "number" | "jkl" | "both";
        suggestedRating?: number | null;
        actionBusy?: boolean;
        compact?: boolean;
        dueText?: (rating: string) => string;
        t: any;
        onRevealAnswer: () => void;
        onRevealNextCloze?: () => void;
        onRate: (rating: Rating) => void;
    } = $props();

    const k1 = $derived(ratingKeyScheme === "jkl" ? "J" : ratingKeyScheme === "both" ? "1/J" : "1");
    const k2 = $derived(ratingKeyScheme === "jkl" ? "K" : ratingKeyScheme === "both" ? "2/K" : "2");
    const k3 = $derived(ratingKeyScheme === "jkl" ? "L" : ratingKeyScheme === "both" ? "3/L" : "3");
    const k4 = $derived(ratingKeyScheme === "jkl" ? ";" : ratingKeyScheme === "both" ? "4/;" : "4");

    const isPressed1 = $derived(pressedKeyFeedback === "1" || pressedKeyFeedback?.toLowerCase() === "j");
    const isPressed2 = $derived(pressedKeyFeedback === "2" || pressedKeyFeedback?.toLowerCase() === "k");
    const isPressed3 = $derived(pressedKeyFeedback === "3" || pressedKeyFeedback?.toLowerCase() === "l");
    const isPressed4 = $derived(pressedKeyFeedback === "4" || pressedKeyFeedback === ";" || pressedKeyFeedback === "；");
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
                    aria-keyshortcuts="Space"
                    onclick={() => {
                        if (onRevealNextCloze) {
                            onRevealNextCloze();
                        } else {
                            onRevealAnswer();
                        }
                    }}
                >
                    {t.review?.clozeRevealNext ?? "揭晓下一空"}
                    {#if !isMobile}<span class="lv-btn-wide-kbd">Space</span>{/if}
                </button>
                <button
                    type="button"
                    class="b3-button b3-button--outline lv-btn-small-pill"
                    title="全部揭晓（Shift+Space）"
                    aria-keyshortcuts="Shift+Space"
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
                aria-keyshortcuts="Space"
                onclick={onRevealAnswer}
            >
                {t.review?.showAnswer ?? "显示答案"}
                {#if !isMobile}<span class="lv-btn-wide-kbd">Space</span>{/if}
            </button>
        {/if}
    {:else if ratingStyle === "three"}
        <button
            type="button"
            class="b3-button lv-btn-rate lv-b1"
            class:lv-btn-suggested={suggestedRating === 1}
            class:lv-btn-pressed={isPressed1}
            disabled={actionBusy}
            aria-busy={actionBusy}
            aria-keyshortcuts="1"
            onclick={(e) => { notifyInline(e.currentTarget); onRate(1); }}
        >
            <span class="lv-rate-top">
                <span class="lv-rate-label">{t.review?.unknown ?? "重来"}</span>
                {#if !isMobile}<LvKbd k={k1} />{/if}
            </span>
            <small>{dueText("1")}</small>
        </button>
        <button
            type="button"
            class="b3-button lv-btn-rate lv-b2"
            class:lv-btn-suggested={suggestedRating === 2}
            class:lv-btn-pressed={isPressed2}
            disabled={actionBusy}
            aria-busy={actionBusy}
            aria-keyshortcuts="2"
            onclick={(e) => { notifyInline(e.currentTarget); onRate(2); }}
        >
            <span class="lv-rate-top">
                <span class="lv-rate-label">{t.review?.vague ?? "模糊"}</span>
                {#if !isMobile}<LvKbd k={k2} />{/if}
            </span>
            <small>{dueText("2")}</small>
        </button>
        <button
            type="button"
            class="b3-button lv-btn-rate lv-b3"
            class:lv-btn-suggested={suggestedRating === 3}
            class:lv-btn-pressed={isPressed3}
            disabled={actionBusy}
            aria-busy={actionBusy}
            aria-keyshortcuts="3"
            onclick={(e) => { notifyInline(e.currentTarget); onRate(3); }}
        >
            <span class="lv-rate-top">
                <span class="lv-rate-label">{t.review?.know ?? "认识"}</span>
                {#if !isMobile}<LvKbd k={k3} />{/if}
            </span>
            <small>{dueText("3")}</small>
        </button>
    {:else}
        <button
            type="button"
            class="b3-button lv-btn-rate lv-b1"
            class:lv-btn-suggested={suggestedRating === 1}
            class:lv-btn-pressed={isPressed1}
            disabled={actionBusy}
            aria-busy={actionBusy}
            aria-keyshortcuts="1"
            onclick={(e) => { notifyInline(e.currentTarget); onRate(1); }}
        >
            <span class="lv-rate-top">
                <span class="lv-rate-label">{t.review?.againBtn ?? "重来"}</span>
                {#if !isMobile}<LvKbd k={k1} />{/if}
            </span>
            <small>{dueText("1")}</small>
        </button>
        <button
            type="button"
            class="b3-button lv-btn-rate lv-b2"
            class:lv-btn-suggested={suggestedRating === 2}
            class:lv-btn-pressed={isPressed2}
            disabled={actionBusy}
            aria-busy={actionBusy}
            aria-keyshortcuts="2"
            onclick={(e) => { notifyInline(e.currentTarget); onRate(2); }}
        >
            <span class="lv-rate-top">
                <span class="lv-rate-label">{t.review?.hard ?? "困难"}</span>
                {#if !isMobile}<LvKbd k={k2} />{/if}
            </span>
            <small>{dueText("2")}</small>
        </button>
        <button
            type="button"
            class="b3-button lv-btn-rate lv-b3"
            class:lv-btn-suggested={suggestedRating === 3}
            class:lv-btn-pressed={isPressed3}
            disabled={actionBusy}
            aria-busy={actionBusy}
            aria-keyshortcuts="3"
            onclick={(e) => { notifyInline(e.currentTarget); onRate(3); }}
        >
            <span class="lv-rate-top">
                <span class="lv-rate-label">{t.review?.good ?? "良好"}</span>
                {#if !isMobile}<LvKbd k={k3} />{/if}
            </span>
            <small>{dueText("3")}</small>
        </button>
        <button
            type="button"
            class="b3-button lv-btn-rate lv-b4"
            class:lv-btn-suggested={suggestedRating === 4}
            class:lv-btn-pressed={isPressed4}
            disabled={actionBusy}
            aria-busy={actionBusy}
            aria-keyshortcuts="4"
            onclick={(e) => { notifyInline(e.currentTarget); onRate(4); }}
        >
            <span class="lv-rate-top">
                <span class="lv-rate-label">{t.review?.easy ?? "简单"}</span>
                {#if !isMobile}<LvKbd k={k4} />{/if}
            </span>
            <small>{dueText("4")}</small>
        </button>
    {/if}
</div>

<style lang="scss">
    .lv-actions {
        display: flex;
        gap: var(--lv-sp-2);
        justify-content: center;
        max-width: 100%;
        width: 100%;
        margin: 0 auto;
        padding-top: 2px;
        padding-bottom: 2px;
        box-sizing: border-box;
        position: relative;
        z-index: 1;
        background: transparent;

        .lv-step-wrap {
            width: 100%;
            gap: var(--lv-sp-2);
        }

        .lv-btn-small-pill {
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }
        }

        :global(.lv-btn-pressed) {
            transform: scale(0.94) !important;
            border-color: var(--lv-color-brand) !important;
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--lv-color-brand) 35%, transparent) !important;
            transition: transform 0.1s var(--lv-ease), background 0.1s var(--lv-ease), border-color 0.1s var(--lv-ease), box-shadow 0.1s var(--lv-ease), color 0.1s var(--lv-ease), opacity 0.1s var(--lv-ease) !important;
        }

        &.lv-actions-compact {
            gap: var(--lv-sp-2);
            .lv-btn-rate {
                max-width: 150px;
                padding: calc(var(--lv-space-unit) * 4) calc(var(--lv-space-unit) * 6);
                min-height: 48px;
            }
        }

        /* 横屏矮窗（手机 landscape）：压缩评分栏上下留白，
           保证评分按钮与卡片内容在矮视口内同框可达。 */
        @media (max-height: 430px) and (orientation: landscape) {
            margin-top: 0;
            padding-top: 0;

            &.lv-actions-compact .lv-btn-rate {
                min-height: 42px;
            }
        }

        .lv-btn-wide {
            flex: 1;
            min-height: 42px;
            border-radius: var(--lv-r-pill);
            background: var(--lv-color-brand);
            border: 1px solid transparent;
            color: var(--lv-color-on-brand) !important;
            font-weight: var(--lv-fw-semibold);
            box-shadow: var(--lv-shadow-1);
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;
            transition: transform var(--lv-dur-1) var(--lv-ease),
                box-shadow var(--lv-dur-2) var(--lv-ease),
                background-color var(--lv-dur-1) var(--lv-ease),
                filter var(--lv-dur-1) var(--lv-ease);

            &:hover {
                transform: translateY(-1.5px);
                background: var(--lv-color-brand-strong);
                box-shadow: var(--lv-shadow-2);
                filter: brightness(1.05);
            }
            &:active {
                transform: translateY(0.5px) scale(0.985);
                box-shadow: var(--lv-shadow-1);
            }
            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring), var(--lv-shadow-2);
            }

            .lv-btn-wide-kbd {
                margin-left: calc(var(--lv-space-unit) * 6);
                padding: calc(var(--lv-space-unit) * 1) calc(var(--lv-space-unit) * 4);
                border-radius: var(--lv-r-pill);
                background: color-mix(in srgb, var(--lv-color-on-brand) 22%, transparent);
                border: 1px solid color-mix(in srgb, var(--lv-color-on-brand) 35%, transparent);
                font-size: var(--lv-type-meta-size);
                font-weight: var(--lv-fw-semibold);
                font-variant-numeric: tabular-nums;
                color: var(--lv-color-on-brand);
            }
        }

        @media (max-width: 640px) {
            .lv-btn-wide-kbd,
            :global(.lv-kbd2) {
                display: none !important;
            }
        }

        @keyframes lv-rating-reveal {
            from {
                opacity: 0;
                transform: translate3d(0, 4px, 0);
            }
            to {
                opacity: 1;
                transform: translate3d(0, 0, 0);
            }
        }

        .lv-btn-rate {
            flex: 1 1 0;
            min-width: 0;
            max-width: none;
            animation: lv-rating-reveal var(--lv-dur-2) var(--lv-ease);
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 2px;
            text-align: left;
            border-radius: var(--lv-r-m, 10px);
            border: 1px solid color-mix(in srgb, var(--lv-border) 80%, transparent);
            padding: 6px 12px;
            min-height: 48px;
            background: color-mix(in srgb, var(--lv-color-surface) 95%, transparent);
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.6);
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;
            transition: transform var(--lv-dur-1) var(--lv-ease),
                background var(--lv-dur-1) var(--lv-ease),
                box-shadow var(--lv-dur-2) var(--lv-ease),
                border-color var(--lv-dur-1) var(--lv-ease),
                filter var(--lv-dur-1) var(--lv-ease);

            &:hover {
                transform: translateY(-1.5px);
                box-shadow: 0 3px 8px rgba(0, 0, 0, 0.08);
                border-color: var(--lv-border-strong);
            }
            &:active {
                transform: translateY(0.5px) scale(0.985);
            }
            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring), var(--lv-shadow-2);
                border-color: var(--lv-color-brand);
            }

            .lv-rate-top {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--lv-sp-1);
                font-weight: var(--lv-fw-semibold);
                min-width: 0;
                max-width: 100%;

                .lv-rate-label {
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
            }
            small {
                font-weight: 600;
                font-size: var(--lv-type-meta-size);
                font-variant-numeric: tabular-nums;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 100%;
                opacity: 0.92;
            }
        }

        .lv-b1 small { color: color-mix(in srgb, var(--lv-color-danger) 85%, var(--lv-color-text)); }
        .lv-b2 small { color: color-mix(in srgb, var(--lv-color-warning) 85%, var(--lv-color-text)); }
        .lv-b3 small { color: color-mix(in srgb, var(--lv-color-brand) 85%, var(--lv-color-text)); }
        .lv-b4 small { color: color-mix(in srgb, var(--lv-color-success, #10B981) 85%, var(--lv-color-text)); }

        .lv-btn-suggested {
            border-color: var(--lv-color-brand) !important;
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--lv-color-brand) 28%, transparent), var(--lv-shadow-2) !important;
        }

        /* Mobile Spec v2：窄屏评级栏紧凑单行布局（高度~44px），消除双重 safe-area 与穿透 */
        @media (max-width: 740px) {
            display: flex;
            flex-wrap: nowrap;
            gap: 6px;
            margin-top: 0;
            padding-top: 1px;
            padding-bottom: 2px;
            padding-left: 4px;
            padding-right: 4px;
            background: transparent;
            border-top: none;

            .lv-btn-rate {
                flex: 1 1 0;
                min-width: 0;
                max-width: none;
                min-height: 44px;
                padding: 5px 3px;
                align-items: center;
                text-align: center;
                gap: 1px;
                box-sizing: border-box;

                .lv-rate-top {
                    justify-content: center;
                    gap: 2px;
                    font-size: 12px;
                }
                small {
                    font-size: 10px;
                    line-height: 1.2;
                }
                :global(.lv-kbd2) {
                    display: none;
                }
            }
            .lv-btn-wide {
                flex: 1 1 100%;
                min-height: 44px;
                .lv-btn-wide-kbd {
                    display: none;
                }
            }
        }

        :global(.lv-keyboard-open) &,
        :global(.lv-vv-keyboard-open) & {
            position: static;
            margin-top: 0;
            padding-top: var(--lv-sp-1);
            padding-bottom: var(--lv-sp-1);
            border-top: 0;
            background: transparent;

            .lv-btn-rate {
                min-height: 40px;
                padding: var(--lv-sp-1) var(--lv-sp-2);
            }
            .lv-btn-wide {
                min-height: 40px;
            }
        }

        @media (max-height: 460px) {
            position: static;
            margin-top: 0;
            padding-top: var(--lv-sp-1);
            padding-bottom: var(--lv-sp-1);
            border-top: 0;
            background: transparent;

            .lv-btn-rate {
                min-height: 40px;
                padding: var(--lv-sp-1) var(--lv-sp-2);
            }
            .lv-btn-wide {
                min-height: 40px;
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
            &:hover {
                border-color: var(--lv-danger-border);
                background: var(--lv-danger-soft);
                color: var(--lv-color-on-danger-soft);
            }
            &:active {
                background: color-mix(in srgb, var(--lv-color-danger) 14%, var(--lv-color-surface));
            }
        }
        .lv-b2 {
            &:hover {
                border-color: color-mix(in srgb, var(--lv-color-warning) 30%, transparent);
                background: var(--lv-warn-soft);
                color: var(--lv-color-on-warning-soft);
            }
            &:active {
                background: color-mix(in srgb, var(--lv-color-warning) 14%, var(--lv-color-surface));
            }
        }
        .lv-b3 {
            &:hover {
                border-color: var(--lv-primary-border);
                background: var(--lv-primary-soft);
                color: var(--lv-color-on-brand-soft);
            }
            &:active {
                background: color-mix(in srgb, var(--lv-color-brand) 14%, var(--lv-color-surface));
            }
        }
        .lv-b4 {
            &:hover {
                border-color: color-mix(in srgb, var(--lv-color-success) 30%, transparent);
                background: var(--lv-good-soft);
                color: var(--lv-color-on-success-soft);
            }
            &:active {
                background: color-mix(in srgb, var(--lv-color-success) 14%, var(--lv-color-surface));
            }
        }
    }
</style>
