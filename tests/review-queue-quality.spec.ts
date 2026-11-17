import { describe, expect, it } from "vitest";
import {
    partitionReviewCardsByQuality,
    filterReviewQueueByQuality,
    type ReviewQualityCard,
    type ReviewQualityRow,
} from "@/core/review-queue-quality";

describe("review-queue-quality 出题队列卡片质量过滤", () => {
    const cards: ReviewQualityCard[] = [
        { cardID: "c1", blockID: "b1" },
        { cardID: "c2", blockID: "b2" },
        { cardID: "c3", blockID: "b3" }, // missing from DB
    ];

    const rows: ReviewQualityRow[] = [
        { id: "b1", markdown: "这是合法内容 ==答案==" },
        { id: "b2", markdown: "" }, // 空白块
    ];

    it("partitionReviewCardsByQuality 准确隔离丢失块与空内容块", () => {
        const res = partitionReviewCardsByQuality(cards, rows);
        expect(res.valid.map(c => c.cardID)).toEqual(["c1"]);
        expect(res.invalid.length).toBe(2);
        expect(res.invalid.map(i => i.cardID)).toEqual(["c2", "c3"]);
    });

    it("filterReviewQueueByQuality 异步完成块查询与遮挡校验分区", async () => {
        const queryBlocks = async (sql: string) => {
            return [
                { id: "b1", markdown: "这是合法内容 ==答案==" },
                { id: "b2", markdown: "这是图片缺失答案 ![](image.png)" },
            ];
        };

        const getBlockAttrs = async (id: string) => {
            if (id === "b2") {
                return { "lv-occlusion": JSON.stringify({ v: 1, rects: [{ x: 0, y: 0, w: 1, h: 1 }] }) };
            }
            return {};
        };

        const parseOccl = (attrs: Record<string, string>) => {
            if (attrs["lv-occlusion"]) return { rects: [1] };
            return null;
        };

        const res = await filterReviewQueueByQuality(cards, queryBlocks, getBlockAttrs, parseOccl);
        // c1 (cloze) 和 c2 (valid occlusion) 都通过，c3 (missing block) 被隔离
        expect(res.valid.map(c => c.cardID)).toEqual(["c1", "c2"]);
        expect(res.invalid.map(i => i.cardID)).toEqual(["c3"]);
    });

    it("空卡片队列直接返回空结果", async () => {
        const res = await filterReviewQueueByQuality([], async () => [], async () => ({}), () => null);
        expect(res.valid).toEqual([]);
        expect(res.invalid).toEqual([]);
    });

    it("已解散归档（custom-lv-dismissed=true）的卡片自动从复习队列过滤且不计入结构坏卡", async () => {
        const cardsWithDismissed: ReviewQualityCard[] = [
            { cardID: "c1", blockID: "b1" },
            { cardID: "c2", blockID: "b2" },
        ];
        const queryBlocks = async () => [
            { id: "b1", markdown: "正常卡片 ==答案==", ial: '{: id="b1"}' },
            { id: "b2", markdown: "已归档卡片 ==答案==", ial: '{: id="b2" custom-lv-dismissed="true"}' },
        ];
        const res = await filterReviewQueueByQuality(cardsWithDismissed, queryBlocks, async () => ({}), () => null);
        expect(res.valid.map(c => c.cardID)).toEqual(["c1"]);
        expect(res.invalid).toEqual([]);
        expect(res.dismissedBlockIDs).toEqual(["b2"]);
    });
});
