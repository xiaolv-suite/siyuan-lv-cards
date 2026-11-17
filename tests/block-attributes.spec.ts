import { describe, expect, it } from "vitest";
import {
    ATTR_LV_ERROR_REASON,
    ATTR_LV_LEECH,
    ATTR_LV_LAPSES,
    ATTR_LV_SOURCE_BLOCK,
    ATTR_LV_SOURCE_DOC,
    ATTR_LV_STARRED,
    ATTR_RIFF_TITLE,
    ATTR_LV_QUESTION,
    ATTR_CARD_TITLE,
    attachCardSourceBacklink,
    buildCardSourceBacklink,
    buildErrorReasonAttrs,
    buildLeechAttrs,
    buildSourceLinkAttrs,
    buildStarredAttrs,
    hasCardSourceBacklink,
    extractCardQuestionAttr,
    buildCardQuestionAttrs,
} from "../src/core/block-attributes";

describe("block-attributes 思源块属性与来源反链规约", () => {
    it("构建星标属性补丁（点亮为 true，取消设为空串以清除）", () => {
        expect(buildStarredAttrs(true)).toEqual({ [ATTR_LV_STARRED]: "true" });
        expect(buildStarredAttrs(false)).toEqual({ [ATTR_LV_STARRED]: "" });
    });

    it("构建水蛭疑难卡属性补丁（记录 lapses 次数与标记）", () => {
        expect(buildLeechAttrs(true, 5)).toEqual({
            [ATTR_LV_LEECH]: "true",
            [ATTR_LV_LAPSES]: "5",
        });
        expect(buildLeechAttrs(false, 0)).toEqual({
            [ATTR_LV_LEECH]: "",
            [ATTR_LV_LAPSES]: "",
        });
        expect(buildLeechAttrs(true)).toEqual({
            [ATTR_LV_LEECH]: "true",
        });
    });

    it("构建错因归因属性补丁", () => {
        expect(buildErrorReasonAttrs("concept-confusion")).toEqual({
            [ATTR_LV_ERROR_REASON]: "concept-confusion",
        });
    });

    it("构建来源血缘属性补丁", () => {
        expect(buildSourceLinkAttrs("doc-123", "block-456")).toEqual({
            [ATTR_LV_SOURCE_DOC]: "doc-123",
            [ATTR_LV_SOURCE_BLOCK]: "block-456",
        });
        expect(buildSourceLinkAttrs("doc-123")).toEqual({
            [ATTR_LV_SOURCE_DOC]: "doc-123",
        });
        expect(buildSourceLinkAttrs()).toEqual({});
    });

    it("正确生成与判断思源原生反链引用语法", () => {
        const backlink = buildCardSourceBacklink("20261031-abcdef", "量子力学导论");
        expect(backlink).toBe('\n\n> 来源：(( 20261031-abcdef "量子力学导论" ))');

        expect(hasCardSourceBacklink("这是卡片内容" + backlink)).toBe(true);
        expect(hasCardSourceBacklink("普通卡片无反链 ==答案==")).toBe(false);
    });

    it("为普通卡片附加反链，且不重复附加，超级块不破坏语法结构", () => {
        const original = "DNA 的全称是什么？ ==脱氧核糖核酸==";
        const attached = attachCardSourceBacklink(original, "doc-999", "生物必修一");
        expect(attached).toContain("> 来源：(( doc-999 \"生物必修一\" ))");

        // 已经包含反链的不再重复追加
        const reAttached = attachCardSourceBacklink(attached, "doc-999", "生物必修一");
        expect(reAttached).toBe(attached);

        // 超级块语法保持完整闭合
        const superblock = "{{{col\n问题\n\n答案\n}}}";
        expect(attachCardSourceBacklink(superblock, "doc-999", "生物")).toBe(superblock);
    });

    it("构建与提取免侵入闪卡问题属性补丁（custom-riff-title 与闪卡工具箱保持互通）", () => {
        expect(buildCardQuestionAttrs("什么是光合作用？")).toEqual({
            [ATTR_RIFF_TITLE]: "什么是光合作用？",
        });
        expect(buildCardQuestionAttrs("")).toEqual({
            [ATTR_RIFF_TITLE]: "",
        });

        // 提取属性：优先 custom-riff-title，兼容 custom-lv-question 与 custom-card-title
        expect(extractCardQuestionAttr({ [ATTR_RIFF_TITLE]: "问题 A" })).toBe("问题 A");
        expect(extractCardQuestionAttr({ [ATTR_LV_QUESTION]: "问题 B" })).toBe("问题 B");
        expect(extractCardQuestionAttr({ [ATTR_CARD_TITLE]: "问题 C" })).toBe("问题 C");
        expect(extractCardQuestionAttr({ [ATTR_RIFF_TITLE]: "问题 A", [ATTR_LV_QUESTION]: "问题 B" })).toBe("问题 A");
        expect(extractCardQuestionAttr(null)).toBe("");
        expect(extractCardQuestionAttr({})).toBe("");
    });
});
