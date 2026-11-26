/**
 * 复习调度与会话入口协调中枢（ReviewCoordinator）
 * 集中管理复习范围（Scope）解析、冲刺模式（CramMode）标记、入口上下文（EntryContext）持久化
 * 以及向 Tab / 全屏宿主路由分发。
 */

import { buildReviewScopeKey } from "./palette-navigation";
import { upsertContext, type EntryContextData, type EntryKind } from "./entry-context";

export interface ReviewEntryInfo {
    entryKind: EntryKind;
    sourceID: string;
    returnPoint: string;
}

export interface ReviewCoordinatorOptions {
    getEntryContexts: () => EntryContextData;
    setEntryContexts?: (val: EntryContextData) => void;
    saveEntryContexts: () => Promise<void>;
    openReviewTab: (options: { scope: string; cram: boolean; entry?: ReviewEntryInfo }) => void;
}

export class ReviewCoordinator {
    private readonly options: ReviewCoordinatorOptions;

    constructor(options: ReviewCoordinatorOptions) {
        this.options = options;
    }

    public openReviewScope(
        scopeKindOrKey: string,
        scopeIdOrCram?: string | boolean,
        cram = false,
        entrySourceID = "",
    ): void {
        let scope = scopeKindOrKey;
        let isCram = cram;
        if (typeof scopeIdOrCram === "boolean") {
            isCram = scopeIdOrCram;
        } else if (typeof scopeIdOrCram === "string" && scopeIdOrCram) {
            scope = buildReviewScopeKey(scopeKindOrKey as any, scopeIdOrCram);
        }

        this.openReviewWithEntry(
            scope,
            isCram,
            entrySourceID
                ? { entryKind: "report", sourceID: entrySourceID, returnPoint: "hub:exam" }
                : undefined,
        );
    }

    public openReviewWithEntry(
        scope: string,
        cram: boolean,
        entry?: ReviewEntryInfo,
    ): void {
        if (entry && entry.sourceID) {
            const next = upsertContext(this.options.getEntryContexts(), {
                entryKind: entry.entryKind,
                sourceID: entry.sourceID,
                scopeKey: scope,
                goalID: "",
                returnPoint: entry.returnPoint,
                createdAt: Date.now(),
            });
            if (this.options.setEntryContexts) {
                this.options.setEntryContexts(next);
            } else {
                this.options.getEntryContexts().contexts = next.contexts;
            }
            void this.options.saveEntryContexts();
        }
        this.options.openReviewTab({ scope, cram, entry });
    }
}

export function createReviewCoordinator(options: ReviewCoordinatorOptions): ReviewCoordinator {
    return new ReviewCoordinator(options);
}
