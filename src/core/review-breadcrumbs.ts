/**
 * BX-11 复习来源层级面包屑纯模块（纯逻辑，Node 可单测）。
 * 
 * 核心目标与体验价值：
 * 1. 消除原子卡复习时的“孤岛感”：将卡片所属的笔记本、文档根标题及层级章节路径以面包屑呈现；
 * 2. 紧凑自适应截断：对超长标题按最大字符数平滑折叠，保留完整标题供 Tooltip 查阅；
 * 3. 深度自适应：当层级过深时，智能保留根文档与直接父级，中间折叠为 "…"，避免占用卡面过多空间；
 * 4. 纯函数设计，格式化清理 Markdown/HTML 标记，数据不可变隔离。
 */

export type BreadcrumbNodeType = "notebook" | "doc" | "heading" | "block";

export interface BreadcrumbNode {
    id: string;
    type: BreadcrumbNodeType;
    /** 完整原始名称或标题（已剥离 Markdown 标签） */
    fullTitle: string;
    /** 适于 UI 显示的紧凑/截断名称 */
    displayTitle: string;
    /** 点击跳转的目标 ID（笔记本或文档/块 ID） */
    targetId: string;
}

export interface ReviewBreadcrumbChain {
    cardId: string;
    nodes: readonly BreadcrumbNode[];
    /** 格式化为单行纯文本摘要（如 "算法笔记 / 二叉树 / 平衡二叉树"） */
    formattedText: string;
    /** 是否包含中间层级省略折叠 */
    isTruncated: boolean;
}

export interface ResolveBreadcrumbParams {
    cardId: string;
    notebookName?: string;
    docTitle?: string;
    docId?: string;
    ancestorHeadings?: readonly { id: string; title: string }[];
    maxDisplayChars?: number;
    maxDepth?: number;
}

/**
 * 清洗标题中的 Markdown 和 HTML 标记
 */
export function cleanTitleText(text: string): string {
    return String(text ?? "")
        .replace(/<[^>]+>/g, "") // 剥离 HTML 标签
        .replace(/\*\*([^*]+)\*\*/g, "$1") // 剥离粗体
        .replace(/==([^=]+)==/g, "$1") // 剥离思源高亮
        .replace(/~~([^~]+)~~/g, "$1") // 剥离删除线
        .replace(/`([^`]+)`/g, "$1") // 剥离行内代码
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // 剥离 Markdown 链接
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * 紧凑截断文本（超过限制时末尾加 "…"）
 */
export function truncateBreadcrumbTitle(title: string, maxChars: number = 16): string {
    const raw = cleanTitleText(title);
    if (!raw) return "";
    if (raw.length <= maxChars) return raw;
    return raw.slice(0, Math.max(1, maxChars - 1)) + "…";
}

/**
 * 组装复习卡面的层级面包屑链条（纯函数）
 */
export function resolveReviewBreadcrumbs(params: ResolveBreadcrumbParams): ReviewBreadcrumbChain {
    const maxChars = params.maxDisplayChars ?? 16;
    const maxDepth = Math.max(2, params.maxDepth ?? 3);
    const rawNodes: BreadcrumbNode[] = [];

    // 1. 笔记本节点（若提供）
    if (params.notebookName) {
        const cleaned = cleanTitleText(params.notebookName);
        if (cleaned) {
            rawNodes.push({
                id: `nb-${cleaned}`,
                type: "notebook",
                fullTitle: cleaned,
                displayTitle: truncateBreadcrumbTitle(cleaned, maxChars),
                targetId: "",
            });
        }
    }

    // 2. 根文档节点
    if (params.docTitle) {
        const cleaned = cleanTitleText(params.docTitle);
        if (cleaned) {
            rawNodes.push({
                id: params.docId ?? `doc-${cleaned}`,
                type: "doc",
                fullTitle: cleaned,
                displayTitle: truncateBreadcrumbTitle(cleaned, maxChars),
                targetId: params.docId ?? "",
            });
        }
    }

    // 3. 祖先章节标题节点
    if (Array.isArray(params.ancestorHeadings)) {
        for (const h of params.ancestorHeadings) {
            const cleaned = cleanTitleText(h.title);
            if (cleaned) {
                rawNodes.push({
                    id: h.id,
                    type: "heading",
                    fullTitle: cleaned,
                    displayTitle: truncateBreadcrumbTitle(cleaned, maxChars),
                    targetId: h.id,
                });
            }
        }
    }

    // 4. 层级深度自适应收敛（超出 maxDepth 时折叠中间节点）
    let finalNodes: BreadcrumbNode[] = rawNodes;
    let isTruncated = false;

    if (rawNodes.length > maxDepth) {
        isTruncated = true;
        const tailCount = 1; // 始终保留最直接的父级
        const headCount = Math.max(1, maxDepth - tailCount - 1);
        const head = rawNodes.slice(0, headCount);
        const tail = rawNodes.slice(-tailCount);
        const middleEllipsis: BreadcrumbNode = {
            id: "ellipsis-middle",
            type: "heading",
            fullTitle: "…",
            displayTitle: "…",
            targetId: "",
        };
        finalNodes = [...head, middleEllipsis, ...tail];
    }

    const formattedText = finalNodes.map(n => n.displayTitle).filter(Boolean).join(" / ");

    return {
        cardId: params.cardId,
        nodes: finalNodes,
        formattedText,
        isTruncated,
    };
}

/**
 * 将思源 hpath 路径直接解析为自适应面包屑链（纯函数）
 */
export function parseHPathToBreadcrumbs(
    cardId: string,
    hpath: string,
    options: { maxDisplayChars?: number; maxDepth?: number } = {},
): ReviewBreadcrumbChain {
    const raw = String(hpath ?? "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
    if (!raw) {
        return {
            cardId,
            nodes: [],
            formattedText: "",
            isTruncated: false,
        };
    }

    const segments = raw.split("/").map(s => s.trim()).filter(Boolean);
    if (segments.length === 0) {
        return {
            cardId,
            nodes: [],
            formattedText: "",
            isTruncated: false,
        };
    }

    const docTitle = segments[0];
    const ancestorHeadings = segments.slice(1).map((title, idx) => ({
        id: `heading-${idx + 1}`,
        title,
    }));

    return resolveReviewBreadcrumbs({
        cardId,
        docTitle,
        ancestorHeadings,
        maxDisplayChars: options.maxDisplayChars ?? 14,
        maxDepth: options.maxDepth ?? 3,
    });
}

/**
 * 格式化思源文档 hpath 为界面友好路径展示（如 "算法笔记 › 二叉树 › 平衡二叉树"）
 */
export function formatHPathDisplay(hpath: string | undefined): string {
    if (!hpath) return "";
    return String(hpath).trim().replace(/^\/+/, "").replace(/\/+$/, "").replace(/\//g, " › ");
}

export interface CardPathResolution {
    currentHPath: string;
    currentBreadcrumbs: ReviewBreadcrumbChain | null;
}

/**
 * 构造按块 ID 查询所属文档 hpath 的 SQL 语句（防止单引号注入）
 */
export function buildHPathQuerySql(blockID: string): string {
    const safeID = String(blockID ?? "").replace(/'/g, "''");
    return `SELECT hpath FROM blocks WHERE id = '${safeID}' LIMIT 1`;
}

/**
 * 构造基于 SQLite CTE 递归查询块所属祖先标题链与根文档的 SQL 语句（防止单引号注入）。
 * 沿 parent_id 一路递归至 root_id，最大递归深度设为 10，足以覆盖绝大多数复杂文档大纲。
 */
export function buildRecursiveAncestorSql(blockID: string): string {
    const safeID = String(blockID ?? "").replace(/'/g, "''");
    return `WITH RECURSIVE ancestors(id, parent_id, root_id, type, subtype, content, hpath, sort, depth) AS (
  SELECT id, parent_id, root_id, type, subtype, content, hpath, sort, 0
  FROM blocks
  WHERE id = '${safeID}'
  UNION ALL
  SELECT b.id, b.parent_id, b.root_id, b.type, b.subtype, b.content, b.hpath, b.sort, a.depth + 1
  FROM blocks b
  JOIN ancestors a ON b.id = a.parent_id
  WHERE a.parent_id != '' AND a.depth < 10
)
SELECT id, parent_id, root_id, type, subtype, content, hpath, sort, depth FROM ancestors ORDER BY depth DESC;`;
}

/**
 * 从 CTE 递归查询结果行中提取根文档标题与祖先标题列表并解析为面包屑链条
 */
export function resolveBreadcrumbsFromAncestorRows(
    cardID: string,
    rows: any[] | null | undefined,
    options: { maxDisplayChars?: number; maxDepth?: number } = {}
): CardPathResolution {
    if (!Array.isArray(rows) || rows.length === 0) {
        return { currentHPath: "", currentBreadcrumbs: null };
    }

    // 1. 查找根文档节点（type === 'd'，通常位于 depth 最大的一行）
    let docTitle = "";
    let docId = "";
    let rawHPath = "";

    const docRow = rows.find(r => r.type === "d") || rows[0];
    if (docRow) {
        docId = docRow.id;
        rawHPath = docRow.hpath || "";
        docTitle = cleanTitleText(docRow.content || docRow.hpath || "");
        if (docTitle.startsWith("/")) {
            docTitle = docTitle.replace(/^\/+/, "").split("/")[0] || docTitle;
        }
    }

    // 2. 收集所有祖先标题节点（type === 'h'），按 depth 从大到小排列（自顶向下）
    const headingRows = rows
        .filter(r => r.type === "h" && r.content)
        .sort((a, b) => (Number(b.depth ?? 0)) - (Number(a.depth ?? 0)));

    const ancestorHeadings = headingRows.map(h => ({
        id: String(h.id),
        title: cleanTitleText(String(h.content)),
    })).filter(h => Boolean(h.title));

    // 3. 如果成功提取到祖先标题，组装层级面包屑链
    if (ancestorHeadings.length > 0) {
        const chain = resolveReviewBreadcrumbs({
            cardId: cardID,
            docTitle: docTitle || undefined,
            docId: docId || undefined,
            ancestorHeadings,
            maxDisplayChars: options.maxDisplayChars ?? 14,
            maxDepth: options.maxDepth ?? 3,
        });

        // 生成友好路径展示（如 "算法笔记 › 二叉树 › 平衡二叉树"）
        const pathSegments = [docTitle, ...ancestorHeadings.map(h => h.title)].filter(Boolean);
        const currentHPath = pathSegments.join(" › ");

        return {
            currentHPath,
            currentBreadcrumbs: chain,
        };
    }

    // 4. 降级逻辑：若未提取到祖先标题行，回退到按 hpath 解析
    if (!rawHPath && rows[0]?.hpath) {
        rawHPath = rows[0].hpath;
    }
    if (rawHPath) {
        const hpathStr = String(rawHPath);
        return {
            currentHPath: formatHPathDisplay(hpathStr),
            currentBreadcrumbs: parseHPathToBreadcrumbs(cardID, hpathStr, options),
        };
    }

    return { currentHPath: "", currentBreadcrumbs: null };
}

/**
 * 解析 SQL 查询返回的行记录提取路径与面包屑（自适应递归行或单行 hpath）
 */
export function resolveCardBreadcrumbsFromRows(
    cardID: string,
    rows: any[] | null | undefined,
    options: { maxDisplayChars?: number; maxDepth?: number } = {}
): CardPathResolution {
    if (!Array.isArray(rows) || rows.length === 0) {
        return { currentHPath: "", currentBreadcrumbs: null };
    }

    // 自动判定：如果返回行包含 type/depth 字段，按递归祖先提取
    const isAncestorRows = rows.some(r => r.type !== undefined || r.depth !== undefined);
    if (isAncestorRows) {
        return resolveBreadcrumbsFromAncestorRows(cardID, rows, options);
    }

    // 否则按传统单行 hpath 解析
    const rawHPath = rows[0]?.hpath;
    if (!rawHPath) {
        return { currentHPath: "", currentBreadcrumbs: null };
    }
    const hpathStr = String(rawHPath);
    return {
        currentHPath: formatHPathDisplay(hpathStr),
        currentBreadcrumbs: parseHPathToBreadcrumbs(cardID, hpathStr, options),
    };
}

/**
 * 轻量 LRU 缓存，用于避免复习同文档卡片时高频重复执行祖先 SQL 查询
 */
export function createBreadcrumbCache(capacity: number = 256) {
    const cache = new Map<string, CardPathResolution>();
    return {
        get(key: string): CardPathResolution | undefined {
            if (!cache.has(key)) return undefined;
            const val = cache.get(key)!;
            cache.delete(key);
            cache.set(key, val);
            return val;
        },
        set(key: string, value: CardPathResolution) {
            if (cache.has(key)) {
                cache.delete(key);
            } else if (cache.size >= capacity) {
                const firstKey = cache.keys().next().value;
                if (firstKey) cache.delete(firstKey);
            }
            cache.set(key, value);
        },
        has(key: string): boolean {
            return cache.has(key);
        },
        clear() {
            cache.clear();
        },
        size(): number {
            return cache.size;
        }
    };
}


