/**
 * 通用思源 API（非 riff/V2 域）。
 */
import { fetchSyncPost } from "siyuan";
import * as siyuanNs from "siyuan";
import { dataStr } from "@/libs/kernel-response";
import { requestKernelData } from "@/libs/kernel-request";
import type { KernelRequestOptions } from "@/libs/kernel-request";
import { withTimeout } from "@/libs/timeout";
import { mapChunksOrdered } from "@/core/query-chunks";

/** 通用内核请求上限：避免文档/DOM/SQL 请求永久挂起。 */
export const SIYUAN_API_TIMEOUT_MS = 15000;

/** SQL IN 查询分块与并发上限，避免大批量卡片刷新时串行放大等待时间。 */
export const SQL_QUERY_CHUNK_SIZE = 400;
export const SQL_QUERY_CONCURRENCY = 3;

async function kernelPost<T>(
    endpoint: string,
    payload: Record<string, unknown>,
    options: KernelRequestOptions = {},
): Promise<T> {
    return requestKernelData<T>(fetchSyncPost, endpoint, payload, SIYUAN_API_TIMEOUT_MS, options);
}

/** Read-only kernel call with single-flight coalescing and bounded retries. */
function kernelRead<T>(endpoint: string, payload: Record<string, unknown> = {}, options: KernelRequestOptions = {}): Promise<T> {
    return kernelPost<T>(endpoint, payload, {
        readOnly: true,
        retries: 1,
        dedupeKey: `${endpoint}:${JSON.stringify(payload)}`,
        ...options,
    });
}

export interface Notebook {
    id: string;
    name: string;
}

interface RawNotebook {
    id: string;
    name: string;
    closed?: boolean;
    [key: string]: unknown;
}

interface CreateNotebookResult {
    notebook?: { id?: string } | string;
    id?: string;
    [key: string]: unknown;
}

/** 已打开的笔记本列表（供复习范围选择；加密本由内核在拉卡时报错，这里不做前置过滤——AA 组另测） */
export const getNotebooks = async (): Promise<Notebook[]> => {
    const data = await kernelRead<{ notebooks?: RawNotebook[] }>("/api/notebook/lsNotebooks", {});
    const boxes: RawNotebook[] = data?.notebooks ?? [];
    return boxes.filter(b => !b.closed).map(b => ({ id: b.id, name: b.name }));
};

/** 创建笔记本（Anki 导入落点；同名已存在时内核报错由调用方处理） */
export const createNotebook = async (name: string): Promise<string | null> => {
    const d = await kernelPost<CreateNotebookResult>("/api/notebook/createNotebook", { name });
    if (!d) return null;
    if (typeof d.notebook === "object" && d.notebook?.id) return d.notebook.id;
    if (typeof d.notebook === "string") return d.notebook;
    if (typeof d.id === "string") return d.id;
    return null;
};

/** 判定是否为思源内核暂态元数据未就绪异常 */
export function isMetadataNotReadyError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error ?? "");
    return (
        msg.includes("metadata is not ready") ||
        msg.includes("metadata not ready") ||
        msg.includes("not ready") ||
        msg.includes("block not found")
    );
}

/**
 * 按人类可读路径查找文档；同名文档有多个时取最早创建的一个（ID 以创建时间开头），保证每次落到同一处。
 * getIDsByHPath 读文档树而非 SQL 索引，刚建好的文档也能立即查到。
 */
export async function findDocIDByHPath(notebook: string, hpath: string): Promise<string | null> {
    const ids = await kernelPost<string[] | null>("/api/filetree/getIDsByHPath", { notebook, path: hpath });
    if (!Array.isArray(ids) || ids.length === 0) return null;
    return [...ids].sort()[0];
}

/** 在指定父文档下（或笔记本根部）新建文档；带 parentID 时内核不再按路径解析父级，同名父文档不会造成歧义。 */
async function createDocUnder(notebook: string, hpath: string, markdown: string, parentID?: string): Promise<string | null> {
    // 内核冷启动时可能返回 metadata not ready，按退避重试
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt > 0) {
            await new Promise(r => setTimeout(r, 200 * Math.pow(1.5, attempt - 1)));
        }
        try {
            const docID = await kernelPost<string | null>("/api/filetree/createDocWithMd", {
                notebook,
                path: hpath,
                markdown,
                ...(parentID ? { parentID } : {}),
            });
            if (docID) return docID;
        } catch (e: any) {
            lastError = e;
            if (!isMetadataNotReadyError(e)) {
                throw e;
            }
        }
    }
    if (lastError) throw lastError;
    return null;
}

/**
 * Markdown 创建文档，返回文档块 ID（快速制卡/示例卡/报告落点）。
 * 父级逐级“先查后建”：已存在就复用，不存在才新建，避免重复的同名父文档让后续按路径建文档失败。
 * markdown 为空时视为容器文档（快速制卡、标记制卡、示例卡等），同路径已存在则直接复用；
 * 带内容的文档（报告、导入）每次新建。
 */
export const createDocWithMd = async (notebook: string, path: string, markdown: string): Promise<string | null> => {
    const parts = path.split("/").filter(Boolean);
    if (parts.length === 0) return null;
    if (parts[0] === "小驴闪卡") {
        const legacyRoot = await findDocIDByHPath(notebook, "/小驴闪卡");
        if (!legacyRoot) {
            for (const hubAlias of ["05-小驴闪卡", "05-小驴闪卡 · 记忆与复习", "06-小驴闪卡 (siyuan-lv-cards)"]) {
                const hubRoot = await findDocIDByHPath(notebook, `/${hubAlias}`);
                if (hubRoot) {
                    parts[0] = hubAlias;
                    break;
                }
            }
        }
    }
    let parentID: string | undefined;
    let currentPath = "";
    for (const part of parts.slice(0, -1)) {
        currentPath += `/${part}`;
        parentID = (await findDocIDByHPath(notebook, currentPath))
            ?? (await createDocUnder(notebook, currentPath, "", parentID))
            ?? undefined;
        if (!parentID) return null;
    }
    const fullPath = `/${parts.join("/")}`;
    if (!markdown) {
        const existing = await findDocIDByHPath(notebook, fullPath);
        if (existing) return existing;
    }
    return createDocUnder(notebook, fullPath, markdown, parentID);
};

/** 让内核立即提交待写入的 SQL 索引（刚写入的块否则要等内核下一次批量提交才查得到） */
export const flushTransaction = async (): Promise<void> => {
    await kernelPost<unknown>("/api/sqlite/flushTransaction", {});
};

/** 读块的 kramdown 并去掉 IAL 属性行，作为 SQL 索引不可用时的 markdown 兜底 */
export const getBlockMarkdown = async (id: string): Promise<string> => {
    const data = await kernelPost<{ kramdown?: string } | null>("/api/block/getBlockKramdown", { id });
    return String(data?.kramdown ?? "")
        .split("\n")
        .filter(line => !/^\{:\s[^}]*\}$/.test(line.trim()))
        .join("\n")
        .trim();
};

/** 在指定父块下追加块（快速制卡问答对） */
export const appendBlock = async (dataType: "markdown", data: string, parentID: string): Promise<string[]> => {
    // Both supported transaction response shapes are decoded, but writes are never replayed.
    // A transport failure can follow a committed append; switching endpoints would duplicate it.
            const body: any = await kernelPost("/api/block/appendBlock", { dataType, data, parentID });
            const ids: string[] = [];
            const collect = (ops: { id?: string; action?: string }[] | undefined) => {
                for (const op of ops ?? []) {
                    if (op.id && (op.action ?? "insert") !== "delete") ids.push(op.id);
                }
            };
            if (Array.isArray(body)) {
                for (const tx of body) collect(tx?.doOperations);
            } else if (body && typeof body === "object") {
                collect(body?.operations);
                if (ids.length === 0 && typeof body?.id === "string" && body.id) {
                    ids.push(body.id);
                }
            }
            return ids;
};

/** 读块自定义属性（遮挡数据存于 lv-occlusion 属性） */
export const getBlockAttrs = async (id: string): Promise<Record<string, string>> => {
    return await kernelRead<Record<string, string>>("/api/attr/getBlockAttrs", { id }) ?? {};
};

/** Exact direct-child lookup; avoids relying on SQL index visibility after document creation. */
export const getChildBlocks = (id: string): Promise<Array<{ id: string; type: string }>> =>
    kernelRead<Array<{ id: string; type: string }>>("/api/block/getChildBlocks", { id });

/** BX-2 W2（v0.162.0）：更新块内容（markdown）。非 0 抛错，成功返回 true */
export const updateBlock = async (dataType: "markdown", data: string, id: string): Promise<boolean> => {
    await kernelPost<unknown>("/api/block/updateBlock", { dataType, data, id });
    return true;
};

/** 读块 DOM（AQ-20 统一入口）：非 0/字段缺失抛错，调用方 catch 后保留旧卡面 */
export const getBlockDOM = async (id: string): Promise<string> => {
    return dataStr(await kernelRead<Record<string, unknown>>("/api/block/getBlockDOM", { id }), "dom");
};

/** 写块自定义属性 */
export const setBlockAttrs = async (id: string, attrs: Record<string, string>): Promise<void> => {
    await kernelPost<unknown>("/api/attr/setBlockAttrs", { id, attrs });
};

/** 导出文档为 Markdown（AI 向导「当前文档」源） */
export const exportMdContent = async (id: string): Promise<{ hPath: string; content: string }> => {
    const d = (await kernelRead<Record<string, unknown>>("/api/export/exportMdContent", { id })) ?? {};
    return { hPath: String(d.hPath ?? ""), content: String(d.content ?? "") };
};

/** SQL 查询（只读；AI 向导笔记本范围源用） */
export const sqlQuery = async (stmt: string): Promise<Record<string, unknown>[]> => {
    return (await kernelRead<Record<string, unknown>[]>("/api/query/sql", { stmt })) ?? [];
};

export interface AssetProbeResult {
    /** 明确由宿主确认存在的本地资源。 */
    present: string[];
    /** 明确由 statAsset 返回 code=1 判定缺失的本地资源。 */
    missing: string[];
    /** 超时、权限、未知响应等无法判定的资源；调用方不得把它们当成损坏。 */
    unknown: string[];
}

/**
 * 只读检查一批本地媒体引用。
 *
 * statAsset 对不存在资源使用 code=1（而普通 kernelRead 会把非 0 直接抛错），
 * 因此这里保留响应码并把权限/网络/宿主差异降级为 unknown，避免维护扫描误报。
 */
export const probeAssetRefs = async (refs: string[], concurrency = 4): Promise<AssetProbeResult> => {
    const unique = [...new Set(refs.map(ref => String(ref ?? "").trim()).filter(Boolean))];
    const out: AssetProbeResult = { present: [], missing: [], unknown: [] };
    let cursor = 0;
    const worker = async () => {
        while (cursor < unique.length) {
            const index = cursor++;
            const path = unique[index];
            // statAsset only accepts workspace asset paths (or file URLs). The
            // parser deliberately keeps other relative references for display,
            // but they are not safe to label missing without document context.
            if (!/^assets\//i.test(path)) {
                out.unknown.push(path);
                continue;
            }
            try {
                const response = await withTimeout(fetchSyncPost("/api/asset/statAsset", { path }), SIYUAN_API_TIMEOUT_MS, "/api/asset/statAsset");
                const code = Number((response as { code?: unknown } | null)?.code);
                if (code === 0) out.present.push(path);
                else if (code === 1) out.missing.push(path);
                else out.unknown.push(path);
            } catch {
                out.unknown.push(path);
            }
        }
    };
    const workers = Array.from({ length: Math.min(Math.max(1, concurrency), unique.length || 1) }, () => worker());
    await Promise.all(workers);
    out.present.sort();
    out.missing.sort();
    out.unknown.sort();
    return out;
};

export interface BlockDocInfo {
    rootID: string;
    notebookID: string;
}

/** 块 → 文档归属映射（AQ-12 文档维度）：分块 IN 查询，查不到的块不在 Map 中（缺失口径） */
export const getBlockDocMap = async (blockIDs: string[]): Promise<Map<string, BlockDocInfo>> => {
    const out = new Map<string, BlockDocInfo>();
    const chunks = Array.from({ length: Math.ceil(blockIDs.length / SQL_QUERY_CHUNK_SIZE) }, (_, index) =>
        blockIDs.slice(index * SQL_QUERY_CHUNK_SIZE, (index + 1) * SQL_QUERY_CHUNK_SIZE),
    );
    const rowsByChunk = await mapChunksOrdered(chunks, chunkIDs => {
        const chunk = chunkIDs.map(id => `'${id.replace(/'/g, "''")}'`).join(",");
        return sqlQuery(`SELECT id, root_id, box FROM blocks WHERE id IN (${chunk})`);
    }, SQL_QUERY_CONCURRENCY);
    for (const rows of rowsByChunk) {
        for (const r of rows) {
            out.set(String(r.id), { rootID: String(r.root_id ?? ""), notebookID: String(r.box ?? "") });
        }
    }
    return out;
};

/** 文档 ID → 标题（根块 content 首行；空标题由调用方回退展示文档 ID） */
export const getDocTitles = async (docIDs: string[]): Promise<Map<string, string>> => {
    const out = new Map<string, string>();
    const chunks = Array.from({ length: Math.ceil(docIDs.length / SQL_QUERY_CHUNK_SIZE) }, (_, index) =>
        docIDs.slice(index * SQL_QUERY_CHUNK_SIZE, (index + 1) * SQL_QUERY_CHUNK_SIZE),
    );
    const rowsByChunk = await mapChunksOrdered(chunks, chunkIDs => {
        const chunk = chunkIDs.map(id => `'${id.replace(/'/g, "''")}'`).join(",");
        return sqlQuery(`SELECT id, content FROM blocks WHERE id IN (${chunk})`);
    }, SQL_QUERY_CONCURRENCY);
    for (const rows of rowsByChunk) {
        for (const r of rows) {
            out.set(String(r.id), String(r.content ?? "").split("\n")[0].trim());
        }
    }
    return out;
};

/** 思源内核版本号（自诊断用） */
export const kernelVersion = async (): Promise<string> => {
    return String(await kernelRead<unknown>("/api/system/version", {}) ?? "?");
};

/** 读取小驴考试插件配置（若已安装），用于考期感知联动 */
export const getExamPluginConfig = async (): Promise<{ examDate?: string } | null> => {
    try {
        const res = await kernelRead<any>("/api/file/getFile", { path: "/data/storage/petal/siyuan-exam/config.json" });
        if (res && typeof res === "object") {
            return res;
        }
        if (typeof res === "string") {
            return JSON.parse(res);
        }
    } catch (error) {
        // 跨插件私有配置读取失败属预期降级（未安装/未首次保存/格式变化），
        // 返回值保持 null；仅记录可诊断日志，避免静默吞错。
        console.warn("[siyuan-lv-cards] 读取小驴考试配置失败，考期联动按未配置处理", error);
    }
    return null;
};

/** 移动端按 docId 打开原笔记（AX-8：经 src/api 收口，兼容 3.8.4–3.8.10+） */
export function canOpenMobileFile(): boolean {
    return typeof (siyuanNs as Record<string, unknown>).openMobileFileById === "function";
}

export function openMobileFile(app: unknown, id: string): void {
    const fn = (siyuanNs as Record<string, unknown>).openMobileFileById;
    if (typeof fn === "function") {
        (fn as (a: unknown, docId: string) => void)(app, id);
    }
}
