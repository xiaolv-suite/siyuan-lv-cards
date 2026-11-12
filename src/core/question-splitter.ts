/**
 * 试题文本智能拆单解析器（Smart Question Splitter）
 *
 * 借鉴小驴考试题目拆分与解析引擎，为制卡人提供零摩擦的题目导入体验：
 * 1. 支持直接粘贴任意排版的整段试题文本（试卷、题库、PDF、笔记中复制的整题）；
 * 2. 智能提取题干（Stem）、选项（A/B/C/D/E/F）、答案（Answer）与解析（Analysis）；
 * 3. 自动识别题型模式：
 *    - 单选题 (single)：含选项，且答案为单个字母；
 *    - 多选题 (multiple)：含选项，且答案为多个字母；
 *    - 判断题 (judge)：答案为 对/错/正确/错误/T/F/True/False/√/×；
 *    - 填空题 (fill)：题干含下划线空位或括号，且有答案；
 *    - 简答/问答 (qa)：其余问答形式。
 */

export type ParsedCardType = "single" | "multiple" | "judge" | "fill" | "qa";

export interface ParsedOptionItem {
    key: string;
    text: string;
}

export interface ParsedQuestionResult {
    type: ParsedCardType;
    stem: string;
    options: ParsedOptionItem[];
    answer: string;
    correctKeys: string[];
    analysis: string;
}

const ANALYSIS_PATTERN = /(?:(?:【\s*解析\s*】)|(?:解析|参考解析|答题解析|解题思路|答案解析)[:：\s]+)([\s\S]*)$/i;
const ANSWER_PATTERN = /(?:(?:【\s*答案\s*】)|(?:答案|参考答案|正确答案)[:：\s]+)([^\n\r]+)/i;
const EMBEDDED_ANSWER_PAREN = /[（(]\s*([A-Fa-f对错√×TFtf]+)\s*[)）]/;
const OPTION_LINE_PATTERN = /(?:^|\n)\s*([A-Fa-f])[.、:：\s\t]+([^\n]+)/g;

export function parsePastedQuestionText(raw: string): ParsedQuestionResult | null {
    const text = String(raw ?? "").trim();
    if (!text || text.length < 3) return null;

    let remaining = text;
    let analysis = "";
    let answer = "";

    // 1. 提取尾部解析段落
    const analysisMatch = remaining.match(ANALYSIS_PATTERN);
    if (analysisMatch && analysisMatch.index !== undefined) {
        analysis = analysisMatch[1].trim();
        remaining = remaining.slice(0, analysisMatch.index).trim();
    }

    // 2. 提取显式答案标记
    const answerMatch = remaining.match(ANSWER_PATTERN);
    if (answerMatch && answerMatch.index !== undefined) {
        answer = answerMatch[1].trim();
        remaining = remaining.slice(0, answerMatch.index).trim();
    }

    // 3. 提取选项行（A. ... B. ...）
    const options: ParsedOptionItem[] = [];
    const optionMatches = Array.from(remaining.matchAll(OPTION_LINE_PATTERN));

    let stem = remaining;
    if (optionMatches.length >= 2) {
        const firstOptionIndex = optionMatches[0].index ?? 0;
        stem = remaining.slice(0, firstOptionIndex).trim();

        for (const m of optionMatches) {
            const key = m[1].toUpperCase();
            const optText = m[2].trim();
            if (key && optText) {
                options.push({ key, text: optText });
            }
        }
    }

    // 4. 若无显式答案标记，检查题干中是否内嵌了括号答案，如「HTTP 默认端口是（ A ）。」
    if (!answer) {
        const parenMatch = stem.match(EMBEDDED_ANSWER_PAREN);
        if (parenMatch && parenMatch[1]) {
            answer = parenMatch[1].trim();
            // 将题干中答案括号挖空替换为标准空括号「（ ）」
            stem = stem.replace(EMBEDDED_ANSWER_PAREN, "（   ）");
        }
    }

    // 清洗题首多余的序号（如 "1. "、"一、"、"10、" 等）
    stem = stem.replace(/^(?:[0-9]+[、.．:：\s]+|[一二三四五六七八九十]+[、.．:：\s]+)/, "").trim();

    // 5. 判定题型与正确键
    let type: ParsedCardType = "qa";
    let correctKeys: string[] = [];

    const normAnswer = answer.toUpperCase().replace(/[^A-F对错√×TF正确错误]/g, "");

    if (options.length >= 2) {
        const letters = normAnswer.replace(/[^A-F]/g, "").split("");
        if (letters.length > 1) {
            type = "multiple";
            correctKeys = [...new Set(letters)].sort();
        } else if (letters.length === 1) {
            type = "single";
            correctKeys = letters;
        } else {
            type = "single";
        }
    } else if (/[对错√×TF正确错误]/.test(answer)) {
        type = "judge";
        if (/[对√T正确]/i.test(answer)) {
            answer = "对";
            correctKeys = ["A"]; // 映射到判断题选项 1
        } else {
            answer = "错";
            correctKeys = ["B"]; // 映射到判断题选项 2
        }
    } else if (stem.includes("____") || stem.includes("___") || stem.includes("（   ）") || stem.includes("(   )")) {
        type = "fill";
        // 归一化填空占位符为标准 ____
        stem = stem.replace(/_{3,}|[（(]\s{2,}[)）]/g, "____");
    }

    return {
        type,
        stem,
        options,
        answer,
        correctKeys,
        analysis,
    };
}
