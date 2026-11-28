<script lang="ts">
    import LvIcon from "../kit/LvIcon.svelte";
    import { isSuperBlockHtml, isAttrQaCard, resolveAttrQaSubtype, sanitizeBlockBodyHtmlForFace, sanitizeReviewCardDomHtml, renderSuperBlockAnswerFace, scopeCustomCardCss, renderAttrQaQuestionFace, renderAttrQaAnswerFace, formatMarkdownToSafeHtml } from "@/core/card-face";
    import { isMeaningfulCardAnswerAttr } from "@/core/flashcard-quality";
    import { cleanChoiceHtml, type InteractiveQuizData } from "@/core/quiz-interactive";
    import { mathTokensPresent, renderMathIn } from "@/libs/math-render";
    import { isSequenceCard, parseSequenceCard, revealAllSequence, type SequenceCardModel } from "@/core/sequence-card";
    import ReviewInteractiveQuiz from "./ReviewInteractiveQuiz.svelte";
    import ReviewSequenceCard from "./ReviewSequenceCard.svelte";

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
        /** 免侵入问答卡自定义答案（custom-riff-answer）；为空表示回退笔记正文 */
        customRiffAnswer?: string;
        /** 翻转问答自测开关（R 键激活） */
        reversedRecall?: boolean;
        cardAttrs?: Record<string, string> | null;
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
        onSequenceFullyRevealed?: () => void;
        onToggleReversed?: () => void;
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
        customRiffAnswer = "",
        reversedRecall = false,
        cardAttrs = null,
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
        onSequenceFullyRevealed = () => {},
        onToggleReversed,
    }: Props = $props();

    /** 自定义卡面 CSS 限定在复习卡面内（docs/53 TODO-09）；在脚本里拼好整段样式标签再交给模板 */
    const cardCssTag = $derived.by(() => {
        const scoped = scopeCustomCardCss(customCardCss, ".lv-review .lv-card");
        return scoped ? `<style>${scoped}</style>` : "";
    });

    /** 判断当前卡片是否为 RemNote 风格列表阶梯展开卡 */
    const isSeq = $derived(isSequenceCard(cardHtml, cardAttrs));
    let seqModel = $state<SequenceCardModel | null>(null);

    $effect(() => {
        if (isSeq && cardHtml) {
            seqModel = parseSequenceCard(cardHtml, customRiffTitle, currentCardID);
        } else {
            seqModel = null;
        }
    });

    $effect(() => {
        if (showAnswer && seqModel && !seqModel.isFullyRevealed) {
            seqModel = revealAllSequence(seqModel);
        }
    });

    /** 判断当前卡片是否为属性问答卡（涵盖直接问答 / 背诵自测 / 双面对照 3 子型；遮挡卡须保留原图不走纯文本替换） */
    const hasOcclusionAttr = $derived(Boolean(
        cardAttrs?.["custom-lv-occlusion"] || cardAttrs?.["lv-occlusion"] || cardAttrs?.["custom-riff-occlusion"],
    ));
    const isQaCard = $derived(!hasOcclusionAttr && isAttrQaCard(cardHtml, customRiffTitle, customRiffAnswer));
    const attrQaSubtype = $derived(
        isQaCard ? (resolveAttrQaSubtype(cardAttrs, cardHtml, customRiffTitle, customRiffAnswer) ?? "recite") : null
    );
    const attrBidiEnabled = $derived(
        attrQaSubtype === "dual" && String(cardAttrs?.["custom-lv-bidi"] ?? "").trim().toLowerCase() !== "false"
    );
    const attrHint = $derived(String(cardAttrs?.["custom-lv-hint"] || "").trim());
    let hintExpanded = $state(false);
    $effect(() => {
        void currentCardID;
        hintExpanded = false;
    });

    const effectiveCustomAnswer = $derived.by(() => {
        const trimmed = (customRiffAnswer ?? "").trim();
        return trimmed && isMeaningfulCardAnswerAttr(trimmed) ? trimmed : "";
    });

    /** 属性问答卡答案面：按 direct / recite / dual 3 子型精确呈现（无效属性绝不覆盖有效正文） */
    const attrQaAnswerHtml = $derived.by(() => {
        const customA = effectiveCustomAnswer;
        if (attrQaSubtype === "direct" || (!customRiffTitle && customA)) {
            const safeBody = sanitizeBlockBodyHtmlForFace(cardHtml);
            if (reversedRecall) {
                return renderAttrQaAnswerFace(
                    safeBody,
                    customA,
                    t?.reviewAttrAnswerOriginalPrompt ?? "原题干 (正文)",
                    "",
                    "",
                    { subtype: "direct", reversed: true },
                );
            }
            return renderAttrQaAnswerFace(
                formatMarkdownToSafeHtml(customA),
                safeBody,
                t?.reviewAttrAnswerCustom ?? "参考答案",
                "",
                "",
                { subtype: "direct", questionIsHtml: true },
            );
        }
        if (reversedRecall) {
            // 翻转作答：题面为自定义答案或受控富文本正文（保留图片/公式等富内容，剥离属性与编辑器装饰），背面为题干概念
            const hasCustom = Boolean(customA);
            const prompt = hasCustom ? customA : sanitizeBlockBodyHtmlForFace(cardHtml);
            return renderAttrQaAnswerFace(
                formatMarkdownToSafeHtml(customRiffTitle),
                prompt,
                t?.reviewAttrAnswerOriginalPrompt ?? "题干 / 概念名称",
                "",
                "",
                { subtype: attrQaSubtype, questionIsHtml: !hasCustom, reversed: true },
            );
        }
        if (!customA) return renderAttrQaAnswerFace(cardHtml, customRiffTitle, undefined, "", "", { subtype: attrQaSubtype });
        return renderAttrQaAnswerFace(
            formatMarkdownToSafeHtml(customA),
            customRiffTitle,
            t?.reviewAttrAnswerCustom ?? "参考答案",
            cardHtml,
            t?.reviewAttrAnswerNote ?? "笔记原文",
            { subtype: attrQaSubtype },
        );
    });

    /** 属性问答卡问题面：支持直接问答、背诵自测与双面对照 */
    const attrQaQuestionHtml = $derived.by(() => {
        const customA = effectiveCustomAnswer;
        if (attrQaSubtype === "direct" || (!customRiffTitle && customA)) {
            if (reversedRecall) {
                return renderAttrQaQuestionFace(customA, { subtype: "direct", reversed: true });
            }
            return renderAttrQaQuestionFace(sanitizeBlockBodyHtmlForFace(cardHtml), { subtype: "direct", questionIsHtml: true });
        }
        if (reversedRecall) {
            const hasCustom = Boolean(customA);
            return renderAttrQaQuestionFace(
                hasCustom ? customA : sanitizeBlockBodyHtmlForFace(cardHtml),
                { subtype: attrQaSubtype, questionIsHtml: !hasCustom, reversed: true },
            );
        }
        return renderAttrQaQuestionFace(customRiffTitle, { subtype: attrQaSubtype });
    });

    const canClickCloze = $derived(!interactiveQuiz || interactiveQuiz.kind === "free-recall");

    let rawDisplayHtml = $derived(
        interactiveQuiz?.kind === "choice" && interactiveQuiz.options.length >= 2
            ? cleanChoiceHtml(
                  showAnswer
                      ? isSuperBlockHtml(cardHtml)
                          ? renderSuperBlockAnswerFace(cardHtml)
                          : isQaCard
                          ? attrQaAnswerHtml
                          : cardHtml
                      : isSuperBlockHtml(cardHtml)
                      ? maskedCardHtml
                      : isQaCard
                      ? attrQaQuestionHtml
                      : maskedCardHtml,
                  interactiveQuiz.options
              )
            : showAnswer
            ? isSuperBlockHtml(cardHtml)
                ? renderSuperBlockAnswerFace(cardHtml)
                : isQaCard
                ? attrQaAnswerHtml
                : cardHtml
            : isSuperBlockHtml(cardHtml)
            ? maskedCardHtml
            : isQaCard
            ? attrQaQuestionHtml
            : maskedCardHtml
    );
    let displayHtml = $derived(sanitizeReviewCardDomHtml(rawDisplayHtml));

    let contentEl = $state<HTMLDivElement | null>(null);

    $effect(() => {
        if (!cardHtml && !displayHtml) return;
        // 追踪 showAnswer：翻面时答案区公式揭晓，重新触发 KaTeX 渲染；锁高避免公式展开瞬间卡面高度跳动
        void showAnswer;
        if (mathTokensPresent(displayHtml) || mathTokensPresent(cardHtml)) {
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
        {#if isSeq && seqModel}
            <!-- RemNote 风格列表阶梯展开卡视图（Zero CLS + 状态机步进） -->
            <ReviewSequenceCard
                bind:model={seqModel}
                {t}
                isPeeking={showAnswer}
                onFullyRevealed={onSequenceFullyRevealed}
            />
        {:else}
            <!-- 闪卡自定义题面标题（custom-riff-title）：若为问答卡，已在卡面正文内作为主问答渲染；若非问答卡，展示顶部情境徽章 -->
            {#if customRiffTitle && !isQaCard}
                <div class="lv-riff-title-badge" title="闪卡自定义题面">
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
                class:lv-cloze-clickable={!showAnswer && canClickCloze}
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

            {#if isQaCard && ((attrQaSubtype === "recite" && attrHint && !showAnswer) || (attrBidiEnabled && onToggleReversed))}
                <div class="lv-qa-attr-controls" data-prevent-swipe="true">
                    {#if attrQaSubtype === "recite" && attrHint && !showAnswer}
                        <button
                            type="button"
                            class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                            data-testid="attr-qa-hint-toggle"
                            aria-expanded={hintExpanded}
                            onclick={(e) => { e.stopPropagation(); hintExpanded = !hintExpanded; }}
                        >
                            <LvIcon name="lightbulb" size={12} />
                            <span>{hintExpanded ? "收起提示" : "展开关键词提示"}</span>
                        </button>
                    {/if}
                    {#if attrBidiEnabled && onToggleReversed}
                        <button
                            type="button"
                            class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                            data-testid="attr-qa-dual-toggle"
                            onclick={(e) => { e.stopPropagation(); onToggleReversed?.(); }}
                        >
                            <LvIcon name="swap" size={12} />
                            <span>{reversedRecall ? "切换为正向 (概念 → 释义)" : "切换为反向 (释义 → 概念)"}</span>
                        </button>
                    {/if}
                </div>
                {#if attrQaSubtype === "recite" && attrHint && !showAnswer && hintExpanded}
                    <div class="lv-qa-hint-callout" data-testid="attr-qa-hint-body" role="note">
                        <LvIcon name="lightbulb" size={13} />
                        <span>{attrHint}</span>
                    </div>
                {/if}
            {/if}

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
        {/if}
    {/key}
{/if}

{#if faceHints.length > 0 && !faceError && !isSeq}
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

        &.lv-masked {
            :global(mark),
            :global(span[data-type="mark"]) {
                background: color-mix(in srgb, var(--lv-color-brand, #5E59CB) 14%, var(--lv-color-surface)) !important;
                border: 1.5px dashed color-mix(in srgb, var(--lv-color-brand, #5E59CB) 60%, transparent) !important;
                border-radius: var(--lv-r-pill, 999px) !important;
                color: var(--lv-color-brand, #5E59CB) !important;
                font-weight: 600 !important;
                padding: 1px 10px !important;
                margin: 0 4px !important;
                box-shadow: 0 1px 3px color-mix(in srgb, var(--lv-color-brand, #5E59CB) 12%, transparent);
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                vertical-align: baseline;
                cursor: default;
                user-select: none !important;
                -webkit-user-select: none !important;
                transition: all 0.15s ease-out;
            }

            &.lv-cloze-clickable {
                :global(mark:not(.lv-step-revealed)),
                :global(span[data-type="mark"]:not(.lv-step-revealed)) {
                    cursor: pointer !important;

                    &::after {
                        content: "💭点击揭晓";
                        font-size: 11px;
                        opacity: 0.85;
                        font-weight: 500;
                        margin-left: 2px;
                        pointer-events: none;
                    }

                    &:hover {
                        background: color-mix(in srgb, var(--lv-color-brand, #5E59CB) 22%, var(--lv-color-surface)) !important;
                        border-color: var(--lv-color-brand, #5E59CB) !important;
                        transform: translateY(-1px);
                        box-shadow: 0 2px 6px color-mix(in srgb, var(--lv-color-brand, #5E59CB) 25%, transparent) !important;
                    }
                }
            }

            &:not(.lv-cloze-clickable) {
                :global(mark:not(.lv-step-revealed)),
                :global(span[data-type="mark"]:not(.lv-step-revealed)) {
                    cursor: default !important;

                    &::after {
                        content: "［ ？ ］";
                        font-size: 11px;
                        opacity: 0.72;
                        font-weight: 500;
                        margin-left: 2px;
                        pointer-events: none;
                    }
                }
            }
        }

        &:not(.lv-masked) {
            :global(mark),
            :global(span[data-type="mark"]) {
                background: color-mix(in srgb, var(--lv-color-success, #10B981) 16%, transparent) !important;
                color: var(--lv-color-text) !important;
                border-radius: var(--lv-r-s, 4px);
                padding: 1px 6px;
                font-weight: 600;
                border-bottom: 2px solid var(--lv-color-success, #10B981);
            }
        }

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

        :global(.lv-qa-attr-stage) {
            display: flex;
            flex-direction: column;
            gap: 8px;
            width: 100%;
        }

        :global(.lv-qa-attr-hero) {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            margin: 2px 0 6px;
        }

        :global(.lv-qa-attr-badge) {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 24px;
            height: 24px;
            padding: 0 5px;
            border-radius: var(--lv-r-s);
            background: var(--lv-color-brand);
            color: var(--lv-color-on-brand);
            font-size: var(--lv-type-meta-size);
            font-weight: var(--lv-fw-semibold);
            flex-shrink: 0;
            margin-top: 1px;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
        }

        :global(.lv-qa-attr-title) {
            font-size: var(--lv-type-heading-size);
            line-height: var(--lv-type-heading-line);
            font-weight: var(--lv-fw-semibold);
            color: var(--lv-color-text);
            flex: 1;
            text-wrap: pretty;
        }

        :global(.lv-qa-answer-placeholder) {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 10px 14px;
            border-radius: var(--lv-r-m);
            background: color-mix(in srgb, var(--lv-color-brand) 4%, var(--lv-color-canvas));
            border: 1px dashed color-mix(in srgb, var(--lv-color-brand) 25%, transparent);
            color: var(--lv-color-text-muted);
            font-size: var(--lv-type-body-size);
            text-align: center;
            margin: 6px 0;
            cursor: pointer;
            user-select: none;
            transition: all var(--lv-dur-1) var(--lv-ease);

            &:hover {
                border-color: var(--lv-color-brand);
                background: color-mix(in srgb, var(--lv-color-brand) 8%, var(--lv-color-canvas));
                color: var(--lv-color-brand);
            }
        }

        :global(.lv-qa-keyboard-hint) {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: var(--lv-sp-2);
            font-size: var(--lv-type-meta-size);
            color: var(--lv-color-text-muted);
            margin-top: calc(var(--lv-space-unit) * 1);
            user-select: none;
            opacity: 0.85;

            @media (max-width: 640px) {
                display: none;
            }
        }

        :global(.lv-qa-kbd) {
            display: inline-block;
            padding: 1px 5px;
            font-size: 11px;
            font-family: var(--lv-font-mono, monospace);
            color: var(--lv-color-text);
            background: color-mix(in srgb, var(--lv-color-text) 8%, var(--lv-color-surface));
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-xs);
            box-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);
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
    .lv-qa-attr-controls {
        display: flex;
        flex-wrap: wrap;
        gap: var(--lv-sp-2);
        margin-top: var(--lv-sp-2);
    }
    .lv-qa-hint-callout {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        margin-top: var(--lv-sp-2);
        padding: 8px 12px;
        border-radius: var(--lv-r-m);
        background: color-mix(in srgb, var(--lv-color-brand) 8%, var(--lv-color-surface));
        border: 1px solid color-mix(in srgb, var(--lv-color-brand) 24%, transparent);
        color: var(--lv-color-text);
        font-size: var(--lv-type-control-size);
        line-height: 1.5;
    }
</style>
