import { describe, it, expect } from "vitest";
import {
  extractCartItemsFromMarketplaceItem,
  addToCart,
  addManyToCart,
  removeFromCart,
  isInCart,
  clearCart,
  cartItemsToLvCardsPackage,
  calculateItemQualityMetrics,
  buildMarketplaceKpTree,
} from "../src/core/marketplace-cart";
import { DEFAULT_MARKETPLACE_CATALOG } from "../src/core/marketplace";

describe("集市闪卡篮与卡包品质画像 (marketplace-cart.ts)", () => {
  const mathItem = DEFAULT_MARKETPLACE_CATALOG.items.find((i) => i.id === "math-highschool-theorems")!;

  it("extractCartItemsFromMarketplaceItem 能正确从集市条目提取候选闪卡", () => {
    const items = extractCartItemsFromMarketplaceItem(mathItem);
    expect(items.length).toBe(mathItem.embeddedQuestions!.length);
    expect(items[0].sourceItemId).toBe("math-highschool-theorems");
    expect(items[0].sourceTitle).toBe(mathItem.title);
    expect(items[0].stem).toContain("已知函数");
  });

  it("闪卡篮纯函数操作 (添加/查重/批量/移除/清空)", () => {
    const items = extractCartItemsFromMarketplaceItem(mathItem);
    let cart: any[] = [];

    // 单个添加与查重
    cart = addToCart(cart, items[0]);
    expect(cart.length).toBe(1);
    expect(isInCart(cart, items[0].id)).toBe(true);

    cart = addToCart(cart, items[0]);
    expect(cart.length).toBe(1); // 不重复

    // 批量添加
    cart = addManyToCart(cart, items);
    expect(cart.length).toBe(items.length);

    // 移除
    cart = removeFromCart(cart, items[0].id);
    expect(cart.length).toBe(items.length - 1);
    expect(isInCart(cart, items[0].id)).toBe(false);

    // 清空
    cart = clearCart();
    expect(cart.length).toBe(0);
  });

  it("cartItemsToLvCardsPackage 能够将闪卡篮跨学科打包为标准 lvcards.v1 规范包", () => {
    const items = extractCartItemsFromMarketplaceItem(mathItem);
    const pkg = cartItemsToLvCardsPackage(items.slice(0, 2), "我的精选题卡包");
    expect(pkg.format).toBe("lvcards.v1");
    expect(pkg.deck.name).toBe("我的精选题卡包");
    expect(pkg.cards.length).toBe(2);
    expect(pkg.cards[0].question).toBeTruthy();
    expect(pkg.cards[0].answer).toBeTruthy();
  });

  it("calculateItemQualityMetrics 正确统计题型分布与 FSRS 难度梯队", () => {
    const metrics = calculateItemQualityMetrics(mathItem);
    expect(metrics.totalCount).toBe(mathItem.embeddedQuestions!.length);
    expect(metrics.typeDistribution.length).toBeGreaterThan(0);
    expect(metrics.difficultyDistribution.length).toBeGreaterThan(0);
    expect(metrics.expansionRatio).toBeGreaterThan(0); // 包含思路拓展
    expect(metrics.topKps.length).toBeGreaterThan(0);
  });

  it("buildMarketplaceKpTree 能够将卡片按考点聚合成两级知识大纲树", () => {
    const items = extractCartItemsFromMarketplaceItem(mathItem);
    const tree = buildMarketplaceKpTree(items);
    expect(tree.length).toBeGreaterThan(0);
    expect(tree[0].name).toBeTruthy();
    expect(tree[0].count).toBeGreaterThan(0);
  });
});
