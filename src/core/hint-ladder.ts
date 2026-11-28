/**
 * BJ-2 分级提示阶梯（纯逻辑，node 可单测）。
 * 五级阶梯：recall-target（回忆目标）→ keyword（关键词）→ context（上下文）→ explanation（解释）→ full（完整答案即翻面）。
 * 设计：
 * - 提示不自动提交评分：revealHint 仅返回下一级文本，调用方决定是否展示与记录。
 * - 每次提示可记录：hintLog 纯数组追加（调用方映射到 revlog entry 扩展字段或独立存储）。
 * - 阶梯内容来源：知识对象/卡片提供 levels 数组（可选），缺失级别自动跳过（稀疏阶梯）；
 *   full 级始终兜底存在（即翻面）。
 */

export const HINT_LEVELS = [
    "recall-target",
    "keyword",
    "context",
    "explanation",
    "full",
] as const;

export type HintLevel = (typeof HINT_LEVELS)[number];

export interface HintLevelsInput {
    /** 回忆目标（题面本身要你回忆什么，如"回答：XX 的定义"） */
    "recall-target"?: string;
    /** 关键词（答案中最核心的 1-3 个词） */
    keyword?: string;
    /** 上下文（材料出处/语境提示） */
    context?: string;
    /** 解释（答案的完整解释） */
    explanation?: string;
    /** 完整答案 */
    full: string;
}

/** 稀疏阶梯解析：按 HINT_LEVELS 顺序返回可用级别 id 列表（full 兜底） */
export function availableLevels(input: HintLevelsInput): HintLevel[] {
    return HINT_LEVELS.filter(l => {
        if (l === "full") return true;
        const v = input[l];
        return typeof v === "string" && v.trim().length > 0;
    });
}

/** 取下一级提示：从 current 开始向后找第一个可用级别；current 不在阶梯中从头开始 */
export function nextHint(
    input: HintLevelsInput,
    current: HintLevel | null,
): { level: HintLevel; text: string } | null {
    const avail = availableLevels(input);
    if (avail.length === 0) return null;
    const curIdx = current ? avail.indexOf(current) : -1;
    const next = avail[curIdx + 1] ?? avail[0];
    return { level: next, text: input[next] };
}

/** 提示记录条目（追加式日志；调用方映射持久化） */
export interface HintLogEntry {
    cardID: string;
    level: HintLevel;
    ts: number;
}

export function logHint(cardID: string, level: HintLevel, now: number = Date.now()): HintLogEntry {
    return { cardID, level, ts: now };
}

/** 提示使用统计（离线可分析口径：每卡提示次数/最深级别） */
export function hintStats(log: HintLogEntry[]): { totalHints: number; cardsWithHints: number; deepest: HintLevel | null } {
    if (log.length === 0) return { totalHints: 0, cardsWithHints: 0, deepest: null };
    const cards = new Set(log.map(l => l.cardID));
    const depthOrder = new Map(HINT_LEVELS.map((l, i) => [l, i]));
    let deepest: HintLevel = log[0].level;
    for (const l of log) {
        if ((depthOrder.get(l.level) ?? -1) > (depthOrder.get(deepest) ?? -1)) {
            deepest = l.level;
        }
    }
    return { totalHints: log.length, cardsWithHints: cards.size, deepest };
}

/**
 * BJ-2 内容推导（v0.133.0）：从卡面纯文本自动推导 HintLevelsInput。
 * 无需预标注——任何卡都有可用的分级提示。
 * 策略：
 * - full = 完整文本
 * - explanation = 第一句完整句（含句号/问号/感叹号的句子）
 * - keyword = 第一句中首个粗体/高亮标记内的词，或前 20% 的关键词区域
 * - context = 来源描述（调用方可选附加）
 * - recall-target 不推导（依赖卡片题型语义，纯文本无法推断）
 */
export function deriveHintLevels(plainText: string): HintLevelsInput {
    const text = plainText.trim();
    if (!text) return { full: "" };

    // explanation：第一句完整句（含终止标点或全部文本）
    const sentenceMatch = text.match(/^[^。？！.?!]*[。？！.?!]/);
    const explanation = sentenceMatch ? sentenceMatch[0].trim() : text;

    // keyword：优先取粗体/高亮标记内容，否则取第一句的前 30%
    const boldMatch = text.match(/<(?:strong|b|mark|em)>(.+?)<\/(?:strong|b|mark|em)>/);
    const keyword = boldMatch ? boldMatch[1].trim() : explanation.slice(0, Math.max(1, Math.ceil(explanation.length * 0.3)));

    return {
        keyword,
        explanation,
        full: text,
    };
}

/**
 * 获取提示级别指示文本（例如 "1/3"）
 */
export function formatHintLevelIndicator(
    currentLevel: HintLevel | null,
    available: readonly HintLevel[]
): string {
    if (!currentLevel || available.length === 0) return "";
    const idx = available.indexOf(currentLevel);
    return idx >= 0 ? `${idx + 1}/${available.length}` : "";
}

/**
 * 解析并格式化当前卡片的提示级别文本指示（例如 "1/3"）
 */
export function resolveHintLevelIndicator(
    hintLevel: HintLevel | null,
    hasCurrent: boolean,
    cardHtml: string,
    cachedAvail: readonly HintLevel[] = []
): string {
    if (!hintLevel || !hasCurrent) return "";
    const cardText = (cardHtml || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    const avail = cachedAvail.length > 0 ? cachedAvail : availableLevels(deriveHintLevels(cardText));
    return formatHintLevelIndicator(hintLevel, avail);
}

export interface HintStepOptions {
    /** 答案期望文本（用于生成首字/长度遮挡线索） */
    expectedText?: string;
    /** 来源标题或语境描述 */
    contextTitle?: string;
}

/**
 * 构建提示阶梯输入并执行下一级提示推进
 */
export function stepLadderHint(
    cardHtml: string,
    currentLevel: HintLevel | null,
    koFact?: string,
    opts?: HintStepOptions
): { level: HintLevel; text: string } | null {
    const cardText = (cardHtml || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    let input: HintLevelsInput;
    if (koFact) {
        input = { "recall-target": `回忆：${koFact}`, keyword: koFact, full: cardText };
    } else if (opts?.expectedText) {
        const exp = opts.expectedText.trim();
        const firstChar = exp.slice(0, 1);
        const clueKeyword = exp.length > 1 ? `首字线索：${firstChar}…（共 ${exp.length} 字）` : `首字线索：${firstChar}`;
        input = {
            ...(opts.contextTitle ? { context: `来源语境：${opts.contextTitle}` } : {}),
            keyword: clueKeyword,
            explanation: exp,
            full: cardText || exp,
        };
    } else {
        input = deriveHintLevels(cardHtml || cardText);
        if (opts?.contextTitle) {
            input.context = `来源语境：${opts.contextTitle}`;
        }
    }
    if (!input.full) return null;
    return nextHint(input, currentLevel);
}

export interface AdvanceHintResult {
    level: HintLevel | null;
    text: string;
    shouldRevealAnswer: boolean;
    hintLogEntry: HintLogEntry;
}

/**
 * 推进卡片提示状态（full 级即翻面并重置提示状态，其他级别推进文本与日志）
 */
export function advanceCardHint(
    cardHtml: string,
    currentLevel: HintLevel | null,
    cardID: string,
    koFact?: string,
    optsOrNow?: HintStepOptions | number,
    maybeNow?: number
): AdvanceHintResult | null {
    const opts = typeof optsOrNow === "object" ? optsOrNow : undefined;
    const now = typeof optsOrNow === "number" ? optsOrNow : (typeof maybeNow === "number" ? maybeNow : Date.now());
    const result = stepLadderHint(cardHtml, currentLevel, koFact, opts);
    if (!result) return null;

    const logEntry = logHint(cardID, result.level, now);
    if (result.level === "full") {
        return {
            level: null,
            text: "",
            shouldRevealAnswer: true,
            hintLogEntry: logEntry,
        };
    }
    return {
        level: result.level,
        text: result.text,
        shouldRevealAnswer: false,
        hintLogEntry: logEntry,
    };
}

