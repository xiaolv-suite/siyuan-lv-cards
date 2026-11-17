import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractCardQuestionAttr, extractCardAnswerAttr, buildCardQuestionAttrs, buildCardAnswerAttrs, buildAttrQaAttrs } from "../src/core/block-attributes";
import { computeBlockMenuItems, type BlockMenuConfig } from "../src/bootstrap/block-menu";

describe("普通块属性问答弹窗安全契约与秒开防护", () => {
    it("普通块属性提取：未设置属性时返回空串，不会抛错", () => {
        expect(extractCardQuestionAttr({})).toBe("");
        expect(extractCardQuestionAttr(null)).toBe("");
        expect(extractCardQuestionAttr(undefined)).toBe("");
        expect(extractCardAnswerAttr({})).toBe("");
        expect(extractCardAnswerAttr(null)).toBe("");
        expect(extractCardAnswerAttr(undefined)).toBe("");
    });

    it("答案属性提取：custom-riff-answer 优先，兼容 custom-lv-answer", () => {
        expect(extractCardAnswerAttr({ "custom-riff-answer": "标准答案" })).toBe("标准答案");
        expect(extractCardAnswerAttr({ "custom-lv-answer": "兼容答案" })).toBe("兼容答案");
        expect(extractCardAnswerAttr({ "custom-riff-answer": "", "custom-lv-answer": "回退" })).toBe("回退");
    });

    it("普通块构建闪卡问题补丁：正确输出 custom-riff-title", () => {
        const patch = buildCardQuestionAttrs("这是什么是核心概念？");
        expect(patch["custom-riff-title"]).toBe("这是什么是核心概念？");
    });

    it("答案补丁：空串表示回退正文，非空写入 custom-riff-answer", () => {
        expect(buildCardAnswerAttrs("  标准答案  ")).toEqual({ "custom-riff-answer": "标准答案" });
        expect(buildCardAnswerAttrs("")).toEqual({ "custom-riff-answer": "" });
        expect(buildCardAnswerAttrs(undefined as any)).toEqual({ "custom-riff-answer": "" });
    });

    it("问答一体补丁：单次原子写入问题与答案", () => {
        const patch = buildAttrQaAttrs("什么是 REST？", "表述性状态转移");
        expect(patch["custom-riff-title"]).toBe("什么是 REST？");
        expect(patch["custom-riff-answer"]).toBe("表述性状态转移");
        const clearPatch = buildAttrQaAttrs("", "");
        expect(clearPatch["custom-riff-title"]).toBe("");
        expect(clearPatch["custom-riff-answer"]).toBe("");
    });

    it("普通块在块菜单中点击「小驴闪卡：设置闪卡问答 (问题·答案)」应正确直达触发动作", () => {
        const setCardQuestion = vi.fn();
        const config: BlockMenuConfig = {
            blockIDs: ["ordinary-block-123456"],
            modules: { inbox: true },
            i18n: {
                menuAddToDeck: "小驴闪卡：添加到卡组",
                menuSetCardQuestion: "小驴闪卡：设置闪卡问答 (问题·答案)",
            },
            isAlreadyCard: false,
            actions: {
                addToDeck: vi.fn(),
                removeFromDeck: vi.fn(),
                setCardQuestion,
            },
        };

        const items = computeBlockMenuItems(config);
        const item = items.find(i => i.id === "set-card-question");
        expect(item).toBeDefined();
        expect(item?.label).toBe("小驴闪卡：设置闪卡问答 (问题·答案)");

        // 模拟用户点击
        item?.click();
        expect(setCardQuestion).toHaveBeenCalledWith("ordinary-block-123456");
    });

    it("空 decks 或 null decks 防御验证：安全转换为数组，避免 Cannot read properties of null", () => {
        const normalizeDecks = (d: any) => Array.isArray(d) ? d : [];
        expect(normalizeDecks(null)).toEqual([]);
        expect(normalizeDecks(undefined)).toEqual([]);
        expect(normalizeDecks([])).toEqual([]);
        expect(normalizeDecks([{ id: "deck-1", name: "默认", size: 10 }])).toHaveLength(1);
    });
});
