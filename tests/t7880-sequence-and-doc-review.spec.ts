import { describe, expect, it } from "vitest";

import {
    isSequenceCard,
    parseSequenceCard,
    advanceSequenceStep,
    revealAllSequence,
    resetSequenceProgress,
    markSequenceItem,
} from "../src/core/sequence-card";

import {
    calculateDocNextSchedule,
    buildDocReviewQuerySql,
    parseDocReviewItem,
    buildDocReviewAttrs,
    buildDocSnoozeAttrs,
    buildDocRemoveAttrs,
    buildDocInitialAttrs,
    formatCompactDate,
    parseDateString,
} from "../src/core/document-review";

import {
    parseHeadingLevel,
    extractAncestorHeadingsByStack,
} from "../src/core/heading-hierarchy";

import {
    resolveBreadcrumbsFromHeadingNodes,
    cleanTitleText,
} from "../src/core/review-breadcrumbs";

describe("T7880 - 第一期核心功能纯逻辑验收套件", () => {
    describe("功能一：RemNote 风格列表阶梯展开卡 (Sequence Progressive Card)", () => {
        it("isSequenceCard 正确识别块属性与 HTML 标记", () => {
            expect(isSequenceCard("", { "custom-lv-card-type": "sequence" })).toBe(true);
            expect(isSequenceCard('<div custom-lv-card-type="sequence">...</div>')).toBe(true);
            expect(isSequenceCard('<div data-lv-card-type="sequence">...</div>')).toBe(true);
            expect(isSequenceCard("<p>普通段落</p>", {})).toBe(false);
            expect(isSequenceCard("", null)).toBe(false);
        });

        it("parseSequenceCard 正确解析多项列表与超级块", () => {
            const listHtml = `
            <div data-node-id="block-list-1" data-type="NodeList" class="list">
                <div data-node-id="item-1" data-type="NodeListItem" class="li">要点 1：原子性</div>
                <div data-node-id="item-2" data-type="NodeListItem" class="li">要点 2：一致性</div>
                <div data-node-id="item-3" data-type="NodeListItem" class="li">要点 3：隔离性</div>
                <div data-node-id="item-4" data-type="NodeListItem" class="li">要点 4：持久性</div>
            </div>`;

            const model = parseSequenceCard(listHtml, "数据库事务的 ACID 特征是什么？", "card-1");
            expect(model.questionTitle).toBe("数据库事务的 ACID 特征是什么？");
            expect(model.totalCount).toBe(4);
            expect(model.revealedCount).toBe(0);
            expect(model.isFullyRevealed).toBe(false);
            expect(model.items[0].status).toBe("active");
            expect(model.items[1].status).toBe("hidden");
            expect(model.items[2].status).toBe("hidden");
            expect(model.items[3].status).toBe("hidden");
        });

        it("advanceSequenceStep 步进状态机转移测试", () => {
            const listHtml = `
            <div data-node-id="block-list-2" data-type="NodeList">
                <div data-type="NodeListItem">步骤 A</div>
                <div data-type="NodeListItem">步骤 B</div>
                <div data-type="NodeListItem">步骤 C</div>
            </div>`;

            let model = parseSequenceCard(listHtml, "三步走战略", "card-2");
            expect(model.revealedCount).toBe(0);
            expect(model.isFullyRevealed).toBe(false);

            // 步进第 1 次
            model = advanceSequenceStep(model);
            expect(model.revealedCount).toBe(1);
            expect(model.items[0].status).toBe("revealed");
            expect(model.items[1].status).toBe("active");
            expect(model.items[2].status).toBe("hidden");
            expect(model.isFullyRevealed).toBe(false);

            // 步进第 2 次
            model = advanceSequenceStep(model);
            expect(model.revealedCount).toBe(2);
            expect(model.items[0].status).toBe("revealed");
            expect(model.items[1].status).toBe("revealed");
            expect(model.items[2].status).toBe("active");
            expect(model.isFullyRevealed).toBe(false);

            // 步进第 3 次（最后一项揭晓）
            model = advanceSequenceStep(model);
            expect(model.revealedCount).toBe(3);
            expect(model.isFullyRevealed).toBe(true);
            expect(model.items.every(it => it.status === "revealed")).toBe(true);
        });

        it("revealAllSequence 与 resetSequenceProgress 状态转换", () => {
            const listHtml = `
            <ul>
                <li>第 1 点</li>
                <li>第 2 点</li>
            </ul>`;
            let model = parseSequenceCard(listHtml, "两点论", "card-3");
            model = revealAllSequence(model);
            expect(model.isFullyRevealed).toBe(true);
            expect(model.revealedCount).toBe(2);

            model = resetSequenceProgress(model);
            expect(model.isFullyRevealed).toBe(false);
            expect(model.revealedCount).toBe(0);
            expect(model.items[0].status).toBe("active");
        });

        it("markSequenceItem 自测打标功能", () => {
            const listHtml = `<ul><li>A</li><li>B</li></ul>`;
            let model = parseSequenceCard(listHtml, "AB", "card-4");
            model = markSequenceItem(model, 0, true);
            model = markSequenceItem(model, 1, false);

            expect(model.items[0].markedCorrect).toBe(true);
            expect(model.items[1].markedCorrect).toBe(false);
        });
    });

    describe("功能二：Obsidian SR 风格整篇文档间隔温故 (Document Review)", () => {
        it("calculateDocNextSchedule 间隔递增数学模型与极值截断", () => {
            const today = new Date(2026, 10, 16, 12, 0, 0);

            // 评 1 (Again)：间隔重置为 1 天，reps 归 0，ease 扣减
            const r1 = calculateDocNextSchedule(1, 14, 5, 2.5, today);
            expect(r1.nextInterval).toBe(1);
            expect(r1.nextReps).toBe(0);
            expect(r1.nextEase).toBe(2.3);

            // 首轮评 3 (Good) -> 间隔 2 天，reps = 1
            const rGood1 = calculateDocNextSchedule(3, 1, 0, 2.5, today);
            expect(rGood1.nextInterval).toBe(2);
            expect(rGood1.nextReps).toBe(1);

            // 第二轮评 3 (Good) -> 间隔 6 天，reps = 2
            const rGood2 = calculateDocNextSchedule(3, 2, 1, 2.5, today);
            expect(rGood2.nextInterval).toBe(6);
            expect(rGood2.nextReps).toBe(2);

            // 第三轮评 3 (Good) -> 间隔 6 * 2.5 = 15 天
            const rGood3 = calculateDocNextSchedule(3, 6, 2, 2.5, today);
            expect(rGood3.nextInterval).toBe(15);
            expect(rGood3.nextReps).toBe(3);

            // 极值截断：上限 365 天
            const rMax = calculateDocNextSchedule(4, 300, 10, 3.0, today);
            expect(rMax.nextInterval).toBe(365);
        });

        it("属性序列化与反序列化", () => {
            const today = new Date(2026, 10, 16, 12, 0, 0);
            const initAttrs = buildDocInitialAttrs(today, 1);
            expect(initAttrs["custom-lv-note-review"]).toBe("true");
            expect(initAttrs["custom-lv-note-interval"]).toBe("1");
            expect(initAttrs["custom-lv-note-reps"]).toBe("0");

            const item = parseDocReviewItem({
                id: "doc-123",
                content: "操作系统原理复习纲要",
                hpath: "/大学课业/计算机/操作系统原理",
                ial: '{: custom-lv-note-review="true" custom-lv-note-interval="7" custom-lv-note-reps="2" custom-lv-note-ease="2.5" custom-lv-note-last-review="20261109"}',
            }, today);

            expect(item.docId).toBe("doc-123");
            expect(item.title).toBe("操作系统原理复习纲要");
            expect(item.intervalDays).toBe(7);
            expect(item.reps).toBe(2);

            // 当 ial 为 Object 对象时安全解析
            const itemObj = parseDocReviewItem({
                id: "doc-124",
                content: "数据结构",
                hpath: "/计算机/数据结构",
                ial: {
                    "custom-lv-note-review": "true",
                    "custom-lv-note-interval": "14",
                    "custom-lv-note-reps": "3",
                    "custom-lv-note-ease": "2.6",
                    "custom-lv-note-last-review": "20261102"
                },
            }, today);
            expect(itemObj.intervalDays).toBe(14);
            expect(itemObj.reps).toBe(3);
            expect(itemObj.ease).toBe(2.6);
            expect(item.isDue).toBe(true);

            // 延期 7 天属性
            const snoozeAttrs = buildDocSnoozeAttrs(item, 7, today);
            expect(snoozeAttrs["custom-lv-note-interval"]).toBe("14");

            // 移出属性
            const removeAttrs = buildDocRemoveAttrs();
            expect(removeAttrs["custom-lv-note-review"]).toBe("");
        });

        it("buildDocReviewQuerySql 生成标准 SQL", () => {
            const sql = buildDocReviewQuerySql();
            expect(sql).toContain("SELECT id, content, hpath, ial");
            expect(sql).toContain("type = 'd'");
            expect(sql).toContain('custom-lv-note-review="true"');
        });
    });

    describe("功能三：大纲层级单调栈与面包屑语境 (Outline Context)", () => {
        it("parseHeadingLevel 正确识别思源标题级别", () => {
            expect(parseHeadingLevel("h1")).toBe(1);
            expect(parseHeadingLevel("h2")).toBe(2);
            expect(parseHeadingLevel("h6")).toBe(6);
            expect(parseHeadingLevel("unknown")).toBe(1);
        });

        it("extractAncestorHeadingsByStack 单调栈推导自顶向下父级大纲链", () => {
            const headings = [
                { id: "h-1", subtype: "h1", content: "第一章 算法概论", sort: 10 },
                { id: "h-2", subtype: "h2", content: "1.1 复杂度分析", sort: 20 },
                { id: "h-3", subtype: "h3", content: "1.1.1 渐进表示法", sort: 30 },
                // 兄弟节点或同级后继，应替换前一个 h3
                { id: "h-4", subtype: "h3", content: "1.1.2 主定理", sort: 40 },
            ];

            const chain = extractAncestorHeadingsByStack(headings);
            expect(chain.length).toBe(3);
            expect(chain[0].id).toBe("h-1");
            expect(chain[1].id).toBe("h-2");
            expect(chain[2].id).toBe("h-4");
            expect(chain[2].title).toBe("1.1.2 主定理");
        });

        it("resolveBreadcrumbsFromHeadingNodes 通道1内核原生大纲转面包屑", () => {
            const nodes = [
                { id: "doc-root", level: 1, title: "数据结构笔记", sort: 0 },
                { id: "h-tree", level: 2, title: "二叉树", sort: 0 },
                { id: "h-avl", level: 3, title: "平衡二叉树", sort: 0 },
            ];

            const res = resolveBreadcrumbsFromHeadingNodes("card-test", nodes);
            expect(res.currentBreadcrumbs).toBeTruthy();
            expect(res.currentHPath).toBe("数据结构笔记 › 二叉树 › 平衡二叉树");
            expect(res.currentBreadcrumbs?.nodes.length).toBe(3);
            expect(res.currentBreadcrumbs?.nodes[0].displayTitle).toBe("数据结构笔记");
        });
    });
});
