/**
 * Obsidian SR 风格整篇文档间隔温故纯逻辑核心模块（Node 可单测，纯函数）。
 *
 * 核心设计目标：
 * 1. 零 Markdown 污染：文档排期数据保存在根文档块属性（custom-lv-note-*）；
 * 2. 独立轻量 FSRS/SM-2 排期模型：计算文档复习间隔、轮次与难度因数，截断 1~365 天；
 * 3. 调度与熔断隔离：整篇文档温故走独立温故流，不计入 8 次遗忘水蛭卡（Leech）熔断队列；
 * 4. 辅助顺延与退出：支持延期（Snooze 7天）与彻底移出温故流。
 */

export interface DocReviewItem {
    docId: string;
    title: string;
    hpath: string;
    lastReviewDate: string; // YYYYMMDD 或 YYYY-MM-DD
    intervalDays: number;
    reps: number;
    ease: number;
    isDue: boolean;
    dueDiffDays: number;
    deckId?: string;
}

export interface NextScheduleResult {
    nextInterval: number;
    nextReps: number;
    nextEase: number;
    nextDueDate: string;
}

/**
 * 格式化 Date 为 YYYYMMDD 字符串
 */
export function formatCompactDate(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${day}`;
}

/**
 * 解析 YYYYMMDD 或 YYYY-MM-DD 为 Date 对象（中午 12:00 避免跨时区抖动）
 */
export function parseDateString(str: string): Date {
    const clean = String(str ?? "").replace(/-/g, "").trim();
    if (clean.length >= 8) {
        const y = parseInt(clean.slice(0, 4), 10);
        const m = parseInt(clean.slice(4, 6), 10) - 1;
        const d = parseInt(clean.slice(6, 8), 10);
        return new Date(y, m, d, 12, 0, 0);
    }
    return new Date();
}

/**
 * 计算文档下一次温故间隔（基于标准轻量 FSRS/SM-2 模型）
 */
export function calculateDocNextSchedule(
    rating: 1 | 2 | 3 | 4, // 1: Again, 2: Hard, 3: Good, 4: Easy
    currentInterval: number,
    reps: number,
    ease: number,
    today: Date = new Date()
): NextScheduleResult {
    const safeInterval = Math.max(1, currentInterval || 1);
    const safeEase = Math.max(1.3, ease || 2.5);

    if (rating === 1) {
        const nextDate = new Date(today.getTime() + 1 * 86400000);
        return {
            nextInterval: 1,
            nextReps: 0,
            nextEase: Math.max(1.3, safeEase - 0.2),
            nextDueDate: formatCompactDate(nextDate),
        };
    }

    const nextReps = reps + 1;
    let nextEase = safeEase;
    if (rating === 2) nextEase = Math.max(1.3, safeEase - 0.15);
    if (rating === 4) nextEase = safeEase + 0.15;

    let nextInterval = 1;
    if (nextReps === 1) {
        nextInterval = rating === 2 ? 1 : (rating === 4 ? 4 : 2);
    } else if (nextReps === 2) {
        nextInterval = rating === 2 ? 3 : (rating === 4 ? 10 : 6);
    } else {
        const factor = rating === 2 ? 1.2 : (rating === 4 ? nextEase * 1.3 : nextEase);
        nextInterval = Math.round(safeInterval * factor);
    }

    // 边界极值截断：1 ~ 365 天
    const finalInterval = Math.min(365, Math.max(1, nextInterval));
    const nextDueDate = formatCompactDate(new Date(today.getTime() + finalInterval * 86400000));

    return {
        nextInterval: finalInterval,
        nextReps,
        nextEase: Math.round(nextEase * 100) / 100,
        nextDueDate,
    };
}

/**
 * 组装 SQL 查询所有已加入温故流的文档列表
 */
export function buildDocReviewQuerySql(): string {
    return `SELECT id, content, hpath, ial 
            FROM blocks 
            WHERE type = 'd' 
              AND (ial LIKE '%custom-lv-note-review="true"%' OR ial LIKE '%custom-lv-note-review=''true''%' OR ial LIKE '%custom-lv-note-review=true%') 
            ORDER BY updated DESC LIMIT 200;`;
}

/**
 * 从思源 ial 字符串提取指定属性
 */
export function extractAttrFromIal(ial: unknown, attrName: string): string {
    if (!ial) return "";
    if (typeof ial === "object" && ial !== null) {
        const val = (ial as Record<string, unknown>)[attrName];
        if (val !== undefined && val !== null) return String(val).trim();
        try {
            const raw = JSON.stringify(ial);
            const m = raw.match(new RegExp(`"${attrName}"\\s*:\\s*"([^"]*)"`, "i"));
            if (m) return m[1];
        } catch { /* ignore */ }
    }
    const str = String(ial);
    const regex = new RegExp(`${attrName}=["']([^"']*)["']`, "i");
    const m = str.match(regex);
    return m ? m[1] : "";
}

/**
 * 将数据库查询行解析为 DocReviewItem 对象
 */
export function parseDocReviewItem(row: any, today: Date = new Date()): DocReviewItem {
    const ial = row?.ial;
    const lastReviewDate = extractAttrFromIal(ial, "custom-lv-note-last-review") || formatCompactDate(today);
    const intervalDays = parseInt(extractAttrFromIal(ial, "custom-lv-note-interval") || "1", 10) || 1;
    const reps = parseInt(extractAttrFromIal(ial, "custom-lv-note-reps") || "0", 10) || 0;
    const ease = parseFloat(extractAttrFromIal(ial, "custom-lv-note-ease") || "2.5") || 2.5;
    const deckId = extractAttrFromIal(ial, "custom-riff-decks") || "default";

    // 计算到期日
    const lastDate = parseDateString(lastReviewDate);
    const dueDate = new Date(lastDate.getTime() + intervalDays * 86400000);
    const diffMs = today.getTime() - dueDate.getTime();
    const dueDiffDays = Math.floor(diffMs / 86400000);
    const isDue = dueDiffDays >= 0;

    const rawTitle = String(row.content ?? "").split("\n")[0].trim() || (row.hpath ? String(row.hpath).split("/").pop() : "") || "未命名文档";

    return {
        docId: String(row.id),
        title: rawTitle,
        hpath: String(row.hpath ?? ""),
        lastReviewDate,
        intervalDays,
        reps,
        ease,
        isDue,
        dueDiffDays,
        deckId,
    };
}

/**
 * 构造评分后写入思源块属性字典
 */
export function buildDocReviewAttrs(
    rating: 1 | 2 | 3 | 4,
    current: DocReviewItem,
    today: Date = new Date()
): Record<string, string> {
    const next = calculateDocNextSchedule(rating, current.intervalDays, current.reps, current.ease, today);
    return {
        "custom-lv-note-review": "true",
        "custom-lv-note-last-review": formatCompactDate(today),
        "custom-lv-note-interval": String(next.nextInterval),
        "custom-lv-note-reps": String(next.nextReps),
        "custom-lv-note-ease": String(next.nextEase),
    };
}

/**
 * 构造延期 7 天块属性字典
 */
export function buildDocSnoozeAttrs(
    current: DocReviewItem,
    snoozeDays: number = 7,
    today: Date = new Date()
): Record<string, string> {
    const nextInterval = current.intervalDays + snoozeDays;
    return {
        "custom-lv-note-review": "true",
        "custom-lv-note-last-review": formatCompactDate(today),
        "custom-lv-note-interval": String(nextInterval),
    };
}

/**
 * 构造移出温故流属性字典（置空或移除标记）
 */
export function buildDocRemoveAttrs(): Record<string, string> {
    return {
        "custom-lv-note-review": "",
    };
}

/**
 * 构造初始加入温故流属性字典
 */
export function buildDocInitialAttrs(today: Date = new Date(), initialInterval: number = 1): Record<string, string> {
    return {
        "custom-lv-note-review": "true",
        "custom-lv-note-last-review": formatCompactDate(today),
        "custom-lv-note-interval": String(initialInterval),
        "custom-lv-note-reps": "0",
        "custom-lv-note-ease": "2.5",
    };
}
