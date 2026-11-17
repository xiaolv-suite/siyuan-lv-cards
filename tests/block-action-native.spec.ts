import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeBlockAction, buildBlockSnapshot, type BlockActionHost } from "../src/core/block-action-executor";
import { BLOCK_ACTIONS } from "../src/core/block-actions";
import { readActionUsage, resetActionUsage } from "../src/core/block-actions";

const mockSetBlockAttrs = vi.fn();
const mockUpdateBlock = vi.fn();

vi.mock("../src/api/siyuan", () => ({
    getBlockAttrs: vi.fn().mockResolvedValue({}),
    getBlockMarkdown: vi.fn().mockResolvedValue("测试段落文本"),
    setBlockAttrs: (...args: any[]) => mockSetBlockAttrs(...args),
    updateBlock: (...args: any[]) => mockUpdateBlock(...args),
}));

const mockShowMessage = vi.fn();
vi.mock("../src/libs/notice", () => ({
    showMessage: (...args: any[]) => mockShowMessage(...args),
}));

describe("思源本体高频功能专项单测（聚焦/嵌入/折叠/转换）", () => {
    let host: BlockActionHost;

    beforeEach(() => {
        document.body.innerHTML = "";
        vi.clearAllMocks();
        host = {
            i18n: {},
            openCardQuestionDialog: vi.fn(),
            openDeckPicker: vi.fn(),
            makeClozeCard: vi.fn(),
            openOcclusionFlow: vi.fn(),
            addInboxItems: vi.fn(),
            removeCardsFromDeck: vi.fn(),
            addDocToReview: vi.fn(),
            removeDocFromReview: vi.fn(),
        };
    });

    it("focus-block 动作调用思源 openFileById 聚焦当前块", async () => {
        const sendSpy = vi.fn();
        (window as any).siyuan = { ws: { send: sendSpy } };

        const action = BLOCK_ACTIONS.find((a) => a.id === "focus-block")!;
        expect(action).toBeTruthy();

        await executeBlockAction(action, "b-focus-1", host);

        expect(sendSpy).toHaveBeenCalledWith("openFileById", { id: "b-focus-1", mode: 0 });
        expect(mockShowMessage).toHaveBeenCalledWith(expect.stringContaining("聚焦沉浸模式"), expect.any(Number), "info");
    });

    it("copy-embed-ref 单块生成 {{id}} 动态嵌入语法，多选模式输出多行嵌入", async () => {
        const writeSpy = vi.fn().mockResolvedValue(undefined);
        try {
            Object.defineProperty(navigator, "clipboard", {
                value: { writeText: writeSpy },
                configurable: true,
            });
        } catch {
            (navigator as any).clipboard.writeText = writeSpy;
        }

        const action = BLOCK_ACTIONS.find((a) => a.id === "copy-embed-ref")!;
        expect(action).toBeTruthy();

        // 1. 单块模式
        await executeBlockAction(action, "b-single-embed", host);
        expect(writeSpy).toHaveBeenCalledWith("{{b-single-embed}}");
        expect(mockShowMessage).toHaveBeenCalledWith(expect.stringContaining("已复制嵌入块语法"), expect.any(Number), "info");

        // 2. 批量多选模式
        writeSpy.mockClear();
        await executeBlockAction(action, "b-single-embed", host, ["b-emb-1", "b-emb-2"]);
        expect(writeSpy).toHaveBeenCalledWith("{{b-emb-1}}\n{{b-emb-2}}");
        expect(mockShowMessage).toHaveBeenCalledWith(expect.stringContaining("已批量复制 2 个嵌入块引用"), expect.any(Number), "info");
    });

    it("toggle-fold-block 能够动态反转折叠状态并回写 fold 属性", async () => {
        const block = document.createElement("div");
        block.setAttribute("data-node-id", "b-fold-test");
        block.setAttribute("data-fold", "0");
        document.body.appendChild(block);

        mockSetBlockAttrs.mockResolvedValue({});

        const action = BLOCK_ACTIONS.find((a) => a.id === "toggle-fold-block")!;
        expect(action).toBeTruthy();

        // 第一次切换：0 -> 1（折叠）
        await executeBlockAction(action, "b-fold-test", host);
        expect(mockSetBlockAttrs).toHaveBeenCalledWith("b-fold-test", { fold: "1" });
        expect(block.getAttribute("data-fold")).toBe("1");
        expect(mockShowMessage).toHaveBeenCalledWith("已收起当前分支", expect.any(Number), "info");

        // 第二次切换：1 -> 0（展开）
        mockSetBlockAttrs.mockClear();
        await executeBlockAction(action, "b-fold-test", host);
        expect(mockSetBlockAttrs).toHaveBeenCalledWith("b-fold-test", { fold: "0" });
        expect(block.getAttribute("data-fold")).toBe("0");
        expect(mockShowMessage).toHaveBeenCalledWith("已展开当前分支", expect.any(Number), "info");
    });

    it("morph-block-type 在段落与待办之间智能转换", async () => {
        const pBlock = document.createElement("div");
        pBlock.setAttribute("data-node-id", "b-morph-p");
        pBlock.setAttribute("data-type", "NodeParagraph");
        pBlock.textContent = "待办事项标题";
        document.body.appendChild(pBlock);

        mockUpdateBlock.mockResolvedValue({});

        const action = BLOCK_ACTIONS.find((a) => a.id === "morph-block-type")!;
        expect(action).toBeTruthy();

        // 段落转待办
        await executeBlockAction(action, "b-morph-p", host);
        expect(mockUpdateBlock).toHaveBeenCalledWith("markdown", "* [ ] 测试段落文本", "b-morph-p");
        expect(mockShowMessage).toHaveBeenCalledWith("已将段落转为待办任务项", expect.any(Number), "info");
    });

    it("buildBlockSnapshot 门禁快照：hasImage 检测块内图片，选区必须归属当前块", async () => {
        // 1. 含图块
        const imgBlock = document.createElement("div");
        imgBlock.setAttribute("data-node-id", "b-img");
        imgBlock.innerHTML = `<img alt="示意图">配图说明文字`;
        document.body.appendChild(imgBlock);
        const snapImg = await buildBlockSnapshot("b-img");
        expect(snapImg.hasImage).toBe(true);
        expect(snapImg.hasText).toBe(true);

        // 2. 纯文本块
        const txtBlock = document.createElement("div");
        txtBlock.setAttribute("data-node-id", "b-txt");
        txtBlock.textContent = "纯文本内容";
        document.body.appendChild(txtBlock);
        const snapTxt = await buildBlockSnapshot("b-txt");
        expect(snapTxt.hasImage).toBe(false);

        // 3. 选区锚定在其它块 → hasSelection 必须为 false（跨块误判防护）
        const otherBlock = document.createElement("div");
        otherBlock.setAttribute("data-node-id", "b-other");
        otherBlock.textContent = "别的块的文字";
        document.body.appendChild(otherBlock);
        const selSpy = vi.spyOn(document, "getSelection");
        selSpy.mockReturnValue({
            rangeCount: 1,
            toString: () => "别的块的文字",
            anchorNode: otherBlock.firstChild,
        } as unknown as Selection);
        const snapCross = await buildBlockSnapshot("b-txt");
        expect(snapCross.hasSelection).toBe(false);

        // 4. 选区锚定在当前块 → hasSelection 为 true
        selSpy.mockReturnValue({
            rangeCount: 1,
            toString: () => "纯文本内容",
            anchorNode: txtBlock.firstChild,
        } as unknown as Selection);
        const snapIn = await buildBlockSnapshot("b-txt");
        expect(snapIn.hasSelection).toBe(true);

        selSpy.mockRestore();
    });

    it("习惯学习挂钩：executeBlockAction 执行动作后本地频次计数递增", async () => {
        resetActionUsage();
        const sendSpy = vi.fn();
        (window as any).siyuan = { ws: { send: sendSpy } };
        const action = BLOCK_ACTIONS.find((a) => a.id === "focus-block")!;
        expect(action).toBeTruthy();

        expect(readActionUsage()["focus-block"] ?? 0).toBe(0);
        await executeBlockAction(action, "b-usage-1", host);
        await executeBlockAction(action, "b-usage-2", host);
        expect(readActionUsage()["focus-block"]).toBe(2);
        resetActionUsage();
    });
});
