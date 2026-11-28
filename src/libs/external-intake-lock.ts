/** The same origin lock is shared by intake and backup/restore snapshots. */
let fallbackQueue: Promise<unknown> = Promise.resolve();
export function withExternalIntakeLock<T>(task: () => Promise<T>): Promise<T> {
    if (typeof navigator !== "undefined" && navigator.locks?.request) {
        const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(new Error("External intake lock acquisition timeout")), 15000) : null;
        const opts = ctrl ? { signal: ctrl.signal } : undefined;
        return navigator.locks.request("lv-cards:external-intake-v1", opts as any, async () => {
            if (timer) clearTimeout(timer);
            return await task();
        }).finally(() => {
            if (timer) clearTimeout(timer);
        });
    }
    if (typeof window !== "undefined") return Promise.reject(new Error("Cross-window intake lock unavailable; no document written"));
    const next = fallbackQueue.catch(() => undefined).then(task); fallbackQueue = next; return next;
}
