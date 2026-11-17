import { describe, expect, it, vi } from "vitest";
import {
    discoverLegacyDecks,
    extractDeckFromIal,
    extractDecksFromIal,
    extractCustomRiffTitle,
    extractDeckFromTags,
    findEmptyDecks,
    mergeRiffDecks,
    syncDiscoveredDeckToRiff,
    type RawScannedBlock,
} from "../src/core/deck-management";
import type { RiffDeck } from "../src/api/riff";

describe("deck-management 卡包管理与存量/第三方插件卡包同步引擎", () => {
    it("extractDeckFromIal 提取块属性中的卡包名称/ID", () => {
        expect(extractDeckFromIal('{: custom-riff-decks="deck-123"}')).toBe("deck-123");
        expect(extractDeckFromIal('{: custom-flashcard-deck="考研英语词汇"}')).toBe("考研英语词汇");
        expect(extractDeckFromIal('{: custom-deck="生物学基础"}')).toBe("生物学基础");
        expect(extractDeckFromIal('{: custom-card-deck="计算机网络"}')).toBe("计算机网络");
        expect(extractDeckFromIal('{: id="b-1"}')).toBeNull();
        expect(extractDeckFromIal("")).toBeNull();
    });

    it("extractDecksFromIal 完整提取思源内核逗号分隔的多卡包映射", () => {
        expect(extractDecksFromIal('{: custom-riff-decks="deck-1,deck-2,deck-3"}')).toEqual(["deck-1", "deck-2", "deck-3"]);
        expect(extractDecksFromIal("{: custom-riff-decks='deck-a,deck-b'}")).toEqual(["deck-a", "deck-b"]);
        expect(extractDecksFromIal('{: custom-flashcard-deck="考研英语,六级词汇"}')).toEqual(["考研英语", "六级词汇"]);
        expect(extractDecksFromIal('{: custom-riff-title="自定义题面标题"}')).toEqual([]);
    });

    it("extractCustomRiffTitle 提取闪卡工具箱自定义卡片标题属性", () => {
        expect(extractCustomRiffTitle('{: custom-riff-title="牛顿第一运动定律阐述"}')).toBe("牛顿第一运动定律阐述");
        expect(extractCustomRiffTitle("{: custom-riff-title='开普勒行星运动定律'}")).toBe("开普勒行星运动定律");
        expect(extractCustomRiffTitle('{: custom-card-title="化学元素周期律"}')).toBe("化学元素周期律");
        expect(extractCustomRiffTitle('{: id="b1"}')).toBeNull();
    });

    it("extractDeckFromTags 提取 Markdown 标签中的卡包名称", () => {
        expect(extractDeckFromTags("#deck/英语二核心词 这是一段内容")).toBe("英语二核心词");
        expect(extractDeckFromTags("问题描述 #卡包/中国近现代史纲要 答案")).toBe("中国近现代史纲要");
        expect(extractDeckFromTags("#卡组/中药学 归经与功效")).toBe("中药学");
        expect(extractDeckFromTags("普通标签 #tag 不匹配")).toBeNull();
        expect(extractDeckFromTags("无标签文本")).toBeNull();
    });

    it("discoverLegacyDecks 识别第三方插件卡包、标签卡包与未归组孤儿闪卡", () => {
        const activeRiffDecks: RiffDeck[] = [
            { id: "active-1", name: "默认卡组", size: 10, created: "2026-01-01", updated: "2026-01-01" },
        ];

        const rawBlocks: RawScannedBlock[] = [
            // 已在活跃原生卡包中的块（应被忽略，支持 ID 或名称去重）
            { id: "b1", markdown: "原生卡片内容", ial: '{: custom-riff-decks="active-1"}' },
            { id: "b1-name", markdown: "原生卡片内容（已导入卡包名称）", ial: '{: custom-riff-decks="默认卡组"}' },
            // 来自第三方插件属性的卡包
            { id: "b2", markdown: "第三方插件卡 1", ial: '{: custom-flashcard-deck="医学综合"}' },
            { id: "b3", markdown: "第三方插件卡 2", ial: '{: custom-flashcard-deck="医学综合"}' },
            // 来自标签的卡包
            { id: "b4", markdown: "标签卡 #deck/法理学 重点", ial: '{: id="b4"}' },
            // 未归组的孤儿挖空卡（带 == 但不在任何卡包）
            { id: "b5", markdown: "光合作用发生在 ==叶绿体== 中", ial: '{: id="b5"}' },
        ];

        const discovered = discoverLegacyDecks(rawBlocks, activeRiffDecks);

        expect(discovered).toHaveLength(3);

        const thirdParty = discovered.find(d => d.name === "医学综合");
        expect(thirdParty).toBeDefined();
        expect(thirdParty?.category).toBe("third-party");
        expect(thirdParty?.blockIDs).toEqual(["b2", "b3"]);

        const tagDeck = discovered.find(d => d.name === "法理学");
        expect(tagDeck).toBeDefined();
        expect(tagDeck?.category).toBe("tag");
        expect(tagDeck?.blockIDs).toEqual(["b4"]);

        const orphan = discovered.find(d => d.category === "orphan");
        expect(orphan).toBeDefined();
        expect(orphan?.blockIDs).toEqual(["b5"]);
    });

    it("syncDiscoveredDeckToRiff 将发现的卡包接入或创建为原生 RiffDeck", async () => {
        const getRiffDecks = vi.fn().mockResolvedValue([
            { id: "deck-exist", name: "已存在同名卡包", size: 5, created: "", updated: "" },
        ]);
        const createRiffDeck = vi.fn().mockResolvedValue({ id: "deck-new", name: "全新卡包", size: 0, created: "", updated: "" });
        const addRiffCards = vi.fn().mockResolvedValue(null);

        // 1. 同步到已存在卡包
        const res1 = await syncDiscoveredDeckToRiff(
            { name: "已存在同名卡包", category: "third-party", blockIDs: ["b1", "b2"] },
            { getRiffDecks, createRiffDeck, addRiffCards },
        );
        expect(res1).toEqual({ deckID: "deck-exist", deckName: "已存在同名卡包", addedCount: 2 });
        expect(createRiffDeck).not.toHaveBeenCalled();
        expect(addRiffCards).toHaveBeenCalledWith("deck-exist", ["b1", "b2"]);

        // 2. 创建新卡包并同步
        const res2 = await syncDiscoveredDeckToRiff(
            { name: "全新卡包", category: "tag", blockIDs: ["b3"] },
            { getRiffDecks, createRiffDeck, addRiffCards },
        );
        expect(res2).toEqual({ deckID: "deck-new", deckName: "全新卡包", addedCount: 1 });
        expect(createRiffDeck).toHaveBeenCalledWith("全新卡包");
        expect(addRiffCards).toHaveBeenCalledWith("deck-new", ["b3"]);
    });

    it("mergeRiffDecks 支持跨卡包合并卡片并可选清理源卡包", async () => {
        const getRiffCards = vi.fn()
            .mockResolvedValueOnce({ blocks: [{ id: "c1" }, { id: "c2" }], total: 3 })
            .mockResolvedValueOnce({ blocks: [{ id: "c3" }], total: 3 })
            .mockResolvedValueOnce({ blocks: [], total: 3 });

        const addRiffCards = vi.fn().mockResolvedValue(null);
        const removeRiffDeck = vi.fn().mockResolvedValue(null);

        const res = await mergeRiffDecks("source-deck", "target-deck", {
            getRiffCards,
            addRiffCards,
            removeRiffDeck,
        }, { deleteSourceDeck: true });

        expect(res.mergedCount).toBe(3);
        expect(addRiffCards).toHaveBeenCalledWith("target-deck", ["c1", "c2", "c3"]);
        expect(removeRiffDeck).toHaveBeenCalledWith("source-deck");
    });

    it("findEmptyDecks 准确过滤出卡片数为 0 的冗余空卡包", () => {
        const decks: RiffDeck[] = [
            { id: "d1", name: "活跃卡包", size: 12, created: "", updated: "" },
            { id: "d2", name: "空卡包 1", size: 0, created: "", updated: "" },
            { id: "d3", name: "空卡包 2", size: 0, created: "", updated: "" },
        ];
        expect(findEmptyDecks(decks).map(d => d.id)).toEqual(["d2", "d3"]);
    });
});
