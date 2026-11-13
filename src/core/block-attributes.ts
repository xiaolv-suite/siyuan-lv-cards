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
