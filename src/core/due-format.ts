/**
 * 评分卡片按键到期时间紧凑格式化器（Due Format Utility）
 */

/**
 * 格式化评分按键下方紧凑到期日提示（例如 "2026-10-31 14:00:00" -> "10-31 14:00"）
 */
export function formatRatingDueText(dueString?: string | null): string {
    if (!dueString) return "";
    return dueString.replace(/^\d{4}-0?/, "").replace(/:\d{2}$/, "");
}

/**
 * 安全格式化给定评级的到期时间文本
 */
export function formatNextDueByRating(
    nextDues: Record<string, string> | null | undefined,
    rating: string
): string {
    return formatRatingDueText(nextDues?.[rating]);
}
