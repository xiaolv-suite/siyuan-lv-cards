/**
 * 大纲层级单调栈推导纯逻辑（Node 可单测，离线/兜底通道）。
 * 
 * 核心目标：
 * 当无法直接调用思源内核 /api/block/getBlockBreadcrumb 时，
 * 基于同文档内前置标题数组，利用单调栈算法还原严格自顶向下的父级大纲链。
 */
import { cleanTitleText } from "./review-breadcrumbs";

export interface HeadingNode {
    id: string;
    level: number; // 1 ~ 6 (对应 h1 ~ h6)
    title: string;
    sort: number;
}

/**
 * 解析思源标题 subtype (h1 ~ h6) 为数字等级 1 ~ 6
 */
export function parseHeadingLevel(subtype: string): number {
    const match = String(subtype ?? "").match(/h([1-6])/i);
    return match ? parseInt(match[1], 10) : 1;
}

/**
 * 基于单调栈算法从无序/平铺的前置标题序列中推导直系祖先标题链（纯函数）
 *
 * 算法原理：
 * 遍历按 sort 升序排列的前置标题，若新遇到标题层级 level <= 栈顶标题层级，
 * 说明栈顶标题的章节已结束，将其弹出，直到栈顶层级更浅（数值更小），再压栈。
 */
export function extractAncestorHeadingsByStack(
    rawHeadings: readonly { id: string; subtype: string; content: string; sort: number }[],
    options: { maxDepth?: number } = {}
): HeadingNode[] {
    if (!Array.isArray(rawHeadings) || rawHeadings.length === 0) {
        return [];
    }

    const maxDepth = Math.max(1, options.maxDepth ?? 4);
    const stack: HeadingNode[] = [];
    const sorted = [...rawHeadings].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

    for (const h of sorted) {
        const level = parseHeadingLevel(h.subtype);
        const title = cleanTitleText(String(h.content ?? ""));
        if (!title) continue;

        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
            stack.pop();
        }

        stack.push({
            id: String(h.id),
            level,
            title,
            sort: h.sort ?? 0,
        });
    }

    return stack.slice(0, maxDepth);
}
