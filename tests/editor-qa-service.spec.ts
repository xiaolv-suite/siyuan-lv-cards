import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    decorateEditorBlock,
    startEditorQaService,
    setActiveSelectedBlock,
    getActiveSelectedBlock,
} from "../src/core/editor-qa-service";

describe("editor-qa-service 免侵入属性问答卡编辑器服务", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = "";
        vi.clearAllMocks();
    });

    it("为包含 custom-riff-title 的块添加 data-custom-title 并注入编辑按钮", () => {
        const block = document.createElement("div");
        block.setAttribute("data-node-id", "b-101");
        block.setAttribute("custom-riff-title", "什么是二分查找？");
        block.setAttribute("custom-riff-decks", "deck-1");

        const content = document.createElement("div");
        content.contentEditable = "true";
        content.textContent = "在有序数组中折半查找目标值的算法。";
        block.appendChild(content);

        const attr = document.createElement("div");
        attr.className = "protyle-attr";
        block.appendChild(attr);

        document.body.appendChild(block);

        const onEdit = vi.fn();
        decorateEditorBlock(block, onEdit);

        // 验证 data-custom-title 已挂载到内容元素
        expect(content.getAttribute("data-custom-title")).toBe("什么是二分查找？");

        // 验证编辑按钮注入到 .protyle-attr（一体化胶囊，带 data-lv-card-attr-btn 标识）
        const btn = attr.querySelector(".lv-card-badge-pill") as HTMLButtonElement;
        expect(btn).toBeDefined();
        expect(btn.getAttribute("data-lv-card-attr-btn")).toBe("1");
        expect(btn.querySelector("svg")).toBeTruthy();
        // 回归防护（2026-11-16）：胶囊严禁复用旧类名 lv-cards-attr-edit-btn——
        // index.scss 为隐藏历史独立按钮写了 display:none !important，复用会让序号与编辑入口整体消失。
        expect(btn.classList.contains("lv-cards-attr-edit-btn")).toBe(false);

        // 点击按钮触发回调（带防穿透宏任务微延时）
        btn.click();
        vi.advanceTimersByTime(60);
        expect(onEdit).toHaveBeenCalledWith("b-101");
    });

    it("普通块（无闪卡属性）也能注入可用入口胶囊，点击即可打开问答弹窗", () => {
        const block = document.createElement("div");
        block.setAttribute("data-node-id", "b-plain");
        block.setAttribute("data-type", "NodeParagraph");

        const content = document.createElement("div");
        content.contentEditable = "true";
        content.textContent = "一条普通笔记正文。";
        block.appendChild(content);

        const attr = document.createElement("div");
        attr.className = "protyle-attr";
        block.appendChild(attr);

        document.body.appendChild(block);

        const onEdit = vi.fn();
        decorateEditorBlock(block, onEdit);

        const btn = attr.querySelector(".lv-card-badge-pill") as HTMLButtonElement;
        expect(btn).toBeTruthy();
        expect(btn.classList.contains("lv-card-badge-pill--ordinary")).toBe(true);
        expect(btn.classList.contains("lv-lv-cards-attr-edit-btn")).toBe(false);
        expect(btn.classList.contains("lv-cards-attr-edit-btn")).toBe(false);
        // 普通段落块自适应显示「块助手」，引导用户点击更多操作
        expect(btn.textContent).toContain("块助手");

        btn.click();
        vi.advanceTimersByTime(60);
        expect(onEdit).toHaveBeenCalledWith("b-plain");
    });

    it("代码块（NodeCodeBlock）胶囊自适应展示「代码助手」", () => {
        const block = document.createElement("div");
        block.setAttribute("data-node-id", "b-code");
        block.setAttribute("data-type", "NodeCodeBlock");

        const content = document.createElement("div");
        content.className = "code-block";
        content.textContent = "const x = 42;";
        block.appendChild(content);

        const attr = document.createElement("div");
        attr.className = "protyle-attr";
        block.appendChild(attr);
        document.body.appendChild(block);

        decorateEditorBlock(block, vi.fn());
        const btn = attr.querySelector(".lv-card-badge-pill") as HTMLButtonElement;
        expect(btn).toBeTruthy();
        expect(btn.textContent).toContain("代码助手");
        expect(btn.getAttribute("data-block-kind")).toBe("code");
    });

    it("当 custom-riff-title 清空时自动清除 data-custom-title", () => {
        const block = document.createElement("div");
        block.setAttribute("data-node-id", "b-102");
        block.setAttribute("custom-riff-decks", "deck-1");

        const content = document.createElement("div");
        content.contentEditable = "true";
        content.setAttribute("data-custom-title", "旧问题");
        content.textContent = "正文内容";
        block.appendChild(content);

        const onEdit = vi.fn();
        decorateEditorBlock(block, onEdit);

        expect(content.hasAttribute("data-custom-title")).toBe(false);
    });

    it("属性栏尚未渲染时返回 false（不得标记已装饰，保留重试机会）", () => {
        const block = document.createElement("div");
        block.setAttribute("data-node-id", "b-noattr");
        block.setAttribute("data-type", "NodeParagraph");
        // 故意不创建 .protyle-attr，模拟首屏渲染未完成
        document.body.appendChild(block);

        const onEdit = vi.fn();
        const ok = decorateEditorBlock(block, onEdit);
        expect(ok).toBe(false);
        expect(block.hasAttribute("data-lv-decorated")).toBe(false);

        // 属性栏后续渲染完成后，重试应当成功并注入胶囊
        const attr = document.createElement("div");
        attr.className = "protyle-attr";
        block.appendChild(attr);
        expect(decorateEditorBlock(block, onEdit)).toBe(true);
        expect(attr.querySelector(".lv-card-badge-pill")).toBeTruthy();
    });

    it("属性栏就绪时返回 true（可安全打已装饰标记）", () => {
        const block = document.createElement("div");
        block.setAttribute("data-node-id", "b-ready");
        block.appendChild(document.createElement("div"));
        const attr = document.createElement("div");
        attr.className = "protyle-attr";
        block.appendChild(attr);
        document.body.appendChild(block);

        expect(decorateEditorBlock(block, vi.fn())).toBe(true);
        expect(attr.querySelector(".lv-card-badge-pill")).toBeTruthy();
    });

    it("startEditorQaService 响应 flashcard-title-edit 事件并干净销毁", () => {
        const onEdit = vi.fn();
        const service = startEditorQaService({ onEditQuestion: onEdit });

        // 模拟外部触发事件
        document.dispatchEvent(new CustomEvent("flashcard-title-edit", {
            detail: { blockId: "block-999" },
        }));
        expect(onEdit).toHaveBeenCalledWith("block-999");

        // 销毁后事件不再触发
        service.dispose();
        document.dispatchEvent(new CustomEvent("flashcard-title-edit", {
            detail: { blockId: "block-888" },
        }));
        expect(onEdit).not.toHaveBeenCalledWith("block-888");
    });

    it("触屏路径（移动端无 hover 语义）：touchstart 即时装饰所触块的块助手胶囊", () => {
        // 模拟触屏环境（jsdom 无 ontouchstart，置入使 "ontouchstart" in window 成立）
        (window as any).ontouchstart = null;
        const service = startEditorQaService({ onEditQuestion: vi.fn(), onOpenBlockActions: vi.fn() });

        const wysiwyg = document.createElement("div");
        wysiwyg.className = "protyle-wysiwyg";
        document.body.appendChild(wysiwyg);

        const block = document.createElement("div");
        block.setAttribute("data-node-id", "b-touch");
        block.setAttribute("data-type", "NodeParagraph");
        const content = document.createElement("div");
        content.contentEditable = "true";
        content.textContent = "触屏点按装饰的正文。";
        block.appendChild(content);
        const attr = document.createElement("div");
        attr.className = "protyle-attr";
        block.appendChild(attr);
        wysiwyg.appendChild(block);

        // 模拟指尖触碰（target 落在内容元素上，事件冒泡到 document 监听）
        content.dispatchEvent(new Event("touchstart", { bubbles: true }));

        const btn = attr.querySelector(".lv-card-badge-pill") as HTMLButtonElement;
        expect(btn).toBeTruthy();
        expect(btn.textContent).toContain("块助手");
        expect(block.getAttribute("data-lv-decorated")).toBe("true");

        // 销毁后胶囊与标记一并清理
        service.dispose();
        expect(attr.querySelector(".lv-card-badge-pill")).toBeNull();
        expect(block.hasAttribute("data-lv-decorated")).toBe(false);
        delete (window as any).ontouchstart;
    });

    it("传入 onOpenBlockActions 时胶囊整体单击直接展开下拉菜单，双击直达问答工作台", () => {
        const block = document.createElement("div");
        block.setAttribute("data-node-id", "b-more");
        const attr = document.createElement("div");
        attr.className = "protyle-attr";
        block.appendChild(attr);
        document.body.appendChild(block);

        const onEdit = vi.fn();
        const onMore = vi.fn();
        decorateEditorBlock(block, onEdit, onMore);

        const pill = attr.querySelector(".lv-card-badge-pill") as HTMLElement;
        const more = pill.querySelector(".lv-card-badge-pill__more") as HTMLElement;
        expect(more).toBeTruthy();
        expect(more.textContent).toBe("▾");

        // 用户直觉设计：单击整颗胶囊直接展开下拉菜单
        pill.click();
        vi.advanceTimersByTime(80);
        expect(onMore).toHaveBeenCalledWith("b-more", pill);
        expect(onEdit).not.toHaveBeenCalled();

        // 双击胶囊极速直达问答弹窗工作台
        onMore.mockClear();
        pill.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        expect(onEdit).toHaveBeenCalledWith("b-more");
    });

    it("未传入 onOpenBlockActions 时保持纯编辑按钮形态（向后兼容）", () => {
        const block = document.createElement("div");
        block.setAttribute("data-node-id", "b-nomore");
        const attr = document.createElement("div");
        attr.className = "protyle-attr";
        block.appendChild(attr);
        document.body.appendChild(block);

        decorateEditorBlock(block, vi.fn());
        const pill = attr.querySelector(".lv-card-badge-pill") as HTMLElement;
        expect(pill).toBeTruthy();
        expect(pill.querySelector(".lv-card-badge-pill__more")).toBeNull();
        expect(pill.querySelector(".lv-card-badge-pill__divider")).toBeNull();
    });

    it("回调在后续调用中补上时，复用已有胶囊也能补渲染 ▾（无需重建节点）", () => {
        const block = document.createElement("div");
        block.setAttribute("data-node-id", "b-upgrade");
        const attr = document.createElement("div");
        attr.className = "protyle-attr";
        block.appendChild(attr);
        document.body.appendChild(block);

        // 首次无回调
        decorateEditorBlock(block, vi.fn());
        const pill = attr.querySelector(".lv-card-badge-pill") as HTMLElement;
        expect(pill.querySelector(".lv-card-badge-pill__more")).toBeNull();

        // 再次装饰时补上回调
        const onMore = vi.fn();
        decorateEditorBlock(block, vi.fn(), onMore);
        const more = pill.querySelector(".lv-card-badge-pill__more") as HTMLElement;
        expect(more).toBeTruthy();

        // 新回调必须真实生效（而非沿用旧的 undefined）
        more.click();
        expect(onMore).toHaveBeenCalledWith("b-upgrade", pill);
    });

    it("移动端选中块激活逻辑：setActiveSelectedBlock 确保同时仅有单个块具备 data-lv-selected", () => {
        const blockA = document.createElement("div");
        blockA.setAttribute("data-node-id", "b-a");
        document.body.appendChild(blockA);

        const blockB = document.createElement("div");
        blockB.setAttribute("data-node-id", "b-b");
        document.body.appendChild(blockB);

        setActiveSelectedBlock(blockA);
        expect(blockA.getAttribute("data-lv-selected")).toBe("true");
        expect(blockB.hasAttribute("data-lv-selected")).toBe(false);
        expect(getActiveSelectedBlock()).toBe(blockA);

        // 切换至块 B，块 A 的激活标记自动清除
        setActiveSelectedBlock(blockB);
        expect(blockA.hasAttribute("data-lv-selected")).toBe(false);
        expect(blockB.getAttribute("data-lv-selected")).toBe("true");
        expect(getActiveSelectedBlock()).toBe(blockB);

        // 置空时全部清理
        setActiveSelectedBlock(null);
        expect(blockA.hasAttribute("data-lv-selected")).toBe(false);
        expect(blockB.hasAttribute("data-lv-selected")).toBe(false);
        expect(getActiveSelectedBlock()).toBeNull();
    });

    it("触屏与焦点联动：点击或聚焦块时自动赋予 data-lv-selected，点击空白时清除", () => {
        (window as any).ontouchstart = null;
        const service = startEditorQaService({ onEditQuestion: vi.fn() });

        const wysiwyg = document.createElement("div");
        wysiwyg.className = "protyle-wysiwyg";
        document.body.appendChild(wysiwyg);

        const block = document.createElement("div");
        block.setAttribute("data-node-id", "b-focus-test");
        const editable = document.createElement("div");
        editable.contentEditable = "true";
        editable.textContent = "可编辑段落";
        block.appendChild(editable);
        const attr = document.createElement("div");
        attr.className = "protyle-attr";
        block.appendChild(attr);
        wysiwyg.appendChild(block);

        // 触发 touchstart
        editable.dispatchEvent(new Event("touchstart", { bubbles: true }));
        expect(block.getAttribute("data-lv-selected")).toBe("true");

        // 触发空白处 touchstart，清除选中态
        const blank = document.createElement("div");
        document.body.appendChild(blank);
        blank.dispatchEvent(new Event("touchstart", { bubbles: true }));
        expect(block.hasAttribute("data-lv-selected")).toBe(false);

        service.dispose();
        delete (window as any).ontouchstart;
    });
});
