/**
 * T13 ⌘K 命令面板（纯逻辑，node 可单测；docs/41 P0 · docs/42 §3.10）。
 * 设计：动作/导航统一为扁平命令表，面板组件只消费过滤+分组结果；
 * 匹配口径 = label/keywords 子串包含（小写折叠），空查询保持原序全量。
 */

export interface PaletteCommand {
    /** 稳定 id（选中态/测试断言用） */
    id: string;
    /** 分组键：同组连续渲染；组顺序 = 首次出现顺序 */
    group: string;
    /** 展示文本 */
    label: string;
    /** 右侧提示（kbd 或说明），可选 */
    hint?: string;
    /** 额外匹配词（空格分隔），如英文别名，可选 */
    keywords?: string;
}

export interface PaletteGroup {
    group: string;
    items: PaletteCommand[];
}

/** 小写折叠匹配：label 或 keywords 含 query 即命中 */
export function matchPaletteCommand(cmd: PaletteCommand, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const haystack = `${cmd.label}\n${cmd.keywords ?? ""}`.toLowerCase();
    return haystack.includes(q);
}

export const RECENT_COMMANDS_KEY = "lv-cards.palette.recent-commands";

/**
 * 读取最近执行的命令 ID 列表（CF-16）
 */
export function loadRecentCommandIds(storage?: Storage): string[] {
    const s = storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
    if (!s) return [];
    try {
        const raw = s.getItem(RECENT_COMMANDS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, 3) : [];
    } catch {
        return [];
    }
}

/**
 * 记录执行的命令 ID 到最近常用
 */
export function recordRecentCommandId(id: string, storage?: Storage): string[] {
    if (!id) return [];
    const s = storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
    const existing = loadRecentCommandIds(s).filter(x => x !== id);
    const updated = [id, ...existing].slice(0, 3);
    if (s) {
        try {
            s.setItem(RECENT_COMMANDS_KEY, JSON.stringify(updated));
        } catch { /* 旁路 */ }
    }
    return updated;
}

/** 过滤 + 按组聚合（组序 = 首次出现顺序，组内保持原序）；limit 限制总条数；未输入搜索词时置顶展示最近常用 */
export function filterPaletteCommands(
    cmds: PaletteCommand[],
    query: string,
    limit = 12,
    recentIds: string[] = []
): PaletteGroup[] {
    const groups: PaletteGroup[] = [];
    const isBlank = !query.trim();

    // 空查询时若有最近执行历史，置顶注入「最近常用」组
    if (isBlank && recentIds.length > 0) {
        const cmdMap = new Map(cmds.map(c => [c.id, c]));
        const recentCmds = recentIds.map(id => cmdMap.get(id)).filter((c): c is PaletteCommand => Boolean(c));
        if (recentCmds.length > 0) {
            groups.push({
                group: "recent",
                items: recentCmds.map(c => ({ ...c, group: "recent" })),
            });
        }
    }

    const byGroup = new Map<string, PaletteCommand[]>();
    let total = 0;
    for (const cmd of cmds) {
        if (total >= limit) break;
        if (!matchPaletteCommand(cmd, query)) continue;
        let bucket = byGroup.get(cmd.group);
        if (!bucket) {
            bucket = [];
            byGroup.set(cmd.group, bucket);
            groups.push({ group: cmd.group, items: bucket });
        }
        bucket.push(cmd);
        total += 1;
    }
    return groups;
}

/** 扁平化（键盘上下移动的可见序 = 组序 + 组内序） */
export function flattenPaletteGroups(groups: PaletteGroup[]): PaletteCommand[] {
    return groups.flatMap(g => g.items);
}
