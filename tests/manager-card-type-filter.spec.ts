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
    });
});
