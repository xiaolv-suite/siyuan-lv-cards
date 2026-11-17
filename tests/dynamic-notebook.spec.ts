import { describe, expect, it } from "vitest";
import { buildDynamicBoardMarkdown, DYNAMIC_BOARD_DOC_PATH } from "../src/core/dynamic-notebook";

describe("dynamic-notebook 动态看板与错题本文档生成", () => {
    it("生成符合思源原生 SQL 嵌入块语法的文档 Markdown", () => {
        const md = buildDynamicBoardMarkdown();
        expect(md).toContain("# ⚡ 小驴闪卡 · 动态看板与错题本");
        expect(md).toContain("## ⚠️ 疑难错题卡");
        expect(md).toContain("custom-lv-leech=\"true\"");
        expect(md).toContain("## ⭐ 重点星标卡");
        expect(md).toContain("custom-lv-starred=\"true\"");
        expect(md).toContain("## ❌ 认知错因归因卡");
        expect(md).toContain("custom-lv-error-reason=\"");
        expect(md).toContain("{{SELECT * FROM blocks WHERE");
        expect(DYNAMIC_BOARD_DOC_PATH).toBe("小驴闪卡/闪卡动态看板与错题本");
    });

    it("支持国际化标题与说明参数", () => {
        const md = buildDynamicBoardMarkdown({
            dynamicBoard: {
                title: "Flashcard Dynamic Dashboard",
                note: "Real-time SQL aggregation",
            },
        });
        expect(md).toContain("# ⚡ Flashcard Dynamic Dashboard");
        expect(md).toContain("Real-time SQL aggregation");
    });
});
