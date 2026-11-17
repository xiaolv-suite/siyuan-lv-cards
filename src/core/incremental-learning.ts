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
    requestId?: string;
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

export type LearnabilityIssueKind =
    | "overlong"
    | "answer-too-long"
    | "multi-question"
    | "too-many-clozes"
    | "ambiguous-pronoun"
    | "answer-leak";

export interface LearnabilityIssue {
    kind: LearnabilityIssueKind;
    label: string;
    detail: string;
}

export interface CardSplitDraft {
    q: string;
    a: string;
}

export interface LearnabilityInspection {
    overloaded: boolean;
    charCount: number;
    clozeCount: number;
    issues: LearnabilityIssue[];
    suggestion?: string;
    splitDrafts: CardSplitDraft[];
}

const CODE_OR_MATH_BLOCK = /```[\s\S]*?```|`[^`\n]+`|\$\$[\s\S]*?\$\$|\$(?!\{)[^$\n]+\$/g;
const AMBIGUOUS_PRONOUN_HEAD = /^(它|它们|他们|她们|这个|那个|这些|那些|该|上述|其中|此|this|these)\s*[^，。；？?]{0,6}(是|有|的|指|作用|功能|意义|区别|影响|特点)/i;
const GENERIC_SHORT_ANSWERS = new Set(["是", "否", "有", "无", "对", "错", "是的", "不是", "yes", "no", "true", "false"]);

function normalizeForLeak(text: string): string {
    return String(text ?? "")
        .normalize("NFC")
        .toLowerCase()
        .replace(/[\s\p{P}]/gu, "");
}

function splitProseClauses(raw: string): string[] {
    const text = String(raw ?? "").trim();
    if (!text) return [];
    // 先按换行/序号切分，再按分号或连续问句切分（保护代码块与公式内部符号）
    const placeholders: string[] = [];
    const masked = text.replace(CODE_OR_MATH_BLOCK, match => {
        const idx = placeholders.push(match) - 1;
        return `__LV_PROTECTED_${idx}__`;
    });
    const restore = (segment: string) =>
        segment.replace(/__LV_PROTECTED_(\d+)__/g, (_, i) => placeholders[Number(i)] ?? "").trim();

    const byLine = masked
        .split(/\r?\n+/)
        .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)、]|[（(]\d+[)）]|[①②③④⑤⑥⑦⑧⑨⑩])\s*/, "").trim())
        .filter(Boolean);
    if (byLine.length >= 2) {
        return byLine.map(restore).filter(Boolean);
    }

    const bySemicolon = masked
        .split(/[;；]+/)
        .map(part => part.trim())
        .filter(Boolean);
    if (bySemicolon.length >= 2) {
        return bySemicolon.map(restore).filter(Boolean);
    }

    const byQuestion = masked
        .split(/(?<=[?？])\s*/)
        .map(part => part.trim())
        .filter(Boolean);
    if (byQuestion.length >= 2) {
        return byQuestion.map(restore).filter(Boolean);
    }

    return [restore(masked)].filter(Boolean);
}

/**
 * 为复合问答或多挖空卡片生成可一键应用的原子拆卡草案。
 */
export function proposeCardSplits(input: {
    question: string;
    answer?: string;
    template?: "qa" | "cloze" | "superblock" | "whole";
}): CardSplitDraft[] {
    const q = String(input.question ?? "").trim();
    const a = String(input.answer ?? "").trim();

    // 1. 单块多处 ==挖空==：按每处挖空独立生成一张原子挖空卡（其余挖空还原为上下文）
    const clozeMatches = [...q.matchAll(/==([\s\S]*?)==/g)];
    if (clozeMatches.length >= 2 && !a) {
        return clozeMatches.map((targetMatch, targetIdx) => {
            let currentIdx = 0;
            const singleClozeMd = q.replace(/==([\s\S]*?)==/g, (_full, inner) => {
                const keepMask = currentIdx === targetIdx;
                currentIdx += 1;
                return keepMask ? `==${inner}==` : String(inner);
            });
            return {
                q: singleClozeMd,
                a: String(targetMatch[1] ?? "").trim(),
            };
        }).filter(draft => draft.q && draft.a);
    }

    // 2. 快速制卡挖空模板：题干含多处 ____，答案以分号/逗号/换行分隔
    const blankParts = q.split("____");
    if (blankParts.length >= 3 && a) {
        const blankCount = blankParts.length - 1;
        const answerParts = a.split(/[;；,，、\r\n]+/).map(s => s.trim()).filter(Boolean);
        return Array.from({ length: blankCount }, (_, targetIdx) => {
            const singleBlankQ = blankParts.reduce((acc, part, idx) => {
                if (idx === 0) return part;
                const fillText = answerParts[idx - 1] ?? a;
                return acc + (idx - 1 === targetIdx ? "____" : fillText) + part;
            }, "");
            return {
                q: singleBlankQ.trim(),
                a: answerParts[targetIdx] ?? a,
            };
        });
    }

    // 3. 问答/超级块：题干或答案可拆分为多个并列子句
    const qClauses = splitProseClauses(q);
    const aClauses = splitProseClauses(a);

    if (qClauses.length >= 2 && aClauses.length === qClauses.length) {
        return qClauses.map((qPart, idx) => ({
            q: qPart,
            a: aClauses[idx],
        }));
    }

    if (qClauses.length >= 2 && a) {
        return qClauses.map((qPart, idx) => ({
            q: qPart,
            a: aClauses[idx] ?? a,
        }));
    }

    if (q && aClauses.length >= 2 && (a.length > 80 || aClauses.length >= 3)) {
        const baseQ = q.replace(/[?？:：]+$/, "").trim();
        return aClauses.map((aPart, idx) => {
            const kvMatch = aPart.match(/^([^：:]{2,18})[：:]\s*(.+)$/);
            if (kvMatch) {
                return {
                    q: `${baseQ} —— ${kvMatch[1].trim()}？`,
                    a: kvMatch[2].trim(),
                };
            }
            return {
                q: `${baseQ}（要点 ${idx + 1}）？`,
                a: aPart,
            };
        });
    }

    return [];
}

/**
 * 入组前可学性软检查（C1）：
 * 检测内容过长、答案过长、单卡多问、挖空过多、指代不明与答案泄漏，并生成一键拆卡建议。
 * 属于软提醒（advisory），不阻断合法的专业公式、代码或多段卡片入组。
 */
export function inspectCardLearnability(input: {
    question: string;
    answer?: string;
    template?: "qa" | "cloze" | "superblock" | "whole";
}): LearnabilityInspection {
    const q = String(input.question ?? "").trim();
    const a = String(input.answer ?? "").trim();
    const combined = a ? `${q} ${a}` : q;

    const cleanedText = combined
        .replace(/>\s*来源：\(\([^\)]+\)\)/g, " ")
        .replace(/==([\s\S]*?)==/g, "$1")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, "");

    const charCount = cleanedText.length;
    const markedClozes = [...combined.matchAll(/==([\s\S]*?)==/g)];
    const blankPlaceholders = [...q.matchAll(/____/g)];
    const clozeCount = markedClozes.length > 0 ? markedClozes.length : blankPlaceholders.length;

    const issues: LearnabilityIssue[] = [];

    if (charCount > 250) {
        issues.push({
            kind: "overlong",
            label: "内容过长",
            detail: `当前共 ${charCount} 字（建议单卡 ≤ 250 字）`,
        });
    }

    const cleanAnswerLen = a.replace(CODE_OR_MATH_BLOCK, " ").replace(/\s+/g, "").length;
    const longestClozeLen = markedClozes.reduce((max, m) => Math.max(max, String(m[1] ?? "").trim().length), 0);
    if (cleanAnswerLen > 120 || longestClozeLen > 120) {
        const len = Math.max(cleanAnswerLen, longestClozeLen);
        issues.push({
            kind: "answer-too-long",
            label: "答案过长",
            detail: `单处答案达 ${len} 字，复习时难以完整回忆，建议提炼关键词或拆卡`,
        });
    }

    if (clozeCount > 3) {
        issues.push({
            kind: "too-many-clozes",
            label: "挖空过多",
            detail: `包含 ${clozeCount} 处挖空（建议单卡 ≤ 3 处）`,
        });
    }

    const qProse = q.replace(CODE_OR_MATH_BLOCK, " ").replace(/==[\s\S]*?==/g, " ").trim();
    const questionMarks = qProse.match(/[?？]/g)?.length ?? 0;
    const hasSemicolonMulti = /[;；]/.test(qProse);
    if (questionMarks >= 2 || hasSemicolonMulti) {
        issues.push({
            kind: "multi-question",
            label: "单卡多问",
            detail: questionMarks >= 2
                ? `题干含 ${questionMarks} 个问号，建议一卡只问一件事`
                : "题干含分号并列子句，建议拆分为独立原子卡",
        });
    }

    if (AMBIGUOUS_PRONOUN_HEAD.test(qProse)) {
        issues.push({
            kind: "ambiguous-pronoun",
            label: "指代不明",
            detail: "题干以「它/这个/上述」等代词开头，脱离原文档复习时可能丢失上下文",
        });
    }

    if (a) {
        const qWithoutBlank = normalizeForLeak(q.replace(/____/g, " ").replace(/==[\s\S]*?==/g, " "));
        const aNorm = normalizeForLeak(a);
        if (aNorm.length >= 2 && !GENERIC_SHORT_ANSWERS.has(aNorm) && qWithoutBlank.includes(aNorm)) {
            issues.push({
                kind: "answer-leak",
                label: "答案泄漏",
                detail: "题干中已直接出现答案文本，正面会提前剧透",
            });
        }
    }

    const splitDrafts = proposeCardSplits(input);
    const overloaded = issues.length > 0;
    let suggestion: string | undefined;
    if (overloaded) {
        const summary = issues.map(i => `${i.label}（${i.detail}）`).join("；");
        suggestion = `💡 可学性提示：${summary}。建议坚守最小信息原则，拆分为原子卡或提炼核心问答。`;
    }

    return {
        overloaded,
        charCount,
        clozeCount,
        issues,
        suggestion,
        splitDrafts,
    };
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
    const blankMatches = [...raw.matchAll(/____/g)];
    const clozeCount = clozeMatches.length > 0 ? clozeMatches.length : blankMatches.length;

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
