/**
 * 考前突击快刷模式核心逻辑（Cram Mode Core）
 *
 * 算法隔离红线：
 * 1. 突击模式下绝不更新卡片的 due / stability / difficulty / lapses / reps 调度属性；
 * 2. 绝不向 revlog 写入任何评分日志（净增 0）；
 * 3. 结算仅进行内存计数与正确率统计；
 * 4. 提供零 FSRS 排期污染自校验断言。
 */

import { parseCardDue } from "./forecast";
import { shuffleArray } from "./choice-options";

export type CramScope = "all" | "weekDue" | "leech";

export const CRAM_LEECH_THRESHOLD = 5;

export interface CramCard {
    cardID: string;
    deckID?: string;
    blockID?: string;
    state?: number;
    reps?: number;
    lapses?: number;
    due?: string | number;
    stability?: number;
    difficulty?: number;
    nextDues?: Record<string, string>;
    [key: string]: unknown;
}

export interface CramFilterOptions {
    scope: CramScope;
    now?: Date;
    leechThreshold?: number;
    randomOrder?: boolean;
    shuffleFn?: <T>(cards: readonly T[]) => T[];
}

/**
 * 判断卡片是否属于「本周待复习」（包含已到期/逾期与未来 7 天内到期的卡片）
 */
export function isCardDueThisWeek(
    card: { due?: string | number; nextDues?: Record<string, string>; state?: number },
    now = new Date()
): boolean {
    if (card.due) {
        const d = parseCardDue(String(card.due));
        if (d) {
            const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            return d.getTime() <= weekEnd.getTime();
        }
    }
    // 内核返回的预计算 nextDues 且无明确 future due 的到期卡默认为当前待复习
    if (card.nextDues && Object.keys(card.nextDues).length > 0) {
        return true;
    }
    return false;
}

/**
 * 突击模式卡片范围筛选与排序管道
 */
export function filterCramCards<T extends CramCard>(
    cards: readonly T[],
    options: CramFilterOptions
): T[] {
    const now = options.now ?? new Date();
    const leechThreshold = options.leechThreshold ?? CRAM_LEECH_THRESHOLD;

    let result = cards.slice();

    // 1. 范围筛选（全部卡片 / 本周待复习 / 仅水蛭卡 lapses≥5）
    if (options.scope === "leech") {
        result = result.filter(c => (c.lapses ?? 0) >= leechThreshold);
    } else if (options.scope === "weekDue") {
        result = result.filter(c => isCardDueThisWeek(c, now));
    }
    // scope === "all" 保留全部卡片

    // 2. 乱序或遗忘次数降序排列
    if (options.randomOrder) {
        const shuffle = options.shuffleFn ?? shuffleArray;
        result = shuffle(result);
    } else {
        result.sort((a, b) => (b.lapses ?? 0) - (a.lapses ?? 0));
    }

    return result;
}

export interface CramSessionSummary {
    totalAnswered: number;
    correctCount: number;
    forgetCount: number;
    skipCount: number;
    retentionRate: number;
    elapsedMinutes: number;
    summaryText: string;
}

/**
 * 计算突击快刷会话小结纯逻辑（仅内存计数）
 */
export function calculateCramSummary(session: {
    newCount: number;
    reviewCount: number;
    forgetCount: number;
    skipCount: number;
    startedAt: number;
    endedAt?: number;
}): CramSessionSummary {
    const totalAnswered = session.newCount + session.reviewCount + session.forgetCount;
    const correctCount = session.newCount + session.reviewCount;
    const forgetCount = session.forgetCount;
    const skipCount = session.skipCount;
    const retentionRate = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
    const elapsedMinutes = Math.max(1, Math.round(((session.endedAt ?? Date.now()) - session.startedAt) / 60000));

    const summaryText = `突击完成！共过题 ${totalAnswered} 张 · 耗时 ${elapsedMinutes} 分钟 · 算法排期未受干扰`;

    return {
        totalAnswered,
        correctCount,
        forgetCount,
        skipCount,
        retentionRate,
        elapsedMinutes,
        summaryText,
    };
}

export interface FsrsPollutionReport {
    isClean: boolean;
    violations: string[];
}

/**
 * 零 FSRS 排期污染硬校验断言函数：严格比对刷题前后卡片排期调度字段
 */
export function assertZeroFsrsPollution(before: CramCard, after: CramCard): FsrsPollutionReport {
    const violations: string[] = [];

    if (String(before.due ?? "") !== String(after.due ?? "")) {
        violations.push(`due altered: '${before.due}' => '${after.due}'`);
    }
    if (Number(before.stability ?? 0) !== Number(after.stability ?? 0)) {
        violations.push(`stability altered: ${before.stability} => ${after.stability}`);
    }
    if (Number(before.difficulty ?? 0) !== Number(after.difficulty ?? 0)) {
        violations.push(`difficulty altered: ${before.difficulty} => ${after.difficulty}`);
    }
    if (Number(before.lapses ?? 0) !== Number(after.lapses ?? 0)) {
        violations.push(`lapses altered: ${before.lapses} => ${after.lapses}`);
    }
    if (Number(before.reps ?? 0) !== Number(after.reps ?? 0)) {
        violations.push(`reps altered: ${before.reps} => ${after.reps}`);
    }

    return {
        isClean: violations.length === 0,
        violations,
    };
}
