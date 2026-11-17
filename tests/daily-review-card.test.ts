import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDailyReviewSummaryCardMarkdown, type DailyReviewSummaryInput } from "../src/core/daily-review-card.ts";

describe("小驴闪卡 · 思源原生 Bento 3.0 复习战报卡契约测试", () => {
    it("1. 基础战报渲染：包含核心指标、熟练/遗忘统计与标准 IAL 元数据", () => {
        const input: DailyReviewSummaryInput = {
            date: "2026-11-08",
            totalReviewed: 35,
            masteryCount: 28,
            hesitantCount: 5,
            reviewAgainCount: 2,
            streakDays: 12,
        };

        const md = formatDailyReviewSummaryCardMarkdown(input);

        assert.ok(md.startsWith("> 🗂️ **今日闪卡复习战报 · 2026-11-08**"));
        assert.ok(md.includes("复习完成: **35** 张"));
        assert.ok(md.includes("掌握率: **80%**"));
        assert.ok(md.includes("🟢 熟练: 28 · 🟡 勉强: 5 · 🔴 遗忘: 2"));
        assert.ok(md.includes("连续复习: **12 天🔥**"));
        assert.ok(md.includes('{: custom-type="flashcard-review-summary" custom-cards-reviewed="35" custom-retention="80" }'));
    });

    it("2. 完整战报渲染：包含专注用时、牌组细分反链与重难点卡片订正清单", () => {
        const input: DailyReviewSummaryInput = {
            date: "2026-11-08",
            totalReviewed: 50,
            masteryCount: 45,
            durationMinutes: 15,
            deckStats: [
                { deckId: "20261108-deck-1", deckName: "计算机网络与协议", count: 30, retentionRate: 90 },
                { deckId: "20261108-deck-2", deckName: "操作系统原理", count: 20, retentionRate: 85 },
            ],
            hardCards: [
                {
                    blockId: "20261108-card-1",
                    title: "TCP 拥塞控制四种算法原理",
                    rating: "again",
                    note: "慢启动与拥塞避免临界值需重新推演",
                },
                {
                    blockId: "20261108-card-2",
                    title: "虚拟内存页表置换 LRU vs Clock",
                    rating: "hard",
                },
            ],
        };

        const md = formatDailyReviewSummaryCardMarkdown(input);

        // 用时与节奏
        assert.ok(md.includes("⏱️ **专注用时**: **15** 分钟 (平均约 18s/张)"));

        // 牌组双链
        assert.ok(md.includes("(( 20261108-deck-1 '《计算机网络与协议》' )): **30** 张 · 掌握率 **90%**"));
        assert.ok(md.includes("(( 20261108-deck-2 '《操作系统原理》' )): **20** 张 · 掌握率 **85%**"));

        // 重难点卡片待办清单
        assert.ok(md.includes(">   - [ ] `🔴 遗忘` (( 20261108-card-1 'TCP 拥塞控制四种算法原理' )) —— 慢启动与拥塞避免临界值需重新推演"));
        assert.ok(md.includes(">   - [ ] `🟡 存疑` (( 20261108-card-2 '虚拟内存页表置换 LRU vs Clock' ))"));
    });

    it("3. 空边界与异常容错：零条目时安全降级且不产生换行坏结构", () => {
        const input: DailyReviewSummaryInput = {
            date: "2026-11-08",
            totalReviewed: 0,
        };

        const md = formatDailyReviewSummaryCardMarkdown(input);
        assert.ok(md.includes("复习完成: **0** 张 · 掌握率: **0%**"));
        assert.ok(!md.includes("牌组细分进展"));
        assert.ok(!md.includes("重难点卡片订正清单"));
        assert.ok(md.endsWith('custom-cards-reviewed="0" custom-retention="0" }\n'));
    });
});
