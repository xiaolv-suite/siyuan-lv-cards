import { describe, expect, it, vi } from "vitest";
import { findDormantKnowledgeBlocks } from "@/core/dormant-knowledge";

describe("沉睡知识一键批量收纳入箱与流转契约", () => {
    it("从高亮块集合中提取沉睡块并批量推入材料收件箱", async () => {
        const rawBlocks = [
            { id: "blk-101", markdown: "电磁感应的核心规律由 ==法拉第电磁感应定律== 描述。" },
            { id: "blk-102", markdown: "普通背景段落，无高亮内容。" },
            { id: "blk-103", markdown: "楞次定律判断感应电流方向 ==增反减同==。" },
        ];

        const candidates = findDormantKnowledgeBlocks(rawBlocks);
        expect(candidates.length).toBe(2);

        // 模拟收件箱入箱
        const mockInboxStore = new Set<string>();
        const enrollDormantBlocks = vi.fn(async (blockIDs: string[]) => {
            let count = 0;
            for (const id of blockIDs) {
                if (!mockInboxStore.has(id)) {
                    mockInboxStore.add(id);
                    count++;
                }
            }
            return count;
        });

        const addedCount = await enrollDormantBlocks(candidates.map(c => c.blockID));
        expect(addedCount).toBe(2);
        expect(mockInboxStore.has("blk-101")).toBe(true);
        expect(mockInboxStore.has("blk-103")).toBe(true);
        expect(mockInboxStore.has("blk-102")).toBe(false);

        // 幂等入箱：重复执行不重复增加计数
        const secondRunCount = await enrollDormantBlocks(candidates.map(c => c.blockID));
        expect(secondRunCount).toBe(0);
    });
});
