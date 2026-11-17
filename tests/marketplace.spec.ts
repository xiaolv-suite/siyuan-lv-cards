import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_MARKETPLACE_CATALOG,
  validateMarketplaceCatalog,
  filterMarketplaceItems,
  questionToLvPackageCard,
  marketplaceItemToLvCardsPackage,
} from "../src/core/marketplace";
import { parseLvCardsPackage, serializeLvCardsPackage } from "../src/core/lvcards-package";
import {
  loadMarketplaceSources,
  saveMarketplaceSources,
  fetchMarketplaceCatalog,
  installMarketplaceItemToDeck,
  type CustomMarketplaceSource,
} from "../src/core/marketplace-service";

describe("公共集市核心协议与契约 (marketplace.ts)", () => {
  it("默认精选集市包含完整的 8 大零版权学科卡包，全域已认证", () => {
    expect(DEFAULT_MARKETPLACE_CATALOG.v).toBe(1);
    expect(DEFAULT_MARKETPLACE_CATALOG.items.length).toBe(8);

    const categories = new Set(DEFAULT_MARKETPLACE_CATALOG.items.map((i) => i.category));
    expect(categories.has("math")).toBe(true);
    expect(categories.has("computer")).toBe(true);
    expect(categories.has("language")).toBe(true);
    expect(categories.has("qualification")).toBe(true);
    expect(categories.has("humanities")).toBe(true);
    expect(categories.has("science")).toBe(true);
    expect(categories.has("general")).toBe(true);

    for (const item of DEFAULT_MARKETPLACE_CATALOG.items) {
      expect(item.id).toBeTruthy();
      expect(item.title).toBeTruthy();
      expect(item.verified).toBe(true);
      expect(["CC0", "CC-BY-4.0", "Public Domain", "MIT"]).toContain(item.license);
      expect(item.itemCount).toBeGreaterThan(0);
      expect(item.previewItems && item.previewItems.length > 0).toBe(true);
    }
  });

  it("validateMarketplaceCatalog 能正确校验第三方合法订阅源", () => {
    const validJson = {
      v: 1,
      name: "第三方开源考研卡组源",
      description: "由考研社群共建",
      updatedAt: "2026-11-02",
      items: [
        {
          id: "custom-item-1",
          title: "政治冲刺卡包",
          description: "冲刺必背要点",
          kind: "flashcard_deck",
          category: "humanities",
          tags: ["政治", "考研"],
          author: { name: "研友组" },
          version: "1.0.0",
          itemCount: 10,
          license: "CC-BY-4.0",
          downloadUrl: "https://example.com/cards.json",
        },
      ],
    };

    const res = validateMarketplaceCatalog(validJson);
    expect(res.valid).toBe(true);
    expect(res.catalog?.items.length).toBe(1);
    expect(res.catalog?.items[0].title).toBe("政治冲刺卡包");
  });

  it("validateMarketplaceCatalog 能够拒绝非法格式与未兼容版本", () => {
    expect(validateMarketplaceCatalog(null).valid).toBe(false);
    expect(validateMarketplaceCatalog("not an object").valid).toBe(false);

    const invalidVersion = {
      v: 99,
      name: "未来版本",
      items: [],
    };
    const res = validateMarketplaceCatalog(invalidVersion);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("集市协议版本不兼容"))).toBe(true);
  });

  it("filterMarketplaceItems 支持分类与关键词联合检索", () => {
    const all = DEFAULT_MARKETPLACE_CATALOG.items;

    // 分类过滤
    const mathOnly = filterMarketplaceItems(all, "", "math");
    expect(mathOnly.length).toBe(1);
    expect(mathOnly[0].id).toBe("math-highschool-theorems");

    // 关键词过滤
    const tcpSearch = filterMarketplaceItems(all, "TCP");
    expect(tcpSearch.length).toBe(1);
    expect(tcpSearch[0].id).toBe("computer-networks-os");

    // 组合过滤
    const computerAll = filterMarketplaceItems(all, "排序", "computer");
    expect(computerAll.length).toBe(1);
    expect(computerAll[0].id).toBe("data-structures-algorithms");
  });

  it("questionToLvPackageCard 能够将试题正确转为带有 FSRS、Markdown 与 memo 的闪卡", () => {
    const q = {
      id: "test-q1",
      type: "single" as const,
      stem: "已知函数 $f(x) = \\sin x$，其导数 $f'(x)$ 为？",
      options: ["\\cos x", "-\\cos x"],
      answer: "A",
      analysis: "基本初等函数导数公式",
      expansion: "【秒杀技巧】正余互化口诀",
      kp: "数学/微积分",
      difficulty: 3,
    };

    const card = questionToLvPackageCard(q);
    expect(card.id).toBe("test-q1");
    expect(card.markdown).toContain("## 题目");
    expect(card.markdown).toContain("## 答案");
    expect(card.markdown).toContain("【秒杀技巧】正余互化口诀");
    expect(card.memo).toBe("【秒杀技巧】正余互化口诀");
    expect(card.tags).toContain("数学");
    expect(card.tags).toContain("微积分");
    expect(card.fsrsParams?.difficulty).toBe(6);
  });

  it("marketplaceItemToLvCardsPackage 可产出完全符合 lvcards.v1 的标准卡包，且与 lvcards-package 互通", () => {
    const mathItem = DEFAULT_MARKETPLACE_CATALOG.items.find((i) => i.id === "math-highschool-theorems")!;
    expect(mathItem).toBeTruthy();

    const pkg = marketplaceItemToLvCardsPackage(mathItem);
    expect(pkg.format).toBe("lvcards.v1");
    expect(pkg.version).toBe(1);
    expect(pkg.deck.name).toBe(mathItem.title);
    expect(pkg.cards.length).toBe(mathItem.embeddedQuestions!.length);

    // 序列化为 JSON 字符串
    const jsonStr = serializeLvCardsPackage(pkg.deck, pkg.cards);

    // 使用小驴闪卡核心 parseLvCardsPackage 进行解析
    const parsed = parseLvCardsPackage(jsonStr);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.package.deck.name).toBe(mathItem.title);
      expect(parsed.package.cards.length).toBe(pkg.cards.length);
      expect(parsed.package.cards[0].question).toBeTruthy();
    }
  });

  describe("集市服务与一键入库 (marketplace-service.ts)", () => {
    it("支持自定义订阅源的持久化读取与写入", () => {
      let store: Record<string, string> = {};
      const reader = (k: string) => store[k] ?? null;
      const writer = (k: string, v: string) => {
        store[k] = v;
      };

      expect(loadMarketplaceSources(reader)).toEqual([]);

      const mockSources: CustomMarketplaceSource[] = [
        {
          id: "src-1",
          name: "测试订阅源",
          url: "https://example.com/cards.json",
          enabled: true,
          addedAt: "2026-11-02",
        },
      ];

      saveMarketplaceSources(mockSources, writer);
      const loaded = loadMarketplaceSources(reader);
      expect(loaded.length).toBe(1);
      expect(loaded[0].name).toBe("测试订阅源");
    });

    it("fetchMarketplaceCatalog 请求 official 时直接返回内置官方源", async () => {
      const res = await fetchMarketplaceCatalog("official");
      expect(res.catalog.v).toBe(1);
      expect(res.catalog.items.length).toBe(8);
      expect(res.error).toBeUndefined();
    });

    it("fetchMarketplaceCatalog 支持拉取并解析第三方合法网络源", async () => {
      const mockJson = {
        v: 1,
        name: "第三方网络源",
        description: "测试描述",
        updatedAt: "2026-11-02",
        items: [
          {
            id: "net-item-1",
            title: "网络下载测试卡包",
            description: "描述",
            kind: "flashcard_deck",
            category: "math",
            tags: ["高数"],
            author: { name: "网络作者" },
            version: "1.0.0",
            itemCount: 5,
            license: "MIT",
            downloadUrl: "https://example.com/item.json",
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockJson,
      }) as unknown as typeof fetch;

      const res = await fetchMarketplaceCatalog("https://example.com/catalog.json", mockFetch);
      expect(res.catalog.name).toBe("第三方网络源");
      expect(res.catalog.items.length).toBe(1);
      expect(res.error).toBeUndefined();
    });

    it("installMarketplaceItemToDeck 能够在思源内核环境中完整执行卡包创建、文档新建、块写入与卡包绑定", async () => {
      const testItem = DEFAULT_MARKETPLACE_CATALOG.items[0];

      let createdDeckName = "";
      let createdDocNotebook = "";
      let createdDocPath = "";
      let appendedCards: string[] = [];
      let addedToDeckId = "";
      let addedBlockIds: string[] = [];
      let setAttrsMap: Record<string, Record<string, string>> = {};

      const mockDeps = {
        getRiffDecks: async () => [],
        createRiffDeck: async (name: string) => {
          createdDeckName = name;
          return { id: "deck-mock-123", name, size: 0, created: "2026", updated: "2026" };
        },
        getNotebooks: async () => [{ id: "nb-1", name: "我的主笔记本" }],
        createDocWithMd: async (notebook: string, path: string, markdown: string) => {
          createdDocNotebook = notebook;
          createdDocPath = path;
          return "doc-mock-456";
        },
        appendBlock: async (dataType: "markdown", data: string, parentID: string) => {
          appendedCards.push(data);
          const newBlockId = `block-${appendedCards.length}`;
          return [newBlockId];
        },
        addRiffCards: async (deckId: string, blockIDs: string[]) => {
          addedToDeckId = deckId;
          addedBlockIds = blockIDs;
          return null;
        },
        setBlockAttrs: async (id: string, attrs: Record<string, string>) => {
          setAttrsMap[id] = attrs;
        },
      };

      const result = await installMarketplaceItemToDeck(testItem, mockDeps);
      expect(result.success).toBe(true);
      expect(result.count).toBe(testItem.embeddedQuestions!.length);
      expect(result.deckId).toBe("deck-mock-123");
      expect(createdDeckName).toBe(testItem.title);
      expect(createdDocNotebook).toBe("nb-1");
      expect(createdDocPath).toContain("/小驴闪卡/公共集市/");
      expect(addedToDeckId).toBe("deck-mock-123");
      expect(addedBlockIds.length).toBe(testItem.embeddedQuestions!.length);
      expect(appendedCards.length).toBe(testItem.embeddedQuestions!.length);
    });
  });
});
