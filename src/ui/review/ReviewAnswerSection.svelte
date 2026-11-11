<script lang="ts">
    import LvIcon from "../kit/LvIcon.svelte";
    import LvChip from "../kit/LvChip.svelte";
    import type { AnswerVariant } from "@/core/question-rotation";
    import type { Rating1to4 } from "@/core/card-types";

    interface Props {
        showAnswer?: boolean;
        answerVariant?: AnswerVariant;
        typingInput?: string;
        choiceFallbackMode?: string | null;
        choices?: { options: string[]; picked: number | null; answerIdx: number } | null;
        choiceLoading?: boolean;
        hintText?: string;
        hintLevelLabel?: string;
        faceReady?: boolean;
        typingGrade?: {
            chars: { ch: string; ok: boolean }[];
            suggested: Rating1to4 | number;
            isTypo?: boolean;
        } | null;
        ttsEnabled?: boolean;
        t: any;
        onSubmitTyping?: () => void;
        onPickChoice?: (index: number) => void;
        onStartChoice?: () => void;
        onAdvanceHint?: () => void;
        onPeekStart?: () => void;
        onPeekEnd?: () => void;
        onRevealAnswer?: () => void;
        onSpeakAnswer?: () => void;
    }

    let {
        showAnswer = false,
        answerVariant = "flip",
        typingInput = $bindable(""),
        choiceFallbackMode = null,
        choices = null,
        choiceLoading = false,
        hintText = "",
        hintLevelLabel = "",
        faceReady = true,
        typingGrade = null,
        ttsEnabled = false,
        t,
        onSubmitTyping = () => {},
        onPickChoice = () => {},
        onStartChoice = () => {},
        onAdvanceHint = () => {},
        onPeekStart = () => {},
        onPeekEnd = () => {},
        onRevealAnswer = () => {},
        onSpeakAnswer = () => {},
    }: Props = $props();

    function handleTypingKeyDown(e: KeyboardEvent) {
        /* IME 合成期让路：Enter 属确认选字，误触会以拼音半成品判定答案。 */
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            onSubmitTyping();
        }
    }
</script>

{#if !showAnswer}
    {#if answerVariant === "typing"}
        <div class="lv-typing" data-testid="review-typing-wrap">
            <input
                class="b3-text-field fn__block"
                bind:value={typingInput}
                spellcheck="false"
                autocomplete="off"
                onkeydown={handleTypingKeyDown}
                placeholder={t?.review?.typingPlaceholder ?? "输入你的答案后回车..."}
                data-testid="review-typing-input"
            />
        </div>
    {:else if answerVariant === "choice"}
        {#if choiceFallbackMode === "free-recall"}
            <div class="ft__smaller ft__on-surface lv-choice-fallback" role="status" data-testid="review-choice-fallback">
                {t?.review?.choiceFallbackFreeRecall ?? "当前卡片暂无选项，转为自由回忆"}
            </div>
        {:else if choices}
            <div class="lv-choices" data-testid="review-choices-wrap">
                {#each choices.options as opt, i (i)}
                    <button
                        type="button"
                        class="b3-button lv-choice-opt"
                        class:lv-choice-correct={choices.picked !== null && i === choices.answerIdx}
                        class:lv-choice-wrong={choices.picked === i && i !== choices.answerIdx}
                        disabled={choices.picked !== null}
                        aria-keyshortcuts={String.fromCharCode(65 + i)}
                        onclick={() => onPickChoice(i)}
                        data-testid={`review-choice-opt-${i}`}
                    >
                        {String.fromCharCode(65 + i)}. {opt}
                    </button>
                {/each}
                {#if choices.picked !== null}
                    <LvChip tone={choices.picked === choices.answerIdx ? "primary" : "error"}>
                        {t?.review?.typingSuggested ?? "建议评分"}: {choices.picked === choices.answerIdx ? 3 : 1}
                    </LvChip>
                {/if}
            </div>
        {:else if choiceLoading}
            <div class="ft__smaller ft__on-surface" role="status" aria-busy="true" data-testid="review-choice-loading">
                {t?.review?.choiceLoading ?? "选项生成中..."}
            </div>
        {:else}
            <button
                type="button"
                class="b3-button b3-button--small lv-choice-btn"
                onclick={onStartChoice}
                data-testid="review-make-choice-btn"
            >
                <LvIcon name="dice" size={15} /> {t?.review?.choiceMake ?? "生成选项"}
            </button>
        {/if}
    {/if}

    <!-- BJ-2：分级提示显示区（不自动提交评分；含级别指示器） -->
    {#if hintText}
        <div class="lv-hint-text" data-testid="review-hint-box">
            {#if hintLevelLabel}
                <span class="ft__smaller ft__on-surface lv-hint-level">{hintLevelLabel}</span>
            {/if}
            {hintText}
        </div>
    {/if}

    <!-- AQ-2：显示答案按钮补 onclick——此前覆盖层按钮无处理器且容器点击跳过 button，鼠标点击翻面失效 -->
    <div class="fn__flex" style="gap: var(--lv-sp-2); justify-content: center; align-items: center;">
        <button
            type="button"
            class="b3-button b3-button--small lv-btn-ghost"
            aria-keyshortcuts="h"
            title="点击推进提示，长按或按住快捷键临时透视"
            onclick={onAdvanceHint}
            onpointerdown={onPeekStart}
            onpointerup={onPeekEnd}
            onpointerleave={onPeekEnd}
            onpointercancel={onPeekEnd}
            data-testid="review-advance-hint-btn"
        >
            {t?.review?.hintBtn ?? "提示"}
        </button>
        <button
            type="button"
            class="b3-button b3-button--text lv-reveal"
            disabled={!faceReady}
            aria-keyshortcuts="Space"
            onclick={onRevealAnswer}
            data-testid="review-reveal-btn"
        >
            {t?.review?.showAnswer ?? "显示答案"}
        </button>
    </div>
    <span class="lv-reveal-hint" aria-hidden="true">⎵ {t?.review?.revealHint ?? "空格翻面"} · 长按透视</span>
{/if}

{#if typingGrade}
    <div class="lv-typing-diff" data-testid="review-typing-diff">
        <span class="ft__smaller ft__on-surface">{typingGrade.isTypo ? "拼写微瑕容错" : (t?.review?.typingSuggested ?? "建议评分")}</span>
        <LvChip tone={typingGrade.isTypo ? "warn" : typingGrade.suggested === 3 ? "primary" : typingGrade.suggested === 2 ? "warn" : "error"}>
            {typingGrade.isTypo ? "微瑕 · 建议: 3" : typingGrade.suggested}
        </LvChip>
        <span class="lv-diff">
            {#each typingGrade.chars as c, i (i)}
                <span class:lv-diff-ok={c.ok} class:lv-diff-bad={!c.ok}>{c.ch}</span>
            {/each}
        </span>
    </div>
{:else if showAnswer && ttsEnabled}
    <div class="lv-tts-row" data-testid="review-tts-row">
        <button
            type="button"
            class="b3-button b3-button--small lv-btn-ghost"
            title={t?.review?.speak ?? "朗读"}
            onclick={onSpeakAnswer}
            data-testid="review-tts-speak-btn"
        >
            {t?.review?.speak ?? "朗读"}
        </button>
    </div>
{/if}

<style lang="scss">
    .lv-typing {
        margin-top: var(--lv-sp-3);
        position: relative;
        z-index: var(--lv-z-card-control);

        input {
            touch-action: manipulation;
            transition: border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease);

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
                border-color: var(--lv-color-brand);
            }
        }
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

    .lv-choice-btn {
        margin-top: var(--lv-sp-3);
    }

    .lv-choices {
        position: relative;
        z-index: var(--lv-z-card-control);
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--lv-sp-2);

        @media (max-width: 520px) {
            grid-template-columns: 1fr;
        }
        @container (max-width: 520px) {
            grid-template-columns: 1fr;
        }

        .lv-choice-opt {
            text-align: left;
            border: 1px solid var(--lv-border);
            background: var(--lv-color-canvas);
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;
            transition: border-color var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease);

            &:hover:not(:disabled) {
                border-color: var(--lv-primary-border);
                background: var(--lv-primary-softer);
            }
            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
                border-color: var(--lv-color-brand);
            }
            &:disabled {
                cursor: default;
                opacity: 0.9;
            }
        }
        .lv-choice-correct {
            border-color: var(--lv-color-brand) !important;
            background: var(--lv-primary-soft) !important;
        }
        .lv-choice-wrong {
            border-color: var(--lv-danger-border) !important;
            background: var(--lv-danger-soft) !important;
        }
    }

    .lv-typing-diff {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        margin-top: var(--lv-sp-3);
        flex-wrap: wrap;

        .lv-diff span {
            font-variant-numeric: normal;
        }
        .lv-diff-ok {
            color: var(--lv-color-brand);
        }
        .lv-diff-bad {
            color: var(--lv-color-danger);
            text-decoration: line-through;
            opacity: 0.85;
        }
    }

    .lv-reveal {
        position: absolute;
        inset: 0;
        z-index: var(--lv-z-base);
        width: 100%;
        height: 100%;
        background: transparent;
        color: transparent;
        font-size: var(--lv-type-body-sm-size);
        transition: background var(--lv-dur-2) var(--lv-ease);

        &:hover {
            background: color-mix(in srgb, var(--lv-primary-softer) 55%, transparent);
        }
    }

    .lv-hint-text {
        padding: var(--lv-sp-2) var(--lv-sp-3);
        border-left: 3px solid var(--lv-color-brand);
        background: var(--lv-color-surface);
        border-radius: var(--b3-border-radius);
        margin: var(--lv-sp-2) auto;
        max-width: inherit;
        font-size: var(--lv-type-fluid-size);
        color: var(--lv-color-text-muted);
    }

    .lv-reveal-hint {
        position: absolute;
        right: var(--lv-sp-3);
        bottom: var(--lv-sp-2);
        font-size: var(--lv-type-meta-size);
        color: var(--lv-color-text-muted);
        opacity: 0.7;
        pointer-events: none;
    }
    /* 触屏/窄屏：空格键提示无意义，且绝对定位会与填空输入行重叠（实机截图反馈） */
    @media (pointer: coarse), (max-width: 680px) {
        .lv-reveal-hint { display: none; }
    }

    .lv-tts-row {
        display: flex;
        justify-content: flex-end;
        margin-top: var(--lv-sp-2);
    }
</style>
