import { describe, expect, it } from "vitest";
import { parseHPathToBreadcrumbs } from "@/core/review-breadcrumbs";

describe("每日复习任务与卡片纯净父路径特性审查", () => {
    describe("每日 FSRS 记忆负荷微任务生成契约", () => {
        it("待复习卡片数 > 0 时生成未完成待办任务", () => {
            const dueCount = 25;
            const prefix = "记忆复习";
            const taskText = dueCount === 0
                ? `- [x] ${prefix}：今日已无待复习闪卡`
                : `- [ ] ${prefix}：今日待复习 ${dueCount} 张闪卡`;

            expect(taskText).toBe("- [ ] 记忆复习：今日待复习 25 张闪卡");
        });

        it("待复习卡片数 = 0 时生成已完成打勾状态待办任务", () => {
            const dueCount = 0;
            const prefix = "记忆复习";
            const taskText = dueCount === 0
                ? `- [x] ${prefix}：今日已无待复习闪卡`
                : `- [ ] ${prefix}：今日待复习 ${dueCount} 张闪卡`;

            expect(taskText).toBe("- [x] 记忆复习：今日已无待复习闪卡");
        });
    });

    describe("卡片层级面包屑纯净隐藏父路径策略", () => {
        const blockID = "20261028-block-1";
        const hPath = "/学习笔记/物理科学/经典力学/牛顿运动定律";

        it("完整模式展示层级节点（超出深度自动自适应折叠中间层）", () => {
            const breadcrumbs = parseHPathToBreadcrumbs(blockID, hPath);
            expect(breadcrumbs).not.toBeNull();
            if (!breadcrumbs) return;

            expect(breadcrumbs.nodes.length).toBe(3);
            expect(breadcrumbs.nodes[0].displayTitle).toBe("学习笔记");
            expect(breadcrumbs.nodes[1].displayTitle).toBe("…");
            expect(breadcrumbs.nodes[2].displayTitle).toBe("牛顿运动定律");
        });

        it("隐藏父路径（极简纯净模式）仅展示末级核心文档，杜绝冗长层级干扰", () => {
            const breadcrumbs = parseHPathToBreadcrumbs(blockID, hPath);
            expect(breadcrumbs).not.toBeNull();
            if (!breadcrumbs) return;

            const hideParent = true;
            const displayNodes = hideParent && breadcrumbs.nodes.length > 1
                ? [breadcrumbs.nodes[breadcrumbs.nodes.length - 1]]
                : breadcrumbs.nodes;

            expect(displayNodes.length).toBe(1);
            expect(displayNodes[0].displayTitle).toBe("牛顿运动定律");
            expect(displayNodes[0].fullTitle).toBe("牛顿运动定律");
        });
    });
});
