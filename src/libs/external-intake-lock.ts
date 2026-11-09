/** The same origin lock is shared by intake and backup/restore snapshots. */
let fallbackQueue: Promise<unknown> = Promise.resolve();
export function withExternalIntakeLock<T>(task: () => Promise<T>): Promise<T> {
    if (typeof navigator !== "undefined" && navigator.locks?.request) return navigator.locks.request("lv-cards:external-intake-v1", task);
    if (typeof window !== "undefined") return Promise.reject(new Error("Cross-window intake lock unavailable; no document written"));
    const next = fallbackQueue.catch(() => undefined).then(task); fallbackQueue = next; return next;
}
