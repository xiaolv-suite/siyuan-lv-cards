/**
 * 题库与闪卡集市增量差量同步与发布打包核心
 * (Marketplace Delta Sync & Packaging Engine)
 *
 * 核心能力：
 * 1. 语义化版本比对 (SemVer Comparison)；
 * 2. 本地闪卡/卡包与集市远端版本的细粒度差量比对（新增、修订、无变动）；
 * 3. 非破坏性增量无损合并（Patch & Merge）：保留原块 ID、FSRS 排期与学习历史，无损合入修订；
 * 4. 卡包发布脱敏扫描：自动检测绝对路径与思源块私有链接。
 */

import type { MarketplaceCategory, MarketplaceItem, MarketplaceCatalog, MarketplaceQuestion } from "./marketplace";
import { type LvPackageCard, normalizeCardFingerprint } from "./lvcards-package";

export interface CardDeltaReport {
  hasUpdates: boolean;
  addedCount: number;
  updatedCount: number;
  unchangedCount: number;
  added: LvPackageCard[];
  updated: Array<{
    local: LvPackageCard;
    remote: LvPackageCard;
    changedFields: Array<"markdown" | "question" | "answer" | "memo" | "tags">;
  }>;
  unchanged: LvPackageCard[];
}

export interface PrivacySanitizeWarning {
  cardId: string;
  field: "markdown" | "question" | "answer" | "memo";
  type: "absolute_path" | "internal_uri" | "private_id";
  snippet: string;
  suggestion: string;
}

export interface DeckPackagingOptions {
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  category: MarketplaceCategory;
  tags: string[];
  authorName: string;
  authorUrl?: string;
  version: string;
  license: "CC0" | "CC-BY-4.0" | "CC-BY-NC-4.0" | "Public Domain" | "MIT";
  cards: readonly LvPackageCard[];
}

/**
 * 比较两组语义化版本号
 * 返回: 1 代表 v1 > v2; -1 代表 v1 < v2; 0 代表相等
 */
export function compareSemVer(v1: string, v2: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);

  const [maj1 = 0, min1 = 0, pat1 = 0] = parse(v1);
  const [maj2 = 0, min2 = 0, pat2 = 0] = parse(v2);

  if (maj1 !== maj2) return maj1 > maj2 ? 1 : -1;
  if (min1 !== min2) return min1 > min2 ? 1 : -1;
  if (pat1 !== pat2) return pat1 > pat2 ? 1 : -1;
  return 0;
}

/**
 * 规范化文本比对（去除首尾多余空白与回车换行差异）
 */
function normalizeText(text?: string): string {
  return (text || "").replace(/\r\n/g, "\n").trim();
}

/**
 * 比对本地卡片集与远端新版本卡片集的差异（Delta Analysis）
 */
export function calculateCardsDelta(
  localCards: readonly LvPackageCard[],
  remoteCards: readonly LvPackageCard[],
): CardDeltaReport {
  const localMap = new Map<string, LvPackageCard>();
  const localFpMap = new Map<string, LvPackageCard>();

  for (const c of localCards) {
    if (c.id) localMap.set(c.id, c);
    localFpMap.set(normalizeCardFingerprint(c.markdown), c);
  }

  const added: LvPackageCard[] = [];
  const updated: CardDeltaReport["updated"] = [];
  const unchanged: LvPackageCard[] = [];

  for (const remote of remoteCards) {
    // 优先依据稳定 ID 匹配，其次依据正文指纹匹配
    const local = localMap.get(remote.id) || localFpMap.get(normalizeCardFingerprint(remote.markdown));

    if (!local) {
      added.push(remote);
      continue;
    }

    const changedFields: Array<"markdown" | "question" | "answer" | "memo" | "tags"> = [];

    if (normalizeCardFingerprint(local.markdown) !== normalizeCardFingerprint(remote.markdown)) {
      changedFields.push("markdown");
    }

    if (normalizeText(local.question) !== normalizeText(remote.question)) {
      changedFields.push("question");
    }

    if (normalizeText(local.answer) !== normalizeText(remote.answer)) {
      changedFields.push("answer");
    }

    if (normalizeText(local.memo) !== normalizeText(remote.memo)) {
      changedFields.push("memo");
    }

    const localTags = (local.tags || []).slice().sort().join(",");
    const remoteTags = (remote.tags || []).slice().sort().join(",");
    if (localTags !== remoteTags) {
      changedFields.push("tags");
    }

    if (changedFields.length > 0) {
      updated.push({
        local,
        remote,
        changedFields,
      });
    } else {
      unchanged.push(local);
    }
  }

  return {
    hasUpdates: added.length > 0 || updated.length > 0,
    addedCount: added.length,
    updatedCount: updated.length,
    unchangedCount: unchanged.length,
    added,
    updated,
    unchanged,
  };
}

/**
 * 非破坏性增量无损合并（Non-destructive Patch Merge）
 * 严格保留本地现有卡片的 id、FSRS 调度状态与关联属性，仅合入远端修订正文与便签，并追加新卡片
 */
export function mergeCardsDelta(
  localCards: readonly LvPackageCard[],
  delta: CardDeltaReport,
): LvPackageCard[] {
  const updatedMap = new Map<string, LvPackageCard>();
  for (const item of delta.updated) {
    const patched: LvPackageCard = {
      ...item.local,
      markdown: item.remote.markdown,
      question: item.remote.question ?? item.local.question,
      answer: item.remote.answer ?? item.local.answer,
      memo: item.remote.memo ?? item.local.memo,
      tags: item.remote.tags ?? item.local.tags,
      // 保持本地已有 FSRS 参数不变，避免排期进度受损
      fsrsParams: item.local.fsrsParams ?? item.remote.fsrsParams,
    };
    updatedMap.set(item.local.id, patched);
  }

  const result: LvPackageCard[] = [];
  for (const local of localCards) {
    if (updatedMap.has(local.id)) {
      result.push(updatedMap.get(local.id)!);
    } else {
      result.push(local);
    }
  }

  // 追加新增卡片
  for (const add of delta.added) {
    result.push({
      ...add,
    });
  }

  return result;
}

/**
 * 卡包发布前隐私与脱敏扫描
 * 检查绝对文件路径、思源块内链私有 URI 等
 */
export function scanPrivacyIssues(
  cards: readonly LvPackageCard[],
): PrivacySanitizeWarning[] {
  const warnings: PrivacySanitizeWarning[] = [];

  const checkText = (text: string | undefined, cardId: string, field: "markdown" | "question" | "answer" | "memo") => {
    if (!text) return;

    // 1. 扫描 Windows/Unix 本地绝对文件路径
    const absPathRegex = /(?:[a-zA-Z]:\\|\/Users\/|\/home\/)[^\s")'>]+/g;
    let match: RegExpExecArray | null;
    while ((match = absPathRegex.exec(text)) !== null) {
      warnings.push({
        cardId,
        field,
        type: "absolute_path",
        snippet: match[0].slice(0, 40),
        suggestion: "包含本地绝对文件路径，其他人无法访问，建议转换为相对路径或公网资源直链。",
      });
    }

    // 2. 扫描思源私有块超链接 siyuan://blocks/...
    const siyuanLinkRegex = /siyuan:\/\/blocks\/[a-zA-Z0-9_-]+/g;
    while ((match = siyuanLinkRegex.exec(text)) !== null) {
      warnings.push({
        cardId,
        field,
        type: "internal_uri",
        snippet: match[0],
        suggestion: "包含思源笔记私有块超链接，其他用户的知识库中无法解析该块 ID。",
      });
    }
  };

  for (const c of cards) {
    checkText(c.markdown, c.id, "markdown");
    checkText(c.question, c.id, "question");
    checkText(c.answer, c.id, "answer");
    checkText(c.memo, c.id, "memo");
  }

  return warnings;
}

/**
 * 将本地闪卡包打包为集市条目 (MarketplaceItem)
 */
export function buildMarketplaceItemFromCards(
  options: DeckPackagingOptions,
): MarketplaceItem {
  const previewItems = options.cards.slice(0, 3).map((c) => ({
    stem: c.question || c.markdown.slice(0, 100),
    answer: c.answer || "见卡片背面",
    analysis: c.memo,
  }));

  const safeQuestions: MarketplaceQuestion[] = options.cards.map((c) => ({
    id: c.id,
    type: c.kind === "cloze" ? "fill" : "short",
    stem: c.question || c.markdown,
    answer: c.answer || "",
    analysis: c.memo,
    difficulty: c.fsrsParams?.difficulty ? Math.round(c.fsrsParams.difficulty / 2) : 3,
    tags: c.tags,
  }));

  return {
    id: options.id.trim(),
    title: options.title.trim(),
    subtitle: options.subtitle?.trim(),
    description: options.description.trim(),
    kind: "flashcard_deck",
    category: options.category,
    tags: [...options.tags],
    author: {
      name: options.authorName.trim(),
      url: options.authorUrl?.trim(),
    },
    version: options.version.trim() || "1.0.0",
    itemCount: options.cards.length,
    license: options.license,
    downloadUrl: `embedded:${options.id.trim()}`,
    verified: false,
    updatedAt: new Date().toISOString().slice(0, 10),
    previewItems,
    embeddedQuestions: safeQuestions,
    embeddedCards: [...options.cards],
  };
}

/**
 * 构建符合规范的公共集市目录 JSON 字符串
 */
export function buildMarketplaceCatalogJson(
  catalogName: string,
  catalogDesc: string,
  items: MarketplaceItem[],
): string {
  const catalog: MarketplaceCatalog = {
    v: 1,
    name: catalogName.trim(),
    description: catalogDesc.trim(),
    updatedAt: new Date().toISOString().slice(0, 10),
    items,
  };
  return JSON.stringify(catalog, null, 2);
}
