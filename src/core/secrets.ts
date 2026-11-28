/**
 * 小驴闪卡 · 安全密钥槽位管理（5 槽位零 CAS 密钥边界）
 *
 * 严格遵循全生态安全规范：
 * 1. 明文密钥（aiKey / aiFallbackKey / ankiClientKey）严禁落入 settings.json / localStorage / DOM value；
 * 2. 统一通过 plugin.getSecret(slot) 读取，通过单窗单飞合并 POST /api/setting/setSecrets 写入；
 * 3. settings.json 仅保留脱敏后的状态标记（*Configured: boolean），密钥字段持久化前强制置空。
 */

export const CARDS_SECRET_SLOTS = {
    aiKey: "lv_ai_secret_tier2_apikey",
    aiFallbackKey: "lv_ai_secret_tier2_fallback_apikey",
    ankiClientKey: "lv_cards_anki_client_key",
} as const;

export type CardsSecretField = keyof typeof CARDS_SECRET_SLOTS;
export type CardsSecretSlot = (typeof CARDS_SECRET_SLOTS)[CardsSecretField];

export interface SecretItemRecord {
    name?: string;
    key?: string;
    value: string;
    allowedHosts?: string[] | null;
}

export interface SecretPluginHost {
    getSecret?: (name: string) => string;
}

const singleFlightQueues = new WeakMap<object, Promise<unknown>>();
const fallbackQueueOwner = {};

export function readCardsSecretSlot(plugin: SecretPluginHost | null | undefined, slot: CardsSecretSlot): string {
    if (plugin && typeof plugin.getSecret === "function") {
        try {
            const val = String(plugin.getSecret(slot) ?? "");
            if (val) return val;
        } catch {
            // fallback to global secrets cache if available
        }
    }
    try {
        const items = (globalThis as any)?.window?.siyuan?.config?.secrets?.items;
        if (Array.isArray(items)) {
            const found = items.find((it: any) => it && (it.name === slot || it.key === slot));
            if (found && typeof found.value === "string") {
                return found.value;
            }
        }
    } catch {
        // ignore
    }
    return "";
}

export async function bindCardsSecretSlots(options: {
    updates: Partial<Record<CardsSecretSlot, string>>;
    host?: any;
    fetchFn?: typeof fetch;
    plugin?: SecretPluginHost;
}): Promise<{ ok: boolean; readOnlyFallback: boolean; reason: string }> {
    const entries = Object.entries(options.updates).filter(
        (pair): pair is [CardsSecretSlot, string] => typeof pair[0] === "string" && typeof pair[1] === "string",
    );
    if (entries.length === 0) {
        return { ok: true, readOnlyFallback: false, reason: "no_changes" };
    }

    const host = options.host ?? (typeof window !== "undefined" ? (window as any) : {});
    const isReadOnly =
        host?.isReadOnly === true ||
        host?.siyuan?.isReadOnly === true ||
        host?.isAdmin === false ||
        host?.settingsWindow === true ||
        host?.openInWindow === true;

    if (isReadOnly) {
        return { ok: false, readOnlyFallback: true, reason: "readonly_or_non_admin" };
    }

    const queueKey = (host && typeof host === "object") ? (host as object) : fallbackQueueOwner;
    const prev = singleFlightQueues.get(queueKey) || Promise.resolve();
    const run = prev.catch(() => {}).then(async () => {
        const fetchImpl = options.fetchFn || host?.fetch || (typeof fetch === "function" ? fetch : null);
        if (!fetchImpl) {
            return { ok: false, readOnlyFallback: true, reason: "fetch_unavailable" };
        }

        const existingItems: SecretItemRecord[] = Array.isArray(host?.siyuan?.config?.secrets?.items)
            ? host.siyuan.config.secrets.items
                .filter(Boolean)
                .map((it: any) => ({
                    name: it.name || it.key || "",
                    value: typeof it.value === "string" ? it.value : "",
                    allowedHosts: it.allowedHosts ?? null,
                }))
            : [];

        const nextItems = [...existingItems];
        for (const [slot, val] of entries) {
            const idx = nextItems.findIndex((it) => it.name === slot);
            if (!val) {
                if (idx >= 0) nextItems.splice(idx, 1);
            } else {
                const record: SecretItemRecord = {
                    name: slot,
                    value: val,
                    allowedHosts: idx >= 0 ? (nextItems[idx].allowedHosts ?? null) : null,
                };
                if (idx >= 0) nextItems[idx] = record;
                else nextItems.push(record);
            }
        }

        let resp: Response;
        try {
            resp = await fetchImpl("/api/setting/setSecrets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items: nextItems }),
            });
        } catch (err) {
            return {
                ok: false,
                readOnlyFallback: true,
                reason: err instanceof Error ? err.message : "network_error",
            };
        }

        if (resp.status === 401 || resp.status === 403) {
            return { ok: false, readOnlyFallback: true, reason: `http_${resp.status}` };
        }
        if (!resp.ok) {
            return { ok: false, readOnlyFallback: false, reason: `http_${resp.status}` };
        }

        try {
            const cloned = typeof resp.clone === "function" ? resp.clone() : resp;
            const json = await cloned.json() as { code?: number; msg?: string; data?: { items?: SecretItemRecord[] } };
            if (typeof json?.code === "number" && json.code !== 0) {
                return {
                    ok: false,
                    readOnlyFallback: json.code === 401 || json.code === 403,
                    reason: json.msg || `api_code_${json.code}`,
                };
            }
            if (host?.siyuan?.config) {
                if (!host.siyuan.config.secrets) host.siyuan.config.secrets = { items: [] };
                host.siyuan.config.secrets.items = Array.isArray(json?.data?.items)
                    ? json.data.items
                    : nextItems;
            }
        } catch {
            if (host?.siyuan?.config) {
                if (!host.siyuan.config.secrets) host.siyuan.config.secrets = { items: [] };
                host.siyuan.config.secrets.items = nextItems;
            }
        }
        // 写后回读核验：确认 readCardsSecretSlot / 宿主密钥表已真实落库且与写入值一致，才允许返回 ok 并清理旧明文
        for (const [slot, expected] of entries) {
            let actual = readCardsSecretSlot(options.plugin, slot);
            if (!actual && Array.isArray(host?.siyuan?.config?.secrets?.items)) {
                const found = host.siyuan.config.secrets.items.find((it: any) => it && (it.name === slot || it.key === slot));
                if (found && typeof found.value === "string") {
                    actual = found.value;
                }
            }
            if (actual !== expected) {
                return { ok: false, readOnlyFallback: true, reason: "secret_readback_mismatch" };
            }
        }
        return { ok: true, readOnlyFallback: false, reason: "ok" };
    });

    singleFlightQueues.set(queueKey, run);
    return run;
}
