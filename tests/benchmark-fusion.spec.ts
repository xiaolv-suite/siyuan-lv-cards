import { describe, expect, it } from "vitest";
import { DEFAULT_LEECH_THRESHOLD, isLeechCard } from "@/core/revlog";
import { defaultSettings } from "@/core/settings";
import { stepLadderHint, advanceCardHint } from "@/core/hint-ladder";
import { parseHPathToBreadcrumbs, formatHPathDisplay } from "@/core/review-breadcrumbs";
import { disperseSiblings, filterBurySiblings, type SiblingCardLike } from "@/core/sibling-cards";
import { applyQueuePipeline, type QueuePipelineCard } from "@/core/review-queue-pipeline";
import { get7DayForecast, smoothForecastLoad, type ForecastCardInput, type ForecastDay } from "@/core/forecast";
import { resolveReviewKeyAction } from "@/core/review-shortcuts";

describe("[TASK-20261031-github-benchmark-fusion] GitHub 三大对标产品融合闭环验证", () => {
    describe("改造项 A：水蛭卡（Leech）自动识别与按 H 键渐进线索揭示", () => {
        it("缺省阈值与设置页默认值一致（8 次），传入用户阈值时按用户阈值判定", () => {
            // v0.220.0：此前复习页写死 5、进度条写死 4、设置页写 8，三处不一致；统一为 DEFAULT_LEECH_THRESHOLD
            expect(DEFAULT_LEECH_THRESHOLD).toBe(defaultSettings().leechThreshold);
            expect(isLeechCard({ lapses: 8 })).toBe(true);
            expect(isLeechCard({ lapses: 7 })).toBe(false);
            expect(isLeechCard({ lapses: 5 }, 5)).toBe(true);
            expect(isLeechCard({ lapses: 4 }, 5)).toBe(false);
            expect(isLeechCard({ lapses: 0 })).toBe(false);
            expect(isLeechCard(null)).toBe(false);
            expect(isLeechCard(undefined)).toBe(false);
        });

        it("队列管道按用户设置的阈值注入 isLeech 标记", () => {
            const cards: QueuePipelineCard[] = [
                { cardID: "c1", state: 1, lapses: 2 },
                { cardID: "c2", state: 1, lapses: 5 },
                { cardID: "c3", state: 2, lapses: 9 },
            ];
            const byDefault = applyQueuePipeline(cards, { scopeKey: "all" });
            expect(byDefault.find(c => c.cardID === "c2")?.isLeech).toBe(false);
            expect(byDefault.find(c => c.cardID === "c3")?.isLeech).toBe(true);
            const byUser = applyQueuePipeline(cards, { scopeKey: "all", leechThreshold: 5 });
            expect(byUser.find(c => c.cardID === "c1")?.isLeech).toBe(false);
            expect(byUser.find(c => c.cardID === "c2")?.isLeech).toBe(true);
            expect(byUser.find(c => c.cardID === "c3")?.isLeech).toBe(true);
        });

        it("复习正面按 H / h 键触发 advance-hint 快捷键动作，不直接翻面", () => {
            const ctx = {
                showAnswer: false,
                hasCurrent: true,
                faceReady: true,
                hasLastAnswered: false,
                ratingStyle: "four" as const,
            };
            const actLower = resolveReviewKeyAction({ key: "h" } as any, ctx);
            expect(actLower).toBe("advance-hint");

            const actUpper = resolveReviewKeyAction({ key: "H" } as any, ctx);
            expect(actUpper).toBe("advance-hint");

            // 空格键翻开完整背面
            const actSpace = resolveReviewKeyAction({ code: "Space", key: " " } as any, ctx);
            expect(actSpace).toBe("reveal");
        });

        it("Graded Cueing 渐进式线索：第 1 层揭示首字线索与字数，第 2 层揭示语境，第 3 层翻开答案", () => {
            const cardHtml = "<p>植物进行光合作用的主要细胞器是？</p>";
            const expectedText = "叶绿体";
            const contextTitle = "生物学 / 细胞学 / 细胞器";

            // 第 1 步：H 键推进到 keyword 级（首字线索）
            const step1 = stepLadderHint(cardHtml, null, undefined, { expectedText, contextTitle });
            expect(step1).not.toBeNull();
            expect(step1?.level).toBe("keyword");
            expect(step1?.text).toBe("首字线索：叶…（共 3 字）");

            // advanceCardHint 验证不触发翻面
            const adv1 = advanceCardHint(cardHtml, null, "card-1", undefined, { expectedText, contextTitle });
            expect(adv1?.shouldRevealAnswer).toBe(false);
            expect(adv1?.text).toBe("首字线索：叶…（共 3 字）");

            // 第 2 步：再次按 H 推进到 context 级（来源语境）
            const step2 = stepLadderHint(cardHtml, step1!.level, undefined, { expectedText, contextTitle });
            expect(step2?.level).toBe("context");
            expect(step2?.text).toContain("来源语境：生物学 / 细胞学 / 细胞器");

            // 第 3 步：继续推进到 explanation / full 最终翻面
            const step3 = stepLadderHint(cardHtml, step2!.level, undefined, { expectedText, contextTitle });
            expect(step3?.level).toBe("explanation");
            expect(step3?.text).toBe("叶绿体");
        });
    });

    describe("改造项 B：思源文档/标题层级面包屑与同源兄弟卡错峰排列", () => {
        it("自适应解析思源标题路径为多级面包屑", () => {
            const hpath = "/计算机体系/网络/传输层协议/TCP握手";
            const bc = parseHPathToBreadcrumbs("block-tcp", hpath);
            expect(bc.nodes.length).toBe(3); // 深度限制折叠
            expect(bc.nodes[0].displayTitle).toBe("计算机体系");
            expect(bc.nodes[1].displayTitle).toBe("…");
            expect(bc.nodes[2].displayTitle).toBe("TCP握手");
            expect(formatHPathDisplay(hpath)).toBe("计算机体系 › 网络 › 传输层协议 › TCP握手");
        });

        it("构建队列时自动将同源兄弟卡错开排列（Disperse Siblings），杜绝连续出题剧透", () => {
            const siblingGroup: QueuePipelineCard[] = [
                { cardID: "c1-a", blockID: "block-1", state: 1, lapses: 0 },
                { cardID: "c1-b", blockID: "block-1", state: 1, lapses: 0 }, // c1-b 与 c1-a 同源
                { cardID: "c2-a", blockID: "block-2", state: 1, lapses: 0 },
                { cardID: "c3-a", blockID: "block-3", state: 1, lapses: 0 },
                { cardID: "c2-b", blockID: "block-2", state: 1, lapses: 0 }, // c2-b 与 c2-a 同源
            ];

            // 自动错峰排列：每轮轮流抽取不同源块的卡片
            const dispersed = applyQueuePipeline(siblingGroup, { scopeKey: "all", burySiblings: false });
            expect(dispersed).toHaveLength(5);
            // 前 3 张来自 3 个互不相同的源块
            const firstThreeBlocks = dispersed.slice(0, 3).map(c => c.blockID);
            expect(new Set(firstThreeBlocks).size).toBe(3);

            // c1-a 与 c1-b 不相邻
            const idx1a = dispersed.findIndex(c => c.cardID === "c1-a");
            const idx1b = dispersed.findIndex(c => c.cardID === "c1-b");
            expect(Math.abs(idx1a - idx1b)).toBeGreaterThan(1);
        });

        it("支持依据 sourceBlockId 属性识别并埋藏同源兄弟卡", () => {
            const cards: SiblingCardLike[] = [
                { cardID: "c1", sourceBlockId: "root-block" },
                { cardID: "c2", sourceBlockId: "root-block" },
                { cardID: "c3", sourceBlockId: "other-block" },
            ];
            const res = filterBurySiblings(cards);
            expect(res.retained.map(c => c.cardID)).toEqual(["c1", "c3"]);
            expect(res.buriedCount).toBe(1);
        });
    });

    describe("改造项 C：未来 7 日复习负载预报与负载平滑削峰填谷", () => {
        const TODAY = new Date(2026, 9, 31); // 2026-10-31

        it("准确生成 7 日复习负载预报柱状图数据", () => {
            const cards: ForecastCardInput[] = [
                { due: "20261031090000", state: 1 }, // 今天 1 张复习
                { due: "20261101090000", state: 1 }, // 明天 1 张复习
                { due: "20261101150000", state: 1 }, // 明天 1 张复习
                { due: "20261102090000", state: 0 }, // 后天新卡
                { due: "20261103090000", state: 1 }, // 大后天 1 张复习
            ];

            const forecast = get7DayForecast(cards, { today: TODAY, dailyNewTarget: 5 });
            expect(forecast.days).toHaveLength(7);
            expect(forecast.totalDue).toBeGreaterThanOrEqual(4);
            expect(forecast.maxCount).toBeGreaterThanOrEqual(2);
            expect(forecast.days[0].reviews).toBe(1);
            expect(forecast.days[1].reviews).toBe(2);
        });

        it("smoothForecastLoad 削峰填谷平滑过高突增峰值，且总复习量保持守恒", () => {
            const spikeDays: ForecastDay[] = [
                { date: "2026-10-31", reviews: 2, news: 0 },
                { date: "2026-11-01", reviews: 50, news: 0 }, // 突发尖峰 50 张
                { date: "2026-11-02", reviews: 2, news: 0 },
                { date: "2026-11-03", reviews: 2, news: 0 },
                { date: "2026-11-04", reviews: 2, news: 0 },
                { date: "2026-11-05", reviews: 2, news: 0 },
                { date: "2026-11-06", reviews: 2, news: 0 },
            ];

            const smoothed = smoothForecastLoad(spikeDays);
            expect(smoothed).toHaveLength(7);
            // 峰值日显著削峰
            expect(smoothed[1].reviews).toBeLessThan(50);
            // 相邻日填谷获得平滑分配
            expect(smoothed[0].reviews).toBeGreaterThan(2);
            expect(smoothed[2].reviews).toBeGreaterThan(2);

            // 总复习卡片总量严格守恒，绝不丢失任何待复习卡片
            const rawSum = spikeDays.reduce((acc, d) => acc + d.reviews, 0);
            const smoothSum = smoothed.reduce((acc, d) => acc + d.reviews, 0);
            expect(smoothSum).toBe(rawSum);
        });
    });
});
