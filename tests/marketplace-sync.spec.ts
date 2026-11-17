import { describe, it, expect } from "vitest";
import {
  compareSemVer,
  calculateCardsDelta,
  mergeCardsDelta,
  scanPrivacyIssues,
  buildMarketplaceItemFromCards,
  buildMarketplaceCatalogJson,
} from "../src/core/marketplace-sync";
import type { LvPackageCard } from "../src/core/lvcards-package";

describe("集市增量差量同步、无损合并与隐私脱敏 (marketplace-sync.ts)", () => {
  it("compareSemVer 能够正确比较语义化版本号", () => {
    expect(compareSemVer("1.2.0", "1.1.0")).toBe(1);
    expect(compareSemVer("1.0.0", "1.0.1")).toBe(-1);
    expect(compareSemVer("v2.0.0", "2.0.0")).toBe(0);
  });

  const baseCards: LvPackageCard[] = [
    {
      id: "card-1",
      markdown: "问题 1\n\n答案 1",
      kind: "qa",
      question: "问题 1",
      answer: "答案 1",
      memo: "旧便签",
      fsrsParams: { difficulty: 5, stability: 12 },
    },
    {
      id: "card-2",
      markdown: "问题 2\n\n答案 2",
      kind: "qa",
      question: "问题 2",
      answer: "答案 2",
    },
  ];

  it("calculateCardsDelta 能够细粒度分析新增、修订与未变动卡片", () => {
    const remoteCards: LvPackageCard[] = [
      {
        id: "card-1",
        markdown: "问题 1\n\n答案 1（修订版）",
        kind: "qa",
        question: "问题 1",
        answer: "答案 1（修订版）",
        memo: "新便签",
      },
      {
        id: "card-2",
        markdown: "问题 2\n\n答案 2",
        kind: "qa",
        question: "问题 2",
        answer: "答案 2",
      },
      {
        id: "card-3",
        markdown: "新卡片 3\n\n答案 3",
        kind: "qa",
        question: "新卡片 3",
        answer: "答案 3",
      },
    ];

    const delta = calculateCardsDelta(baseCards, remoteCards);
    expect(delta.hasUpdates).toBe(true);
    expect(delta.addedCount).toBe(1);
    expect(delta.updatedCount).toBe(1);
    expect(delta.unchangedCount).toBe(1);

    expect(delta.updated[0].local.id).toBe("card-1");
    expect(delta.updated[0].changedFields).toContain("markdown");
    expect(delta.updated[0].changedFields).toContain("answer");
    expect(delta.updated[0].changedFields).toContain("memo");
    expect(delta.added[0].id).toBe("card-3");
  });

  it("mergeCardsDelta 无损合并卡片，绝对保留原有本地 FSRS 调度参数", () => {
    const remoteCards: LvPackageCard[] = [
      {
        id: "card-1",
        markdown: "问题 1\n\n答案 1（修订版）",
        kind: "qa",
        question: "问题 1",
        answer: "答案 1（修订版）",
        memo: "新便签",
        fsrsParams: { difficulty: 1 }, // 远端新参数
      },
      {
        id: "card-2",
        markdown: "问题 2\n\n答案 2",
        kind: "qa",
      },
      {
        id: "card-3",
        markdown: "新卡片 3\n\n答案 3",
        kind: "qa",
      },
    ];

    const delta = calculateCardsDelta(baseCards, remoteCards);
    const merged = mergeCardsDelta(baseCards, delta);

    expect(merged.length).toBe(3);
    const card1 = merged.find((c) => c.id === "card-1")!;
    expect(card1.answer).toBe("答案 1（修订版）");
    expect(card1.memo).toBe("新便签");
    // 关键保证：本地已有的 FSRS 调度数据绝对不被覆盖污染
    expect(card1.fsrsParams?.difficulty).toBe(5);
    expect(card1.fsrsParams?.stability).toBe(12);
  });

  it("scanPrivacyIssues 能够精准扫描本地绝对路径与思源私有块链接", () => {
    const riskyCards: LvPackageCard[] = [
      {
        id: "c-risk-1",
        markdown: "参考图片：![](D:\\my-notes\\secret.png)",
        kind: "qa",
      },
      {
        id: "c-risk-2",
        markdown: "见块引用：((20230218-abc)) [链接](siyuan://blocks/20230218-abc)",
        kind: "qa",
      },
      {
        id: "c-safe-3",
        markdown: "纯净卡片，无任何私有绝对路径",
        kind: "qa",
      },
    ];

    const warnings = scanPrivacyIssues(riskyCards);
    expect(warnings.length).toBe(2);
    expect(warnings.some((w) => w.type === "absolute_path")).toBe(true);
    expect(warnings.some((w) => w.type === "internal_uri")).toBe(true);
  });

  it("buildMarketplaceItemFromCards 能够将卡包合规打包为集市条目并生成 catalog.json", () => {
    const item = buildMarketplaceItemFromCards({
      id: "my-custom-deck",
      title: "自制精选卡包",
      description: "考研高频知识点",
      category: "math",
      tags: ["数学", "公式"],
      authorName: "学者",
      version: "1.0.0",
      license: "CC-BY-4.0",
      cards: baseCards,
    });

    expect(item.id).toBe("my-custom-deck");
    expect(item.title).toBe("自制精选卡包");
    expect(item.itemCount).toBe(2);

    const catalogJson = buildMarketplaceCatalogJson("我的卡组集市", "描述", [item]);
    expect(catalogJson).toContain("我的卡组集市");
    expect(catalogJson).toContain("my-custom-deck");
  });
});
