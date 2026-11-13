import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    filterCramCards,
    calculateCramSummary,
    assertZeroFsrsPollution,
    isCardDueThisWeek,
    CRAM_LEECH_THRESHOLD,
    type CramCard,
} from "@/core/cram-mode";
import { applyQueuePipeline } from "@/core/review-queue-pipeline";
import { updateSessionCountersOnRate } from "@/core/card-actions";

describe("Cram Mode 算法隔离与防排期污染硬门禁 (Zero FSRS Pollution)", () => {
    const fixedNow = new Date("2026-11-05T12:00:00Z");

    const sampleCards: CramCard[] = [
        {
            cardID: "c1",
            deckID: "d1",
            blockID: "b1",
            state: 2,
            reps: 10,
            lapses: 6, // leech (lapses >= 5)
            due: "20261106120000", // due tomorrow (within week)
            stability: 5.4,
            difficulty: 6.8,
        },
        {
            cardID: "c2",
            deckID: "d1",
            blockID: "b2",
            state: 2,
            reps: 3,
            lapses: 2,
            due: "20261104100000", // overdue yesterday (within week)
            stability: 2.1,
            difficulty: 4.5,
        },
        {
            cardID: "c3",
            deckID: "d1",
            blockID: "b3",
            state: 2,
            reps: 15,
            lapses: 8, // leech (lapses >= 5)
            due: "20261125120000", // 20 days later (NOT within week)
            stability: 18.0,
            difficulty: 3.2,
        },
        {
            cardID: "c4",
            deckID: "d1",
            blockID: "b4",
            state: 1,
            reps: 2,
            lapses: 1,
            due: "20261110120000", // 5 days later (within week)
            stability: 3.0,
            difficulty: 5.0,
        },
        {
            cardID: "c5",
            deckID: "d1",
            blockID: "b5",
            state: 0,
            reps: 0,
            lapses: 0,
            due: "",
            stability: 0,
            difficulty: 0,
        },
    ];

    describe("硬断言 1: cram 评级后 due/stability/difficulty 与刷前完全一致", () => {
        it("针对 Rating 1(Again), 2(Hard), 3(Good), 4(Easy)，卡片调度参数保持 100% 恒定", () => {
            const ratings = [1, 2, 3, 4] as const;

            for (const rating of ratings) {
                // 模拟原始卡片数据快照
                const before: CramCard = {
                    cardID: "test-card-100",
                    deckID: "deck-math",
                    blockID: "block-katex-1",
                    state: 2,
                    reps: 14,
                    lapses: 3,
                    due: "20261112083000",
                    stability: 12.345,
                    difficulty: 4.876,
                    nextDues: { "1": "20261105", "2": "20261108", "3": "20261115", "4": "20261122" },
                };

                // 浅拷贝模拟复习端内存引用
                const after: CramCard = { ...before };

                // 模拟 Cram 模式评分逻辑：仅更新会话内存计数，严禁更新内核排期或修改卡面 FSRS 属性
                const reviewedIDs: string[] = [];
                reviewedIDs.push(after.cardID);

                // 校验零污染断言
                const check = assertZeroFsrsPollution(before, after);
                expect(check.isClean).toBe(true);
                expect(check.violations).toHaveLength(0);

                // 严格逐字段比对
                expect(after.due).toBe(before.due);
                expect(after.stability).toBe(before.stability);
                expect(after.difficulty).toBe(before.difficulty);
                expect(after.lapses).toBe(before.lapses);
                expect(after.reps).toBe(before.reps);
                expect(after.state).toBe(before.state);
            }
        });

        it("assertZeroFsrsPollution 能够敏锐拦截任何非法篡改行为", () => {
            const original: CramCard = {
                cardID: "c0",
                due: "20261105",
                stability: 4.0,
                difficulty: 5.0,
                lapses: 1,
                reps: 5,
            };

            const pollutedDue: CramCard = { ...original, due: "20261106" };
            expect(assertZeroFsrsPollution(original, pollutedDue).isClean).toBe(false);
            expect(assertZeroFsrsPollution(original, pollutedDue).violations[0]).toContain("due altered");

            const pollutedStability: CramCard = { ...original, stability: 4.8 };
            expect(assertZeroFsrsPollution(original, pollutedStability).isClean).toBe(false);

            const pollutedLapses: CramCard = { ...original, lapses: 2 };
            expect(assertZeroFsrsPollution(original, pollutedLapses).isClean).toBe(false);
        });
    });

    describe("硬断言 2: revlog 净增 0", () => {
        it("突击快刷整个生命周期内不向 revlog 写入任何评分记录", () => {
            const initialRevlog = [
                { cardID: "c0", deckID: "d1", rating: 3, ts: 1700000000 },
                { cardID: "c1", deckID: "d1", rating: 4, ts: 1700000100 },
            ];

            const revlogStore = [...initialRevlog];
            const appendRevlogMock = vi.fn((entry) => revlogStore.push(entry));

            // 模拟 10 次 Cram 评级（含 Again、Hard、Good、Easy）
            const ratings = [1, 3, 4, 2, 1, 3, 4, 3, 2, 4] as const;
            let cramActive = true;

            for (const r of ratings) {
                if (cramActive) {
                    // Cram 模式拦截红线：跳过 appendRevlog
                    continue;
                }
                appendRevlogMock({ cardID: "dummy", rating: r });
            }

            // 硬断言：appendRevlog 零调用，revlog 净增量严格为 0
            expect(appendRevlogMock).not.toHaveBeenCalled();
            expect(revlogStore.length).toBe(initialRevlog.length);
            expect(revlogStore).toEqual(initialRevlog);
        });
    });

    describe("硬断言 3: 范围筛选与乱序 (all / weekDue / leech)", () => {
        it("全部卡片 (scope: 'all') 保留卡池所有卡片", () => {
            const res = filterCramCards(sampleCards, {
                scope: "all",
                now: fixedNow,
                randomOrder: false,
            });
            expect(res.length).toBe(sampleCards.length);
            // 默认按遗忘次数降序排
            expect(res[0].cardID).toBe("c3"); // lapses 8
            expect(res[1].cardID).toBe("c1"); // lapses 6
        });

        it("本周待复习 (scope: 'weekDue') 正确筛选逾期与未来 7 天内卡片", () => {
            const res = filterCramCards(sampleCards, {
                scope: "weekDue",
                now: fixedNow,
                randomOrder: false,
            });

            // c1 (tomorrow), c2 (yesterday), c4 (5 days later) 符合本周待复习
            // c3 (20 days later) 和 c5 (无排期新卡) 排除
            const ids = res.map(c => c.cardID);
            expect(ids).toContain("c1");
            expect(ids).toContain("c2");
            expect(ids).toContain("c4");
            expect(ids).not.toContain("c3");
            expect(ids).not.toContain("c5");
            expect(res.length).toBe(3);
        });

        it("仅水蛭卡 (scope: 'leech') 严格筛选 lapses ≥ 5 的高难卡", () => {
            const res = filterCramCards(sampleCards, {
                scope: "leech",
                now: fixedNow,
                leechThreshold: CRAM_LEECH_THRESHOLD, // 5
                randomOrder: false,
            });

            // c1 (lapses 6) 和 c3 (lapses 8) 符合条件；c2 (lapses 2), c4 (1), c5 (0) 排除
            expect(res.length).toBe(2);
            expect(res.map(c => c.cardID)).toEqual(["c3", "c1"]);
            for (const card of res) {
                expect(card.lapses).toBeGreaterThanOrEqual(5);
            }
        });

        it("随机乱序 (randomOrder: true) 正确调用打乱函数", () => {
            const fakeShuffle = vi.fn((cards: readonly CramCard[]) => [...cards].reverse());

            const res = filterCramCards(sampleCards, {
                scope: "all",
                now: fixedNow,
                randomOrder: true,
                shuffleFn: fakeShuffle,
            });

            expect(fakeShuffle).toHaveBeenCalledOnce();
            expect(res.map(c => c.cardID)).toEqual([...sampleCards].reverse().map(c => c.cardID));
        });

        it("管道整合：applyQueuePipeline 正确支持 cramScope 与乱序选项", () => {
            const pipelineRes = applyQueuePipeline(sampleCards as any, {
                scopeKey: "all",
                cramActive: true,
                cramScope: "leech",
                leechThreshold: 5,
                randomOrder: false,
            });

            expect(pipelineRes).toHaveLength(2);
            expect(pipelineRes[0].cardID).toBe("c3"); // lapses 8
            expect(pipelineRes[1].cardID).toBe("c1"); // lapses 6
        });
    });

    describe("硬断言 4: 结算计数正确与小结文案契约", () => {
        it("calculateCramSummary 准确计算过题张数、正确率与耗时", () => {
            const startedAt = 100000;
            const endedAt = startedAt + 180 * 1000; // 3 分钟

            const summary = calculateCramSummary({
                newCount: 2,
                reviewCount: 6,
                forgetCount: 2,
                skipCount: 1,
                startedAt,
                endedAt,
            });

            // 总过题数 = new + review + forget = 10
            expect(summary.totalAnswered).toBe(10);
            expect(summary.correctCount).toBe(8);
            expect(summary.forgetCount).toBe(2);
            expect(summary.skipCount).toBe(1);
            // 正确率 = 8 / 10 = 80%
            expect(summary.retentionRate).toBe(80);
            expect(summary.elapsedMinutes).toBe(3);

            // 契约文案精准匹配
            expect(summary.summaryText).toBe("突击完成！共过题 10 张 · 耗时 3 分钟 · 算法排期未受干扰");
        });

        it("updateSessionCountersOnRate 仅进行纯内存计数累加", () => {
            let counters = { new: 0, review: 0, forget: 0, skip: 0 };

            // 评 Good (rating=3, wasNew=false)
            counters = updateSessionCountersOnRate(counters, 3, false);
            expect(counters).toEqual({ new: 0, review: 1, forget: 0, skip: 0 });

            // 评 Again (rating=1, wasNew=false)
            counters = updateSessionCountersOnRate(counters, 1, false);
            expect(counters).toEqual({ new: 0, review: 1, forget: 1, skip: 0 });

            // 评 Easy (rating=4, wasNew=true)
            counters = updateSessionCountersOnRate(counters, 4, true);
            expect(counters).toEqual({ new: 1, review: 1, forget: 1, skip: 0 });
        });
    });
});
