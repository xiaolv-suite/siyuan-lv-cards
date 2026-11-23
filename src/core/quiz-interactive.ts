/**
 * 交互式题型识别与选项解析引擎（纯逻辑、零依赖、可在 Node/浏览器环境无缝运行与单测）。
 * 针对单选题、多选题、判断题与填空题，从笔记 Markdown、DOM 树或块属性（custom-exam-*）中
 * 提取结构化题干、选项列表、对错标记与参考解析，供复习端呈现精美可点击的选项卡片与互动槽位。
 */

import { gradeTyping, type TypingGrade, type Rating1to4 } from "./card-types";

export type QuizInteractiveKind = "choice" | "judge" | "fill" | "free-recall";

export interface InteractiveOption {
    key: string;        // "A", "B", "C", "D" 等当前展示键
    originalKey?: string; // 笔记原文中的原选项键（如 "A", "B", "C", "D" 等）
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
    isShuffled?: boolean;              // 是否已执行选项乱序打乱
    originalAnswerKeys?: string[];     // 原始题面中的正确选项代号（如 ["B"]）
    shuffledAnswerKeys?: string[];     // 乱序后当前呈现的正确选项代号（如 ["A"]）
    keyMapping?: Record<string, string>; // 渲染展示键到原题键的映射表（如 { "A": "B", "B": "C", ... }）
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

    const upperKey = key.toUpperCase();
    const upperKnown = cleanKnown.toUpperCase();

    // 1. 若包含明确的前缀（如 "答案：B"、"正确选项：B"、"【答案】A、C" 等）
    const prefixMatch = cleanKnown.match(/(?:[【\[]?(?:正确)?(?:答案|选择|选项|参考答案)[】\]]?[：:\s]*)([A-Za-z\s,\/、·]+)/i);
    if (prefixMatch) {
        const letters = prefixMatch[1].toUpperCase().split(/[\s,\/、·]+/).filter(Boolean);
        if (letters.length > 0 && letters.every(l => /^[A-Z]$/.test(l))) {
            return letters.includes(upperKey);
        }
        if (/^[A-Z]{1,8}$/i.test(prefixMatch[1].trim())) {
            return prefixMatch[1].toUpperCase().includes(upperKey);
        }
    }

    // 2. 若 knownAnswer 直接是纯字母集合（如 "B"、"BC"、"A,B"、"A / C"、"A and C"）
    const letterTokens = upperKnown.split(/[\s,\/、·+&]+|\band\b/i).filter(Boolean);
    const isAllSingleLetters = letterTokens.length > 0 && letterTokens.every(t => /^[A-Z]$/.test(t));
    if (isAllSingleLetters) {
        return letterTokens.includes(upperKey);
    }
    if (/^[A-Z]{1,8}$/i.test(cleanKnown)) {
        return upperKnown.includes(upperKey);
    }

    // 3. 若 knownAnswer 开头是字母加分隔符（如 "B. 25%"、"B、北京"、"(B) 北京"）
    const leadMatch = cleanKnown.match(/^(?:[\(（\[【]?([A-Za-z])[\)）\]】]?[\.\、\:\：\s]|[\(（\[【]?([A-Za-z])[\)）\]】]\s*)/i);
    if (leadMatch) {
        const leadKey = (leadMatch[1] || leadMatch[2]).toUpperCase();
        return leadKey === upperKey;
    }

    // 4. 仅在已知答案未包含任何字母代号时，才回退到选项内容文本匹配（杜绝在解析中提及错项文本时引发误判）
    const cleanOpt = cleanText(optionText).trim();
    if (cleanOpt && cleanKnown) {
        if (cleanOpt.toLowerCase() === cleanKnown.toLowerCase()) return true;
        if (cleanKnown.length >= 2 && cleanOpt.length >= 2) {
            if (cleanOpt === cleanKnown || (cleanOpt.length >= 4 && cleanKnown.includes(cleanOpt))) return true;
        }
    }

    return false;
}

/** 匹配以 A.、B.、(A)、[A] 等开头的选项行正则（支持 A 至 Z 选项） */
const OPTION_LINE_REGEX = /^\s*(?:[•·●\-\*\+]\s*)?(?:<[^>]*>)*(?:[\(（\[【]?([A-Za-z])[\)）\]】]?[\.\、\:\：\s]\s*|[\(（\[【]?([A-Za-z])[\)）\]】]\s*)(.+)$/;

/**
 * 解析并提取题干中的选项列表（如 A. 20%  B. 25% 等）
 */
export function extractChoiceOptionsFromText(content: string, knownAnswer = ""): InteractiveOption[] {
    const text = String(content ?? "");
    const options: InteractiveOption[] = [];

    // 1. 按行或列表项逐项扫描：支持 "A. 选项"、"A、选项"、"A: 选项"、"A) 选项"、"(A) 选项"、"[A] 选项"、"• A. 选项" 等
    const lines = text.split(/\r?\n|<br\s*\/?>|<\/li>|<\/div>|<\/p>/i);

    for (const line of lines) {
        const cleaned = cleanText(line);
        const match = cleaned.match(OPTION_LINE_REGEX);
        if (match) {
            const rawKey = match[1] || match[2];
            const key = rawKey.toUpperCase();
            const optionText = match[3].trim();
            // 避免重复追加同一字母
            if (!options.some(o => o.key === key) && optionText) {
                const opt: InteractiveOption = {
                    key,
                    text: optionText,
                    isAnswer: checkIsAnswer(key, optionText, knownAnswer),
                };
                Object.defineProperty(opt, "originalKey", { value: key, enumerable: false, configurable: true, writable: true });
                options.push(opt);
            }
        }
    }

    // 2. 如果分行没拆出来，尝试单行内多选项正则扫描（如 "A. 20% B. 25% C. 80% D. 125%" 或 "(A) 选项一 (B) 选项二"）
    if (options.length < 2) {
        const inlineRegex = /(?:^|\s+)(?:[\(（\[【]?([A-Za-z])[\)）\]】]?[\.\、\:\：\s]\s*|[\(（\[【]?([A-Za-z])[\)）\]】]\s*)([^\sA-Za-z\.\、\:\：\)\）\]】][^A-Za-z\.\、\:\：\)\）\]】]*?)(?=(?:\s+(?:[\(（\[【]?[A-Za-z][\)）\]】]?[\.\、\:\：\s]|[\(（\[【]?[A-Za-z][\)）\]】]))|$)/g;
        let m: RegExpExecArray | null;
        const inlineOpts: InteractiveOption[] = [];
        const cleanContent = cleanText(text);
        while ((m = inlineRegex.exec(cleanContent)) !== null) {
            const rawKey = m[1] || m[2];
            const key = rawKey.toUpperCase();
            const optionText = m[3].trim();
            if (!inlineOpts.some(o => o.key === key) && optionText) {
                const opt: InteractiveOption = {
                    key,
                    text: optionText,
                    isAnswer: checkIsAnswer(key, optionText, knownAnswer),
                };
                Object.defineProperty(opt, "originalKey", { value: key, enumerable: false, configurable: true, writable: true });
                inlineOpts.push(opt);
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

    // 提取带前缀的判断结论（如 "正确答案：对"、"答案：错误"、"【答案】正确"）
    const prefixMatch = raw.match(/(?:[【\[]?(?:正确)?(?:答案|判断|结论|结果)[】\]]?[：:\s]*)(正确|错误|对|错|true|false|yes|no|[tf√×10])/i);
    if (prefixMatch) {
        const val = prefixMatch[1].toLowerCase();
        if (["t", "true", "对", "正确", "√", "1", "yes", "y", "v"].includes(val)) return true;
        if (["f", "false", "错", "错误", "×", "x", "0", "no", "n"].includes(val)) return false;
    }

    // 开头明确带判定词与标点分隔（如 "正确。因为..."、"错误，解析如下："）
    const leadMatch = raw.match(/^(正确|错误|对|错|true|false|yes|no)[。，,.\s、\n;；:：]/i);
    if (leadMatch) {
        const val = leadMatch[1].toLowerCase();
        if (["t", "true", "对", "正确", "yes"].includes(val)) return true;
        if (["f", "false", "错", "错误", "no"].includes(val)) return false;
    }

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
        if (OPTION_LINE_REGEX.test(cleaned)) {
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
        .replace(/(?:^|\s+)(?:[•·●\-\*\+]\s*)?(?:[\(（\[【]?[A-Za-z][\)）\]】]?[\.\、\:\：\s]|[\(（\[【]?[A-Za-z][\)）\]】]\s*).*$/i, "")
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

        // 1. 优先扫描并移除列表项 (NodeListItem, li) 中的选项项
        template.content.querySelectorAll(":is([data-type='NodeListItem'], li)").forEach(el => {
            const text = (el.textContent ?? "").trim();
            if (OPTION_LINE_REGEX.test(text)) {
                el.remove();
            }
        });

        // 2. 移除变空的列表容器 (NodeList, ul, ol, .list)
        template.content.querySelectorAll(":is([data-type='NodeList'], .list, ul, ol)").forEach(el => {
            const remainingItems = el.querySelectorAll(":is([data-type='NodeListItem'], li)");
            const remainingText = (el.textContent ?? "").trim();
            if (remainingItems.length === 0 || !remainingText) {
                el.remove();
            }
        });

        // 3. 移除单独成段的选项段落 (以 A.、B.、(A) 开头)
        template.content.querySelectorAll(":is([data-type='NodeParagraph'], p, .p)").forEach(el => {
            const text = (el.textContent ?? "").trim();
            if (OPTION_LINE_REGEX.test(text)) {
                el.remove();
            } else {
                // 如果段落中包含换行或尾随内联选项，剥离掉末尾的选项部分，保留前面的题干
                const stripped = el.innerHTML.replace(/(?:<br\s*\/?>|\s+)(?:[•·●\-\*\+]\s*)?(?:[\(（\[【]?[A-Za-z][\)）\]】]?[\.\、\:\：\s]|[\(（\[【]?[A-Za-z][\)）\]】]).*$/is, "");
                if (stripped && stripped !== el.innerHTML) {
                    el.innerHTML = stripped.trim();
                }
            }
        });

        const result = template.innerHTML.trim();
        return result || html;
    } catch {
        return html;
    }
}

export interface ShuffledOptionsResult extends Array<InteractiveOption> {
    isShuffled: boolean;
    keyMapping: Record<string, string>;
    originalAnswerKeys: string[];
    shuffledAnswerKeys: string[];
}

/**
 * 随机打乱选择题选项顺序（Fisher-Yates 算法，保留正确项标记，重新分配 A/B/C/D 展示键，记录原选项映射）
 */
export function shuffleInteractiveOptions(
    options: readonly InteractiveOption[],
    shuffleFn: <T>(arr: readonly T[]) => T[] = (arr) => {
        const out = [...arr];
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    }
): ShuffledOptionsResult {
    if (!options || options.length <= 1) {
        const baseOpts: InteractiveOption[] = (options || []).map(o => ({ ...o, originalKey: o.originalKey || o.key }));
        const origKeys = baseOpts.filter(o => o.isAnswer).map(o => o.originalKey || o.key);
        const curKeys = baseOpts.filter(o => o.isAnswer).map(o => o.key);
        const mapping: Record<string, string> = {};
        for (const o of baseOpts) {
            mapping[o.key] = o.originalKey || o.key;
        }
        return Object.assign(baseOpts, {
            isShuffled: false,
            keyMapping: mapping,
            originalAnswerKeys: origKeys,
            shuffledAnswerKeys: curKeys,
        });
    }

    const shuffled = shuffleFn(options);
    const mapping: Record<string, string> = {};
    const updatedOptions: InteractiveOption[] = shuffled.map((opt, idx) => {
        const newKey = String.fromCharCode(65 + idx);
        const origKey = opt.originalKey || opt.key;
        mapping[newKey] = origKey;
        const resOpt: InteractiveOption = {
            key: newKey,
            text: opt.text,
            isAnswer: opt.isAnswer,
        };
        Object.defineProperty(resOpt, "originalKey", { value: origKey, enumerable: false, configurable: true, writable: true });
        return resOpt;
    });

    const origAnswers = options.filter(o => o.isAnswer).map(o => o.originalKey || o.key);
    const curAnswers = updatedOptions.filter(o => o.isAnswer).map(o => o.key);
    const changed = updatedOptions.some(o => o.key !== (o.originalKey || o.key));

    return Object.assign(updatedOptions, {
        isShuffled: changed,
        keyMapping: mapping,
        originalAnswerKeys: origAnswers,
        shuffledAnswerKeys: curAnswers,
    });
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
    shuffleOptions?: boolean;
}): InteractiveQuizData {
    const { markdown = "", domHtml = "", attrs = {}, cardMemo = "", expectedText = "", shuffleOptions = false } = params;
    const fullContent = `${markdown}\n${domHtml}\n${cardMemo}`;

    // 1. 读取可能存在的插件/生态元数据属性
    const examType = String(attrs["custom-exam-type"] || attrs["exam-type"] || "").toLowerCase();
    const examAnswer = String(attrs["custom-exam-answer"] || attrs["exam-answer"] || attrs["custom-card-answer"] || "").trim();
    const examAnalysis = String(attrs["custom-exam-analysis"] || attrs["exam-analysis"] || attrs.memo || attrs["custom-memo"] || "").trim();

    // 2. 检查是否为选择题（单选或多选）
    const knownAnswer = examAnswer || expectedText || cardMemo || "";
    const extractedOptions = extractChoiceOptionsFromText(fullContent, knownAnswer);

    if (examType === "single" || examType === "multiple" || extractedOptions.length >= 2) {
        const isMultiple = examType === "multiple" || extractedOptions.filter((option) => option.isAnswer).length > 1;
        const shuffledRes = shuffleOptions ? shuffleInteractiveOptions(extractedOptions) : null;
        const options = shuffledRes || extractedOptions;
        const origAnswers = extractedOptions.filter(o => o.isAnswer).map(o => o.originalKey || o.key);
        const curAnswers = options.filter(o => o.isAnswer).map(o => o.key);
        const keyMapping: Record<string, string> = {};
        for (const o of options) {
            keyMapping[o.key] = o.originalKey || o.key;
        }

        return {
            kind: "choice",
            stem: extractStemFromChoice(markdown || domHtml, extractedOptions),
            options,
            isMultiple,
            judgeAnswer: null,
            fillExpected: knownAnswer,
            analysis: examAnalysis,
            hasInteractiveWidgets: options.length >= 2,
            isShuffled: Boolean(shuffledRes?.isShuffled),
            originalAnswerKeys: origAnswers,
            shuffledAnswerKeys: curAnswers,
            keyMapping,
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

    // 清洗期望答案前缀（如 "正确答案：SQLite" 剥离为 "SQLite"）与首尾 == 挖空符号
    const cleanTarget = expectedText
        .replace(/^(?:[【\[]?(?:正确)?(?:答案|参考答案)[】\]]?[：:\s]*)/i, "")
        .replace(/^==|==$/g, "")
        .trim();

    const g = gradeTyping(cleanTarget || expectedText, text, strict);
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


