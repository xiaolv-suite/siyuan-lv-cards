import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRevlog } from "../src/core/revlog";
import { defaultSettings } from "../src/core/settings";
import { emptyErrorTags } from "../src/core/error-reasons";
import { DYNAMIC_BOARD_DOC_PATH } from "../src/core/dynamic-notebook";

const {
    setBlockAttrs,
    createDocWithMd,
    findDocIDByHPath,
    openTab,
    showMessage,
} = vi.hoisted(() => ({
    setBlockAttrs: vi.fn().mockResolvedValue(undefined),
    createDocWithMd: vi.fn().mockResolvedValue("doc-dynamic-1"),
    findDocIDByHPath: vi.fn().mockResolvedValue(null),
    openTab: vi.fn(),
    showMessage: vi.fn(),
}));

vi.mock("../src/api/siyuan", async importOriginal => ({
    ...await importOriginal<typeof import("../src/api/siyuan")>(),
    setBlockAttrs,
    createDocWithMd,
    findDocIDByHPath,
}));

vi.mock("siyuan", () => ({
    openTab,
    showMessage,
    Plugin: class {},
    getAllEditor: () => [],
    fetchSyncPost: vi.fn(),
}));

import LvCardsPlugin from "../src/index";

describe("思源笔记文档深度联动机制 (D1)", () => {
    let plugin: any;

    beforeEach(() => {
        vi.clearAllMocks();
        plugin = new (LvCardsPlugin as any)();
        plugin.settings = defaultSettings();
        plugin.revlog = emptyRevlog();
        plugin.errorTags = emptyErrorTags();
        plugin.saveSettingsSoon = vi.fn();
        plugin.scheduleRevlogSave = vi.fn();
        plugin.showStorageFail = vi.fn();
        plugin.targetNotebook = vi.fn().mockResolvedValue({ id: "nb-test", name: "测试笔记本" });
        plugin.persist = { save: vi.fn().mockResolvedValue(undefined) };
        plugin.i18n = {
            onboardingNoNotebook: "无笔记本",
            quickCardFail: "建卡失败",
            dynamicBoardOpened: "已打开看板",
        };
        plugin.app = {};
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("toggleStarCard：点亮与取消星标时同步镜像 custom-lv-starred 块属性", async () => {
        const added = await plugin.toggleStarCard("block-star-1");
        expect(added).toBe(true);
        expect(plugin.settings.starredCards).toContain("block-star-1");
        expect(setBlockAttrs).toHaveBeenCalledWith("block-star-1", { "custom-lv-starred": "true" });

        const removed = await plugin.toggleStarCard("block-star-1");
        expect(removed).toBe(false);
        expect(plugin.settings.starredCards).not.toContain("block-star-1");
        expect(setBlockAttrs).toHaveBeenCalledWith("block-star-1", { "custom-lv-starred": "" });
    });

    it("appendRevlog：当遗忘次数达到水蛭阈值时，自动镜像 custom-lv-leech 与 custom-lv-lapses 块属性", () => {
        plugin.settings.leechThreshold = 4;
        // 模拟连续记录 4 次 Again (rating=1)
        for (let i = 1; i <= 4; i++) {
            (plugin as any).appendRevlog({
                cardID: "card-leech-1",
                deckID: "deck-1",
                blockID: "block-leech-1",
                rating: 1,
                source: "plugin",
            });
        }

        expect(setBlockAttrs).toHaveBeenCalledWith("block-leech-1", {
            "custom-lv-leech": "true",
            "custom-lv-lapses": "4",
        });
    });

    it("tagErrorReason：打标错因时同步镜像 custom-lv-error-reason 块属性", () => {
        plugin.tagErrorReason("card-err-1", "concept-confusion", "block-err-1");

        expect(setBlockAttrs).toHaveBeenCalledWith("block-err-1", {
            "custom-lv-error-reason": "concept-confusion",
        });
    });

    it("openOrCreateDynamicBoardDoc：首次不存在时创建并打开动态错题看板文档", async () => {
        findDocIDByHPath.mockResolvedValueOnce(null);
        createDocWithMd.mockResolvedValueOnce("doc-new-board");

        const docID = await plugin.openOrCreateDynamicBoardDoc();

        expect(docID).toBe("doc-new-board");
        expect(createDocWithMd).toHaveBeenCalledWith("nb-test", DYNAMIC_BOARD_DOC_PATH, expect.stringContaining("{{SELECT * FROM blocks WHERE"));
        expect(openTab).toHaveBeenCalledWith(expect.objectContaining({ doc: { id: "doc-new-board" } }));
        expect(showMessage).toHaveBeenCalledWith("已打开看板", 2500, "info");
    });

    it("openOrCreateDynamicBoardDoc：已存在时直接复用并打开，不重复创建", async () => {
        findDocIDByHPath.mockResolvedValueOnce("doc-existing-board");

        const docID = await plugin.openOrCreateDynamicBoardDoc();

        expect(docID).toBe("doc-existing-board");
        expect(createDocWithMd).not.toHaveBeenCalled();
        expect(openTab).toHaveBeenCalledWith(expect.objectContaining({ doc: { id: "doc-existing-board" } }));
    });
});
