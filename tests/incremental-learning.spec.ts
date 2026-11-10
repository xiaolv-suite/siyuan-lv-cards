import { describe, expect, it } from "vitest";
import {
    ATTR_LV_CARD_TYPE,
    ATTR_LV_DISMISSED,
    ATTR_LV_SOURCE_BLOCK,
    ATTR_LV_SOURCE_DOC,
    buildDismissAttrs,
    buildExtractCard,
    checkMinimumInformationPrinciple,
    filterDismissedFromQueue,
    inspectCardLearnability,
    isDismissedCard,
    isExtractCard,
    proposeCardSplits,
    shouldBypassFsrs,
} from "@/core/incremental-learning";
import { buildCardsBridge } from "@/api/external-bridge";

describe("渐进学习与两级调度解耦 (Incremental Learning - Issue #19)", () => {
    describe("两级调度规约与属性判定 (Two-Tier Schedulers)", () => {
        it("识别普通卡片与摘录卡片", () => {
            expect(isExtractCard(null)).toBe(false);
            expect(isExtractCard({})).toBe(false);
            expect(isExtractCard({ [ATTR_LV_CARD_TYPE]: "atomic" })).toBe(false);
            expect(isExtractCard({ [ATTR_LV_CARD_TYPE]: "extract" })).toBe(true);
        });

        it("识别已 Dismiss 归档的卡片", () => {
            expect(isDismissedCard(null)).toBe(false);
            expect(isDismissedCard({})).toBe(false);
            expect(isDismissedCard({ [ATTR_LV_DISMISSED]: "false" })).toBe(false);
            expect(isDismissedCard({ [ATTR_LV_DISMISSED]: "true" })).toBe(true);
        });

        it("规约：摘录卡或已 Dismiss 卡严禁进入 FSRS 遗忘曲线算法", () => {
            // 普通原子问答/挖空卡正常走 FSRS
            expect(shouldBypassFsrs({ [ATTR_LV_CARD_TYPE]: "atomic" })).toBe(false);
            expect(shouldBypassFsrs({})).toBe(false);

            // 粗加工摘录卡必须绕过 FSRS
            expect(shouldBypassFsrs({ [ATTR_LV_CARD_TYPE]: "extract" })).toBe(true);

            // 已 Dismiss 解散的卡必须绕过 FSRS
            expect(shouldBypassFsrs({ [ATTR_LV_DISMISSED]: "true" })).toBe(true);
        });
    });

    describe("带血缘摘录制卡 (Extract with Lineage)", () => {
        it("自动追加来源反链并生成规范块属性", () => {
            const card = buildExtractCard({
                content: "量子纠缠是指几个粒子在相互作用后，各个粒子所拥有的特性已综合成为整体性质。",
                sourceBlockId: "20261027101500-abcdef1",
                sourceDocId: "20261027100000-root123",
                sourceTitle: "量子物理学导论",
            });

            expect(card.markdown).toContain("量子纠缠是指几个粒子");
            expect(card.markdown).toContain("> 来源：(( 20261027101500-abcdef1 \"量子物理学导论\" ))");
            expect(card.attrs[ATTR_LV_CARD_TYPE]).toBe("extract");
            expect(card.attrs[ATTR_LV_DISMISSED]).toBe("false");
            expect(card.attrs[ATTR_LV_SOURCE_BLOCK]).toBe("20261027101500-abcdef1");
            expect(card.attrs[ATTR_LV_SOURCE_DOC]).toBe("20261027100000-root123");
        });

        it("无标题时优雅回退至默认标题", () => {
            const card = buildExtractCard({
                content: "一段摘录内容",
                sourceBlockId: "20261027101500-abcdef2",
            });
            expect(card.markdown).toContain("> 来源：(( 20261027101500-abcdef2 \"原文上下文\" ))");
            expect(card.attrs[ATTR_LV_SOURCE_DOC]).toBeUndefined();
        });
    });

    describe("Dismiss 解散归档机制", () => {
        it("生成正确的 Dismiss 属性补丁", () => {
            expect(buildDismissAttrs()).toEqual({
                [ATTR_LV_DISMISSED]: "true",
            });
        });

        it("从复习队列中彻底剔除已 Dismiss 的卡片", () => {
            const queue = [
                { id: "c1", blockID: "b1" },
                { id: "c2", blockID: "b2" },
                { id: "c3", blockID: "b3" },
            ];
            const dismissed = new Set(["b2"]);
            const active = filterDismissedFromQueue(queue, dismissed);
            expect(active.map(c => c.id)).toEqual(["c1", "c3"]);
        });
    });

    describe("最小信息原则检查 (Minimum Information Principle / Quality Guard)", () => {
        it("短小精悍的原子卡片不报警", () => {
            const res = checkMinimumInformationPrinciple("DNA 的中文全称是 ==脱氧核糖核酸==");
            expect(res.overloaded).toBe(false);
            expect(res.clozeCount).toBe(1);
            expect(res.suggestion).toBeUndefined();
        });

        it("超过 250 字的内容报警并提示拆分", () => {
            const longText = "这是一段很长的文本。".repeat(30); // 300字
            const res = checkMinimumInformationPrinciple(longText);
            expect(res.overloaded).toBe(true);
            expect(res.suggestion).toContain("建议坚守最小信息原则");
        });

        it("挖空数量超过 3 处时报警并提示拆分", () => {
            const text = "在 ==1911年==，==卢瑟福== 提出了原子的 ==核式结构模型==，推翻了 ==汤姆逊== 的葡萄干布丁模型。";
            const res = checkMinimumInformationPrinciple(text);
            expect(res.overloaded).toBe(true);
            expect(res.clozeCount).toBe(4);
            expect(res.suggestion).toContain("挖空过多");
        });

        it("C1 可学性把关：识别单卡多问、指代不明、答案泄漏、答案过长，且不误杀含分号的代码/公式卡", () => {
            // 1. 单卡多问 + 一键拆卡草案
            const multi = inspectCardLearnability({
                question: "什么是有丝分裂？什么是减数分裂？",
                answer: "有丝分裂产生体细胞；减数分裂产生生殖细胞",
                template: "qa",
            });
            expect(multi.overloaded).toBe(true);
            expect(multi.issues.map(i => i.kind)).toContain("multi-question");
            expect(multi.splitDrafts).toEqual([
                { q: "什么是有丝分裂？", a: "有丝分裂产生体细胞" },
                { q: "什么是减数分裂？", a: "减数分裂产生生殖细胞" },
            ]);

            // 2. 指代不明 + 答案泄漏
            const leakAndAmb = inspectCardLearnability({
                question: "它的核心作用是建立可靠连接吗？",
                answer: "建立可靠连接",
                template: "qa",
            });
            expect(leakAndAmb.issues.map(i => i.kind)).toContain("ambiguous-pronoun");
            expect(leakAndAmb.issues.map(i => i.kind)).toContain("answer-leak");

            // 3. 保护含分号的代码与公式，不误报单卡多问
            const codeCard = inspectCardLearnability({
                question: "执行 `const a = 1; const b = 2;` 后 `a + b` 的值是多少？",
                answer: "3",
                template: "qa",
            });
            expect(codeCard.overloaded).toBe(false);
            expect(codeCard.issues).toEqual([]);

            // 4. 多处 ==挖空== 自动生成按空位独立的拆卡草案
            const multiClozeSplits = proposeCardSplits({
                question: "在 ==1911年==，==卢瑟福== 提出了核式结构模型。",
            });
            expect(multiClozeSplits).toEqual([
                { q: "在 ==1911年==，卢瑟福 提出了核式结构模型。", a: "1911年" },
                { q: "在 1911年，==卢瑟福== 提出了核式结构模型。", a: "卢瑟福" },
            ]);
        });
    });

    describe("外部生态 Bridge 接口协商与 receiveExtract", () => {
        it("未实现 receiveExtract 时优雅降级为 not-supported", async () => {
            const bridge = buildCardsBridge({
                getStats: () => ({ todayReviews: 0, todayNew: 0, todayForget: 0, streak: 0, dueCount: 0, historyDays: 0 }),
                getDueSummary: async () => ({ unreviewedCount: 0, unreviewedNewCardCount: 0, unreviewedOldCardCount: 0, updatedAt: "" }),
                openHub: () => {},
                openReview: () => {},
            });

            const res = await bridge.receiveExtract({
                content: "摘录测试",
                sourceBlockId: "123",
            });
            expect(res.ok).toBe(false);
            if (!res.ok) {
                expect(res.code).toBe("not-supported");
            }
        });

        it("宿主挂载 receiveExtract 时顺利接收信封", async () => {
            const received: any[] = [];
            const bridge = buildCardsBridge({
                getStats: () => ({ todayReviews: 0, todayNew: 0, todayForget: 0, streak: 0, dueCount: 0, historyDays: 0 }),
                getDueSummary: async () => ({ unreviewedCount: 0, unreviewedNewCardCount: 0, unreviewedOldCardCount: 0, updatedAt: "" }),
                openHub: () => {},
                openReview: () => {},
                receiveExtract: async (env) => {
                    received.push(env);
                    return { ok: true, data: { createdBlockID: "new-block-id", blockID: "new-block-id", kind: "extract", enrolled: false } };
                },
            });

            const res = await bridge.receiveExtract({
                content: "量子纠缠",
                sourceBlockId: "blk-999",
                sourceTitle: "量子物理",
            });
            expect(res.ok).toBe(true);
            if (res.ok) {
                expect(res.data.blockID).toBe("new-block-id");
            }
            expect(received).toHaveLength(1);
            expect(received[0].sourceBlockId).toBe("blk-999");
        });
    });
});
