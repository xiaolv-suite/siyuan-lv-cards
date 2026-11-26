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
export const ATTR_CARD_ANSWER = "custom-card-answer";
export const ATTR_LV_ATTR_SUBTYPE = "custom-lv-attr-subtype";
export const ATTR_LV_HINT = "custom-lv-hint";
export const ATTR_LV_BIDI = "custom-lv-bidi";
export const ATTR_LV_OCCLUSION = "custom-lv-occlusion";

/**
 * 零标记属性问答 3 子型：
 * - direct：直接问答型（正面=块正文题干，背面=答案属性 custom-lv-answer / custom-card-answer）
 * - recite：背诵自测型（正面=标题/关键词提示，背面=完整块正文或要点对照，支持提示展开自评）
 * - dual：双面对照型（正面=概念/术语/外语表达，背面=释义/例句/译文，支持正反双向复习）
 */
export type AttrQaSubtype = "direct" | "recite" | "dual";

export const ATTR_QA_SUBTYPE_LABELS: Record<AttrQaSubtype, string> = {
    direct: "直接问答",
    recite: "背诵自测",
    dual: "双面对照",
};

/**
 * 从块属性集合中提取闪卡自定义问题/标题
 * （优先 custom-riff-title 与闪卡工具箱 100% 互通，兼容 custom-lv-question 与 custom-card-title）
 */
export function extractCardQuestionAttr(attrs?: Record<string, string> | null): string {
    if (!attrs) return "";
    return String(attrs[ATTR_RIFF_TITLE] || attrs[ATTR_LV_QUESTION] || attrs[ATTR_CARD_TITLE] || "").trim();
}

/**
 * 从块属性集合中提取闪卡自定义答案（全门禁与复习渲染统一优先级事实源）：
 * - direct 子型：custom-lv-answer > custom-card-answer > custom-riff-answer > custom-flashcard-answer
 * - 其它/存量：custom-riff-answer > custom-lv-answer > custom-card-answer > custom-flashcard-answer
 * （为空时回退使用笔记正文）
 */
export function extractCardAnswerAttr(
    attrs?: Record<string, string> | null,
    isValid: (val: string) => boolean = (v) => Boolean(v.trim()),
): string {
    if (!attrs) return "";
    const keys = String(attrs[ATTR_LV_ATTR_SUBTYPE] || "").trim() === "direct"
        ? [ATTR_LV_ANSWER, ATTR_CARD_ANSWER, ATTR_RIFF_ANSWER, "custom-flashcard-answer"]
        : [ATTR_RIFF_ANSWER, ATTR_LV_ANSWER, ATTR_CARD_ANSWER, "custom-flashcard-answer"];
    for (const k of keys) {
        const v = String(attrs[k] || "").trim();
        if (v && isValid(v)) {
            return v;
        }
    }
    return "";
}

/**
 * 从块属性中提取零标记属性问答子型（缺省按存在问题/答案属性自动推断）
 */
export function extractAttrQaSubtype(attrs?: Record<string, string> | null): AttrQaSubtype | null {
    if (!attrs) return null;
    const explicit = String(attrs[ATTR_LV_ATTR_SUBTYPE] || "").trim();
    if (explicit === "direct" || explicit === "recite" || explicit === "dual") {
        return explicit;
    }
    const q = extractCardQuestionAttr(attrs);
    const a = extractCardAnswerAttr(attrs);
    if (q) {
        return attrs[ATTR_LV_BIDI] === "true" ? "dual" : "recite";
    }
    if (a) {
        return "direct";
    }
    return null;
}

/**
 * 提取背诵自测型的关键词/提示属性（custom-lv-hint）
 */
export function extractAttrQaHint(attrs?: Record<string, string> | null): string {
    if (!attrs) return "";
    return String(attrs[ATTR_LV_HINT] || "").trim();
}

/**
 * 提取双面对照型的双向复习开关（custom-lv-bidi）：
 * 显式 "false" 返回 false；"true" 或双面对照默认未设则返回 true；非双面返回 false。
 */
export function extractAttrQaBidi(attrs?: Record<string, string> | null): boolean {
    if (!attrs) return false;
    const raw = String(attrs[ATTR_LV_BIDI] || "").trim().toLowerCase();
    if (raw === "false") return false;
    if (raw === "true") return true;
    return extractAttrQaSubtype(attrs) === "dual";
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
 * 按零标记属性问答 3 子型构建标准化属性补丁（不污染正文 Markdown）：
 * - direct：正面=块正文题干，背面=custom-lv-answer（清空冗余题干属性）
 * - recite：正面=custom-riff-title（+ 可选 custom-lv-hint），背面=块正文或 custom-riff-answer
 * - dual：正面=custom-riff-title（概念/术语），背面=custom-lv-answer / 块正文，标记双向复习
 */
export function buildAttrQaSubtypeAttrs(input: {
    subtype: AttrQaSubtype;
    question?: string;
    answer?: string;
    hint?: string;
    bidi?: boolean;
}): Record<string, string | null> {
    const clean = (v?: string) => String(v ?? "").trim().replace(/[\r\n]+/g, " ");
    const q = clean(input.question);
    const a = clean(input.answer);
    const hint = clean(input.hint);

    if (input.subtype === "direct") {
        return {
            [ATTR_LV_CARD_TYPE]: "qa",
            [ATTR_LV_ATTR_SUBTYPE]: "direct",
            [ATTR_LV_ANSWER]: a,
            [ATTR_RIFF_ANSWER]: null,
            [ATTR_CARD_ANSWER]: null,
            [ATTR_RIFF_TITLE]: null,
            [ATTR_LV_QUESTION]: null,
            [ATTR_CARD_TITLE]: null,
            [ATTR_LV_HINT]: null,
            [ATTR_LV_BIDI]: null,
        };
    }
    if (input.subtype === "dual") {
        return {
            [ATTR_LV_CARD_TYPE]: "qa",
            [ATTR_LV_ATTR_SUBTYPE]: "dual",
            [ATTR_RIFF_TITLE]: q,
            [ATTR_LV_ANSWER]: a || null,
            [ATTR_RIFF_ANSWER]: a || null,
            [ATTR_LV_HINT]: hint || null,
            [ATTR_LV_BIDI]: input.bidi === false ? "false" : "true",
        };
    }
    // recite
    return {
        [ATTR_LV_CARD_TYPE]: "qa",
        [ATTR_LV_ATTR_SUBTYPE]: "recite",
        [ATTR_RIFF_TITLE]: q,
        [ATTR_RIFF_ANSWER]: a || null,
        [ATTR_LV_ANSWER]: null,
        [ATTR_LV_HINT]: hint || null,
        [ATTR_LV_BIDI]: null,
    };
}

/**
 * 构建问答属性彻底清除补丁（弹窗"清空"动作专用）：
 * 思源内核 /api/attr/setBlockAttrs 传 "" 只保留空值键（IAL 死键残留），
 * 必须传 null 才会把键从块属性与 attributes 索引表真正删除；
 * 且须同时清除 custom-lv-question / custom-card-title / custom-lv-answer / custom-card-answer / 子型键——
 * 否则读取侧（extractCardQuestionAttr / extractCardAnswerAttr）会从残留旧键回填，清空后问题"复活"。
 */
export function buildAttrQaClearAttrs(): Record<string, null> {
    return {
        [ATTR_RIFF_TITLE]: null,
        [ATTR_RIFF_ANSWER]: null,
        [ATTR_LV_QUESTION]: null,
        [ATTR_LV_ANSWER]: null,
        [ATTR_CARD_TITLE]: null,
        [ATTR_CARD_ANSWER]: null,
        [ATTR_LV_CARD_TYPE]: null,
        [ATTR_LV_ATTR_SUBTYPE]: null,
        [ATTR_LV_HINT]: null,
        [ATTR_LV_BIDI]: null,
    };
}

/**
 * 清洗并校验 AI 拟题响应，严禁把裸 JSON 或系统提示词回显填入问题输入框。
 */
export function extractSuggestedQuestionFromAiResponse(raw: string): { ok: boolean; question: string; reason?: string } {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed) {
        return { ok: false, question: "", reason: "AI 未返回有效问题" };
    }
    // 拦截提示词回显或离线启发式回显
    if (
        trimmed.includes("请为以下学习笔记内容提炼")
        || trimmed.includes("只输出问题本身，不要输出任何前缀")
        || trimmed.includes("[离线启发式回复]")
        || /^\[问\][\s\S]*\[答\]\s*请为以下学习笔记内容提炼/.test(trimmed)
    ) {
        return { ok: false, question: "", reason: "AI 服务未配置或返回了提示词回显，请先检查 AI 配置" };
    }

    // 剥离 markdown 代码块外壳
    let candidate = trimmed;
    const fenceMatch = candidate.match(/^```(?:json|text)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
    if (fenceMatch) {
        candidate = fenceMatch[1].trim();
    }

    // 若返回 JSON 对象或数组，尝试提取其中明确的问题字段；解析失败或无问题字段则绝不回填裸 JSON
    if (candidate.startsWith("{") || candidate.startsWith("[")) {
        try {
            const parsed = JSON.parse(candidate);
            const firstObj = Array.isArray(parsed) ? parsed.find(item => item && typeof item === "object") : parsed;
            const extracted = firstObj && typeof firstObj === "object"
                ? String((firstObj as any).q ?? (firstObj as any).question ?? (firstObj as any).front ?? "").trim()
                : "";
            if (!extracted) {
                return { ok: false, question: "", reason: "AI 返回了非纯文本格式且缺少问题字段" };
            }
            candidate = extracted;
        } catch {
            return { ok: false, question: "", reason: "AI 返回了无效 JSON 格式，已拦截以免污染题干" };
        }
    }

    const cleanQ = candidate
        .replace(/^(?:问题|提问|Q|Question)[：:\s]+/i, "")
        .replace(/^["'「]+|["'」]+$/g, "")
        .trim();

    if (!cleanQ) {
        return { ok: false, question: "", reason: "AI 未生成有效提问" };
    }
    return { ok: true, question: cleanQ };
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
