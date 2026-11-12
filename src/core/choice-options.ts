import { extractMarkTexts } from "./card-face";
import { parseDelimitedQa } from "./delimited-qa";

const INVISIBLE_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff]/g;

/**
 * Clean and normalize a choice option string:
 * - strips zero-width / control characters
 * - normalizes non-breaking spaces (\u00a0) and collapses redundant whitespace
 * - trims leading and trailing whitespace
 */
export function cleanChoiceText(raw: string): string {
    if (!raw) return "";
    return String(raw)
        .replace(INVISIBLE_RE, "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Build multiple-choice options from one answer and candidate distractors.
 *
 * The UI can only present as many choices as there are reliable, distinct
 * distractors.  Returning the answer plus 0..3 candidates lets the caller
 * degrade to free recall when no distractor is available instead of showing
 * fabricated placeholder text.
 */
export function buildChoiceOptions(answer: string, candidates: readonly string[]): string[] | null {
    const normalizedAnswer = cleanChoiceText(answer);
    if (!normalizedAnswer) {
        return null;
    }
    const seen = new Set<string>([normalizedAnswer]);
    const distractors: string[] = [];
    for (const candidate of candidates) {
        const value = cleanChoiceText(candidate);
        if (!value || seen.has(value)) {
            continue;
        }
        seen.add(value);
        distractors.push(value);
        if (distractors.length >= 3) {
            break;
        }
    }
    // No reliable distractor: the caller should use the normal free-recall
    // flow. One or two distractors intentionally produce a 2/3-choice quiz.
    return distractors.length > 0 ? [normalizedAnswer, ...distractors] : null;
}

export interface GeneratedChoiceState {
    options: string[];
    answerIdx: number;
    picked: number | null;
}

/**
 * 数组随机打乱（Fisher-Yates 算法）
 */
export function shuffleArray<T>(arr: readonly T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/**
 * 组装并打乱选择题选项
 */
export function assembleChoiceOptions(
    answer: string,
    distractors: readonly string[],
    shuffleFn: <T>(arr: T[]) => T[] = shuffleArray
): GeneratedChoiceState | null {
    const built = buildChoiceOptions(answer, distractors);
    if (!built) return null;
    const options = shuffleFn(built);
    return {
        options,
        answerIdx: options.indexOf(built[0]),
        picked: null,
    };
}

/**
 * 记录用户选择题选中项并返回更新后的选择题状态
 */
export function recordChoicePick(
    choices: GeneratedChoiceState | null | undefined,
    idx: number
): { nextChoices: GeneratedChoiceState; shouldRevealAnswer: boolean } | null {
    if (!choices || choices.picked !== null) {
        return null;
    }
    return {
        nextChoices: { ...choices, picked: idx },
        shouldRevealAnswer: true,
    };
}

/**
 * 向干扰项池中追加候选文本（去重、排除正确答案且不超容量）
 */
export function addDistractorToPool(
    pool: string[],
    candidateText: string,
    targetAnswer: string,
    maxPoolSize = 3
): boolean {
    if (pool.length >= maxPoolSize) return false;
    const cleanCandidate = cleanChoiceText(candidateText);
    const cleanTarget = cleanChoiceText(targetAnswer);
    if (!cleanCandidate || cleanCandidate === cleanTarget || pool.includes(cleanCandidate)) {
        return false;
    }
    pool.push(cleanCandidate);
    return true;
}

/**
 * 从 HTML 字符串中提取卡片答案文本（挖空集合 > 问答答案 > 纯文本）
 */
export function extractAnswerFromDomHtml(domHtml: string): string {
    if (!domHtml) return "";
    if (typeof document === "undefined") return "";
    const holder = document.createElement("div");
    holder.innerHTML = domHtml;
    const marks = extractMarkTexts(holder);
    if (marks.length > 0) {
        return marks.join(" / ");
    }
    const rawText = (holder.textContent ?? "").trim();
    const delimited = parseDelimitedQa(rawText);
    if (delimited?.answer) {
        return delimited.answer;
    }
    return rawText;
}

