/**
 * SiYuan v3.9 Flashcard V2 与 v3.1~v3.8 Riff 双轨适配层（仅在 lazy chunks 中加载，严禁进入主包）。
 */
import type { FlashcardV2State } from "./v2-contract";
import * as riffMod from "./riff";
import type { Rating, RiffDeck, RiffDueCard, RiffCardsData } from "./riff";
import {
    hasV2TransportAvailable,
    startFlashcardSession,
    getFlashcardSessionQueue,
    reviewFlashcardV2,
    undoFlashcardReview,
    queryFlashcards,
    listFlashcardEntities,
    summarizeFlashcardReviewSets,
    getFlashcardStatistics,
    getFlashcardRenderModel,
    manageFlashcards,
    setFlashcardEditLater,
    type FlashcardV2RenderModel,
} from "./v2-client";
import { openTab } from "siyuan";

const V2_RATING_NAMES: Record<Rating, "again" | "hard" | "good" | "easy"> = {
    1: "again",
    2: "hard",
    3: "good",
    4: "easy",
};

export { hasV2TransportAvailable };

export function isV2Active(v2State?: FlashcardV2State | null): boolean {
    return v2State === "Active";
}

export function getV2MigrationNotice(v2State?: FlashcardV2State | null): string | null {
    if (v2State === "LegacyDiverged") {
        return "检测到思源闪卡 V2 存在旧版同步写入分歧（LegacyDiverged），请先在思源原生闪卡面板完成增量迁移后再执行制卡或评分写入。";
    }
    if (v2State === "Preparing") {
        return "思源闪卡 V2 正在迁移准备中（Preparing），写入操作暂受保护，请稍候迁移完成后重试。";
    }
    return null;
}

function mapV2StateNumber(stateStr: unknown): number {
    const s = String(stateStr ?? "").toLowerCase();
    if (s === "learning" || s === "relearning") return 1;
    if (s === "review") return 2;
    return 0;
}

function makeOpId(): string {
    try {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }
    } catch {}
    return `lv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface DualTrackDueCard extends RiffDueCard {
    stability?: number;
    difficulty?: number;
    due?: string | number;
    isV2Card?: boolean;
    v2SessionID?: string;
    v2StateRevisionID?: string;
    v2SourceID?: string;
    v2SourceType?: string;
    v2VariantKey?: string;
    v2VariantData?: Record<string, unknown>;
    v2OptionOrder?: string[];
    v2DynamicOptions?: Array<{ id: string; entityID: string; entityType: string }>;
}

export interface DualTrackDueResult {
    cards: DualTrackDueCard[];
    unreviewedCount: number;
    unreviewedNewCardCount: number;
    unreviewedOldCardCount: number;
    v2SessionID?: string;
}

export async function loadDueQueueDualTrack(params: {
    v2State?: FlashcardV2State | null;
    scopeKey: string;
    reviewedIDs?: string[];
    isCram?: boolean;
    includeBuried?: boolean;
    includeSuspended?: boolean;
    includePaused?: boolean;
}): Promise<DualTrackDueResult> {
    const { v2State, scopeKey, reviewedIDs = [], isCram = false } = params;
    if (!isV2Active(v2State) || !hasV2TransportAvailable()) {
        return riffMod.getRiffDueCardsForScope(scopeKey, reviewedIDs);
    }

    const now = Date.now();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = startOfDay.getTime() + 86_400_000;

    const payload: Record<string, unknown> = {
        operationID: makeOpId(),
        now,
        reviewDayStart: startOfDay.getTime(),
        reviewDayEnd: endOfDay,
        reviewMode: isCram ? "practice" : "normal",
        includeBuried: params.includeBuried ?? isCram,
        includeSuspended: params.includeSuspended ?? false,
        includePaused: params.includePaused ?? isCram,
    };
    if (scopeKey.startsWith("deck:")) {
        payload.reviewSetID = scopeKey.slice(5);
    } else if (scopeKey.startsWith("notebook:")) {
        payload.query = {
            version: 1,
            root: { operator: "predicate", field: "notebookID", comparator: "equal", value: scopeKey.slice(9) },
        };
    } else if (scopeKey.startsWith("doc:")) {
        payload.query = {
            version: 1,
            root: { operator: "predicate", field: "rootID", comparator: "equal", value: scopeKey.slice(4) },
        };
    }

    const sessionRes = await startFlashcardSession(payload);
    const sessionID = String((sessionRes as any)?.session?.id ?? (sessionRes as any)?.sessionID ?? "");
    if (!sessionID) {
        return riffMod.getRiffDueCardsForScope(scopeKey, reviewedIDs);
    }

    const queueRes = await getFlashcardSessionQueue({
        sessionID,
        now,
        reviewDayStart: startOfDay.getTime(),
        reviewDayEnd: endOfDay,
    });
    const reviewedSet = new Set(reviewedIDs);
    const rawCards = Array.isArray(queueRes?.cards) ? queueRes.cards : [];
    const cards: DualTrackDueCard[] = [];
    for (const item of rawCards) {
        const card = item?.card;
        const rs = item?.reviewState;
        const sc = item?.sessionCard;
        const cardID = String(card?.id ?? sc?.cardID ?? "");
        if (!cardID || reviewedSet.has(cardID)) continue;
        if (sc?.status === "reviewed" || sc?.status === "skipped") continue;
        const sourceID = String(card?.sourceID ?? "");
        const blockID = sourceID || cardID;
        cards.push({
            cardID,
            deckID: scopeKey.startsWith("deck:") ? scopeKey.slice(5) : "",
            blockID,
            lapses: Number(rs?.lapses ?? 0),
            reps: Number(rs?.reps ?? 0),
            state: mapV2StateNumber(rs?.state),
            lastReview: Number(rs?.lastReview ?? 0),
            nextDues: {},
            stability: typeof rs?.stability === "number" ? rs.stability : undefined,
            difficulty: typeof rs?.difficulty === "number" ? rs.difficulty : undefined,
            due: rs?.due,
            isV2Card: true,
            v2SessionID: sessionID,
            v2StateRevisionID: String(rs?.stateRevisionID ?? sc?.stateRevisionID ?? ""),
            v2SourceID: sourceID,
            v2VariantKey: card?.variantKey,
            v2VariantData: (card?.variantData && typeof card.variantData === "object") ? card.variantData : undefined,
            v2OptionOrder: Array.isArray(sc?.optionOrder) ? sc.optionOrder : undefined,
            v2DynamicOptions: Array.isArray(sc?.dynamicOptions) ? sc.dynamicOptions : undefined,
        });
    }
    const newCount = cards.filter(c => c.state === 0).length;
    return {
        cards,
        unreviewedCount: cards.length,
        unreviewedNewCardCount: newCount,
        unreviewedOldCardCount: cards.length - newCount,
        v2SessionID: sessionID,
    };
}

export async function reviewCardDualTrack(params: {
    v2State?: FlashcardV2State | null;
    card: DualTrackDueCard;
    rating: Rating;
    reviewedIDs?: string[];
    isCram?: boolean;
    durationMs?: number;
}): Promise<{ buriedSiblingIDs: string[]; leechTagged: boolean; eventID?: string }> {
    const { v2State, card, rating, reviewedIDs = [], isCram = false, durationMs = 0 } = params;
    if (!isV2Active(v2State) || !card?.isV2Card || !hasV2TransportAvailable()) {
        await riffMod.reviewRiffCard(card.deckID, card.cardID, rating, reviewedIDs);
        return { buriedSiblingIDs: [], leechTagged: false };
    }
    const now = Date.now();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const res = await reviewFlashcardV2({
        operationID: makeOpId(),
        cardID: card.cardID,
        stateRevisionID: card.v2StateRevisionID || "",
        rating: V2_RATING_NAMES[rating],
        reviewedAt: now,
        reviewDayStart: startOfDay.getTime(),
        reviewDayEnd: startOfDay.getTime() + 86_400_000,
        durationMS: Math.max(0, Math.round(durationMs)),
        sessionID: card.v2SessionID || "",
        reviewSetID: card.deckID || undefined,
        reviewMode: isCram ? "practice" : "normal",
    });
    const buriedSiblingIDs = Array.isArray((res as any)?.buriedSiblingIDs) ? (res as any).buriedSiblingIDs : [];
    const leechTagged = Boolean((res as any)?.leechTagged);
    const eventID = String((res as any)?.event?.eventID ?? "");
    return { buriedSiblingIDs, leechTagged, eventID: eventID || undefined };
}

export async function undoReviewDualTrack(params: {
    v2State?: FlashcardV2State | null;
    cardID: string;
    reviewEventID?: string;
}): Promise<boolean> {
    if (!isV2Active(params.v2State) || !params.reviewEventID) return false;
    await undoFlashcardReview({
        operationID: makeOpId(),
        reviewEventID: params.reviewEventID,
        cardID: params.cardID,
        undoneAt: Date.now(),
    });
    return true;
}

export async function queryCardsDualTrack(params: {
    v2State?: FlashcardV2State | null;
    deckID?: string;
    page?: number;
    pageSize?: number;
}): Promise<RiffCardsData> {
    const deckID = params.deckID ?? "";
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, params.pageSize ?? 20);
    if (!isV2Active(params.v2State) || !hasV2TransportAvailable()) {
        return riffMod.getRiffCards(deckID, page, pageSize);
    }

    const offset = (page - 1) * pageSize;
    const payload: Record<string, unknown> = {
        options: {
            now: Date.now(),
            includeInactive: false,
            includeSuspended: true,
            includeBuried: true,
            includePaused: true,
            groupBySource: true,
            limit: pageSize,
            offset,
        },
    };
    if (deckID) {
        payload.query = {
            version: 1,
            root: { operator: "predicate", field: "reviewSetID", comparator: "equal", value: deckID },
        };
    }

    const res = await queryFlashcards(payload);
    const items = Array.isArray(res?.cards) ? res.cards : [];
    const total = Number(res?.total ?? items.length);
    const seen = new Set<string>();
    const blocks: RiffCardsData["blocks"] = [];
    for (const raw of items) {
        const item = raw as any;
        const card = item?.card ?? item;
        const rs = item?.reviewState;
        const refBlock = Array.isArray(item?.references)
            ? item.references.find((r: any) => r?.entityID && (!r?.entityType || r.entityType === "block"))?.entityID
            : undefined;
        const blockID = String(refBlock ?? card?.sourceID ?? item?.sourceID ?? card?.id ?? "");
        if (!blockID || seen.has(blockID)) continue;
        seen.add(blockID);
        blocks.push({
            id: blockID,
            rootID: typeof item?.sourceRootID === "string" ? item.sourceRootID : undefined,
            content: String(item?.sourcePath ?? item?.preview ?? card?.variantKey ?? blockID),
            hPath: typeof item?.sourcePath === "string" ? item.sourcePath : undefined,
            riffCard: {
                id: String(card?.id ?? blockID),
                cardID: String(card?.id ?? blockID),
                sourceID: String(card?.sourceID ?? blockID),
                sourceType: String(item?.sourceType ?? "quick"),
                deckID,
                state: mapV2StateNumber(rs?.state),
                reps: Number(rs?.reps ?? 0),
                lapses: Number(rs?.lapses ?? 0),
                due: rs?.due,
                stability: typeof rs?.stability === "number" ? rs.stability : undefined,
                difficulty: typeof rs?.difficulty === "number" ? rs.difficulty : undefined,
                flag: typeof card?.flag === "number" ? card.flag : undefined,
                editLater: card?.editLater,
            },
        });
    }
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    return { blocks, total, pageCount };
}

export async function listDecksDualTrack(v2State?: FlashcardV2State | null): Promise<RiffDeck[]> {
    if (!isV2Active(v2State) || !hasV2TransportAvailable()) {
        return riffMod.getRiffDecks();
    }
    try {
        const res = await listFlashcardEntities({
            entityType: "reviewSet",
            options: { limit: 500, offset: 0 },
        });
        const entities = Array.isArray(res?.entities) ? res.entities.filter(e => !e?.deleted) : [];
        if (entities.length === 0) {
            return riffMod.getRiffDecks();
        }
        const ids = entities.map(e => String(e.entityID || e.payload?.id || "")).filter(Boolean);
        const sumRes = ids.length > 0
            ? await summarizeFlashcardReviewSets({ reviewSetIDs: ids, now: Date.now() }).catch(() => null)
            : null;
        const summaries = sumRes?.summaries ?? {};
        return entities.map(e => {
            const id = String(e.entityID || e.payload?.id || "");
            const sum = summaries[id];
            return {
                id,
                name: String(e.payload?.name ?? id),
                size: Number(sum?.cards ?? 0),
                created: String(e.payload?.createdAt ?? e.updatedAt ?? ""),
                updated: String(e.updatedAt ?? ""),
            };
        });
    } catch {
        return riffMod.getRiffDecks();
    }
}

export async function fetchV2RenderModelSafe(cardID: string): Promise<FlashcardV2RenderModel | null> {
    if (!cardID) return null;
    try {
        return await getFlashcardRenderModel({ cardID, includeRatingIntervals: true });
    } catch {
        return null;
    }
}

export async function fetchV2StatisticsSafe(reviewSetID?: string): Promise<Record<string, any> | null> {
    if (!hasV2TransportAvailable()) return null;
    try {
        const payload: Record<string, unknown> = {
            now: Date.now(),
            futureDays: 30,
            timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
        };
        if (reviewSetID) payload.reviewSetID = reviewSetID;
        return await getFlashcardStatistics(payload);
    } catch {
        return null;
    }
}

export async function manageV2CardsSafe(action: string, cardIDs: string[], extra: Record<string, unknown> = {}): Promise<boolean> {
    if (!cardIDs.length) return false;
    await manageFlashcards({
        operationID: makeOpId(),
        action,
        cardIDs,
        changedAt: Date.now(),
        ...extra,
    });
    return true;
}

export async function setV2EditLaterSafe(cardIDs: string[], note?: string): Promise<boolean> {
    if (!cardIDs.length) return false;
    await setFlashcardEditLater({
        operationID: makeOpId(),
        cardIDs,
        note: note ?? "",
        clear: !note,
    });
    return true;
}

export function openNativeV2ReviewTab(options: { cardIDs?: string[]; reviewSetIDs?: string[]; reviewMode?: "normal" | "practice" }): boolean {
    try {
        if (typeof openTab !== "function") return false;
        void openTab({
            app: (typeof window !== "undefined" ? (window as any).siyuan?.ws?.app : undefined) as any,
            card: {
                type: "all",
                cardIDs: options.cardIDs,
                reviewSetIDs: options.reviewSetIDs,
                reviewMode: options.reviewMode ?? "normal",
            } as any,
        });
        return true;
    } catch {
        return false;
    }
}
