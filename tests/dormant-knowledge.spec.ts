import { describe, expect, it } from "vitest";
import {
    isBlockEnrolledAsCard,
    findDormantKnowledgeBlocks,
    formatDormantCandidatesToCards,
} from "@/core/dormant-knowledge";

describe("沉睡知识挖掘仪（Dormant Knowledge Discovery）引擎", () => {
    describe("isBlockEnrolledAsCard 制卡状态判定", () => {
        it("已有 custom-riff-decks 属性的块被正确判定为已制卡", () => {
            expect(isBlockEnrolledAsCard('{: custom-riff-decks="20261028-deck-1"}')).toBe(true);
            expect(isBlockEnrolledAsCard(undefined, "内容 {: custom-riff-decks=\"deck-1\"}")).toBe(true);
            expect(isBlockEnrolledAsCard("普通属性 {: id=\"blk-1\"}")).toBe(false);
        });
    });

    describe("findDormantKnowledgeBlocks 沉睡高亮知识挖掘", () => {
        const rawBlocks = [
            {
                id: "b-1",
                markdown: "光合作用的反应场所是 ==叶绿体==，核心色素是 ==叶绿素==。",
                ial: '{: id="b-1"}',
            },
            {
                id: "b-2",
                markdown: "已制卡内容 ==核心考点== {: custom-riff-decks=\"deck-1\"}",
                ial: '{: custom-riff-decks="deck-1"}',
            },
            {
                id: "b-3",
                markdown: "普通段落，没有任何高亮标记。",
                ial: '{: id="b-3"}',
            },
            {
                id: "b-4",
                markdown: "牛顿第二定律公式为 ==F=ma==，其中 F 表示合外力。",
                ial: '{: id="b-4"}',
            },
        ];

        it("自动过滤已制卡块和无高亮块，精准提取未制卡的候选知识块", () => {
            const candidates = findDormantKnowledgeBlocks(rawBlocks);

            expect(candidates.length).toBe(2);
            expect(candidates[0].blockID).toBe("b-1");
            expect(candidates[0].highlightTexts).toEqual(["叶绿体", "叶绿素"]);

            expect(candidates[1].blockID).toBe("b-4");
            expect(candidates[1].highlightTexts).toEqual(["F=ma"]);
        });

        it("支持限制返回候选上限", () => {
            const candidates = findDormantKnowledgeBlocks(rawBlocks, 1);
            expect(candidates.length).toBe(1);
            expect(candidates[0].blockID).toBe("b-1");
        });
    });

    describe("formatDormantCandidatesToCards 格式化导出", () => {
        it("将候选块转换为标准的待办制卡对象数组", () => {
            const candidates = [
                {
                    blockID: "b-10",
                    markdown: "细胞呼吸在线粒体进行 ==能量释放==",
                    highlightTexts: ["能量释放"],
                    excerpt: "细胞呼吸在线粒体进行 能量释放",
                },
            ];

            const formatted = formatDormantCandidatesToCards(candidates);
            expect(formatted.length).toBe(1);
            expect(formatted[0].blockID).toBe("b-10");
            expect(formatted[0].markdown).toContain("能量释放");
        });
    });
});
