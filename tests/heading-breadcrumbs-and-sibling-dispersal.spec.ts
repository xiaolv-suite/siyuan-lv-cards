import { describe, expect, it } from "vitest";
import {
    buildRecursiveAncestorSql,
    resolveBreadcrumbsFromAncestorRows,
    resolveCardBreadcrumbsFromRows,
    createBreadcrumbCache,
} from "../src/core/review-breadcrumbs";
import {
    disperseSiblings,
    filterBurySiblings,
    countSiblingClashes,
    groupSiblingCards,
    getSiblingKey,
    type SiblingCardLike,
} from "../src/core/sibling-cards";

describe("Heading Breadcrumbs Context & Sibling Dispersal Engine", () => {
    describe("1. 标题层级面包屑上下文 (Heading Breadcrumbs Context)", () => {
        it("buildRecursiveAncestorSql 正确构建 CTE 递归查询 SQL 并转义单引号", () => {
            const sql1 = buildRecursiveAncestorSql("20261108-block-1");
            expect(sql1).toContain("WITH RECURSIVE ancestors");
            expect(sql1).toContain("WHERE id = '20261108-block-1'");
            expect(sql1).toContain("ORDER BY depth DESC");

            const sqlEscape = buildRecursiveAncestorSql("block'with'quote");
            expect(sqlEscape).toContain("WHERE id = 'block''with''quote'");
        });

        it("resolveBreadcrumbsFromAncestorRows 从递归行中解析出根文档及多级标题", () => {
            const mockRows = [
                { id: "doc-1", type: "d", subtype: "", content: "06-小驴闪卡", depth: 3 },
                { id: "h1-1", type: "h", subtype: "h1", content: "第一章 计算机基础", depth: 2 },
                { id: "h2-1", type: "h", subtype: "h2", content: "1.1 算法复杂度分析", depth: 1 },
                { id: "block-1", type: "p", subtype: "", content: "什么是大 O 符号？", depth: 0 },
            ];

            const res = resolveBreadcrumbsFromAncestorRows("c-100", mockRows);
            expect(res.currentBreadcrumbs).not.toBeNull();
            expect(res.currentBreadcrumbs?.cardId).toBe("c-100");
            expect(res.currentHPath).toBe("06-小驴闪卡 › 第一章 计算机基础 › 1.1 算法复杂度分析");

            const nodes = res.currentBreadcrumbs!.nodes;
            expect(nodes.length).toBeGreaterThanOrEqual(3);
            expect(nodes[0].fullTitle).toBe("06-小驴闪卡");
            expect(nodes[1].fullTitle).toBe("第一章 计算机基础");
            expect(nodes[2].fullTitle).toBe("1.1 算法复杂度分析");
        });

        it("resolveCardBreadcrumbsFromRows 能自适应识别祖先递归行与旧版单行 hpath", () => {
            // 模式 A：递归多行模式
            const ancestorRows = [
                { id: "doc-1", type: "d", subtype: "", content: "金融法规", depth: 2 },
                { id: "h1-1", type: "h", subtype: "h1", content: "私募投资基金监督管理条例", depth: 1 },
                { id: "b-1", type: "p", subtype: "", content: "合格投资者门槛", depth: 0 },
            ];
            const resA = resolveCardBreadcrumbsFromRows("card-a", ancestorRows);
            expect(resA.currentHPath).toBe("金融法规 › 私募投资基金监督管理条例");
            expect(resA.currentBreadcrumbs?.nodes).toHaveLength(2);

            // 模式 B：传统单行 hpath 模式
            const hpathRows = [{ hpath: "/工作区/日常随笔/思考" }];
            const resB = resolveCardBreadcrumbsFromRows("card-b", hpathRows);
            expect(resB.currentHPath).toBe("工作区 › 日常随笔 › 思考");
            expect(resB.currentBreadcrumbs?.nodes).toHaveLength(3);
        });

        it("createBreadcrumbCache 正确缓存与淘汰", () => {
            const cache = createBreadcrumbCache(3);
            expect(cache.size()).toBe(0);

            const res1 = { currentHPath: "Path 1", currentBreadcrumbs: null };
            const res2 = { currentHPath: "Path 2", currentBreadcrumbs: null };
            const res3 = { currentHPath: "Path 3", currentBreadcrumbs: null };
            const res4 = { currentHPath: "Path 4", currentBreadcrumbs: null };

            cache.set("b-1", res1);
            cache.set("b-2", res2);
            cache.set("b-3", res3);
            expect(cache.size()).toBe(3);
            expect(cache.get("b-1")?.currentHPath).toBe("Path 1");

            // 触发容量淘汰（容量 3，插入第 4 个，淘汰最久未访问的 b-2）
            cache.set("b-4", res4);
            expect(cache.size()).toBe(3);
            expect(cache.has("b-2")).toBe(false);
            expect(cache.has("b-1")).toBe(true);
            expect(cache.has("b-4")).toBe(true);

            cache.clear();
            expect(cache.size()).toBe(0);
        });
    });

    describe("2. 同源兄弟卡片分散与沉睡 (Sibling Cards Dispersal & Burying)", () => {
        it("getSiblingKey 正确支持按 block 与按 doc 提取同源标识", () => {
            const card: SiblingCardLike = {
                cardID: "c1",
                blockID: "b-100",
                sourceBlockId: "sb-200",
                sourceDocId: "doc-999",
            };
            expect(getSiblingKey(card, "block")).toBe("sb-200");
            expect(getSiblingKey(card, "doc")).toBe("doc-999");
        });

        it("filterBurySiblings 详尽输出 buriedCards 集合", () => {
            const cards: SiblingCardLike[] = [
                { blockID: "b1", cardID: "c1-1" },
                { blockID: "b1", cardID: "c1-2" },
                { blockID: "b1", cardID: "c1-3" },
                { blockID: "b2", cardID: "c2-1" },
            ];

            const res = filterBurySiblings(cards);
            expect(res.retained).toHaveLength(2);
            expect(res.retained.map(c => c.cardID)).toEqual(["c1-1", "c2-1"]);
            expect(res.buriedCount).toBe(2);
            expect(res.buriedCards.map(c => c.cardID)).toEqual(["c1-2", "c1-3"]);
            expect(res.buriedBlockIDs).toEqual(["b1"]);
        });

        it("groupSiblingCards 正确将卡片按母块归组", () => {
            const cards: SiblingCardLike[] = [
                { blockID: "b1", cardID: "c1" },
                { blockID: "b2", cardID: "c2" },
                { blockID: "b1", cardID: "c3" },
            ];
            const map = groupSiblingCards(cards);
            expect(map.size).toBe(2);
            expect(map.get("b1")?.map(c => c.cardID)).toEqual(["c1", "c3"]);
            expect(map.get("b2")?.map(c => c.cardID)).toEqual(["c2"]);
        });

        it("countSiblingClashes 精确计算相邻同源冲突对数", () => {
            const noClash: SiblingCardLike[] = [
                { blockID: "b1", cardID: "c1" },
                { blockID: "b2", cardID: "c2" },
                { blockID: "b1", cardID: "c3" },
            ];
            expect(countSiblingClashes(noClash)).toBe(0);

            const hasClash: SiblingCardLike[] = [
                { blockID: "b1", cardID: "c1" },
                { blockID: "b1", cardID: "c2" },
                { blockID: "b2", cardID: "c3" },
            ];
            expect(countSiblingClashes(hasClash)).toBe(1);
        });

        it("disperseSiblings 错位步长机制有效降低甚至消除相邻冲突", () => {
            const cards: SiblingCardLike[] = [
                { blockID: "b1", cardID: "c1-1" },
                { blockID: "b1", cardID: "c1-2" },
                { blockID: "b2", cardID: "c2-1" },
                { blockID: "b2", cardID: "c2-2" },
                { blockID: "b3", cardID: "c3-1" },
            ];
            const dispersed = disperseSiblings(cards);
            expect(dispersed).toHaveLength(5);
            // 错位步长下相邻冲突应为 0
            expect(countSiblingClashes(dispersed)).toBe(0);
        });
    });
});
