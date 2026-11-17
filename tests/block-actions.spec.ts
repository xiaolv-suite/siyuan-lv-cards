import { describe, expect, it } from "vitest";
import {
    BLOCK_ACTIONS,
    BLOCK_ACTION_GROUP_ORDER,
    BLOCK_KIND_LABELS,
    buildBlockActionMenu,
    groupBlockActions,
    hasBlockActions,
    inferBlockKindFromElement,
    readActionUsage,
    recordActionUsage,
    resetActionUsage,
    resolveBlockActions,
} from "../src/core/block-actions";

describe("block-actions 块操作中心动作注册表与块特化", () => {
    const plainBlock = {
        blockID: "b-plain",
        blockKind: "paragraph" as const,
        isDocument: false,
        isCard: false,
        isDocReview: false,
        hasText: true,
        hasSelection: false,
    };

    const cardBlock = {
        ...plainBlock,
        blockID: "b-card",
        isCard: true,
    };

    const docBlock = {
        ...plainBlock,
        blockID: "b-doc",
        blockKind: "heading" as const,
        isDocument: true,
    };

    it("普通块：提供问答/加卡组/设打卡等基础能力，选区/图片/类型门禁动作默认隐藏", () => {
        const ids = resolveBlockActions(plainBlock, {}).map((a) => a.id);
        expect(ids).toContain("edit-card-qa");
        expect(ids).toContain("add-to-deck");
        expect(ids).toContain("bind-checkin-item");
        // 未划选文本时挖空制卡不出现（避免承诺兜底跳转的死端体验）
        expect(ids).not.toContain("make-cloze");
        // 无图片块不提供遮挡卡
        expect(ids).not.toContain("make-occlusion");
        // 已移除冗余预览项（与编辑问答打开同一工作台，且工作台已内置实时预览）
        expect(ids).not.toContain("preview-card-face");
        // 未入卡组时不提供移除
        expect(ids).not.toContain("remove-from-deck");
        // 包含思源原生高频增强动作
        expect(ids).toContain("focus-block");
        expect(ids).toContain("copy-embed-ref");
        expect(ids).toContain("toggle-fold-block");
        expect(ids).toContain("morph-block-type");
    });

    it("选区与图片门禁：块内划选解锁挖空制卡，含图块解锁遮挡卡", () => {
        const withSelection = resolveBlockActions({ ...plainBlock, hasSelection: true }, {}).map((a) => a.id);
        expect(withSelection).toContain("make-cloze");

        const withImage = resolveBlockActions({ ...plainBlock, hasImage: true }, {}).map((a) => a.id);
        expect(withImage).toContain("make-occlusion");
        expect(withImage).not.toContain("make-cloze");

        const withBoth = resolveBlockActions({ ...plainBlock, hasSelection: true, hasImage: true }, {}).map((a) => a.id);
        expect(withBoth).toContain("make-cloze");
        expect(withBoth).toContain("make-occlusion");
    });

    it("类型门禁：morph 仅限段落/待办，雷切工作台仅限代码块", () => {
        const headingIds = resolveBlockActions({ ...plainBlock, blockKind: "heading" }, {}).map((a) => a.id);
        expect(headingIds).not.toContain("morph-block-type");
        expect(headingIds).not.toContain("speedswitch-workbench");

        const codeIds = resolveBlockActions({ ...plainBlock, blockKind: "code" }, {}).map((a) => a.id);
        expect(codeIds).toContain("speedswitch-workbench");
        expect(codeIds).not.toContain("morph-block-type");

        const taskIds = resolveBlockActions({ ...plainBlock, blockKind: "task" }, {}).map((a) => a.id);
        expect(taskIds).toContain("morph-block-type");
    });

    it("已入卡组的块：追加「从卡组移除」且标记为破坏性动作", () => {
        const actions = resolveBlockActions(cardBlock, {});
        const remove = actions.find((a) => a.id === "remove-from-deck");
        expect(remove).toBeTruthy();
        expect(remove?.destructive).toBe(true);
    });

    it("动作注册表裁剪契约：冗余预览与不可达文档温故项已移除", () => {
        const ids = BLOCK_ACTIONS.map((a) => a.id);
        // 与编辑问答打开同一工作台的重复入口
        expect(ids).not.toContain("preview-card-face");
        // 胶囊永远挂在内容块上，isDocument 不可达；文档温故真实入口在文档树右键菜单
        expect(ids).not.toContain("add-doc-review");
        expect(ids).not.toContain("remove-doc-review");
    });

    it("跨插件动作：支持 8 大生态插件探测，未安装时安全隐藏，未知时保留", () => {
        // 未知（undefined）：保留
        const unknownIds = resolveBlockActions(plainBlock, {}).map((a) => a.id);
        expect(unknownIds).toContain("to-exam-question");
        expect(unknownIds).toContain("add-memo");
        expect(unknownIds).toContain("to-glean-library");
        expect(unknownIds).toContain("bind-checkin-item");
        expect(unknownIds).toContain("capture-quote-common");
        expect(unknownIds).toContain("contacts-interaction");

        // 确认未安装：全部隐藏
        const absentIds = resolveBlockActions(plainBlock, {
            exam: false,
            home: false,
            glean: false,
            checkin: false,
            common: false,
            contacts: false,
            raikiri: false,
        }).map((a) => a.id);
        expect(absentIds).not.toContain("to-exam-question");
        expect(absentIds).not.toContain("exam-ai-generate");
        expect(absentIds).not.toContain("add-memo");
        expect(absentIds).not.toContain("to-glean-library");
        expect(absentIds).not.toContain("bind-checkin-item");
        expect(absentIds).not.toContain("capture-quote-common");
        expect(absentIds).not.toContain("contacts-interaction");
        expect(absentIds).not.toContain("speedswitch-workbench");
    });

    it("空块：不提供依赖文本的动作（AI 出题/转试题/复制文本/记备忘/设打卡/存金句）", () => {
        const emptyIds = resolveBlockActions({ ...plainBlock, hasText: false }, {}).map((a) => a.id);
        expect(emptyIds).not.toContain("to-exam-question");
        expect(emptyIds).not.toContain("exam-ai-generate");
        expect(emptyIds).not.toContain("copy-plain-text");
        expect(emptyIds).not.toContain("add-memo");
        expect(emptyIds).not.toContain("bind-checkin-item");
        expect(emptyIds).not.toContain("capture-quote-common");
        // 不依赖文本的能力仍在
        expect(emptyIds).toContain("edit-card-qa");
        expect(emptyIds).toContain("copy-block-ref");
    });

    it("多选批量模式（batchBlockIDs > 1）：自动过滤单块专属动作，仅保留支持批量的动作", () => {
        const batchBlock = {
            ...plainBlock,
            batchBlockIDs: ["b-1", "b-2", "b-3"],
        };
        const batchActions = resolveBlockActions(batchBlock, {});
        const ids = batchActions.map((a) => a.id);

        expect(ids).toContain("add-to-deck");
        expect(ids).toContain("add-to-inbox");
        expect(ids).toContain("to-exam-question");
        expect(ids).toContain("copy-block-ref");
        expect(ids).toContain("copy-embed-ref");
        expect(ids).toContain("copy-plain-text");
        expect(ids).toContain("bind-checkin-item");

        // 单块专属动作排除
        expect(ids).not.toContain("edit-card-qa");
        expect(ids).not.toContain("preview-card-face");
        expect(ids).not.toContain("make-cloze");
        expect(ids).not.toContain("make-occlusion");
        expect(ids).not.toContain("focus-block");
        expect(ids).not.toContain("toggle-fold-block");
        expect(ids).not.toContain("morph-block-type");
        expect(ids).not.toContain("exam-ai-generate");
        expect(ids).not.toContain("to-glean-library");
        expect(ids).not.toContain("add-memo");
    });

    it("块类型特化与排序：代码块排除遮挡卡，引述块置顶金句资产，待办置顶打卡项", () => {
        // 1. 代码块
        const codeActions = resolveBlockActions({ ...plainBlock, blockKind: "code" }, {});
        const codeIds = codeActions.map((a) => a.id);
        expect(codeIds).not.toContain("make-occlusion"); // 代码块排除遮挡卡
        expect(codeIds).toContain("speedswitch-workbench"); // 包含雷切工作台

        // 2. 引述金句块
        const quoteActions = resolveBlockActions({ ...plainBlock, blockKind: "quote" }, {});
        const quoteIds = quoteActions.map((a) => a.id);
        expect(quoteIds).toContain("capture-quote-common");
        // capture-quote-common 适合 quote，排在同类知识流转动作前列
        expect(quoteIds.indexOf("capture-quote-common")).toBeLessThan(quoteIds.indexOf("add-to-inbox"));

        // 3. 待办块
        const taskActions = resolveBlockActions({ ...plainBlock, blockKind: "task" }, {});
        const taskIds = taskActions.map((a) => a.id);
        expect(taskIds[taskIds.indexOf("bind-checkin-item")]).toBe("bind-checkin-item");
        expect(taskIds.indexOf("bind-checkin-item")).toBeLessThan(taskIds.indexOf("add-memo"));
    });

    it("inferBlockKindFromElement 能够准确推导思源各块类型的 DOM", () => {
        const createEl = (type: string, subtype = "", cls = "", innerHtml = "") => {
            const el = document.createElement("div");
            if (type) el.setAttribute("data-type", type);
            if (subtype) el.setAttribute("data-subtype", subtype);
            if (cls) el.className = cls;
            if (innerHtml) el.innerHTML = innerHtml;
            return el;
        };

        expect(inferBlockKindFromElement(createEl("NodeCodeBlock"))).toBe("code");
        expect(inferBlockKindFromElement(createEl("NodeBlockquote"))).toBe("quote");
        expect(inferBlockKindFromElement(createEl("NodeTable"))).toBe("table");
        expect(inferBlockKindFromElement(createEl("NodeHeading", "h2"))).toBe("heading");
        expect(inferBlockKindFromElement(createEl("NodeListItem", "t"))).toBe("task");
        expect(inferBlockKindFromElement(createEl("NodeList", "u"))).toBe("list");
        expect(inferBlockKindFromElement(createEl("NodeParagraph"))).toBe("paragraph");
        expect(inferBlockKindFromElement(null)).toBe("paragraph");
    });

    it("BLOCK_KIND_LABELS 为每类块定义了优雅的专属引导文案", () => {
        expect(BLOCK_KIND_LABELS.code.actionLead).toBe("代码助手");
        expect(BLOCK_KIND_LABELS.task.actionLead).toBe("待办任务");
        expect(BLOCK_KIND_LABELS.quote.actionLead).toBe("摘录金句");
        expect(BLOCK_KIND_LABELS.heading.actionLead).toBe("章节大纲");
        expect(BLOCK_KIND_LABELS.paragraph.actionLead).toBe("块助手");
    });

    it("使用频次自适应：同优先级内高频动作浮到前面（本地习惯学习，零污染）", () => {
        // 记录器：写入累计
        localStorage.clear();
        recordActionUsage("edit-card-qa");
        recordActionUsage("edit-card-qa");
        recordActionUsage("copy-block-ref");
        const usage = readActionUsage();
        expect(usage["edit-card-qa"]).toBe(2);
        expect(usage["copy-block-ref"]).toBe(1);

        // 显式注入频次（纯函数契约）：无 pinned、同优先级下高频 copy-block-ref 排到 focus-block 之前
        const freqIds = resolveBlockActions(plainBlock, {}, undefined, BLOCK_ACTIONS, [], { "copy-block-ref": 30, "focus-block": 3 }).map((a) => a.id);
        expect(freqIds.indexOf("copy-block-ref")).toBeLessThan(freqIds.indexOf("focus-block"));

        // 频次为零时不改变默认序：focus-block 仍在 copy-block-ref 之前（native 组声明序）
        const defaultIds = resolveBlockActions(plainBlock, {}, undefined, BLOCK_ACTIONS, [], {}).map((a) => a.id);
        expect(defaultIds.indexOf("focus-block")).toBeLessThan(defaultIds.indexOf("copy-block-ref"));

        // 频次不越过块类型偏好：段落块上 preferred 的动作依旧优先于高频非偏好动作
        const prefIds = resolveBlockActions({ ...plainBlock, blockKind: "code" }, {}, undefined, BLOCK_ACTIONS, [], { "copy-block-ref": 100, "speedswitch-workbench": 1 }).map((a) => a.id);
        expect(prefIds.indexOf("speedswitch-workbench")).toBeLessThan(prefIds.indexOf("copy-block-ref"));

        resetActionUsage();
        expect(readActionUsage()).toEqual({});
    });

    it("用户偏好配置：支持 disabledActionIds 禁用与 pinnedActionIds 置顶排序", () => {
        const disabledIds = resolveBlockActions(plainBlock, {}, {
            disabledActionIds: ["make-occlusion", "to-glean-library"],
        }).map((a) => a.id);
        expect(disabledIds).not.toContain("make-occlusion");
        expect(disabledIds).not.toContain("to-glean-library");
        expect(disabledIds).toContain("edit-card-qa");

        const pinnedActions = resolveBlockActions(plainBlock, {}, {
            pinnedActionIds: ["bind-checkin-item", "copy-block-ref"],
        });
        const pinnedIds = pinnedActions.map((a) => a.id);
        expect(pinnedIds[0]).toBe("bind-checkin-item");
        expect(pinnedIds[1]).toBe("copy-block-ref");
    });

    it("分组聚合：按固定顺序输出且丢弃空分组", () => {
        const sections = buildBlockActionMenu(plainBlock, {});
        const groups = sections.map((s) => s.group);
        expect(groups).toEqual(["flashcard", "native", "knowledge", "time", "clipboard"]);

        for (const section of sections) {
            expect(section.actions.length).toBeGreaterThan(0);
        }
        const expectedOrder = BLOCK_ACTION_GROUP_ORDER.filter((g) => groups.includes(g));
        expect(groups).toEqual([...expectedOrder]);
    });

    it("hasBlockActions：任何块至少有一个可用动作，胶囊 ▾ 永不打开空菜单", () => {
        expect(hasBlockActions(plainBlock, {})).toBe(true);
        expect(hasBlockActions(cardBlock, {})).toBe(true);
        expect(hasBlockActions(docBlock, {})).toBe(true);
    });
});
