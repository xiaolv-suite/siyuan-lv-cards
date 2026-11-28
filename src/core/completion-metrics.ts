/**
 * 复习完成态度量与叙事引擎（Completion Metrics & Narrative Engine）
 *
 * 处理会话结束屏（ReviewDonePanel）的各项核心指标推算与叙事文本格式化：
 * - 会话作答时长计时格式化（m:ss）
 * - 每日复习目标完成进度文本（${a} / ${b}）
 * - 连击天数里程碑庆祝文案判定（7 / 30 / 100 / 365 天）
 * - 学习科学每日小贴士基于日期模除轮换
 * - 零作答空队列状态判定
 */

export interface SessionCounters {
    new: number;
    review: number;
    forget: number;
    skip: number;
}

/**
 * 计算格式化会话累计作答时长（例如 "12:05"、"0:42"）
 */
export function formatSessionDuration(startedAt: number, now = Date.now()): string {
    const total = Math.max(0, Math.round((now - startedAt) / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * 判定当前会话是否属于「零作答空队列」（直接进入完成态，不作完成庆祝）
 */
export function isEmptyQueueSession(sessionDone: boolean, counters: SessionCounters): boolean {
    return sessionDone && counters.new === 0 && counters.review === 0 && counters.forget === 0 && counters.skip === 0;
}

/**
 * 格式化每日目标完成进度
 */
export function formatTargetProgress(done: number, target: number, template: string): string {
    if (target <= 0 || !template) return "";
    return template.replace("${a}", String(done)).replace("${b}", String(target));
}

/** 专属里程碑天数集合 */
export const MILESTONE_STREAK_DAYS: readonly number[] = [365, 100, 30, 7];

/**
 * 检查连击天数是否处于专属里程碑，并格式化文案
 */
export function formatStreakMilestone(streak: number, template: string): string {
    if (!template || !MILESTONE_STREAK_DAYS.includes(streak)) return "";
    return template.replace("${n}", String(streak));
}

/**
 * 获取基于自然日轮换的学习科学每日贴士
 */
export function getDailyScienceTip(tips: readonly string[], enabled: boolean, now = Date.now()): string {
    if (!enabled || !Array.isArray(tips) || tips.length === 0) return "";
    const validTips = tips.filter(Boolean);
    if (validTips.length === 0) return "";
    const idx = Math.floor(now / 86400000) % validTips.length;
    return validTips[idx];
}
