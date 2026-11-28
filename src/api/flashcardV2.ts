/**
 * 内核闪卡 V2 API（3.9.0+）兼容总出口。
 * 主包入口（src/index.ts）请直接从 `./v2-detect` 仅导入轻量探测，避免把 V2 全量端点打入主包！
 */
export {
    V2_TIMEOUT_MS,
    detectFlashcardV2,
    normalizeMigrationStatus,
    type FlashcardV2State,
    type MigrationStatus,
} from "./v2-detect";

export {
    summarizeStatistics,
    startFlashcardSession,
    getFlashcardSessionQueue,
    updateFlashcardSessionCard,
    reviewFlashcardV2,
    undoFlashcardReview,
    finishFlashcardSession,
    getFlashcardRenderModel,
    queryFlashcards,
    manageFlashcards,
    listFlashcardEntities,
    getFlashcardEntity,
    summarizeFlashcardReviewSets,
    createQuickFlashcardSources,
    createBasicFlashcardSource,
    createAdvancedFlashcardSource,
    setFlashcardEditLater,
    saveFlashcardTag,
    setFlashcardTagAssignments,
    getFlashcardStudyPolicy,
    saveFlashcardStudyPolicy,
    getFlashcardStatistics,
    ankiConnect,
    type FlashcardV2ReviewState as FlashcardReviewState,
    type FlashcardV2Card as FlashcardCard,
    type FlashcardV2SearchResult,
    type FlashcardV2SessionQueueCard,
    type FlashcardV2RenderModel,
} from "./v2-client";
