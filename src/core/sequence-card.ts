/**
 * RemNote 风格列表阶梯展开卡纯逻辑核心模块（Node 可单测，纯函数）。
 *
 * 核心设计目标：
 * 1. 零正文污染：卡片类型与模式由块属性 custom-lv-card-type: "sequence" 控制；
 * 2. 结构化切分：将无序/有序列表（NodeList）或超级块（NodeSuperBlock）中的多要点切分为阶梯项；
 * 3. 逐项回忆状态机：hidden (占位骨架) -> active (高亮呼吸聚焦) -> revealed (已揭晓答案)；
 * 4. 靶向掌握打标：支持单项打标掌握 (markedCorrect: true/false)，支持同场 Requeue 针对性巩固；
 * 5. 跨端与零 CLS：预先提供 totalCount，支撑 UI 骨架槽预填充与高度防抖。
 */
import { cleanTitleText } from "./review-breadcrumbs";

export interface SequenceItem {
    index: number;
    id: string;
    rawHtml: string;
    cleanText: string;
    status: "hidden" | "active" | "revealed";
    markedCorrect?: boolean; // 用户标记的掌握状态（true: 正确, false: 遗漏）
}

export interface SequenceCardModel {
    cardId: string;
    blockId: string;
    questionTitle: string;
    items: SequenceItem[];
    revealedCount: number;
    totalCount: number;
    isFullyRevealed: boolean;
}

/**
 * 识别当前 HTML 或属性是否应当按阶梯列表卡呈现
 */
export function isSequenceCard(html: string | undefined | null, attrs?: Record<string, string> | null): boolean {
    if (attrs && attrs["custom-lv-card-type"] === "sequence") {
        return true;
    }
    const raw = String(html ?? "");
    if (/data-lv-card-type=["']sequence["']/i.test(raw) || /custom-lv-card-type=["']sequence["']/i.test(raw)) {
        return true;
    }
    return false;
}

/**
 * Node 单测/离线环境下的纯正则降级切分器
 */
export function parseSequenceFastFallback(
    html: string,
    questionTitle: string = "",
    cardId: string = ""
): SequenceCardModel {
    const raw = html.trim();
    const items: SequenceItem[] = [];

    // 提取 blockId
    const blockIdMatch = raw.match(/data-node-id=["']([^"']+)["']/i);
    const blockId = blockIdMatch ? blockIdMatch[1] : "";

    // 1. 匹配 <li> 或 data-type="NodeListItem"
    const liRegex = /<li\b[^>]*>([\s\S]*?)<\/li>|<div\b[^>]*data-type=["']NodeListItem["'][^>]*>([\s\S]*?)<\/div>/gi;
    let match: RegExpExecArray | null;
    let idx = 0;

    while ((match = liRegex.exec(raw)) !== null) {
        const itemHtml = match[1] || match[2] || "";
        const cleanText = cleanTitleText(itemHtml);
        if (cleanText) {
            items.push({
                index: idx,
                id: `item-${idx}`,
                rawHtml: itemHtml.trim(),
                cleanText,
                status: idx === 0 ? "active" : "hidden",
            });
            idx++;
        }
    }

    // 2. 若不是 li 列表，尝试切分段落 <p>
    if (items.length === 0) {
        const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p>|<div\b[^>]*data-type=["']NodeParagraph["'][^>]*>([\s\S]*?)<\/div>/gi;
        while ((match = pRegex.exec(raw)) !== null) {
            const itemHtml = match[1] || match[2] || "";
            const cleanText = cleanTitleText(itemHtml);
            if (cleanText) {
                items.push({
                    index: idx,
                    id: `item-${idx}`,
                    rawHtml: itemHtml.trim(),
                    cleanText,
                    status: idx === 0 ? "active" : "hidden",
                });
                idx++;
            }
        }
    }

    let finalTitle = questionTitle.trim();
    let finalItems = items;

    // 若无指定题干且项数大于 1，可由首项充当题干
    if (!finalTitle && finalItems.length > 1) {
        finalTitle = finalItems[0].cleanText;
        finalItems = finalItems.slice(1).map((it, i) => ({
            ...it,
            index: i,
            status: i === 0 ? "active" : "hidden",
        }));
    }

    const totalCount = finalItems.length;
    const isFullyRevealed = totalCount <= 1;
    if (isFullyRevealed && totalCount === 1) {
        finalItems[0].status = "revealed";
    }

    return {
        cardId,
        blockId,
        questionTitle: finalTitle || "请按序回忆以下各条要点：",
        items: finalItems,
        revealedCount: isFullyRevealed ? totalCount : 0,
        totalCount,
        isFullyRevealed,
    };
}

/**
 * 从列表或超级块 HTML 中切分题干与多项阶梯条目（纯函数，支持 DOM 解析与 Node 兼容）
 */
export function parseSequenceCard(
    html: string,
    customTitle: string = "",
    cardId: string = ""
): SequenceCardModel {
    if (!html) {
        return {
            cardId,
            blockId: "",
            questionTitle: customTitle,
            items: [],
            revealedCount: 0,
            totalCount: 0,
            isFullyRevealed: true,
        };
    }

    let questionTitle = customTitle.trim();

    if (typeof document === "undefined") {
        return parseSequenceFastFallback(html, questionTitle, cardId);
    }

    const template = document.createElement("template");
    template.innerHTML = html.trim();
    const container = template.content.firstElementChild as HTMLElement | null;

    if (!container) {
        return {
            cardId,
            blockId: "",
            questionTitle,
            items: [],
            revealedCount: 0,
            totalCount: 0,
            isFullyRevealed: true,
        };
    }

    const blockId = container.getAttribute("data-node-id") || "";
    const items: SequenceItem[] = [];

    // 1. 若为 NodeList (ul / ol / list)
    if (
        container.getAttribute("data-type") === "NodeList" ||
        container.classList.contains("list") ||
        container.tagName === "UL" ||
        container.tagName === "OL"
    ) {
        const lis = Array.from(container.children).filter(el =>
            el.getAttribute("data-type") === "NodeListItem" ||
            el.classList.contains("li") ||
            el.tagName === "LI"
        );
        lis.forEach((li, idx) => {
            const clone = li.cloneNode(true) as HTMLElement;
            clone.querySelectorAll(".protyle-action, .protyle-attr").forEach(el => el.remove());
            const cleanText = cleanTitleText(clone.textContent || "");
            items.push({
                index: idx,
                id: li.getAttribute("data-node-id") || `item-${idx}`,
                rawHtml: clone.innerHTML.trim(),
                cleanText,
                status: idx === 0 ? "active" : "hidden",
            });
        });
    }
    // 2. 若为 NodeSuperBlock (超级块)
    else if (
        container.getAttribute("data-type") === "NodeSuperBlock" ||
        container.classList.contains("sb")
    ) {
        const subBlocks = Array.from(container.children).filter(el =>
            el.hasAttribute("data-node-id") ||
            el.classList.contains("p") ||
            el.classList.contains("li")
        );
        if (!questionTitle && subBlocks.length > 0) {
            questionTitle = cleanTitleText(subBlocks[0].textContent || "");
        }
        const answerSubBlocks = (!customTitle.trim() && subBlocks.length > 1) ? subBlocks.slice(1) : subBlocks;
        answerSubBlocks.forEach((sbChild, idx) => {
            const clone = sbChild.cloneNode(true) as HTMLElement;
            clone.querySelectorAll(".protyle-action, .protyle-attr").forEach(el => el.remove());
            const cleanText = cleanTitleText(clone.textContent || "");
            items.push({
                index: idx,
                id: sbChild.getAttribute("data-node-id") || `item-${idx}`,
                rawHtml: clone.outerHTML.trim(),
                cleanText,
                status: idx === 0 ? "active" : "hidden",
            });
        });
    } else {
        // 通用兜底
        return parseSequenceFastFallback(html, questionTitle, cardId);
    }

    const totalCount = items.length;
    const isFullyRevealed = totalCount <= 1;
    if (isFullyRevealed && totalCount === 1) {
        items[0].status = "revealed";
    }

    return {
        cardId,
        blockId,
        questionTitle: questionTitle || "请按序回忆以下各条要点：",
        items,
        revealedCount: isFullyRevealed ? totalCount : 0,
        totalCount,
        isFullyRevealed,
    };
}

/**
 * 推进揭晓下一条（纯函数状态转移）
 */
export function advanceSequenceStep(model: SequenceCardModel): SequenceCardModel {
    if (model.isFullyRevealed || model.revealedCount >= model.totalCount) {
        return {
            ...model,
            revealedCount: model.totalCount,
            isFullyRevealed: true,
            items: model.items.map(it => ({ ...it, status: "revealed" as const })),
        };
    }

    const nextRevealedCount = model.revealedCount + 1;
    const isFullyRevealed = nextRevealedCount >= model.totalCount;

    const updatedItems = model.items.map((item, idx) => {
        if (idx < nextRevealedCount) {
            return { ...item, status: "revealed" as const };
        }
        if (idx === nextRevealedCount) {
            return { ...item, status: "active" as const };
        }
        return { ...item, status: "hidden" as const };
    });

    return {
        ...model,
        items: updatedItems,
        revealedCount: nextRevealedCount,
        isFullyRevealed,
    };
}

/**
 * 一键揭开全部
 */
export function revealAllSequence(model: SequenceCardModel): SequenceCardModel {
    return {
        ...model,
        revealedCount: model.totalCount,
        isFullyRevealed: true,
        items: model.items.map(item => ({ ...item, status: "revealed" as const })),
    };
}

/**
 * 重置从第 1 项重新回忆
 */
export function resetSequenceProgress(model: SequenceCardModel): SequenceCardModel {
    if (model.totalCount <= 1) {
        return { ...model, revealedCount: model.totalCount, isFullyRevealed: true };
    }
    return {
        ...model,
        revealedCount: 0,
        isFullyRevealed: false,
        items: model.items.map((item, idx) => ({
            ...item,
            status: idx === 0 ? "active" : "hidden",
            markedCorrect: undefined,
        })),
    };
}

/**
 * 标记特定阶梯条目的掌握状态（自测打标）
 */
export function markSequenceItem(
    model: SequenceCardModel,
    itemIndex: number,
    correct: boolean
): SequenceCardModel {
    if (itemIndex < 0 || itemIndex >= model.items.length) {
        return model;
    }
    const nextItems = model.items.map((it, idx) => {
        if (idx === itemIndex) {
            return { ...it, markedCorrect: correct };
        }
        return it;
    });
    return {
        ...model,
        items: nextItems,
    };
}
