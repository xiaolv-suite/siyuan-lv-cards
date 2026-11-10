/**
 * 沉睡知识挖掘仪（Dormant Knowledge Discovery Engine）
 *
 * 借鉴思源社区优秀知识沉淀与图谱挖掘设计：
 * 遍历或查询笔记本中带有 `==` 关键高亮标记但尚未加入任何闪卡组（无 custom-riff-decks 属性）的块，
 * 提取核心重点提炼为沉睡知识候选集，引导用户一键收纳进闪卡库，打破“只画线不复习”的知识沉睡孤岛。
 */

export interface DormantKnowledgeCandidate {
    blockID: string;
    markdown: string;
    highlightTexts: string[];
    excerpt: string;
}

const HIGHLIGHT_REGEX = /==([\s\S]*?)==/g;

/**
 * 清理纯文本摘要
 */
function cleanExcerpt(md: string): string {
    return String(md ?? "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * 判定块是否已加入闪卡系统（已有任何 riff 或自定义闪卡属性）
 */
export function isBlockEnrolledAsCard(ial?: string, markdown?: string): boolean {
    const ialStr = String(ial ?? "");
    const mdStr = String(markdown ?? "");
    if (ialStr.includes("custom-riff-decks") || ialStr.includes("custom-flashcard")) {
        return true;
    }
    if (mdStr.includes("custom-riff-decks")) {
        return true;
    }
    return false;
}

/**
 * 从候选块列表中识别所有包含高亮但尚未制卡的沉睡知识块
 */
export function findDormantKnowledgeBlocks(
    blocks: Array<{ id: string; markdown?: string; ial?: string }>,
    limit = 10,
): DormantKnowledgeCandidate[] {
    const candidates: DormantKnowledgeCandidate[] = [];

    for (const b of blocks) {
        if (!b.id) continue;
        const md = String(b.markdown ?? "").trim();
        if (!md) continue;

        // 排除已制卡块
        if (isBlockEnrolledAsCard(b.ial, md)) {
            continue;
        }

        // 提取块内包含的高亮文本
        const highlights: string[] = [];
        let match: RegExpExecArray | null;
        const regex = new RegExp(HIGHLIGHT_REGEX);
        while ((match = regex.exec(md)) !== null) {
            const hit = (match[1] ?? "").trim();
            if (hit && !highlights.includes(hit)) {
                highlights.push(hit);
            }
        }

        if (highlights.length > 0) {
            candidates.push({
                blockID: b.id,
                markdown: md,
                highlightTexts: highlights,
                excerpt: cleanExcerpt(md).slice(0, 100),
            });
            if (candidates.length >= limit) {
                break;
            }
        }
    }

    return candidates;
}

/**
 * 将沉睡知识候选块格式化为 Markdown 导入清单（可直接送入制卡或收件箱）
 */
export function formatDormantCandidatesToCards(
    candidates: DormantKnowledgeCandidate[],
): Array<{ blockID: string; markdown: string }> {
    return candidates.map(c => ({
        blockID: c.blockID,
        markdown: c.markdown,
    }));
}
