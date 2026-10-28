import { describe, expect, it } from "vitest";
import {
    createReviewHistorySnapshot,
    pushReviewHistory,
    popReviewHistory,
    MAX_REVIEW_HISTORY_DEPTH,
    type ReviewHistorySnapshot,
} from "@/core/review-history";

describe("review-history 复习历史栈管理", () => {
    const mockCard = { cardID: "card-1", deckID: "deck-1", blockID: "b-1" };
    const mockSnapshotInput = {
        queue: [mockCard],
        pendingRequeues: [],
        reviewedIDs: ["r-1"],
        skippedIDs: ["s-1"],
        current: mockCard,
        showAnswer: true,
        cardHtml: "<p>答案</p>",
        expectedText: "答案",
        faceError: "",
        occlusion: { v: 1 as const, rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }] },
        counters: { new: 1, review: 2, forget: 0, skip: 1 },
    };

    it("createReviewHistorySnapshot 深拷贝容器集合，隔离后续副作用", () => {
        const queue = [mockCard];
        const reviewedIDs = ["r-1"];
        const snap = createReviewHistorySnapshot({
            ...mockSnapshotInput,
            queue,
            reviewedIDs,
        });

        // 改变原输入数组
        queue.push({ cardID: "card-2", deckID: "deck-1", blockID: "b-2" });
        reviewedIDs.push("r-2");

        // 快照内部集合不受污染
        expect(snap.queue.length).toBe(1);
        expect(snap.reviewedIDs).toEqual(["r-1"]);
        expect(snap.occlusion?.rects.length).toBe(1);
    });

    it("pushReviewHistory 与 popReviewHistory 符合后进先出 (LIFO)", () => {
        const stack: ReviewHistorySnapshot[] = [];
        const s1 = createReviewHistorySnapshot({ ...mockSnapshotInput, cardHtml: "1" });
        const s2 = createReviewHistorySnapshot({ ...mockSnapshotInput, cardHtml: "2" });

        pushReviewHistory(stack, s1);
        pushReviewHistory(stack, s2);
        expect(stack.length).toBe(2);

        expect(popReviewHistory(stack)?.cardHtml).toBe("2");
        expect(popReviewHistory(stack)?.cardHtml).toBe("1");
        expect(popReviewHistory(stack)).toBeNull();
    });

    it("超过最大深度时安全淘汰最旧快照 (Shift Oldest)", () => {
        const stack: ReviewHistorySnapshot[] = [];
        for (let i = 0; i < MAX_REVIEW_HISTORY_DEPTH + 5; i++) {
            pushReviewHistory(
                stack,
                createReviewHistorySnapshot({ ...mockSnapshotInput, cardHtml: `snap-${i}` })
            );
        }

        expect(stack.length).toBe(MAX_REVIEW_HISTORY_DEPTH);
        // 最旧的 0~4 被淘汰，此时栈底应为 snap-5
        expect(stack[0].cardHtml).toBe("snap-5");
        // 栈顶应为最新的 snap-54
        expect(stack[stack.length - 1].cardHtml).toBe(`snap-${MAX_REVIEW_HISTORY_DEPTH + 4}`);
    });
});
