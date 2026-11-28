<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import LvIcon from "./kit/LvIcon.svelte";
    import { showMessage } from "@/libs/notice";
    import { aiChat } from "@/api/ai";
    import type { RiffDeck } from "@/api/riff";
    import { extractSuggestedQuestionFromAiResponse, type AttrQaSubtype } from "@/core/block-attributes";
    import { killSwitchBlock } from "@/core/ai-kill-switch";
    import { budgetState } from "@/core/ai-cost-ledger";
    import { scanSensitive, maskSensitive } from "@/core/ai-sensitive";

    interface Props {
        blockID: string;
        initialQuestion?: string;
        /** 自定义答案（custom-riff-answer / custom-lv-answer）；为空表示回退使用笔记正文作为答案 */
        initialAnswer?: string;
        /** 零标记属性问答子型 */
        initialSubtype?: AttrQaSubtype | null;
        /** 背诵自测型关键词提示（custom-lv-hint） */
        initialHint?: string;
        /** 双面对照型双向复习开关（custom-lv-bidi） */
        initialBidi?: boolean;
        isAlreadyCard?: boolean;
        previewText?: string;
        decks?: RiffDeck[];
        t: any;
        aiSettings: {
            aiMode?: string;
            aiEndpoint?: string;
            aiKey?: string;
            aiModel?: string;
            aiSensitiveTerms?: string;
            killSwitch?: any;
            aiTargets?: string[];
            costLedger?: any;
            aiCostBudgetEnabled?: boolean;
            aiCostMonthlyCap?: number;
        };
        onSave: (payload: { question: string; answer: string; targetDeckID?: string; subtype?: AttrQaSubtype; hint?: string; bidi?: boolean }) => Promise<boolean | void>;
        onClear: () => Promise<boolean | void>;
        onClose: () => void;
    }

    let {
        blockID,
        initialQuestion = "",
        initialAnswer = "",
        initialSubtype = null,
        initialHint = "",
        initialBidi = true,
        isAlreadyCard = false,
        previewText = "",
        decks: initialDecks = [],
        t,
        aiSettings,
        onSave,
        onClear,
        onClose,
    }: Props = $props();

    // 预览翻牌面：front (正面提问) | back (背面答案)
    let previewFace = $state<"front" | "back">("front");
    // 使用指南抽屉展开状态（默认收起，点击随时呼出，不抢占工作区）
    let showGuideDrawer = $state(false);

    // svelte-ignore state_referenced_locally
    let subtype = $state<AttrQaSubtype>(initialSubtype || (initialQuestion ? "recite" : (initialAnswer ? "direct" : "recite")));
    let question = $state("");
    let answer = $state("");
    let hint = $state("");
    // svelte-ignore state_referenced_locally
    let bidiEnabled = $state(initialBidi ?? true);
    let currentDecks = $state<RiffDeck[]>([]);
    let selectedDeckID = $state("");

    $effect(() => {
        if (Array.isArray(initialDecks) && initialDecks.length > 0) {
            currentDecks = initialDecks;
            if (!selectedDeckID) {
                selectedDeckID = initialDecks[0].id;
            }
        }
    });

    let isAiGenerating = $state(false);
    let aiElapsedSec = $state(0);
    let aiAbortCtrl = $state<AbortController | null>(null);
    let isSaving = $state(false);
    let isClearing = $state(false);
    let textareaEl: HTMLTextAreaElement | null = $state(null);
    let answerEl: HTMLTextAreaElement | null = $state(null);

    // 防御性卡组安全数组
    let safeDecks = $derived(Array.isArray(currentDecks) ? currentDecks : []);
    let currentDeckName = $derived.by(() => {
        const found = safeDecks.find(d => d.id === selectedDeckID);
        return found ? found.name : (safeDecks[0]?.name || "小驴闪卡");
    });

    const charCount = $derived(question.trim().length);
    const answerCharCount = $derived(answer.trim().length);
    const hasCustomAnswer = $derived(answerCharCount > 0);
    const isMac = typeof navigator !== "undefined" && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || navigator.platform || "");

    const aiStageText = $derived.by(() => {
        if (aiElapsedSec < 3) return "📖 正在快速阅读与理解笔记素材上下文…";
        if (aiElapsedSec < 8) return "🎯 正在提炼核心知识点与主动回忆记忆锚点…";
        if (aiElapsedSec < 15) return "✍️ 正在组织单步提问与精炼答案要点…";
        return "✨ 正在校验格式排版，马上就来…";
    });

    onMount(() => {
        question = initialQuestion;
        answer = initialAnswer;
        hint = initialHint;
        bidiEnabled = initialBidi ?? true;
        if (initialSubtype) subtype = initialSubtype;
        if (safeDecks.length > 0 && !selectedDeckID) {
            selectedDeckID = safeDecks[0].id;
        }
        if (textareaEl) {
            setTimeout(() => {
                textareaEl?.focus();
                textareaEl?.select();
            }, 60);
        }

        // 后台异步卡包加载完成时动态响应
        const onDecksUpdate = (e: Event) => {
            const detail = (e as CustomEvent)?.detail;
            if (detail?.blockID === blockID && Array.isArray(detail?.decks)) {
                currentDecks = detail.decks;
                if (!selectedDeckID && detail.decks.length > 0) {
                    selectedDeckID = detail.decks[0]?.id || "";
                }
            }
        };
        document.addEventListener("lv-cards:decks-updated", onDecksUpdate);
        return () => {
            document.removeEventListener("lv-cards:decks-updated", onDecksUpdate);
        };
    });

    function togglePreviewFace() {
        previewFace = previewFace === "front" ? "back" : "front";
    }

    let aiSeq = 0;

    function cancelAiSuggest() {
        aiSeq += 1;
        if (aiAbortCtrl) {
            aiAbortCtrl.abort();
            aiAbortCtrl = null;
        }
        isAiGenerating = false;
        aiElapsedSec = 0;
    }

    onDestroy(() => {
        aiSeq += 1;
        if (aiAbortCtrl) {
            aiAbortCtrl.abort();
            aiAbortCtrl = null;
        }
        isAiGenerating = false;
    });

    let aiPreflightOpen = $state(false);
    let aiPreflightMaskSensitive = $state(true);
    let aiPreflightHits = $state<{ id: string; count: number; sample: string }[]>([]);
    let aiPreflightTargetLabel = $state("");

    function parseSensitiveList(): string[] {
        return String(aiSettings.aiSensitiveTerms || "")
            .split(/[,，\n]/)
            .map(s => s.trim())
            .filter(Boolean);
    }

    function requestAiSuggest() {
        const text = (previewText || "").trim();
        if (!text || text === "(空内容块)") {
            showMessage(t?.cardQuestionAiNoContent ?? "当前块无有效文本，无法拟题", 3000, "info");
            return;
        }
        if (aiSettings.killSwitch) {
            const targets = [...(aiSettings.aiTargets ?? []), "task:question-suggest"];
            const killReason = killSwitchBlock(aiSettings.killSwitch, targets);
            if (killReason) {
                const msg = killReason === "consent-revoked"
                    ? (t?.aiKill?.consentRevoked ?? "AI 使用同意已撤销，已阻断外发")
                    : (t?.aiKill?.targetDisabled ?? "当前 AI 配置已紧急停用，已阻断外发");
                showMessage(msg, 3500, "error");
                return;
            }
        }
        if (aiSettings.costLedger && aiSettings.aiCostBudgetEnabled) {
            const b = budgetState(aiSettings.costLedger, {
                enabled: Boolean(aiSettings.aiCostBudgetEnabled),
                monthlyTokenCap: Number(aiSettings.aiCostMonthlyCap || 0),
            });
            if (b.exceeded) {
                showMessage("本月 AI token 预算已达上限，已阻断外发", 3500, "error");
                return;
            }
        }
        const mode = (aiSettings.aiMode as "siyuan" | "custom") || "siyuan";
        if (mode === "custom" && !String(aiSettings.aiEndpoint || "").trim()) {
            showMessage("请先在设置中配置自定义 AI 端点，或切换为思源内置 AI", 3500, "error");
            return;
        }

        aiPreflightHits = scanSensitive(text, parseSensitiveList());
        aiPreflightMaskSensitive = true;
        aiPreflightTargetLabel = mode === "custom"
            ? `自定义端点 (${String(aiSettings.aiEndpoint || "").trim()})`
            : "思源内置 AI";
        aiPreflightOpen = true;
    }

    async function handleAiSuggest() {
        const rawText = (previewText || "").trim();
        if (!rawText || rawText === "(空内容块)") {
            showMessage(t?.cardQuestionAiNoContent ?? "当前块无有效文本，无法拟题", 3000, "info");
            return;
        }

        aiPreflightOpen = false;
        const text = aiPreflightMaskSensitive
            ? maskSensitive(rawText, parseSensitiveList()).masked
            : rawText;

        const seq = ++aiSeq;
        isAiGenerating = true;
        aiElapsedSec = 0;
        const ctrl = new AbortController();
        aiAbortCtrl = ctrl;
        let timer: any = setInterval(() => {
            if (isAiGenerating && seq === aiSeq) aiElapsedSec += 1;
            else clearInterval(timer);
        }, 1000);

        try {
            const prompt = `请为以下学习笔记内容提炼并生成一个最核心、最适合用于主动回忆（Active Recall）与闪卡复习的问题。\n要求：\n1. 只输出问题本身，不要输出任何前缀（如“问题：”或“Q：”）或多余解释；\n2. 语言简练直接，直击核心概念或关键因果；\n3. 长度在 10~50 字之间。\n\n笔记内容：\n${text}`;

            const res = await aiChat(
                {
                    mode: (aiSettings.aiMode as "siyuan" | "custom") || "siyuan",
                    endpoint: aiSettings.aiEndpoint || "",
                    apiKey: aiSettings.aiKey || "",
                    model: aiSettings.aiModel || "",
                },
                "你是一位资深的专业闪卡学习专家与出题大师。",
                prompt,
                { timeoutMs: 25000, signal: ctrl.signal }
            );
            if (seq !== aiSeq || ctrl.signal.aborted) return;

            const extracted = extractSuggestedQuestionFromAiResponse(res);
            if (!extracted.ok) {
                showMessage(extracted.reason || "AI 拟题返回无效内容，请检查 AI 配置", 3500, "error");
                return;
            }
            question = extracted.question;
            textareaEl?.focus();
            showMessage(t?.cardQuestionAiSuccess ?? "AI 已生成推荐问题，右侧实时卡面已同步更新", 2000, "info");
        } catch (err: any) {
            if (seq === aiSeq && !ctrl.signal.aborted) {
                showMessage(err?.message || "AI 拟题失败，请检查 AI 配置", 3000, "error");
            }
        } finally {
            clearInterval(timer);
            if (seq === aiSeq) {
                isAiGenerating = false;
                if (aiAbortCtrl === ctrl) aiAbortCtrl = null;
            }
        }
    }

    async function handleSave() {
        if (isSaving) return;
        isSaving = true;
        try {
            const res = await onSave({
                question: subtype === "direct" ? "" : question.trim(),
                answer: answer.trim(),
                targetDeckID: !isAlreadyCard ? (selectedDeckID || undefined) : undefined,
                subtype,
                hint: subtype === "recite" ? hint.trim() : "",
                bidi: subtype === "dual" ? bidiEnabled : false,
            });
            if (res !== false) {
                onClose();
            }
        } catch (err: any) {
            showMessage(err?.message || "保存失败", 3000, "error");
        } finally {
            isSaving = false;
        }
    }

    async function handleClear() {
        if (isClearing) return;
        isClearing = true;
        try {
            const res = await onClear();
            if (res !== false) {
                onClose();
            }
        } catch (err: any) {
            showMessage(err?.message || "清除失败", 3000, "error");
        } finally {
            isClearing = false;
        }
    }

    function copyTextToAnswer() {
        const text = (previewText || "").trim();
        if (text && text !== "(空内容块)") {
            answer = text;
            answerEl?.focus();
            showMessage("已将笔记正文填入自定义答案，可直接编辑精炼", 2000, "info");
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.isComposing || e.keyCode === 229) return;
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            void handleSave();
        } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        }
    }

    function handleDialogKeydown(e: KeyboardEvent) {
        if (e.isComposing || e.keyCode === 229) return;
        const isInputField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            void handleSave();
        } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        } else if (e.code === "Space" && !isInputField) {
            e.preventDefault();
            togglePreviewFace();
        }
    }
</script>

<div
    class="lv-qa-dialog-modal b3-typography"
    data-prevent-swipe="true"
    data-block-id={blockID}
    tabindex="-1"
    onkeydown={handleDialogKeydown}
    role="dialog"
    aria-label="设置属性问答卡工作台"
>
    <!-- ───────────────────────────────────────────────────────────── -->
    <!-- 顶部状态条：状态、卡包 Chip、零污染标识、指南快捷入口            -->
    <!-- ───────────────────────────────────────────────────────────── -->
    <header class="lv-qa-top-header">
        <div class="lv-qa-meta-strip">
            <div class="lv-qa-meta-left">
                <span class="lv-qa-status-pill" class:is-card={isAlreadyCard}>
                    <LvIcon name={isAlreadyCard ? "check" : "cards"} size={12} />
                    <span>{isAlreadyCard ? "已在闪卡组" : "免侵入属性问答"}</span>
                </span>
                <span class="lv-qa-deck-chip" title="归属卡组：{currentDeckName}">
                    <LvIcon name="cards" size={11} />
                    <span>{currentDeckName}</span>
                </span>
                <span class="lv-qa-status-desc">
                    {isAlreadyCard ? "修改即时同步正面题干与卡组" : "零侵入正文 Markdown，笔记保持 100% 纯净"}
                </span>
            </div>
            <div class="lv-qa-meta-right">
                <div class="lv-qa-kbd-shortcuts" title="常用快捷键">
                    <span class="lv-qa-kbd-pill"><kbd>Space</kbd> 翻面</span>
                    <span class="lv-qa-kbd-pill"><kbd>{isMac ? "⌘" : "Ctrl"}+Enter</kbd> 保存</span>
                </div>
                <button
                    type="button"
                    class="lv-qa-guide-toggle-btn"
                    class:is-active={showGuideDrawer}
                    onclick={() => { showGuideDrawer = !showGuideDrawer; }}
                    title="展开/收起免侵入问答使用指南与快捷键"
                >
                    <LvIcon name="lightbulb" size={12} />
                    <span>使用指南</span>
                </button>
                <span class="lv-qa-zero-pollute-tag">🌿 零正文污染</span>
            </div>
        </div>

        <!-- 使用指南展开抽屉（支持一键展开/折叠，不霸占主编辑与预览工作台） -->
        {#if showGuideDrawer}
            <aside class="lv-qa-guide-drawer" role="region" aria-label="使用指南">
                <div class="lv-guide-drawer-header">
                    <span class="lv-guide-drawer-title">💡 免侵入属性问答工作流与快捷键</span>
                    <button type="button" class="lv-guide-drawer-close" onclick={() => { showGuideDrawer = false; }}>✕</button>
                </div>
                <div class="lv-guide-grid">
                    <div class="lv-guide-item">
                        <strong>1. 零正文污染，笔记原貌 100% 纯净</strong>
                        <p>提问写入 <code>custom-riff-title</code>，自定义答案写入 <code>custom-riff-answer</code>，绝不破坏正文大纲与引用。</p>
                    </div>
                    <div class="lv-guide-item">
                        <strong>2. 正面主动提取，激发神经联结</strong>
                        <p>复习时正面仅出题不剧透正文，强迫大脑主动提取信息，显著巩固长期记忆。</p>
                    </div>
                    <div class="lv-guide-item">
                        <strong>3. 双轨答案机制：简便模式 vs 精炼模式</strong>
                        <p>留空答案直接以整段笔记为答案；输入要点则优先展示要点，原文附后备查。</p>
                    </div>
                    <div class="lv-guide-item">
                        <strong>4. 极致快捷操作</strong>
                        <p><kbd>{isMac ? "⌘" : "Ctrl"}+Enter</kbd> 快速保存；<kbd>Space</kbd> 翻转卡面；<kbd>Alt+Q</kbd> 极速唤起。</p>
                    </div>
                </div>
            </aside>
        {/if}
    </header>

    <!-- ───────────────────────────────────────────────────────────── -->
    <!-- 核心工作区：双栏一体化响应式工作台（同屏编辑 + 实时卡面预览）   -->
    <!-- ───────────────────────────────────────────────────────────── -->
    <main class="lv-qa-studio-grid">
        <!-- ═══════════════════════════════════════════════════════════ -->
        <!-- 左栏：问答设置编辑器面板（Editor Pane）                     -->
        <!-- ═══════════════════════════════════════════════════════════ -->
        <div class="lv-qa-editor-pane" role="region" aria-label="问答设置">
            <!-- 区域 0：零标记属性问答 3 子型选择 -->
            <section class="lv-qa-card lv-qa-subtype-section" aria-label="属性问答子型">
                <div class="lv-qa-subtype-row" role="group" aria-label="属性问答子型">
                    <button
                        type="button"
                        class="lv-qa-subtype-pill"
                        class:is-active={subtype === "direct"}
                        aria-pressed={subtype === "direct"}
                        onclick={() => { subtype = "direct"; }}
                        title="正面=块正文题干，背面=答案属性 (custom-lv-answer)"
                    >
                        <strong>直接问答型</strong>
                        <span>正文题干 → 属性答案</span>
                    </button>
                    <button
                        type="button"
                        class="lv-qa-subtype-pill"
                        class:is-active={subtype === "recite"}
                        aria-pressed={subtype === "recite"}
                        onclick={() => { subtype = "recite"; }}
                        title="正面=标题/关键词提示，背面=完整块正文或要点对照"
                    >
                        <strong>背诵自测型</strong>
                        <span>标题/提示 → 完整背诵</span>
                    </button>
                    <button
                        type="button"
                        class="lv-qa-subtype-pill"
                        class:is-active={subtype === "dual"}
                        aria-pressed={subtype === "dual"}
                        onclick={() => { subtype = "dual"; }}
                        title="正面=概念/术语/外语，背面=释义/例句/译文（支持双向）"
                    >
                        <strong>双面对照型</strong>
                        <span>概念 ↔ 释义/译文</span>
                    </button>
                </div>
            </section>

            <!-- 区域 1：笔记正文素材来源 -->
            <section class="lv-qa-card lv-qa-answer-section" class:is-demoted={subtype !== "direct" && hasCustomAnswer} aria-label="笔记正文答案">
                <div class="lv-qa-card-header">
                    <span class="lv-qa-card-title">
                        <LvIcon name="book" size={13} />
                        <span>{subtype === "direct" ? "笔记正文 (正面题干)" : (hasCustomAnswer ? "笔记正文 (已自定义答案，原文仍附卡面备查)" : "笔记正文 (闪卡背面默认答案)")}</span>
                    </span>
                    <div class="lv-qa-card-header-actions">
                        {#if subtype !== "direct" && (previewText || "").trim() && previewText !== "(空内容块)"}
                            <button
                                type="button"
                                class="lv-qa-text-action-btn"
                                onclick={copyTextToAnswer}
                                title="快速将笔记正文填入下方自定义答案框，以便在此基础上精炼编辑"
                            >
                                📋 填入答案精炼
                            </button>
                        {/if}
                        <span class="lv-qa-len-badge">{(previewText || "").length} 字</span>
                    </div>
                </div>
                <div class="lv-qa-answer-content">
                    {previewText || "(空内容块)"}
                </div>
            </section>

            <!-- 区域 2：背诵提问输入（正面题干，直接问答型以块正文为正面故隐藏） -->
            {#if subtype !== "direct"}
            <section class="lv-qa-card lv-qa-prompt-section" aria-label="背诵提问题干">
                <div class="lv-qa-card-header">
                    <span class="lv-qa-card-title lv-qa-card-title--prompt">
                        <LvIcon name="question" size={14} />
                        <span>{subtype === "dual" ? "正面概念 / 术语 / 外语表达" : "背诵提问 (正面主动回忆)"}</span>
                    </span>
                    <button
                        type="button"
                        class="lv-qa-ai-btn"
                        disabled={isAiGenerating}
                        onclick={requestAiSuggest}
                        title="根据正文智能生成最适合主动回忆的核心提问"
                        aria-label="根据正文智能生成最适合主动回忆的核心提问"
                    >
                        {#if isAiGenerating}
                            <span class="lv-ai-spin" aria-hidden="true"></span>
                            <span>AI 拟题中…</span>
                        {:else}
                            <LvIcon name="lightbulb" size={13} />
                            <span>✨ AI 拟题</span>
                        {/if}
                    </button>
                </div>

                <div class="lv-qa-textarea-wrap">
                    {#if aiPreflightOpen}
                        <div class="lv-qa-preflight" role="region" aria-label="确认本次 AI 拟题外发" style="padding: 10px 12px; border-radius: 10px; border: 1px solid var(--lv-primary-border, rgba(99,102,241,0.3)); background: var(--lv-primary-soft, rgba(99,102,241,0.06)); margin-bottom: 8px; display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
                            <div style="font-weight: 600;">确认发送当前笔记片段至 AI 拟题</div>
                            <div style="color: var(--lv-color-text-muted, #64748b);">
                                目标：{aiPreflightTargetLabel} · 正文 {(previewText || "").trim().length} 字
                            </div>
                            {#if aiPreflightHits.length > 0}
                                <div style="color: var(--lv-color-warning, #b45309);">
                                    检测到 {aiPreflightHits.length} 类潜在敏感词（如 {aiPreflightHits[0].sample}），建议开启脱敏发送
                                </div>
                            {/if}
                            <label style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
                                <input type="checkbox" bind:checked={aiPreflightMaskSensitive} />
                                <span>发送前自动脱敏敏感内容</span>
                            </label>
                            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 2px;">
                                <button type="button" class="b3-button b3-button--small b3-button--cancel" onclick={() => { aiPreflightOpen = false; }}>取消</button>
                                <button type="button" class="b3-button b3-button--small lv-btn-primary" onclick={handleAiSuggest}>确认外发生成</button>
                            </div>
                        </div>
                    {/if}
                    {#if isAiGenerating}
                        <div class="lv-ai-thinking" role="status" aria-live="polite">
                            <div class="lv-ai-thinking__glow">
                                <span class="lv-ai-thinking__icon">🦉</span>
                            </div>
                            <div class="lv-ai-thinking__stage">{aiStageText}</div>
                            <div class="lv-ai-thinking__timer">已思考 <b>{aiElapsedSec}</b> 秒</div>
                            <div class="lv-ai-thinking__progress"><div class="lv-ai-thinking__bar"></div></div>
                            <button type="button" class="b3-button b3-button--cancel lv-ai-thinking__cancel" onclick={cancelAiSuggest}>
                                取消拟题
                            </button>
                        </div>
                    {:else}
                        <textarea
                            bind:this={textareaEl}
                            bind:value={question}
                            onkeydown={handleKeydown}
                            class="b3-text-field lv-qa-textarea"
                            rows="3"
                            placeholder={subtype === "dual" ? "输入概念、术语或外语表达..." : (t?.cardQuestionInputPlaceholder ?? "输入向自己提问的问题 (按 Ctrl+Enter 快速保存)...")}
                            aria-label="背诵提问内容"
                        ></textarea>

                        <div class="lv-qa-textarea-subbar">
                            <div class="lv-qa-kbd-hint">
                                <kbd>{isMac ? "⌘" : "Ctrl"}</kbd> + <kbd>Enter</kbd>
                                <span>快速保存</span>
                            </div>
                            <div class="lv-qa-char-pill" class:is-warn={charCount > 60}>
                                {charCount} 字
                            </div>
                        </div>
                    {/if}
                </div>
                {#if subtype === "recite"}
                    <div class="lv-qa-hint-field">
                        <input
                            type="text"
                            bind:value={hint}
                            onkeydown={handleKeydown}
                            class="b3-text-field lv-qa-hint-input"
                            placeholder="可选：关键词提示（复习时可先点击展开提示再自评）"
                            aria-label="关键词提示"
                        />
                    </div>
                {/if}
            </section>
            {/if}

            <!-- 区域 3：答案输入（直接问答型为主答案；背诵/双面型为可选精炼答案/释义） -->
            <section class="lv-qa-card lv-qa-answer-input-section" aria-label="自定义答案">
                <div class="lv-qa-card-header">
                    <span class="lv-qa-card-title lv-qa-card-title--answer">
                        <LvIcon name="message" size={13} />
                        <span>{subtype === "direct" ? "答案内容（写入 custom-lv-answer 属性）" : subtype === "dual" ? "背面释义 / 例句 / 译文（可选，留空用正文）" : "自定义答案 (背面主动回忆 · 可选)"}</span>
                    </span>
                    {#if hasCustomAnswer}
                        <button
                            type="button"
                            class="lv-qa-answer-reset-btn"
                            onclick={() => { answer = ""; answerEl?.focus(); }}
                            title="清空自定义答案，恢复直接使用整段笔记正文作为答案"
                            aria-label="恢复正文答案"
                        >
                            恢复正文答案
                        </button>
                    {/if}
                </div>

                <div class="lv-qa-textarea-wrap">
                    <textarea
                        bind:this={answerEl}
                        bind:value={answer}
                        onkeydown={handleKeydown}
                        class="b3-text-field lv-qa-textarea lv-qa-textarea--answer"
                        rows="3"
                        placeholder={subtype === "direct" ? "输入该题干对应的标准答案（将存于 custom-lv-answer 块属性，不污染正文）..." : "可选：输入标准答案要点 (留空则复习翻牌时直接展示上方笔记正文)..."}
                        aria-label="自定义答案内容"
                    ></textarea>

                    <div class="lv-qa-textarea-subbar">
                        <div class="lv-qa-answer-mode-hint" class:is-custom={hasCustomAnswer}>
                            {subtype === "direct"
                                ? (hasCustomAnswer ? `正面展示正文题干，背面展示此属性答案 (${answerCharCount} 字)` : "请填写直接问答型的背面答案")
                                : hasCustomAnswer
                                ? `复习背面将优先展示此答案，笔记原文附后备查 (${answerCharCount} 字)`
                                : "复习背面将直接展示笔记正文"}
                        </div>
                        <div class="lv-qa-char-pill" class:is-warn={answerCharCount > 120}>
                            {answerCharCount} 字
                        </div>
                    </div>
                </div>
                {#if subtype === "dual"}
                    <label class="lv-qa-bidi-check">
                        <input type="checkbox" class="lv-check" bind:checked={bidiEnabled} />
                        <span>启用正反双向复习（支持按 R 键或卡面切换正反方向）</span>
                    </label>
                {/if}
            </section>

            <!-- 区域 4：卡组调度与归属管理 -->
            <section class="lv-qa-card lv-qa-deck-section" aria-label="卡组归属">
                <div class="lv-qa-deck-row">
                    <span class="lv-qa-deck-label">
                        <LvIcon name="cards" size={13} />
                        <span>{isAlreadyCard ? "当前归属卡组" : "同步制卡加入卡组"}</span>
                    </span>
                    <select bind:value={selectedDeckID} class="b3-select lv-qa-deck-select" aria-label="选择同步加入或调整的卡组">
                        {#if safeDecks.length === 0}
                            <option value="">默认卡组（自动创建「小驴闪卡」）</option>
                        {:else}
                            {#each safeDecks as deck}
                                <option value={deck.id}>{deck.name} ({deck.size || 0} 张)</option>
                            {/each}
                        {/if}
                    </select>
                </div>
            </section>
        </div>

        <!-- ═══════════════════════════════════════════════════════════ -->
        <!-- 右栏：实时卡面所见即所得渲染区（Preview Pane · WYSIWYG）    -->
        <!-- ═══════════════════════════════════════════════════════════ -->
        <div class="lv-qa-preview-pane" role="region" aria-label="卡面实时预览">
            <!-- 预览控制栏：正反面切换、翻转快捷键 -->
            <div class="lv-qa-preview-toolbar">
                <div class="lv-qa-preview-title">
                    <LvIcon name="eye" size={13} />
                    <span>实时卡面预览</span>
                    {#if hasCustomAnswer}
                        <span class="lv-qa-dual-badge">双轨答案</span>
                    {/if}
                </div>

                <div class="lv-qa-preview-controls">
                    <div class="lv-qa-preview-segmented" role="tablist" aria-label="正反面切换">
                        <button
                            type="button"
                            role="tab"
                            class="lv-qa-seg-btn"
                            class:is-active={previewFace === "front"}
                            aria-selected={previewFace === "front"}
                            onclick={() => { previewFace = "front"; }}
                        >
                            🎴 正面 (提问回忆)
                        </button>
                        <button
                            type="button"
                            role="tab"
                            class="lv-qa-seg-btn"
                            class:is-active={previewFace === "back"}
                            aria-selected={previewFace === "back"}
                            onclick={() => { previewFace = "back"; }}
                        >
                            🎴 背面 (参考答案)
                            {#if hasCustomAnswer}
                                <span class="lv-qa-seg-dot" title="包含自定义要点"></span>
                            {/if}
                        </button>
                    </div>

                    <button
                        type="button"
                        class="lv-qa-flip-btn"
                        onclick={togglePreviewFace}
                        title="翻转卡面查看另一侧效果（或按空格键）"
                    >
                        <LvIcon name="refresh" size={12} />
                        <span>翻转卡面 ⤾</span>
                    </button>
                </div>
            </div>

            <!-- 卡片实体模拟容器 -->
            <button
                type="button"
                class="lv-qa-card-mockup"
                class:is-front={previewFace === "front"}
                class:is-back={previewFace === "back"}
                aria-label="闪卡卡面模拟预览（点击或按空格键翻转卡面）"
                onclick={togglePreviewFace}
                onkeydown={(e) => { if (e.code === "Space") { e.preventDefault(); togglePreviewFace(); } }}
            >
                <!-- 卡片顶部信息条 -->
                <div class="lv-mockup-header">
                    <div class="lv-mockup-tags">
                        <span class="lv-mockup-tag lv-mockup-tag--type">✦ {subtype === "direct" ? "直接问答" : subtype === "dual" ? "双面对照" : "属性问答卡"}</span>
                        <span class="lv-mockup-tag lv-mockup-tag--deck">{currentDeckName}</span>
                    </div>
                    <span class="lv-mockup-face-indicator">
                        {previewFace === "front" ? "【正面 · 题面】" : "【背面 · 答案】"}
                    </span>
                </div>

                <!-- 卡片正文区 -->
                <div class="lv-mockup-body">
                    {#if previewFace === "front"}
                        <div class="lv-mockup-front">
                            <div class="lv-mockup-q-badge">{subtype === "direct" ? "📄 正文题干" : subtype === "dual" ? "⇄ 正面概念" : "💡 提问"}</div>
                            <div class="lv-mockup-q-text" class:is-empty={subtype !== "direct" && !question.trim()}>
                                {#if subtype === "direct"}
                                    {previewText || "(空内容块)"}
                                {:else}
                                    {question.trim() || "（尚未输入提问内容，请在左侧填写或点击 AI 拟题…）"}
                                {/if}
                            </div>
                            {#if subtype === "recite" && hint.trim()}
                                <div class="ft__smaller" style="margin-top: 6px; color: var(--lv-color-brand);">💡 可展开提示：{hint.trim()}</div>
                            {/if}
                            <div class="lv-mockup-cue-strip">
                                <span>{subtype === "direct" ? "🎯 正面展示块正文题干，答案存属性不剧透" : subtype === "dual" ? "🎯 支持概念 ↔ 释义正反双向复习" : "🎯 复习时正面仅展示此提问，强迫主动回忆，绝不剧透正文"}</span>
                            </div>
                        </div>
                    {:else}
                        <div class="lv-mockup-back">
                            {#if subtype === "direct"}
                                <div class="lv-mockup-single-answer">
                                    <div class="lv-mockup-badge-row">
                                        <span class="lv-mockup-ans-badge lv-mockup-ans-badge--custom">🌿 参考答案 (custom-lv-answer)</span>
                                    </div>
                                    <div class="lv-mockup-ans-text">
                                        {answer.trim() || "（尚未输入属性答案…）"}
                                    </div>
                                </div>
                            {:else if hasCustomAnswer}
                                <!-- 双轨答案展示：自定义答案优先 + 笔记原文备查 -->
                                <div class="lv-mockup-custom-answer">
                                    <div class="lv-mockup-badge-row">
                                        <span class="lv-mockup-ans-badge lv-mockup-ans-badge--custom">🌿 参考答案 (自定义要点)</span>
                                    </div>
                                    <div class="lv-mockup-ans-text">
                                        {answer.trim()}
                                    </div>
                                </div>

                                <div class="lv-mockup-divider">
                                    <span>笔记原文备查</span>
                                </div>

                                <div class="lv-mockup-original-note">
                                    <div class="lv-mockup-badge-row">
                                        <span class="lv-mockup-ans-badge lv-mockup-ans-badge--note">📖 笔记原文</span>
                                    </div>
                                    <div class="lv-mockup-note-text">
                                        {previewText || "(空内容块)"}
                                    </div>
                                </div>
                            {:else}
                                <!-- 单轨正文展示：直接展示笔记正文 -->
                                <div class="lv-mockup-single-answer">
                                    <div class="lv-mockup-badge-row">
                                        <span class="lv-mockup-ans-badge lv-mockup-ans-badge--default">📖 参考答案 (笔记正文)</span>
                                    </div>
                                    <div class="lv-mockup-ans-text">
                                        {previewText || "(空内容块)"}
                                    </div>
                                    <div class="lv-mockup-cue-strip">
                                        <span>未设置自定义答案时，复习背面将直接呈现整段笔记正文</span>
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>

                <!-- 卡片底部翻转指引 -->
                <footer class="lv-mockup-footer">
                    <span>点击卡面或按空格键翻转 ⤾</span>
                </footer>
            </button>

            <!-- 底部所见即所得动态提示 -->
            <div class="lv-qa-preview-hint">
                <span class="lv-qa-preview-hint__dot"></span>
                <span>左侧修改任意内容即时联动渲染 · 所见即所得</span>
            </div>
        </div>
    </main>

    <!-- ───────────────────────────────────────────────────────────── -->
    <!-- 底部按钮栏                                                    -->
    <!-- ───────────────────────────────────────────────────────────── -->
    <footer class="lv-qa-footer">
        {#if initialQuestion || isAlreadyCard}
            <button
                type="button"
                class="b3-button b3-button--cancel lv-qa-btn-clear"
                disabled={isClearing}
                onclick={handleClear}
                title="清空并解除该块的属性问答设置"
                aria-label="清空问题"
            >
                <LvIcon name="trash" size={13} />
                <span>{isClearing ? "清空中…" : "清空问题"}</span>
            </button>
        {/if}

        <div class="lv-qa-footer-actions">
            <button
                type="button"
                class="b3-button b3-button--cancel lv-qa-btn-cancel"
                onclick={onClose}
                title="取消 (Esc)"
                aria-label="取消"
            >
                {t?.cancel ?? "取消"}
            </button>

            <button
                type="button"
                class="b3-button lv-btn-primary lv-qa-btn-save"
                disabled={isSaving}
                onclick={handleSave}
                title={isMac ? "保存闪卡问题 (⌘+Enter)" : "保存闪卡问题 (Ctrl+Enter)"}
                aria-label="保存闪卡问题"
            >
                {#if isSaving}
                    <span>保存中…</span>
                {:else}
                    <LvIcon name="check" size={14} />
                    <span>保存闪卡问题</span>
                {/if}
            </button>
        </div>
    </footer>
</div>

<style lang="scss">
    .lv-qa-dialog-modal {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 4px 6px;
        box-sizing: border-box;
        width: 100%;
        color: var(--b3-theme-on-surface);
        font-family: var(--b3-font-family);
    }

    .lv-qa-top-header {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .lv-qa-subtype-row {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
    }
    .lv-qa-subtype-pill {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        padding: 7px 10px;
        border-radius: var(--lv-r-m, 8px);
        border: 1px solid var(--lv-border, var(--b3-border-color));
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        cursor: pointer;
        text-align: left;
        font-size: 11px;
        strong { font-size: 12.5px; font-weight: 600; }
        span { opacity: 0.72; }
        &.is-active {
            border-color: var(--b3-theme-primary);
            background: color-mix(in srgb, var(--b3-theme-primary) 10%, var(--b3-theme-surface));
            color: var(--b3-theme-primary);
        }
    }
    .lv-qa-hint-field { margin-top: 8px; }
    .lv-qa-hint-input { width: 100%; box-sizing: border-box; font-size: 12.5px; }
    .lv-qa-bidi-check {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.85;
        cursor: pointer;
    }

    // 顶部状态横幅
    .lv-qa-meta-strip {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 6px 10px;
        padding: 6px 12px;
        border-radius: var(--lv-r-m, 8px);
        background: color-mix(in srgb, var(--b3-theme-surface) 95%, transparent);
        border: 1px solid var(--lv-border, var(--b3-border-color));
        box-shadow: var(--lv-inset-shine, inset 0 1px 0 rgba(255, 255, 255, 0.08));
    }

    .lv-qa-meta-left {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px 8px;
        min-width: 0;
        flex: 1 1 220px;
    }

    .lv-qa-meta-right {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px 8px;
        flex: 0 1 auto;
        max-width: 100%;
    }

    .lv-qa-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 2.5px 9px;
        border-radius: 999px;
        font-size: 11.5px;
        font-weight: 600;
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
        color: var(--b3-theme-primary);
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 28%, transparent);
        flex-shrink: 0;

        &.is-card {
            background: color-mix(in srgb, var(--b3-theme-success, #10b981) 12%, transparent);
            color: var(--b3-theme-success, #10b981);
            border-color: color-mix(in srgb, var(--b3-theme-success, #10b981) 28%, transparent);
        }
    }

    .lv-qa-deck-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        background: color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent);
        color: var(--b3-theme-on-surface);
        opacity: 0.85;
        flex-shrink: 0;
    }

    .lv-qa-status-desc {
        font-size: 11.5px;
        color: var(--b3-theme-on-surface);
        opacity: 0.68;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .lv-qa-kbd-shortcuts {
        display: inline-flex;
        align-items: center;
        gap: 6px;

        @media (max-width: 600px) {
            display: none;
        }

        .lv-qa-kbd-pill {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            font-size: 10.5px;
            color: var(--b3-theme-on-surface);
            opacity: 0.62;

            kbd {
                padding: 1px 5px;
                border-radius: 4px;
                background: color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent);
                border: 1px solid color-mix(in srgb, var(--b3-theme-on-surface) 15%, transparent);
                font-family: var(--b3-font-family-code, monospace);
                font-size: 10px;
                font-weight: 600;
            }
        }
    }

    .lv-qa-guide-toggle-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: 6px;
        border: 1px solid color-mix(in srgb, var(--b3-theme-on-surface) 15%, transparent);
        background: transparent;
        color: var(--b3-theme-on-surface);
        font-size: 11px;
        opacity: 0.75;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover, &.is-active {
            opacity: 1;
            background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
            border-color: var(--b3-theme-primary);
            color: var(--b3-theme-primary);
        }
    }

    .lv-qa-zero-pollute-tag {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 4px;
        background: color-mix(in srgb, var(--b3-theme-success, #10b981) 10%, transparent);
        color: var(--b3-theme-success, #10b981);
        border: 1px solid color-mix(in srgb, var(--b3-theme-success, #10b981) 22%, transparent);
        font-weight: 500;
        flex-shrink: 0;
    }

    // 指南展开抽屉
    .lv-qa-guide-drawer {
        padding: 12px 14px;
        border-radius: var(--lv-r-m, 8px);
        background: color-mix(in srgb, var(--b3-theme-background) 80%, var(--b3-theme-surface));
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 25%, var(--b3-border-color));
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        animation: lv-slide-down 0.2s ease-out;

        .lv-guide-drawer-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 12px;
            font-weight: 600;
            color: var(--b3-theme-primary);

            .lv-guide-drawer-close {
                border: none;
                background: transparent;
                cursor: pointer;
                font-size: 12px;
                opacity: 0.6;
                padding: 2px 6px;
                &:hover { opacity: 1; }
            }
        }

        .lv-guide-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 10px;

            .lv-guide-item {
                font-size: 11.5px;
                line-height: 1.5;

                strong {
                    display: block;
                    margin-bottom: 2px;
                    color: var(--b3-theme-on-surface);
                }

                p {
                    margin: 0;
                    opacity: 0.72;
                }

                code, kbd {
                    padding: 1px 4px;
                    border-radius: 3px;
                    background: color-mix(in srgb, var(--b3-theme-on-surface) 10%, transparent);
                    font-size: 10.5px;
                }
            }
        }
    }

    @keyframes lv-slide-down {
        from { opacity: 0; transform: translateY(-6px); }
        to { opacity: 1; transform: translateY(0); }
    }

    // ─────────────────────────────────────────────────────────────
    // 双栏一体化 Studio 布局（左侧编辑 + 右侧即时预览）
    // ─────────────────────────────────────────────────────────────
    .lv-qa-studio-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
        gap: 14px;
        align-items: stretch;

        @media (max-width: 780px) {
            grid-template-columns: 1fr;
            gap: 12px;
        }
    }

    // 左栏编辑区
    .lv-qa-editor-pane {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
    }

    // 通用卡片容器
    .lv-qa-card {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px 12px;
        border-radius: var(--lv-r-m, 8px);
        background: var(--b3-theme-surface);
        border: 1px solid var(--lv-border, var(--b3-border-color));
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02), var(--lv-inset-shine, inset 0 1px 0 rgba(255, 255, 255, 0.06));
    }

    .lv-qa-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .lv-qa-card-header-actions {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }

    .lv-qa-text-action-btn {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 1.5px 7px;
        border-radius: 4px;
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 30%, transparent);
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, transparent);
        color: var(--b3-theme-primary);
        font-size: 10.5px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
            background: color-mix(in srgb, var(--b3-theme-primary) 18%, transparent);
            border-color: var(--b3-theme-primary);
        }
    }

    .lv-qa-card-title {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12.5px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        opacity: 0.88;

        &--prompt {
            color: var(--b3-theme-primary);
            opacity: 1;
        }

        &--answer {
            color: var(--b3-theme-success, var(--lv-color-success, #10b981));
            opacity: 1;
        }
    }

    .lv-qa-len-badge {
        font-size: 11px;
        padding: 1px 6px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent);
        color: var(--b3-theme-on-surface);
        opacity: 0.65;
        font-variant-numeric: tabular-nums;
    }

    // 笔记正文展示
    .lv-qa-answer-section {
        border-left: 3px solid color-mix(in srgb, var(--b3-theme-primary) 65%, transparent);

        &.is-demoted {
            opacity: 0.78;
        }
    }

    .lv-qa-answer-content {
        max-height: 88px;
        overflow-y: auto;
        font-size: 12.5px;
        line-height: 1.6;
        padding: 6px 8px;
        border-radius: 6px;
        background: color-mix(in srgb, var(--b3-theme-background) 60%, var(--b3-theme-surface));
        border: 1px solid color-mix(in srgb, var(--b3-border-color) 60%, transparent);
        color: var(--b3-theme-on-surface);
        opacity: 0.85;
        word-break: break-all;
        white-space: pre-wrap;
        user-select: text;
    }

    // AI 拟题按钮
    .lv-qa-ai-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 26px;
        padding: 0 11px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, var(--b3-theme-surface));
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 32%, transparent);
        color: var(--b3-theme-primary);
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
        touch-action: manipulation;
        transition: transform 0.12s ease, background 0.15s ease, box-shadow 0.15s ease;

        &:hover:not(:disabled) {
            background: color-mix(in srgb, var(--b3-theme-primary) 22%, var(--b3-theme-surface));
            transform: translateY(-1px);
            box-shadow: 0 2px 8px color-mix(in srgb, var(--b3-theme-primary) 25%, transparent);
        }

        &:active:not(:disabled) {
            transform: scale(0.97);
        }

        &:disabled {
            opacity: 0.55;
            cursor: not-allowed;
        }

        .lv-ai-spin {
            width: 11px;
            height: 11px;
            border: 2px solid currentColor;
            border-top-color: transparent;
            border-radius: 50%;
            animation: lv-spin 0.8s linear infinite;
        }
    }

    @keyframes lv-spin {
        to { transform: rotate(360deg); }
    }

    // 提问与答案文本框
    .lv-qa-textarea-wrap {
        display: flex;
        flex-direction: column;

        .lv-qa-textarea {
            width: 100%;
            min-height: 72px;
            padding: 8px 10px;
            border-radius: var(--lv-r-m, 8px);
            border: 1px solid var(--b3-border-color);
            background: var(--b3-theme-background);
            color: var(--b3-theme-on-surface);
            font-size: 13px;
            line-height: 1.55;
            resize: vertical;
            box-sizing: border-box;
            transition: border-color 0.2s ease, box-shadow 0.2s ease;

            &:focus {
                border-color: var(--b3-theme-primary);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--b3-theme-primary) 18%, transparent);
            }

            &--answer {
                border-color: color-mix(in srgb, var(--b3-theme-success, #10b981) 35%, var(--b3-border-color)) !important;

                &:focus {
                    border-color: var(--b3-theme-success, #10b981) !important;
                    box-shadow: 0 0 0 3px color-mix(in srgb, var(--b3-theme-success, #10b981) 16%, transparent) !important;
                }
            }
        }

        .lv-qa-textarea-subbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 5px;
            font-size: 11px;
            opacity: 0.65;
        }

        .lv-qa-kbd-hint {
            display: inline-flex;
            align-items: center;
            gap: 4px;

            kbd {
                padding: 1px 5px;
                border-radius: 4px;
                background: color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent);
                border: 1px solid color-mix(in srgb, var(--b3-theme-on-surface) 15%, transparent);
                font-family: var(--b3-font-family-code, monospace);
                font-size: 10px;
                font-weight: 600;
            }
        }

        .lv-qa-char-pill {
            font-variant-numeric: tabular-nums;

            &.is-warn {
                color: var(--b3-theme-warning, var(--lv-color-warning, #f59e0b));
                font-weight: 600;
            }
        }

        .lv-qa-answer-mode-hint {
            transition: color 0.2s ease;

            &.is-custom {
                color: var(--b3-theme-success, #10b981);
                opacity: 0.9;
                font-weight: 500;
            }
        }
    }

    .lv-qa-answer-reset-btn {
        padding: 2px 9px;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--b3-theme-on-surface) 18%, transparent);
        background: transparent;
        color: var(--b3-theme-on-surface);
        font-size: 10.5px;
        opacity: 0.72;
        cursor: pointer;
        flex-shrink: 0;
        transition: opacity 0.15s ease, border-color 0.15s ease;

        &:hover {
            opacity: 1;
            border-color: var(--b3-theme-on-surface);
        }
    }

    // 卡包选择区
    .lv-qa-deck-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;

        .lv-qa-deck-label {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            font-weight: 500;
            opacity: 0.85;
            white-space: nowrap;
        }

        .lv-qa-deck-select {
            flex: 1;
            max-width: 260px;
            height: 30px;
            border-radius: 6px;
            font-size: 12px;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 右栏：实时卡面所见即所得面板
    // ─────────────────────────────────────────────────────────────
    .lv-qa-preview-pane {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
    }

    .lv-qa-preview-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;

        .lv-qa-preview-title {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 12.5px;
            font-weight: 600;
            color: var(--b3-theme-on-surface);

            .lv-qa-dual-badge {
                font-size: 10px;
                padding: 1px 6px;
                border-radius: 999px;
                background: color-mix(in srgb, var(--b3-theme-success, #10b981) 15%, transparent);
                color: var(--b3-theme-success, #10b981);
                font-weight: 600;
            }
        }

        .lv-qa-preview-controls {
            display: flex;
            align-items: center;
            gap: 6px;
        }
    }

    .lv-qa-preview-segmented {
        display: flex;
        background: color-mix(in srgb, var(--b3-theme-background) 80%, var(--b3-theme-surface));
        padding: 2.5px;
        border-radius: 8px;
        border: 1px solid var(--lv-border, var(--b3-border-color));

        .lv-qa-seg-btn {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 3.5px 10px;
            border-radius: 6px;
            border: none;
            background: transparent;
            color: var(--b3-theme-on-surface);
            font-size: 11.5px;
            font-weight: 500;
            opacity: 0.72;
            cursor: pointer;
            transition: all 0.15s ease;

            &.is-active {
                opacity: 1;
                font-weight: 600;
                background: var(--b3-theme-surface);
                color: var(--b3-theme-primary);
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
            }

            .lv-qa-seg-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: var(--b3-theme-success, #10b981);
            }
        }
    }

    .lv-qa-flip-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3.5px 9px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 28%, transparent);
        color: var(--b3-theme-primary);
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.12s ease, background 0.15s ease;

        &:hover {
            transform: translateY(-1px);
            background: color-mix(in srgb, var(--b3-theme-primary) 20%, transparent);
        }
    }

    // 卡面模拟实体
    .lv-qa-card-mockup {
        position: relative;
        flex: 1;
        min-height: 290px;
        padding: 16px 18px 14px;
        border-radius: var(--lv-r-l, 12px);
        background: var(--b3-theme-surface);
        border: 1.5px solid color-mix(in srgb, var(--b3-theme-primary) 25%, var(--b3-border-color));
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.05), var(--lv-inset-shine, inset 0 1px 0 rgba(255, 255, 255, 0.08));
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        cursor: pointer;
        user-select: none;
        transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;

        &:hover {
            border-color: var(--b3-theme-primary);
            box-shadow: 0 6px 22px color-mix(in srgb, var(--b3-theme-primary) 16%, transparent);
        }

        &:focus-visible {
            outline: 2px solid var(--b3-theme-primary);
            outline-offset: 2px;
        }

        &.is-front {
            animation: lv-face-flip-in 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }

        &.is-back {
            border-left: 4px solid var(--b3-theme-success, #10b981);
            animation: lv-face-flip-in 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }
    }

    @keyframes lv-face-flip-in {
        0% {
            opacity: 0.88;
            transform: scale(0.985);
        }
        100% {
            opacity: 1;
            transform: scale(1);
        }
    }

    .lv-mockup-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding-bottom: 10px;
        border-bottom: 1px solid color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent);
    }

    .lv-mockup-tags {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .lv-mockup-tag {
        font-size: 11px;
        padding: 2px 7px;
        border-radius: 999px;
        font-weight: 500;

        &--type {
            background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
            color: var(--b3-theme-primary);
            border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 24%, transparent);
        }

        &--deck {
            background: color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent);
            color: var(--b3-theme-on-surface);
            opacity: 0.85;
        }
    }

    .lv-mockup-face-indicator {
        font-size: 11px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        opacity: 0.65;
    }

    .lv-mockup-body {
        padding: 14px 4px;
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
    }

    .lv-mockup-front {
        display: flex;
        flex-direction: column;
        gap: 12px;
        text-align: center;
        padding: 10px 0;

        .lv-mockup-q-badge {
            align-self: center;
            font-size: 11.5px;
            font-weight: 600;
            padding: 2px 10px;
            border-radius: 999px;
            background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
            color: var(--b3-theme-primary);
        }

        .lv-mockup-q-text {
            font-size: 16px;
            font-weight: 600;
            line-height: 1.6;
            color: var(--b3-theme-on-surface);
            word-break: break-all;

            &.is-empty {
                font-style: italic;
                opacity: 0.55;
                font-weight: normal;
                font-size: 13.5px;
            }
        }

        .lv-mockup-cue-strip {
            font-size: 11.5px;
            color: var(--b3-theme-on-surface);
            opacity: 0.55;
            margin-top: 6px;
        }
    }

    .lv-mockup-back {
        display: flex;
        flex-direction: column;
        gap: 10px;
        text-align: left;
    }

    .lv-mockup-badge-row {
        display: flex;
        margin-bottom: 4px;
    }

    .lv-mockup-ans-badge {
        font-size: 10.5px;
        font-weight: 600;
        padding: 1.5px 7px;
        border-radius: 4px;

        &--custom {
            background: color-mix(in srgb, var(--b3-theme-success, #10b981) 15%, transparent);
            color: var(--b3-theme-success, #10b981);
            border: 1px solid color-mix(in srgb, var(--b3-theme-success, #10b981) 25%, transparent);
        }

        &--note, &--default {
            background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
            color: var(--b3-theme-primary);
            border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 22%, transparent);
        }
    }

    .lv-mockup-ans-text, .lv-mockup-note-text {
        font-size: 13.5px;
        line-height: 1.6;
        color: var(--b3-theme-on-surface);
        word-break: break-all;
        white-space: pre-wrap;
    }

    .lv-mockup-divider {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 6px 0;
        font-size: 10.5px;
        color: var(--b3-theme-on-surface);
        opacity: 0.5;

        &::before, &::after {
            content: "";
            flex: 1;
            height: 1px;
            background: color-mix(in srgb, var(--b3-theme-on-surface) 12%, transparent);
        }
    }

    .lv-mockup-cue-strip {
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.55;
        margin-top: 6px;
    }

    .lv-mockup-footer {
        padding-top: 10px;
        border-top: 1px solid color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent);
        text-align: center;
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.55;
    }

    .lv-qa-preview-hint {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.6;
        padding: 0 4px;

        .lv-qa-preview-hint__dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--b3-theme-success, #10b981);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 底部操作栏
    // ─────────────────────────────────────────────────────────────
    .lv-qa-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding-top: 10px;
        border-top: 1px solid var(--lv-border, var(--b3-border-color));

        .lv-qa-footer-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-left: auto;
        }

        .lv-qa-btn-clear {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            color: var(--b3-theme-error, #ef4444);
            border-color: color-mix(in srgb, var(--b3-theme-error, #ef4444) 30%, transparent);

            &:hover:not(:disabled) {
                background: color-mix(in srgb, var(--b3-theme-error, #ef4444) 12%, transparent);
                border-color: var(--b3-theme-error, #ef4444);
            }
        }

        .lv-qa-btn-save {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-weight: 600;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // AI 思考动态骨架
    // ─────────────────────────────────────────────────────────────
    .lv-ai-thinking {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 16px 12px;
        gap: 8px;
        border-radius: var(--lv-r-m, 8px);
        background: color-mix(in srgb, var(--b3-theme-primary) 6%, var(--b3-theme-background));
        border: 1px dashed color-mix(in srgb, var(--b3-theme-primary) 35%, transparent);

        .lv-ai-thinking__glow {
            font-size: 22px;
            animation: lv-pulse 1.6s ease-in-out infinite;
        }

        .lv-ai-thinking__stage {
            font-size: 12.5px;
            font-weight: 600;
            color: var(--b3-theme-primary);
        }

        .lv-ai-thinking__timer {
            font-size: 11px;
            opacity: 0.65;
        }

        .lv-ai-thinking__progress {
            width: 80%;
            max-width: 240px;
            height: 4px;
            border-radius: 999px;
            background: color-mix(in srgb, var(--b3-theme-primary) 15%, transparent);
            overflow: hidden;

            .lv-ai-thinking__bar {
                height: 100%;
                width: 40%;
                border-radius: 999px;
                background: var(--b3-theme-primary);
                animation: lv-indeterminate 1.5s infinite ease-in-out;
            }
        }

        .lv-ai-thinking__cancel {
            margin-top: 4px;
            font-size: 11px;
            padding: 2px 10px;
        }
    }

    @keyframes lv-pulse {
        0%, 100% { transform: scale(1); opacity: 0.9; }
        50% { transform: scale(1.15); opacity: 1; }
    }

    @keyframes lv-indeterminate {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(250%); }
    }
</style>
