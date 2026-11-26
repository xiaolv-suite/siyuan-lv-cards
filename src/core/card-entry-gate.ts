/**
 * 闪卡入组的结构门禁。
 *
 * 这是卡型边界，不负责判断事实是否正确，也不替代 AI 评分卡：它只回答
 * “这块内容是否能在问题态安全呈现，并且有可揭示的答案/遮挡数据”。
 */
import { hasQuestionContent, hasQuestionMediaContent, validateFlashcardMarkdown, hasMeaningfulPrompt, hasMarkedAnswer, extractValidCardAnswerAttr, isMeaningfulCardAnswerAttr } from "./flashcard-quality";
import { parseOcclusion } from "./occlusion";
import { hasDelimitedQa } from "./delimited-qa";
import { ATTR_LV_ATTR_SUBTYPE, extractCardQuestionAttr } from "./block-attributes";

export type CardEntryKind = "markdown" | "image-occlusion" | "memo-qa" | "free-recall" | "attribute-qa" | "qa";
export type CardEntryIssue =
    | "missing-block"
    | "empty-card"
    | "missing-answer"
    | "invalid-markup"
    | "missing-question"
    | "invalid-occlusion";

export interface CardEntryCandidate {
    blockID: string;
    markdown: string;
    attrs?: Record<string, string>;
    exists?: boolean;
    /** Callers that already verified the occlusion payload can pass the result directly. */
    occlusionValid?: boolean;
    /** 存量闪卡兼容模式：允许无 == 挖空的存量问答、块备注或自由回忆卡放行 */
    allowLegacyFormat?: boolean;
}

export interface CardEntryDecision {
    blockID: string;
    ok: boolean;
    kind?: CardEntryKind;
    issue?: CardEntryIssue;
}

/**
 * 按卡型判定一块内容是否具备可入组的最小结构。
 * 问答卡与挖空卡彻底解耦：免侵入属性问答、结构化问答零挖空直接放行；挖空卡走标准完形填空规则。
 */
export function validateCardEntry(candidate: CardEntryCandidate): CardEntryDecision {
    const blockID = String(candidate.blockID ?? "");
    const markdown = String(candidate.markdown ?? "");
    if (!blockID || candidate.exists === false) return { blockID, ok: false, issue: "missing-block" };
    if (!markdown.trim() && !candidate.attrs?.["custom-riff-answer"] && !candidate.attrs?.["custom-lv-answer"] && !candidate.attrs?.["custom-card-answer"] && !candidate.attrs?.["custom-exam-answer"]) {
        return { blockID, ok: false, issue: "empty-card" };
    }

    const attrs = candidate.attrs ?? {};

    // 1. 核心解耦：免侵入零标记属性问答卡 3 子型（Attribute Q&A）—— 零挖空直接放行！
    // - 显式 direct：严格要求正文为题干 + 有效答案属性（extractCardAnswerAttr 统一优先级），忽略存量 custom-riff-title；
    // - 显式 recite / dual：要求题干属性（custom-riff-title 等）+ 正文或答案属性；
    // - 未标子型存量旧卡：保持向后兼容（有题干属性走传统属性问答，无题干有答案属性走 direct）。
    const explicitSubtype = String(attrs[ATTR_LV_ATTR_SUBTYPE] || "").trim();
    const customQ = extractCardQuestionAttr(attrs);
    const customAttrA = extractValidCardAnswerAttr(attrs);
    const examFallbackA = isMeaningfulCardAnswerAttr(String(attrs["custom-exam-answer"] || ""))
        ? String(attrs["custom-exam-answer"] || "").trim()
        : "";
    const customA = String(customAttrA || examFallbackA).trim();

    if (explicitSubtype === "direct") {
        if ((hasMeaningfulPrompt(markdown) || hasQuestionMediaContent(markdown))
            && (hasMeaningfulPrompt(customAttrA) || hasQuestionMediaContent(customAttrA))
            && (!markdown.includes("==") || hasMarkedAnswer(markdown))) {
            return { blockID, ok: true, kind: "attribute-qa" };
        }
    } else if (explicitSubtype === "recite" || explicitSubtype === "dual") {
        if (customQ && (hasMeaningfulPrompt(customQ) || hasQuestionMediaContent(customQ))) {
            const hasAnsContent = hasMeaningfulPrompt(markdown) || hasQuestionMediaContent(markdown) || hasMeaningfulPrompt(customA) || hasQuestionMediaContent(customA);
            if (hasAnsContent) {
                return { blockID, ok: true, kind: "attribute-qa" };
            }
        }
    } else {
        if (customQ && (hasMeaningfulPrompt(customQ) || hasQuestionMediaContent(customQ))) {
            const hasAnsContent = hasMeaningfulPrompt(markdown) || hasQuestionMediaContent(markdown) || hasMeaningfulPrompt(customA) || hasQuestionMediaContent(customA);
            if (hasAnsContent) {
                return { blockID, ok: true, kind: "attribute-qa" };
            }
        }
        if (!customQ
            && (hasMeaningfulPrompt(markdown) || hasQuestionMediaContent(markdown))
            && (hasMeaningfulPrompt(customAttrA) || hasQuestionMediaContent(customAttrA))
            && (!markdown.includes("==") || hasMarkedAnswer(markdown))) {
            return { blockID, ok: true, kind: "attribute-qa" };
        }
    }

    // 1.5 核心解耦：考试客观题卡（Exam Question：单选/多选/判断/填空）—— 必须同时具备题干与可解析答案属性方可直接放行
    // （无答案属性的纯 custom-exam-type=single 块交由后续 Markdown 挖空/分隔符/备注门禁严格校验，防无答案废卡绕过）
    const examAns = String(
        attrs["custom-exam-answer"] || attrs["exam-answer"] || attrs["custom-card-answer"] || attrs["custom-riff-answer"] || attrs["custom-lv-answer"] || ""
    ).trim();
    if (attrs["custom-exam-type"]
        && (hasMeaningfulPrompt(markdown) || hasQuestionMediaContent(markdown))
        && (hasMeaningfulPrompt(examAns) || hasQuestionMediaContent(examAns))) {
        return { blockID, ok: true, kind: "qa" };
    }

    // 1.8 阶梯列表卡（Sequence Card）：custom-lv-card-type === "sequence" 且正文具备实质列表/要点内容直接放行
    if (attrs["custom-lv-card-type"] === "sequence" && (hasMeaningfulPrompt(markdown) || hasQuestionMediaContent(markdown))) {
        return { blockID, ok: true, kind: "qa" };
    }

    // 2. 核心解耦：结构化与分隔符问答卡（Delimited Q&A）—— 零挖空直接放行！
    // 概念 :: 释义、::: 描述卡、Q: ... A: ...、问：... 答：...、—— 破折号问答
    if (hasDelimitedQa(markdown)) {
        return { blockID, ok: true, kind: "markdown" };
    }

    // 3. 经典挖空卡与超级块（Cloze & SuperBlock）
    const markdownIssue = validateFlashcardMarkdown(markdown);
    if (!markdownIssue && hasQuestionContent(markdown)) {
        return { blockID, ok: true, kind: "markdown" };
    }

    // 4. 图片遮挡是独立卡型：它不要求 ==答案==，但必须有图片和至少一个合法区域。
    // 遮挡卡可以没有答案标记，但不能借图片遮挡绕过坏的 Markdown 标记。
    // `missing-answer` 是唯一允许由遮挡数据补足答案语义的结构状态。
    if (markdownIssue !== "invalid-markup" && markdownIssue !== "empty-card"
        && hasQuestionMediaContent(markdown)
        && (candidate.occlusionValid || parseOcclusion(attrs)?.rects.length)) {
        return { blockID, ok: true, kind: "image-occlusion" };
    }

    // 5. 存量闪卡兼容机制 1：思源块备注作为答案（Block Memo Answer）
    const memo = String(attrs.memo ?? attrs["custom-memo"] ?? "").trim();
    if (memo && (hasMeaningfulPrompt(markdown) || hasQuestionMediaContent(markdown))) {
        return { blockID, ok: true, kind: "memo-qa" };
    }

    // 6. 存量闪卡与自由回忆入包放行：允许整块纯文本无挖空卡加入卡组（仅限 missing-answer）
    if (candidate.allowLegacyFormat && markdownIssue === "missing-answer" && (hasMeaningfulPrompt(markdown) || hasQuestionMediaContent(markdown))) {
        return { blockID, ok: true, kind: "free-recall" };
    }

    if (markdownIssue) return { blockID, ok: false, issue: markdownIssue };
    return { blockID, ok: false, issue: hasQuestionContent(markdown) ? "invalid-occlusion" : "missing-question" };
}

/** 批量验证先完成再写入，调用方可据此保证 all-or-nothing。 */
export function validateCardEntries(candidates: CardEntryCandidate[]): CardEntryDecision[] {
    return candidates.map(validateCardEntry);
}
