/**
 * 思源超级块闪卡（SuperBlock Flashcard）专用解析引擎
 *
 * 遵循思源原生闪卡规范：
 * - 超级块（data-type="NodeSuperBlock" 或 class="sb"）作为闪卡时：
 *   - 第 1 个子块：正面（Question / 题干）
 *   - 第 2 个及后续所有子块：背面（Answer / 答案）
 * 彻底根治“在问题态把背面所有答案块也当成问题提前曝光”的严重问题。
 */

import { MARK_SELECTOR } from "./card-face";

/**
 * 判定给定的 HTML 是否包含思源超级块结构
 */
export function isSuperBlockHtml(html: string): boolean {
    if (!html) return false;
    return (
        /data-type=["']NodeSuperBlock["']/i.test(html) ||
        /<div\b[^>]*\bclass=["'][^"']*\bsb\b[^"']*["']/i.test(html)
    );
}

export interface SuperBlockSplitResult {
    questionHtml: string;
    answerHtml: string;
    questionElement: Element;
    answerElements: Element[];
    answerSubBlockCount: number;
    superBlockId: string;
}

function getSubBlocks(sbContainer: Element): Element[] {
    return Array.from(sbContainer.children).filter((child) => {
        // 排除操作手柄与装饰节点
        if (child.classList.contains("protyle-action")) return false;
        // 必须为带有思源块标识的有效子块
        return child.hasAttribute("data-node-id") || child.hasAttribute("data-type") || child.classList.contains("p") || child.classList.contains("li") || child.classList.contains("list");
    });
}

function findSuperBlockContainer(doc: Document | Element | DocumentFragment): Element | null {
    if (doc instanceof Element) {
        if (doc.getAttribute("data-type") === "NodeSuperBlock" || doc.classList.contains("sb")) {
            return doc;
        }
    }
    return doc.querySelector("[data-type='NodeSuperBlock'], .sb");
}

/**
 * 解析并提取超级块的正面（第 1 块）与背面（后续所有块）
 */
export function splitSuperBlockElements(html: string): SuperBlockSplitResult | null {
    if (typeof document === "undefined" || !isSuperBlockHtml(html)) return null;

    const template = document.createElement("template");
    template.innerHTML = html.trim();

    const sb = findSuperBlockContainer(template.content);
    if (!sb) return null;

    const subBlocks = getSubBlocks(sb);
    if (subBlocks.length < 2) {
        // 子块少于2块，退化为普通块处理
        return null;
    }

    const questionElement = subBlocks[0];
    const answerElements = subBlocks.slice(1);
    const superBlockId = sb.getAttribute("data-node-id") || "";

    const questionHtml = questionElement.outerHTML;
    const answerHtml = answerElements.map((el) => el.outerHTML).join("\n");

    return {
        questionHtml,
        answerHtml,
        questionElement,
        answerElements,
        answerSubBlockCount: answerElements.length,
        superBlockId,
    };
}

/**
 * 生成问题态下的超级块 HTML：
 * 严格只展示第 1 个子块，彻底屏蔽第 2 个及后续所有答案子块，杜绝提前曝光
 */
export function maskSuperBlockForQuestion(html: string): string {
    const split = splitSuperBlockElements(html);
    if (!split) return html;

    // 如果第 1 个子块内部本身包含 ==挖空==（HTML 或字面），对其挖空打上遮罩
    let processedQHtml = split.questionHtml;
    if (processedQHtml.includes("==")) {
        processedQHtml = processedQHtml.replace(/==([\s\S]*?)==/g, () => {
            return `<mark class="lv-masked" data-type="mark" aria-hidden="true" title="答案遮蔽"><span class="lv-mask-slot">［ 回忆这里 ］</span></mark>`;
        });
    }

    const template = document.createElement("template");
    template.innerHTML = processedQHtml;

    const marks = Array.from(template.content.querySelectorAll(MARK_SELECTOR));
    let idx = 0;
    for (const mark of marks) {
        if (mark.classList.contains("lv-masked")) continue;
        idx++;
        const originalText = (mark.textContent ?? "").trim();
        const length = Math.max(1, Array.from(mark.textContent ?? "").length);
        mark.textContent = "\u00a0".repeat(length);
        mark.setAttribute("aria-hidden", "true");
        mark.setAttribute("data-cloze-idx", String(idx));
        mark.setAttribute("data-real-answer", originalText);
        mark.setAttribute("title", marks.length > 1 ? `第 ${idx} 空（点击揭晓）` : "答案遮蔽（点击揭晓）");
    }

    const maskedQuestionHtml = template.innerHTML;
    const answerCount = split.answerSubBlockCount;

    return [
        `<div class="lv-sb-card lv-sb-question-stage">`,
        `  <div class="lv-sb-question-section">${maskedQuestionHtml}</div>`,
        `  <div class="lv-card-answer-divider"></div>`,
        `  <div class="lv-sb-answer-placeholder" aria-hidden="true">`,
        `    <span class="lv-mask-slot">［ 超级块答案（${answerCount} 块内容）· 点击翻面或敲空格揭晓 ］</span>`,
        `  </div>`,
        `</div>`,
    ].join("\n");
}

/**
 * 生成答案态下的超级块 HTML：
 * 完整呈现第 1 块（问题）与后续所有块（答案），并插入优雅的答案区视觉分界
 */
export function renderSuperBlockAnswerFace(html: string): string {
    const split = splitSuperBlockElements(html);
    if (!split) return html;

    return [
        `<div class="lv-sb-card lv-sb-answer-stage">`,
        `  <div class="lv-sb-question-section">${split.questionHtml}</div>`,
        `  <div class="lv-card-answer-divider"></div>`,
        `  <div class="lv-sb-answer-section">`,
        `    <div class="lv-eyebrow lv-card-a-label">超级块答案 (背面)</div>`,
        `    <div class="lv-sb-answer-body">`,
        `      ${split.answerHtml}`,
        `    </div>`,
        `  </div>`,
        `</div>`,
    ].join("\n");
}

/**
 * 从超级块中提取纯文本形式的问题与答案（供打字输入判分、测验干扰项采样消费）
 */
export function extractSuperBlockTexts(html: string): { questionText: string; answerText: string } | null {
    const split = splitSuperBlockElements(html);
    if (!split) return null;

    const questionText = (split.questionElement.textContent ?? "").trim();
    const answerText = split.answerElements
        .map((el) => (el.textContent ?? "").trim())
        .filter(Boolean)
        .join("\n");

    return { questionText, answerText };
}
