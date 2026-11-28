/**
 * 小驴闪卡 · 块级动作注册表（Block Action Registry）
 *
 * 设计目标：把编辑器块右上角的一体化胶囊，从「单一编辑入口」升级为
 * 「分层块操作中心」——一个胶囊涵盖闪卡、试题、收件箱、打卡、提醒、人脉、金句、代码与复制等
 * 跨插件能力，且严格按「块类型 + 块状态 + 已安装插件」动态自适应裁剪。
 *
 * 核心特性：
 * 1. 块类型深度特化（Block-type Specialization）：针对代码块、引述金句、待办任务、标题大纲、表格矩阵，精准置顶最契合的动作；
 * 2. 动态生态感知（Ecosystem Awareness）：支持 8 大小驴插件（考试/打卡/管家/拾遗/人脉/常用/雷切），已安装项附带精致来源徽标，未安装安全隐藏；
 * 3. 批量多选模式（Batch Mode）：多选块时自动裁剪为批量动作，支持批量加卡组/移出/收件箱/设打卡/转试题/多行复制引用；
 * 4. 动作偏好与排序（Preferences）：支持用户通过配置禁用特定动作或自定义置顶核心动作；
 * 5. 纯逻辑与 UI 分离：纯函数实现，离线单测覆盖全场景矩阵。
 */

/** 动作分组：决定菜单里的分区标题与顺序 */
export type BlockActionGroup = "flashcard" | "native" | "knowledge" | "time" | "clipboard" | "community";

/** 思源核心块类型定义 */
export type SiYuanBlockKind =
    | "paragraph"   // 普通段落
    | "heading"     // 标题大纲
    | "code"        // 代码块
    | "quote"       // 引述/金句
    | "task"        // 待办复选框
    | "list"        // 普通无序/有序列表
    | "table"       // 表格矩阵
    | "math"        // 数学公式
    | "av"          // 属性视图 / 数据库
    | "other";      // 其它容器块

export interface BlockKindMeta {
    glyph: string;
    name: string;
    actionLead: string;
}

/**
 * 块类型语义字形（Markdown 语系单字符，跨平台字体安全，不依赖 emoji 字体渲染差异）：
 * 每类块在胶囊与菜单头部共用同一 glyph，配合 CSS [data-block-kind] 色彩体系形成块类型身份。
 */
export const BLOCK_KIND_LABELS: Record<SiYuanBlockKind, BlockKindMeta> = Object.freeze({
    paragraph: { glyph: "¶", name: "段落", actionLead: "块助手" },
    heading:   { glyph: "#", name: "大纲标题", actionLead: "章节大纲" },
    code:      { glyph: "</>", name: "代码片段", actionLead: "代码助手" },
    quote:     { glyph: "❝", name: "摘录金句", actionLead: "摘录金句" },
    task:      { glyph: "✓", name: "待办事项", actionLead: "待办任务" },
    list:      { glyph: "≡", name: "列表阶梯", actionLead: "列表阶梯" },
    table:     { glyph: "▦", name: "表格矩阵", actionLead: "表格矩阵" },
    math:      { glyph: "∑", name: "数学公式", actionLead: "数学公式" },
    av:        { glyph: "⊞", name: "属性视图", actionLead: "数据库视图" },
    other:     { glyph: "✦", name: "内容块", actionLead: "块助手" },
});

/** 块自身的身份状态，决定哪些动作可用 */
export interface BlockSnapshot {
    blockID: string;
    /** 块类型（paragraph / heading / code / quote / task / list / table / math / av / other） */
    blockKind?: SiYuanBlockKind;
    /** 是否为属性视图（NodeAttributeView 数据库块） */
    isAv?: boolean;
    /** 所属文档或编辑器是否处于只读锁定状态 */
    isReadOnly?: boolean;
    /** 标题层级 1~6（仅 heading） */
    headingLevel?: number;
    /** 批量多选模式：包含的目标块 ID 列表（当 length > 1 时触发批量视图与批量动作） */
    batchBlockIDs?: string[];
    /** 是否为文档根块（type === 'd'），文档级动作据此启用 */
    isDocument?: boolean;
    /** 是否已入卡组 / 已具备闪卡问答属性 */
    isCard?: boolean;
    /** 是否已加入整篇文档温故排期 */
    isDocReview?: boolean;
    /** 是否已在小驴考试中登记为试题 */
    isExamQuestion?: boolean;
    /** 当前块是否有可挖空的选中文本 */
    hasSelection?: boolean;
    /** 块文本是否非空（空块不提供 AI 拟题、转试题等） */
    hasText?: boolean;
    /** 块内是否包含图片（遮挡卡仅对含图块有意义） */
    hasImage?: boolean;
    /** 块内是否已存在挖空标记（==高亮== 或 mark 标签） */
    hasCloze?: boolean;
    /** 块内是否已存在问答结构（::、Q: ... A: 或 问：... 答：） */
    hasQaPattern?: boolean;
    /** 当前块（如标题/列表）是否处于折叠收起状态 */
    isFolded?: boolean;
}

/** 已安装插件的探测结果：null/undefined 表示未知，false 表示确认未安装 */
export interface EcosystemPresence {
    exam?: boolean;       // 小驴考试
    home?: boolean;       // 小驴管家
    contacts?: boolean;   // 小驴人脉
    glean?: boolean;      // 小驴拾遗
    checkin?: boolean;    // 小驴打卡
    raikiri?: boolean;    // 小驴雷切
    common?: boolean;     // 小驴常用
}

export const ECOSYSTEM_PLUGIN_NAMES: Record<keyof EcosystemPresence, string> = Object.freeze({
    exam: "考试",
    home: "管家",
    contacts: "人脉",
    glean: "拾遗",
    checkin: "打卡",
    raikiri: "雷切",
    common: "常用",
});

/** 用户对块操作中心的偏好配置（持久化在闪卡设置中） */
export interface BlockActionPreferences {
    /** 禁用的动作 ID 列表（用户在设置面板中取消勾选） */
    disabledActionIds?: string[];
    /** 置顶优先展示的动作 ID 列表 */
    pinnedActionIds?: string[];
}

export interface BlockActionDescriptor {
    id: string;
    group: BlockActionGroup;
    /** i18n key（回退文案见 fallbackLabel） */
    labelKey: string;
    fallbackLabel: string;
    /** 功能作用副标题/辅助说明（用于现代两行卡片排版，降低认知成本） */
    subtitle?: string;
    /** 单字符图标（跨平台字体安全，不依赖外部 svg 资源） */
    glyph: string;
    /** 是否作为高频推荐/突出显示（Hero Item） */
    featured?: boolean;
    /** 快捷提示徽标（如 Alt+Q、推荐 等） */
    badgeText?: string;
    /** 动作所属生态插件（用于渲染半透明来源小徽标，如 [考试] [打卡]） */
    sourcePlugin?: keyof EcosystemPresence;
    /** 危险/移除类动作 */
    destructive?: boolean;
    /** 是否需要对当前块有选中文本 */
    requiresSelection?: boolean;
    /** 是否支持多选块批量操作 */
    supportsBatch?: boolean;
    /** 是否仅限单块模式生效（批量模式自动排除） */
    singleOnly?: boolean;
    /** 适合该块类型的特化动作（同组内优先置顶排在最前） */
    preferredBlockKinds?: SiYuanBlockKind[];
    /** 排除的块类型 */
    excludedBlockKinds?: SiYuanBlockKind[];
    /** 依赖的生态插件（未安装则整项隐藏） */
    requiresPlugin?: keyof EcosystemPresence;
    /** 自定义执行器回调（第三方插件或开放 API 动态注入时直接执行） */
    handler?: (blockID: string, snapshot: BlockSnapshot, batchIDs?: string[]) => void | Promise<void>;
    /** 可用性判定：返回 false 时该项不渲染 */
    isAvailable?: (snapshot: BlockSnapshot, presence: EcosystemPresence) => boolean;
    /** 置灰但仍展示（用于引导用户：例如「加入练习集」需先登记为试题） */
    isDisabled?: (snapshot: BlockSnapshot, presence: EcosystemPresence) => boolean;
}

/**
 * 全量动作清单。
 * 顺序即基础声明序（实际渲染会综合块类型特化与置顶配置调整）。
 */
export const BLOCK_ACTIONS: readonly BlockActionDescriptor[] = Object.freeze([
    // ── 闪卡与复习 ─────────────────────────────────────────────
    {
        id: "edit-card-qa",
        group: "flashcard",
        labelKey: "blockActEditQa",
        fallbackLabel: "编辑问答（问题 · 答案）",
        subtitle: "零污染属性提问 · 主动回忆工作台",
        glyph: "✏️",
        featured: true,
        badgeText: "推荐 · Alt+Q",
        singleOnly: true,
        preferredBlockKinds: ["paragraph", "quote"],
        isAvailable: (s) => !s.isDocument && !s.isReadOnly,
    },
    {
        id: "make-cloze",
        group: "flashcard",
        labelKey: "blockActCloze",
        fallbackLabel: "挖空并制卡",
        subtitle: "基于正文选中文本一键制作填空闪卡",
        glyph: "🎯",
        requiresSelection: true,
        singleOnly: true,
        preferredBlockKinds: ["paragraph", "code", "table"],
        excludedBlockKinds: ["math"],
        isAvailable: (s) => !s.isDocument && !s.isReadOnly && Boolean(s.hasSelection),
    },
    {
        id: "make-occlusion",
        group: "flashcard",
        labelKey: "blockActOcclusion",
        fallbackLabel: "制作遮挡卡",
        subtitle: "在图片区域标记并生成遮挡记忆卡",
        glyph: "🖼️",
        singleOnly: true,
        excludedBlockKinds: ["code", "math"],
        // 只有真实包含图片的块才提供遮挡卡（文本块上出现只会产生死端弹窗）
        isAvailable: (s) => !s.isReadOnly && Boolean(s.hasImage),
    },
    {
        id: "add-to-deck",
        group: "flashcard",
        labelKey: "blockActAddDeck",
        fallbackLabel: "加入卡组",
        subtitle: "收录入指定卡组并开启间隔重复复习",
        glyph: "📚",
        supportsBatch: true,
        // 核心门禁：仅当该块已具备闪卡属性（免侵入问答）或正文包含挖空/问答结构时才允许加入卡组！
        // 普通未制卡文本坚决排除，避免点击后报错卡死
        isAvailable: (s) => !s.isDocument && !s.isReadOnly && Boolean(s.isCard || s.hasCloze || s.hasQaPattern),
    },
    {
        id: "remove-from-deck",
        group: "flashcard",
        labelKey: "menuRemoveFromDeck",
        fallbackLabel: "从卡组移除",
        subtitle: "解除卡片关联并从复习队列中彻底移出",
        glyph: "🗑️",
        destructive: true,
        supportsBatch: true,
        isAvailable: (s) => !s.isReadOnly && Boolean(s.isCard),
    },

    // ── 思源原生增强（常用高频能力提取） ────────────────────────
    {
        id: "focus-block",
        group: "native",
        labelKey: "blockActFocus",
        fallbackLabel: "聚焦当前块（沉浸专注）",
        subtitle: "作为临时根文档展开，沉浸编辑当前分支",
        glyph: "🔍",
        singleOnly: true,
        preferredBlockKinds: ["heading", "paragraph", "quote", "code"],
        isAvailable: (s) => !s.isDocument,
    },
    {
        id: "copy-embed-ref",
        group: "native",
        labelKey: "blockActCopyEmbed",
        fallbackLabel: "复制为嵌入块",
        subtitle: "生成 {{blockID}} 动态嵌入块语法",
        glyph: "📦",
        supportsBatch: true,
        preferredBlockKinds: ["paragraph", "heading", "table"],
        isAvailable: (s) => !s.isDocument,
    },
    {
        id: "toggle-fold-block",
        group: "native",
        labelKey: "blockActToggleFold",
        fallbackLabel: "折叠 / 展开子分支",
        subtitle: "快速收起或展开该块下属的大纲与子节点",
        glyph: "📂",
        singleOnly: true,
        preferredBlockKinds: ["heading", "list", "quote"],
        // 核心门禁：仅大纲层级与可收起容器（标题、列表项）支持折叠分支。
        // 2026-11-21 走查修复：引述块无折叠语义，fold 属性会持久写入文档 IAL（零污染红线边缘），移除 quote。
        isAvailable: (s) => !s.isDocument && !s.isReadOnly && (s.blockKind === "heading" || s.blockKind === "list" || s.blockKind === "task"),
    },
    {
        id: "morph-block-type",
        group: "native",
        labelKey: "blockActMorphType",
        fallbackLabel: "快捷转换块类型",
        subtitle: "转换为标题、列表、待办、引述或代码块",
        glyph: "🔄",
        singleOnly: true,
        preferredBlockKinds: ["paragraph", "task", "heading", "list", "quote", "math"],
        // 支持绝大部分文本与结构内容块互转（文档除外）。
        // 2026-11-21 走查修复：排除表格——morph 会把整表压成 `* [ ] |a|b|` 单行列表，结构性破坏且无警告；
        // 2026-11-25 R6 走查修复：与 lv-kit 对齐排除代码块，避免代码语法结构被误转破坏。
        isAvailable: (s) => !s.isDocument && !s.isReadOnly && s.blockKind !== "table" && s.blockKind !== "code" && s.blockKind !== "av",
    },

    // ── 知识流转（跨插件联动） ────────────────────────────────
    {
        id: "to-exam-question",
        group: "knowledge",
        labelKey: "blockActToExam",
        fallbackLabel: "转为小驴试题",
        subtitle: "提取至小驴考试制卡与出题工坊",
        glyph: "📝",
        sourcePlugin: "exam",
        requiresPlugin: "exam",
        supportsBatch: true,
        preferredBlockKinds: ["table", "paragraph", "code"],
        isAvailable: (s) => Boolean(s.hasText),
    },
    {
        id: "exam-ai-generate",
        group: "knowledge",
        labelKey: "blockActExamAi",
        fallbackLabel: "AI 生成考题",
        subtitle: "苏格拉底导学 AI 深度提炼知识点生成测试",
        glyph: "🧠",
        sourcePlugin: "exam",
        requiresPlugin: "exam",
        singleOnly: true,
        preferredBlockKinds: ["paragraph", "code", "heading"],
        isAvailable: (s) => Boolean(s.hasText),
    },
    {
        id: "add-to-inbox",
        group: "knowledge",
        labelKey: "menuAddToInbox",
        fallbackLabel: "加入材料收件箱",
        subtitle: "快速暂存至制卡收集箱供集中批处理",
        glyph: "📥",
        supportsBatch: true,
        isAvailable: (s) => !s.isDocument && Boolean(s.hasText || s.hasImage),
    },
    {
        id: "to-glean-library",
        group: "knowledge",
        labelKey: "blockActToGlean",
        fallbackLabel: "加入拾遗读库",
        subtitle: "作为精选文献素材存入小驴拾遗剪藏知识库",
        glyph: "📖",
        sourcePlugin: "glean",
        requiresPlugin: "glean",
        singleOnly: true,
        preferredBlockKinds: ["quote", "paragraph"],
        isAvailable: (s) => !s.isDocument && Boolean(s.hasText),
    },
    {
        id: "capture-quote-common",
        group: "knowledge",
        labelKey: "blockActCaptureQuote",
        fallbackLabel: "存为金句资产",
        subtitle: "沉淀为常用模块台账，可在罗盘随时引用",
        glyph: "💡",
        sourcePlugin: "common",
        requiresPlugin: "common",
        preferredBlockKinds: ["quote", "paragraph"],
        isAvailable: (s) => Boolean(s.hasText),
    },
    {
        id: "contacts-interaction",
        group: "knowledge",
        labelKey: "blockActContactsInteraction",
        fallbackLabel: "记一笔人脉互动",
        subtitle: "关联至人脉档案追加交往与跟进记录",
        glyph: "👤",
        sourcePlugin: "contacts",
        requiresPlugin: "contacts",
        isAvailable: (s) => Boolean(s.hasText),
    },
    {
        id: "speedswitch-workbench",
        group: "knowledge",
        labelKey: "blockActSpeedSwitch",
        fallbackLabel: "存为雷切代码片段",
        subtitle: "提取当前代码块正文，提炼存入雷切代码片段库",
        glyph: "⚡",
        sourcePlugin: "raikiri",
        requiresPlugin: "raikiri",
        preferredBlockKinds: ["code"],
        isAvailable: (s) => s.blockKind === "code",
    },

    // ── 时间与提醒 ─────────────────────────────────────────────
    {
        id: "bind-checkin-item",
        group: "time",
        labelKey: "blockActBindCheckin",
        fallbackLabel: "设为打卡项",
        subtitle: "双向绑定笔记锚点，纳入每日打卡习惯追踪",
        glyph: "⏱️",
        sourcePlugin: "checkin",
        requiresPlugin: "checkin",
        supportsBatch: true,
        preferredBlockKinds: ["task", "paragraph"],
        isAvailable: (s) => Boolean(s.hasText),
    },
    {
        id: "add-memo",
        group: "time",
        labelKey: "blockActAddMemo",
        fallbackLabel: "记为日常备忘",
        subtitle: "沉淀为小驴管家日程，在工作台及时提醒",
        glyph: "⏰",
        sourcePlugin: "home",
        requiresPlugin: "home",
        singleOnly: true,
        preferredBlockKinds: ["task", "paragraph"],
        isAvailable: (s) => Boolean(s.hasText),
    },
    // 文档级温故排期（加入/移出）不进胶囊菜单：胶囊只挂在内容块上，永远无法命中
    // NodeDocument（isDocument 不可达）。真实入口在文档树右键菜单（index.ts onDocTreeMenu）。

    // ── 复制与引用 ─────────────────────────────────────────────
    {
        id: "copy-block-ref",
        group: "clipboard",
        labelKey: "blockActCopyRef",
        fallbackLabel: "复制块引用",
        subtitle: "生成 ((id '锚文本')) 语法，多选时输出多行引用",
        glyph: "🔗",
        supportsBatch: true,
        preferredBlockKinds: ["heading", "paragraph", "table"],
    },
    {
        id: "copy-plain-text",
        group: "clipboard",
        labelKey: "blockActCopyText",
        fallbackLabel: "复制纯文本",
        subtitle: "剥离 Markdown 语法标记，提取干净文本至剪贴板",
        glyph: "📋",
        supportsBatch: true,
        preferredBlockKinds: ["code", "paragraph"],
        isAvailable: (s) => Boolean(s.hasText),
    },
    {
        id: "copy-block-id",
        group: "clipboard",
        labelKey: "blockActCopyId",
        fallbackLabel: "复制块 ID",
        subtitle: "提取思源原生块标识符（支持多选输出列表）",
        glyph: "🆔",
        supportsBatch: true,
    },
]);

export const BLOCK_ACTION_GROUP_ORDER: readonly BlockActionGroup[] = Object.freeze([
    "flashcard",
    "native",
    "knowledge",
    "time",
    "clipboard",
    "community",
]);

export const BLOCK_ACTION_GROUP_LABELS: Record<BlockActionGroup, { labelKey: string; fallbackLabel: string; glyph: string }> = Object.freeze({
    flashcard: { labelKey: "blockActGroupFlashcard", fallbackLabel: "闪卡与复习", glyph: "🎴" },
    native:    { labelKey: "blockActGroupNative", fallbackLabel: "思源原生增强", glyph: "🏛️" },
    knowledge: { labelKey: "blockActGroupKnowledge", fallbackLabel: "知识流转", glyph: "🔄" },
    time:      { labelKey: "blockActGroupTime", fallbackLabel: "时间与提醒", glyph: "⏰" },
    clipboard: { labelKey: "blockActGroupClipboard", fallbackLabel: "复制与引用", glyph: "📋" },
    community: { labelKey: "blockActGroupCommunity", fallbackLabel: "社区插件联动", glyph: "🧩" },
});

/**
 * 双模式自适应密度阈值（Adaptive Density）：
 * 可用动作 ≤ 阈值 → Focus 精读模式（单列富两行卡片，一切尽收眼底；批量多选/极简偏好时的常态）；
 * 可用动作 >  阈值 → Command 中枢模式（桌面双列网格 + 副标题悬浮提示 + 组头计数徽章；
 *                    单装闪卡 12 项起步、全生态约 20 项，双列布局纵向减半，无需长滚动）。
 * 判定为 O(1) 常量比较，布局完全由 CSS grid 承担，运行时零测量、零回流。
 */
export const BLOCK_ACTION_DENSE_THRESHOLD = 10;

/**
 * 从 DOM 元素推导块语义类型
 */
export function inferBlockKindFromElement(el: HTMLElement | null): SiYuanBlockKind {
    if (!el) return "paragraph";
    // 性能优化：优先极速 O(1) 匹配 data-type，消除 95%+ 场景下的 querySelector 引擎开销
    const type = el.getAttribute("data-type") || "";
    if (type === "NodeParagraph") {
        const listItem = el.closest?.('[data-type="NodeListItem"]');
        if (listItem) {
            // 2026-11-21 走查修复：列表项内的段落应归为该列表的 kind（task/list），
            // 否则同一列表项经正文悬浮与经属性栏悬浮会得到不同菜单（折叠动作时有时无）。
            if (listItem.getAttribute("data-subtype") === "t" || listItem.querySelector(".protyle-action--task")) {
                return "task";
            }
            return "list";
        }
        return "paragraph";
    }
    if (type === "NodeHeading") return "heading";
    if (type === "NodeCodeBlock") return "code";
    if (type === "NodeBlockquote") return "quote";
    if (type === "NodeListItem" || type === "NodeList") {
        const subtype = el.getAttribute("data-subtype") || "";
        if (subtype === "t" || el.classList.contains("protyle-action--task") || el.querySelector(".protyle-action--task")) return "task";
        return "list";
    }
    if (type === "NodeTable") return "table";
    if (type === "NodeMathBlock") return "math";
    if (type === "NodeAttributeView") return "av";

    // 容错降级：仅当 data-type 缺失或非标准时才检查类名与选择器
    const subtype = el.getAttribute("data-subtype") || "";
    if (/^h[1-6]$/i.test(subtype)) return "heading";
    if (el.classList.contains("p")) {
        const listItem = el.closest?.('[data-type="NodeListItem"], [data-subtype="t"]');
        if (listItem) {
            // 与 NodeParagraph 主分支同口径：列表项内段落归为 task/list
            if (listItem.getAttribute("data-subtype") === "t" || listItem.querySelector(".protyle-action--task")) {
                return "task";
            }
            return "list";
        }
        return "paragraph";
    }
    if (el.classList.contains("bq")) return "quote";
    if (el.classList.contains("av") || el.querySelector(":scope > .av__container, .av__container")) return "av";
    if (el.querySelector(".code-block")) return "code";
    if (el.querySelector("table")) return "table";
    return "other";
}

/** 会修改块正文/属性/文档结构的写动作集合：只读锁定文档下必须隐藏并拦截执行 */
export const WRITE_BLOCK_ACTION_IDS: ReadonlySet<string> = new Set([
    "edit-card-qa",
    "make-cloze",
    "make-occlusion",
    "add-to-deck",
    "remove-from-deck",
    "toggle-fold-block",
    "toggle-block-fold",
    "morph-block-type",
    "cut-block",
    "duplicate-block",
    "insert-block-above",
    "insert-block-below",
    "delete-block",
    "native-move-up",
    "native-move-down",
    "native-duplicate",
    "native-delete",
    "plugin-pangu-spacing",
    "plugin-database-attr",
    "bind-checkin-item",
]);

/** 判断给定块元素及其所属 Protyle / 文档是否处于只读锁定态 */
export function isBlockElementReadOnly(el: Element | null | undefined): boolean {
    if (!el) return false;
    const isAttrReadOnly = (node: Element | null | undefined) => {
        if (!node) return false;
        const syVal = node.getAttribute("custom-sy-readonly");
        const siyuanVal = node.getAttribute("custom-siyuan-readonly");
        const dataVal = node.getAttribute("data-readonly");
        return syVal === "true" || syVal === "1"
            || siyuanVal === "true" || siyuanVal === "1"
            || dataVal === "true" || dataVal === "1";
    };
    if (isAttrReadOnly(el)) return true;
    if (el.getAttribute("contenteditable") === "false") return true;
    const wysiwyg = el.closest?.(".protyle-wysiwyg") as HTMLElement | null;
    if (wysiwyg) {
        if (wysiwyg.getAttribute("contenteditable") === "false" || isAttrReadOnly(wysiwyg)) return true;
    }
    if (el.closest?.('[custom-sy-readonly="true"], [custom-sy-readonly="1"], [custom-siyuan-readonly="true"], [custom-siyuan-readonly="1"], [data-readonly="true"], [data-readonly="1"]')) return true;
    const protyle = el.closest?.(".protyle") as (HTMLElement & { disabled?: boolean }) | null;
    if (protyle) {
        if (protyle.disabled === true || protyle.hasAttribute("disabled") || protyle.classList.contains("protyle--readonly")) {
            return true;
        }
        const innerWysiwyg = protyle.querySelector?.(".protyle-wysiwyg");
        if (innerWysiwyg && (innerWysiwyg.getAttribute("contenteditable") === "false" || isAttrReadOnly(innerWysiwyg))) {
            return true;
        }
        const titleEl = protyle.querySelector?.(".protyle-title");
        if (titleEl && isAttrReadOnly(titleEl)) {
            return true;
        }
    }
    return false;
}

/**
 * 动作使用频次学习（本地行为自适应）：
 * 记录每个动作的实际执行次数（localStorage，设备本地行为，不入块属性零污染），
 * 菜单在同优先级内按频次降序——用得越多越顺手，每个用户的菜单自动长成自己的样子。
 */
const ACTION_USAGE_STORAGE_KEY = "lv_cards_block_action_usage";
const ACTION_USAGE_MAX_ENTRIES = 64;

export function readActionUsage(): Record<string, number> {
    try {
        if (typeof localStorage === "undefined") return {};
        const raw = localStorage.getItem(ACTION_USAGE_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
    } catch {
        return {};
    }
}

export function recordActionUsage(actionId: string): void {
    try {
        if (typeof localStorage === "undefined" || !actionId) return;
        const usage = readActionUsage();
        usage[actionId] = (usage[actionId] ?? 0) + 1;
        // 容量护栏：仅保留使用最多的 64 个动作，防存储无限膨胀
        const entries = Object.entries(usage)
            .sort((a, b) => b[1] - a[1])
            .slice(0, ACTION_USAGE_MAX_ENTRIES);
        localStorage.setItem(ACTION_USAGE_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch {
        /* 存储不可用（隐私模式等）时静默降级为默认排序 */
    }
}

export function resetActionUsage(): void {
    try {
        if (typeof localStorage !== "undefined") {
            localStorage.removeItem(ACTION_USAGE_STORAGE_KEY);
        }
    } catch { /* ignore */ }
}

/**
 * 解析当前块可用的动作列表（纯函数，UI 与测试共用）。
 *
 * 排序与裁剪规则：
 * 1. 批量多选模式（batchBlockIDs.length > 1）：仅保留支持批量的动作（supportsBatch === true）；
 * 2. 用户偏好设置：排除在 preferences.disabledActionIds 中的动作；
 * 3. 块类型排除：若动作声明了 excludedBlockKinds 且包含当前块类型，安全排除；
 * 4. 插件生态检测：requiresPlugin 的项在插件确认未安装（false）时隐藏；未知（undefined）时保留；
 * 5. 块上下文可用性：isAvailable 返回 false 的项不渲染；
 * 6. 选区依赖：requiresSelection 的项在快照无有效选区（hasSelection）时不渲染——
 *    避免「挖空并制卡」在无选区时承诺兜底跳转的死端体验；
 * 7. 智能排序优化：用户 pinned 置顶优先；其次契合当前块类型的 preferredBlockKinds 优先；
 *    再次按本地使用频次降序（习惯学习，随用随顺）；最后保持默认序。
 */
export function resolveBlockActions(
    snapshot: BlockSnapshot,
    presence: EcosystemPresence = {},
    preferences?: BlockActionPreferences,
    actions: readonly BlockActionDescriptor[] = BLOCK_ACTIONS,
    externalActions: readonly BlockActionDescriptor[] = [],
    usageCounts?: Record<string, number>,
): BlockActionDescriptor[] {
    const isBatch = Boolean(snapshot.batchBlockIDs && snapshot.batchBlockIDs.length > 1);
    const disabledSet = new Set(preferences?.disabledActionIds ?? []);
    const pinnedList = preferences?.pinnedActionIds ?? [];
    const currentKind = snapshot.blockKind || "paragraph";
    const usage = usageCounts ?? readActionUsage();

    const allActions = [...actions, ...externalActions];
    const filtered = allActions.filter((action) => {
        // 只读锁定文档拦截写操作（含外部写入动作）
        if (snapshot.isReadOnly && (
            WRITE_BLOCK_ACTION_IDS.has(action.id)
            || (action as any).mutatesBlock === true
            || (action as any).readonlySafe === false
            || (action as any).readOnlySafe === false
        )) {
            return false;
        }
        // 用户自定义禁用
        if (disabledSet.has(action.id)) {
            return false;
        }
        // 批量多选过滤：多选时不支持批量的项自动排除
        if (isBatch && !action.supportsBatch) {
            return false;
        }
        // 块类型互斥排除
        if (action.excludedBlockKinds && action.excludedBlockKinds.includes(currentKind)) {
            return false;
        }
        // 插件生态未安装检测
        if (action.requiresPlugin && presence[action.requiresPlugin] === false) {
            return false;
        }
        // 块级上下文可用性
        if (action.isAvailable && !action.isAvailable(snapshot, presence)) {
            return false;
        }
        // 选区依赖：无有效选区时隐藏（如挖空并制卡）
        if (action.requiresSelection && !snapshot.hasSelection) {
            return false;
        }
        return true;
    });

    // 智能排序：同 group 内置顶与块类型偏好加权
    return [...filtered].sort((a, b) => {
        // 1. 用户显式置顶
        const aPinIdx = pinnedList.indexOf(a.id);
        const bPinIdx = pinnedList.indexOf(b.id);
        const aPinned = aPinIdx !== -1;
        const bPinned = bPinIdx !== -1;
        if (aPinned && bPinned) return aPinIdx - bPinIdx;
        if (aPinned) return -1;
        if (bPinned) return 1;

        // 2. 块类型特化置顶（适合当前块类型的动作靠前）
        const aPref = Boolean(a.preferredBlockKinds && a.preferredBlockKinds.includes(currentKind));
        const bPref = Boolean(b.preferredBlockKinds && b.preferredBlockKinds.includes(currentKind));
        if (aPref && !bPref) return -1;
        if (!aPref && bPref) return 1;

        // 3. 本地使用频次降序（习惯学习：同优先级内高频动作浮上来）
        const aFreq = usage[a.id] ?? 0;
        const bFreq = usage[b.id] ?? 0;
        if (aFreq !== bFreq) return bFreq - aFreq;

        return 0;
    });
}

export interface BlockActionGroupSection {
    group: BlockActionGroup;
    labelKey: string;
    fallbackLabel: string;
    actions: BlockActionDescriptor[];
}

/**
 * 把动作列表按分组聚合，并丢弃空分组。
 * 返回顺序固定为 BLOCK_ACTION_GROUP_ORDER，保证菜单视觉稳定。
 */
export function groupBlockActions(
    actions: readonly BlockActionDescriptor[],
): BlockActionGroupSection[] {
    const sections: BlockActionGroupSection[] = [];
    for (const group of BLOCK_ACTION_GROUP_ORDER) {
        const inGroup = actions.filter((a) => a.group === group);
        if (inGroup.length === 0) continue;
        const meta = BLOCK_ACTION_GROUP_LABELS[group];
        sections.push({
            group,
            labelKey: meta.labelKey,
            fallbackLabel: meta.fallbackLabel,
            actions: inGroup,
        });
    }
    return sections;
}

/** 便捷组合：直接从快照得到分组后的菜单结构（空菜单返回 []） */
export function buildBlockActionMenu(
    snapshot: BlockSnapshot,
    presence: EcosystemPresence = {},
    preferences?: BlockActionPreferences,
    externalActions: readonly BlockActionDescriptor[] = [],
): BlockActionGroupSection[] {
    return groupBlockActions(resolveBlockActions(snapshot, presence, preferences, BLOCK_ACTIONS, externalActions));
}

/** 菜单是否为空（用于决定胶囊是否可展开） */
export function hasBlockActions(
    snapshot: BlockSnapshot,
    presence: EcosystemPresence = {},
    preferences?: BlockActionPreferences,
    externalActions: readonly BlockActionDescriptor[] = [],
): boolean {
    return resolveBlockActions(snapshot, presence, preferences, BLOCK_ACTIONS, externalActions).length > 0;
}
