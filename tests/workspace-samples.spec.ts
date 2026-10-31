import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    createFullSampleWorkspace,
    createOnboardingSampleCards,
    findOrCreateRiffDeck,
} from "../src/core/workspace-samples";

const {
    getRiffDecks,
    createRiffDeck,
    getRiffCards,
    addRiffCards,
    createDocWithMd,
    sqlQuery,
    appendBlock,
    setBlockAttrs,
    allTypeSampleCards,
} = vi.hoisted(() => ({
    getRiffDecks: vi.fn(),
    createRiffDeck: vi.fn(),
    getRiffCards: vi.fn(),
    addRiffCards: vi.fn(),
    createDocWithMd: vi.fn(),
    sqlQuery: vi.fn(),
    appendBlock: vi.fn(),
    setBlockAttrs: vi.fn(),
    allTypeSampleCards: vi.fn(),
}));

vi.mock("../src/api/riff", () => ({
    getRiffDecks,
    createRiffDeck,
    getRiffCards,
}));

vi.mock("../src/api/due-shared", () => ({
    addRiffCards,
}));

vi.mock("../src/api/siyuan", () => ({
    createDocWithMd,
    sqlQuery,
    appendBlock,
    setBlockAttrs,
}));

vi.mock("../src/core/sample-cards", () => ({
    // sampleCards（旧版 5 张）不再被 R59 流程使用，这里给空实现仅为满足 re-export
    sampleCards: () => [],
    allTypeSampleCards,
}));

vi.mock("../src/help", () => ({
    sampleCards: () => [],
    allTypeSampleCards,
}));

describe("workspace-samples 示例与引导工作区生成", () => {
    const mockI18n = {
        onboardingDeckName: "示例卡组",
        onboardingSample1: "问答题内容",
        onboardingSample2: "挖空题内容",
        onboardingSample3: "挖空二内容",
        onboardingSample4: "公式题内容",
        onboardingSample5: "列表题内容",
        quickCardFail: "建卡失败",
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("findOrCreateRiffDeck 卡组复用机制", () => {
        it("卡组已存在时直接复用既有卡组，不创建新组", async () => {
            getRiffDecks.mockResolvedValueOnce([
                { id: "deck-existing", name: "示例卡组" },
                { id: "deck-2", name: "其他卡组" },
            ]);

            const deck = await findOrCreateRiffDeck("示例卡组");
            expect(deck).toEqual({ id: "deck-existing", name: "示例卡组" });
            expect(createRiffDeck).not.toHaveBeenCalled();
        });

        it("卡组不存在时调用 createRiffDeck 创建新卡组", async () => {
            getRiffDecks.mockResolvedValueOnce([{ id: "deck-1", name: "其他卡组" }]);
            createRiffDeck.mockResolvedValueOnce({ id: "deck-new" });

            const deck = await findOrCreateRiffDeck("示例卡组");
            expect(deck).toEqual({ id: "deck-new", name: "示例卡组" });
            expect(createRiffDeck).toHaveBeenCalledWith("示例卡组");
        });
    });

    describe("createOnboardingSampleCards 新手示例卡断点恢复与生成（R59 全类型）", () => {
        it("首次全新创建：13 类卡型均写入且完整入组", async () => {
            getRiffDecks.mockResolvedValue([{ id: "deck-1", name: "示例卡组" }]);
            createDocWithMd.mockResolvedValue("doc-onboarding-1");
            allTypeSampleCards.mockReturnValue([
                { kind: "qa", md: "qa 内容" },
                { kind: "cloze", md: "cloze 内容" },
                { kind: "superblock", md: "sb 内容" },
                { kind: "bidi-a", md: "bidi-a 内容" },
                { kind: "bidi-b", md: "bidi-b 内容" },
                { kind: "delimited", md: "delimited 内容" },
                { kind: "choice-single", md: "单选 内容", attrs: { "custom-exam-type": "single", "custom-exam-answer": "C" } },
                { kind: "choice-multi", md: "多选 内容", attrs: { "custom-exam-type": "multiple", "custom-exam-answer": "ABD" } },
                { kind: "judge", md: "判断 内容", attrs: { "custom-exam-type": "judge", "custom-exam-answer": "对" } },
                { kind: "fill", md: "填空 内容", attrs: { "custom-exam-type": "fill", "custom-exam-answer": "SQLite" } },
                { kind: "code", md: "代码 内容" },
                { kind: "formula", md: "公式 内容" },
                { kind: "table", md: "表格 内容" },
            ]);
            // 按语句区分：首次存在性检查（含 markdown LIKE 兜底）返回空；建成回查返回全部 13 块
            sqlQuery.mockImplementation((stmt: string) => {
                if (stmt.includes("markdown LIKE")) return Promise.resolve([]);
                return Promise.resolve([
                    { id: "block-qa" }, { id: "block-cloze" }, { id: "block-superblock" },
                    { id: "block-bidi-a" }, { id: "block-bidi-b" }, { id: "block-delimited" },
                    { id: "block-choice-single" }, { id: "block-choice-multi" }, { id: "block-judge" },
                    { id: "block-fill" }, { id: "block-code" }, { id: "block-formula" }, { id: "block-table" },
                ]);
            });
            appendBlock.mockImplementation((_type, md, _doc) => {
                const marker = md.match(/custom-lv-sample="([a-z0-9-]+)"/)?.[1] ?? "unknown";
                return Promise.resolve([`block-${marker}`]);
            });
            setBlockAttrs.mockResolvedValue(undefined);
            getRiffCards.mockResolvedValue({ blocks: [] }); // 卡组中尚无卡

            const docID = await createOnboardingSampleCards("nb-1", mockI18n);

            expect(docID).toBe("doc-onboarding-1");
            expect(createDocWithMd).toHaveBeenCalledWith("nb-1", "小驴闪卡/示例卡", "");
            expect(appendBlock).toHaveBeenCalledTimes(13);
            // 回归：示例标记写进块属性，正文不再带 HTML 注释（思源 3.8 会把注释原样显示在卡面上）
            for (const call of appendBlock.mock.calls) {
                expect(call[1]).not.toContain("<!--");
                expect(call[1]).toMatch(/\n\{: custom-lv-sample="[a-z0-9-]+"\}$/);
            }
            // R59：考试题型属性写入（幂等补写，全部 4 类带 attrs 的块均触发）
            expect(setBlockAttrs).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ "custom-exam-type": expect.any(String) }),
            );
            expect(addRiffCards).toHaveBeenCalledWith("deck-1", expect.arrayContaining([
                "block-qa", "block-choice-single", "block-judge", "block-formula", "block-table",
            ]));
        });

        it("断点恢复：若部分卡已存在，仅补充创建缺失的块", async () => {
            getRiffDecks.mockResolvedValue([{ id: "deck-1", name: "示例卡组" }]);
            createDocWithMd.mockResolvedValue("doc-onboarding-1");
            allTypeSampleCards.mockReturnValue([
                { kind: "qa", md: "qa 内容" },
                { kind: "cloze", md: "cloze 内容" },
                { kind: "choice-single", md: "单选 内容", attrs: { "custom-exam-type": "single" } },
            ]);
            // 首次检查：cloze 已存在；回查返回现有+新建；legacy 检查为空
            sqlQuery.mockImplementation((stmt: string) => {
                if (stmt.includes("SELECT id, ial FROM blocks")) {
                    return Promise.resolve([{ id: "block-cloze-exist", ial: '{: custom-lv-sample="cloze"}' }]);
                }
                if (stmt.includes("markdown LIKE '%lv-cards-sample:%'")) {
                    return Promise.resolve([]);
                }
                return Promise.resolve([
                    { id: "block-cloze-exist", ial: '{: custom-lv-sample="cloze"}' },
                    { id: "block-qa", ial: '{: custom-lv-sample="qa"}' },
                    { id: "block-choice-single", ial: '{: custom-lv-sample="choice-single"}' },
                ]);
            });
            appendBlock.mockImplementation((_type, md) => {
                const marker = md.match(/custom-lv-sample="([a-z0-9-]+)"/)?.[1] ?? "unknown";
                return Promise.resolve([`block-${marker}`]);
            });
            setBlockAttrs.mockResolvedValue(undefined);
            getRiffCards.mockResolvedValue({ blocks: [{ id: "block-cloze-exist" }] });

            await createOnboardingSampleCards("nb-1", mockI18n);

            // 只有缺失的 2 张调用了 appendBlock（cloze 已存在）
            expect(appendBlock).toHaveBeenCalledTimes(2);
            // 缺失块入组（block-cloze-exist 已在卡组中）
            expect(addRiffCards).toHaveBeenCalledWith("deck-1", ["block-qa", "block-choice-single"]);
        });
    });

    describe("createFullSampleWorkspace 完整示例工作区", () => {
        it("已存在示例块时做断点补齐，未缺卡则 alreadyExisted 为 true", async () => {
            getRiffDecks.mockResolvedValue([{ id: "deck-1", name: "示例卡组" }]);
            createDocWithMd.mockResolvedValue("doc-sample-ws");
            allTypeSampleCards.mockReturnValue([{ kind: "qa", md: "qa 内容" }]);
            // 所有回查均返回同一已存在块（无缺失），旧版「示例 %」内容块也无
            sqlQuery.mockResolvedValue([{ id: "block-sample-1", ial: '{: custom-lv-sample="qa"}' }]);
            getRiffCards.mockResolvedValue({ blocks: [{ id: "block-sample-1" }] }); // 均已在组

            const result = await createFullSampleWorkspace("nb-1", mockI18n);

            expect(result).toEqual({
                docID: "doc-sample-ws",
                createdCount: 0,
                alreadyExisted: true,
            });
            expect(appendBlock).not.toHaveBeenCalled();
            expect(addRiffCards).not.toHaveBeenCalled();
        });

        it("初次生成：将全类型示例逐项写入并加入示例卡组", async () => {
            getRiffDecks.mockResolvedValue([{ id: "deck-1", name: "示例卡组" }]);
            createDocWithMd.mockResolvedValue("doc-sample-ws");
            allTypeSampleCards.mockReturnValue([
                { kind: "qa", md: "card1 markdown" },
                { kind: "cloze", md: "card2 markdown" },
            ]);
            // 首次存在性检查（content LIKE '示例 %' 或建卡前检查）返回空；建卡后回查返回新建块
            sqlQuery.mockImplementation((stmt: string) => {
                if (stmt.includes("content LIKE '示例 %'") || stmt.includes("SELECT id, ial FROM blocks")) {
                    return Promise.resolve([]);
                }
                return Promise.resolve([{ id: "block-qa", ial: '{: custom-lv-sample="qa"}' }, { id: "block-cloze", ial: '{: custom-lv-sample="cloze"}' }]);
            });
            appendBlock.mockImplementation((_type, md, _doc) => {
                const marker = md.match(/custom-lv-sample="([a-z0-9-]+)"/)?.[1] ?? "unknown";
                return Promise.resolve([`block-${marker}`]);
            });
            setBlockAttrs.mockResolvedValue(undefined);

            const result = await createFullSampleWorkspace("nb-1", mockI18n);

            expect(result).toEqual({
                docID: "doc-sample-ws",
                createdCount: 2,
                alreadyExisted: false,
            });
            expect(appendBlock).toHaveBeenCalledTimes(2);
            expect(addRiffCards).toHaveBeenCalledWith("deck-1", ["block-qa", "block-cloze"]);
        });
    });
});
