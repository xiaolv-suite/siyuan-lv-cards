/**
 * 小驴闪卡 · 思源笔记块属性镜像与来源链接规约（Block Attributes & Linkage）
 * 集中管理写入思源块属性（IAL）的键名、属性补丁构建与反向链接语法。
 *
 * 遵循设计原则：
 * 1. 状态进块属性（custom-lv-*）：零正文侵入，打通思源搜索、SQL 嵌入块与原生 Attribute View；
 * 2. 关系走双向块引（((id "title"))）：打通思源原生反向链接面板与知识图谱；
 * 3. 纯函数设计：零 I/O、无环境依赖、可单元测试。
 */

export const ATTR_LV_STARRED = "custom-lv-starred";
export const ATTR_LV_LEECH = "custom-lv-leech";
export const ATTR_LV_LAPSES = "custom-lv-lapses";
export const ATTR_LV_ERROR_REASON = "custom-lv-error-reason";
export const ATTR_LV_SOURCE_DOC = "custom-lv-source-doc";
export const ATTR_LV_SOURCE_BLOCK = "custom-lv-source-block";
export const ATTR_LV_CARD_TYPE = "custom-lv-card-type";
export const ATTR_LV_DISMISSED = "custom-lv-dismissed";
export const ATTR_RIFF_TITLE = "custom-riff-title";
export const ATTR_LV_QUESTION = "custom-lv-question";
export const ATTR_CARD_TITLE = "custom-card-title";
export const ATTR_RIFF_ANSWER = "custom-riff-answer";
export const ATTR_LV_ANSWER = "custom-lv-answer";
export const ATTR_LV_OCCLUSION = "custom-lv-occlusion";

/**
 * 从块属性集合中提取闪卡自定义问题/标题
 * （优先 custom-riff-title 与闪卡工具箱 100% 互通，兼容 custom-lv-question 与 custom-card-title）
 */
export function extractCardQuestionAttr(attrs?: Record<string, string> | null): string {
    if (!attrs) return "";
    return String(attrs[ATTR_RIFF_TITLE] || attrs[ATTR_LV_QUESTION] || attrs[ATTR_CARD_TITLE] || "").trim();
}

/**
 * 从块属性集合中提取闪卡自定义答案
 * （custom-riff-answer 为空时，复习背面自动回退使用笔记正文作为答案）
 */
export function extractCardAnswerAttr(attrs?: Record<string, string> | null): string {
    if (!attrs) return "";
    return String(attrs[ATTR_RIFF_ANSWER] || attrs[ATTR_LV_ANSWER] || "").trim();
}

/**
 * 构建免侵入问答闪卡的问题属性补丁（保存至 custom-riff-title，清空时设为空字符串）
 * 严格清洗换行符为单个空格，杜绝损坏思源 IAL 语法结构导致思源无法更换块模式/块类型
 */
export function buildCardQuestionAttrs(question: string): Record<string, string> {
    const q = (question ?? "").trim().replace(/[\r\n]+/g, " ");
    return {
        [ATTR_RIFF_TITLE]: q,
    };
}

/**
 * 构建免侵入问答闪卡的自定义答案属性补丁（保存至 custom-riff-answer，空串表示回退正文）
 * 严格清洗换行符为单个空格，杜绝损坏思源 IAL 语法结构导致思源无法更换块模式/块类型
 */
export function buildCardAnswerAttrs(answer: string): Record<string, string> {
    const a = (answer ?? "").trim().replace(/[\r\n]+/g, " ");
    return {
        [ATTR_RIFF_ANSWER]: a,
    };
}

/**
 * 一次性构建免侵入问答卡的「问题 + 答案」双属性补丁（单次 setBlockAttrs 原子写入）
 */
export function buildAttrQaAttrs(question: string, answer?: string): Record<string, string> {
    return {
        ...buildCardQuestionAttrs(question),
        ...buildCardAnswerAttrs(answer ?? ""),
    };
}

/**
 * 构建问答属性彻底清除补丁（弹窗"清空"动作专用）：
 * 思源内核 /api/attr/setBlockAttrs 传 "" 只保留空值键（IAL 死键残留），
 * 必须传 null 才会把键从块属性与 attributes 索引表真正删除；
 * 且须同时清除 custom-lv-question / custom-card-title / custom-lv-answer 旧兼容键——
 * 否则读取侧（extractCardQuestionAttr）会从残留旧键回填，清空后问题"复活"。
 */
export function buildAttrQaClearAttrs(): Record<string, null> {
    return {
        [ATTR_RIFF_TITLE]: null,
        [ATTR_RIFF_ANSWER]: null,
        [ATTR_LV_QUESTION]: null,
        [ATTR_LV_ANSWER]: null,
        [ATTR_CARD_TITLE]: null,
    };
}

/**
 * 构建星标卡块属性补丁
 */
export function buildStarredAttrs(starred: boolean): Record<string, string> {
    return {
        [ATTR_LV_STARRED]: starred ? "true" : "",
    };
}

/**
 * 构建水蛭疑难卡块属性补丁
 */
export function buildLeechAttrs(isLeech: boolean, lapses?: number): Record<string, string> {
    return {
        [ATTR_LV_LEECH]: isLeech ? "true" : "",
        ...(lapses !== undefined ? { [ATTR_LV_LAPSES]: isLeech ? String(lapses) : "" } : {}),
    };
}

/**
 * 构建错因标注块属性补丁
 */
export function buildErrorReasonAttrs(reason: string): Record<string, string> {
    return {
        [ATTR_LV_ERROR_REASON]: reason.trim(),
    };
}

/**
 * 构建来源血缘块属性补丁
 */
export function buildSourceLinkAttrs(sourceDocID?: string, sourceBlockID?: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    if (sourceDocID?.trim()) attrs[ATTR_LV_SOURCE_DOC] = sourceDocID.trim();
    if (sourceBlockID?.trim()) attrs[ATTR_LV_SOURCE_BLOCK] = sourceBlockID.trim();
    return attrs;
}

/**
 * 校验卡片 Markdown 是否已包含来源反链引用
 */
export function hasCardSourceBacklink(markdown: string): boolean {
    return />\s*来源：\(\(\s*[^\s")]+(?:\s+"[^"]*")?\s*\)\)/.test(String(markdown ?? ""));
}

/**
 * 生成规范的思源块引用反链标记行：`\n\n> 来源：(( id "标题" ))`
 */
export function buildCardSourceBacklink(sourceRefId: string, title?: string): string {
    const cleanId = String(sourceRefId ?? "").trim();
    if (!cleanId) return "";
    const cleanTitle = String(title ?? "原笔记").replace(/["\n\r]/g, " ").trim() || "原笔记";
    return `\n\n> 来源：(( ${cleanId} "${cleanTitle}" ))`;
}

/**
 * 为卡片 Markdown 附加来源双向块引（若已包含或为空则原样返回）
 */
export function attachCardSourceBacklink(markdown: string, sourceRefId: string, title?: string): string {
    const raw = String(markdown ?? "").trim();
    if (!raw || !sourceRefId.trim() || hasCardSourceBacklink(raw)) {
        return raw;
    }
    // 超级块语法内部保持结构闭合，反链不加在尾部外侧
    if (raw.startsWith("{{{") && raw.endsWith("}}}")) {
        return raw;
    }
    return `${raw}${buildCardSourceBacklink(sourceRefId, title)}`;
}
