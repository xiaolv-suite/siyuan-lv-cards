/**
 * 小驴闪卡 · 渐进学习（Incremental Learning）与两级调度解耦核心规约
 * 
 * 落实 Issue #19 第二期中枢指令：
 * 1. 两套调度引擎物理隔离（Two-Tier Schedulers）：
 *    - 严禁将大段粗糙摘录卡直接扔进 FSRS 遗忘曲线算法；
 *    - 设立轻量级摘录箱与独立轮转队列，不污染原生 FSRS 的 R, S, D 参数；
 * 2. 接收小驴拾遗渐进摘录并保留完整血缘（Extract with Lineage）：
 *    - 自动追加原文反链：`> 来源：((sourceBlockId "原文标题"))`；
 *    - 打上 `custom-lv-card-type: "extract"`、`custom-lv-source-doc`、`custom-lv-source-block`；
 * 3. Dismiss 机制（解散归档生命周期）：
 *    - 提炼出原子卡后一键 Dismiss（或快捷键 Ctrl+D）；
 *    - 打上 `custom-lv-dismissed: "true"`，彻底移出日常复习队列，卡片与反链永久归档；
 * 4. 最小信息过载警示（Quality Guard）：
 *    - 字数 > 250 或挖空 > 3 时温和气泡提示拆分。
 */

export const ATTR_LV_CARD_TYPE = "custom-lv-card-type";
export const ATTR_LV_SOURCE_DOC = "custom-lv-source-doc";
export const ATTR_LV_SOURCE_BLOCK = "custom-lv-source-block";
export const ATTR_LV_DISMISSED = "custom-lv-dismissed";

export type LvCardType = "atomic" | "extract";

export interface ExtractEnvelope {
    content: string;
    sourceBlockId: string;
    sourceDocId?: string;
    sourceTitle?: string;
    tags?: string[];
}

export interface ExtractCardMetadata {
    attrs: Record<string, string>;
    markdown: string;
}

/**
 * 判断卡片是否为大段粗加工摘录卡
 */
export function isExtractCard(attrs?: Record<string, string> | null): boolean {
    if (!attrs) return false;
    return attrs[ATTR_LV_CARD_TYPE] === "extract";
}

/**
 * 判断卡片是否已被解散归档（Dismissed）
 */
export function isDismissedCard(attrs?: Record<string, string> | null): boolean {
    if (!attrs) return false;
    return attrs[ATTR_LV_DISMISSED] === "true";
}

/**
 * 判定卡片是否应当绕过内核 FSRS 算法
 * 规则：
 * 1. 任何已 Dismiss 的卡片严禁进入复习排期；
 * 2. 任何粗糙摘录卡（extract）在提炼为原子问答/挖空前，严禁记入 FSRS 稳定性与难度矩阵。
 */
export function shouldBypassFsrs(attrs?: Record<string, string> | null): boolean {
    return isDismissedCard(attrs) || isExtractCard(attrs);
}

/**
 * 生成带原文反链血缘的摘录卡正文与属性
 */
export function buildExtractCard(envelope: ExtractEnvelope): ExtractCardMetadata {
    const rawContent = String(envelope.content ?? "").trim();
    const sourceBlock = String(envelope.sourceBlockId ?? "").trim();
    const sourceTitle = String(envelope.sourceTitle ?? "原文上下文").replace(/["\n\r]/g, " ").trim();

    const backlink = sourceBlock ? `\n\n> 来源：(( ${sourceBlock} "${sourceTitle}" ))` : "";
    const markdown = `${rawContent}${backlink}`.trim();

    const attrs: Record<string, string> = {
        [ATTR_LV_CARD_TYPE]: "extract",
        [ATTR_LV_DISMISSED]: "false",
    };
    if (sourceBlock) attrs[ATTR_LV_SOURCE_BLOCK] = sourceBlock;
    if (envelope.sourceDocId?.trim()) attrs[ATTR_LV_SOURCE_DOC] = envelope.sourceDocId.trim();

    return { attrs, markdown };
}

/**
 * 生成 Dismiss 解散归档属性补丁
 */
export function buildDismissAttrs(): Record<string, string> {
    return {
        [ATTR_LV_DISMISSED]: "true",
    };
}

/**
 * 从普通复习队列中过滤掉已被 Dismiss 的卡片
 */
export function filterDismissedFromQueue<T extends { id?: string; blockID?: string; cardID?: string }>(
    queue: readonly T[],
    dismissedBlockIDs: ReadonlySet<string>,
): T[] {
    return queue.filter(item => {
        const id = item.blockID ?? item.id ?? item.cardID ?? "";
        return !dismissedBlockIDs.has(id);
    });
}

export interface OverloadInspection {
    overloaded: boolean;
    charCount: number;
    clozeCount: number;
    suggestion?: string;
}

/**
 * 最小信息原则检查（Minimum Information Principle / Quality Guard）
 * 规约：
 * 1. 纯正文字符数 > 250；
 * 2. 挖空数 > 3；
 * 命中任一条件即触发温和气泡建议。
 */
export function checkMinimumInformationPrinciple(markdown: string): OverloadInspection {
    const raw = String(markdown ?? "");
    // 清理 markdown 标记与反链引用计算纯字符数
    const cleanedText = raw
        .replace(/>\s*来源：\(\([^\)]+\)\)/g, " ")
        .replace(/==([\s\S]*?)==/g, "$1")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, "");

    const charCount = cleanedText.length;
    const clozeMatches = [...raw.matchAll(/==([\s\S]*?)==/g)];
    const clozeCount = clozeMatches.length;

    const isCharOver = charCount > 250;
    const isClozeOver = clozeCount > 3;

    if (isCharOver || isClozeOver) {
        let reason = "";
        if (isCharOver && isClozeOver) {
            reason = `此卡信息量较大（${charCount} 字 / ${clozeCount} 处挖空）`;
        } else if (isCharOver) {
            reason = `此卡内容较长（${charCount} 字）`;
        } else {
            reason = `此卡挖空过多（${clozeCount} 处挖空）`;
        }
        return {
            overloaded: true,
            charCount,
            clozeCount,
            suggestion: `💡 ${reason}，建议坚守最小信息原则，拆分为原子卡或提炼核心问答。`,
        };
    }

    return {
        overloaded: false,
        charCount,
        clozeCount,
    };
}
