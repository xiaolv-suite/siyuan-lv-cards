/**
 * 题库与闪卡公共集市运行时服务 (Marketplace Service)
 * 适配小驴闪卡与小驴考试通用架构，实现订阅源拉取、解析与闪卡原生一键入库
 */

import {
  type MarketplaceCatalog,
  type MarketplaceItem,
  DEFAULT_MARKETPLACE_CATALOG,
  validateMarketplaceCatalog,
  marketplaceItemToLvCardsPackage,
} from "./marketplace";
import { getRiffDecks, createRiffDeck, addRiffCards, type RiffDeck } from "@/api/riff";
import { getNotebooks, createDocWithMd, appendBlock, setBlockAttrs } from "@/api/siyuan";
import { withDocLock } from "@/libs/lv-notice-kit";
import { applyPackageCardMetadata } from "./lvcards-import";

export interface CustomMarketplaceSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  addedAt: string;
}

const STORAGE_KEY = "siyuan_lv_cards_marketplace_sources_v1";

/**
 * 读取本地保存的自定义订阅源列表
 */
export function loadMarketplaceSources(
  storageReader?: (k: string) => string | null,
): CustomMarketplaceSource[] {
  try {
    const raw = storageReader
      ? storageReader(STORAGE_KEY)
      : typeof localStorage !== "undefined"
      ? localStorage.getItem(STORAGE_KEY)
      : null;
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter((s) => s && typeof s.id === "string" && typeof s.url === "string");
  } catch {
    return [];
  }
}

/**
 * 保存自定义订阅源列表
 */
export function saveMarketplaceSources(
  sources: CustomMarketplaceSource[],
  storageWriter?: (k: string, v: string) => void,
): void {
  try {
    const json = JSON.stringify(sources);
    if (storageWriter) {
      storageWriter(STORAGE_KEY, json);
    } else if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, json);
    }
  } catch {}
}

/**
 * 拉取订阅源目录（支持官方源与第三方外部直链）
 */
export async function fetchMarketplaceCatalog(
  sourceUrl: string,
  fetchFn: typeof fetch = typeof fetch !== "undefined" ? fetch : (() => Promise.reject(new Error("fetch not available"))),
): Promise<{
  catalog: MarketplaceCatalog;
  error?: string;
  fromCache?: boolean;
}> {
  if (!sourceUrl || sourceUrl === "official") {
    return { catalog: DEFAULT_MARKETPLACE_CATALOG };
  }

  try {
    const resp = await fetchFn(sourceUrl, {
      headers: { Accept: "application/json" },
      mode: "cors",
    });

    if (!resp.ok) {
      return {
        catalog: DEFAULT_MARKETPLACE_CATALOG,
        error: `订阅源网络请求失败（HTTP 状态码: ${resp.status}）`,
      };
    }

    const json = await resp.json();
    const res = validateMarketplaceCatalog(json);
    if (res.valid && res.catalog) {
      return { catalog: res.catalog };
    }
    return {
      catalog: DEFAULT_MARKETPLACE_CATALOG,
      error: `订阅源格式校验未通过：${res.errors.join("; ")}`,
    };
  } catch (e) {
    return {
      catalog: DEFAULT_MARKETPLACE_CATALOG,
      error: `拉取订阅源发生异常：${String(e instanceof Error ? e.message : e)}`,
    };
  }
}

export interface InstallResult {
  success: boolean;
  count: number;
  deckId?: string;
  deckName?: string;
  docId?: string;
  error?: string;
}

export interface InstallMarketplaceDeps {
  getRiffDecks?: () => Promise<RiffDeck[]>;
  createRiffDeck?: (name: string) => Promise<RiffDeck>;
  addRiffCards?: (deckId: string, blockIDs: string[]) => Promise<unknown>;
  getNotebooks?: () => Promise<{ id: string; name: string }[]>;
  createDocWithMd?: (notebook: string, path: string, markdown: string) => Promise<string | null>;
  appendBlock?: (dataType: "markdown", data: string, parentID: string) => Promise<string[]>;
  setBlockAttrs?: (id: string, attrs: Record<string, string>) => Promise<void>;
}

/**
 * 将集市资源项直接一键获取入库至思源笔记（闪卡原生化调度）
 */
export async function installMarketplaceItemToDeck(
  item: MarketplaceItem,
  deps: InstallMarketplaceDeps = {},
): Promise<InstallResult> {
  const _getRiffDecks = deps.getRiffDecks ?? getRiffDecks;
  const _createRiffDeck = deps.createRiffDeck ?? createRiffDeck;
  const _addRiffCards = deps.addRiffCards ?? addRiffCards;
  const _getNotebooks = deps.getNotebooks ?? getNotebooks;
  const _createDocWithMd = deps.createDocWithMd ?? createDocWithMd;
  const _appendBlock = deps.appendBlock ?? appendBlock;
  const _setBlockAttrs = deps.setBlockAttrs ?? setBlockAttrs;

  try {
    // 1. 将集市资源转为标准的 lvcards.v1 卡包数据
    const pkg = marketplaceItemToLvCardsPackage(item);
    if (!pkg.cards || pkg.cards.length === 0) {
      return { success: false, count: 0, error: "卡包中未包含任何有效卡片" };
    }

    // 2. 检查或新建对应卡包
    const targetDeckName = item.title.trim();
    let targetDeckId = "";
    try {
      const existingDecks = await _getRiffDecks();
      const matched = existingDecks.find((d) => d.name.trim() === targetDeckName);
      if (matched) {
        targetDeckId = matched.id;
      } else {
        const created = await _createRiffDeck(targetDeckName);
        if (created?.id) {
          targetDeckId = created.id;
        }
      }
    } catch (deckErr) {
      return { success: false, count: 0, error: `创建或检索卡包失败: ${String(deckErr)}` };
    }

    if (!targetDeckId) {
      return { success: false, count: 0, error: "无法初始化闪卡目标卡包" };
    }

    // 3. 定位用于存放闪卡块的笔记本（优先小驴统一空间笔记本）
    const notebooks = await _getNotebooks();
    if (!notebooks || notebooks.length === 0) {
      return { success: false, count: 0, error: "思源中未检测到已打开的可用笔记本，请先在思源中打开或新建笔记本" };
    }
    const targetNb = notebooks.find((n) => /小驴空间|小驴生态统一测试空间|小驴笔记本|小驴闪卡/.test(n.name || "")) ?? notebooks[0];

    // 4. 创建专属于该卡包的存储文档
    const safeDocTitle = targetDeckName.replace(/[\\/:*?"<>|]/g, "_");
    const docPath = `/小驴闪卡/公共集市/${safeDocTitle}`;
    const docId = await _createDocWithMd(
      targetNb.id,
      docPath,
      `# ${targetDeckName}\n\n> 来源：小驴公共集市 · ${item.author?.name || "官方公版"}\n> 许可协议：${item.license} | 版本：${item.version}\n> 简介：${item.description}\n`,
    );

    if (!docId) {
      return { success: false, count: 0, error: "在笔记本中创建闪卡归档文档失败" };
    }

    // 5. 逐卡或分批将卡片 Markdown 内容追加到文档中（文档写锁排队，避免并发冲突）
    const createdBlockIds: string[] = await withDocLock(docId, async () => {
      const blockIds: string[] = [];
      for (const card of pkg.cards) {
        // 组装格式良好的卡片内容（包含问答结构和卡片标记）
        const cardMd = `${card.markdown}\n{: custom-riff-decks="${targetDeckId}" }`;
        const blockRes = await _appendBlock("markdown", cardMd, docId);
        if (Array.isArray(blockRes) && blockRes.length > 0) {
          const blkId = typeof blockRes[0] === "string" ? blockRes[0] : (blockRes[0] as any)?.id;
          if (blkId) {
            blockIds.push(blkId);
          }
        }
      }
      return blockIds;
    });

    if (createdBlockIds.length === 0) {
      return { success: false, count: 0, error: "卡片块写入思源文档失败" };
    }

    // 6. 将生成的块关联加入 Riff 卡包
    await _addRiffCards(targetDeckId, createdBlockIds);

    // 7. 写入 memo 与 tags 等随卡流转属性
    await applyPackageCardMetadata(pkg.cards.slice(0, createdBlockIds.length), createdBlockIds, _setBlockAttrs);

    return {
      success: true,
      count: createdBlockIds.length,
      deckId: targetDeckId,
      deckName: targetDeckName,
      docId,
    };
  } catch (err) {
    return {
      success: false,
      count: 0,
      error: String(err instanceof Error ? err.message : err),
    };
  }
}
