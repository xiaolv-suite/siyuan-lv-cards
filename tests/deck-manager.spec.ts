import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import DeckManager from "../src/ui/deck-manager.svelte";

const {
    getRiffDecks,
    createRiffDeck,
    renameRiffDeck,
    removeRiffDeck,
    getRiffCards,
    addRiffCards,
    sqlQuery,
    confirmDialog,
} = vi.hoisted(() => ({
    getRiffDecks: vi.fn(),
    createRiffDeck: vi.fn(),
    renameRiffDeck: vi.fn(),
    removeRiffDeck: vi.fn(),
    getRiffCards: vi.fn(),
    addRiffCards: vi.fn(),
    sqlQuery: vi.fn(),
    confirmDialog: vi.fn(),
}));

vi.mock("@/api/riff", () => ({
    getRiffDecks,
    createRiffDeck,
    renameRiffDeck,
    removeRiffDeck,
    getRiffCards,
    addRiffCards,
}));

vi.mock("@/api/siyuan", () => ({
    sqlQuery,
}));

vi.mock("@/libs/dialog", () => ({
    confirmDialog,
}));

const mockI18n = {
    deckManagerTitle: "卡包管理",
    deckManagerSubtitle: "统筹思源笔记全生态卡包资产",
    deckManagerTotalDecks: "个卡包",
    deckManagerTotalCards: "张闪卡",
    deckManagerLegacyDiscovered: "待接入存量",
    deckManagerScanLegacy: "扫描存量与第三方卡包",
    deckManagerScanning: "正在扫描…",
    deckManagerSyncAll: "一键全部接入",
    deckManagerSyncSingle: "接入",
    deckManagerCleanEmpty: "清理空卡包",
    deckManagerNewDeck: "新建卡包",
    deckManagerFilterAll: "全部",
    deckManagerFilterActive: "活跃卡包",
    deckManagerFilterEmpty: "空卡包",
    deckManagerFilterLegacy: "待接入存量",
    deckManagerMerge: "合并卡包",
    deckManagerRename: "重命名",
    deckManagerDelete: "删除卡包",
    deckManagerDeletePrompt: "确定要删除卡包「${name}」吗？",
    deckManagerDeleteSafeNote: "仅解除卡包关联",
    deckManagerMergedNotice: "已将 ${n} 张卡片合并至目标卡包",
};

describe("deck-manager 卡包管理组件", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getRiffDecks.mockResolvedValue([
            { id: "deck-1", name: "英语核心词", size: 25, created: "2026-01-01", updated: "2026-01-01" },
            { id: "deck-2", name: "计算机网络", size: 10, created: "2026-01-01", updated: "2026-01-01" },
            { id: "deck-3", name: "临时空卡包", size: 0, created: "2026-01-01", updated: "2026-01-01" },
        ]);
        sqlQuery.mockResolvedValue([]);
    });

    afterEach(cleanup);

    it("正确渲染卡包列表、卡片总量与指标统计", async () => {
        render(DeckManager, { i18n: mockI18n });

        expect(await screen.findByText("英语核心词")).toBeTruthy();
        expect(screen.getByText("计算机网络")).toBeTruthy();
        expect(screen.getByText("临时空卡包")).toBeTruthy();

        // 统计胶囊：3 个卡包，35 张闪卡
        expect(screen.getByText("3")).toBeTruthy();
        expect(screen.getByText("35")).toBeTruthy();
    });

    it("支持筛选活跃卡包与空卡包", async () => {
        render(DeckManager, { i18n: mockI18n });
        await screen.findByText("英语核心词");

        // 切换到「空卡包」筛选
        const emptyBtn = screen.getByRole("button", { name: "空卡包" });
        await fireEvent.click(emptyBtn);

        expect(screen.getByText("临时空卡包")).toBeTruthy();
        expect(screen.queryByText("英语核心词")).toBeNull();
        expect(screen.queryByText("计算机网络")).toBeNull();

        // 切换到「活跃卡包」筛选
        const activeBtn = screen.getByRole("button", { name: "活跃卡包" });
        await fireEvent.click(activeBtn);

        expect(screen.queryByText("临时空卡包")).toBeNull();
        expect(screen.getByText("英语核心词")).toBeTruthy();
        expect(screen.getByText("计算机网络")).toBeTruthy();
    });

    it("扫描并展示第三方插件卡包，支持一键接入同步", async () => {
        // 模拟 SQL 扫描发现第三方插件属性与标签卡包
        sqlQuery.mockResolvedValue([
            { id: "b-1", markdown: "心脏的四个腔室？", ial: '{: custom-flashcard-deck="生理学"}' },
            { id: "b-2", markdown: "血液循环途径？", ial: '{: custom-flashcard-deck="生理学"}' },
        ]);
        createRiffDeck.mockResolvedValue({ id: "deck-sync", name: "生理学", size: 2 });
        addRiffCards.mockResolvedValue(null);

        render(DeckManager, { i18n: mockI18n });

        // 等待自动扫描完成并渲染待接入区
        expect(await screen.findByText(/发现 1 个思源存量/)).toBeTruthy();
        expect(screen.getByText("生理学")).toBeTruthy();
        expect(screen.getByText(/包含 2 张闪卡/)).toBeTruthy();

        // 点击接入按钮
        const syncBtn = screen.getByRole("button", { name: "接入" });
        await fireEvent.click(syncBtn);

        await waitFor(() => {
            expect(createRiffDeck).toHaveBeenCalledWith("生理学");
            expect(addRiffCards).toHaveBeenCalledWith("deck-sync", ["b-1", "b-2"]);
        });
    });

    it("支持新建卡包并在成功后刷新列表", async () => {
        createRiffDeck.mockResolvedValue({ id: "deck-new", name: "法学通论", size: 0 });
        render(DeckManager, { i18n: mockI18n });
        await screen.findByText("英语核心词");

        // 点击「新建卡包」展开输入行
        const newBtn = screen.getByRole("button", { name: /新建卡包/ });
        await fireEvent.click(newBtn);

        const input = screen.getByPlaceholderText(/输入新卡包名称/);
        await fireEvent.input(input, { target: { value: "法学通论" } });
        await fireEvent.click(screen.getByRole("button", { name: "创建" }));

        await waitFor(() => {
            expect(createRiffDeck).toHaveBeenCalledWith("法学通论");
        });
    });

    it("支持安全删除卡包（带二次确认与笔记不删提示）", async () => {
        confirmDialog.mockImplementation((args) => { args.confirm?.(); });
        removeRiffDeck.mockResolvedValue(null);

        render(DeckManager, { i18n: mockI18n });
        await screen.findByText("临时空卡包");

        const deleteBtns = screen.getAllByRole("button", { name: "删除卡包（原卡片块完整保留在笔记正文中）" });
        await fireEvent.click(deleteBtns[2]); // 第三个卡包「临时空卡包」

        expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({
            title: expect.stringContaining("临时空卡包"),
        }));
        await waitFor(() => {
            expect(removeRiffDeck).toHaveBeenCalledWith("deck-3");
        });
    });

    it("支持批量清理 0 张卡片的冗余空卡包", async () => {
        confirmDialog.mockImplementation((args) => { args.confirm?.(); });
        removeRiffDeck.mockResolvedValue(null);

        render(DeckManager, { i18n: mockI18n });
        await screen.findByText("英语核心词");

        const cleanBtn = screen.getByRole("button", { name: /清理空卡包/ });
        expect(cleanBtn).toBeTruthy();
        await fireEvent.click(cleanBtn);

        expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining("临时空卡包"),
        }));
        await waitFor(() => {
            expect(removeRiffDeck).toHaveBeenCalledWith("deck-3");
        });
    });

    it("支持合并卡包并联动删除源卡包选项", async () => {
        getRiffCards.mockResolvedValue({ blocks: [{ id: "c1" }, { id: "c2" }], total: 2 });
        addRiffCards.mockResolvedValue(null);
        removeRiffDeck.mockResolvedValue(null);

        render(DeckManager, { i18n: mockI18n });
        await screen.findByText("英语核心词");

        const mergeToolBtns = screen.getAllByRole("button", { name: "合并卡片到其他卡包" });
        await fireEvent.click(mergeToolBtns[0]); // deck-1 展开合并栏

        const select = screen.getByRole("combobox", { name: "选择合并目标卡包" }) as HTMLSelectElement;
        const option = select.querySelector('option[value="deck-2"]') as HTMLOptionElement;
        option.selected = true;
        await fireEvent.change(select);

        const confirmMergeBtn = screen.getByRole("button", { name: "确认合并" });
        await fireEvent.click(confirmMergeBtn);

        await waitFor(() => {
            expect(addRiffCards).toHaveBeenCalledWith("deck-2", ["c1", "c2"]);
            expect(removeRiffDeck).toHaveBeenCalledWith("deck-1");
        });
    });

    it("CF-05: 支持卡包置顶与取消置顶操作并反映在界面", async () => {
        render(DeckManager, { i18n: mockI18n });
        await screen.findByText("计算机网络");

        // 初始无置顶标签
        expect(screen.queryByText("置顶")).toBeNull();

        // 点击「计算机网络」卡包上的置顶按钮
        const pinBtns = screen.getAllByRole("button", { name: "置顶卡包" });
        await fireEvent.click(pinBtns[1]); // deck-2 计算机网络

        // 出现置顶标识
        expect(await screen.findByText("置顶")).toBeTruthy();
    });

    it("CF-05: 纯逻辑层 sortDecksWithPins 正确按置顶与排序模式重排", async () => {
        const { sortDecksWithPins } = await import("../src/core/deck-management");
        const sampleDecks = [
            { id: "d1", name: "B卡包", size: 5 },
            { id: "d2", name: "A卡包", size: 20 },
            { id: "d3", name: "C卡包", size: 10 },
        ];

        // 置顶 d3，默认排序：d3 排在首位
        const res1 = sortDecksWithPins(sampleDecks, ["d3"]);
        expect(res1.map(d => d.id)).toEqual(["d3", "d1", "d2"]);

        // 按卡片降序且置顶 d1：d1 在最前，剩下的按 size 降序 (d2: 20, d3: 10)
        const res2 = sortDecksWithPins(sampleDecks, ["d1"], "size-desc");
        expect(res2.map(d => d.id)).toEqual(["d1", "d2", "d3"]);

        // 按名称升序且置顶 d3：d3 在最前，剩下的按名称升序 (A卡包 -> B卡包)
        const res3 = sortDecksWithPins(sampleDecks, ["d3"], "name-asc");
        expect(res3.map(d => d.id)).toEqual(["d3", "d2", "d1"]);
    });
});

