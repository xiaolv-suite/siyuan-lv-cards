/**
 * SiYuan v3.9+ Flashcard V2 API 客户端（仅允许在 lazy chunks / adapter 中加载，严禁进入主包 index.ts）。
 * 对所有响应字段做防御性可选链与类型守卫，兼容 Alpha 演进与旧版本缺失字段。
 */
import * as siyuanMod from "siyuan";
import { requestWithPolicy, type RequestOptions } from "../libs/request";
import { unwrapKernelData } from "../libs/kernel-response";
import { summarizeStatistics } from "./v2-contract";
import { V2_TIMEOUT_MS } from "./v2-detect";

export { summarizeStatistics };

export function hasV2TransportAvailable(): boolean {
    try {
        return typeof (siyuanMod as any)?.fetchSyncPost === "function";
    } catch {
        return false;
    }
}

async function v2Post<T>(endpoint: string, payload: Record<string, unknown> = {}, options: RequestOptions = {}): Promise<T> {
    const isRead = endpoint.startsWith("get") || endpoint.startsWith("query") || endpoint.startsWith("list") || endpoint === "summarizeReviewSets" || endpoint === "previewReviewSet";
    const postFn = (siyuanMod as any).fetchSyncPost;
    const resp: any = await requestWithPolicy(
        () => postFn(`/api/flashcard/${endpoint}`, payload),
        {
            ...options,
            timeoutMs: options.timeoutMs ?? V2_TIMEOUT_MS,
            readOnly: options.readOnly ?? isRead,
            retries: options.retries ?? (isRead ? 1 : 0),
            dedupeKey: options.dedupeKey ?? (isRead ? `v2:${endpoint}:${JSON.stringify(payload)}` : undefined),
            latestKey: options.latestKey ?? (isRead ? `v2:${endpoint}` : undefined),
        },
    );
    return unwrapKernelData<T>(resp);
}

export interface FlashcardV2ReviewState {
    cardID: string;
    state: string;
    due: number;
    lastReview?: number;
    stability: number;
    difficulty: number;
    elapsedDays: number;
    scheduledDays: number;
    reps: number;
    lapses: number;
    suspended: boolean;
    buriedReason?: string;
    buriedUntil?: number;
    stateRevisionID?: string;
}

export interface FlashcardV2Card {
    id: string;
    sourceID: string;
    templateID: string;
    variantKey?: string;
    variantData?: Record<string, unknown>;
    generationStatus?: string;
    flag?: number;
    presetOverrideID?: string;
    priorityOverride?: string;
    editLater?: { note: string; updatedAt: number };
    createdAt: number;
    updatedAt: number;
}

export interface FlashcardV2SearchResult {
    card: FlashcardV2Card;
    reviewState?: FlashcardV2ReviewState;
    sourceType?: string;
    sourceStatus?: string;
    sourceAvailable?: boolean;
    sourceNotebookID?: string;
    sourceRootID?: string;
    sourcePath?: string;
    cardTagIDs?: string[] | null;
    sourceTagIDs?: string[] | null;
    effectiveTagIDs?: string[] | null;
    effectivePriority?: string;
    references?: Array<{ entityID?: string; entityType?: string; role?: string; sort?: number }>;
    [key: string]: unknown;
}

export interface FlashcardV2SessionQueueCard {
    card: FlashcardV2Card;
    reviewState: FlashcardV2ReviewState;
    sessionCard: {
        id: string;
        cardID: string;
        sessionID: string;
        status: string;
        sort?: number;
        stateRevisionID?: string;
        optionOrder?: string[];
        dynamicOptions?: Array<{ id: string; entityID: string; entityType: string }>;
        stepResults?: unknown;
    };
    repeatDue?: number;
}

export interface FlashcardV2RenderModel {
    ratingIntervals?: Record<string, string>;
    card: FlashcardV2Card;
    source: {
        id?: string;
        primaryRefID?: string;
        sourceType: string;
        generationConfig?: Record<string, unknown>;
        pluginNamespace?: string;
        pluginData?: Record<string, unknown>;
    };
    references?: Array<{
        id?: string;
        sourceID?: string;
        fieldID?: string;
        entityType: string;
        entityID: string;
        role: string;
        sort: number;
    }>;
    reviewState?: FlashcardV2ReviewState;
    template?: {
        answerMode?: string;
        frontSpec?: Record<string, unknown>;
        backSpec?: Record<string, unknown>;
        style?: string;
    };
    schema?: {
        builtinType?: string;
        fields?: Array<{ id: string; name: string }>;
    };
}

// ---- 复习会话 ----

export const startFlashcardSession = (payload: Record<string, unknown>) =>
    v2Post<Record<string, unknown>>("startSession", payload);

export const getFlashcardSessionQueue = (payload: Record<string, unknown>) =>
    v2Post<{ cards?: FlashcardV2SessionQueueCard[] }>("getSessionQueue", payload);

export const updateFlashcardSessionCard = (payload: Record<string, unknown>) =>
    v2Post<Record<string, unknown>>("updateSessionCard", payload);

export const reviewFlashcardV2 = (payload: Record<string, unknown>) =>
    v2Post<Record<string, unknown>>("reviewCard", payload);

export const undoFlashcardReview = (payload: Record<string, unknown>) =>
    v2Post<Record<string, unknown>>("undoReview", payload);

export const finishFlashcardSession = (payload: Record<string, unknown>) =>
    v2Post<Record<string, unknown>>("finishSession", payload);

export const getFlashcardRenderModel = (payload: { cardID: string; includeRatingIntervals?: boolean }) =>
    v2Post<FlashcardV2RenderModel>("getRenderModel", payload);

// ---- 查询与管理 ----

export const queryFlashcards = (payload: Record<string, unknown>) =>
    v2Post<{ cards?: Array<FlashcardV2SearchResult | FlashcardV2Card>; reviewStates?: FlashcardV2ReviewState[]; total?: number }>("queryCards", payload);

export const manageFlashcards = (payload: Record<string, unknown>) =>
    v2Post<Record<string, unknown>>("manageCards", payload);

export const listFlashcardEntities = (payload: Record<string, unknown>) =>
    v2Post<{ entities?: Array<{ entityID: string; entityType: string; deleted?: boolean; revisionID?: string; updatedAt?: number; payload?: Record<string, unknown> }>; total?: number }>("listEntities", payload);

export const getFlashcardEntity = (payload: { entityType: string; entityID: string }) =>
    v2Post<{ found?: boolean; revision?: { entityID: string; entityType: string; payload?: Record<string, unknown> } }>("getEntity", payload);

export const summarizeFlashcardReviewSets = (payload: { reviewSetIDs: string[]; now?: number }) =>
    v2Post<{ summaries?: Record<string, { reviewSetID: string; cards: number; due: number; included?: number; excluded?: number }> }>("summarizeReviewSets", payload);

// ---- 制卡 / 标记 / 策略 ----

export const createQuickFlashcardSources = (payload: Record<string, unknown>) =>
    v2Post<Record<string, unknown>>("createQuickSources", payload);

export const createBasicFlashcardSource = (payload: Record<string, unknown>) =>
    v2Post<Record<string, unknown>>("createBasicSource", payload);

export const createAdvancedFlashcardSource = (payload: Record<string, unknown>) =>
    v2Post<Record<string, unknown>>("createAdvancedSource", payload);

export const setFlashcardEditLater = (payload: { cardIDs: string[]; note?: string; clear?: boolean; operationID?: string }) =>
    v2Post<Record<string, unknown>>("setCardEditLater", payload);

export const saveFlashcardTag = (payload: Record<string, unknown>) =>
    v2Post<Record<string, unknown>>("saveTag", payload);

export const setFlashcardTagAssignments = (payload: Record<string, unknown>) =>
    v2Post<Record<string, unknown>>("setTagAssignments", payload);

export const getFlashcardStudyPolicy = (payload: { scopeType: string; scopeID: string }) =>
    v2Post<Record<string, unknown>>("getStudyPolicy", payload);

export const saveFlashcardStudyPolicy = (payload: Record<string, unknown>) =>
    v2Post<Record<string, unknown>>("saveStudyPolicy", payload);

// ---- 统计与 Anki ----

export const getFlashcardStatistics = (payload: Record<string, unknown>) =>
    v2Post<Record<string, unknown>>("getStatistics", payload);

export const ankiConnect = (payload: { action: string; version?: number; params?: Record<string, unknown>; key?: string }) =>
    v2Post<{ result: unknown; error: string }>("ankiConnect", payload as unknown as Record<string, unknown>);
