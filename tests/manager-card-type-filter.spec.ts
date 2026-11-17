import { describe, expect, it } from "vitest";

describe("闪卡管理器卡型过滤逻辑契约", () => {
    it("正确根据卡片内容特征过滤大纲挖空与超级块卡片", () => {
        const mockBlocks = [
            {
                id: "b1",
                content: '<div data-type="NodeList"><ul><li data-type="NodeListItem">法律规则包含假定条件与<span data-type="mark" class="lv-masked">法律后果</span></li></ul></div>',
            },
            {
                id: "b2",
                content: '<div data-type="NodeSuperBlock">{{{col <div>问题</div> <div>答案</div> }}}</div>',
            },
            {
                id: "b3",
                content: '<p>普通笔记卡片正文，无大纲挖空无超级块</p>',
            },
            {
                id: "b4",
                content: '<p custom-riff-title="什么是光合作用？">光合作用是绿色植物利用光能制造有机物的过程。</p>',
                "custom-riff-title": "什么是光合作用？",
            },
        ];

        // 过滤大纲挖空
        const outlineCards = mockBlocks.filter(b => 
            (b.content.includes("NodeList") || b.content.includes("<ul") || b.content.includes("<ol") || b.content.includes("NodeListItem")) &&
            (b.content.includes("lv-masked") || b.content.includes('data-type="mark"'))
        );
        expect(outlineCards.length).toBe(1);
        expect(outlineCards[0].id).toBe("b1");

        // 过滤超级块
        const superBlockCards = mockBlocks.filter(b =>
            b.content.includes("NodeSuperBlock") || b.content.includes('data-type="NodeSuperBlock"') || b.content.includes("{{{col")
        );
        expect(superBlockCards.length).toBe(1);
        expect(superBlockCards[0].id).toBe("b2");

        // 过滤属性问答卡
        const attrQaCards = mockBlocks.filter(b =>
            Boolean((b as any)["custom-riff-title"] || (b as any)["custom-lv-question"] || b.content.includes("custom-riff-title"))
        );
        expect(attrQaCards.length).toBe(1);
        expect(attrQaCards[0].id).toBe("b4");
    });

    it("当 b.ial 为 Object 或 null/undefined 时不抛出 ial.includes is not a function 异常", () => {
        function blockMatchesAttr(b: any, attrName: string, expectedVal?: string): boolean {
            if (!b) return false;
            if (b[attrName] !== undefined && b[attrName] !== null) {
                return expectedVal !== undefined ? String(b[attrName]) === expectedVal : true;
            }
            if (b.ial && typeof b.ial === "object") {
                const val = b.ial[attrName];
                if (val !== undefined && val !== null) {
                    return expectedVal !== undefined ? String(val) === expectedVal : true;
                }
                try {
                    const raw = JSON.stringify(b.ial);
                    if (expectedVal) {
                        return raw.includes(`${attrName}="${expectedVal}"`) || raw.includes(`"${attrName}":"${expectedVal}"`);
                    }
                    return raw.includes(attrName);
                } catch { /* ignore */ }
            }
            if (typeof b.ial === "string") {
                if (expectedVal) {
                    return b.ial.includes(`${attrName}="${expectedVal}"`) || b.ial.includes(`${attrName}='${expectedVal}'`);
                }
                return b.ial.includes(attrName);
            }
            if (typeof b.content === "string") {
                if (expectedVal) {
                    return b.content.includes(`${attrName}="${expectedVal}"`);
                }
                return b.content.includes(attrName);
            }
            return false;
        }

        const blocksWithObjectIal = [
            { id: "b1", ial: { "custom-riff-decks": "d1", "custom-lv-card-type": "sequence" }, content: "列表项1" },
            { id: "b2", ial: { "custom-riff-decks": "d1", "custom-lv-note-review": "true" }, content: "文档内容" },
            { id: "b3", ial: null, content: "无 ial 块" },
            { id: "b4", ial: undefined, content: "未定义 ial 块" },
            { id: "b5", ial: 'custom-lv-card-type="sequence"', content: "字符串 ial 块" },
        ];

        // 验证 sequence 过滤绝不崩溃
        expect(() => {
            const seqs = blocksWithObjectIal.filter(b => blockMatchesAttr(b, "custom-lv-card-type", "sequence"));
            expect(seqs.length).toBe(2);
            expect(seqs.map(s => s.id)).toEqual(["b1", "b5"]);
        }).not.toThrow();

        // 验证 doc-review 过滤绝不崩溃
        expect(() => {
            const docs = blocksWithObjectIal.filter(b => blockMatchesAttr(b, "custom-lv-note-review", "true"));
            expect(docs.length).toBe(1);
            expect(docs[0].id).toBe("b2");
        }).not.toThrow();
    });
});
