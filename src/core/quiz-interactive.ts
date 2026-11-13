/**
 * 交互式题型识别与选项解析引擎（纯逻辑、零依赖、可在 Node/浏览器环境无缝运行与单测）。
 * 针对单选题、多选题、判断题与填空题，从笔记 Markdown、DOM 树或块属性（custom-exam-*）中
 * 提取结构化题干、选项列表、对错标记与参考解析，供复习端呈现精美可点击的选项卡片与互动槽位。
 */

import { gradeTyping, type TypingGrade, type Rating1to4 } from "./card-types";

export type QuizInteractiveKind = "choice" | "judge" | "fill" | "free-recall";

export interface InteractiveOption {
    key: string;        // "A", "B", "C", "D" 等
    text: string;       // 选项内容文本
    isAnswer: boolean;  // 是否为正确答案（若已知）
}

export interface InteractiveQuizData {
    kind: QuizInteractiveKind;
    stem: string;                      // 纯净题干文本或 HTML
    options: InteractiveOption[];      // 选择题选项列表
    isMultiple: boolean;               // 是否为多选
    judgeAnswer: boolean | null;       // 判断题答案（true=对/正，false=错/负，null=未知）
    fillExpected: string;              // 填空题期望答案文本
    analysis: string;                  // 参考解析/解题思路
    hasInteractiveWidgets: boolean;    // 是否具备可交互控件（选择题选项、判断按钮或打字框）
}

/**
 * 清洗去除 HTML 标签与空白符
 */
function cleanText(raw: string): string {
    if (!raw) return "";
    return raw
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * 校验某个选项是否匹配已知答案（支持字母代号、"答案：B"、全称文本等多重形态）
 */
export function checkIsAnswer(key: string, optionText: string, knownAnswer: string): boolean {
    if (!knownAnswer) return false;
    const cleanKnown = cleanText(knownAnswer).trim();
    if (!cleanKnown) return false;

    // 1. 若 knownAnswer 直接是纯字母（如 "B"、"BC"、"A,B"、"A / C"）
    const upperKnown = cleanKnown.toUpperCase();
    if (/^[A-Za-z\s,\/、·]+$/.test(cleanKnown)) {
        if (upperKnown.includes(key.toUpperCase())) return true;
    }

    // 2. 若 knownAnswer 开头是字母加分隔符（如 "B. 25%"、"B、北京"）
    const leadMatch = cleanKnown.match(/^([A-Za-z])[\.\、\:\：\s]/i);
    if (leadMatch && leadMatch[1].toUpperCase() === key.toUpperCase()) return true;

    // 3. 若包含前缀（如 "答案：B"、"正确选项：B"）
    const ansMatch = cleanKnown.match(/(?:答案|选择|选项|正确)[：:\s]*([A-Za-z])/i);
    if (ansMatch && ansMatch[1].toUpperCase() === key.toUpperCase()) return true;

    // 4. 若选项内容文本直接匹配答案（如 optionText="北京"，knownAnswer="北京"）
    const cleanOpt = cleanText(optionText).trim();
    if (cleanOpt && (cleanOpt === cleanKnown || cleanKnown.includes(cleanOpt) || (cleanOpt.length >= 2 && cleanOpt.includes(cleanKnown)))) {
        return true;
    }

    return false;
}

/**
 * 解析并提取题干中的选项列表（如 A. 20%  B. 25% 等）
 */
export function extractChoiceOptionsFromText(content: string, knownAnswer = ""): InteractiveOption[] {
    const text = String(content ?? "");
    const options: InteractiveOption[] = [];

    // 1. 按行或列表项逐项扫描：支持 "A. 选项"、"A、选项"、"A: 选项"、"- A. 选项"、"* A. 选项"、"• A. 选项"
    const lines = text.split(/\r?\n|<br\s*\/?>|<\/li>|<\/div>|<\/p>/i);
    const optRegex = /^\s*(?:[•·●\-\*\+]\s*)?(?:<[^>]*>)*([A-Fa-f])[\.\、\:\：\s]\s*(.+)$/;

    for (const line of lines) {
        const cleaned = cleanText(line);
        const match = cleaned.match(optRegex);
        if (match) {
            const key = match[1].toUpperCase();
            const optionText = match[2].trim();
            // 避免重复追加同一字母
            if (!options.some(o => o.key === key) && optionText) {
                options.push({
                    key,
                    text: optionText,
                    isAnswer: checkIsAnswer(key, optionText, knownAnswer),
                });
            }
        }
    }

    // 2. 如果分行没拆出来，尝试单行内多选项正则扫描（如 "A. 20% B. 25% C. 80% D. 125%"）
    if (options.length < 2) {
        const inlineRegex = /(?:^|\s+)([A-Fa-f])[\.\、\:\：]\s*([^\sA-Fa-f\.\、\:\：][^A-Fa-f\.\、\:\：]*?)(?=(?:\s+[A-Fa-f][\.\、\:\：])|$)/g;
        let m: RegExpExecArray | null;
        const inlineOpts: InteractiveOption[] = [];
        while ((m = inlineRegex.exec(cleanText(text))) !== null) {
            const key = m[1].toUpperCase();
            const optionText = m[2].trim();
            if (!inlineOpts.some(o => o.key === key) && optionText) {
                inlineOpts.push({
                    key,
                    text: optionText,
                    isAnswer: checkIsAnswer(key, optionText, knownAnswer),
                });
            }
        }
        if (inlineOpts.length >= 2) {
            return inlineOpts;
        }
    }

    return options;
}

/**
 * 解析判断题答案布尔值
 */
export function parseJudgeAnswer(answerText: string): boolean | null {
    const raw = cleanText(answerText).toLowerCase();
    if (!raw) return null;
    if (["t", "true", "对", "正确", "√", "1", "yes", "y", "v"].includes(raw)) return true;
    if (["f", "false", "错", "错误", "×", "x", "0", "no", "n"].includes(raw)) return false;
    return null;
}

/**
 * 从可能混杂选项的内容中干净提取纯题干（剥离 A/B/C/D 选项部分）
 */
export function extractStemFromChoice(content: string, options: InteractiveOption[]): string {
    if (!content || !options || options.length < 2) return cleanText(content);
    const lines = content.split(/\r?\n|<br\s*\/?>|<\/p>|<\/li>|<\/div>/i);
    const stemLines: string[] = [];
    let matchedOption = false;
    for (const line of lines) {
        const cleaned = cleanText(line);
        if (/^\s*(?:[•·●\-\*\+]\s*)?(?:<[^>]*>)*[A-Za-z][\.\、\:\：\s]/i.test(cleaned)) {
            matchedOption = true;
            break;
        }
        stemLines.push(line);
    }
    if (matchedOption && stemLines.length > 0) {
        const res = cleanText(stemLines.join(" ")).trim();
        if (res.length > 0) return res;
    }
    return cleanText(content)
        .replace(/(?:^|\s+)(?:[•·●\-\*\+]\s*)?[A-Za-z][\.\、\:\：\s].*$/i, "")
        .trim();
}

/**
 * 针对选择题 HTML 内容，清理掉已被提取为交互式按钮的原生列表和选项段落，避免卡面上重复显示
 */
export function cleanChoiceHtml(html: string, options: InteractiveOption[]): string {
    if (!html || !options || options.length < 2 || typeof document === "undefined") return html;
    try {
        const template = document.createElement("template");
        template.innerHTML = html;
        // 1. 移除列表 (NodeList, ul, ol, .list)
        template.content.querySelectorAll(":is([data-type='NodeList'], .list, ul, ol)").forEach(el => el.remove());
        // 2. 移除单独成段的选项段落 (以 A.、B.、• A. 开头)
        const optRegex = /^\s*(?:[•·●\-\*\+]\s*)?(?:<[^>]*>)*[A-Za-z][\.\、\:\：\s]/i;
        template.content.querySelectorAll(":is([data-type='NodeParagraph'], p, .p)").forEach(el => {
            const text = (el.textContent ?? "").trim();
            if (optRegex.test(text)) {
                el.remove();
            }
        });
        const result = template.innerHTML.trim();
        return result || html;
    } catch {
        return html;
    }
}

/**
 * 综合分析卡片属性与正文，生成完整的交互式题型模型
 */
export function parseInteractiveQuiz(params: {
    markdown?: string;
    domHtml?: string;
    attrs?: Record<string, string>;
    cardMemo?: string;
    expectedText?: string;
}): InteractiveQuizData {
    const { markdown = "", domHtml = "", attrs = {}, cardMemo = "", expectedText = "" } = params;
    const fullContent = `${markdown}\n${domHtml}\n${cardMemo}`;

    // 1. 读取可能存在的插件/生态元数据属性
    const examType = String(attrs["custom-exam-type"] || attrs["exam-type"] || "").toLowerCase();
    const examAnswer = String(attrs["custom-exam-answer"] || attrs["exam-answer"] || attrs["custom-card-answer"] || "").trim();
    const examAnalysis = String(attrs["custom-exam-analysis"] || attrs["exam-analysis"] || attrs.memo || attrs["custom-memo"] || "").trim();

    // 2. 检查是否为选择题（单选或多选）
    const knownAnswer = examAnswer || expectedText || cardMemo || "";
    const extractedOptions = extractChoiceOptionsFromText(fullContent, knownAnswer);

    if (examType === "single" || examType === "multiple" || extractedOptions.length >= 2) {
        const isMultiple = examType === "multiple" || (/^[A-Za-z\s,\/、]+$/.test(cleanText(knownAnswer)) && cleanText(knownAnswer).replace(/[^A-Za-z]/g, "").length > 1);
        return {
            kind: "choice",
            stem: extractStemFromChoice(markdown || domHtml, extractedOptions),
            options: extractedOptions,
            isMultiple,
            judgeAnswer: null,
            fillExpected: knownAnswer,
            analysis: examAnalysis,
            hasInteractiveWidgets: extractedOptions.length >= 2,
        };
    }

    // 3. 检查是否为判断题
    const judgeVal = parseJudgeAnswer(examAnswer || expectedText || cardMemo);
    const isJudgeStem = /【判断(?:示例|题)?】|判断题|正误题|判断下列/i.test(fullContent);
    if (examType === "judge" || (judgeVal !== null && isJudgeStem)) {
        return {
            kind: "judge",
            stem: cleanText(markdown || domHtml),
            options: [],
            isMultiple: false,
            judgeAnswer: judgeVal,
            fillExpected: judgeVal ? "正确" : "错误",
            analysis: examAnalysis,
            hasInteractiveWidgets: true,
        };
    }

    // 4. 检查是否为显式填空题（仅限考试填空属性或连续下划线填空符；普通 ==挖空== 闪卡走自由回忆，除非用户显式开启打字模式）
    const hasUnderline = /_{3,}/.test(fullContent);
    if (examType === "fill" || hasUnderline) {
        return {
            kind: "fill",
            stem: cleanText(markdown || domHtml),
            options: [],
            isMultiple: false,
            judgeAnswer: null,
            fillExpected: examAnswer || expectedText || cardMemo,
            analysis: examAnalysis,
            hasInteractiveWidgets: Boolean(examAnswer || expectedText || cardMemo || hasUnderline),
        };
    }

    // 5. 普通自由回忆问答卡
    return {
        kind: "free-recall",
        stem: cleanText(markdown || domHtml),
        options: [],
        isMultiple: false,
        judgeAnswer: null,
        fillExpected: expectedText || cardMemo,
        analysis: examAnalysis,
        hasInteractiveWidgets: false,
    };
}

// ---- 交互式题型评分与反馈评估引擎 ----

export interface QuizEvaluationResult {
    isCorrect: boolean;
    suggestedRating: Rating1to4;
    sfxRating: Rating1to4;
    hapticPattern: number | number[];
    message: string;
    messageType: "info" | "error";
    toastDuration?: number;
    typingGrade?: TypingGrade;
}

/**
 * 判定多选/单选答案是否正确，并生成建议评分与反馈消息
 */
export function evaluateChoiceQuiz(
    options: InteractiveOption[],
    selectedKeys: string[],
    isMultiple: boolean
): QuizEvaluationResult | null {
    if (selectedKeys.length === 0) return null;
    const correctOptions = options.filter(o => o.isAnswer);
    const correctKeys = correctOptions.map(o => o.key);
    if (correctKeys.length === 0) return null;

    const allMatch = correctKeys.length === selectedKeys.length && selectedKeys.every(k => correctKeys.includes(k));
    const hasWrong = selectedKeys.some(k => !correctKeys.includes(k));

    if (allMatch) {
        return {
            isCorrect: true,
            suggestedRating: 3,
            sfxRating: 3,
            hapticPattern: 15,
            message: isMultiple ? "多选全部正确！" : "回答正确！",
            messageType: "info",
            toastDuration: 2000,
        };
    } else if (!hasWrong && selectedKeys.length < correctKeys.length) {
        return {
            isCorrect: false,
            suggestedRating: 2,
            sfxRating: 2,
            hapticPattern: 20,
            message: "回答部分正确（多选漏选），已标出全部答案",
            messageType: "info",
            toastDuration: 2000,
        };
    } else {
        return {
            isCorrect: false,
            suggestedRating: 1,
            sfxRating: 1,
            hapticPattern: 25,
            message: "回答错误，已标出正确选项",
            messageType: "error",
            toastDuration: 1800,
        };
    }
}

/**
 * 判定判断题答案是否正确，并生成建议评分与反馈消息
 */
export function evaluateJudgeQuiz(
    userChoice: boolean,
    expectedAnswer: boolean | null
): QuizEvaluationResult | null {
    if (expectedAnswer === null) return null;
    const isCorrect = userChoice === expectedAnswer;
    return {
        isCorrect,
        suggestedRating: isCorrect ? 3 : 1,
        sfxRating: isCorrect ? 3 : 1,
        hapticPattern: isCorrect ? 15 : 25,
        message: isCorrect ? "判断正确！" : "判断错误，已标出正确答案",
        messageType: isCorrect ? "info" : "error",
        toastDuration: 1800,
    };
}

/**
 * 判定填空题答案是否正确，并生成建议评分与反馈消息
 */
export function evaluateFillQuiz(
    expectedText: string,
    actualInput: string,
    strict = false
): QuizEvaluationResult | null {
    const text = actualInput.trim();
    if (!text || !expectedText) return null;

    const g = gradeTyping(expectedText, text, strict);
    const isCorrect = g.suggested >= 3;

    return {
        typingGrade: g,
        isCorrect,
        suggestedRating: g.suggested,
        sfxRating: g.suggested,
        hapticPattern: isCorrect ? 15 : 25,
        message: g.isTypo
            ? "拼写微瑕（1 字之差），智能容错放行通过！"
            : isCorrect
            ? "填空正确！"
            : "填空已对比，查看答案",
        messageType: isCorrect ? "info" : "error",
        toastDuration: g.isTypo ? 2200 : 1800,
    };
}

export interface QuizScoreCounters {
    total: number;
    correct: number;
}

/**
 * 更新交互式题型总作答数与正确数
 */
export function updateQuizScoreCounters(
    counters: QuizScoreCounters,
    isCorrect: boolean
): QuizScoreCounters {
    return {
        total: counters.total + 1,
        correct: isCorrect ? counters.correct + 1 : counters.correct,
    };
}

export type QuizKeyboardAction =
    | { type: "submit-choice" }
    | { type: "pick-option"; optionKey: string }
    | { type: "pick-judge"; choice: boolean }
    | null;

/**
 * 交互式题型快捷键解析器（选择题 A/B/C/D 与数字键、多选提交回车、判断题 T/F/Y/N/1/2）
 */
export function resolveQuizKeyboardAction(
    e: { key: string },
    interactiveQuiz: InteractiveQuizData | null,
    selectedChoiceKeys: readonly string[],
    showAnswer: boolean
): QuizKeyboardAction {
    if (showAnswer || !interactiveQuiz) return null;

    if (interactiveQuiz.kind === "choice" && interactiveQuiz.options.length >= 2) {
        if (interactiveQuiz.isMultiple && (e.key === "Enter" || e.key === " ") && selectedChoiceKeys.length > 0) {
            return { type: "submit-choice" };
        }
        const keyUpper = e.key.toUpperCase();
        const matchedOpt = interactiveQuiz.options.find(o => o.key === keyUpper)
            || (Number(e.key) >= 1 && Number(e.key) <= interactiveQuiz.options.length ? interactiveQuiz.options[Number(e.key) - 1] : null);
        if (matchedOpt) {
            return { type: "pick-option", optionKey: matchedOpt.key };
        }
    }

    if (interactiveQuiz.kind === "judge") {
        const keyLower = e.key.toLowerCase();
        if (keyLower === "t" || keyLower === "y" || e.key === "1") {
            return { type: "pick-judge", choice: true };
        } else if (keyLower === "f" || keyLower === "n" || e.key === "2") {
            return { type: "pick-judge", choice: false };
        }
    }

    return null;
}

export interface ChoiceSelectionResult {
    nextKeys: string[];
    shouldAutoSubmit: boolean;
    hapticStrength: number;
}

/**
 * 处理单选/多选选项选中状态切换
 */
export function toggleChoiceSelection(
    currentKeys: readonly string[],
    key: string,
    isMultiple: boolean
): ChoiceSelectionResult {
    if (isMultiple) {
        const nextKeys = currentKeys.includes(key)
            ? currentKeys.filter(k => k !== key)
            : [...currentKeys, key];
        return { nextKeys, shouldAutoSubmit: false, hapticStrength: 5 };
    }
    return { nextKeys: [key], shouldAutoSubmit: true, hapticStrength: 10 };
}

export interface EphemeralQuizState {
    choices: null;
    choiceLoading: false;
    choiceFallbackMode: "none";
    typingGrade: null;
    interactiveQuiz: null;
    selectedChoiceKeys: string[];
    userJudgeChoice: null;
    suggestedRating: null;
}

/**
 * 构造交互式题型初始瞬态对象（用于切卡或题面重载重置）
 */
export function createInitialEphemeralQuizState(): EphemeralQuizState {
    return {
        choices: null,
        choiceLoading: false,
        choiceFallbackMode: "none",
        typingGrade: null,
        interactiveQuiz: null,
        selectedChoiceKeys: [],
        userJudgeChoice: null,
        suggestedRating: null,
    };
}


