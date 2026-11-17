/** Independent kernel file I/O. Never treats Plugin.loadData's cache as disk proof. */
export class PluginFileError extends Error {
    constructor(message: string, readonly outcome: "not-sent" | "unknown") { super(message); this.name = "PluginFileError"; }
}

function filePath(plugin: string, key: string): string {
    if (!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(plugin) || !/^[a-z0-9][a-z0-9._-]{0,127}\.json$/i.test(key) || key.includes("..")) throw new PluginFileError("Invalid private JSON path", "not-sent");
    return `/data/storage/petal/${plugin}/${key}`;
}

/** Only an explicit missing-file response is empty. Permission, transport and malformed JSON reject. */
export async function readPluginJsonFile(plugin: string, key: string, fetcher: typeof fetch = fetch): Promise<unknown | null> {
    const path = filePath(plugin, key), controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
        const response = await fetcher("/api/file/getFile", { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }), signal: controller.signal });
        if (response.status === 404) return null;
        const value = JSON.parse(await response.text());
        if (response.status === 202 && value?.code === 404 && value.data === null) return null;
        if (response.status !== 200) throw new Error(`File read rejected (${response.status})`);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid private JSON document");
        if (typeof value.code === "number" && value.code !== 0 && "data" in value) throw new Error(`Kernel rejected private JSON read (code=${value.code})`);
        return value;
    } catch (error) { throw new PluginFileError(error instanceof Error ? error.message : String(error), "not-sent"); }
    finally { clearTimeout(timer); }
}

export async function writePluginJsonFile(plugin: string, key: string, value: unknown, fetcher: typeof fetch = fetch): Promise<void> {
    const path = filePath(plugin, key);
    let serialized: string;
    try { serialized = JSON.stringify(value); if (!serialized) throw new Error("Invalid JSON payload"); }
    catch (error) { throw new PluginFileError(String(error), "not-sent"); }
    const body = new FormData();
    body.append("path", path); body.append("isDir", "false"); body.append("modTime", String(Date.now()));
    body.append("file", new Blob([serialized], { type: "application/json" }), key);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
    try {
        const response = await fetcher("/api/file/putFile", { method: "POST", credentials: "same-origin", redirect: "error", body, signal: controller.signal });
        const receipt = await response.json();
        if (!response.ok || receipt?.code !== 0) throw new Error(`File write rejected (${response.status}, code=${String(receipt?.code)})`);
        const readback = await readPluginJsonFile(plugin, key, fetcher);
        if (JSON.stringify(readback) !== serialized) throw new Error("Independent file readback differs");
    } catch (error) { throw new PluginFileError(error instanceof Error ? error.message : String(error), "unknown"); }
    finally { clearTimeout(timer); }
}
