<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { getRiffDecks, createRiffDeck, type RiffDeck } from "@/api/riff";
    import { inspectCardLearnability, serializeQaCard, validateQaDraft, type CardSplitDraft } from "@/core/flashcard-quality";
    import { parsePastedQuestionText } from "@/core/question-splitter";
    import { extractDroppedBlockText } from "@/core/drag-drop";
    import { compressImageFile } from "@/core/image-compress";
    import { showMessage, lvLaunchpad } from "@/libs/notice";
    import LvKbd from "./kit/LvKbd.svelte";
    import LvIcon from "./kit/LvIcon.svelte";

    let { i18n, onCreate, onClose, embedded = false, activeDoc = null, initialDeckID = "", initialQ = "", onDeckUsed }: {
        i18n: any;
        /** markdown（问题 + ==答案== 挖空式单块）与目标卡组 */
        onCreate: (
            markdown: string,
            deckID: string,
            deckName: string,
            q?: string,
            a?: string,
            docID?: string,
            options?: { sourceDocID?: string; sourceTitle?: string; inPlace?: boolean; examAttrs?: Record<string, string> },
        ) => Promise<{ docID: string; blockID: string } | void>;
        onClose: () => void;
        embedded?: boolean;
        activeDoc?: { name: string; docId: string } | null;
        /** R58 记住上次卡组：宿主传入的初选卡组（上次成功制卡使用的卡组） */
        initialDeckID?: string;
        /** R59 选中文本制卡：宿主传入的题面预填（编辑器选区文本） */
        initialQ?: string;
        /** R58 成功制卡后回传卡组，宿主持久化为「上次卡组」 */
        onDeckUsed?: (deckID: string, deckName: string) => void;
    } = $props();
    const t = $derived(i18n);

    // svelte-ignore state_referenced_locally -- 来源文档在快速制卡打开时固化初值
    let linkSourceDoc = $state(Boolean(activeDoc?.docId));
    let insertInPlace = $state(false);

    // svelte-ignore state_referenced_locally -- 选区预填为打开时一次性快照
    let q = $state(initialQ.trim());
    let a = $state("");
    let decks: RiffDeck[] = $state([]);
    // svelte-ignore state_referenced_locally -- 上次卡组为打开时快照
    let selected = $state(initialDeckID);
    let newName = $state("");
    let busy = $state(false);
    let deckLoadBusy = $state(false);
    let deckLoadError = $state("");
    let errorMsg = $state("");
    let template = $state<TemplateKind>("qa");
    let isBidirectional = $state(false);
    let previewAnswer = $state(false);
    let createdNotice = $state("");

    // R59/R60 卡面表达支持问答/挖空/超级块/选择题/公式推导
    type TemplateKind = "qa" | "cloze" | "superblock" | "choice" | "formula";
    type ChoiceMode = "single" | "multiple" | "judge";
    let choiceMode = $state<ChoiceMode>("single");
    let optionTexts = $state<{ text: string }[]>([
        { text: "" },
        { text: "" },
        { text: "" },
        { text: "" },
    ]);
    let correctKeys = $state<string[]>([]);
    let analysis = $state("");

    // CF-01: 编辑器块拖拽落入制卡输入框
    let isDraggingOver = $state(false);

    function onDragOver(e: DragEvent) {
        e.preventDefault();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = "copy";
        }
        isDraggingOver = true;
    }

    function onDragLeave() {
        isDraggingOver = false;
    }

    function onDrop(e: DragEvent) {
        e.preventDefault();
        isDraggingOver = false;
        const dropped = extractDroppedBlockText(e.dataTransfer);
        if (dropped && dropped.text) {
            q = dropped.text;
            if (dropped.hasCloze) {
                template = "cloze";
            }
            showMessage("已成功从编辑器拖拽置入卡片内容", 1800, "info");
        }
    }

    // 智能拆单与符号快捷工具条状态 (CF-06 / CF-07)
    const SAVED_SYMBOL_TAB_KEY = "lv-cards.quick-card.symbol-tab";
    function loadSavedSymbolTab(): "math" | "pinyin" | "format" {
        try {
            const v = localStorage.getItem(SAVED_SYMBOL_TAB_KEY);
            if (v === "math" || v === "pinyin" || v === "format") return v;
        } catch { /* 防御 */ }
        return "math";
    }
    let smartPasteModalOpen = $state(false);
    let smartPasteInputText = $state("");
    let symbolTab = $state<"math" | "pinyin" | "format">(loadSavedSymbolTab());
    function setSymbolTab(tab: "math" | "pinyin" | "format") {
        symbolTab = tab;
        try {
            localStorage.setItem(SAVED_SYMBOL_TAB_KEY, tab);
        } catch { /* 防御 */ }
    }
    let lastFocusedField = $state<"q" | "a">("q");

    const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
    const nonEmptyOptions = $derived(optionTexts.map((o, i) => ({ key: OPTION_LETTERS[i], text: o.text.trim() })).filter(o => o.text.length > 0));
    const validCorrectKeys = $derived(correctKeys.filter(k => nonEmptyOptions.some(o => o.key === k)));

    function setChoiceMode(mode: ChoiceMode) {
        choiceMode = mode;
        if (mode === "judge") {
            optionTexts = [{ text: "对" }, { text: "错" }];
            correctKeys = [];
        } else if (optionTexts.length < 2) {
            optionTexts = [{ text: "" }, { text: "" }];
        }
    }
    function toggleCorrectKey(key: string) {
        if (choiceMode === "judge") {
            correctKeys = [key];
            return;
        }
        if (choiceMode === "single") {
            correctKeys = [key];
            return;
        }
        correctKeys = correctKeys.includes(key) ? correctKeys.filter(k => k !== key) : [...correctKeys, key].sort();
    }
    function addOption() {
        if (optionTexts.length < 6) optionTexts = [...optionTexts, { text: "" }];
    }
    function removeOption(index: number) {
        if (optionTexts.length <= 2) return;
        const removedKey = OPTION_LETTERS[index];
        optionTexts = optionTexts.filter((_, i) => i !== index);
        correctKeys = correctKeys
            .filter(k => k !== removedKey)
            .map(k => {
                const kIdx = OPTION_LETTERS.indexOf(k as any);
                if (kIdx > index && kIdx > 0) {
                    return OPTION_LETTERS[kIdx - 1];
                }
                return k;
            });
    }

    /** 序列化选择/判断题为思源块：题干 + 选项行 + 遮罩答案行，属性经 examAttrs 落 custom-exam-* */
    function serializeChoiceCard(): { markdown: string; examAttrs: Record<string, string>; qText: string; aText: string } {
        if (choiceMode === "judge") {
            const answerText = correctKeys[0] === "A" ? "对" : "错";
            return {
                markdown: `${q.trim()}\n==正确答案：${answerText}==`,
                examAttrs: {
                    "custom-exam-type": "judge",
                    "custom-exam-answer": answerText,
                    ...(analysis.trim() ? { "custom-exam-analysis": analysis.trim() } : {}),
                },
                qText: q.trim(),
                aText: answerText,
            };
        }
        const optionLines = nonEmptyOptions.map(o => `${o.key}. ${o.text}`).join("\n");
        const answerLetters = validCorrectKeys.join("");
        const answerSummary = validCorrectKeys.map(k => `${k}．${nonEmptyOptions.find(o => o.key === k)?.text ?? ""}`).join("；");
        return {
            markdown: `${q.trim()}\n${optionLines}\n==正确答案：${answerLetters}${analysis.trim() ? `（${analysis.trim()}）` : ""}==`,
            examAttrs: {
                "custom-exam-type": choiceMode,
                "custom-exam-answer": answerLetters,
                ...(analysis.trim() ? { "custom-exam-analysis": analysis.trim() } : {}),
            },
            qText: q.trim(),
            aText: `正确答案：${answerLetters}${analysis.trim() ? `（${analysis.trim()}）` : ""} — ${answerSummary}`,
        };
    }

    function resetChoiceForm() {
        q = "";
        analysis = "";
        correctKeys = [];
        optionTexts = [{ text: "" }, { text: "" }, { text: "" }, { text: "" }];
    }
    let editorRoot: HTMLDivElement;
    let qTextareaEl: HTMLTextAreaElement | undefined = $state();
    let aTextareaEl: HTMLTextAreaElement | undefined = $state();
    let newNameInputEl: HTMLInputElement | undefined = $state();
    let imageInputEl: HTMLInputElement | undefined = $state();
    let imageProcessing = $state(false);
    let disposed = false;
    let deckAutoFocused = false;
    onDestroy(() => { disposed = true; });

    async function handleImageUpload(e: Event) {
        const input = e.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        imageProcessing = true;
        try {
            const dataUrl = await compressImageFile(file, 500 * 1024);
            const alt = file.name ? file.name.replace(/\.[^.]+$/, "") : "image";
            insertSnippet(`\n\n![${alt}](${dataUrl})\n\n`);
            lvLaunchpad.haptic(10);
            showMessage("图片已压缩并插入卡面", 2000, "info");
        } catch (err: any) {
            showMessage("图片处理失败: " + (err?.message ?? err), 3000, "error");
        } finally {
            imageProcessing = false;
            if (input) input.value = "";
        }
    }

    function insertCloze() {
        if (!qTextareaEl) return;
        const start = qTextareaEl.selectionStart ?? 0;
        const end = qTextareaEl.selectionEnd ?? 0;
        const selectedText = q.slice(start, end);
        const marker = "____";

        if (selectedText) {
            q = q.slice(0, start) + marker + q.slice(end);
            if (!a.trim()) {
                a = selectedText;
            }
        } else {
            q = q.slice(0, start) + marker + q.slice(start);
        }
        const nextPos = start + marker.length;
        setTimeout(() => {
            if (qTextareaEl) {
                qTextareaEl.focus();
                qTextareaEl.setSelectionRange(nextPos, nextPos);
            }
        }, 0);
    }

    function insertSnippet(snippet: string) {
        // 真机教训：实时读取 document.activeElement 重算聚焦目标，不单依赖失焦事件
        const active = typeof document !== "undefined" ? document.activeElement : null;
        if (active === aTextareaEl) lastFocusedField = "a";
        else if (active === qTextareaEl) lastFocusedField = "q";
        const targetEl = lastFocusedField === "a" && aTextareaEl ? aTextareaEl : qTextareaEl;
        if (!targetEl) return;
        const start = targetEl.selectionStart ?? 0;
        const end = targetEl.selectionEnd ?? 0;
        const val = targetEl.value;
        const newVal = val.slice(0, start) + snippet + val.slice(end);
        if (targetEl === aTextareaEl) {
            a = newVal;
        } else {
            q = newVal;
        }
        const nextPos = start + snippet.length;
        setTimeout(() => {
            targetEl.focus();
            targetEl.setSelectionRange(nextPos, nextPos);
        }, 0);
    }

    function applySmartSplit(rawText: string) {
        const parsed = parsePastedQuestionText(rawText);
        if (!parsed) {
            errorMsg = "未能识别出题目结构，请确认文本包含题干、选项（A. ... B. ...）或答案。";
            return;
        }
        q = parsed.stem;
        analysis = parsed.analysis;
        if (parsed.type === "single" || parsed.type === "multiple") {
            template = "choice";
            choiceMode = parsed.type;
            optionTexts = parsed.options.map(o => ({ text: o.text }));
            correctKeys = parsed.correctKeys;
        } else if (parsed.type === "judge") {
            template = "choice";
            choiceMode = "judge";
            optionTexts = [{ text: "对" }, { text: "错" }];
            correctKeys = parsed.correctKeys;
        } else if (parsed.type === "fill") {
            template = "cloze";
            a = parsed.answer;
        } else {
            template = "qa";
            a = parsed.answer;
        }
        smartPasteModalOpen = false;
        smartPasteInputText = "";
        previewAnswer = false;
        errorMsg = "";
        createdNotice = `⚡ 已智能拆分填入「${parsed.type === "single" ? "单选题" : parsed.type === "multiple" ? "多选题" : parsed.type === "judge" ? "判断题" : parsed.type === "fill" ? "填空题" : "问答题"}」`;
    }

    const isMac = typeof navigator !== "undefined" && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || navigator.platform || "");

    const canCreateDeck = $derived(decks.some(d => d.id === selected) || !!newName.trim());
    const clozeParts = $derived(q.split("____"));
    const hasClozeMarker = $derived(clozeParts.length > 1);

    // 制卡必须要素硬核核查（未满足不可完成制卡）
    const deckReady = $derived(Boolean(decks.some(d => d.id === selected) || !!newName.trim()));
    const stemReady = $derived(q.trim().length > 0);
    const answerCheck = $derived.by(() => {
        if (template === "choice") {
            if (choiceMode === "judge") {
                const hasAns = correctKeys.length > 0;
                return {
                    ready: hasAns,
                    label: hasAns ? "判断答案已就绪" : "必须选择「对」或「错」",
                    readyLabel: "判断项已指定",
                    focusField: "judge",
                };
            }
            if (choiceMode === "single") {
                const optOk = nonEmptyOptions.length >= 2;
                const ansOk = validCorrectKeys.length === 1;
                return {
                    ready: optOk && ansOk,
                    label: !optOk ? "至少填写2个选项" : !ansOk ? "需选定1个正确答案" : "单选与答案已就绪",
                    readyLabel: "单选与答案已就绪",
                    focusField: !optOk ? "option" : "answerKey",
                };
            }
            if (choiceMode === "multiple") {
                const optOk = nonEmptyOptions.length >= 2;
                const ansOk = validCorrectKeys.length >= 2;
                return {
                    ready: optOk && ansOk,
                    label: !optOk ? "至少填写2个选项" : !ansOk ? "多选需指定≥2个正确项" : "多选与答案已就绪",
                    readyLabel: "多选与答案已就绪",
                    focusField: !optOk ? "option" : "answerKey",
                };
            }
        }
        if (template === "cloze") {
            const hasMarker = q.includes("____") || q.includes("==");
            const ansOk = a.trim().length > 0 || q.includes("==");
            return {
                ready: hasMarker && ansOk,
                label: !hasMarker ? "题干需包含空位(____或==答案==)" : !ansOk ? "需填写挖空内容" : "挖空要素已就绪",
                readyLabel: "挖空要素已就绪",
                focusField: !hasMarker ? "q" : "a",
            };
        }
        // qa, superblock, formula
        const hasA = a.trim().length > 0;
        return {
            ready: hasA,
            label: hasA ? "答案内容已就绪" : "必须填写答案内容",
            readyLabel: "答案已就绪",
            focusField: "a",
        };
    });

    const isAllMandatorySatisfied = $derived(deckReady && stemReady && answerCheck.ready);

    // 选择题、挖空题、超级块与公式题不走纯文本问答校验（校验由 answerCheck 承担，允许合法 == 或多段语法）
    const draftIssues = $derived(template !== "qa" ? [] : validateQaDraft(q, a));
    const overloadNotice = $derived(inspectCardLearnability({ question: q, answer: a, template: template === "choice" || template === "formula" ? "qa" : template }));
    let showSplitPreview = $state(false);
    const canSubmit = $derived(
        !busy && isAllMandatorySatisfied && (template !== "qa" || draftIssues.length === 0)
    );

    function cleanFormulaCloze(ans: string): string {
        let clean = ans.trim();
        if (clean.startsWith("$$") && clean.endsWith("$$") && clean.length > 4) {
            clean = "$" + clean.slice(2, -2).trim() + "$";
        } else if (!clean.startsWith("$")) {
            clean = `$${clean}$`;
        }
        return clean;
    }

    function serializeDraftByTemplate(draft: CardSplitDraft): string {
        const question = draft.q.trim();
        const answer = draft.a.trim();
        if (template === "cloze") {
            if (question.includes("____")) {
                return question.split("____").join(`==${answer}==`);
            }
            if (question.includes("==")) {
                return answer && !question.includes(answer) ? `${question}\n> 💡 ${answer}` : question;
            }
        }
        if (template === "superblock") {
            return `{{{col\n${question}\n\n${answer}\n}}}`;
        }
        if (template === "formula") {
            return `${question}\n==${cleanFormulaCloze(answer)}==`;
        }
        return serializeQaCard(question, answer);
    }

    async function confirmSplitCreate() {
        if (busy || !canCreateDeck || overloadNotice.splitDrafts.length < 2) return;
        busy = true;
        errorMsg = "";
        createdNotice = "";
        try {
            let deckID = selected;
            let deckName = decks.find(d => d.id === deckID)?.name ?? "";
            if (newName.trim()) {
                const deck = await createRiffDeck(newName.trim());
                deckID = deck.id;
                deckName = deck.name;
                decks = [...decks, deck];
                selected = deckID;
                newName = "";
            }
            if (!deckID) {
                errorMsg = t.quickCardNeedDeck;
                return;
            }
            const drafts = overloadNotice.splitDrafts;
            const docOpts = (linkSourceDoc && activeDoc?.docId) ? {
                sourceDocID: activeDoc.docId,
                sourceTitle: activeDoc.name,
                inPlace: insertInPlace,
            } : undefined;
            let sharedDocID: string | undefined = insertInPlace ? activeDoc?.docId : undefined;
            for (const draft of drafts) {
                const splitArgs: any[] = [
                    serializeDraftByTemplate(draft),
                    deckID,
                    deckName,
                    draft.q.trim(),
                    draft.a.trim(),
                ];
                if (sharedDocID || docOpts) {
                    splitArgs.push(sharedDocID);
                    if (docOpts) splitArgs.push(docOpts);
                }
                const res = await (onCreate as any)(...splitArgs);
                if (!sharedDocID && res && res.docID) {
                    sharedDocID = res.docID;
                }
            }
            if (disposed) return;
            showSplitPreview = false;
            rememberDeck(deckID, deckName);
            if (embedded) {
                q = "";
                a = "";
                isBidirectional = false;
                previewAnswer = false;
                if (template === "choice") {
                    if (choiceMode === "judge") {
                        optionTexts = [{ text: "对" }, { text: "错" }];
                    } else {
                        optionTexts = [{ text: "" }, { text: "" }, { text: "" }, { text: "" }];
                    }
                    correctKeys = [];
                    analysis = "";
                }
                createdNotice = insertInPlace
                    ? (t.quickCardDocInPlaceDone ?? "已在当前笔记就地制卡并加入卡组")
                    : (t.quickCardSplitDone ?? "已拆分为 ${n} 张原子卡并加入卡组").replace("${n}", String(drafts.length));
            } else {
                onClose();
            }
        } catch (e: any) {
            if (disposed) return;
            errorMsg = e?.message ?? String(e);
        } finally {
            if (!disposed) busy = false;
        }
    }

    function setTemplate(value: TemplateKind) {
        template = value;
        previewAnswer = false;
    }

    async function loadDecks() {
        if (deckLoadBusy) return;
        deckLoadBusy = true;
        deckLoadError = "";
        try {
            const loadedDecks = await getRiffDecks();
            if (disposed) return;
            decks = [...loadedDecks, ...decks.filter(deck => !loadedDecks.some(loaded => loaded.id === deck.id))];
            if (decks.length > 0 && !decks.some(d => d.id === selected)) {
                // 优先回到「上次卡组」；上次卡组已不存在时回落到第一个卡组
                selected = decks.some(d => d.id === initialDeckID) ? initialDeckID : decks[0].id;
            }
            // 空库引导：没有任何卡组时把焦点交给「新建卡组名称」，让创建路径自己走到用户面前
            if (decks.length === 0 && !deckAutoFocused && !newName.trim()) {
                deckAutoFocused = true;
                setTimeout(() => newNameInputEl?.focus(), 60);
            }
        } catch (e: any) {
            if (disposed) return;
            deckLoadError = e?.message ?? String(e);
        } finally {
            if (!disposed) deckLoadBusy = false;
        }
    }

    /** R58/R60 一键示例：仅在内容为空时可用，避免覆盖用户已输入的草稿 */
    const SAMPLE_DRAFTS: Record<TemplateKind, { q: string; a: string }> = {
        qa: { q: "FSRS 调度模型中的 S 代表什么？", a: "稳定性（Stability），表示记忆当前的坚固程度。" },
        cloze: { q: "细胞进行有氧呼吸的主要场所是____。", a: "线粒体" },
        superblock: { q: "细胞呼吸分为哪三个阶段？\n\n糖酵解、柠檬酸循环、氧化磷酸化。", a: "" },
        choice: { q: "地球绕太阳公转一周大约需要多长时间？", a: "" },
        formula: { q: "爱因斯坦质能方程的数学表达式是什么？", a: "E = mc^2" },
    };
    const CHOICE_SAMPLE = {
        mode: "single" as ChoiceMode,
        options: ["1 天", "30 天", "365 天", "10 年"],
        correctKeys: ["C"],
        analysis: "地球公转周期约为一年（365.25 天）",
    };
    const canFillSample = $derived(!busy && !q.trim() && !a.trim() && !nonEmptyOptions.some(o => o.text) && correctKeys.length === 0 && !analysis.trim());
    function fillSample() {
        if (!canFillSample) return;
        if (template === "choice") {
            choiceMode = CHOICE_SAMPLE.mode;
            optionTexts = CHOICE_SAMPLE.options.map(text => ({ text }));
            correctKeys = [...CHOICE_SAMPLE.correctKeys];
            analysis = CHOICE_SAMPLE.analysis;
            setTimeout(() => qTextareaEl?.focus(), 0);
            return;
        }
        const sample = SAMPLE_DRAFTS[template];
        q = sample.q;
        a = sample.a;
        previewAnswer = false;
        setTimeout(() => qTextareaEl?.focus(), 0);
    }

    onMount(() => { void loadDecks(); });

    /** 记住上次卡组：成功制卡（含批量拆卡）后回传宿主持久化 */
    function rememberDeck(deckID: string, deckName: string) {
        if (deckID) onDeckUsed?.(deckID, deckName);
    }

    function reportMissingMandatory(): boolean {
        if (!deckReady) {
            errorMsg = t.quickCardMandatoryDeckMissing ?? "制卡失败：必须选择现有卡组或输入新卡组名称";
            newNameInputEl?.focus();
            return false;
        }
        if (!stemReady) {
            errorMsg = t.quickCardMandatoryStemMissing ?? "制卡失败：必须填写题干内容";
            qTextareaEl?.focus();
            return false;
        }
        if (!answerCheck.ready) {
            errorMsg = `制卡失败：${answerCheck.label}`;
            if (answerCheck.focusField === "a") {
                aTextareaEl?.focus();
            } else if (answerCheck.focusField === "q") {
                qTextareaEl?.focus();
            } else if (answerCheck.focusField === "option") {
                const firstEmptyOptInput = editorRoot?.querySelector(".lv-qc-option-row input") as HTMLInputElement | null;
                firstEmptyOptInput?.focus();
            } else if (answerCheck.focusField === "answerKey") {
                const firstKeyBtn = editorRoot?.querySelector(".lv-qc-option-key") as HTMLButtonElement | null;
                firstKeyBtn?.focus();
            } else if (answerCheck.focusField === "judge") {
                const firstJudgeBtn = editorRoot?.querySelector(".lv-qc-judge-pick button") as HTMLButtonElement | null;
                firstJudgeBtn?.focus();
            }
            return false;
        }
        return true;
    }

    async function confirm() {
        if (!reportMissingMandatory()) {
            return;
        }
        if (!canSubmit) {
            return;
        }
        busy = true;
        errorMsg = "";
        createdNotice = "";
        try {
            let deckID = selected;
            let deckName = decks.find(d => d.id === deckID)?.name ?? "";
            if (newName.trim()) {
                const deck = await createRiffDeck(newName.trim());
                deckID = deck.id;
                deckName = deck.name;
                decks = [...decks, deck];
                selected = deckID;
                newName = "";
            }
            if (!deckID || (!newName.trim() && !decks.some(d => d.id === deckID))) {
                errorMsg = t.quickCardNeedDeck;
                return;
            }
            const docOpts = (linkSourceDoc && activeDoc?.docId) ? {
                sourceDocID: activeDoc.docId,
                sourceTitle: activeDoc.name,
                inPlace: insertInPlace,
            } : undefined;
            const targetDocID = insertInPlace ? activeDoc?.docId : undefined;

            // R59 选择/判断题分支：序列化题型块 + 经 examAttrs 写入 custom-exam-* 属性
            if (template === "choice") {
                const { markdown, examAttrs, qText, aText } = serializeChoiceCard();
                const opts = { ...(docOpts ?? {}), examAttrs };
                const callArgs: any[] = [markdown, deckID, deckName, qText, aText];
                if (targetDocID || Object.keys(opts).length > 0) {
                    callArgs.push(targetDocID);
                    callArgs.push(opts);
                }
                await (onCreate as any)(...callArgs);
                if (disposed) return;
                rememberDeck(deckID, deckName);
                lvLaunchpad.haptic(10); // Mobile Spec v1：制卡成功触感确认
                if (embedded) {
                    resetChoiceForm();
                    previewAnswer = false;
                    createdNotice = insertInPlace
                        ? (t.quickCardDocInPlaceDone ?? "已在当前笔记就地制卡并加入卡组")
                        : (t.quickCardChoiceDone ?? "题型卡已生成并加入卡组");
                } else {
                    onClose();
                }
                return;
            }

            const question = q.trim();
            const answer = a.trim();
            if (template === "qa" && isBidirectional) {
                // 双向卡片：互为问答生成两张卡片（A -> B 与 B -> A）
                const firstArgs: any[] = [serializeQaCard(question, answer), deckID, deckName, question, answer];
                if (targetDocID || docOpts) {
                    firstArgs.push(targetDocID);
                    if (docOpts) firstArgs.push(docOpts);
                }
                const first = await (onCreate as any)(...firstArgs);
                if (first && first.docID) {
                    const secondArgs: any[] = [serializeQaCard(answer, question), deckID, deckName, answer, question, first.docID];
                    if (docOpts) secondArgs.push(docOpts);
                    await (onCreate as any)(...secondArgs);
                } else {
                    const altArgs: any[] = [serializeQaCard(answer, question), deckID, deckName, answer, question];
                    if (targetDocID || docOpts) {
                        altArgs.push(targetDocID);
                        if (docOpts) altArgs.push(docOpts);
                    }
                    await (onCreate as any)(...altArgs);
                }
                if (disposed) return;
                rememberDeck(deckID, deckName);
                lvLaunchpad.haptic(10); // Mobile Spec v1：制卡成功触感确认
                if (embedded) {
                    q = "";
                    a = "";
                    isBidirectional = false;
                    previewAnswer = false;
                    createdNotice = insertInPlace
                        ? (t.quickCardDocInPlaceDone ?? "已在当前笔记就地制卡并加入卡组")
                        : (t.quickCardBidiDone ?? "双向卡片已生成（2 张）并加入卡组");
                } else {
                    onClose();
                }
            } else {
                const markdown = template === "cloze"
                    ? (question.includes("____")
                        ? question.split("____").join(`==${answer}==`)
                        : (question.includes("==") && answer && !question.includes(answer) ? `${question}\n> 💡 ${answer}` : question))
                    : template === "superblock"
                    ? `{{{col\n${question}\n\n${answer}\n}}}`
                    : template === "formula"
                    ? `${question}\n==${cleanFormulaCloze(answer)}==`
                    : serializeQaCard(question, answer);
                const callArgs: any[] = [markdown, deckID, deckName, question, answer];
                if (targetDocID || docOpts) {
                    callArgs.push(targetDocID);
                    if (docOpts) callArgs.push(docOpts);
                }
                await (onCreate as any)(...callArgs);
                if (disposed) return;
                rememberDeck(deckID, deckName);
                lvLaunchpad.haptic(10); // Mobile Spec v1：制卡成功触感确认
                if (embedded) {
                    q = "";
                    a = "";
                    previewAnswer = false;
                    createdNotice = insertInPlace
                        ? (t.quickCardDocInPlaceDone ?? "已在当前笔记就地制卡并加入卡组")
                        : t.quickCardDone;
                } else {
                    onClose();
                }
            }
        } catch (e: any) {
            if (disposed) return;
            errorMsg = e?.message ?? String(e);
        } finally {
            if (!disposed) busy = false;
        }
    }

    function onKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.repeat && !e.defaultPrevented
            && e.target instanceof Node && editorRoot?.contains(e.target) && !editorRoot.closest("[hidden], [inert]")) {
            e.preventDefault();
            confirm();
        } else if ((e.ctrlKey || e.metaKey) && (e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4" || e.key === "5") && !e.repeat
            && e.target instanceof Node && editorRoot?.contains(e.target) && !editorRoot.closest("[hidden], [inert]")) {
            // R58/R59/R60 模板快捷键：Ctrl+1/2/3/4/5 切换表达模板
            e.preventDefault();
            setTemplate(e.key === "1" ? "qa" : e.key === "2" ? "cloze" : e.key === "3" ? "superblock" : e.key === "4" ? "choice" : "formula");
        } else if (e.key === "Escape" && !busy && !embedded
            && e.target instanceof Node && editorRoot?.contains(e.target) && !editorRoot.closest("[hidden], [inert]")) {
            e.preventDefault();
            onClose();
        }
    }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="lv-quickcard b3-typography" bind:this={editorRoot}>
    <!-- 三步引导条（R57）：让首次制卡的用户一眼看懂操作路径 -->
    <div class="lv-qc-steps" role="list" aria-label={t.quickCardStepsLabel ?? "制卡步骤"}>
        <span class="lv-qc-step" role="listitem"><b>1</b>{t.quickCardStep1 ?? "选表达方式与卡组"}</span>
        <LvIcon name="chevron-right" size={12} />
        <span class="lv-qc-step" role="listitem"><b>2</b>{t.quickCardStep2 ?? "写问题与答案"}</span>
        <LvIcon name="chevron-right" size={12} />
        <span class="lv-qc-step" role="listitem"><b>3</b>{t.quickCardStep3 ?? "Ctrl+Enter 一键制卡"}</span>
        {#if onClose && embedded}
            <button
                type="button"
                class="b3-button b3-button--small b3-button--text lv-qc-close-icon"
                aria-label="关闭"
                title="关闭"
                onclick={onClose}
            >
                <LvIcon name="close" size={14} />
            </button>
        {/if}
    </div>
    <div class="lv-qc-toolbar">
        <div class="lv-qc-template" role="group" aria-label={t.quickCardTemplateLabel}>
            <button type="button" class="lv-qc-tpl-btn" class:lv-qc-template-active={template === "qa"} aria-pressed={template === "qa"} disabled={busy} onclick={() => setTemplate("qa")} aria-keyshortcuts="Control+1 Meta+1" title={`${t.quickCardTemplateQA} (Ctrl+1)`}>
                <LvIcon name="message" size={15} /> <strong>{t.quickCardTemplateQA}</strong>
            </button>
            <button type="button" class="lv-qc-tpl-btn" class:lv-qc-template-active={template === "cloze"} aria-pressed={template === "cloze"} disabled={busy} onclick={() => setTemplate("cloze")} aria-keyshortcuts="Control+2 Meta+2" title={`${t.quickCardTemplateCloze} (Ctrl+2)`}>
                <LvIcon name="edit" size={15} /> <strong>{t.quickCardTemplateCloze}</strong>
            </button>
            <button type="button" class="lv-qc-tpl-btn" class:lv-qc-template-active={template === "superblock"} aria-pressed={template === "superblock"} disabled={busy} onclick={() => setTemplate("superblock")} title={`${t.quickCardTemplateSuperBlockDesc} (Ctrl+3)`} aria-keyshortcuts="Control+3 Meta+3">
                <LvIcon name="cards" size={15} /> <strong>{t.quickCardTemplateSuperBlock}</strong>
            </button>
            <button type="button" class="lv-qc-tpl-btn" class:lv-qc-template-active={template === "choice"} aria-pressed={template === "choice"} disabled={busy} onclick={() => setTemplate("choice")} title={`${t.quickCardTemplateChoiceDesc ?? "选择题 / 多选题 / 判断题，复习时点选作答"} (Ctrl+4)`} aria-keyshortcuts="Control+4 Meta+4">
                <LvIcon name="check" size={15} /> <strong>{t.quickCardTemplateChoice ?? "选择题"}</strong>
            </button>
            <button type="button" class="lv-qc-tpl-btn" class:lv-qc-template-active={template === "formula"} aria-pressed={template === "formula"} disabled={busy} onclick={() => setTemplate("formula")} title={`${t.quickCardTemplateFormulaDesc ?? "数理公式与推导，复习时自动 KaTeX 高保真渲染"} (Ctrl+5)`} aria-keyshortcuts="Control+5 Meta+5">
                <LvIcon name="code" size={15} /> <strong>{t.quickCardTemplateFormula ?? "公式推导"}</strong>
            </button>
        </div>
        <div class="lv-qc-deck">
            <div class="lv-qc-label-bar">
                <span class="lv-qc-label">{t.deckPickerTitle}{#if decks.length > 0}（{decks.length}）{/if}</span>
                <button
                    type="button"
                    class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                    disabled={deckLoadBusy || busy}
                    title={t.quickCardDeckRefresh ?? "刷新卡组列表"}
                    aria-label={t.quickCardDeckRefresh ?? "刷新卡组列表"}
                    onclick={() => void loadDecks()}
                >
                    <LvIcon name="refresh" size={12} />
                </button>
            </div>
            {#if decks.length > 0}
                <div class="lv-qc-deck-inputs lv-qc-deck-inputs--pick">
                    <select class="b3-select" aria-label={t.deckPickerTitle} bind:value={selected} disabled={busy}>
                        {#each decks as d (d.id)}
                            <option value={d.id}>{d.name}</option>
                        {/each}
                    </select>
                    <input class="b3-text-field lv-qc-new" aria-label={t.deckNewName} placeholder={t.deckNewName} bind:value={newName} bind:this={newNameInputEl} disabled={busy} />
                </div>
                <!-- Mobile Spec v1：牌组 chips 选择（手机端替代下拉直选，桌面端隐藏） -->
                <div class="lv-qc-deck-chips" role="listbox" aria-label={t.deckPickerTitle}>
                    {#each decks as d (d.id)}
                        <button
                            type="button"
                            class="lv-qc-deck-chip"
                            class:lv-qc-deck-chip-active={selected === d.id}
                            role="option"
                            aria-selected={selected === d.id}
                            disabled={busy}
                            title={d.name}
                            onclick={() => (selected = d.id)}
                        >
                            {d.name}
                        </button>
                    {/each}
                </div>
            {:else if deckLoadBusy}
                <div class="ft__smaller ft__on-surface" role="status" aria-busy="true">{t.quickCardDeckLoading ?? "正在读取卡组…"}</div>
            {:else}
                <!-- R58 空库创建流：不再渲染死下拉，输入框即创建入口 -->
                <div class="lv-qc-deck-inputs">
                    <input
                        class="b3-text-field lv-qc-new lv-qc-new--solo"
                        aria-label={t.deckNewName}
                        placeholder={t.deckNewName}
                        bind:value={newName}
                        bind:this={newNameInputEl}
                        disabled={busy}
                    />
                </div>
            {/if}
            {#if deckLoadError}
                <div class="lv-qc-deck-error" role="alert">
                    <span>{(t.quickCardDeckLoadFail ?? "读取卡组失败：${error}").replace("${error}", deckLoadError)}</span>
                    <button type="button" class="b3-button b3-button--small b3-button--outline lv-btn-tool" disabled={deckLoadBusy} onclick={() => void loadDecks()}><LvIcon name="refresh" size={13} /> <span>{t.quickCardDeckRetry ?? "重试"}</span></button>
                </div>
            {:else if decks.length === 0 && !deckLoadBusy}
                <div class="ft__smaller ft__on-surface lv-qc-deck-hint">{t.quickCardDeckEmptyHint ?? "当前还没有卡组：在上方输入名称，制卡时会自动创建并选中。"}</div>
            {/if}
        </div>
    </div>

    <!-- 制卡必备要素状态条（明确要素，未满足不可完成制卡） -->
    <div class="lv-qc-mand-bar" role="group" aria-label={t.quickCardMandatoryCheck ?? "制卡必备要素"}>
        <span class="lv-qc-mand-title">{t.quickCardMandatoryCheck ?? "制卡必备要素"}：</span>
        <button
            type="button"
            class="lv-qc-mand-pill"
            class:lv-qc-mand-ok={deckReady}
            class:lv-qc-mand-err={!deckReady}
            onclick={() => (newNameInputEl ? newNameInputEl.focus() : null)}
            title={deckReady ? "卡组已指定" : "点击输入卡组名称"}
        >
            {#if deckReady}<LvIcon name="check" size={11} /> <span>{t.quickCardMandatoryDeckOk ?? "卡组已指定"}</span>{:else}<span>⚠️ {t.quickCardMandatoryDeckMissing ?? "必须选择或新建卡组"}</span>{/if}
        </button>
        <button
            type="button"
            class="lv-qc-mand-pill"
            class:lv-qc-mand-ok={stemReady}
            class:lv-qc-mand-err={!stemReady}
            onclick={() => qTextareaEl?.focus()}
            title={stemReady ? "题干已就绪" : "点击填写题干"}
        >
            {#if stemReady}<LvIcon name="check" size={11} /> <span>{t.quickCardMandatoryStemOk ?? "题干已填写"}</span>{:else}<span>⚠️ {t.quickCardMandatoryStemMissing ?? "必须填写题干内容"}</span>{/if}
        </button>
        <button
            type="button"
            class="lv-qc-mand-pill"
            class:lv-qc-mand-ok={answerCheck.ready}
            class:lv-qc-mand-err={!answerCheck.ready}
            onclick={() => {
                if (answerCheck.focusField === "a") aTextareaEl?.focus();
                else if (answerCheck.focusField === "q") qTextareaEl?.focus();
            }}
            title={answerCheck.ready ? "答案要素就绪" : "点击完善答案要素"}
        >
            {#if answerCheck.ready}<LvIcon name="check" size={11} /> <span>{answerCheck.readyLabel}</span>{:else}<span>⚠️ {answerCheck.label}</span>{/if}
        </button>
        {#if !isAllMandatorySatisfied}
            <span class="lv-qc-mand-status">{t.quickCardMandatoryPending ?? "需满足上述要素方可制卡"}</span>
        {:else}
            <span class="lv-qc-mand-status lv-qc-mand-status--ready"><LvIcon name="check" size={12} /> {t.quickCardMandatoryReady ?? "要素齐全，可立即制卡"}</span>
        {/if}
    </div>

    <!-- 智能试题文本拆单卡片 -->
    {#if smartPasteModalOpen}
        <div class="lv-qc-smart-paste-card" role="dialog" aria-label={t.quickCardSmartSplitModalTitle ?? "智能试题文本拆单与识别填入"}>
            <div class="lv-qc-smart-paste-head">
                <span class="lv-qc-smart-paste-title">
                    <LvIcon name="zap" size={14} /> <strong>{t.quickCardSmartSplitModalTitle ?? "智能试题文本拆单与识别填入"}</strong>
                </span>
                <span style="display: inline-flex; align-items: center; gap: 4px;">
                    {#if smartPasteInputText.trim()}
                        <button
                            type="button"
                            class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                            title={t.quickCardSmartSplitClear ?? "清空文本"}
                            onclick={() => (smartPasteInputText = "")}
                        >
                            <LvIcon name="trash" size={12} />
                            <span>{t.quickCardSmartSplitClear ?? "清空"}</span>
                        </button>
                    {/if}
                    <button type="button" class="b3-button b3-button--small lv-btn-ghost lv-btn-tool" onclick={() => (smartPasteModalOpen = false)}>
                        <LvIcon name="close" size={12} />
                    </button>
                </span>
            </div>
            <textarea
                class="b3-text-field fn__block lv-qc-smart-paste-input"
                bind:value={smartPasteInputText}
                placeholder={t.quickCardSmartSplitModalPlaceholder ?? "直接粘贴整段试题文本（支持任意排版：单选、多选、判断、填空、问答，自动拆分题干、A/B/C/D 选项、答案与解析）"}
                rows="4"
            ></textarea>
            <div class="lv-qc-smart-paste-foot">
                <button
                    type="button"
                    class="b3-button b3-button--small lv-btn-primary"
                    disabled={!smartPasteInputText.trim()}
                    onclick={() => applySmartSplit(smartPasteInputText)}
                >
                    <LvIcon name="zap" size={12} /> <span>{t.quickCardSmartSplitApply ?? "一键智能拆分填入"}</span>
                </button>
                <span class="ft__smaller ft__on-surface">粘贴后自动识别题型并分发到各输入框</span>
            </div>
        </div>
    {/if}
    {#if activeDoc && activeDoc.docId}
        <div class="lv-qc-doc-banner" role="group" aria-label={t.quickCardDocLink ?? "来源文档联动"}>
            <div class="lv-qc-doc-info">
                <LvIcon name="target" size={13} />
                <span class="lv-qc-doc-title" title={activeDoc.name}>{t.quickCardDocCurrent ?? "当前笔记"}：{activeDoc.name.replace(/^\//, "") || activeDoc.docId.slice(0, 8)}</span>
            </div>
            <div class="lv-qc-doc-controls">
                <label class="lv-qc-doc-checkbox" title={t.quickCardDocLinkTip ?? "制卡时自动附带指向当前笔记的反向链接"}>
                    <input type="checkbox" class="lv-check" bind:checked={linkSourceDoc} disabled={busy} />
                    <span>{t.quickCardDocLink ?? "关联笔记反链"}</span>
                </label>
                {#if linkSourceDoc}
                    <label class="lv-qc-doc-checkbox" title={t.quickCardDocInPlaceTip ?? "直接在当前笔记末尾追加卡片块，卡片与笔记正文融为一体"}>
                        <input type="checkbox" class="lv-check" bind:checked={insertInPlace} disabled={busy} />
                        <span>{t.quickCardDocInPlace ?? "就地追加到本文档"}</span>
                    </label>
                {/if}
            </div>
        </div>
    {/if}
    <div class="lv-qc-content">
        <section class="lv-qc-editor" aria-label={t.quickCardEditorLabel}>
            <div class="lv-qc-field">
                <div class="lv-qc-label-bar" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                    <span class="lv-qc-label">{t.quickCardQ} <span class="lv-qc-count" class:lv-qc-count-warn={q.length > 60}>{q.length} 字</span></span>
                    <span style="display: inline-flex; gap: 6px; align-items: center;">
                        <input
                            type="file"
                            accept="image/*"
                            style="display: none;"
                            bind:this={imageInputEl}
                            onchange={handleImageUpload}
                        />
                        <button
                            type="button"
                            class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                            aria-label="插入图片素材"
                            title="插入图片素材 (压缩至500KB内)"
                            disabled={busy || imageProcessing}
                            onclick={(e) => { e.stopPropagation(); imageInputEl?.click(); }}
                        >
                            <LvIcon name="image" size={12} />
                            <span>{imageProcessing ? "处理中…" : "插入图片"}</span>
                        </button>
                        <button
                            type="button"
                            class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                            aria-label={t.quickCardSmartSplit ?? "智能拆单"}
                            title={t.quickCardSmartSplitTip ?? "粘贴包含题干、选项与答案的整段文本，一键智能拆分填入"}
                            onclick={(e) => { e.stopPropagation(); smartPasteModalOpen = !smartPasteModalOpen; }}
                        >
                            <LvIcon name="zap" size={12} />
                            <span>{t.quickCardSmartSplit ?? "智能拆单"}</span>
                        </button>
                        {#if template === "cloze"}
                            <button
                                type="button"
                                class="b3-button b3-button--small b3-button--outline lv-btn-tool lv-cloze-shortcut-btn"
                                title={t.quickCardClozeInsertHint ?? "选中文字设为挖空，或光标处插入空位 (Ctrl+H)"}
                                aria-label={t.quickCardClozeInsert ?? "插入挖空 (Ctrl+H)"}
                                aria-keyshortcuts="Control+h Meta+h"
                                onclick={(e) => { e.stopPropagation(); insertCloze(); }}
                            >
                                <LvIcon name="edit" size={12} />
                                <span>{t.quickCardClozeInsert ?? "一键挖空 (Ctrl+H)"}</span>
                            </button>
                        {/if}
                        {#if canFillSample}
                            <button
                                type="button"
                                class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                                aria-label={t.quickCardSampleFill ?? "填入示例"}
                                title={t.quickCardSampleFillTip ?? "填入一条示例草稿，照着改成你自己的内容（不会覆盖已输入内容）"}
                                onclick={(e) => { e.stopPropagation(); fillSample(); }}
                            >
                                <LvIcon name="lightbulb" size={12} />
                                <span>{t.quickCardSampleFill ?? "填入示例"}</span>
                            </button>
                        {/if}
                    </span>
                </div>
                <!-- 快捷数理、拼音与格式工具栏 -->
                <div class="lv-qc-symbol-dock" role="toolbar" aria-label="快捷符号工具条">
                    <div class="lv-qc-symbol-tabs" role="tablist">
                        <button type="button" class="lv-qc-symbol-tab-btn" class:lv-qc-symbol-tab-active={symbolTab === "math"} onclick={() => setSymbolTab("math")}>{t.quickCardSymbolMath ?? "数理"}</button>
                        <button type="button" class="lv-qc-symbol-tab-btn" class:lv-qc-symbol-tab-active={symbolTab === "pinyin"} onclick={() => setSymbolTab("pinyin")}>{t.quickCardSymbolPinyin ?? "拼音"}</button>
                        <button type="button" class="lv-qc-symbol-tab-btn" class:lv-qc-symbol-tab-active={symbolTab === "format"} onclick={() => setSymbolTab("format")}>{t.quickCardSymbolFormat ?? "格式"}</button>
                    </div>
                    <div class="lv-qc-symbol-chips">
                        {#if symbolTab === "math"}
                            <button type="button" class="lv-chip-tool" title="上标 x²" aria-label="上标 x²" onclick={() => insertSnippet("x^2")}>x²</button>
                            <button type="button" class="lv-chip-tool" title="根号 √x" aria-label="根号 √x" onclick={() => insertSnippet("\\sqrt{x}")}>√x</button>
                            <button type="button" class="lv-chip-tool" title="分式 a/b" aria-label="分式 a/b" onclick={() => insertSnippet("\\frac{a}{b}")}>a/b</button>
                            <button type="button" class="lv-chip-tool" title="求和 ∑" aria-label="求和 ∑" onclick={() => insertSnippet("\\sum_{i=1}^n")}>∑</button>
                            <button type="button" class="lv-chip-tool" title="积分 ∫" aria-label="积分 ∫" onclick={() => insertSnippet("\\int")}>∫</button>
                            <button type="button" class="lv-chip-tool" title="圆周率 π" aria-label="圆周率 π" onclick={() => insertSnippet("\\pi")}>π</button>
                            <button type="button" class="lv-chip-tool" title="正负号 ±" aria-label="正负号 ±" onclick={() => insertSnippet("\\pm")}>±</button>
                            <button type="button" class="lv-chip-tool" title="小于等于 ≤" aria-label="小于等于 ≤" onclick={() => insertSnippet("\\le")}>≤</button>
                            <button type="button" class="lv-chip-tool" title="大于等于 ≥" aria-label="大于等于 ≥" onclick={() => insertSnippet("\\ge")}>≥</button>
                            <button type="button" class="lv-chip-tool" title="无穷大 ∞" aria-label="无穷大 ∞" onclick={() => insertSnippet("\\infty")}>∞</button>
                            <button type="button" class="lv-chip-tool" title="希腊字母 α" aria-label="希腊字母 α" onclick={() => insertSnippet("\\alpha")}>α</button>
                            <button type="button" class="lv-chip-tool" title="希腊字母 β" aria-label="希腊字母 β" onclick={() => insertSnippet("\\beta")}>β</button>
                        {:else if symbolTab === "pinyin"}
                            {#each ["ā", "á", "ǎ", "à", "ō", "ó", "ǒ", "ò", "ē", "é", "ě", "è", "ī", "í", "ǐ", "ì", "ū", "ú", "ǔ", "ù", "ǖ", "ǘ", "ǚ", "ǜ"] as py (py)}
                                <button type="button" class="lv-chip-tool" aria-label={`拼音 ${py}`} onclick={() => insertSnippet(py)}>{py}</button>
                            {/each}
                        {:else if symbolTab === "format"}
                            <button type="button" class="lv-chip-tool" title="挖空标记" aria-label="挖空标记" onclick={() => insertSnippet("==答案==")}>==挖空==</button>
                            <button type="button" class="lv-chip-tool" title="加粗" aria-label="加粗" onclick={() => insertSnippet("**加粗**")}>**粗体**</button>
                            <button type="button" class="lv-chip-tool" title="行内代码" aria-label="行内代码" onclick={() => insertSnippet("`代码`")}>`代码`</button>
                            <button type="button" class="lv-chip-tool" title="行内公式" aria-label="行内公式" onclick={() => insertSnippet("$公式$")}>$公式$</button>
                            <button type="button" class="lv-chip-tool" title="块级公式" aria-label="块级公式" onclick={() => insertSnippet("\n$$\n公式\n$$\n")}>$$公式块$$</button>
                            <button type="button" class="lv-chip-tool" title="引用" aria-label="引用" onclick={() => insertSnippet("> ")}>&gt; 引用</button>
                        {/if}
                    </div>
                </div>
                <textarea
                    bind:this={qTextareaEl}
                    class="b3-text-field fn__block"
                    class:lv-drag-over={isDraggingOver}
                    aria-label={t.quickCardQ}
                    rows="4"
                    bind:value={q}
                    placeholder={template === "cloze" ? t.quickCardClozeHint : t.quickCardQ}
                    disabled={busy}
                    spellcheck="false"
                    onfocus={() => (lastFocusedField = "q")}
                    ondragover={onDragOver}
                    ondragleave={onDragLeave}
                    ondrop={onDrop}
                    onkeydown={(e) => {
                        if (template === "cloze" && (e.ctrlKey || e.metaKey) && (e.key === "h" || e.key === "H")) {
                            e.preventDefault();
                            e.stopPropagation();
                            insertCloze();
                        }
                    }}
                ></textarea>
                {#if q.length > 15 && (/(?:^|\n)\s*[A-D][.、:：\s]/m.test(q) || /(?:答案|解析)[:：]/i.test(q) || /[（(]\s*[A-D√×对错]\s*[)）]/.test(q))}
                    <div class="lv-qc-split-prompt" role="alert">
                        <span class="lv-qc-split-prompt-text">
                            <LvIcon name="zap" size={13} /> {t.quickCardSmartSplitPrompt ?? "检测到题干中包含选项或答案内容"}
                        </span>
                        <button
                            type="button"
                            class="b3-button b3-button--small lv-btn-primary"
                            onclick={() => applySmartSplit(q)}
                        >
                            ⚡ {t.quickCardSmartSplitApply ?? "一键自动拆分到各选项与答案"}
                        </button>
                    </div>
                {/if}
                {#if template === "cloze"}<div class="ft__smaller ft__on-surface lv-qc-help">{t.quickCardClozeHint}</div>{/if}
            </div>
            {#if template === "choice"}
                <!-- R59 选择/判断题专属样态：模式切换 + 选项行 + 正确项点选 + 解析 -->
                <div class="lv-qc-choice-modes" role="group" aria-label={t.quickCardChoiceModeLabel ?? "题型"}>
                    <button type="button" class="b3-button b3-button--small lv-studio-mode-btn" class:lv-studio-mode-active={choiceMode === "single"} aria-pressed={choiceMode === "single"} disabled={busy} onclick={() => setChoiceMode("single")}>
                        <span>{t.quickCardChoiceSingle ?? "单选"}</span>
                    </button>
                    <button type="button" class="b3-button b3-button--small lv-studio-mode-btn" class:lv-studio-mode-active={choiceMode === "multiple"} aria-pressed={choiceMode === "multiple"} disabled={busy} onclick={() => setChoiceMode("multiple")}>
                        <span>{t.quickCardChoiceMultiple ?? "多选"}</span>
                    </button>
                    <button type="button" class="b3-button b3-button--small lv-studio-mode-btn" class:lv-studio-mode-active={choiceMode === "judge"} aria-pressed={choiceMode === "judge"} disabled={busy} onclick={() => setChoiceMode("judge")}>
                        <span>{t.quickCardChoiceJudge ?? "判断"}</span>
                    </button>
                </div>
                {#if choiceMode !== "judge"}
                    <div class="lv-qc-options" role="group" aria-label={t.quickCardOptionsLabel ?? "选项（点击字母标记正确答案）"}>
                        {#each optionTexts as opt, i (i)}
                            <div class="lv-qc-option-row" class:lv-qc-option-correct={correctKeys.includes(OPTION_LETTERS[i])}>
                                <button
                                    type="button"
                                    class="lv-qc-option-key"
                                    class:lv-qc-option-key-on={correctKeys.includes(OPTION_LETTERS[i])}
                                    disabled={busy || !opt.text.trim()}
                                    title={t.quickCardMarkCorrect ?? "标记为正确答案"}
                                    aria-pressed={correctKeys.includes(OPTION_LETTERS[i])}
                                    onclick={() => toggleCorrectKey(OPTION_LETTERS[i])}
                                >{OPTION_LETTERS[i]}</button>
                                <input class="b3-text-field fn__flex-1" aria-label={`${t.quickCardOption ?? "选项"} ${OPTION_LETTERS[i]}`} placeholder={`${t.quickCardOption ?? "选项"} ${OPTION_LETTERS[i]}`} bind:value={opt.text} disabled={busy} />
                                {#if optionTexts.length > 2}
                                    <button type="button" class="b3-button b3-button--small lv-btn-ghost lv-btn-tool" aria-label={`${t.quickCardRemoveOption ?? "删除选项"} ${OPTION_LETTERS[i]}`} disabled={busy} onclick={() => removeOption(i)}>
                                        <LvIcon name="close" size={12} />
                                    </button>
                                {/if}
                            </div>
                        {/each}
                        {#if optionTexts.length < 6}
                            <button type="button" class="b3-button b3-button--small b3-button--outline lv-btn-tool" disabled={busy} onclick={addOption}>
                                <LvIcon name="plus" size={12} /> <span>{t.quickCardAddOption ?? "添加选项"}</span>
                            </button>
                        {/if}
                    </div>
                {:else}
                    <div class="lv-qc-judge-pick" role="group" aria-label={t.quickCardJudgePickLabel ?? "判定正确答案"}>
                        <span class="ft__smaller ft__on-surface">{t.quickCardJudgePickLabel ?? "判定正确答案"}：</span>
                        <button type="button" class="b3-button b3-button--small b3-button--outline lv-deck-quick-btn" class:lv-btn-primary={correctKeys[0] === "A"} aria-pressed={correctKeys[0] === "A"} disabled={busy} onclick={() => toggleCorrectKey("A")}>对</button>
                        <button type="button" class="b3-button b3-button--small b3-button--outline lv-deck-quick-btn" class:lv-btn-primary={correctKeys[0] === "B"} aria-pressed={correctKeys[0] === "B"} disabled={busy} onclick={() => toggleCorrectKey("B")}>错</button>
                    </div>
                {/if}
                <label class="lv-qc-field">
                    <div class="lv-qc-label-bar" style="margin-bottom: 4px;">
                        <span class="lv-qc-label">{t.quickCardAnalysis ?? "解析（可选，复习揭晓时显示）"}</span>
                    </div>
                    <input class="b3-text-field fn__block" aria-label={t.quickCardAnalysis ?? "解析（可选，复习揭晓时显示）"} placeholder={t.quickCardAnalysisPlaceholder ?? "一句话说明为什么选它"} bind:value={analysis} disabled={busy} />
                </label>
            {/if}
            {#if template !== "choice"}
                <label class="lv-qc-field">
                    <div class="lv-qc-label-bar" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                        <span class="lv-qc-label">{t.quickCardA} <span class="lv-qc-count" class:lv-qc-count-warn={a.length > 120}>{a.length} 字</span></span>
                    </div>
                    <textarea
                        bind:this={aTextareaEl}
                        class="b3-text-field fn__block"
                        aria-label={t.quickCardA}
                        rows="4"
                        bind:value={a}
                        placeholder={template === "superblock" ? (t.quickCardSuperBlockHint ?? "答案区支持多段文字，段落之间空行将自动拆分成独立的答案子块") : template === "formula" ? "输入公式表达式（如 E = mc^2）与推导解析" : t.quickCardA}
                        disabled={busy}
                        spellcheck="false"
                        onfocus={() => (lastFocusedField = "a")}
                    ></textarea>
                </label>
            {/if}
            {#if template === "qa"}
                <label class="lv-qc-bidi-toggle">
                    <input type="checkbox" class="lv-check" bind:checked={isBidirectional} disabled={busy} />
                    <span>{t.quickCardBidiLabel ?? "生成双向卡片（互为问答 A ↔ B）"}</span>
                </label>
            {/if}
            <div class="lv-qc-guidance">
                <p class="lv-qc-guidance-main">{t.quickCardOneFactHint}</p>
                {#if template === "choice"}
                    <p class="lv-qc-guidance-extra">{t.quickCardChoiceFormHint ?? "生成后复习端会呈现可点击的选项卡片；多选需点选全部正确项。"}</p>
                {:else if template === "qa"}
                    <p class="lv-qc-guidance-extra">{t.quickCardChoiceHint ?? "小提示：题面里按「A. … B. … C. … D. …」列出选项，复习时也能自动识别为可点击的选择题；也可以用「选择题」模板结构化编辑。"}</p>
                {:else if template === "cloze"}
                    <p class="lv-qc-guidance-extra">{t.quickCardClozeMoreHint ?? "小提示：一段话里挖 1–2 个关键词最有效；挖空越多，回忆线索越少。"}</p>
                {:else if template === "formula"}
                    <p class="lv-qc-guidance-extra">{t.quickCardFormulaHint ?? "小提示：支持 $E=mc^2$ 行内公式或独立公式块，复习时自动 KaTeX 高保真渲染。"}</p>
                {:else}
                    <p class="lv-qc-guidance-extra">{t.quickCardSuperMoreHint ?? "小提示：适合「一题多问」或分步骤的推导；每个问答对会生成独立卡片。"}</p>
                {/if}
            </div>
        </section>
        <section class="lv-qc-preview" aria-label={t.quickCardPreviewTitle}>
            <div class="lv-qc-preview-heading">
                <div class="lv-qc-preview-tags">
                    <span>{t.quickCardPreviewTitle}</span>
                    <span class="lv-chip2 lv-chip2--default">
                        {#if template === "choice"}<LvIcon name="check" size={14} /> {choiceMode === "judge" ? (t.cardTypeBadgeJudge ?? "判断") : choiceMode === "multiple" ? (t.cardTypeBadgeMulti ?? "多选") : (t.cardTypeBadgeChoice ?? "单选")}
                        {:else if template === "qa" && isBidirectional}<LvIcon name="swap" size={14} /> {t.cardTypeBadgeBidi ?? "双向"}
                        {:else if template === "superblock"}<LvIcon name="cards" size={14} /> {t.cardTypeBadgeSuperBlock ?? "超级块"}
                        {:else if template === "cloze"}<LvIcon name="edit" size={14} /> {t.cardTypeBadgeCloze ?? "挖空"}
                        {:else if template === "formula"}<LvIcon name="code" size={14} /> {t.quickCardTemplateFormula ?? "公式"}
                        {:else}<LvIcon name="message" size={14} /> {t.cardTypeBadgeQA ?? "问答"}
                        {/if}
                    </span>
                </div>
                <button type="button" class="b3-button b3-button--small b3-button--outline lv-btn-tool lv-qc-reveal" aria-expanded={previewAnswer} aria-controls="lv-qc-preview-face" onclick={() => (previewAnswer = !previewAnswer)}>
                    <LvIcon name="eye" size={13} /> <span>{previewAnswer ? t.quickCardHideAnswer : t.quickCardShowAnswer}</span>
                </button>
            </div>
            <div class="ft__smaller ft__on-surface lv-qc-preview-sub">{t.quickCardPreviewNote}</div>
            <div
                class="lv-qc-preview-face lv-unified-face"
                id="lv-qc-preview-face"
                role="button"
                tabindex="0"
                aria-label={t.quickCardPreviewTitle ?? "卡面预览"}
                aria-pressed={previewAnswer}
                title={previewAnswer ? (t.quickCardHideAnswer ?? "收起答案") : (t.quickCardShowAnswer ?? "查看答案")}
                onclick={() => { if (q.trim()) previewAnswer = !previewAnswer; }}
                onkeydown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && q.trim()) {
                        e.preventDefault();
                        previewAnswer = !previewAnswer;
                    }
                }}
            >
                <span class="lv-qc-preview-label">{t.quickCardPreviewFront}</span>
                {#if q.trim()}
                    {#if template === "choice"}
                        <p>{q}</p>
                        {#if choiceMode !== "judge"}
                            <div class="lv-qc-preview-options">
                                {#each nonEmptyOptions as o (o.key)}
                                    <span class="lv-qc-preview-option" class:lv-qc-preview-option-correct={previewAnswer && correctKeys.includes(o.key)}>{o.key}．{o.text}</span>
                                {/each}
                            </div>
                        {/if}
                    {:else if template === "cloze" && hasClozeMarker}
                        <p>{#each clozeParts as part, i (i)}{part}{#if i < clozeParts.length - 1}<span class="lv-qc-mask">{t.quickCardHiddenAnswer}</span>{/if}{/each}</p>
                    {:else if template === "superblock"}
                        <div class="lv-sb-question-section">
                            <p>{q}</p>
                        </div>
                        <div class="lv-card-answer-divider"></div>
                        <div class="lv-sb-answer-placeholder" aria-hidden="true">
                            <span class="lv-mask-slot">［ 超级块答案（{a.trim().split(/\n{2,}/).filter(Boolean).length || 1} 块内容）· 点击查看答案揭晓 ］</span>
                        </div>
                    {:else}
                        <p>{q}{#if template === "qa" && a.trim()}<span class="lv-qc-mask">{t.quickCardHiddenAnswer}</span>{/if}</p>
                    {/if}
                {:else}
                    <p class="lv-qc-placeholder">{t.quickCardPreviewEmpty}</p>
                {/if}
                {#if previewAnswer}
                    <div class="lv-qc-preview-answer">
                        <span class="lv-qc-preview-label">{t.quickCardPreviewBack}</span>
                        {#if template === "choice"}
                            <p>{serializeChoiceCard().aText}</p>
                        {:else if template === "cloze" && hasClozeMarker && a.trim()}
                            <p>{q.split("____").join(a)}</p>
                        {:else if a.trim()}
                            <p>{a}</p>
                        {:else}
                            <p class="lv-qc-placeholder">{t.quickCardPreviewEmpty}</p>
                        {/if}
                    </div>
                {/if}
            </div>
        </section>
    </div>
    {#if overloadNotice.overloaded}
        <div class="lv-qc-overload-tip" role="status">
            <div class="lv-qc-overload-main">
                <div class="lv-qc-overload-badges">
                    {#each overloadNotice.issues as issue (issue.kind)}
                        <span class="lv-chip2 lv-chip2--warn" title={issue.detail}>{issue.label}</span>
                    {/each}
                </div>
                <div>{overloadNotice.suggestion}</div>
            </div>
            {#if overloadNotice.splitDrafts.length >= 2}
                <div class="lv-qc-split-actions">
                    <button
                        type="button"
                        class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                        disabled={busy}
                        onclick={() => (showSplitPreview = !showSplitPreview)}
                    >
                        <LvIcon name="eye" size={12} />
                        <span>{showSplitPreview ? "收起拆卡预览" : `预览拆分（${overloadNotice.splitDrafts.length} 张）`}</span>
                    </button>
                    <button
                        type="button"
                        class="b3-button b3-button--small lv-btn-primary lv-btn-tool"
                        disabled={busy || !canCreateDeck}
                        onclick={confirmSplitCreate}
                    >
                        <LvIcon name="zap" size={12} />
                        <span>一键拆分为 {overloadNotice.splitDrafts.length} 张原子卡入组</span>
                    </button>
                </div>
                {#if showSplitPreview}
                    <ol class="lv-qc-split-list">
                        {#each overloadNotice.splitDrafts as draft, idx (idx)}
                            <li><strong>#{idx + 1} 问：</strong>{draft.q} <span class="ft__on-surface">→</span> <strong>答：</strong>{draft.a}</li>
                        {/each}
                    </ol>
                {/if}
            {/if}
        </div>
    {/if}
    {#if createdNotice}
        {#key createdNotice}
        <div class="lv-qc-success" role="status" aria-live="polite">
            <LvIcon name="check" size={15} />
            <span class="lv-qc-success-text">{createdNotice}</span>
            <span class="lv-qc-success-hint">{t.quickCardContinueHint ?? "可继续写下一张"}</span>
        </div>
        {/key}
    {/if}
    {#if errorMsg}
        <div class="ft__smaller lv-qc-error" role="alert" aria-live="assertive">{errorMsg}</div>
    {/if}
    <div class="b3-dialog__action lv-qc-actions">
        {#if !embedded || lvLaunchpad.isMobileFrontend()}
            <button
                class="b3-button b3-button--cancel"
                disabled={busy}
                title={`${window.siyuan.languages.cancel} (Esc)`}
                aria-keyshortcuts="Escape"
                onclick={onClose}
            >
                {window.siyuan.languages.cancel}
            </button>
        {/if}
        <button
            class="b3-button lv-btn-primary"
            disabled={!canSubmit}
            aria-keyshortcuts={isMac ? "Meta+Enter" : "Control+Enter"}
            title={`${t.quickCardCreate} (${isMac ? "⌘+Enter" : "Ctrl+Enter"})`}
            onclick={confirm}
        >
            {t.quickCardCreate} <LvKbd k={isMac ? "⌘ ↵" : "Ctrl ↵"} />
        </button>
    </div>
</div>

<style>
    .lv-quickcard {
        width: 100%;
        flex: 1 1 auto;
        min-width: 0;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        padding: var(--lv-sp-4);
        container: lv-quickcard / inline-size;
        box-sizing: border-box;
    }
    :global(.lv-mobile-sheet-dialog) .lv-quickcard {
        height: 100%;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        overflow-x: hidden;
        padding: var(--lv-sp-3) var(--lv-sp-3) 0;
    }
    .lv-qc-steps {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-3);
        flex-wrap: wrap;
    }
    .lv-qc-close-icon {
        margin-left: auto;
        color: var(--lv-color-text-muted);
        cursor: pointer;
        padding: var(--lv-sp-1);
        min-height: 44px;
        min-width: 44px;
        width: 44px;
        height: 44px;
        border-radius: var(--lv-r-circle);
        display: grid;
        place-items: center;
        touch-action: manipulation;
    }
    .lv-qc-close-icon:hover {
        background: color-mix(in srgb, var(--lv-color-text) 8%, transparent);
        color: var(--lv-color-text);
    }
    .lv-qc-doc-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--lv-sp-2);
        padding: calc(var(--lv-space-unit) * 3) calc(var(--lv-space-unit) * 6);
        margin-bottom: var(--lv-sp-3);
        border-radius: var(--lv-r-m);
        background: color-mix(in srgb, var(--lv-primary-soft) 40%, var(--lv-color-surface));
        border: 1px solid var(--lv-primary-border);
        font-size: var(--lv-type-meta-size);
    }
    .lv-qc-doc-info {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--lv-color-brand);
        font-weight: var(--lv-fw-medium);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 60%;
    }
    .lv-qc-doc-controls {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 4);
    }
    .lv-qc-doc-checkbox {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        user-select: none;
    }
    .lv-qc-overload-tip {
        margin: var(--lv-sp-2) 0;
        padding: calc(var(--lv-space-unit) * 4) calc(var(--lv-space-unit) * 7);
        border-radius: var(--lv-r-m);
        background: var(--lv-warn-soft);
        border: 1px solid color-mix(in srgb, var(--lv-color-warning) 28%, transparent);
        color: var(--lv-color-on-warning-soft);
        font-size: var(--lv-type-control-size);
        line-height: var(--lv-lh-meta);
        max-width: 56em;
        text-wrap: pretty;
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);
    }
    .lv-qc-overload-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 4px;
    }
    .lv-qc-split-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--lv-sp-2);
        align-items: center;
    }
    .lv-qc-split-list {
        margin: 4px 0 0;
        padding-left: 18px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: var(--lv-type-meta-size);
    }
    .lv-qc-steps {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        flex-wrap: wrap;
        padding: 8px 12px;
        border-radius: var(--lv-r-m);
        background: color-mix(in srgb, var(--lv-color-brand) 5%, var(--lv-color-surface));
        border: 1px solid color-mix(in srgb, var(--lv-color-brand) 14%, var(--lv-border));
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-meta-size);
        margin-bottom: var(--lv-sp-3);
    }
    .lv-qc-step {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }
    .lv-qc-step b {
        display: inline-grid;
        width: 16px;
        height: 16px;
        place-items: center;
        border-radius: var(--lv-r-circle);
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
        font-size: 10px;
        font-weight: var(--lv-fw-bold);
    }
    .lv-qc-toolbar {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: calc(var(--lv-space-unit) * 10);
        margin-bottom: var(--lv-sp-4);
        padding-bottom: var(--lv-sp-3);
        border-bottom: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent);
    }
    .lv-qc-template {
        display: inline-flex;
        padding: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline));
        border-radius: var(--lv-r-pill);
        background: color-mix(in srgb, var(--lv-color-text) 6%, transparent);
        border: 1px solid var(--lv-border);
        gap: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline));
    }
    .lv-qc-template button {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 3);
        min-height: 38px;
        padding: 0 calc(var(--lv-space-unit) * 8);
        border: none;
        border-radius: var(--lv-r-pill);
        background: transparent;
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-control-size);
        font-weight: var(--lv-fw-emphasis);
        cursor: pointer;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        transition: transform var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease), border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease), opacity var(--lv-dur-1) var(--lv-ease);
    }
    .lv-qc-template button:hover:not(:disabled) {
        color: var(--lv-color-text);
        background: color-mix(in srgb, var(--lv-color-text) 4%, transparent);
    }
    .lv-qc-template button:focus-visible,
    .lv-qc-reveal:focus-visible,
    .lv-qc-toolbar :global(input:focus-visible),
    .lv-qc-toolbar :global(select:focus-visible),
    .lv-qc-editor :global(textarea:focus-visible) {
        outline: none;
        box-shadow: var(--lv-focus-ring);
        border-color: var(--lv-color-brand);
    }
    :global(.lv-drag-over) {
        border-color: var(--b3-theme-primary) !important;
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, transparent) !important;
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 30%, transparent) !important;
    }
    .lv-qc-template button:disabled { cursor: not-allowed; opacity: .55; }
    .lv-qc-template button.lv-qc-template-active {
        background: var(--lv-color-surface);
        color: var(--lv-color-brand);
        font-weight: var(--lv-fw-bold);
        box-shadow: 0 2px 8px color-mix(in srgb, black 6%, transparent), var(--lv-inset-shine);
    }
    .lv-qc-content { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--lv-sp-4); align-items: start; }
    .lv-qc-editor { min-width: 0; }
    .lv-qc-deck { flex: 1 1 320px; max-width: 520px; margin: 0; }
    .lv-qc-deck-inputs {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        select { flex: 1 1 180px; }
        .lv-qc-new { flex: 1 1 200px; margin: 0; }
    }
    .lv-qc-label-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--lv-sp-2); }
    .lv-qc-count {
        margin-left: 6px;
        font-size: var(--lv-type-caption-size);
        font-weight: var(--lv-fw-normal);
        color: var(--lv-color-text-muted);
        font-variant-numeric: tabular-nums;
    }
    .lv-qc-count-warn { color: var(--lv-color-warning); font-weight: var(--lv-fw-semibold); }
    /* R59 选择/判断题表单样态 */
    .lv-qc-choice-modes {
        display: inline-flex;
        gap: calc(var(--lv-space-unit) * 1);
        margin-bottom: var(--lv-sp-3);
    }
    .lv-qc-options {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-3);
    }
    .lv-qc-option-row {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
    }
    .lv-qc-option-key {
        display: grid;
        width: 28px;
        height: 28px;
        flex: none;
        place-items: center;
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-circle);
        background: var(--lv-color-surface);
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-caption-size);
        font-weight: var(--lv-fw-bold);
        cursor: pointer;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        transition: border-color var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease);
    }
    .lv-qc-option-key-on {
        border-color: var(--lv-color-brand);
        background: var(--lv-color-brand);
        color: var(--lv-color-on-brand);
    }
    .lv-qc-option-correct input { border-color: var(--lv-primary-border); }
    .lv-qc-judge-pick {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-3);
    }
    .lv-qc-preview-options {
        display: flex;
        flex-direction: column;
        gap: calc(var(--lv-space-unit) * 1);
        margin-top: calc(var(--lv-space-unit) * 2);
    }
    .lv-qc-preview-option {
        padding: calc(var(--lv-space-unit) * 1) calc(var(--lv-space-unit) * 3);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-s);
        font-size: var(--lv-type-control-size);
    }
    .lv-qc-preview-option-correct {
        border-color: var(--lv-color-brand);
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
        font-weight: var(--lv-fw-semibold);
    }
    /* R53：表单控件撑满面板宽度（宿主 .b3-text-field 默认定宽） */
    .lv-quickcard :global(.b3-text-field),
    .lv-quickcard :global(.b3-select) {
        width: 100%;
        touch-action: manipulation;
        transition: border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease);
    }
    .lv-quickcard .lv-qc-field { margin-bottom: var(--lv-sp-3); }
    .lv-qc-bidi-toggle {
        display: inline-flex;
        align-items: center;
        gap: var(--lv-sp-2);
        font-size: var(--lv-type-control-size);
        color: var(--lv-color-text-muted);
        cursor: pointer;
        margin-bottom: var(--lv-sp-2);
        user-select: none;
        &:hover { color: var(--lv-color-text); }
    }
    .lv-quickcard .lv-qc-label {
        font-size: var(--lv-type-control-size);
        font-weight: var(--lv-fw-semibold);
        color: var(--lv-color-text-muted);
        margin-bottom: var(--lv-sp-1);
    }
    .lv-quickcard .lv-qc-new { margin-top: 0; }
    .lv-quickcard .lv-qc-deck-hint { margin-top: var(--lv-sp-1); }
    .lv-qc-deck-error { display: flex; align-items: center; gap: var(--lv-sp-2); margin-top: var(--lv-sp-1); color: var(--lv-color-danger); font-size: 12px; overflow-wrap: anywhere; }
    .lv-quickcard .lv-qc-help { margin-top: calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline)); }
    .lv-qc-guidance {
        margin: 0;
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-control-size);
        line-height: var(--lv-lh-reading, 1.65);
        max-width: 48em;
        text-wrap: pretty;
    }
    .lv-qc-preview { display: flex; min-width: 0; flex-direction: column; gap: var(--lv-sp-2); margin: 0; }
    .lv-qc-preview-heading { display: flex; justify-content: space-between; align-items: center; gap: calc(var(--lv-space-unit) * 4); font-size: var(--lv-type-body-size); font-weight: var(--lv-fw-semibold); }
    .lv-qc-preview-tags { display: inline-flex; align-items: center; gap: var(--lv-sp-2); }
    .lv-qc-preview-sub { margin-bottom: calc(var(--lv-space-unit) * 1); color: var(--lv-color-text-muted); font-size: var(--lv-type-meta-size); }
    .lv-qc-reveal {
        border-radius: var(--lv-r-pill);
        padding: calc(var(--lv-space-unit) * 2) calc(var(--lv-space-unit) * 6);
        font-size: var(--lv-type-control-size);
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline));
    }
    .lv-qc-preview-face {
        min-width: 0;
        min-height: 258px;
        padding: calc(var(--lv-space-unit) * 12);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-dialog);
        background: var(--lv-color-surface);
        box-shadow: var(--lv-shadow-1), var(--lv-inset-shine);
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
        transition: border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-2) var(--lv-ease);

        &:hover { border-color: var(--lv-primary-border); box-shadow: var(--lv-shadow-2), var(--lv-inset-shine); }
        &:focus-visible { outline: none; box-shadow: var(--lv-focus-ring); border-color: var(--lv-color-brand); }
        display: flex;
        flex-direction: column;
        justify-content: center;
        transition: box-shadow var(--lv-dur-2) var(--lv-ease), border-color var(--lv-dur-2) var(--lv-ease);
    }
    .lv-qc-preview-label {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 2);
        padding: calc(var(--lv-space-unit) * 1) calc(var(--lv-space-unit) * 4);
        border-radius: var(--lv-r-pill);
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
        font-size: var(--lv-type-meta-size);
        font-weight: var(--lv-fw-semibold);
        width: fit-content;
    }
    .lv-qc-preview-face p { margin: calc(var(--lv-space-unit) * 8) 0 0; font-size: 18px; line-height: var(--lv-lh-loose); white-space: pre-wrap; overflow-wrap: anywhere; max-width: 48em; text-wrap: pretty; }
    .lv-qc-preview-answer { margin-top: calc(var(--lv-space-unit) * 9); padding-top: 16px; border-top: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent); }
    .lv-qc-preview-answer p { margin-top: calc(var(--lv-space-unit) * 4); }
    .lv-qc-mask {
        display: inline-block;
        margin-left: calc(var(--lv-space-unit) * 2);
        padding: var(--lv-space-hairline) calc(var(--lv-space-unit) * 3);
        border-radius: var(--lv-r-tag);
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
        font-size: var(--lv-type-meta-size);
        font-weight: var(--lv-fw-emphasis);
        border: 1px dashed var(--lv-primary-border);
    }
    .lv-qc-placeholder { color: var(--lv-color-text-muted); opacity: .65; }
    .lv-qc-reveal { align-self: flex-start; min-height: 44px; }
    .lv-qc-guidance {
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .lv-qc-guidance-main { margin: 0; color: var(--lv-color-text-muted); font-size: var(--lv-type-meta-size); }
    .lv-qc-guidance-extra {
        margin: 0;
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-caption-size);
        opacity: 0.85;
    }
    .lv-qc-success {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin: var(--lv-sp-2) 0;
        padding: 10px 14px;
        border-radius: var(--lv-r-m);
        background: color-mix(in srgb, var(--lv-color-success) 8%, var(--lv-color-surface));
        border: 1px solid color-mix(in srgb, var(--lv-color-success) 26%, transparent);
        color: var(--lv-color-success);
        font-size: var(--lv-type-control-size);
        font-weight: var(--lv-fw-medium);
        max-width: 100%;
        box-sizing: border-box;
        /* Mobile Spec v1：制卡成功 inline 微动效（随 {#key} 重放） */
        animation: lvQcSuccessPop 0.26s var(--lv-ease, ease) both;
    }
    @keyframes lvQcSuccessPop {
        from { opacity: 0; transform: translateY(3px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
        .lv-qc-success { animation: none; }
    }
    /* Mobile Spec v1：牌组 chips（桌面隐藏，≤780px 容器内启用） */
    .lv-qc-deck-chips { display: none; }
    .lv-qc-success-text { color: var(--lv-color-success); }
    .lv-qc-success-hint {
        margin-left: auto;
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-meta-size);
        font-weight: var(--lv-fw-normal);
    }
    @container lv-quickcard (min-width: 781px) {
        .lv-qc-content { grid-template-columns: minmax(0, 1fr) minmax(300px, .88fr); gap: 20px; }
        .lv-qc-preview { position: sticky; top: var(--lv-sp-4); }
    }
    @container lv-quickcard (max-width: 780px) {
        .lv-qc-toolbar {
            flex-direction: column;
            align-items: stretch;
            gap: var(--lv-sp-3);
        }
        .lv-qc-template {
            display: flex;
            max-width: 100%;
            overflow-x: auto;
            scrollbar-width: none;
            flex-wrap: nowrap;
            -webkit-overflow-scrolling: touch;
            &::-webkit-scrollbar { display: none; }
            button {
                flex: none;
                white-space: nowrap;
                padding: 0 var(--lv-sp-3);
            }
        }
        .lv-qc-deck { width: 100%; max-width: none; }
        .lv-qc-preview-face { min-height: 180px; }
        /* Mobile Spec v1：牌组 chips 化——下拉+新建输入行收起，chips 横滑直选（空库新建输入不受影响） */
        .lv-qc-deck-inputs--pick { display: none; }
        .lv-qc-deck-chips {
            display: flex;
            flex-wrap: nowrap;
            gap: 8px;
            margin: 2px 0 6px;
            padding-bottom: 4px;
            overflow-x: auto;
            overscroll-behavior-x: contain;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
        }
        .lv-qc-deck-chips::-webkit-scrollbar { display: none; }
        .lv-qc-deck-chip {
            flex: none;
            max-width: 48%;
            min-height: 44px;
            display: inline-flex;
            align-items: center;
            padding: 0 14px;
            border: 1px solid var(--lv-border);
            border-radius: 999px;
            background: var(--lv-color-surface);
            color: var(--lv-color-text);
            font-size: var(--lv-type-control-size);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            cursor: pointer;
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;
            -webkit-tap-highlight-color: transparent;
            transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;

            &:active { transform: scale(0.96); }
            &:focus-visible { outline: none; box-shadow: var(--lv-focus-ring); }
        }
        .lv-qc-deck-chip-active {
            border-color: var(--lv-primary-border);
            background: var(--lv-primary-soft);
            color: var(--lv-color-brand);
            font-weight: var(--lv-fw-semibold);
        }
        /* 大输入框：拇指键盘舒适区；16px 防 iOS 聚焦自动放大 */
        .lv-qc-editor textarea.b3-text-field {
            min-height: 120px;
            font-size: 16px;
            line-height: 1.6;
        }
        /* 大保存按钮固定可见：软键盘弹起时随 --lv-vv-h 吸附在可视底部 */
        .lv-qc-actions {
            position: sticky;
            bottom: 0;
            z-index: var(--lv-z-card-control);
            margin-top: auto;
            justify-content: stretch;
            background: var(--lv-color-surface);
            border-top: 1px solid var(--lv-border);
            padding: var(--lv-sp-2) 0 max(var(--lv-sp-2), env(safe-area-inset-bottom));
        }
        .lv-qc-actions .b3-button--cancel {
            min-height: 46px;
            min-width: 72px;
        }
        .lv-qc-actions .lv-btn-primary {
            flex: 1;
            min-height: 46px;
            font-size: var(--lv-type-body-size);
        }
    }
    @container lv-quickcard (max-width: 480px) {
        .lv-qc-preview-heading { flex-direction: column; gap: 3px; }
        .lv-qc-preview-face { padding: calc(var(--lv-space-unit) * 10); }
    }
    .lv-quickcard .lv-qc-error {
        color: var(--lv-color-danger);
        margin-bottom: var(--lv-sp-2);
        max-width: 48em;
        text-wrap: pretty;
        line-height: var(--lv-lh-reading, 1.65);
    }
    .lv-quickcard .b3-button {
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
    .lv-quickcard .lv-qc-actions {
        justify-content: flex-end;
        gap: var(--lv-sp-2);
    }
    .lv-quickcard .lv-qc-actions :global(.lv-kbd2) {
        margin-left: calc(var(--lv-space-unit) * 3);
        /* 宿主 b3-typography kbd 是白底——主按钮内回到透明 + on-primary 描边 */
        background: transparent;
        color: var(--lv-color-on-brand);
        border-color: color-mix(in srgb, var(--lv-color-on-brand) 40%, transparent);
        opacity: 0.9;
    }
    .lv-quickcard .b3-dialog__action { justify-content: flex-end; }
    .lv-qc-mand-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: var(--lv-sp-3);
        padding: 6px 12px;
        background: var(--lv-color-surface);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        font-size: var(--lv-type-caption-size);
    }
    .lv-qc-mand-title {
        font-weight: var(--lv-fw-semibold);
        color: var(--lv-color-text-muted);
    }
    .lv-qc-mand-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: var(--lv-r-tag);
        font-size: 11px;
        border: 1px solid var(--lv-border);
        background: transparent;
        cursor: pointer;
        transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, color 0.15s ease, opacity 0.15s ease;
    }
    .lv-qc-mand-ok {
        border-color: color-mix(in srgb, var(--lv-color-success) 40%, transparent);
        background: color-mix(in srgb, var(--lv-color-success) 10%, transparent);
        color: var(--lv-color-success);
        font-weight: var(--lv-fw-medium);
    }
    .lv-qc-mand-err {
        border-color: color-mix(in srgb, var(--lv-color-danger) 40%, transparent);
        background: color-mix(in srgb, var(--lv-color-danger) 10%, transparent);
        color: var(--lv-color-danger);
    }
    .lv-qc-mand-status {
        margin-left: auto;
        color: var(--lv-color-text-muted);
        font-size: 11px;
    }
    .lv-qc-mand-status--ready {
        color: var(--lv-color-success);
        font-weight: var(--lv-fw-medium);
        display: inline-flex;
        align-items: center;
        gap: 3px;
    }
    .lv-qc-smart-paste-card {
        margin-bottom: var(--lv-sp-3);
        padding: 12px 14px;
        background: color-mix(in srgb, var(--lv-primary-soft) 30%, var(--lv-color-surface));
        border: 1px solid var(--lv-primary-border);
        border-radius: var(--lv-r-m);
        box-shadow: var(--lv-shadow-1);
    }
    .lv-qc-smart-paste-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
    }
    .lv-qc-smart-paste-title {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--lv-color-brand);
        font-size: var(--lv-type-control-size);
    }
    .lv-qc-smart-paste-input {
        margin-bottom: 8px;
        resize: vertical;
    }
    .lv-qc-smart-paste-foot {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .lv-qc-symbol-dock {
        margin-bottom: 6px;
        padding: 4px 8px;
        background: var(--lv-color-surface);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-s);
        display: flex;
        align-items: center;
        gap: 8px;
        overflow-x: auto;
    }
    .lv-qc-symbol-tabs {
        display: inline-flex;
        gap: 2px;
        border-right: 1px solid var(--lv-border);
        padding-right: 6px;
        flex-shrink: 0;
    }
    .lv-qc-symbol-tab-btn {
        padding: 2px 6px;
        font-size: 11px;
        border: none;
        background: transparent;
        color: var(--lv-color-text-muted);
        border-radius: 4px;
        cursor: pointer;
    }
    .lv-qc-symbol-tab-active {
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
        font-weight: var(--lv-fw-bold);
    }
    .lv-qc-symbol-chips {
        display: inline-flex;
        gap: 4px;
        align-items: center;
        flex-wrap: nowrap;
        overflow-x: auto;
    }
    .lv-chip-tool {
        padding: 1px 6px;
        font-size: 11px;
        border: 1px solid var(--lv-border);
        background: var(--lv-color-surface);
        color: var(--lv-color-text);
        border-radius: 4px;
        cursor: pointer;
        flex-shrink: 0;
        &:hover {
            border-color: var(--lv-color-brand);
            color: var(--lv-color-brand);
        }
    }
    .lv-qc-split-prompt {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 6px;
        padding: 6px 10px;
        background: color-mix(in srgb, var(--lv-primary-soft) 25%, var(--lv-color-surface));
        border: 1px dashed var(--lv-primary-border);
        border-radius: var(--lv-r-s);
    }
    .lv-qc-split-prompt-text {
        font-size: 12px;
        color: var(--lv-color-text);
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
</style>
