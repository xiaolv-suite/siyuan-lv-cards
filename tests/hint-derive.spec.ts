import { describe, expect, it } from "vitest";
import {
    deriveHintLevels,
    nextHint,
    formatHintLevelIndicator,
    stepLadderHint,
} from "../src/core/hint-ladder";

// BJ-2 内容推导：从卡面纯文本自动生成分级提示（无需预标注）
describe("deriveHintLevels（BJ-2 内容推导）", () => {
    it("完整句：explanation 取第一句，keyword 取前 30%", () => {
        const r = deriveHintLevels("线粒体是有氧呼吸的主要场所，为细胞提供 ATP。线粒体拥有双层膜结构。");
        expect(r.explanation).toBe("线粒体是有氧呼吸的主要场所，为细胞提供 ATP。");
        expect(r.keyword.length).toBeGreaterThan(0);
        expect(r.keyword.length).toBeLessThan(r.explanation.length);
        expect(r.full).toContain("线粒体");
    });

    it("无终止标点：explanation 取全部文本", () => {
        const r = deriveHintLevels("线粒体是细胞的能量工厂");
        expect(r.explanation).toBe("线粒体是细胞的能量工厂");
    });

    it("粗体标记：keyword 优先取标记内容", () => {
        const html = "细胞的<strong>能量工厂</strong>是什么？线粒体负责 ATP 合成。";
        const r = deriveHintLevels(html);
        expect(r.keyword).toBe("能量工厂");
    });

    it("高亮标记：keyword 取 mark 内容", () => {
        const r = deriveHintLevels("<mark>FSRS</mark> 是调度算法。FSRS 表示 Free Spaced Repetition Scheduler。");
        expect(r.keyword).toBe("FSRS");
    });

    it("空文本：full 为空字符串", () => {
        const r = deriveHintLevels("");
        expect(r.full).toBe("");
    });

    it("推导结果可直接作为 nextHint 的输入", () => {
        const input = deriveHintLevels("光合作用分为光反应和暗反应两个阶段。光反应在类囊体薄膜上进行。");
        const h1 = nextHint(input, null);
        expect(h1).not.toBeNull();
        expect(h1!.text.length).toBeGreaterThan(0);
        const h2 = nextHint(input, h1!.level);
        expect(h2).not.toBeNull();
        expect(h2!.text).not.toBe(h1!.text); // 下一级文本不同
    });

    describe("formatHintLevelIndicator", () => {
        it("正确格式化级别位置文本", () => {
            expect(formatHintLevelIndicator("keyword", ["keyword", "full"])).toBe("1/2");
            expect(formatHintLevelIndicator("full", ["keyword", "full"])).toBe("2/2");
            expect(formatHintLevelIndicator(null, ["keyword", "full"])).toBe("");
            expect(formatHintLevelIndicator("keyword", [])).toBe("");
        });
    });

    describe("stepLadderHint", () => {
        it("根据卡面文本自动推导并步进下一级提示", () => {
            const html = "<p><strong>光合作用</strong>在叶绿体中进行。这是植物合成有机物的过程。</p>";
            const step1 = stepLadderHint(html, null);
            expect(step1).not.toBeNull();
            expect(step1?.level).toBe("keyword");
            expect(step1?.text).toBe("光合作用");

            const step2 = stepLadderHint(html, step1!.level);
            expect(step2?.level).toBe("explanation");
        });

        it("传入知识对象 fact 时优先采用结构化回忆目标", () => {
            const html = "<p>普通文本</p>";
            const step1 = stepLadderHint(html, null, "核心要点");
            expect(step1?.level).toBe("recall-target");
            expect(step1?.text).toContain("回忆：核心要点");
        });

        it("传入 expectedText 与 contextTitle 时生成渐进式线索（Graded Cueing）", () => {
            const html = "<p>光合作用在哪个细胞器中进行？</p>";
            const step1 = stepLadderHint(html, null, undefined, {
                expectedText: "叶绿体",
                contextTitle: "生物笔记 / 细胞生物学",
            });
            expect(step1).not.toBeNull();
            expect(step1?.level).toBe("keyword");
            expect(step1?.text).toBe("首字线索：叶…（共 3 字）");

            const step2 = stepLadderHint(html, step1!.level, undefined, {
                expectedText: "叶绿体",
                contextTitle: "生物笔记 / 细胞生物学",
            });
            expect(step2?.level).toBe("context");
            expect(step2?.text).toContain("来源语境：生物笔记 / 细胞生物学");
        });
    });
});
