/**
 * 卡片快捷操作与视图控制纯函数（Card Actions & View Adjusters）
 */

/**
 * 调整卡片字号缩放比例（0.7 ~ 2.5 之间以 0.1 步进平滑调整）
 */
export function clampFontScale(currentScale = 1, delta = 0, min = 0.7, max = 2.5): number {
    return Math.min(max, Math.max(min, Math.round((currentScale + delta) * 10) / 10));
}

/**
 * 切换格式问题卡片标记集合（不可变操作）
 */
export function toggleCardIssue(
    markedIssueCardIDs: ReadonlySet<string>,
    cardID: string
): { nextMarkedIDs: Set<string>; isMarked: boolean } {
    const next = new Set(markedIssueCardIDs);
    if (next.has(cardID)) {
        next.delete(cardID);
        return { nextMarkedIDs: next, isMarked: false };
    } else {
        next.add(cardID);
        return { nextMarkedIDs: next, isMarked: true };
    }
}
