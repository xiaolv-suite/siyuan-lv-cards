<script lang="ts">
    import { onMount } from "svelte";
    import LvIcon from "../kit/LvIcon.svelte";
    import {
        type SequenceCardModel,
        advanceSequenceStep,
        revealAllSequence,
        resetSequenceProgress,
        markSequenceItem,
    } from "@/core/sequence-card";

    interface Props {
        model: SequenceCardModel;
        t: any;
        isPeeking?: boolean;
        onProgressChange?: (nextModel: SequenceCardModel) => void;
        onFullyRevealed?: () => void;
    }

    let {
        model = $bindable(),
        t,
        isPeeking = false,
        onProgressChange = () => {},
        onFullyRevealed = () => {},
    }: Props = $props();

    function handleAdvance() {
        if (model.isFullyRevealed) return;
        model = advanceSequenceStep(model);
        onProgressChange(model);
        if (model.isFullyRevealed) {
            onFullyRevealed();
        }
    }

    function handleRevealAll() {
        if (model.isFullyRevealed) return;
        model = revealAllSequence(model);
        onProgressChange(model);
        onFullyRevealed();
    }

    function handleReset() {
        model = resetSequenceProgress(model);
        onProgressChange(model);
    }

    function handleMark(e: MouseEvent, index: number, correct: boolean) {
        e.stopPropagation();
        model = markSequenceItem(model, index, correct);
        onProgressChange(model);
    }

    function handleItemClick(index: number) {
        const item = model.items[index];
        if (!item) return;
        if (item.status === "active" || item.status === "hidden") {
            handleAdvance();
        }
    }

    // 键盘心流监听与守卫
    function handleKeyDown(e: KeyboardEvent) {
        // 1. 输入法合成期守卫
        if (e.isComposing || e.keyCode === 229) return;

        // 2. 焦点位于输入框时守卫
        const target = e.target as HTMLElement;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
            return;
        }

        if (e.code === "Space" || e.key === " ") {
            if (e.shiftKey) {
                e.preventDefault();
                handleRevealAll();
            } else if (!model.isFullyRevealed) {
                e.preventDefault();
                handleAdvance();
            }
        } else if (e.code === "KeyR" || e.key === "r") {
            if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                handleReset();
            }
        }
    }

    onMount(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    });
</script>

<div
    class="lv-sequence-card-container"
    style="--seq-total-items: {Math.max(2, model.totalCount)};"
    data-prevent-swipe="true"
    data-testid="sequence-card-container"
>
    <!-- 顶部阶梯题干 -->
    <div class="lv-sequence-header">
        <div class="lv-sequence-badge-row">
            <span class="lv-sequence-badge">
                <LvIcon name="list" size={13} />
                <span>{t.sequenceBadge ?? "阶梯列表"} · {model.revealedCount}/{model.totalCount} 项</span>
            </span>
            <div class="lv-sequence-actions-bar">
                {#if !model.isFullyRevealed}
                    <button
                        type="button"
                        class="lv-seq-btn-link"
                        onclick={handleRevealAll}
                        title="{t.sequenceSkip ?? '直接看全部答案 (Shift+Space)'}"
                    >
                        {t.sequenceSkip ?? "全部揭晓"}
                    </button>
                {:else}
                    <button
                        type="button"
                        class="lv-seq-btn-link"
                        onclick={handleReset}
                        title="{t.sequenceReset ?? '重置重测 (R)'}"
                    >
                        <LvIcon name="refresh" size={12} />
                        <span>{t.sequenceReset ?? "重置"}</span>
                    </button>
                {/if}
            </div>
        </div>
        <div class="lv-sequence-question-title">
            {model.questionTitle}
        </div>
    </div>

    <!-- 列表要点骨架与揭晓区域（Zero CLS 零高度抖动） -->
    <div class="lv-sequence-list">
        {#each model.items as item, idx (item.id || idx)}
            {@const isRevealed = item.status === "revealed" || isPeeking}
            {@const isActive = item.status === "active" && !isPeeking}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div
                class="lv-sequence-item"
                class:is-revealed={isRevealed}
                class:is-active={isActive}
                class:is-hidden={item.status === "hidden" && !isPeeking}
                class:is-marked-correct={item.markedCorrect === true}
                class:is-marked-wrong={item.markedCorrect === false}
                onclick={() => handleItemClick(idx)}
            >
                <div class="lv-sequence-item-num">
                    <span class="lv-seq-index-circle">{idx + 1}</span>
                </div>

                <div class="lv-sequence-item-content">
                    {#if isRevealed}
                        <div class="lv-sequence-revealed-text">
                            {@html item.rawHtml || item.cleanText}
                        </div>
                    {:else if isActive}
                        <div class="lv-sequence-active-prompt">
                            <span class="lv-prompt-pulse-dot"></span>
                            <span class="lv-prompt-hint">
                                {(t.sequenceTapCue ?? "敲空格或轻触揭晓第 ${n} 点 ▾").replace("${n}", String(idx + 1))}
                            </span>
                        </div>
                    {:else}
                        <div class="lv-sequence-skeleton-bar" aria-hidden="true">
                            <div class="lv-skeleton-line"></div>
                        </div>
                    {/if}
                </div>

                <!-- 自测打标按钮 (已揭晓项展示，data-prevent-swipe 防误滑) -->
                {#if isRevealed}
                    <div class="lv-sequence-item-feedback" data-prevent-swipe="true">
                        <button
                            type="button"
                            class="lv-seq-mark-btn is-correct"
                            class:active={item.markedCorrect === true}
                            onclick={(e) => handleMark(e, idx, true)}
                            title={t.sequenceMarkCorrect ?? "回忆正确"}
                            aria-label={t.sequenceMarkCorrect ?? "回忆正确"}
                        >
                            ✔
                        </button>
                        <button
                            type="button"
                            class="lv-seq-mark-btn is-wrong"
                            class:active={item.markedCorrect === false}
                            onclick={(e) => handleMark(e, idx, false)}
                            title={t.sequenceMarkWrong ?? "遗忘或模糊"}
                            aria-label={t.sequenceMarkWrong ?? "遗忘或模糊"}
                        >
                            ✘
                        </button>
                    </div>
                {/if}
            </div>
        {/each}
    </div>

    <!-- 推进指引底栏 -->
    {#if !model.isFullyRevealed && !isPeeking}
        <button
            type="button"
            class="lv-sequence-footer-cue"
            onclick={handleAdvance}
            title="推进揭晓下一条 (Space)"
            aria-label="推进揭晓下一条（已完成 {model.revealedCount}/{model.totalCount}）"
        >
            <span class="lv-cue-key">Space</span>
            <span class="lv-cue-text">推进揭晓下一条（已完成 {model.revealedCount}/{model.totalCount}）</span>
        </button>
    {/if}
</div>

<style lang="scss">
    @keyframes lv-pulse-border {
        0%, 100% {
            border-color: color-mix(in srgb, var(--b3-theme-warning, var(--lv-color-warning, #f59e0b)) 80%, transparent);
            box-shadow: 0 0 0 1px color-mix(in srgb, var(--b3-theme-warning, var(--lv-color-warning, #f59e0b)) 40%, transparent), 0 2px 8px color-mix(in srgb, var(--b3-theme-warning, var(--lv-color-warning, #f59e0b)) 20%, transparent);
        }
        50% {
            border-color: color-mix(in srgb, var(--b3-theme-warning, var(--lv-color-warning, #f59e0b)) 35%, transparent);
            box-shadow: 0 0 0 0 transparent, 0 1px 3px rgba(0, 0, 0, 0.05);
        }
    }

    @keyframes lv-shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
    }

    .lv-sequence-card-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        max-width: 820px;
        margin: 0 auto;
        box-sizing: border-box;
        user-select: text;
    }

    .lv-sequence-header {
        margin-bottom: var(--lv-sp-4, 16px);
        padding-bottom: var(--lv-sp-3, 12px);
        border-bottom: 1px dashed var(--lv-border, rgba(0, 0, 0, 0.1));
    }

    .lv-sequence-badge-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--lv-sp-2, 8px);
    }

    .lv-sequence-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        color: var(--lv-color-brand, var(--b3-theme-primary, #6366f1));
        background: color-mix(in srgb, var(--lv-color-brand, var(--b3-theme-primary, #6366f1)) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--lv-color-brand, var(--b3-theme-primary, #6366f1)) 25%, transparent);
        padding: 3px 10px;
        border-radius: 999px;
    }

    .lv-seq-btn-link {
        background: transparent;
        border: none;
        color: var(--lv-color-text-muted, #888);
        font-size: 12px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        border-radius: 4px;
        transition: color 0.15s ease, background 0.15s ease;

        &:hover {
            color: var(--lv-color-brand, var(--b3-theme-primary, #6366f1));
            background: color-mix(in srgb, var(--lv-color-brand, var(--b3-theme-primary, #6366f1)) 8%, transparent);
        }
    }

    .lv-sequence-question-title {
        font-size: 1.15rem;
        font-weight: 600;
        line-height: 1.5;
        color: var(--lv-color-text, currentColor);
    }

    .lv-sequence-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: calc(var(--seq-total-items, 3) * 52px);
        box-sizing: border-box;
    }

    .lv-sequence-item {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 48px;
        padding: 8px 14px;
        border-radius: 8px;
        border: 1px solid var(--lv-border, rgba(0, 0, 0, 0.08));
        background: color-mix(in srgb, var(--lv-color-canvas, #fff) 80%, transparent);
        box-sizing: border-box;
        transition: border-color 0.2s ease, background 0.2s ease, transform 0.15s ease;

        &.is-active {
            animation: lv-pulse-border 1.5s infinite ease-in-out;
            background: color-mix(in srgb, #f59e0b 6%, var(--lv-color-canvas, #fff));
            cursor: pointer;
        }

        &.is-revealed {
            border-color: color-mix(in srgb, var(--lv-color-brand, var(--b3-theme-primary, #6366f1)) 25%, var(--lv-border, rgba(0,0,0,0.1)));
            background: color-mix(in srgb, var(--lv-color-canvas, #fff) 96%, transparent);

            &.is-marked-correct {
                border-left: 4px solid var(--lv-color-success, #10b981);
            }

            &.is-marked-wrong {
                border-left: 4px solid var(--lv-color-danger, #ef4444);
            }
        }

        &.is-hidden {
            opacity: 0.65;
            background: color-mix(in srgb, var(--lv-color-canvas, #fff) 50%, rgba(120, 120, 120, 0.04));
            cursor: pointer;
        }
    }

    .lv-sequence-item-num {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .lv-seq-index-circle {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 700;
        color: var(--lv-color-text-muted, #777);
        background: color-mix(in srgb, var(--lv-color-text-muted, #777) 12%, transparent);
    }

    .is-active .lv-seq-index-circle {
        color: var(--b3-theme-warning, var(--lv-color-warning, #f59e0b));
        background: color-mix(in srgb, var(--b3-theme-warning, var(--lv-color-warning, #f59e0b)) 20%, transparent);
    }

    .is-revealed .lv-seq-index-circle {
        color: var(--lv-color-brand, var(--b3-theme-primary, #6366f1));
        background: color-mix(in srgb, var(--lv-color-brand, var(--b3-theme-primary, #6366f1)) 16%, transparent);
    }

    .lv-sequence-item-content {
        flex: 1;
        min-width: 0;
        font-size: 0.98rem;
        line-height: 1.55;
    }

    .lv-sequence-revealed-text {
        animation: lv-item-fadein 0.25s ease-out;
        word-break: break-word;
    }

    @keyframes lv-item-fadein {
        from { opacity: 0; transform: translateY(2px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .lv-sequence-active-prompt {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--b3-theme-warning, var(--lv-color-warning, #f59e0b));
        font-size: 0.92rem;
        font-weight: 500;
    }

    .lv-prompt-pulse-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--b3-theme-warning, var(--lv-color-warning, #f59e0b));
        box-shadow: 0 0 6px var(--b3-theme-warning, var(--lv-color-warning, #f59e0b));
    }

    .lv-sequence-skeleton-bar {
        position: relative;
        overflow: hidden;
        height: 14px;
        border-radius: 4px;
        background: color-mix(in srgb, var(--lv-color-text-muted, #888) 12%, transparent);
        width: 60%;

        &::after {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.25), transparent);
            animation: lv-shimmer 1.8s infinite;
        }
    }

    .lv-sequence-item-feedback {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
    }

    .lv-seq-mark-btn {
        width: 32px;
        height: 32px;
        border-radius: 6px;
        border: 1px solid var(--lv-border, rgba(0, 0, 0, 0.1));
        background: transparent;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;

        &:active {
            transform: scale(0.95);
        }

        &.is-correct {
            color: var(--b3-theme-success, var(--lv-color-success, #10b981));
            &:hover, &.active {
                background: color-mix(in srgb, var(--b3-theme-success, var(--lv-color-success, #10b981)) 15%, transparent);
                border-color: var(--b3-theme-success, var(--lv-color-success, #10b981));
            }
        }

        &.is-wrong {
            color: var(--b3-theme-error, var(--lv-color-danger, #ef4444));
            &:hover, &.active {
                background: color-mix(in srgb, var(--b3-theme-error, var(--lv-color-danger, #ef4444)) 15%, transparent);
                border-color: var(--b3-theme-error, var(--lv-color-danger, #ef4444));
            }
        }
    }

    .lv-sequence-footer-cue {
        margin-top: var(--lv-sp-3, 12px);
        padding: 10px 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        border-radius: 8px;
        border: 1px dashed color-mix(in srgb, var(--lv-color-brand, var(--b3-theme-primary, #6366f1)) 40%, transparent);
        background: color-mix(in srgb, var(--lv-color-brand, var(--b3-theme-primary, #6366f1)) 6%, transparent);
        color: var(--lv-color-brand, var(--b3-theme-primary, #6366f1));
        font-size: 0.9rem;
        cursor: pointer;
        user-select: none;
        transition: background 0.2s ease, transform 0.1s ease;

        &:hover {
            background: color-mix(in srgb, var(--lv-color-brand, var(--b3-theme-primary, #6366f1)) 12%, transparent);
            transform: translateY(-1px);
        }

        &:active {
            transform: scale(0.98);
        }
    }

    .lv-cue-key {
        display: inline-block;
        padding: 2px 7px;
        font-size: 11px;
        font-family: var(--b3-font-family-code, monospace);
        font-weight: 600;
        border-radius: 4px;
        background: color-mix(in srgb, var(--lv-color-canvas, #fff) 85%, transparent);
        border: 1px solid color-mix(in srgb, var(--lv-color-brand, var(--b3-theme-primary, #6366f1)) 30%, transparent);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
    }

    @media (max-width: 680px), (pointer: coarse) {
        .lv-sequence-item {
            min-height: 52px;
            padding: 10px 12px;
        }

        .lv-seq-mark-btn {
            min-width: 44px !important;
            min-height: 44px !important;
            font-size: 16px !important;
            border-radius: 8px !important;
        }

        .lv-sequence-footer-cue {
            min-height: 48px;
        }
    }
</style>
