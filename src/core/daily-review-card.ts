/**
 * 小驴闪卡 · 思源原生 Bento 3.0 复习战报卡生成器
 * 遵循全生态统一 Native Document Integration Architecture：
 * 1. 原生 Callout 引述块语法 (">")
 * 2. 扁平化数据指标 (tabular-nums 友好)
 * 3. 原生块引用超链接 (( blockId '《锚文本》' ))
 * 4. 受控 IAL 属性注入 {: custom-type="flashcard-review-summary" }
 */

export interface DailyReviewDeckStat {
    deckId: string;
    deckName: string;
    count: number;
    retentionRate?: number;
}

export interface DailyReviewHardCard {
    blockId: string;
    title: string;
    note?: string;
    rating?: "again" | "hard" | "good" | "easy";
}

export interface DailyReviewSummaryInput {
    date: string;               // YYYY-MM-DD 本地时区日期
    totalReviewed: number;      // 今日复习总张数
    masteryCount?: number;      // 🟢 熟练 (good/easy)
    hesitantCount?: number;     // 🟡 勉强 (hard)
    reviewAgainCount?: number;  // 🔴 遗忘 (again)
    retentionRate?: number;     // 保持率 0~100 百分比
    durationMinutes?: number;   // 复习总用时（分钟）
    streakDays?: number;        // 连续复习天数
    deckStats?: readonly DailyReviewDeckStat[];  // 牌组细分进展
    hardCards?: readonly DailyReviewHardCard[];  // 重难点订正卡片清单
}

function escapeCalloutText(str: string): string {
    return str.replace(/[\r\n]+/g, " ").replace(/'/g, "’").trim();
}

/**
 * 组装思源文档原生 Bento 3.0 闪卡复习战报卡片 Markdown
 */
export function formatDailyReviewSummaryCardMarkdown(input: DailyReviewSummaryInput): string {
    const {
        date,
        totalReviewed,
        masteryCount = 0,
        hesitantCount = 0,
        reviewAgainCount = 0,
        durationMinutes,
        streakDays,
        deckStats = [],
        hardCards = [],
    } = input;

    // 计算保持率（若未显式提供，则按熟练/总数推算）
    const retention = typeof input.retentionRate === "number"
        ? Math.round(input.retentionRate * 10) / 10
        : (totalReviewed > 0 ? Math.round((masteryCount / totalReviewed) * 1000) / 10 : 0);

    const streakPart = typeof streakDays === "number" && streakDays > 0 ? ` · 连续复习: **${streakDays} 天🔥**` : "";

    const lines: string[] = [
        `> 🗂️ **今日闪卡复习战报 · ${date}**`,
        `> 复习完成: **${totalReviewed}** 张 · 掌握率: **${retention}%** (🟢 熟练: ${masteryCount} · 🟡 勉强: ${hesitantCount} · 🔴 遗忘: ${reviewAgainCount})${streakPart}`,
        `>`,
    ];

    // 复习用时与节奏
    if (typeof durationMinutes === "number" && durationMinutes > 0) {
        const avgSec = totalReviewed > 0 ? Math.round((durationMinutes * 60) / totalReviewed) : 0;
        const avgPart = avgSec > 0 ? ` (平均约 ${avgSec}s/张)` : "";
        lines.push(`> - ⏱️ **专注用时**: **${durationMinutes}** 分钟${avgPart}`);
    }

    // 细分牌组进展（携带原生牌组块引用 (( deckId '《牌组名》' )) ）
    if (deckStats.length > 0) {
        lines.push(`> - 📚 **牌组细分进展**:`);
        for (const ds of deckStats) {
            const cleanDeckName = escapeCalloutText(ds.deckName || "未命名牌组");
            const ref = ds.deckId ? `(( ${ds.deckId} '《${cleanDeckName}》' ))` : `《${cleanDeckName}》`;
            const rateStr = typeof ds.retentionRate === "number" ? ` · 掌握率 **${Math.round(ds.retentionRate)}%**` : "";
            lines.push(`>   - ${ref}: **${ds.count}** 张${rateStr}`);
        }
    }

    // 重难点订正清单（携带卡片原块反链，可一键在思源正文中穿透溯源）
    if (hardCards.length > 0) {
        lines.push(`> - 💡 **重难点卡片订正清单 (点击双链直达源笔记)**:`);
        for (const hc of hardCards) {
            const cleanTitle = escapeCalloutText(hc.title || "闪卡内容");
            const ref = hc.blockId ? `(( ${hc.blockId} '${cleanTitle}' ))` : cleanTitle;
            const notePart = hc.note ? ` —— ${escapeCalloutText(hc.note)}` : "";
            const badge = hc.rating === "again" ? "🔴 遗忘" : "🟡 存疑";
            lines.push(`>   - [ ] \`${badge}\` ${ref}${notePart}`);
        }
    }

    lines.push(`{: custom-type="flashcard-review-summary" custom-cards-reviewed="${totalReviewed}" custom-retention="${retention}" }`);
    return lines.join("\n") + "\n";
}
