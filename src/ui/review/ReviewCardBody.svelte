<script lang="ts">
    import LvIcon from "../kit/LvIcon.svelte";
    import { isSuperBlockHtml, renderSuperBlockAnswerFace, scopeCustomCardCss } from "@/core/card-face";
    import { cleanChoiceHtml, type InteractiveQuizData } from "@/core/quiz-interactive";
    import { mathTokensPresent, renderMathIn } from "@/libs/math-render";
    import ReviewInteractiveQuiz from "./ReviewInteractiveQuiz.svelte";

    interface Props {
        cardHtml?: string;
        faceError?: string;
        currentCardID?: string;
        showAnswer?: boolean;
        maskedCardHtml?: string;
        interactiveQuiz?: InteractiveQuizData | null;
        selectedChoiceKeys?: string[];
        userJudgeChoice?: boolean | null;
        typingInput?: string;
        cardFontScale?: number;
        customCardCss?: string;
        customRiffTitle?: string;
        faceHints?: string[];
        faceHintText?: (key: string) => string;
        t: any;
        onRetryFace?: () => void;
        onCardContentClick?: (e: MouseEvent) => void;
        onCardContentDblClick?: (e: MouseEvent) => void;
        onOptionPick?: (key: string) => void;
        onSubmitChoice?: () => void;
        onJudgePick?: (choice: boolean) => void;
        onFillCheck?: () => void;
        onTypingInput?: (val: string) => void;
    }

    let {
        cardHtml = "",
        faceError = "",
        currentCardID = "",
        showAnswer = false,
        maskedCardHtml = "",
        interactiveQuiz = null,
        selectedChoiceKeys = [],
        userJudgeChoice = null,
        typingInput = "",
        cardFontScale = 1,
        customCardCss = "",
        customRiffTitle = "",
        faceHints = [],
        faceHintText = (k: string) => k,
        t,
        onRetryFace = () => {},
        onCardContentClick = () => {},
        onCardContentDblClick = () => {},
        onOptionPick = () => {},
        onSubmitChoice = () => {},
        onJudgePick = () => {},
        onFillCheck = () => {},
        onTypingInput = () => {},
    }: Props = $props();

    /** 自定义卡面 CSS 限定在复习卡面内（docs/53 TODO-09）；在脚本里拼好整段样式标签再交给模板 */
    const cardCssTag = $derived.by(() => {
        const scoped = scopeCustomCardCss(customCardCss, ".lv-review .lv-card");
        return scoped ? `<style>${scoped}</style>` : "";
    });

    let displayHtml = $derived(
        interactiveQuiz?.kind === "choice" && interactiveQuiz.options.length >= 2
            ? cleanChoiceHtml(
                  showAnswer ? (isSuperBlockHtml(cardHtml) ? renderSuperBlockAnswerFace(cardHtml) : cardHtml) : maskedCardHtml,
                  interactiveQuiz.options
              )
            : showAnswer
            ? isSuperBlockHtml(cardHtml)
                ? renderSuperBlockAnswerFace(cardHtml)
                : cardHtml
            : maskedCardHtml
    );

    let contentEl = $state<HTMLDivElement | null>(null);

    $effect(() => {
        if (!cardHtml) return;
        // 追踪 showAnswer：翻面时答案区公式揭晓，重新触发 KaTeX 渲染；锁高避免公式展开瞬间卡面高度跳动
        void showAnswer;
        if (mathTokensPresent(cardHtml)) {
            const prevHeight = contentEl?.clientHeight ?? 0;
            if (prevHeight > 0 && contentEl) {
                contentEl.style.minHeight = `${prevHeight}px`;
            }
            const timer = setTimeout(() => {
                try {
                    if (contentEl && typeof (window as any).siyuan?.initKaTeX === "function") {
                        (window as any).siyuan.initKaTeX(contentEl);
                    }
                } catch {}
                void renderMathIn(contentEl).finally(() => {
                    if (contentEl) contentEl.style.minHeight = "";
                });
            }, 0);
            return () => {
                clearTimeout(timer);
                if (contentEl) contentEl.style.minHeight = "";
            };
        }
    });
</script>

{#if !cardHtml && faceError}
    <!-- AS-3：卡面加载失败占位（不白屏；重试不丢队列位置） -->
    <div
        class="lv-center"
        style="display: flex; flex-direction: column; gap: calc(var(--lv-space-unit) * 5); align-items: center; justify-content: center; min-height: 220px"
        role="alert"
        aria-live="assertive"
        data-testid="review-face-error"
    >
        <span style="font-size: var(--lv-type-hero-size)"><LvIcon name="warning" size={30} /></span>
        <span class="ft__smaller ft__on-surface" style="text-align: center; max-width: 48em; text-wrap: pretty; line-height: var(--lv-lh-reading, 1.65);">{faceError}</span>
        <button
            type="button"
            class="b3-button b3-button--outline b3-button--small lv-btn-tool"
            title={t?.dashboard?.refresh ?? "刷新"}
            onclick={onRetryFace}
            data-testid="review-retry-face-btn"
        >
            <LvIcon name="refresh" size={12} />
            <span>{t?.dashboard?.refresh ?? "刷新"}</span>
        </button>
    </div>
{:else if !cardHtml}
    <div class="lv-center" style="min-height: 220px" role="status" aria-busy="true" data-testid="review-face-loading">
        <span class="ft__smaller ft__on-surface">{t?.dashboard?.loading ?? "加载中..."}</span>
    </div>
{:else}
    {#key currentCardID}
        <!-- 闪卡工具箱自定义题面标题（custom-riff-title）兼容展示 -->
        {#if customRiffTitle}
            <div class="lv-riff-title-badge" title="闪卡工具箱自定义题面 (custom-riff-title)">
                <LvIcon name="target" size={12} />
                <span>{customRiffTitle}</span>
            </div>
        {/if}

        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <!-- 灵动感（R53 纪律内）：切卡 140ms 单次淡入，只动 opacity；翻面淡入由 lv-anim-glow 承担 -->
        <div
            class="lv-card-content lv-unified-face"
            bind:this={contentEl}
            class:has-interactive-choice={interactiveQuiz?.kind === "choice" && interactiveQuiz.options.length >= 2}
            class:lv-masked={!showAnswer}
            onclick={onCardContentClick}
            ondblclick={onCardContentDblClick}
            style={`font-size: ${cardFontScale || 1}em`}
            data-testid="review-card-content"
        >
            {#if cardCssTag}
                {@html cardCssTag}
            {/if}
            {@html displayHtml}
        </div>

        <!-- 交互式题型作答组件（选择题/判断题/填空题） -->
        <ReviewInteractiveQuiz
            {interactiveQuiz}
            {showAnswer}
            {selectedChoiceKeys}
            {userJudgeChoice}
            {typingInput}
            {onOptionPick}
            {onSubmitChoice}
            {onJudgePick}
            {onFillCheck}
            {onTypingInput}
        />
    {/key}
{/if}

{#if faceHints.length > 0 && !faceError}
    <!-- AS-3：富内容提示行（特征告知 + 窄屏横滚提示；只读不遮挡） -->
    <div
        class="fn__flex fn__flex-wrap ft__smaller ft__on-surface lv-face-hints"
        style="gap: calc(var(--lv-space-unit) * 3); margin-top: var(--lv-sp-2)"
        role="note"
        data-testid="review-face-hints"
    >
        {#each faceHints as hintKey (hintKey)}
            <span class="lv-chip2 lv-chip2--default">{faceHintText(hintKey)}</span>
        {/each}
        <span class="ft__on-surface">{t?.aiFace?.scrollHint ?? "可横向滚动"}</span>
    </div>
{/if}

<style lang="scss">
    .lv-center {
        margin: auto;
        color: var(--lv-color-text-muted);

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

    .lv-card-content {
        overflow-x: auto;
        max-width: 100%;

        :global(p) {
            max-width: 48em;
            margin: var(--lv-sp-2) 0;
            text-wrap: pretty;
            line-height: var(--lv-lh-reading, 1.65);
        }

        :global(img) {
            max-width: 100%;
            max-height: 52vh;
            height: auto;
            object-fit: contain;
            border-radius: var(--lv-r-m);
            box-shadow: var(--lv-shadow-card);
            margin: var(--lv-sp-2) 0;
            display: inline-block;
            vertical-align: middle;
            cursor: zoom-in;
            transition: transform var(--lv-dur-1) var(--lv-ease);
            &:hover {
                transform: scale(1.01);
            }
        }

        :global(.language-math),
        :global(.katex-display) {
            overflow-x: auto;
            overflow-y: hidden;
            scrollbar-width: thin;
            padding: var(--lv-sp-2) var(--lv-sp-3);
            border-radius: var(--lv-r-m);
            background: color-mix(in srgb, var(--lv-color-canvas) 85%, transparent);
            margin: var(--lv-sp-2) 0;
        }

        :global(pre) {
            overflow-x: auto;
            scrollbar-width: thin;
            padding: var(--lv-sp-3) var(--lv-sp-4);
            border-radius: var(--lv-r-m);
            background: var(--lv-color-canvas);
            border: 1px solid var(--lv-border);
            margin: var(--lv-sp-2) 0;
        }

        :global(blockquote) {
            border-left: 3px solid var(--lv-color-brand);
            padding: var(--lv-sp-2) var(--lv-sp-3);
            margin: var(--lv-sp-2) 0;
            background: var(--lv-surface-hover);
            border-radius: 0 var(--lv-r-s) var(--lv-r-s) 0;
            color: var(--lv-color-text-muted);
            font-style: italic;
        }

        :global(ul),
        :global(ol) {
            padding-left: calc(var(--lv-space-unit) * 6);
            margin: var(--lv-sp-2) 0;
            :global(li) {
                margin: calc(var(--lv-space-unit) * 2) 0;
                line-height: var(--lv-lh-reading-loose);
                padding-left: calc(var(--lv-space-unit) * 1);
                &::marker {
                    color: var(--lv-color-brand);
                    font-weight: var(--lv-fw-semibold);
                }
            }
        }

        :global(table) {
            display: block;
            overflow-x: auto;
            max-width: 100%;
            border-collapse: collapse;
            margin: var(--lv-sp-3) 0;
            :global(th),
            :global(td) {
                padding: var(--lv-sp-2) var(--lv-sp-3);
                border: 1px solid var(--lv-border);
            }
            :global(td) {
                font-variant-numeric: tabular-nums;
            }
            :global(th) {
                background: var(--lv-color-canvas);
                font-weight: var(--lv-fw-semibold);
            }
        }

        :global(img),
        :global(video),
        :global(svg) {
            max-width: 100% !important;
            height: auto !important;
            border-radius: var(--lv-r-m);
        }
    }

    .lv-riff-title-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        margin-bottom: var(--lv-sp-2);
        padding: 2px 8px;
        border-radius: var(--lv-r-tag);
        background: color-mix(in srgb, var(--lv-color-brand) 10%, var(--lv-color-surface));
        border: 1px solid color-mix(in srgb, var(--lv-color-brand) 30%, transparent);
        color: var(--lv-color-brand);
        font-size: var(--lv-type-caption-size);
        font-weight: var(--lv-fw-medium);
    }
</style>
