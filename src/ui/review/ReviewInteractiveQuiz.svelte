<script lang="ts">
    import LvIcon from "@/ui/kit/LvIcon.svelte";
    import type { InteractiveQuizData } from "@/core/quiz-interactive";
    import { ensureKatex } from "@/libs/math-render";

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
        // 移动端不自动弹软键盘，避免遮挡题目上下文与视口震荡（WCAG / Apple HIG 可访问性准则）
        const isTouchMobile = typeof window !== "undefined" && (window.innerWidth <= 768 || "ontouchstart" in window || (navigator.maxTouchPoints > 0));
        if (isTouchMobile) return;
        setTimeout(() => {
            try { node.focus(); } catch {}
        }, 50);
    }

    // 2026-11-21 走查修复（bug⑩）：QA 选项/解析为纯文本（生成时数学 span 结构已丢失），
    // 原 {text} 插值使数学卡选项显示原始 TeX（如 y = \pm \frac{b}{c} x）。
    // 方案：检测 TeX 命令 → KaTeX renderToString（throwOnError:false，输出为转义 HTML 无注入面）→ {@html} 呈现；失败回退纯文本。
    const TEX_CMD_RE = /\\[a-zA-Z]+/;
    let renderedOptions = $state<Record<string, string>>({});
    let renderedAnalysis = $state("");

    $effect(() => {
        if (!interactiveQuiz) { renderedOptions = {}; renderedAnalysis = ""; return; }
        const opts = interactiveQuiz.options ?? [];
        const analysis = interactiveQuiz.analysis ?? "";
        const needRender = opts.some((o) => TEX_CMD_RE.test(o.text ?? "")) || TEX_CMD_RE.test(analysis);
        if (!needRender) { renderedOptions = {}; renderedAnalysis = ""; return; }
        let cancelled = false;
        void (async () => {
            const ok = await ensureKatex();
            if (!ok || cancelled) return;
            const katex = (window as any).katex;
            if (!katex || typeof katex.renderToString !== "function") return;
            const next: Record<string, string> = {};
            for (const o of opts) {
                const t = o.text ?? "";
                if (!TEX_CMD_RE.test(t)) continue;
                try {
                    next[o.key] = katex.renderToString(t, { throwOnError: false, output: "html" });
                } catch { /* 单项失败回退纯文本 */ }
            }
            let analysisHtml = "";
            if (TEX_CMD_RE.test(analysis)) {
                try { analysisHtml = katex.renderToString(analysis, { throwOnError: false, output: "html" }); } catch { /* ignore */ }
            }
            if (cancelled) return;
            renderedOptions = next;
            renderedAnalysis = analysisHtml;
        })();
        return () => { cancelled = true; };
    });
</script>

{#if interactiveQuiz}
    <!-- 交互式选择题选项矩阵（点击或按 A/B/C/D 作答） -->
    {#if interactiveQuiz.kind === "choice" && interactiveQuiz.options.length >= 2}
        <div class="lv-interactive-choice-container" role={interactiveQuiz.isMultiple ? "group" : "radiogroup"} aria-label={interactiveQuiz.isMultiple ? "多选题选项列表" : "单选题选项列表"}>
            <div class="lv-interactive-choice-prompt">
                <LvIcon name="check" size={14} />
                <span>
                    {#if interactiveQuiz.isMultiple}
                        多选作答（点击选项）
                    {:else}
                        选择作答（点击选项<span class="lv-quiz-kbd-hint">或敲键盘 A/B/C/D</span>）
                    {/if}
                </span>
                {#if interactiveQuiz.isShuffled}
                    <span class="lv-choice-shuffled-badge" title="选项顺序已随机打乱，打破位置记忆">
                        <LvIcon name="refresh" size={12} />
                        <span>选项已乱序</span>
                    </span>
                {/if}
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
                        {#if renderedOptions[opt.key]}
                            <span class="lv-choice-text-body">{@html renderedOptions[opt.key]}</span>
                        {:else}
                            <span class="lv-choice-text-body">{opt.text}</span>
                        {/if}
                        {#if showAnswer && interactiveQuiz.isShuffled && opt.originalKey && opt.originalKey !== opt.key}
                            <span class="lv-choice-orig-badge" title={`原题中为选项 ${opt.originalKey}`}>原 {opt.originalKey}</span>
                        {/if}
                        <span class="lv-choice-kbd-badge" aria-hidden="true">{opt.key}</span>
                        {#if showAnswer}
                            {#if opt.isAnswer}
                                <span class="lv-choice-result-pill lv-result-correct">
                                    <LvIcon name="check" size={12} />
                                    <span>正确答案{#if interactiveQuiz.isShuffled && opt.originalKey && opt.originalKey !== opt.key}&nbsp;· 原 {opt.originalKey}{/if}</span>
                                </span>
                            {:else if selectedChoiceKeys.includes(opt.key)}
                                <span class="lv-choice-result-pill lv-result-wrong">
                                    <LvIcon name="close" size={12} />
                                    <span>你的选择{#if interactiveQuiz.isShuffled && opt.originalKey && opt.originalKey !== opt.key}&nbsp;· 原 {opt.originalKey}{/if}</span>
                                </span>
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
                <span>判断作答（点击判定<span class="lv-quiz-kbd-hint">或敲键盘 T/F</span>）</span>
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
                    placeholder="在此输入作答..."
                    onkeydown={(e) => { if (e.isComposing || e.keyCode === 229) return; if (e.key === "Enter") onFillCheck(); }}
                />
                <button type="button" class="b3-button lv-btn-primary lv-btn-tool lv-fill-submit-btn" aria-keyshortcuts="Enter" onclick={onFillCheck}>
                    <LvIcon name="check" size={13} /> <span>判定</span>
                </button>
            </div>
        </div>
    {/if}

    <!-- 翻面后参考解析卡片（若存在解析或存在乱序映射提示） -->
    {#if showAnswer && (interactiveQuiz.analysis || (interactiveQuiz.isShuffled && interactiveQuiz.originalAnswerKeys && interactiveQuiz.originalAnswerKeys.length > 0))}
        <div class="lv-interactive-analysis-card">
            <div class="lv-analysis-head">
                <span class="lv-analysis-icon"><LvIcon name="lightbulb" size={16} /></span>
                <strong>参考解析</strong>
                {#if interactiveQuiz.isShuffled && interactiveQuiz.originalAnswerKeys && interactiveQuiz.originalAnswerKeys.length > 0}
                    <span class="lv-choice-mapping-pill" title="选项乱序对照关系">
                        原题 {interactiveQuiz.originalAnswerKeys.join("、")} ➔ 当前 {interactiveQuiz.shuffledAnswerKeys?.join("、") || ""}
                    </span>
                {/if}
            </div>
            {#if interactiveQuiz.analysis}
                {#if renderedAnalysis}
                    <p class="lv-analysis-text">{@html renderedAnalysis}</p>
                {:else}
                    <p class="lv-analysis-text">{interactiveQuiz.analysis}</p>
                {/if}
            {/if}
        </div>
    {/if}
{/if}
