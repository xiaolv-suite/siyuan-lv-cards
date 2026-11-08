/**
 * 题库与闪卡集市「闪卡篮」与卡包品质画像分析核心
 * (Marketplace Cart & Quality Metrics)
 *
 * 核心能力：
 * 1. 闪卡篮跨学科挑选 (Cart & Selective Stash) 纯函数管理；
 * 2. 闪卡篮数据与标准 LvPackageCard / LvCardsPackage 双向无损转换；
 * 3. 卡包品质画像：题型构成、FSRS 难度梯队与便签覆盖率统计引擎；
 * 4. 章节与考点大纲全景树聚合。
 */

import type { MarketplaceCategory, MarketplaceItem, MarketplaceQuestion } from "./marketplace";
import { questionToLvPackageCard } from "./marketplace";
import {
  type LvCardsPackage,
  type LvPackageCard,
  PLUGIN_VERSION,
} from "./lvcards-package";

export type QuestionType = "single" | "multiple" | "judge" | "fill" | "short";

export interface MarketplaceCartItem {
  id: string;
  sourceItemId: string;
  sourceTitle: string;
  sourceCategory: MarketplaceCategory;
  stem: string;
  type: QuestionType;
  options: string[];
  answer: string;
  analysis?: string;
  expansion?: string;
  difficulty?: number;
  kp?: string;
  tags?: string[];
}

export interface TypeDistributionItem {
  type: QuestionType | "other";
  label: string;
  count: number;
  pct: number; // 0 - 100
  color: string;
}

export interface DifficultyDistributionItem {
  level: "easy" | "medium" | "hard";
  label: string;
  count: number;
  pct: number;
  color: string;
}

export interface MarketplaceQualityMetrics {
  totalCount: number;
  typeDistribution: TypeDistributionItem[];
  difficultyDistribution: DifficultyDistributionItem[];
  expansionRatio: number; // 0 - 100
  topKps: Array<{ kp: string; count: number }>;
}

/**
 * 从集市条目中提取可加入闪卡篮的候选卡片列表
 */
export function extractCartItemsFromMarketplaceItem(
  item?: MarketplaceItem,
): MarketplaceCartItem[] {
  if (!item) return [];

  if (item.embeddedQuestions && item.embeddedQuestions.length > 0) {
    return item.embeddedQuestions.map((q) => ({
      id: q.id,
      sourceItemId: item.id,
      sourceTitle: item.title,
      sourceCategory: item.category,
      stem: q.stem,
      type: (q.type as QuestionType) || "short",
      options: [...(q.options || [])],
      answer: q.answer || "",
      analysis: q.analysis,
      expansion: q.expansion,
      difficulty: q.difficulty ?? 3,
      kp: q.kp || (item.tags[0] ? `${item.title}/${item.tags[0]}` : item.title),
      tags: q.tags && q.tags.length > 0 ? [...q.tags] : [...item.tags],
    }));
  }

  // 若无完整内嵌题，由预览微题生成规范卡片项目
  if (item.previewItems && item.previewItems.length > 0) {
    return item.previewItems.map((prev, idx) => {
      const isJudge = !prev.options?.length && (prev.answer === "对" || prev.answer === "错" || prev.answer === "正确" || prev.answer === "错误");
      const hasOptions = Array.isArray(prev.options) && prev.options.length > 0;
      const type: QuestionType = isJudge ? "judge" : hasOptions ? "single" : "short";
      return {
        id: `${item.id}-prev-${idx + 1}`,
        sourceItemId: item.id,
        sourceTitle: item.title,
        sourceCategory: item.category,
        stem: prev.stem,
        type,
        options: prev.options ? [...prev.options] : [],
        answer: prev.answer || "见解析",
        analysis: prev.analysis,
        difficulty: 3,
        kp: item.tags[0] ? `${item.title}/${item.tags[0]}` : item.title,
        tags: [...item.tags],
      };
    });
  }

  return [];
}

/**
 * 闪卡篮单卡添加（按 ID 去重）
 */
export function addToCart(
  cart: readonly MarketplaceCartItem[],
  newItem: MarketplaceCartItem,
): MarketplaceCartItem[] {
  if (cart.some((c) => c.id === newItem.id)) {
    return [...cart];
  }
  return [...cart, newItem];
}

/**
 * 闪卡篮批量添加（按 ID 去重）
 */
export function addManyToCart(
  cart: readonly MarketplaceCartItem[],
  newItems: readonly MarketplaceCartItem[],
): MarketplaceCartItem[] {
  const existingIds = new Set(cart.map((c) => c.id));
  const additions: MarketplaceCartItem[] = [];
  for (const item of newItems) {
    if (!existingIds.has(item.id)) {
      existingIds.add(item.id);
      additions.push(item);
    }
  }
  return [...cart, ...additions];
}

/**
 * 闪卡篮移除指定卡片
 */
export function removeFromCart(
  cart: readonly MarketplaceCartItem[],
  id: string,
): MarketplaceCartItem[] {
  return cart.filter((c) => c.id !== id);
}

/**
 * 判断指定卡片是否在闪卡篮中
 */
export function isInCart(
  cart: readonly MarketplaceCartItem[],
  id: string,
): boolean {
  return cart.some((c) => c.id === id);
}

/**
 * 清空闪卡篮
 */
export function clearCart(): MarketplaceCartItem[] {
  return [];
}

/**
 * 将闪卡篮项目转换为标准的 LvPackageCard 集合
 */
export function cartItemsToLvPackageCards(
  cart: readonly MarketplaceCartItem[],
): LvPackageCard[] {
  return cart.map((item) => {
    const q: MarketplaceQuestion = {
      id: item.id,
      type: item.type,
      stem: item.stem,
      options: item.options,
      answer: item.answer,
      analysis: item.analysis,
      expansion: item.expansion,
      difficulty: item.difficulty,
      kp: item.kp,
      tags: item.tags,
    };
    return questionToLvPackageCard(q);
  });
}

/**
 * 将闪卡篮中的卡片一键打包为标准的 .lvcards (lvcards.v1) 闪卡分享包
 */
export function cartItemsToLvCardsPackage(
  cart: readonly MarketplaceCartItem[],
  packName?: string,
  generator: string = `siyuan-lv-cards/v${PLUGIN_VERSION}`,
): LvCardsPackage {
  const cards = cartItemsToLvPackageCards(cart);
  const nowStr = new Date().toISOString().slice(0, 10);
  const distinctSources = Array.from(new Set(cart.map((c) => c.sourceTitle)));
  const title = packName || `小驴精选闪卡集 (${nowStr})`;
  const description = `由小驴公共知识集市挑选，汇集 ${distinctSources.join("、")} 等 ${cart.length} 张精选题卡。`;

  const tagSet = new Set<string>();
  for (const card of cards) {
    if (card.tags) {
      for (const t of card.tags) tagSet.add(t);
    }
  }

  return {
    format: "lvcards.v1",
    version: 1,
    createdAt: Date.now(),
    generator,
    deck: {
      id: `cart-deck-${Date.now()}`,
      name: title,
      description,
    },
    cards,
    metadata: {
      cardCount: cards.length,
      tags: Array.from(tagSet),
    },
  };
}

/**
 * 计算卡包品质画像、卡型占比与 FSRS 难度梯队分布
 */
export function calculateItemQualityMetrics(
  item: MarketplaceItem,
): MarketplaceQualityMetrics {
  const questions = extractCartItemsFromMarketplaceItem(item);
  const total = questions.length;

  if (total === 0) {
    return {
      totalCount: 0,
      typeDistribution: [],
      difficultyDistribution: [],
      expansionRatio: 0,
      topKps: [],
    };
  }

  // 1. 题型/卡型分布
  const typeMap: Record<string, number> = {};
  for (const q of questions) {
    typeMap[q.type] = (typeMap[q.type] || 0) + 1;
  }

  const typeConfig: Record<string, { label: string; color: string }> = {
    single: { label: "单选", color: "var(--lv-color-brand)" },
    multiple: { label: "多选", color: "var(--lv-color-data)" },
    judge: { label: "判断", color: "var(--lv-color-success)" },
    fill: { label: "填空", color: "var(--lv-color-warning)" },
    short: { label: "问答", color: "var(--lv-color-brand-strong)" },
  };

  const typeDistribution: TypeDistributionItem[] = Object.keys(typeMap).map((k) => {
    const count = typeMap[k] || 0;
    const cfg = typeConfig[k] || { label: "问答", color: "var(--lv-color-brand)" };
    return {
      type: k as QuestionType,
      label: cfg.label,
      count,
      pct: Math.round((count / total) * 100),
      color: cfg.color,
    };
  });

  // 2. FSRS 难度梯队 (easy: 1-2, medium: 3-4, hard: 5)
  let easy = 0;
  let medium = 0;
  let hard = 0;
  let withExpansion = 0;
  const kpCountMap: Record<string, number> = {};

  for (const q of questions) {
    const diff = q.difficulty ?? 3;
    if (diff <= 2) easy++;
    else if (diff <= 4) medium++;
    else hard++;

    if ((q.expansion && q.expansion.trim().length > 0) || (q.analysis && q.analysis.trim().length > 0)) {
      withExpansion++;
    }

    if (q.kp) {
      kpCountMap[q.kp] = (kpCountMap[q.kp] || 0) + 1;
    }
  }

  const difficultyDistribution: DifficultyDistributionItem[] = (
    [
      {
        level: "easy" as const,
        label: "基础 (★1-2)",
        count: easy,
        pct: Math.round((easy / total) * 100),
        color: "var(--lv-color-success)",
      },
      {
        level: "medium" as const,
        label: "进阶 (★3-4)",
        count: medium,
        pct: Math.round((medium / total) * 100),
        color: "var(--lv-color-brand)",
      },
      {
        level: "hard" as const,
        label: "拔高 (★5)",
        count: hard,
        pct: Math.round((hard / total) * 100),
        color: "var(--lv-color-danger)",
      },
    ] as const
  )
    .filter((d) => d.count > 0)
    .map((d) => ({ ...d }));

  // 3. Top 考点
  const topKps = Object.entries(kpCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([kp, count]) => ({ kp, count }));

  return {
    totalCount: total,
    typeDistribution,
    difficultyDistribution,
    expansionRatio: Math.round((withExpansion / total) * 100),
    topKps,
  };
}

export interface MarketplaceKpNode {
  name: string;
  count: number;
  questionIds: string[];
  children: MarketplaceKpNode[];
}

/**
 * 纯函数：将集市卡片聚合为两级章节/考点大纲全景树
 */
export function buildMarketplaceKpTree(
  items: readonly MarketplaceCartItem[],
): MarketplaceKpNode[] {
  const rootMap = new Map<
    string,
    {
      count: number;
      questionIds: string[];
      subMap: Map<string, { count: number; questionIds: string[] }>;
    }
  >();

  for (const item of items) {
    const rawKp = item.kp || item.tags?.[0] || "通用考点";
    const parts = rawKp.split(/[/／]/).map((p) => p.trim()).filter(Boolean);
    const top = parts[0] || "综合考点";
    const sub = parts[1] || "";

    if (!rootMap.has(top)) {
      rootMap.set(top, { count: 0, questionIds: [], subMap: new Map() });
    }
    const rootEntry = rootMap.get(top)!;
    rootEntry.count++;
    rootEntry.questionIds.push(item.id);

    if (sub) {
      if (!rootEntry.subMap.has(sub)) {
        rootEntry.subMap.set(sub, { count: 0, questionIds: [] });
      }
      const subEntry = rootEntry.subMap.get(sub)!;
      subEntry.count++;
      subEntry.questionIds.push(item.id);
    }
  }

  return Array.from(rootMap.entries()).map(([name, data]) => ({
    name,
    count: data.count,
    questionIds: data.questionIds,
    children: Array.from(data.subMap.entries()).map(([subName, subData]) => ({
      name: subName,
      count: subData.count,
      questionIds: subData.questionIds,
      children: [],
    })),
  }));
}
