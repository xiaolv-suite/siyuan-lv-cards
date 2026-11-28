/**
 * AS-3 富内容卡面分析（纯逻辑，node 可单测）。
 * 卡面 HTML 由内核 getBlockDOM 渲染（公式 KaTeX/代码/表格原生可用）；本模块对卡面做
 * 富内容特征识别，供复习面板显示「渲染提示行」（公式/图片/嵌入/代码/表格/超长链接 +
 * 窄屏横向滚动提示）——提示只是告知特征，不改变渲染本身。
 * 降级口径：加载失败由调用方显示占位+重试（UI 态，不入本模块）；问题态遮挡沿用既有
 * CSS 掩码（lv-masked），并提供问题态 HTML 副本，避免读屏和复制时直接读到答案。
 */

import { parseDelimitedQa, maskDelimitedQaInHtml } from "./delimited-qa";
import { extractCardQuestionAttr, type AttrQaSubtype } from "./block-attributes";
import { extractValidCardAnswerAttr, isMeaningfulCardAnswerAttr } from "./flashcard-quality";
import { MARK_SELECTOR } from "./card-selectors";
import {
    isSuperBlockHtml,
    maskSuperBlockForQuestion,
    renderSuperBlockAnswerFace,
    extractSuperBlockTexts,
} from "./superblock-qa";

export interface FaceRichness {
    /** 公式（KaTeX/MathJax 渲染产物） */
    formula: boolean;
    image: boolean;
    /** 嵌入块/iframe */
    embed: boolean;
    code: boolean;
    table: boolean;
    /** 超长链接（≥100 字符，窄屏必横向溢出） */
    longLink: boolean;
}

const RICHNESS_RULES: { key: keyof FaceRichness; pattern: RegExp }[] = [
    { key: "formula", pattern: /class="katex"|class="MathJax"|language-math/i },
    { key: "image", pattern: /<img\b|<svg\b(?![\s\S]*?(?:iconDot|#icon))/i },
    { key: "embed", pattern: /NodeBlockQueryEmbed|<iframe\b/i },
    { key: "code", pattern: /<pre\b|<code\b/i },
    { key: "table", pattern: /<table\b/i },
    { key: "longLink", pattern: /https?:\/\/[^\s<>"]{100,}/i },
];

/** 全 false 基值 */
export function plainFace(): FaceRichness {
    return { formula: false, image: false, embed: false, code: false, table: false, longLink: false };
}

/** 富内容特征识别（空串/纯文本=全 false） */
export function analyzeFaceRichness(html: string): FaceRichness {
    const src = html ?? "";
    const out = plainFace();
    for (const { key, pattern } of RICHNESS_RULES) {
        out[key] = pattern.test(src);
    }
    return out;
}

/** 是否含任一富内容特征（提示行显示开关） */
export function hasRichContent(r: FaceRichness): boolean {
    return r.formula || r.image || r.embed || r.code || r.table || r.longLink;
}

/** 提示行条目（有序 i18n 键，aiFace.hint.<key>；稳定顺序便于读屏） */
export function faceHintKeys(r: FaceRichness): string[] {
    return RICHNESS_RULES.filter(({ key }) => r[key]).map(({ key }) => `aiFace.hint.${key}`);
}

/**
 * 从卡面富内容分析结果推导提示键列表（无富内容或为 null 时返回空数组）
 */
export function deriveFaceHints(faceRich: FaceRichness | null | undefined): string[] {
    return faceRich && hasRichContent(faceRich) ? faceHintKeys(faceRich) : [];
}

/**
 * 将提示行 i18n 键（如 "aiFace.hint.formula"）解析为本地化展示文本
 */
export function resolveFaceHintLabel(
    key: string,
    i18nAiFaceHints: Record<string, string> = {}
): string {
    const parts = key.split(".");
    const name = parts[parts.length - 1];
    return i18nAiFaceHints[name] ?? key;
}

/**
 * 判定卡面 HTML 中是否包含 SVG 画布或 Excalidraw 绘图
 */
export function hasSvgOrCanvasDrawing(html: string | undefined): boolean {
    if (!html) return false;
    return /<svg\b/i.test(html) || /\.svg\b/i.test(html) || /excalidraw/i.test(html);
}

/**
 * 判定卡面是否已就绪（具有 HTML 字符串且未发生加载错误）
 */
export function isCardFaceReady(cardHtml: string | undefined | null, faceError: string): boolean {
    return Boolean(cardHtml) && !faceError;
}

/** 挖空（高亮）段选择器（自叶子模块 card-selectors 重导出，避免运行时循环依赖） */
export { MARK_SELECTOR } from "./card-selectors";

/** 提取卡面挖空文本合集（去空白），供打字判分/干扰项采样/配对游戏 */
export function extractMarkTexts(holder: HTMLElement): string[] {
    return Array.from(holder.querySelectorAll(MARK_SELECTOR))
        .map(m => (m.textContent ?? "").trim())
        .filter(Boolean);
}

function extractAttrFromRawHtml(raw: string, attrName: string): string {
    if (!raw) return "";
    const re = new RegExp(`${attrName}=(?:"([^"]*)"|'([^']*)')`, "i");
    const m = raw.match(re);
    return (m ? (m[1] ?? m[2] ?? "") : "").trim();
}

/**
 * 解析免侵入零标记属性问答的 3 子型：
 * - direct：直接问答型（正面=块正文题干，背面=答案属性 custom-lv-answer / custom-card-answer）
 * - recite：背诵自测型（正面=标题/关键词提示，背面=完整块正文或要点对照）
 * - dual：双面对照型（正面=概念/术语/外语表达，背面=释义/例句/译文，支持正反双向复习）
 */
export function resolveAttrQaSubtype(
    attrs?: Record<string, string> | null,
    html?: string | null,
    customQuestion?: string | null,
    customAnswer?: string | null,
): AttrQaSubtype | null {
    const raw = String(html ?? "");
    const explicit = String(attrs?.["custom-lv-attr-subtype"] || extractAttrFromRawHtml(raw, "custom-lv-attr-subtype") || "").trim();
    if (explicit === "direct" || explicit === "recite" || explicit === "dual") {
        return explicit;
    }
    const q = String(
        customQuestion
        ?? attrs?.["custom-riff-title"]
        ?? attrs?.["custom-lv-question"]
        ?? attrs?.["custom-card-title"]
        ?? (extractAttrFromRawHtml(raw, "custom-riff-title") || extractAttrFromRawHtml(raw, "custom-lv-question") || extractAttrFromRawHtml(raw, "custom-card-title"))
    ).trim();
    const a = String(
        customAnswer
        ?? attrs?.["custom-lv-answer"]
        ?? attrs?.["custom-card-answer"]
        ?? attrs?.["custom-riff-answer"]
        ?? (extractAttrFromRawHtml(raw, "custom-lv-answer") || extractAttrFromRawHtml(raw, "custom-card-answer") || extractAttrFromRawHtml(raw, "custom-riff-answer"))
    ).trim();
    const bidi = attrs?.["custom-lv-bidi"] === "true" || extractAttrFromRawHtml(raw, "custom-lv-bidi") === "true";
    if (q) {
        return bidi ? "dual" : "recite";
    }
    if (a) {
        return "direct";
    }
    return null;
}

/**
 * 判断卡片是否为基于块属性的免侵入零标记属性问答卡（涵盖 direct / recite / dual 3 子型）
 */
export function isAttrQaCard(
    html: string | undefined | null,
    customQuestion?: string | null,
    customAnswer?: string | null,
): boolean {
    let q = String(customQuestion ?? "").trim();
    let a = String(customAnswer ?? "").trim();
    if (a && !isMeaningfulCardAnswerAttr(a)) a = "";
    const raw = String(html ?? "");
    if (!q && raw) {
        q = extractAttrFromRawHtml(raw, "custom-riff-title")
            || extractAttrFromRawHtml(raw, "custom-lv-question")
            || extractAttrFromRawHtml(raw, "custom-card-title");
    }
    if (!a && raw) {
        const sub = String(extractAttrFromRawHtml(raw, "custom-lv-attr-subtype") || "").trim();
        const candidateKeys = sub === "direct"
            ? ["custom-lv-answer", "custom-card-answer", "custom-riff-answer", "custom-flashcard-answer"]
            : ["custom-riff-answer", "custom-lv-answer", "custom-card-answer", "custom-flashcard-answer"];
        for (const k of candidateKeys) {
            const v = extractAttrFromRawHtml(raw, k);
            if (v && isMeaningfulCardAnswerAttr(v)) {
                a = v;
                break;
            }
        }
    }
    if (!q && !a) return false;
    if (isSuperBlockHtml(raw)) return false;
    // 图片遮挡卡需保留原图供遮罩图层定位，不转为文本型属性问答卡
    if (/(?:custom-lv-occlusion|lv-occlusion|custom-riff-occlusion)=/i.test(raw)) {
        return false;
    }
    // 存在挖空标记（mark 或 span[data-type=mark] 或 ==）时为挖空卡
    if (/(?:data-type=["']mark["']|<mark\b|(?<!=)==(?!=))/i.test(raw)) {
        return false;
    }
    const explicitSub = String(extractAttrFromRawHtml(raw, "custom-lv-attr-subtype") || "").trim();
    if (explicitSub === "direct") {
        return Boolean(a);
    }
    return true;
}

/**
 * 判断当前卡片是否允许翻转正反方向复习（R 键 / 顶栏翻转 / 卡面切换）。
 * 当双面对照型显式关闭双向（custom-lv-bidi="false"）时，严格保持正向，禁止两处入口翻转。
 */
export function isReversedRecallAllowed(
    attrs?: Record<string, string> | null,
    html?: string | null,
    customQuestion?: string | null,
    customAnswer?: string | null,
): boolean {
    const subtype = resolveAttrQaSubtype(attrs, html, customQuestion, customAnswer);
    if (subtype === "dual") {
        const rawBidi = String(attrs?.["custom-lv-bidi"] ?? extractAttrFromRawHtml(String(html ?? ""), "custom-lv-bidi") ?? "").trim().toLowerCase();
        if (rawBidi === "false") {
            return false;
        }
    }
    return true;
}

/**
 * 渲染属性问答卡的问题态 HTML：
 * 支持直接问答型（正文即题面）、背诵自测型（属性标题+可选提示，正文遮蔽）与双面对照型（概念/释义互测）。
 */
export function renderAttrQaQuestionFace(
    question: string,
    options?: {
        subtype?: AttrQaSubtype | null;
        questionIsHtml?: boolean;
        reversed?: boolean;
    },
): string {
    const q = String(question ?? "").trim();
    const subtype = options?.subtype ?? "recite";
    const bodyHtml = options?.questionIsHtml ? q : formatMarkdownToSafeHtml(q);
    const badgeText = subtype === "direct" ? "直接问答" : subtype === "dual" ? (options?.reversed ? "反向对照" : "双面对照") : "问";
    const placeholderText = subtype === "direct"
        ? "［ 参考答案（属性已就绪）· 敲空格或点击卡面揭晓 ］"
        : subtype === "dual"
        ? "［ 对照内容（已遮蔽）· 敲空格或点击卡面揭晓 ］"
        : "［ 参考答案（正文已遮蔽）· 敲空格或点击卡面揭晓 ］";
    return [
        `<div class="lv-qa-attr-stage lv-qa-attr-question-stage" data-attr-subtype="${escapeHtml(subtype)}">`,
        `  <div class="lv-qa-attr-hero">`,
        `    <span class="lv-qa-attr-badge" aria-label="问">${escapeHtml(badgeText)}</span>`,
        `    <div class="lv-qa-attr-title">${bodyHtml}</div>`,
        `  </div>`,
        `  <div class="lv-card-answer-divider"></div>`,
        `  <div class="lv-qa-answer-placeholder" aria-hidden="true">`,
        `    <span class="lv-mask-slot">${escapeHtml(placeholderText)}</span>`,
        `  </div>`,
        `  <div class="lv-qa-keyboard-hint" aria-hidden="true">`,
        `    <kbd class="lv-qa-kbd">Space</kbd> 揭晓答案 · <kbd class="lv-qa-kbd">1-4</kbd> 对应遗忘至熟练`,
        `  </div>`,
        `</div>`,
    ].join("\n");
}

/**
 * 渲染属性问答卡的答案态 HTML：
 * 题面保持在顶端，并优雅呈现分界线与完整答案区，支持富文本/代码/公式等。
 * 答案来源双轨：自定义答案（custom-riff-answer）优先作为主答案呈现；
 * 笔记正文随后以弱化样式完整保留，笔记始终是可追溯的原文出处。
 */
export function renderAttrQaAnswerFace(
    answerHtml: string,
    question: string,
    answerLabel = "参考答案 (正文)",
    noteHtml = "",
    noteLabel = "笔记原文",
    options?: {
        subtype?: AttrQaSubtype | null;
        questionIsHtml?: boolean;
        reversed?: boolean;
    },
): string {
    const q = String(question ?? "").trim();
    const note = String(noteHtml ?? "").trim();
    const subtype = options?.subtype ?? "recite";
    const questionRendered = options?.questionIsHtml ? q : formatMarkdownToSafeHtml(q);
    const badgeText = subtype === "direct" ? "直接问答" : subtype === "dual" ? (options?.reversed ? "反向对照" : "双面对照") : "问";
    const noteSection = note
        ? [
              `  <div class="lv-card-answer-divider lv-card-answer-divider--slim"></div>`,
              `  <div class="lv-card-a-section lv-card-a-section--note">`,
              `    <div class="lv-eyebrow lv-card-a-label">${escapeHtml(noteLabel)}</div>`,
              `    <div class="lv-card-a-body">${note}</div>`,
              `  </div>`,
          ].join("\n")
        : "";
    return [
        `<div class="lv-qa-attr-stage lv-qa-attr-answer-stage" data-attr-subtype="${escapeHtml(subtype)}">`,
        `  <div class="lv-qa-attr-hero">`,
        `    <span class="lv-qa-attr-badge" aria-label="问">${escapeHtml(badgeText)}</span>`,
        `    <div class="lv-qa-attr-title">${questionRendered}</div>`,
        `  </div>`,
        `  <div class="lv-card-answer-divider"></div>`,
        `  <div class="lv-card-a-section">`,
        `    <div class="lv-eyebrow lv-card-a-label">${escapeHtml(answerLabel)}</div>`,
        `    <div class="lv-card-a-body">${answerHtml}</div>`,
        `  </div>`,
        noteSection,
        `</div>`,
    ].join("\n");
}

export function stripAnswerAttrsFromHtml(html: string): string {
    const raw = String(html ?? "");
    if (!raw) return "";
    return raw
        .replace(/<div class="protyle-attr"[^>]*>[\s\S]*?<\/div>/gi, "")
        .replace(/\s+(?:contenteditable|spellcheck|draggable)=(?:"[^"]*"|'[^']*')/gi, "")
        .replace(
            /\s+(?:custom-lv-answer|custom-card-answer|custom-riff-answer|custom-flashcard-answer|custom-exam-answer|custom-lv-hint)=(?:"[^"]*"|'[^']*')/gi,
            "",
        );
}

/**
 * 清理块正文 HTML 供反向/题面富文本渲染（只读展示）：
 * 保留图片、公式、代码等合法富文本内容，同时剥离编辑器装饰（.protyle-attr / .protyle-action /
 * .protyle-gutters / .lv-card-badge-pill）、可编辑属性（contenteditable/spellcheck/draggable）
 * 与所有可能泄题的 custom-* 闪卡属性，避免点击题面获焦后拦截 Space 揭晓快捷键。
 */
export function sanitizeBlockBodyHtmlForFace(html: string): string {
    const raw = String(html ?? "");
    if (!raw) return "";
    const stripAttrs = (el: Element) => {
        el.removeAttribute("contenteditable");
        el.removeAttribute("spellcheck");
        el.removeAttribute("draggable");
        for (const attr of Array.from(el.attributes)) {
            if (attr.name.startsWith("custom-")) {
                el.removeAttribute(attr.name);
            }
        }
    };
    if (typeof document !== "undefined") {
        const template = document.createElement("template");
        template.innerHTML = raw;
        template.content
            .querySelectorAll(".protyle-attr, .protyle-action, .protyle-gutters, .lv-card-badge-pill")
            .forEach((el) => el.remove());
        template.content.querySelectorAll("div > table").forEach((tbl) => {
            tbl.parentElement?.classList.add("lv-table-wrap");
        });
        template.content.querySelectorAll("*").forEach(stripAttrs);
        return template.innerHTML.replace(/\u00a0/g, " ").trim();
    }
    return stripAnswerAttrsFromHtml(raw)
        .replace(/\s+(?:custom-riff-title|custom-lv-question|custom-card-title|custom-lv-attr-subtype|custom-lv-bidi|custom-riff-decks)=(?:"[^"]*"|'[^']*')/gi, "")
        .trim();
}

/**
 * 清理复习卡面/预览 DOM 中携带的编辑器装饰与可编辑/制卡属性：
 * 剥离 .protyle-attr / .protyle-action / .protyle-gutters / .lv-card-badge-pill、
 * contenteditable / spellcheck / draggable 与 custom-* 属性，严防块助手侵入复习区。
 */
export function stripEditorDecorationsFromReviewFragment(root: ParentNode): void {
    root.querySelectorAll(".protyle-attr, .protyle-action, .protyle-gutters, .lv-card-badge-pill").forEach((el) => el.remove());
    root.querySelectorAll("div > table").forEach((tbl) => {
        tbl.parentElement?.classList.add("lv-table-wrap");
    });
    root.querySelectorAll("*").forEach((el) => {
        el.removeAttribute("contenteditable");
        el.removeAttribute("spellcheck");
        el.removeAttribute("draggable");
        for (const attr of Array.from(el.attributes)) {
            if (attr.name.startsWith("custom-")) {
                el.removeAttribute(attr.name);
            }
        }
    });
}

export function sanitizeReviewCardDomHtml(html: string): string {
    const raw = String(html ?? "");
    if (!raw) return "";
    if (typeof document !== "undefined") {
        const template = document.createElement("template");
        template.innerHTML = raw;
        stripEditorDecorationsFromReviewFragment(template.content);
        return template.innerHTML;
    }
    return stripAnswerAttrsFromHtml(raw)
        .replace(/\s+(?:custom-[a-z0-9_-]+)=(?:"[^"]*"|'[^']*')/gi, "");
}

/**
 * Create a display-only question-side copy: marked answers remain the same
 * approximate width, while their text/media are absent from selection and the
 * accessibility tree. Keep the original HTML for answer reveal and scoring.
 * 
 * 扩展支持：若传入 customQuestion / customAnswer 且正文无挖空，则按属性问答子型呈现问题态。
 */
export function maskMarkedAnswersForQuestion(html: string, customQuestion?: string, customAnswer?: string): string {
    if (typeof document === "undefined") return String(html ?? "");

    // 0. 优先检测是否为思源超级块闪卡（SuperBlock）：首子块为问题，后续所有子块为答案！
    // 彻底解决在问题态把背面所有答案块当成题面提前剧透曝光的问题
    if (isSuperBlockHtml(html)) {
        const sbMasked = maskSuperBlockForQuestion(html);
        if (sbMasked !== html) return sbMasked;
    }

    // 若未显式传入 customQuestion / customAnswer，尝试从 block 容器 HTML 中自适应提取
    let q = String(customQuestion ?? "").trim();
    if (!q && html) {
        q = extractAttrFromRawHtml(html, "custom-riff-title")
            || extractAttrFromRawHtml(html, "custom-lv-question")
            || extractAttrFromRawHtml(html, "custom-card-title");
    }
    let a = String(customAnswer ?? "").trim();
    if (a && !isMeaningfulCardAnswerAttr(a)) a = "";
    if (!a && html) {
        const sub = String(extractAttrFromRawHtml(html, "custom-lv-attr-subtype") || "").trim();
        const candidateKeys = sub === "direct"
            ? ["custom-lv-answer", "custom-card-answer", "custom-riff-answer", "custom-flashcard-answer"]
            : ["custom-riff-answer", "custom-lv-answer", "custom-card-answer", "custom-flashcard-answer"];
        for (const k of candidateKeys) {
            const v = extractAttrFromRawHtml(html, k);
            if (v && isMeaningfulCardAnswerAttr(v)) {
                a = v;
                break;
            }
        }
    }

    // 0.5 凡通过块属性设定了题干或答案的免侵入零标记属性问答卡（无挖空标记）：
    if (isAttrQaCard(html, q, a)) {
        const subtype = resolveAttrQaSubtype(null, html, q, a) ?? (q ? "recite" : "direct");
        if (subtype === "direct" || (!q && a)) {
            return renderAttrQaQuestionFace(stripAnswerAttrsFromHtml(html), { subtype: "direct", questionIsHtml: true });
        }
        return renderAttrQaQuestionFace(q, { subtype });
    }

    const template = document.createElement("template");
    template.innerHTML = String(html ?? "");
    stripEditorDecorationsFromReviewFragment(template.content);
    const marks = Array.from(template.content.querySelectorAll(MARK_SELECTOR));
    if (marks.length > 0) {
        let idx = 0;
        for (const mark of marks) {
            idx++;
            const rawText = (mark.textContent ?? "").trim();
            const richChild = mark.querySelector('img, svg, canvas, [data-type="inline-math"], .katex, .language-math');
            const fallbackAnswer = rawText
                || mark.querySelector('[data-content]')?.getAttribute('data-content')?.trim()
                || mark.querySelector('img')?.getAttribute('alt')?.trim()
                || (mark.querySelector('img') ? '[图片]' : mark.querySelector('[data-type="inline-math"], .katex, .language-math') ? '[公式]' : '');
            if (richChild) {
                const safeInner = mark.innerHTML
                    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
                    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
                mark.setAttribute("data-real-html", safeInner);
            }
            const length = Math.max(1, Array.from(mark.textContent || fallbackAnswer).length);
            mark.textContent = "\u00a0".repeat(length);
            mark.setAttribute("aria-hidden", "true");
            mark.setAttribute("data-cloze-idx", String(idx));
            mark.setAttribute("data-real-answer", fallbackAnswer);
            mark.setAttribute("title", marks.length > 1 ? `第 ${idx} 空（点击揭晓）` : "答案遮蔽（点击揭晓）");
        }
        return template.innerHTML;
    }

    // 存量闪卡无损遮罩自适应：若无 == 标记，检查是否存在 :: 概念分隔或 Q/A 问答
    maskDelimitedQaInHtml(template.content);
    return template.innerHTML;
}

export interface RenderedCardFace {
    /** 问题态 HTML（答案已安全遮蔽，公式/代码/排版正常解析，防读屏泄露） */
    questionHtml: string;
    /** 答案态 HTML（答案已高亮揭晓，与题干形成鲜明对照） */
    answerHtml: string;
    /** 卡面包含的富文本/公式/代码/图片等特征分析 */
    richness: FaceRichness;
    /** 提取出的所有答案文本片段集合 */
    extractedAnswers: string[];
    /** 卡片识别类型（供卡面呈现类型认知预备徽章） */
    cardType: "cloze" | "qa" | "code" | "list";
    /** 挖空数量（若为挖空卡） */
    clozeCount: number;
}

function escapeHtml(text: string): string {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * 轻量级安全卡面 Markdown 解析器：
 * 转换公式、代码、粗斜体、图片和段落，与思源内核卡面渲染语义保持一致。
 */
export function formatMarkdownToSafeHtml(markdown: string): string {
    let text = String(markdown ?? "");
    if (!text.trim()) return "";

    // 一次扫描保护代码、图片和公式；先开始的结构拥有内部文本，避免图片属性二次转义
    // 或把代码示例里的 Markdown 图片变成真实图片。占位前缀避开原文，保留用户的字面标记。
    let tokenPrefix = "@@LV_CARD_TOKEN_";
    while (text.includes(tokenPrefix)) tokenPrefix += "_";
    const protectedHtml: string[] = [];

    // 1. 保护并安全清洗内联 SVG 矢量画布与 Excalidraw 画布（Issue #14）
    // 严格排除思源列表点（iconDot）与系统小图标，防止列表圆点被放大为巨大黑球
    text = text.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, (svgRaw) => {
        if (/<use\b[^>]*(?:iconDot|#icon)/i.test(svgRaw) || /class=["'][^"']*protyle-action/i.test(svgRaw)) {
            if (/iconDot/i.test(svgRaw) && !svgRaw.includes("lv-icon-dot")) {
                if (!/class\s*=/i.test(svgRaw)) {
                    return svgRaw.replace(/<svg\b/i, '<svg class="lv-icon-dot"');
                }
                return svgRaw.replace(/class=["']([^"']*)["']/i, (_m, cls) => `class="${cls} lv-icon-dot"`);
            }
            return svgRaw;
        }
        let cleanSvg = svgRaw
            .replace(/<script\b[\s\S]*?<\/script>/gi, "")
            .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
            .replace(/javascript:/gi, "");
        if (!/class\s*=/i.test(cleanSvg)) {
            cleanSvg = cleanSvg.replace(/<svg\b/i, '<svg class="lv-card-svg"');
        } else if (!cleanSvg.includes("lv-card-svg")) {
            cleanSvg = cleanSvg.replace(/class=["']([^"']*)["']/i, (_match, cls) => `class="${cls} lv-card-svg"`);
        }
        return `${tokenPrefix}${protectedHtml.push(cleanSvg) - 1}@@`;
    });

    text = text.replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```|`([^`\n]+?)`|!\[([^\]]*)\]\(([^)\s]+)\)|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g,
        (_m, lang, blockCode, inlineCode, alt, url, blockMath, math) => {
            let html: string;
            if (blockCode !== undefined) {
                const cls = lang ? ` class="language-${escapeHtml(lang)}"` : "";
                html = `<pre><code${cls}>${escapeHtml(blockCode.trim())}</code></pre>`;
            } else if (inlineCode !== undefined) {
                html = `<code>${escapeHtml(inlineCode)}</code>`;
            } else if (url !== undefined) {
                html = `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" class="lv-card-img" />`;
            } else if (blockMath !== undefined) {
                html = `<div class="language-math katex-display">${escapeHtml(blockMath.trim())}</div>`;
            } else {
                html = `<span class="language-math katex-inline">${escapeHtml(math.trim())}</span>`;
            }
            return `${tokenPrefix}${protectedHtml.push(html) - 1}@@`;
        });

    // 3. 转义普通文本中的 HTML 字符
    text = escapeHtml(text);

    // 5. 粗体与斜体
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");

    // 6. 换行与段落
    text = text.replace(/\n{2,}/g, "</p><p>");
    text = text.replace(/\n/g, "<br/>");
    text = `<p>${text}</p>`;

    // 7. 单次还原，保护结构内的字面内容不再参与 Markdown 解析。
    text = text.replace(new RegExp(`${tokenPrefix}(\\d+)@@`, "g"), (_m, idx) => protectedHtml[Number(idx)] ?? "");

    // 清理可能产生的空段落
    return text.replace(/<p>\s*<\/p>/g, "");
}

/**
 * 统一卡面解析与双态遮蔽管线（Unified Card Face Pipeline）：
 * 支持从问答题（Q & A）或带 ==答案== 挖空的 Markdown 产出标准问题态与答案态 HTML。
 * 纯逻辑函数，在 Node/Vitest 和浏览器端均可秒级运行，完全无需依赖思源在线内核。
 */
export function renderUnifiedCardFace(input: {
    markdown?: string;
    question?: string;
    answer?: string;
    memo?: string;
    customRiffTitle?: string;
    customQuestion?: string;
    /** 自定义答案（custom-riff-answer / custom-lv-answer）：优先于正文作为复习背面主答案 */
    customAnswer?: string;
    /** 零标记属性问答子型 */
    attrSubtype?: AttrQaSubtype | null;
    template?: "qa" | "cloze";
    /** 参考答案标题，用于国际化；缺省为 "参考答案" */
    answerLabel?: string;
    /** 双向卡逆向回忆模式（A ➔ Q） */
    reversed?: boolean;
}): RenderedCardFace {
    const template = input.template ?? (input.markdown ? "cloze" : "qa");
    let q = (input.question ?? "").trim();
    let a = (input.answer ?? "").trim();
    let md = (input.markdown ?? "").trim();
    const customQ = (input.customQuestion || input.customRiffTitle || "").trim();
    const customA = (input.customAnswer ?? "").trim();

    // 如果未传 markdown 但传了 q 和 a
    if (!md && (q || a)) {
        if (template === "cloze" && q.includes("____")) {
            md = q.split("____").join(a ? `==${a}==` : "==答案==");
        } else if (template === "cloze" && a) {
            md = `${q} ==${a}==`;
        }
    }

    const extractedAnswers: string[] = [];
    // 先掩码围栏代码块与行内代码，防止代码里的 `==`（如 `a == b`）被误判为挖空定界符
    let codeTokenPrefix = "@@LV_CODE_TOKEN_";
    while (md.includes(codeTokenPrefix)) codeTokenPrefix += "_";
    const protectedCodes: string[] = [];
    const mdForCloze = md.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+?`/g, (m) => {
        return `${codeTokenPrefix}${protectedCodes.push(m) - 1}@@`;
    });
    const restoreProtectedCodes = (s: string) =>
        protectedCodes.length > 0
            ? s.replace(new RegExp(`${codeTokenPrefix}(\\d+)@@`, "g"), (_m, i) => protectedCodes[Number(i)] ?? "")
            : s;

    // 单个等号属于答案内容（常见于公式/代码），只有连续两个等号才是挖空边界。
    const clozePattern = /(?<!=)==((?:[^=]|=(?!=))+)==(?!=)/g;
    const answerMatches = [...mdForCloze.matchAll(clozePattern)];
    const hasCloze = answerMatches.length > 0;

    let questionHtml = "";
    let answerHtml = "";

    if (hasCloze) {
        // 提取所有被 == 包裹的挖空答案
        for (const m of answerMatches) {
            const val = restoreProtectedCodes(m[1] ?? "").trim();
            if (val) extractedAnswers.push(val);
        }

        const isMulti = answerMatches.length > 1;

        // 问题态：将 ==答案== 替换为语义化的遮蔽占位符（多空自动标号，不泄漏答案明文）
        let qIdx = 0;
        const qMd = restoreProtectedCodes(mdForCloze.replace(clozePattern, (_m, _ans) => {
            qIdx++;
            return isMulti ? `@@MASKED_SLOT_${qIdx}@@` : `@@MASKED_SLOT@@`;
        }));
        const formattedQ = formatMarkdownToSafeHtml(qMd);
        questionHtml = isMulti
            ? formattedQ.replace(
                /@@MASKED_SLOT_(\d+)@@/g,
                (_m, n) => `<mark class="lv-masked" data-type="mark" aria-hidden="true" data-cloze-idx="${n}" title="答案遮蔽第 ${n} 空"><span class="lv-mask-slot">［ ${n}: 回忆这里 ］</span></mark>`
            )
            : formattedQ.replace(
                /@@MASKED_SLOT@@/g,
                `<mark class="lv-masked" data-type="mark" aria-hidden="true" data-cloze-idx="1" title="答案遮蔽"><span class="lv-mask-slot">［ 回忆这里 ］</span></mark>`
            );

        // 答案态：将 ==答案== 替换为高亮揭晓标记（多空带微徽标）
        let aIdx = 0;
        const aMd = restoreProtectedCodes(mdForCloze.replace(clozePattern, (_m, ans) => {
            aIdx++;
            return isMulti ? `@@REVEALED_START_${aIdx}@@${ans}@@REVEALED_END@@` : `@@REVEALED_START@@${ans}@@REVEALED_END@@`;
        }));
        const formattedA = formatMarkdownToSafeHtml(aMd);
        answerHtml = isMulti
            ? formattedA
                .replace(/@@REVEALED_START_(\d+)@@/g, (_m, n) => `<mark class="lv-revealed" data-type="mark"><span class="lv-revealed-idx">${n}</span><span class="lv-revealed-text">`)
                .replace(/@@REVEALED_END@@/g, `</span></mark>`)
            : formattedA
                .replace(/@@REVEALED_START@@/g, `<mark class="lv-revealed" data-type="mark"><span class="lv-revealed-text">`)
                .replace(/@@REVEALED_END@@/g, `</span></mark>`);
    } else if ((customQ || customA) && !a && !q && md) {
        // 优先支持基于块属性设定的免侵入零标记属性问答 3 子型：
        // 1) direct：正面=块正文题干(md)，背面=答案属性(customA)
        // 2) recite：正面=属性题干(customQ)，背面=块正文(md) 或 customA + 笔记原文(md)
        // 3) dual：概念/术语 ↔ 释义/译文，支持正反双向复习(input.reversed)
        const subtype: AttrQaSubtype = input.attrSubtype ?? (customQ ? "recite" : "direct");
        if (!customQ && customA) {
            if (input.reversed) {
                extractedAnswers.push(md);
                questionHtml = renderAttrQaQuestionFace(customA, { subtype: "direct", reversed: true });
                answerHtml = renderAttrQaAnswerFace(
                    formatMarkdownToSafeHtml(md),
                    customA,
                    input.answerLabel ?? "原题干 (正文)",
                    "",
                    "",
                    { subtype: "direct", reversed: true },
                );
            } else {
                extractedAnswers.push(customA);
                questionHtml = renderAttrQaQuestionFace(md, { subtype: "direct" });
                answerHtml = renderAttrQaAnswerFace(
                    formatMarkdownToSafeHtml(customA),
                    md,
                    input.answerLabel ?? "参考答案",
                    "",
                    "",
                    { subtype: "direct" },
                );
            }
        } else if (input.reversed) {
            const promptSide = customA || md;
            extractedAnswers.push(customQ);
            questionHtml = renderAttrQaQuestionFace(promptSide, { subtype, reversed: true });
            answerHtml = renderAttrQaAnswerFace(
                formatMarkdownToSafeHtml(customQ),
                promptSide,
                input.answerLabel ?? "原概念 / 题干",
                customA ? formatMarkdownToSafeHtml(md) : "",
                "笔记原文",
                { subtype, reversed: true },
            );
        } else {
            const displayQ = customQ;
            const label = customA ? (input.answerLabel ?? "参考答案") : (input.answerLabel ?? "参考答案 (正文)");
            const displayA = customA || md;
            if (displayA) extractedAnswers.push(displayA);
            questionHtml = renderAttrQaQuestionFace(displayQ, { subtype });
            answerHtml = renderAttrQaAnswerFace(
                formatMarkdownToSafeHtml(displayA),
                displayQ,
                label,
                customA ? formatMarkdownToSafeHtml(md) : "",
                "笔记原文",
                { subtype },
            );
        }
    } else {
        // 普通问答模式（支持存量格式 :: 与 Q/A 前缀智能拆分、块备注答案与双向卡模式）
        let displayQ = q || md;
        let displayA = a;
        let label = input.answerLabel ?? "参考答案";

        // 存量卡格式自适应：若未显式传 a 且未带挖空，尝试从 md 中智能解析 :: 或 Q/A
        if (!displayA && !q && md) {
            const delimited = parseDelimitedQa(md);
            if (delimited) {
                displayQ = delimited.question;
                displayA = delimited.answer;
                label = input.answerLabel ?? (delimited.format === "double-colon" ? "概念释义" : "参考答案");
            } else if (input.memo?.trim()) {
                // 存量块备注作为答案
                displayA = input.memo.trim();
                label = input.answerLabel ?? "思源块备注答案";
            }
        } else if (!displayA && input.memo?.trim()) {
            displayA = input.memo.trim();
            label = input.answerLabel ?? "思源块备注答案";
        }

        if (input.reversed && a) {
            displayQ = a;
            displayA = q || md;
            label = input.answerLabel ?? "原问题 / 概念";
        }

        if (displayA) extractedAnswers.push(displayA);

        questionHtml = `<div class="lv-card-q-section">${formatMarkdownToSafeHtml(displayQ)}</div>`;
        if (displayA) {
            answerHtml = [
                `<div class="lv-card-q-section">${formatMarkdownToSafeHtml(displayQ)}</div>`,
                `<div class="lv-card-answer-divider"></div>`,
                `<div class="lv-card-a-section">`,
                `  <div class="lv-eyebrow lv-card-a-label">${escapeHtml(label)}</div>`,
                `  <div class="lv-card-a-body">${formatMarkdownToSafeHtml(displayA)}</div>`,
                `</div>`,
            ].join("\n");
        } else {
            answerHtml = questionHtml;
        }
    }

    const richness = analyzeFaceRichness(answerHtml || questionHtml);

    let cardType: "cloze" | "qa" | "code" | "list" = "qa";
    if (hasCloze) {
        cardType = "cloze";
    } else if (richness.code) {
        cardType = "code";
    } else if (
        (q && (q.includes("\n- ") || q.includes("\n1. "))) ||
        (a && (a.includes("\n- ") || a.includes("\n1. "))) ||
        md.includes("\n- ") ||
        md.includes("\n1. ")
    ) {
        cardType = "list";
    }

    return {
        questionHtml,
        answerHtml,
        richness,
        extractedAnswers,
        cardType,
        clozeCount: hasCloze ? extractedAnswers.length : 0,
    };
}

export {
    isSuperBlockHtml,
    maskSuperBlockForQuestion,
    renderSuperBlockAnswerFace,
    extractSuperBlockTexts,
};

/**
 * 提取卡片期望参考答案（按挖空标记 > 超级块背面 > 存量问答语法 > 纯文本回退顺序提取）
 */
export function extractExpectedCardAnswer(cardHtml: string): string {
    if (!cardHtml) return "";
    if (typeof document === "undefined") return "";
    const holder = document.createElement("div");
    holder.innerHTML = cardHtml;
    const marks = extractMarkTexts(holder);
    if (marks.length > 0) {
        return marks.join(" / ");
    }
    if (isSuperBlockHtml(cardHtml)) {
        const sbTexts = extractSuperBlockTexts(cardHtml);
        return sbTexts?.answerText ? sbTexts.answerText : (holder.textContent ?? "").trim();
    }
    const rawText = (holder.textContent ?? "").trim();
    const delimited = parseDelimitedQa(rawText);
    return delimited?.answer ? delimited.answer : rawText;
}

export interface CardAttrsMetadata<TOccl = any> {
    occlusion: TOccl | null;
    customAnswer: string;
    memo: string;
    cardMemo: string;
    isCustomPluginAnswer: boolean;
    expectedText: string;
    customRiffTitle: string;
    /** 免侵入问答卡自定义答案（custom-riff-answer）；为空表示回退笔记正文 */
    customRiffAnswer: string;
}

/**
 * 从块属性中解析遮挡数据与助记/插件自定义答案（包含闪卡工具箱 custom-riff-title 自定义题面
 * 与 custom-riff-answer 自定义答案）
 */
export function parseCardAttrsMetadata<TOccl = any>(
    attrs: Record<string, string>,
    currentExpectedText: string,
    rawHolderText: string,
    marksCount: number,
    parseOcclusionFn: (attrs: Record<string, string>) => TOccl | null
): CardAttrsMetadata<TOccl> {
    const occlusion = parseOcclusionFn(attrs);
    const examFallbackA = isMeaningfulCardAnswerAttr(String(attrs["custom-exam-answer"] || ""))
        ? String(attrs["custom-exam-answer"] || "").trim()
        : "";
    const customAnswer = String(
        extractValidCardAnswerAttr(attrs) ||
        examFallbackA ||
        ""
    ).trim();
    const memo = String(attrs.memo || attrs["custom-card-memo"] || attrs["custom-memo"] || attrs["custom-exam-analysis"] || "").trim();
    const customRiffTitle = extractCardQuestionAttr(attrs);
    const isCustomPluginAnswer = Boolean(customAnswer);
    const cardMemo = customAnswer || memo;
    let expectedText = currentExpectedText;
    if (marksCount === 0 && (!expectedText || expectedText === rawHolderText) && cardMemo) {
        expectedText = cardMemo;
    } else if (marksCount === 0 && (!expectedText || expectedText === rawHolderText) && customRiffTitle) {
        expectedText = rawHolderText;
    }
    return {
        occlusion,
        customAnswer,
        memo,
        cardMemo,
        isCustomPluginAnswer,
        expectedText,
        customRiffTitle,
        customRiffAnswer: customAnswer,
    };
}


/**
 * 把用户填写的自定义卡面 CSS 限定在卡面容器内，避免 `.b3-button { display:none }` 之类的规则
 * 波及设置弹窗和思源界面；同时去掉能闭合 <style> 或引入外部资源的片段。
 * 用 CSS 原生嵌套包裹：`.lv-card-content {…}` 会变成「作用域内的 .lv-card-content」，
 * 直接写的声明（如 `font-family: serif;`）作用于作用域容器本身。
 */
export function scopeCustomCardCss(rawCss: string | undefined | null, scopeSelector: string): string {
    const css = String(rawCss ?? "")
        .replace(/<\/?\s*style[^>]*>/gi, "")
        .replace(/<\s*\/?\s*script[^>]*>/gi, "")
        .replace(/@import[^;]*;?/gi, "")
        .trim();
    if (!css) return "";
    return `${scopeSelector} { ${css} }`;
}
