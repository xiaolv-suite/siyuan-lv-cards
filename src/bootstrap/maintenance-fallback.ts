/**
 * 维护修复与来源健康降级兜底器（Maintenance Fallback）
 */

import { getBlockAttrs, updateBlock, sqlQuery, setBlockAttrs, probeAssetRefs } from "@/api/siyuan";
import { getRiffCardsByBlockIDs } from "@/api/riff";
import { validateCardEntry } from "@/core/card-entry-gate";
import { appendVersion, versionsOf } from "@/core/content-versions";
import { CONTENT_VERSIONS_DATA, ERROR_TAGS_DATA } from "@/bootstrap/storage-keys";
import { tagError, normalizeErrorTags, type ErrorReason } from "@/core/error-reasons";
import { buildErrorReasonAttrs } from "@/core/block-attributes";
import { localDate } from "@/core/revlog";
import { lvLog } from "@/libs/log";
import { fnv1a } from "@/core/ai-provenance";
import { extractMediaRefs } from "@/core/media-refs";
import { type SourceCurrentFacts } from "@/core/source-health";
import {
    acknowledgeSourceHealth as acknowledgeSourceHealthStore,
    reconcileSourceHealth,
    sourceBaselineMarkdown,
} from "@/core/source-health-store";

function cloneStore<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

export async function doFallbackSaveBlockContentVersion(host: any, blockID: string, md: string, recovery?: any): Promise<boolean | string> {
    const queue = host.contentVersionQueue ?? Promise.resolve();
    const operation = queue.then(async () => {
        const restoring = recovery?.blockID === blockID && recovery.markdown === md;
        const riff = restoring ? null : await getRiffCardsByBlockIDs([blockID]);
        if (!restoring && (!riff?.blocks || riff.blocks.length === 0 || riff.blocks.some((b: any) => b.id === blockID))) {
            const attrs = await getBlockAttrs(blockID).catch(() => ({}));
            const decision = validateCardEntry({ blockID, markdown: md, attrs, exists: true, occlusionValid: await host.hasValidOcclusionCard?.(blockID, md) });
            if (!decision.ok) {
                const errorKey = decision.issue === "empty-card" ? "qualityEmpty" : decision.issue === "missing-answer" ? "qualityMissingAnswer" : decision.issue === "missing-question" ? "qualityMissingQuestion" : decision.issue === "invalid-occlusion" ? "qualityInvalidOcclusion" : decision.issue === "missing-block" ? "qualityMissingBlock" : "qualityInvalidMarkup";
                return (host.i18n?.editor?.[errorKey] ?? host.i18n?.editor?.qualityInvalidMarkup ?? decision.issue) as string;
            }
        }
        let baseVersions = host.contentVersions;
        if (!restoring && host.sourceHealth && versionsOf(baseVersions, blockID).length === 0) {
            const initialMd = host.sourceHealth?.entries?.[blockID]?.baselineMarkdown;
            if (initialMd && initialMd !== md) baseVersions = appendVersion(baseVersions, blockID, initialMd, Date.now() - 1, "editor");
        }
        await updateBlock("markdown", md, blockID);
        const nextVersions = appendVersion(host.contentVersions, blockID, md, Date.now(), "editor");
        const persistSave = host.storageCoordinator ? (k: string, d: any) => host.storageCoordinator.save(k, d) : (k: string, d: any) => host.persist.save(k, d);
        await persistSave(CONTENT_VERSIONS_DATA, nextVersions);
        host.contentVersions = nextVersions;
        return true;
    });
    host.contentVersionQueue = operation.then(() => undefined, () => undefined);
    return operation;
}

export async function rememberPluginSourceFingerprint(plugin: any, blockID: string, rootID?: string, markdown?: string): Promise<void> {
    let md = markdown; let root = rootID;
    if (md === undefined || root === undefined) {
        try {
            const rows = await sqlQuery(`SELECT markdown, root_id FROM blocks WHERE id='${blockID.replace(/'/g, "''")}' LIMIT 1`);
            if (md === undefined) md = typeof rows[0]?.markdown === "string" ? rows[0].markdown : "";
            if (root === undefined) root = String(rows[0]?.root_id ?? "");
        } catch { return; }
    }
    const cleanMd = String(md ?? "");
    if (!cleanMd.trim()) return;
    try {
        if (plugin.contentVersions && versionsOf(plugin.contentVersions, blockID).length === 0) {
            const nextVersions = appendVersion(plugin.contentVersions, blockID, cleanMd, Date.now(), "editor");
            plugin.contentVersions = nextVersions;
            const persistSave = plugin.storageCoordinator
                ? (k: string, d: any) => plugin.storageCoordinator.save(k, d)
                : plugin.persist
                ? (k: string, d: any) => plugin.persist.save(k, d)
                : null;
            if (persistSave) {
                await persistSave(CONTENT_VERSIONS_DATA, nextVersions).catch(() => {});
            }
        }
        if (typeof plugin.sourceHealthMutations === "function") {
            const mediaRefs = extractMediaRefs(cleanMd).map((ref) => ref.normalized);
            const fingerprint = {
                blockID: String(blockID),
                rootID: String(root ?? ""),
                contentHash: fnv1a(cleanMd),
                mediaRefs,
                baselineMarkdown: cleanMd,
            };
            await plugin.sourceHealthMutations((next: any) => {
                const updated = acknowledgeSourceHealthStore(next, fingerprint, Date.now(), { mediaPresent: {} });
                next.entries = updated.entries;
            }).catch(() => {});
        }
    } catch {}
}

export function tagPluginErrorReason(plugin: any, cardID: string, reason: ErrorReason, blockID?: string): void {
    const previous = cloneStore(plugin.persistedErrorTagsSnapshot ?? normalizeErrorTags(cloneStore(plugin.errorTags)));
    if (tagError(plugin.errorTags, cardID, reason, localDate(Date.now()))) {
        const version = ++plugin.errorTagMutationVersion;
        const next = cloneStore(plugin.errorTags);
        void plugin.ensureTier2Loaded().then(() => plugin.storageCoordinator.save(ERROR_TAGS_DATA, next)).then(() => {
            plugin.persistedErrorTagsSnapshot = cloneStore(next);
        }).catch(() => {
            if (version === plugin.errorTagMutationVersion) plugin.errorTags = cloneStore(plugin.persistedErrorTagsSnapshot ?? previous);
            plugin.showStorageFail();
        });
        const targetBlockID = blockID || (plugin.revlog.entries.slice().reverse().find((e: any) => e.cardID === cardID)?.blockID);
        if (targetBlockID) void setBlockAttrs(targetBlockID, buildErrorReasonAttrs(reason)).catch(() => {});
    }
}

export function getPluginRevlogBlockIndex(plugin: any): { reviewedSet: Set<string>; lapsesMap: Record<string, number> } {
    if (plugin.cachedRevlogVersion === plugin.revlogMutationVersion && plugin.cachedReviewedBlockIDs && plugin.cachedLapsesMap) {
        return { reviewedSet: plugin.cachedReviewedBlockIDs, lapsesMap: plugin.cachedLapsesMap };
    }
    const reviewedSet = new Set<string>(); const lapsesMap: Record<string, number> = {};
    for (const e of plugin.revlog.entries) {
        if (e.blockID) {
            reviewedSet.add(e.blockID);
            if (e.rating === 1) lapsesMap[e.blockID] = (lapsesMap[e.blockID] ?? 0) + 1;
        }
    }
    plugin.cachedRevlogVersion = plugin.revlogMutationVersion; plugin.cachedReviewedBlockIDs = reviewedSet; plugin.cachedLapsesMap = lapsesMap;
    return { reviewedSet, lapsesMap };
}

export async function reconcilePluginSourceHealthForScan(
    plugin: any,
    cards: Array<{ blockID: string; md: string; baselineMarkdown?: string; rootID?: string; exists?: boolean; mediaRefs?: string[]; mediaBroken?: string[]; mediaUnknown?: string[]; sourceHealthIssues?: { kind: string; detail: string }[] }>,
): Promise<void> {
    const mediaByCard = new Map(cards.map((card) => {
        const present: Record<string, boolean> = {};
        for (const ref of card.mediaRefs ?? []) {
            if ((card.mediaBroken ?? []).includes(ref)) present[ref] = false;
            else if (!(card.mediaUnknown ?? []).includes(ref)) present[ref] = true;
        }
        return [card.blockID, present] as const;
    }));
    try {
        await plugin.sourceHealthMutations((next: any) => {
            for (const card of cards) {
                const vers = versionsOf(plugin.contentVersions, card.blockID);
                const baselineMd = sourceBaselineMarkdown(next, card.blockID) ?? vers[vers.length - 1]?.md;
                const current: SourceCurrentFacts | null = card.exists === false ? null : {
                    rootID: String(card.rootID ?? ""),
                    contentHash: fnv1a(card.md),
                    mediaPresent: mediaByCard.get(card.blockID) ?? {},
                };
                const result = reconcileSourceHealth(next, card.blockID, current);
                next.entries = result.data.entries;
                card.sourceHealthIssues = result.issues.map((issue) => ({ kind: issue.kind, detail: issue.detail }));
                if (baselineMd && baselineMd !== card.md) {
                    card.baselineMarkdown = baselineMd;
                }
            }
        });
    } catch (error) {
        lvLog("warn", `[source-health] scan reconcile failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function acknowledgePluginSourceHealth(plugin: any, blockID: string): Promise<void> {
    const safe = String(blockID ?? "").replace(/'/g, "''");
    if (!safe) throw new Error("来源块 ID 为空，无法更新来源基线");
    const rows = await sqlQuery(`SELECT markdown, root_id FROM blocks WHERE id='${safe}' LIMIT 1`);
    const row = rows[0];
    if (!row) throw new Error("来源块不存在，无法更新来源基线");
    const markdown = String(row.markdown ?? "");
    const mediaRefs = extractMediaRefs(markdown).map((ref) => ref.normalized);
    const mediaPresent: Record<string, boolean> = {};
    if (mediaRefs.length > 0) {
        const probe = await probeAssetRefs(mediaRefs);
        const missing = new Set(probe.missing);
        const unknown = new Set(probe.unknown.filter((ref) => ref.toLowerCase().startsWith("assets/")));
        for (const ref of mediaRefs) {
            if (missing.has(ref)) mediaPresent[ref] = false;
            else if (!unknown.has(ref)) mediaPresent[ref] = true;
        }
    }
    const fingerprint = {
        blockID: String(blockID),
        rootID: String(row.root_id ?? ""),
        contentHash: fnv1a(markdown),
        mediaRefs,
        ...(markdown ? { baselineMarkdown: markdown } : {}),
    };
    await plugin.sourceHealthMutations((next: any) => {
        const updated = acknowledgeSourceHealthStore(next, fingerprint, Date.now(), { mediaPresent });
        next.entries = updated.entries;
    });
}
