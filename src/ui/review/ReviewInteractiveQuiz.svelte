<script lang="ts">
    import LvIcon from "@/ui/kit/LvIcon.svelte";
    import type { InteractiveQuizData } from "@/core/quiz-interactive";

    let {
        interactiveQuiz = null,
        showAnswer = false,
        selectedChoiceKeys = [],
        userJudgeChoice = null,
        typingInput = "",
        onOptionPick,
        onSubmitChoice,
        onJudgePick,
        onFillCheck,
        onTypingInput,
    }: {
        interactiveQuiz?: InteractiveQuizData | null;
        showAnswer?: boolean;
        selectedChoiceKeys?: string[];
        userJudgeChoice?: boolean | null;
        typingInput?: string;
        onOptionPick: (key: string) => void;
        onSubmitChoice: () => void;
        onJudgePick: (choice: boolean) => void;
        onFillCheck: () => void;
        onTypingInput?: (val: string) => void;
    } = $props();

    function autoFocusInput(node: HTMLElement) {
        setTimeout(() => {
            try { node.focus(); } catch {}
        }, 50);
    }
</script>

{#if interactiveQuiz}
    <!-- 交互式选择题选项矩阵（点击或按 A/B/C/D 作答） -->
    {#if interactiveQuiz.kind === "choice" && interactiveQuiz.options.length >= 2}
        <div class="lv-interactive-choice-container" role={interactiveQuiz.isMultiple ? "group" : "radiogroup"} aria-label={interactiveQuiz.isMultiple ? "多选题选项列表" : "单选题选项列表"}>
            <div class="lv-interactive-choice-prompt">
                <LvIcon name="check" size={14} />
                <span>{interactiveQuiz.isMultiple ? "多选作答（点击选项）" : "选择作答（点击或敲键盘 A/B/C/D）"}</span>
            </div>
            <div class="lv-interactive-choice-grid">
                {#each interactiveQuiz.options as opt (opt.key)}
                    <button
                        type="button"
                        role={interactiveQuiz.isMultiple ? "checkbox" : "radio"}
                        aria-checked={selectedChoiceKeys.includes(opt.key)}
                        aria-keyshortcuts={opt.key}
                        class="lv-interactive-choice-card"
                        class:lv-choice-selected={selectedChoiceKeys.includes(opt.key)}
                        class:lv-choice-correct={showAnswer && opt.isAnswer}
                        class:lv-choice-wrong={showAnswer && selectedChoiceKeys.includes(opt.key) && !opt.isAnswer}
                        disabled={showAnswer}
                        onclick={() => onOptionPick(opt.key)}
                    >
                        <span class="lv-choice-key-badge">{opt.key}</span>
                        <span class="lv-choice-text-body">{opt.text}</span>
                        <span class="lv-choice-kbd-badge" aria-hidden="true">{opt.key}</span>
                        {#if showAnswer}
                            {#if opt.isAnswer}
                                <span class="lv-choice-result-pill lv-result-correct"><LvIcon name="check" size={12} /> <span>正确答案</span></span>
                            {:else if selectedChoiceKeys.includes(opt.key)}
                                <span class="lv-choice-result-pill lv-result-wrong"><LvIcon name="close" size={12} /> <span>你的选择</span></span>
                            {/if}
                        {/if}
                    </button>
                {/each}
            </div>
            {#if interactiveQuiz.isMultiple && !showAnswer}
                <div class="lv-choice-submit-row">
                    <button
                        type="button"
                        class="b3-button lv-btn-primary lv-choice-submit-btn"
                        disabled={selectedChoiceKeys.length === 0}
                        aria-keyshortcuts="Enter"
                        onclick={onSubmitChoice}
                    >
                        <LvIcon name="check" size={14} /> 确认提交多选 ({selectedChoiceKeys.length} 项) · Enter
                    </button>
                </div>
            {/if}
        </div>
    {/if}

    <!-- 交互式判断题按钮组（点击或按 T/F 作答） -->
    {#if interactiveQuiz.kind === "judge"}
        <div class="lv-interactive-judge-container" role="radiogroup" aria-label="判断题正误判定">
            <div class="lv-interactive-choice-prompt">
                <LvIcon name="target" size={14} />
                <span>判断作答（点击判定或敲键盘 T/F）</span>
            </div>
            <div class="lv-interactive-judge-grid">
                <button
                    type="button"
                    role="radio"
                    aria-checked={userJudgeChoice === true}
                    aria-keyshortcuts="t 1"
                    class="lv-interactive-judge-btn lv-judge-btn--true"
                    class:lv-judge-selected={userJudgeChoice === true}
                    class:lv-judge-correct={showAnswer && interactiveQuiz.judgeAnswer === true}
                    class:lv-judge-wrong={showAnswer && userJudgeChoice === true && interactiveQuiz.judgeAnswer === false}
                    disabled={showAnswer}
                    onclick={() => onJudgePick(true)}
                >
                    <span class="lv-judge-circle-icon"><LvIcon name="check" size={18} /></span>
                    <div class="lv-judge-text-wrap">
                        <strong class="lv-judge-main-label">正确 / 对</strong>
                        <small class="lv-judge-sub-label">True</small>
                    </div>
                    <span class="lv-judge-kbd-badge" aria-hidden="true">T / 1</span>
                    {#if showAnswer && interactiveQuiz.judgeAnswer === true}
                        <span class="lv-judge-result-badge lv-result-correct"><LvIcon name="check" size={12} /> <span>正确结论</span></span>
                    {/if}
                </button>
                <button
                    type="button"
                    role="radio"
                    aria-checked={userJudgeChoice === false}
                    aria-keyshortcuts="f 2"
                    class="lv-interactive-judge-btn lv-judge-btn--false"
                    class:lv-judge-selected={userJudgeChoice === false}
                    class:lv-judge-correct={showAnswer && interactiveQuiz.judgeAnswer === false}
                    class:lv-judge-wrong={showAnswer && userJudgeChoice === false && interactiveQuiz.judgeAnswer === true}
                    disabled={showAnswer}
                    onclick={() => onJudgePick(false)}
                >
                    <span class="lv-judge-circle-icon"><LvIcon name="close" size={18} /></span>
                    <div class="lv-judge-text-wrap">
                        <strong class="lv-judge-main-label">错误 / 错</strong>
                        <small class="lv-judge-sub-label">False</small>
                    </div>
                    <span class="lv-judge-kbd-badge" aria-hidden="true">F / 2</span>
                    {#if showAnswer && interactiveQuiz.judgeAnswer === false}
                        <span class="lv-judge-result-badge lv-result-correct"><LvIcon name="check" size={12} /> <span>正确结论</span></span>
                    {/if}
                </button>
            </div>
        </div>
    {/if}

    <!-- 交互式填空即时打字槽 -->
    {#if interactiveQuiz.kind === "fill" && !showAnswer}
        <div class="lv-interactive-fill-container">
            <div class="lv-interactive-fill-inner">
                <span class="lv-fill-icon"><LvIcon name="edit" size={15} /></span>
                <input
                    type="text"
                    class="b3-text-field lv-fill-input"
                    use:autoFocusInput
                    value={typingInput}
                    spellcheck="false"
                    autocomplete="off"
                    oninput={(e) => onTypingInput?.((e.target as HTMLInputElement).value)}
                    placeholder="在此输入你的填空答案，按 Enter 智能判定..."
                    onkeydown={(e) => { if (e.key === "Enter") onFillCheck(); }}
                />
                <button type="button" class="b3-button lv-btn-primary lv-btn-tool lv-fill-submit-btn" aria-keyshortcuts="Enter" onclick={onFillCheck}>
                    <LvIcon name="check" size={13} /> <span>判定 Enter</span>
                </button>
            </div>
        </div>
    {/if}

    <!-- 翻面后参考解析卡片（若存在解析） -->
    {#if showAnswer && interactiveQuiz.analysis}
        <div class="lv-interactive-analysis-card">
            <div class="lv-analysis-head">
                <span class="lv-analysis-icon"><LvIcon name="lightbulb" size={16} /></span>
                <strong>参考解析</strong>
            </div>
            <p class="lv-analysis-text">{interactiveQuiz.analysis}</p>
        </div>
    {/if}
{/if}
