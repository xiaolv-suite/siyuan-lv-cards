<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { rafThrottle } from "@/libs/throttle";
    import { openTab } from "siyuan";
    import { showMessage, notifyInline, lvActivity, lvLaunchpad, lvNotify } from "@/libs/notice";
    import { isNativeDockVisible, showDocTreeNativeMenu, toggleNativeDock } from "@/libs/lv-notice-kit";
    import {
        getRiffDecks, getRiffDueCardsForScope, reviewRiffCard, skipReviewRiffCard,
        batchSetRiffCardsDueTime, getRiffCards, getNotebookRiffCards, getTreeRiffCards,
        type RiffDueCard, type RiffDeck, type Rating,
    } from "@/api/riff";
    import { getNotebooks, getBlockAttrs, getBlockDOM, sqlQuery, canOpenMobileFile, openMobileFile, type Notebook } from "@/api/siyuan";
    import * as siyuanApi from "@/api/siyuan";
    import { isCardNew, calcStreak, isLeechCard, DEFAULT_LEECH_THRESHOLD, type RevlogData } from "@/core/revlog";
    import type { Rating1to4 } from "@/core/card-types";
    import { parseOcclusion, calculateOcclusionBox, findOcclusionTarget, type OcclusionData } from "@/core/occlusion";
    import { filterReviewQueueByQuality } from "@/core/review-queue-quality";
    import { todayKey } from "@/core/exam";
    import { mergeSessionPrefs, pruneSessionPrefs, getInitialSessionVariant, resolveSessionVariantOverrides, shouldRestartTimeoutOnOverrides, type SessionVariantOption } from "@/core/session-prefs";
    import { markSessionCompleted, createSessionSnapshot, restoreSessionProgress, recordSessionEndReason, createResetSessionProgress, type EndReason } from "@/core/session-state";
    import { isLongReturn, formatReturnCheckItems, resolveI18nPath, type ReturnCheckFacts } from "@/core/return-check";
    import { formatNextDueByRating } from "@/core/due-format";
    import { clampFontScale, formatFontScalePercent, shouldInvalidateCardDerivedState, toggleCardIssue, removeCardFromQueue, computeAnswerDuration, updateSessionCountersOnRate, evaluateCardTyping, createLastAnsweredSnapshot, sliceQueueAfterCurrent, buildMemoAttributes, isCardActionBusy, createLiveAnnouncement, getNextQueueHead, canRateCurrentCard } from "@/core/card-actions";
    import { budgetLeftSec, isBudgetExpired, formatBudgetClock, resolveBudgetEstimate, initBudgetSession } from "@/core/session-budget";
    import { resolveHeadScopeLabel, normalizeScopeKey } from "@/core/scope-preset";
    import { nominateVariant } from "@/core/question-rotation";
    import { assembleChoiceOptions, extractAnswerFromDomHtml, shuffleArray, recordChoicePick, addDistractorToPool } from "@/core/choice-options";
    import { formatSessionDuration, isEmptyQueueSession, formatTargetProgress, formatStreakMilestone, getDailyScienceTip } from "@/core/completion-metrics";
    import { analyzeFaceRichness, extractMarkTexts, maskMarkedAnswersForQuestion, extractExpectedCardAnswer, parseCardAttrsMetadata, resolveFaceHintLabel, hasSvgOrCanvasDrawing, deriveFaceHints, isCardFaceReady } from "@/core/card-face";
    import { loadReliefChoices, toggleReliefChoice, type LoadChoice } from "@/core/load-relief";
    import { recoveryOptions, resolveRecoveryAction, createRecoverySnapshotFromCounters, type RecoveryOption, type RecoverySnapshot } from "@/core/session-recovery";
    import { deriveReturnBanner } from "@/core/return-triage";
    import { applyQueuePipeline, calculateReviewAccuracy, toggleCardStar, formatStarToggleFeedback, combineExcludedCardIDs, filterActiveSessionCards, mergeQualityExcludedCardIDs } from "@/core/review-queue-pipeline";
    import type { SessionPurpose } from "@/core/session-purpose";
    import { resolveTouchSwipe, resolveMobileCardSwitch, shouldIgnoreSwipeTarget, mapSwipeActionToOutcome, extractSingleTouchCoords, extractChangedTouchCoords } from "@/core/review-gesture";
    import { playReviewSfx, speakReviewText, speakAnswerText, closeReviewAudio, shouldAutoSpeakDictation } from "@/core/review-audio";
    import { resolveReviewKeyAction, shouldIgnoreReviewKeydown, resolveModalKeydownAction, isAnyReviewModalOpen, resolveRatingFromShortcutAction, isInputOrEditable } from "@/core/review-shortcuts";
    import { createReviewCountdown, formatCountdown, isCountdownEligible, shouldRestartCountdownOnResume, type ReviewCountdownController } from "@/core/review-countdown";
    import { stepNextCloze, advanceClozeStep } from "@/core/cloze-stepper";
    import { handleCardContentClick, handleCardCanvasDblClick, togglePeekCard, isOverlayTarget, shouldRefreshOnPanelPointer, resolveEditorNavigationBlockId, createZoomedImageState, shouldRevealOnContainerClick, isEventInsideContainer, focusReviewRootOrCard, type ZoomedImageState } from "@/core/card-interactions";
    import { computeKeyboardViewportState } from "@/core/viewport-keyboard";
    import { computeReschedulePreview, buildRescheduleRequest, type RescheduleRequest } from "@/core/reschedule-preview";
    import { createReviewHistorySnapshot, pushReviewHistory, popReviewHistory, type ReviewHistorySnapshot } from "@/core/review-history";
    import { enqueueDelayedRequeue, nextRequeueDelay, createDelayedRequeueScheduler, markAsRequeueCard, isRequeueWaiting, calculateRequeueWaitSeconds, type DelayedRequeue } from "@/core/delayed-requeue";
    import { invalidateDueCache, dueCache } from "@/api/due-shared";
    import { advanceCardHint, resolveHintLevelIndicator, type HintLevel, type HintLogEntry } from "@/core/hint-ladder";
    import LvLive from "./kit/LvLive.svelte";
    import LvError from "./kit/LvError.svelte";
    import { friendlyError } from "@/api/errors";
    import { triggerHaptic, getRatingHapticPattern } from "@/core/haptic";
    import { lvLog } from "@/libs/log";
    import { resolveCardBreadcrumbsFromRows, buildHPathQuerySql, buildRecursiveAncestorSql, createBreadcrumbCache, type ReviewBreadcrumbChain } from "@/core/review-breadcrumbs";
    import { parseInteractiveQuiz, evaluateChoiceQuiz, evaluateJudgeQuiz, evaluateFillQuiz, resolveQuizKeyboardAction, toggleChoiceSelection, updateQuizScoreCounters, createInitialEphemeralQuizState, type InteractiveQuizData } from "@/core/quiz-interactive";
    import { logCheckinEventSafely, findMatchingCheckinItemId } from "@/libs/ecosystem-bridge-kit";
    import { ATTR_LV_DISMISSED, buildDismissAttrs, shouldBypassFsrs } from "@/core/incremental-learning";
    import ReviewZenIsland from "./review/ReviewZenIsland.svelte";
    import ReviewDonePanel from "./review/ReviewDonePanel.svelte";
    import ReviewActionModals from "./review/ReviewActionModals.svelte";
    import ReviewHelpAndPeek from "./review/ReviewHelpAndPeek.svelte";
    import ReviewContextDrawer from "./review/ReviewContextDrawer.svelte";
    import ReviewSessionPrefs from "./review/ReviewSessionPrefs.svelte";
    import ReviewRescheduleModal from "./review/ReviewRescheduleModal.svelte";
    import ReviewToolbar from "./review/ReviewToolbar.svelte";
    import ReviewCountdownBanner from "./review/ReviewCountdownBanner.svelte";
    import ReviewRatingBar from "./review/ReviewRatingBar.svelte";
    import ReviewErrorTagBar from "./review/ReviewErrorTagBar.svelte";
    import ReviewReadyDashboard from "./review/ReviewReadyDashboard.svelte";
    import ReviewSessionBanners from "./review/ReviewSessionBanners.svelte";
    import ReviewCardBreadcrumbs from "./review/ReviewCardBreadcrumbs.svelte";
    import ReviewMemoCallout from "./review/ReviewMemoCallout.svelte";
    import ReviewOcclusionOverlay from "./review/ReviewOcclusionOverlay.svelte";
    import ReviewProgressHeader from "./review/ReviewProgressHeader.svelte";
    import ReviewAnswerSection from "./review/ReviewAnswerSection.svelte";
    import ReviewRequeueWaiting from "./review/ReviewRequeueWaiting.svelte";
    import ReviewCardBody from "./review/ReviewCardBody.svelte";
    import ReviewCramModal from "./review/ReviewCramModal.svelte";
    import { type CramScope } from "@/core/cram-mode";
    import { createOnboardingSampleCards } from "@/core/workspace-samples";
    import LvIcon from "./kit/LvIcon.svelte";

    export interface ReviewSettings {
        ratingStyle: "four" | "three";
        ratingKeyScheme?: "number" | "jkl" | "both";
        timeoutMode: "off" | "reveal" | "forget";
        timeoutSeconds: number;
        randomOrder: boolean;
        burySiblings: boolean;
        cardMaxWidth: number;
        typingEnabled: boolean;
        typingStrict: boolean;
        choiceEnabled: boolean;
        /** 混合题型轮换（v0.179.0）：按本场张数在翻面/打字/选择间轮换（展示层，不动调度） */
        mixedRotation: boolean;
        ttsEnabled: boolean;
        ttsRate: number;
        ttsVoice: string;
        batchLimit: number;
        dictationEnabled: boolean;
        requeueAgain: boolean;
        /** 每日复习目标（完成页进度展示） */
        dailyReviewTarget: number;
        /** 卡面字号缩放（438） */
        cardFontScale: number;
        /** 自定义卡面样式（仅作用于卡面正文内部） */
        customCardCss?: string;
        /** 评分按钮密度（441） */
        ratingDensity: "cozy" | "compact";
        /** 评分音效开关与风格（250） */
        sfxEnabled: boolean;
        sfxStyle: "chime" | "wood" | "bell";
        /** 答案揭示前隐藏卡面元信息（442） */
        hideMetaUntilAnswer: boolean;
        /** 队列倒序（431） */
        reverseOrder: boolean;
        /** 单卡作答耗时封顶秒（AQ-13） */
        answerTimeCapSec: number;
        /** 易混淆卡片遗忘次数门限 */
        leechThreshold?: number;
        /** 每日一语（375） */
        dailyTipEnabled: boolean;
        /** 联动小驴打卡目标条目 ID（可选，空=不联动） */
        checkinItemId?: string;
    }

    export interface ReviewCtx {
        i18n: any;
        app: any;
        /** 实时读取设置（保存后热生效，无需重建面板） */
        settings: () => ReviewSettings;
        /** T01 可用时间偏好（分钟，0=不限）：复习开场默认预算（hero 选择落偏好） */
        preferredBudgetMin?: () => number;
        /** 初始范围（考试模式直达）："" 或 "deck:<id>" / "notebook:<id>" */
        initialScope?: string;
        /** 初始 cram 模式（考前：lapses 降序） */
        initialCram?: boolean;
        isCramMode?: boolean;
        /** BI-3：移动端退场（打开原笔记前判定 + 收起复习模态） */
        isMobile?: boolean;
        closeMobileReviewDialog?: () => void;
        appendRevlog: (entry: { cardID: string; deckID: string; blockID: string; rating: number; source: "plugin" }) => void;
        rollbackRevlog?: (cardID?: string) => void;
        /** BJ-4：遗忘卡错误原因标注（旁路增强，支持块属性同步） */
        tagErrorReason?: (cardID: string, reason: string, blockID?: string) => void;
        /** BK-1↔BJ-2：按来源块查知识对象（提示内容优先来源） */
        getKOBySource?: (blockID: string) => { fact: string; capability: string | null } | null;
        getRevlog: () => RevlogData;
        isSuspendedToday: (cardID: string) => boolean;
        suspendToday: (cardID: string) => void | Promise<void>;
        unsuspendToday?: (cardID: string) => void | Promise<void>;
        openDashboard: (tab?: string) => void;
        /** Mobile Spec v2：手机端全屏 Dialog 宿主关闭回调（带 44x44px 关闭入口） */
        onClose?: () => void;
        onScopePersist: (scopeKey: string) => void;
        getSessionState: () => { date: string; reviewedIDs: string[]; skippedIDs: string[]; counters: { new: number; review: number; forget: number; skip: number }; endReason?: EndReason | null; completed?: boolean } | null;
        saveSessionState: (s: { date: string; reviewedIDs: string[]; skippedIDs: string[]; counters: { new: number; review: number; forget: number; skip: number }; endReason?: EndReason | null; completed?: boolean }) => void;
        clearSessionState: () => void;
        emitSessionFinished: (summary: { new: number; review: number; forget: number; skip: number }) => void;
        /** 订阅设置变更（AT-10）：保存设置后回调，超时参数立即生效，返回取消函数 */
        onSettingsChanged?: (cb: () => void) => () => void;
        /** 源上下文预览（M3）：来源块前后各 2 块（只读，不含自身） */
        getContextBlocks: (blockID: string) => Promise<{ id: string; html: string }[]>;
        /** BI-10：长期返场检查事实聚合（只读；缺省=不显示检查横幅） */
        getReturnCheckFacts?: () => Promise<ReturnCheckFacts | null>;
        /** BI-3：入口条返回（returnPoint = "doc:<id>" / "hub:<页签>"）；缺省=不显示返回按钮 */
        returnToEntry?: (returnPoint: string) => void;
        /** BI-3：显式清除入口记录（取消/重开不丢——只有用户点 × 才删） */
        dismissEntry?: (entryKind: string, sourceID: string) => void;
        /** 汲取自番茄插件：复习端就地将卡片移出卡组（不伤正文） */
        removeFromDeck?: (blockID: string) => Promise<{ success: boolean; removedCount?: number } | void>;
        /** 星标收藏卡片 ID 集合（与卡片管理器共享持久化状态） */
        getStarredCardIDs?: () => string[];
        toggleStarCard?: (id: string) => Promise<boolean> | boolean;
    }

    let { ctx, initialScope = "all", initialCram = false, initialEntry = null }: {
        ctx: ReviewCtx;
        initialScope?: string;
        initialCram?: boolean;
        /** BI-3：本次会话入口上下文（宿主记录并传入；重开恢复用） */
        initialEntry?: { entryKind: string; sourceID: string; scopeKey: string; returnPoint: string; createdAt: number } | null;
    } = $props();
    const t = $derived(ctx.i18n);
    // BI-3：入口条状态（× 清除后本面板不再显示；记录本身归宿主管）
    // svelte-ignore state_referenced_locally
    let entryCtx = $state(initialEntry);

    /** 会话内重现标记：lvRequeue>0 表示本卡由遗忘卡短期循环追加 */
    type QueueCard = RiffDueCard & { lvRequeue?: number };
    let queue: QueueCard[] = $state([]);
    /** 评分 Again 后的本地延迟队列；不写入会话快照，也不参与内核调度。 */
    let pendingRequeues: DelayedRequeue<QueueCard>[] = $state([]);
    let requeueNow = $state(Date.now());
    let reviewedIDs: string[] = $state([]);
    let current: QueueCard | null = $state(null);
    let showAnswer = $state(false);
    // 混合题型轮换（v0.179.0）：混合开时按本场张数提名本题形态；关时保持既有静态设置
    const answerVariant = $derived.by(() => {
        void settingsRev; // 设置保存 → settings-changed → rev++ → 出题形态立即重算
        if (eff().mixedRotation) {
            return nominateVariant(reviewedIDs.length, { typing: eff().typingEnabled, choice: eff().choiceEnabled });
        }
        return eff().typingEnabled ? "typing" : eff().choiceEnabled ? "choice" : "flip";
    });
    // 轮换提名 choice 时自动本地采样干扰项（无网络；等同手动 🎲）
    $effect(() => {
        if (answerVariant === "choice" && current && !choices && !choiceLoading && choiceFallbackMode === "none") {
            void startChoice();
        }
    });
    // BJ-2：分级提示（不自动提交评分；纯展示+日志）
    let hintLevel: HintLevel | null = $state(null);
    let hintText = $state("");
    let hintLog: HintLogEntry[] = $state([]);
    // CF-03: 按 O/E 键跳原笔记或编辑画布时挂起答题秒表
    let stopwatchSuspendedAt = $state(0);
    function suspendStopwatch() {
        if (stopwatchSuspendedAt === 0 && current) {
            stopwatchSuspendedAt = Date.now();
            stopTimeout();
        }
    }
    function resumeStopwatch() {
        if (stopwatchSuspendedAt > 0) {
            const pausedMs = Math.max(0, Date.now() - stopwatchSuspendedAt);
            cardShownAt += pausedMs;
            stopwatchSuspendedAt = 0;
            if (shouldRestartCountdownOnResume(showAnswer, faceReady)) {
                restartTimeout();
            }
        }
    }

    // CF-10: 长按/快捷键临时透视答案（只动视觉层，松开恢复）
    let isPeekingAnswer = $state(false);

    // CF-11: 今日目标达成即时彩带与粒子微动效
    let showTargetCelebration = $state(false);
    let targetCelebrationTimer: ReturnType<typeof setTimeout> | null = null;
    function triggerTargetCelebration() {
        if (targetCelebrationTimer) clearTimeout(targetCelebrationTimer);
        showTargetCelebration = true;
        announce(t.review?.targetCelebration ?? "今日复习目标达成！干得漂亮！", "polite");
        targetCelebrationTimer = setTimeout(() => {
            showTargetCelebration = false;
            targetCelebrationTimer = null;
        }, 3200);
    }

    // BJ-4：遗忘卡错误原因标注（评分后可选旁路动作；标签走 i18n errReasons 段）
    let showErrTags = $state(false);
    let errTagCardID = $state("");
    let errTagBlockID = $state("");
    let errTagged = $state(false);
    let cardHtml = $state("");
    let maskedCardHtml = $derived(maskMarkedAnswersForQuestion(cardHtml));
    /** AS-3：卡面加载失败占位（区别于队列级 errorMsg——队列保持可用，占位可重试） */
    let faceError = $state("");
    // 卡面尚未加载时不允许提前翻面，避免空卡面进入评分流程。
    const faceReady = $derived(isCardFaceReady(cardHtml, faceError));
    /** AS-3：富内容特征提示（随卡面派生） */
    let faceRich = $derived(cardHtml ? analyzeFaceRichness(cardHtml) : null);
    let faceHints = $derived(deriveFaceHints(faceRich));
    function faceHintText(key: string): string {
        return resolveFaceHintLabel(key, (t as any).aiFace?.hint);
    }
    // 复习范围（M3·FR1）：all | deck:<id> | notebook:<id>
    // 初值语义：范围仅经命令/考试入口传入一次，运行时由用户切换；
    // 空串/未知的持久化范围归一为 all（否则 select 空白、下拉无选中项）
    // svelte-ignore state_referenced_locally
    let scopeKey = $state(normalizeScopeKey(initialScope));
    // svelte-ignore state_referenced_locally
    let isCramMode = $state(Boolean(initialCram || ctx.isCramMode));
    // svelte-ignore state_referenced_locally
    let cramActive = $state(Boolean(initialCram || ctx.isCramMode));
    let cramScope = $state<CramScope>("all");
    let cramRandomOrder = $state(false);
    let showCramModal = $state(false);
    let decks: RiffDeck[] = $state([]);
    let notebooks: Notebook[] = $state([]);
    let sessionNew = $state(0);
    let sessionReview = $state(0);
    let sessionForget = $state(0);
    let sessionSkip = $state(0);
    let sessionQuizTotal = $state(0);
    let sessionQuizCorrect = $state(0);
    let sessionDone = $state(false);
    // T07 结果页（docs/13 §9）：真实剩余到期（共享缓存，完成时读取；null=未取到不显示）
    let remainingDue = $state<number | null>(null);
    $effect(() => {
        if (!sessionDone) return;
        dueCache.get?.("")
            ?.then((d) => (remainingDue = d?.unreviewedCount ?? null))
            ?.catch(() => (remainingDue = null));
    });
    let loading = $state(false);
    let errorMsg = $state("");
    let submitting = $state(false); // 评分/跳过提交锁（AJ8：重复点击只产生一次写入）
    let loadSeq = 0;                // 卡面异步加载序号（AJ10：旧 DOM 不覆盖新卡）
    let queueSeq = 0;               // 队列请求序号（AQ-19：旧范围/旧重试响应不覆盖新队列）
    let isDisposed = false;
    // AQ-13：题面呈现时刻（monotonic 按壁钟差），评分时按设置封顶后记入 revlog.dur
    let cardShownAt = 0;
    let sessionSkipped = $state<string[]>([]); // 本场跳过排除集（AJ9：跳过的卡不再被下一批拉回）
    // svelte-ignore state_referenced_locally
    let starredCardIDs = $state<Set<string>>(new Set(ctx.getStarredCardIDs?.() ?? [])); // 星标重点卡片集合（对标 Anki Flag / Quizlet Starred）
    let sessionStarredCardIDs = $state<Set<string>>(new Set()); // 本场星标卡片 ID 集合（供完成屏统计与专项突击）
    let forgottenCardIDs = $state<Set<string>>(new Set()); // 本场遗忘卡片 ID 集合（供完成屏强化突击）
    const sessionCardMap = new Map<string, QueueCard>(); // 本场经历卡片字典（cardID -> QueueCard）
    let qualityExcludedCardIDs = $state<string[]>([]); // 结构无效/未能验证的存量卡：仅本场排除，不改内核 due
    let lastAnswered = $state<{ html: string; card: RiffDueCard; revealed: boolean } | null>(null); // 回看数据源（AJ2：不再自动打开）

    function isCardStarred(card: QueueCard | null | undefined): boolean {
        if (!card) return false;
        return starredCardIDs.has(card.cardID) || (Boolean(card.blockID) && starredCardIDs.has(card.blockID));
    }

    const requeueWaiting = $derived(isRequeueWaiting(sessionDone, Boolean(current), pendingRequeues.length, loading, Boolean(errorMsg)));
    const requeueWaitSeconds = $derived(calculateRequeueWaitSeconds(nextRequeueDelay(pendingRequeues, requeueNow)));

    const requeueScheduler = createDelayedRequeueScheduler<QueueCard>({
        getPending: () => pendingRequeues,
        setPending: (next) => { pendingRequeues = next; },
        onTick: (now) => { requeueNow = now; },
        isLoading: () => loading,
        onDue: (due) => {
            queue = [...queue, ...due];
            sessionDone = false;
            if (!current && queue.length > 0) {
                void setCurrent(queue[0]);
            }
        },
    });

    function stopRequeueTimers() {
        requeueScheduler.stop();
    }

    function scheduleRequeueTimer() {
        requeueScheduler.schedule();
    }

    function releaseDueRequeues() {
        requeueScheduler.releaseDue();
    }

    function queueDelayedRequeue(card: QueueCard) {
        pendingRequeues = enqueueDelayedRequeue(pendingRequeues, markAsRequeueCard(card));
        requeueScheduler.schedule();
    }

    function clearPendingRequeues() {
        pendingRequeues = [];
        requeueScheduler.stop();
    }

    function changeScope() {
        // 延迟卡属于原范围；切换范围后丢弃，避免跨范围误出卡。
        clearPendingRequeues();
        recovery = null;
        void loadQueue();
    }
    // BI-9：中断恢复分支（快照存在时给出四选一；不自动重复评分/写卡）
    let recovery = $state<RecoveryOption[] | null>(null);
    // BI-27 返场分流横幅（跨天 + 上日收工原因；展示性方案，可忽略）
    let returnBanner = $state<{ planText: string; steps: string[]; capText: string } | null>(null);
    let recoverySnap: RecoverySnapshot | null = null;
    // BI-8：收工原因（done 屏收集；可跳过，写入当日现场供恢复横幅/返场分流读取）
    // svelte-ignore state_referenced_locally -- 初值刻意的：恢复路径在 onMount 恢复现场时回填 endPicked
    let endPicked = $state<string | null>(ctx.getSessionState()?.endReason ?? null);
    function pickEnd(r: EndReason) {
        if (recordSessionEndReason(ctx.getSessionState(), r, ctx.saveSessionState)) {
            endPicked = r;
        }
    }
    // BI-10：长期返场检查横幅（只读预览；触发=长间隔或大积压；仅本次会话内可关闭）
    let returnItems = $state<{ key: string; level: string; text: string }[] | null>(null);
    let returnDismissed = $state(false);
    function loadReturnCheck() {
        if (!ctx.getReturnCheckFacts) return;
        ctx.getReturnCheckFacts().then(f => {
            if (!f || returnDismissed || !isLongReturn(f)) return;
            returnItems = formatReturnCheckItems(f, (path) => resolveI18nPath(t, path));
        }).catch(() => { /* 事实聚合失败=不弹横幅，不影响复习 */ });
    }
    // BI-13：减负选择（只读建议；点击展开对 due/历史的影响说明，可跳过）
    const reliefChoices = loadReliefChoices();
    let reliefOpen = $state<LoadChoice | null>(null);
    function onReliefPick(key: LoadChoice) {
        reliefOpen = toggleReliefChoice(reliefOpen, key);
        // 「缩小范围」联动范围选择器（聚焦提示用户收窄；不代选任何范围）
        if (key === "narrow") {
            toolbarRef?.focusScope?.();
        }
    }
    // BI-2：本次会话目的（默认复习到期；informal 目的完成屏不庆祝每日目标）
    // svelte-ignore state_referenced_locally
    let purpose = $state<SessionPurpose>(initialCram ? "practice" : "review");
    let toolbarRef = $state<any>(null);
    let prefsRef = $state<any>(null);

    function focusScopeInPrefs() {
        prefsOpen = true;
        void prefsRef?.focusScope?.();
    }

    // 撤销历史栈（M3·FR7，ZY 技法：快照恢复 + 内核重评时按官方缓存恢复原状态）
    let history = $state<ReviewHistorySnapshot<QueueCard>[]>([]);

    /** 会话快照统一出口（AQ-2）：计数与 skip 集合的当前值即时落盘；Cram 突击快刷模式不污染正式每日快照 */
    function persistSession() {
        if (cramActive) return;
        ctx.saveSessionState(createSessionSnapshot(
            todayKey(),
            reviewedIDs,
            sessionSkipped,
            { new: sessionNew, review: sessionReview, forget: sessionForget, skip: sessionSkip }
        ));
    }

    // 回看上一张（M3·FR6）
    let peek = $state<{ html: string; card: RiffDueCard; revealed: boolean } | null>(null);
    // 超时倒计时（M3·FR8）
    let timeoutLeft = $state(0);
    // docs/13 §6：「遗忘」限时到点标记——揭示答案并提示自评，不自动记分
    let timeoutExpired = $state(false);
    let countdownCtrl: ReviewCountdownController | null = null;
    // AT-10：最近一次生效的超时参数（设置变更时对比决定是否重启计时）
    let lastTimeoutMode: "off" | "reveal" | "forget" = "off";
    let lastTimeoutSeconds = 60;
    // 打字模式（M4·FR2，全局练习模式）
    let typingInput = $state("");
    let typingGrade = $state<{ chars: { ch: string; ok: boolean }[]; suggested: Rating1to4; isTypo?: boolean } | null>(null);
    let expectedText = $state("");
    let currentRiffTitle = $state("");
    // 评分音效（M 组 P2，Web Audio 合成）
    let audioCtx: AudioContext | null = null;
    let activeUtterance: SpeechSynthesisUtterance | null = null;
    // 快捷键帮助覆盖层（AB 组）
    let helpOpen = $state(false);
    // AS-4：读屏播报（评分/跳过/加载/完成 → polite；错误 → assertive）
    let liveMsg = $state("");
    let liveTone = $state<"polite" | "assertive">("polite");
    function announce(msg: string, tone: "polite" | "assertive" = "polite") {
        const item = createLiveAnnouncement(msg, tone);
        liveMsg = item.msg;
        liveTone = item.tone;
    }
    // 移动端软键盘动态避让（visualViewport，防输入法遮挡题面与评分栏）
    let keyboardInset = $state(0);
    const isKeyboardOpen = $derived(keyboardInset > 120);

    const throttledViewportChange = rafThrottle(() => {
        if (isDisposed || typeof window === "undefined" || !window.visualViewport) return;
        const res = computeKeyboardViewportState(window.innerHeight, window.visualViewport.height);
        keyboardInset = res.keyboardInset;
        if (res.isKeyboardOpen && document.activeElement && rootEl?.contains(document.activeElement)) {
            (document.activeElement as HTMLElement).scrollIntoView?.({ block: "nearest", behavior: (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) ? "auto" : "smooth" });
        }
    });

    function onViewportChange() {
        throttledViewportChange();
    }
    let showReschedule = $state(false);
    /** BX-3 本场偏好：覆盖全局设置（仅当前复习面板生命周期内有效，切页后还原） */
    let sessionOverride: Partial<ReviewSettings> = $state({});
    /** AT-10 补充：ctx.settings() 返回普通对象（非响应式），出题形态/判定类 derived 无法感知
     * 设置保存——以版本号信号桥接 settings-changed 广播，保存后立即按新设置出题（C-3 审计修复） */
    let settingsRev = $state(0);
    let prefsOpen = $state(false);
    /** BI-12 时间预算：本场维度（非全局设置，不进覆盖集）；预算到≠失败——只提示不强制收工 */
    let budgetMin = $state(0);
    let budgetStartedAt = $state(0);
    let budgetAvg = $state(10); // 设定预算时按 revlog dur 采样一次
    let budgetNow = $state(0);
    $effect(() => {
        if (budgetMin <= 0 || budgetStartedAt <= 0) return;
        budgetNow = Date.now();
        const t = setInterval(() => { budgetNow = Date.now(); }, 1000);
        return () => clearInterval(t);
    });
    function setBudget(min: number) {
        budgetMin = min;
        const b = initBudgetSession(min, ctx.getRevlog().entries.map(e => e.dur));
        budgetStartedAt = b.startedAt;
        budgetNow = b.now;
        budgetAvg = b.avgSec;
    }
    const budgetLeft = $derived(budgetLeftSec(budgetStartedAt, budgetMin, budgetNow || Date.now()));
    const budgetExpired = $derived(isBudgetExpired(budgetStartedAt, budgetMin, budgetNow || Date.now()));
    const budgetEstimate = $derived(
        resolveBudgetEstimate(budgetLeft, budgetExpired, budgetMin, budgetAvg, queue.length)
    );
    function budgetClockText(): string {
        return formatBudgetClock(budgetLeft);
    }
    /** 统一设置读取：本场覆盖优先，否则走全局设置 */
    function eff(): ReviewSettings {
        return mergeSessionPrefs(ctx.settings() as unknown as Record<string, unknown>, sessionOverride) as unknown as ReviewSettings;
    }
    const hasOverrides = $derived(Object.keys(sessionOverride).length > 0);
    /** R52 review 面 eyebrow：当前卡的卡组名优先，退回所选范围文案（不暴露原始 deckID） */
    const headScopeLabel = $derived.by(() => {
        return resolveHeadScopeLabel(scopeKey, current?.deckID, decks, notebooks, t.review);
    });
    /** BX-3：设置本场覆盖项（与全局同值时自动摘除，保持覆盖面最小；超时相关变更即时重启计时器） */
    function applyOverrides(overrides: Record<string, unknown>) {
        const next = pruneSessionPrefs(ctx.settings() as unknown as Record<string, unknown>, { ...sessionOverride, ...overrides }) as Partial<ReviewSettings>;
        sessionOverride = next;
        if (shouldRestartTimeoutOnOverrides(overrides)) restartTimeout();
    }
    function setOverride(key: keyof ReviewSettings, value: unknown) {
        applyOverrides({ [key]: value });
    }
    let rescheduleDays = $state(1);
    let rescheduleBusy = $state(false);
    let rescheduleError = $state("");
    let dismissBusy = $state(false);
    const actionBusy = $derived(isCardActionBusy(submitting, rescheduleBusy, dismissBusy));
    let retryReschedule = $state<RescheduleRequest | null>(null);

    // R54 原型高级交互：改期目标时间友好预览
    let previewTargetLabel = $derived.by(() => {
        const lang = document.documentElement.lang || (window.siyuan as any)?.config?.lang || (window.siyuan as any)?.languages?.lang || navigator.language;
        return computeReschedulePreview(rescheduleDays, retryReschedule?.due, lang);
    });

    // R54 原型高级交互：暂停复习并返回今日
    let showPauseModal = $state(false);
    let sessionPaused = $state(false);
    let pausedTimeoutSeconds: number | undefined;
    function pauseSessionAndReturn() {
        sessionPaused = true;
        pausedTimeoutSeconds = timeoutLeft;
        persistSession();
        stopTimeout();
        stopRequeueTimers();
        closeReviewAudio(audioCtx);
        audioCtx = null;
        showPauseModal = false;
        try {
            ctx.openDashboard("overview");
        } catch (error) {
            showMessage(friendlyError(error, t), 5000, "error");
            return;
        }
        showMessage(t.review.pauseToast, 3000, "info");
    }

    function resumePausedSession() {
        if (!sessionPaused) return;
        sessionPaused = false;
        scheduleRequeueTimer();
        if (shouldRestartCountdownOnResume(showAnswer, faceReady)) restartTimeout(pausedTimeoutSeconds);
        pausedTimeoutSeconds = undefined;
    }

    // R54 原型高级交互：就地标记疑问
    let markedIssueCardIDs = $state<Set<string>>(new Set());
    // 专注复习顶栏：折叠收纳二级操作气泡
    let showMoreToolbar = $state(false);
    // 汲取自闪卡小助手 ZY 与 RemNote：卡片所属文档上下文路径与结构化面包屑
    let currentHPath = $state("");
    let currentBreadcrumbs = $state<ReviewBreadcrumbChain | null>(null);
    let hideBreadcrumbParentPath = $state(false);
    const breadcrumbCache = createBreadcrumbCache(256);
    // 汲取自渐进学习插件：给未来的自己留助记线索
    let cardMemo = $state("");
    let showMemoEditor = $state(false);
    let memoDraft = $state("");
    let memoSaving = $state(false);
    // 卡面大图全屏原图聚焦预览（Lightroom Zoom）
    let zoomedImage = $state<ZoomedImageState | null>(null);
    let reversedRecall = $state(false);
    let stepRevealedCount = $state(0);
    let pressedKeyFeedback = $state<string | null>(null);

    // 汲取自番茄插件：复习端就地移出卡组
    let showRetireModal = $state(false);
    let retireBusy = $state(false);

    async function dismissCurrentCard() {
        if (!current || isCardActionBusy(submitting, rescheduleBusy, dismissBusy)) return;
        dismissBusy = true;
        const blockID = current.blockID;
        const cardID = current.cardID;
        const undoSnap = pushHistory({ revlogAppended: false, dismissedBlockID: blockID });
        let attrWritten = false;
        try {
            if (siyuanApi.setBlockAttrs) {
                await siyuanApi.setBlockAttrs(blockID, buildDismissAttrs());
            }
            attrWritten = true;
            reviewedIDs = [...reviewedIDs, cardID];
            persistSession();
            const hiddenMsg = "已归档隐藏（保留 FSRS 进度，可在「卡库 → 已隐藏」恢复）";
            announce(hiddenMsg, "polite");
            await next();
            dismissBusy = false;
            lvNotify.undo({
                source: "闪卡",
                message: hiddenMsg,
                undoLabel: "撤销",
                duration: 5000,
                onUndo: () => triggerUndoForSnapshot(undoSnap),
            });
        } catch (e: any) {
            if (!attrWritten) popReviewHistory(history);
            showMessage(friendlyError(e, t), 2000, "error");
        } finally {
            dismissBusy = false;
        }
    }
    function adjustFontScale(delta: number) {
        const next = clampFontScale(eff().cardFontScale || 1, delta, 0.8, 1.6);
        setOverride("cardFontScale", next);
        const text = formatFontScalePercent(next);
        announce(`字号已调整至 ${text}`, "polite");
        showMessage(`${t.review.fontScaleTitle ?? "卡面字号"}: ${text}`, 1200, "info");
    }

    function toggleMarkIssue() {
        if (!current || actionBusy || markedIssueCardIDs.has(current.cardID)) return;
        const res = toggleCardIssue(markedIssueCardIDs, current.cardID);
        markedIssueCardIDs = res.nextMarkedIDs;
        ctx.tagErrorReason?.(current.cardID, "question-unclear", current.blockID);
        showMessage(t.review.issueMarked, 2500, "info");
        announce(t.review.issueMarked, "polite");
    }

    // R54 原型高级交互：本场作答方式即时覆盖
    let showSessionOptionsModal = $state(false);
    let sessionModalWasOpen = false;
    let sessionModalTimeoutSeconds: number | undefined;
    $effect(() => {
        const open = isAnyReviewModalOpen({ showPauseModal, showSessionOptionsModal, showMemoEditor, showRetireModal, showReschedule });
        if (open && !sessionModalWasOpen) {
            sessionModalWasOpen = true;
            sessionModalTimeoutSeconds = countdownCtrl?.getRemaining();
            stopTimeout();
        } else if (!open && sessionModalWasOpen) {
            sessionModalWasOpen = false;
            if (sessionPaused) return;
            returnFocus();
            if (shouldRestartCountdownOnResume(showAnswer, faceReady)) restartTimeout(sessionModalTimeoutSeconds);
            sessionModalTimeoutSeconds = undefined;
        }
    });
    let tempAnswerVariant = $state<SessionVariantOption>("normal");
    function openSessionOptions() {
        tempAnswerVariant = getInitialSessionVariant(eff());
        showSessionOptionsModal = true;
    }
    function applySessionOptions() {
        const overrides = resolveSessionVariantOverrides(tempAnswerVariant);
        applyOverrides(overrides);
        if (tempAnswerVariant === "typing") {
            typingInput = "";
        } else if (tempAnswerVariant === "choice" && !choices) {
            void startChoice();
        }
        showSessionOptionsModal = false;
        showMessage(t.review.sessionOptionsApplied, 1500, "info");
    }
    // 图片遮挡（M4·FR4 riff 先行）：数据来自块属性 lv-occlusion，坐标相对图片包围盒
    let cardEl: HTMLDivElement | null = $state(null);
    let rootEl: HTMLDivElement | null = $state(null);
    let occl = $state<OcclusionData | null>(null);
    let occlBox = $state<{ l: number; t: number; w: number; h: number } | null>(null);
    let occlHidden = $state<number[]>([]);
    const hasSvgCanvas = $derived(hasSvgOrCanvasDrawing(cardHtml));

    function openCanvasInEditor(canvasId?: string) {
        const id = resolveEditorNavigationBlockId(canvasId, current?.blockID);
        if (!id) {
            showMessage(t.review?.sourceNotFound ?? "原笔记块不存在或已被删除", 2500, "info");
            return;
        }
        suspendStopwatch();
        if (zenMode) {
            zenMode = false;
        }
        showMessage(t.review?.canvasEditOpen ?? "已在思源编辑器中打开画布进行编辑，保存后切回闪卡即可自动同步", 3000, "info");
        try {
            if (ctx.isMobile && canOpenMobileFile()) {
                disarmReviewHistory(true);
                openMobileFile(ctx.app, id);
                ctx.closeMobileReviewDialog?.();
            } else {
                openTab({ app: ctx.app, doc: { id, zoomIn: true } });
            }
        } catch (e: unknown) {
            resumeStopwatch();
            showMessage(friendlyError(e, t), 2500, "error");
        }
    }
    let isCustomPluginAnswer = $state(false);
    // 选择题模式（M4·FR3，干扰项取自同队列后续卡）
    let answerCache = new Map<string, string>();
    let choiceRequestSeq = 0;
    let choices = $state<{ options: string[]; answerIdx: number; picked: number | null } | null>(null);
    let choiceLoading = $state(false);
    // 当同队列没有任何可靠干扰项时，选择题退回正常自由回忆，避免伪造选项。
    let choiceFallbackMode = $state<"none" | "free-recall">("none");
    // 交互式题型模型与作答状态（支持选择题选项卡片、判断题、填空打字与解析）
    let interactiveQuiz = $state<InteractiveQuizData | null>(null);
    let selectedChoiceKeys = $state<string[]>([]);
    let userJudgeChoice = $state<boolean | null>(null);
    let suggestedRating = $state<number | null>(null);
    let zenMode = $state(false);
    let prevLeftDock = false;
    let prevRightDock = false;
    let prevBottomDock = false;

    async function applyZenMode(enable: boolean) {
        if (enable) {
            try {
                prevLeftDock = isNativeDockVisible("left");
                prevRightDock = isNativeDockVisible("right");
                prevBottomDock = isNativeDockVisible("bottom");
                if (prevLeftDock) await toggleNativeDock("left", false);
                if (prevRightDock) await toggleNativeDock("right", false);
                if (prevBottomDock) await toggleNativeDock("bottom", false);
            } catch {}
        } else if (prevLeftDock || prevRightDock || prevBottomDock) {
            try {
                if (prevLeftDock) await toggleNativeDock("left", true);
                if (prevRightDock) await toggleNativeDock("right", true);
                if (prevBottomDock) await toggleNativeDock("bottom", true);
            } catch {}
            prevLeftDock = false;
            prevRightDock = false;
            prevBottomDock = false;
        }
    }

    $effect(() => {
        void applyZenMode(zenMode);
    });

    let answerRevealedAt = 0;
    let autoSubmitTimer: ReturnType<typeof setTimeout> | null = null;
    function clearAutoSubmitTimer() {
        if (autoSubmitTimer) {
            clearTimeout(autoSubmitTimer);
            autoSubmitTimer = null;
        }
    }

    function resetEphemeralQuiz() {
        const s = createInitialEphemeralQuizState();
        choices = s.choices;
        choiceLoading = s.choiceLoading;
        choiceFallbackMode = s.choiceFallbackMode;
        typingGrade = s.typingGrade;
        interactiveQuiz = s.interactiveQuiz;
        selectedChoiceKeys = s.selectedChoiceKeys;
        userJudgeChoice = s.userJudgeChoice;
        suggestedRating = s.suggestedRating;
    }

    async function loadBlockDOM(blockID: string) {
        const seq = ++loadSeq;
        try {
            // AQ-20：统一内核响应校验（非 0/缺字段抛错），失败保留旧卡面
            const dom = await getBlockDOM(blockID);
            if (seq !== loadSeq) {
                return; // 已切到新卡，丢弃旧响应
            }
            if (shouldInvalidateCardDerivedState(cardHtml, dom)) {
                // 编辑返回后题面变化：旧选择题、打字判分与请求都失效。
                choiceRequestSeq++;
                answerCache.delete(blockID);
                resetEphemeralQuiz();
            }
            cardHtml = dom;
            faceError = "";
            expectedText = extractExpectedCardAnswer(cardHtml);
            answerCache.set(blockID, expectedText);

            // 遮挡数据与块备注（宽容解析，无属性即为普通卡）
            try {
                const attrs = await getBlockAttrs(blockID);
                if (seq === loadSeq) {
                    const holder = document.createElement("div");
                    holder.innerHTML = cardHtml;
                    const marksCount = extractMarkTexts(holder).length;
                    const meta = parseCardAttrsMetadata(attrs, expectedText, (holder.textContent ?? "").trim(), marksCount, parseOcclusion);
                    occl = meta.occlusion;
                    occlHidden = [];
                    isCustomPluginAnswer = meta.isCustomPluginAnswer;
                    cardMemo = meta.cardMemo;
                    memoDraft = cardMemo;
                    expectedText = meta.expectedText;
                    currentRiffTitle = meta.customRiffTitle ?? "";
                    answerCache.set(blockID, expectedText);

                    interactiveQuiz = parseInteractiveQuiz({
                        domHtml: cardHtml,
                        attrs,
                        cardMemo,
                        expectedText,
                    });
                }
            } catch {
                if (seq === loadSeq) {
                    occl = null;
                }
            }
            // 汲取自闪卡小助手 ZY 与 RemNote：查询卡片所属文档层级路径与标题面包屑上下文
            try {
                if (breadcrumbCache.has(blockID)) {
                    const cached = breadcrumbCache.get(blockID)!;
                    if (seq === loadSeq) {
                        currentHPath = cached.currentHPath;
                        currentBreadcrumbs = cached.currentBreadcrumbs;
                    }
                } else if (siyuanApi.sqlQuery) {
                    let rows: any[] | null = null;
                    try {
                        rows = await siyuanApi.sqlQuery(buildRecursiveAncestorSql(blockID));
                    } catch {
                        rows = await siyuanApi.sqlQuery(buildHPathQuerySql(blockID));
                    }
                    if (seq === loadSeq) {
                        const pathRes = resolveCardBreadcrumbsFromRows(blockID, rows);
                        breadcrumbCache.set(blockID, pathRes);
                        currentHPath = pathRes.currentHPath;
                        currentBreadcrumbs = pathRes.currentBreadcrumbs;
                    }
                }
            } catch {
                if (seq === loadSeq) {
                    currentHPath = "";
                    currentBreadcrumbs = null;
                }
            }
        } catch (e) {
            if (seq !== loadSeq) {
                return;
            }
            if (!cardHtml) {
                // AS-3：新卡首载失败 → 卡面占位+可重试（不再整页切错误视图，队列保持可用）
                faceError = friendlyError(e, t);
            } else {
                // 刷新失败（已有卡面）：保留旧内容，仅记诊断
                lvLog("warn", "card DOM refresh failed: " + (e instanceof Error ? e.message : e));
            }
        }
    }

    /** AS-3：卡面加载失败占位的重试 */
    async function retryFace() {
        if (!current || !faceError) {
            return;
        }
        faceError = "";
        await loadBlockDOM(current.blockID);
    }

    function positionOcclusion() {
        occlBox = calculateOcclusionBox(cardEl, Boolean(occl));
    }

    /** 从块 DOM 提取答案文本（mark 合集优先，自适应存量问答语法与备注），带缓存（M4·FR3 干扰项采样用） */
    async function answerOf(blockID: string): Promise<string> {
        const cached = answerCache.get(blockID);
        if (cached !== undefined) {
            return cached;
        }
        try {
            const dom = await getBlockDOM(blockID);
            const text = extractAnswerFromDomHtml(dom);
            // 当前卡面可能在采样请求期间已刷新，优先保留新卡面的权威答案。
            const answer = answerCache.get(blockID) ?? text;
            answerCache.set(blockID, answer);
            return answer;
        } catch {
            return "";
        }
    }

    /** 选择题（M4·FR3）：本卡答案 + 同队列后续卡采样最多 3 个干扰项。 */
    async function startChoice() {
        if (!current || choiceLoading || typingInput.trim()) {
            return;
        }
        const seq = ++choiceRequestSeq;
        const cardID = current.cardID;
        const blockID = current.blockID;
        const candidates = queue.slice(1, 8);
        choiceLoading = true;
        try {
            const answer = await answerOf(blockID);
            if (seq !== choiceRequestSeq || current?.cardID !== cardID) return;
            answerCache.set(blockID, answer);
            const pool: string[] = [];
            for (const c of candidates) {
                if (pool.length >= 3) break;
                const text = await answerOf(c.blockID);
                if (seq !== choiceRequestSeq || current?.cardID !== cardID) return;
                addDistractorToPool(pool, text, answer);
            }
            const built = assembleChoiceOptions(answer, pool, shuffleArray);
            if (!built) {
                // 没有可靠的干扰项时保持自由回忆路径；不使用“干扰项 1/2/3”
                // 一类占位文本，以免把提示内容误当作知识。
                choices = null;
                choiceFallbackMode = "free-recall";
                return;
            }
            choices = built;
            choiceFallbackMode = "none";
        } catch {
            if (seq === choiceRequestSeq && current?.cardID === cardID) {
                choices = null;
                choiceFallbackMode = "free-recall";
            }
        } finally {
            if (seq === choiceRequestSeq) choiceLoading = false;
        }
    }

    function pickChoice(idx: number) {
        const res = recordChoicePick(choices, idx);
        if (!res) return;
        choices = res.nextChoices;
        if (res.shouldRevealAnswer) showAnswer = true;
    }

    async function loadQueue() {
        choiceRequestSeq++;
        const seq = ++queueSeq; // AQ-19：范围切换/重试并发时只接受最后一次请求
        loading = true;
        errorMsg = "";
        try {
            const kernelReviewedIDs = combineExcludedCardIDs(reviewedIDs, qualityExcludedCardIDs);
            const data = await getRiffDueCardsForScope(scopeKey, kernelReviewedIDs);
            if (seq !== queueSeq) {
                return; // 旧响应：不改队列、卡面、计数或计时器
            }
            let cards = data.cards ?? [];
            if (cramActive) {
                // Cram 突击快刷模式下，按当前范围（卡组/笔记本/文档/全局）拉取全量卡片并与到期队列去重合并
                try {
                    const deckID = scopeKey.startsWith("deck:") ? scopeKey.slice(5) : "";
                    const existingCardIDs = new Set(cards.map(c => c.cardID));
                    const existingBlockIDs = new Set(cards.map(c => c.blockID).filter(Boolean));
                    let page = 1;
                    let pageCount = 1;
                    do {
                        const allRes = scopeKey.startsWith("notebook:")
                            ? await getNotebookRiffCards?.(scopeKey.slice(9), page, 100)
                            : scopeKey.startsWith("doc:")
                                ? await getTreeRiffCards?.(scopeKey.slice(4), page, 100)
                                : await getRiffCards?.(deckID, page, 100);
                        if (!allRes || typeof allRes !== "object") break;
                        pageCount = Number(allRes.pageCount ?? 1);
                        for (const b of allRes?.blocks ?? []) {
                            const rc = (b as any).riffCard ?? (b as any).RiffCard;
                            const cid = String(rc?.id ?? rc?.cardID ?? b.id ?? "");
                            const bid = String(b.id ?? "");
                            if (!cid || kernelReviewedIDs.includes(cid)) continue;
                            if (existingCardIDs.has(cid) || (bid && existingBlockIDs.has(bid))) continue;
                            if (rc) {
                                existingCardIDs.add(cid);
                                if (bid) existingBlockIDs.add(bid);
                                cards.push({
                                    cardID: cid,
                                    deckID: String(rc.deckID ?? deckID),
                                    blockID: bid || cid,
                                    state: Number(rc.state ?? 0),
                                    reps: Number(rc.reps ?? 0),
                                    lapses: Number(rc.lapses ?? 0),
                                    due: String(rc.due ?? ""),
                                    stability: typeof rc.stability === "number" ? rc.stability : undefined,
                                    difficulty: typeof rc.difficulty === "number" ? rc.difficulty : undefined,
                                } as unknown as RiffDueCard);
                            }
                        }
                        page += 1;
                    } while (page <= pageCount && page <= 10);
                    cards = cards.filter(c => !kernelReviewedIDs.includes(c.cardID));
                } catch {
                    /* 静默降级 */
                }
            }
            for (const c of cards) {
                if (c?.cardID) sessionCardMap.set(c.cardID, c);
            }
            // 「今天不学」+ 本场已跳过的卡本地过滤（内核调度不受影响，AJ9）
            cards = filterActiveSessionCards(cards, ctx.isSuspendedToday, sessionSkipped);
            // 自适应候选窗口：当到期卡量大且设置了每批上限时，对首批候选进行质量排查即可，避免全库千张卡阻塞首卡加载
            const bl = eff().batchLimit ?? 0;
            const scopedCandidate = (scopeKey === "new" || scopeKey === "old")
                ? cards.filter(c => (scopeKey === "new") === (c.state === 0))
                : cards;
            const candidateLimit = bl > 0 ? Math.min(scopedCandidate.length, Math.max(50, bl * 3)) : scopedCandidate.length;
            const candidateCards = candidateLimit < scopedCandidate.length ? scopedCandidate.slice(0, candidateLimit) : scopedCandidate;

            // 先验证源块的最终 Markdown，避免没有有效挖空标记的历史坏卡在问题态直接露出答案。
            // 此处只从本场展示队列排除；不评分、不跳过、不修改真实 due。
            if (candidateCards.length > 0 && typeof siyuanApi.sqlQuery === "function") {
                const quality = await filterReviewQueueByQuality(
                    candidateCards,
                    siyuanApi.sqlQuery,
                    getBlockAttrs,
                    parseOcclusion
                );
                if (seq !== queueSeq) return;
                cards = quality.valid;
                if (quality.invalid.length > 0) {
                    qualityExcludedCardIDs = mergeQualityExcludedCardIDs(qualityExcludedCardIDs, quality.invalid);
                    announce(t.review.qualityExcluded.replace("${n}", String(qualityExcludedCardIDs.length)), "polite");
                }
            } else {
                cards = candidateCards;
            }
            // 管道处理：范围筛选、批次截断、同源兄弟卡防剧透推迟与排序
            queue = applyQueuePipeline(cards, {
                scopeKey,
                batchLimit: (cramActive || isCramMode) ? 0 : eff().batchLimit,
                burySiblings: eff().burySiblings,
                cramActive: cramActive || isCramMode,
                cramScope,
                reverseOrder: eff().reverseOrder,
                randomOrder: (cramActive || isCramMode) ? cramRandomOrder : eff().randomOrder,
                shuffleFn: shuffleArray,
                leechThreshold: (cramActive || isCramMode) && cramScope === "leech" ? 5 : eff().leechThreshold,
            });
            // BI-27 返场分流：跨天返场且上日有收工原因 → 今日方案横幅（展示性，不自动改预算/队列）。
            if (!recovery) {
                returnBanner = deriveReturnBanner(ctx.getSessionState(), queue.length, t.returnTriage);
            }
            // BI-9：首刷后回填队列剩余数，恢复分支可用性随之刷新（继续原场/缩小范围是否可选）
            if (recovery && recoverySnap) {
                recoverySnap.queueRemaining = queue.length;
                recovery = recoveryOptions(recoverySnap);
            }
            if (queue.length > 0) {
                announce(t.review.liveQueued.replace("${n}", String(queue.length)), "polite");
            }
            if (queue.length === 0) {
                current = null;
                if (pendingRequeues.length > 0) {
                    // 延迟循环仍属于本场：先显示等待态，不能把本场提前广播为完成。
                    sessionDone = false;
                    stopTimeout();
                    scheduleRequeueTimer();
                    return;
                }
                const finished = !sessionDone; // 只在首次进入完成态时广播
                sessionDone = true;
                disarmReviewHistory(); // Mobile Spec v1 深化：正常完成卡片后清理返回手势历史占位
                const hasWork = reviewedIDs.length > 0 || sessionSkipped.length > 0;
                if (!(cramActive || isCramMode) && finished && hasWork) {
                    const s = ctx.getSessionState();
                    if (s && !s.completed) ctx.saveSessionState(markSessionCompleted(s));
                    ctx.emitSessionFinished({ new: sessionNew, review: sessionReview, forget: sessionForget, skip: sessionSkip });
                }
                // 今日活动流广播 (lvActivity，Epoch 7 Phase 3 全生态今日成果汇流)
                if (finished && reviewedIDs.length > 0) {
                    const reviewedCount = reviewedIDs.length;
                    if (cramActive || isCramMode) {
                        try {
                            lvActivity.record({
                                source: "闪卡",
                                category: "card",
                                title: `突击快刷 ${reviewedCount} 张`,
                            });
                        } catch { /* 旁路 */ }
                    } else {
                        let activeDeckName = "闪卡";
                        if (scopeKey.startsWith("deck:")) {
                            const dId = scopeKey.slice(5);
                            const d = decks.find(dk => dk.id === dId);
                            if (d?.name) activeDeckName = d.name;
                        } else if (sessionCardMap.size > 0) {
                            const firstCard = sessionCardMap.values().next().value;
                            if (firstCard?.deckID) {
                                const d = decks.find(dk => dk.id === firstCard.deckID);
                                if (d?.name) activeDeckName = d.name;
                            }
                        }
                        const elapsedMinutes = Math.max(1, Math.round((Date.now() - sessionStartedAt) / 60000));
                        try {
                            lvActivity.record({
                                source: "闪卡",
                                category: "card",
                                title: `完成「${activeDeckName}」复习 (${reviewedCount}张)`,
                                detail: `耗时 ${elapsedMinutes} 分钟`,
                            });
                        } catch { /* 旁路 */ }
                    }
                }
                // 联动小驴打卡（Ecosystem Federation Epoch 6 / 智能零配置打卡）
                if (!(cramActive || isCramMode) && finished && reviewedIDs.length > 0) {
                    const reviewedCount = reviewedIDs.length;
                    let checkinItemId = eff().checkinItemId;
                    let autoMatched = false;
                    if (!checkinItemId) {
                        checkinItemId = await findMatchingCheckinItemId();
                        if (checkinItemId) autoMatched = true;
                    }
                    if (checkinItemId && reviewedCount > 0) {
                        const today = todayKey();
                        const accuracy = calculateReviewAccuracy({
                            newCount: sessionNew,
                            reviewCount: sessionReview,
                            forgetCount: sessionForget,
                            quizTotal: sessionQuizTotal,
                            quizCorrect: sessionQuizCorrect,
                        });
                        void logCheckinEventSafely({
                            itemId: checkinItemId,
                            value: reviewedCount,
                            unit: "张",
                            externalRef: `cards:${checkinItemId}:${today}`,
                            note: `完成闪卡复习 ${reviewedCount} 张（命中率 ${accuracy}%）`,
                        }).then((ok) => {
                            if (ok) {
                                showMessage(
                                    autoMatched
                                        ? `[小驴打卡] 自动匹配并记录「闪卡复习」+${reviewedCount}张`
                                        : `[小驴打卡] 今日复习打卡成功（+${reviewedCount}张）`,
                                    2800,
                                    "info"
                                );
                            }
                        });
                    }
                }
                // BI-8/BI-12：预算到点自动记「时间到」收工原因（中性事实；用户手动点选的原因优先）
                if (finished && budgetExpired && !ctx.getSessionState()?.endReason) {
                    recordSessionEndReason(ctx.getSessionState(), "time-up", ctx.saveSessionState);
                }
                stopTimeout();
            } else {
                sessionDone = false;
                await setCurrent(queue[0]);
            }
        } catch (e: any) {
            if (seq !== queueSeq) {
                return; // 失败的旧请求不覆盖新状态
            }
            errorMsg = friendlyError(e, t);
        } finally {
            if (seq === queueSeq) {
                loading = false;
                // 处理网络请求期间已经到期的本地遗忘卡，避免响应覆盖延迟队列。
                releaseDueRequeues();
            }
        }
    }

    async function recheckQualityExcluded() {
        qualityExcludedCardIDs = [];
        await loadQueue();
    }

    // Mobile Spec v1 深化：复习会话进度保护（Android 返回手势/返回键拦截与落盘退出确认）
    let reviewHistoryArmed = false;
    let reviewPopHandler: (() => void) | undefined;

    function armReviewHistory() {
        if (reviewHistoryArmed || typeof window === "undefined" || sessionDone || !current) return;
        try {
            const hist = (window as unknown as { history?: History }).history;
            if (!hist || typeof hist.pushState !== "function") return;
            hist.pushState({ lvCards: true }, "");
            reviewHistoryArmed = true;
            reviewPopHandler = () => {
                reviewHistoryArmed = false;
                reviewPopHandler = undefined;
                if (sessionDone || !current) return;
                const rawMsg = t.review?.backConfirm;
                const confirmMsg = typeof rawMsg === "function" ? rawMsg() : (rawMsg ?? "复习进行中，退出将计入本次已复习卡片");
                const confirmed = window.confirm(confirmMsg);
                if (confirmed) {
                    persistSession();
                    if (ctx.onClose) {
                        ctx.onClose();
                    } else {
                        ctx.openDashboard();
                    }
                } else {
                    armReviewHistory();
                }
            };
            window.addEventListener("popstate", reviewPopHandler, { once: true });
        } catch { /* 历史不可用环境静默 */ }
    }

    function disarmReviewHistory(replaceOnly = false) {
        if (reviewPopHandler && typeof window !== "undefined") {
            try { window.removeEventListener("popstate", reviewPopHandler); } catch { /* ignore */ }
            reviewPopHandler = undefined;
        }
        if (reviewHistoryArmed && typeof window !== "undefined") {
            reviewHistoryArmed = false;
            try {
                const hist = (window as unknown as { history?: History & { state?: unknown } }).history;
                if (hist?.state?.lvCards) {
                    if (replaceOnly && typeof hist.replaceState === "function") {
                        hist.replaceState({}, "");
                    } else if (typeof hist.back === "function") {
                        hist.back();
                    }
                }
            } catch { /* ignore */ }
        }
    }

    async function setCurrent(card: RiffDueCard) {
        resetCardState();
        current = card;
        if (!sessionDone && current) armReviewHistory();
        if (card?.cardID) {
            sessionCardMap.set(card.cardID, card);
            if (isCardStarred(card) && !sessionStarredCardIDs.has(card.cardID)) {
                const next = new Set(sessionStarredCardIDs);
                next.add(card.cardID);
                sessionStarredCardIDs = next;
            }
        }
        cardShownAt = Date.now(); // AQ-13：题面呈现即作答计时起点（与内核「题面到评分」口径一致）
        await loadBlockDOM(card.blockID);
        if (card !== current) {
            return; // 等待期间已切卡（AQ-19）：不重启旧卡计时器、不朗读旧卡
        }
        restartTimeout();
        // 听写模式：问题态自动朗读答案（M4·FR6，需打字模式开启）
        if (shouldAutoSpeakDictation(eff().typingEnabled, eff().dictationEnabled, expectedText)) {
            speakText(expectedText);
        }
    }

    /** 切卡和撤销共用清理，防止上一张的倒计时、答案与异步响应污染新卡。 */
    function resetCardState() {
        stopTimeout();
        clearAutoSubmitTimer();
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
            window.speechSynthesis.cancel();
            activeUtterance = null;
        }
        choiceRequestSeq++;
        loadSeq++;
        contextRequestSeq++;
        showAnswer = false;
        isPeekingAnswer = false;
        stopwatchSuspendedAt = 0;
        answerRevealedAt = 0;
        expectedText = "";
        typingInput = "";
        occl = null;
        occlBox = null;
        occlHidden = [];
        cardHtml = ""; // AS-3：切卡先清卡面——新卡加载失败显示占位而非上一张的残留内容
        faceError = "";
        showReschedule = false;
        rescheduleError = "";
        retryReschedule = null;
        showMoreToolbar = false;
        currentHPath = "";
        currentBreadcrumbs = null;
        cardMemo = "";
        showMemoEditor = false;
        memoDraft = "";
        memoSaving = false;
        showRetireModal = false;
        retireBusy = false;
        zoomedImage = null;
        reversedRecall = false;
        stepRevealedCount = 0;
        ctxOpen = false;
        ctxBlocks = [];
        ctxLoading = false;
        hintLevel = null;
        hintText = "";
        showErrTags = false;
        resetEphemeralQuiz();
    }

    /** 汲取自渐进学习插件：保存助记便签（给未来的自己留线索） */
    async function saveCardMemo() {
        if (!current || memoSaving) return;
        const card = current;
        const memoAttrs = buildMemoAttributes(memoDraft);
        memoSaving = true;
        try {
            if (siyuanApi.setBlockAttrs) {
                await siyuanApi.setBlockAttrs(card.blockID, memoAttrs);
            }
            if (isDisposed) return;
            if (current?.cardID === card.cardID) {
                cardMemo = memoAttrs.memo;
                showMemoEditor = false;
            }
            showMessage(t.review.memoSavedToast ?? "助记便签已保存，下次复习时将提醒你", 2500, "info");
        } catch (e: any) {
            if (isDisposed) return;
            showMessage(friendlyError(e, t), 4000, "error");
        } finally {
            if (!isDisposed) memoSaving = false;
        }
    }

    /** 汲取自番茄插件：复习端就地移出卡组（安全不修改正文） */
    async function retireCurrentCard() {
        if (!current || retireBusy) return;
        const card = current;
        retireBusy = true;
        try {
            if (ctx.removeFromDeck) {
                await ctx.removeFromDeck(card.blockID);
            }
            if (isDisposed) return;
            showMessage("已移出思源卡组并清空 FSRS 排期（原笔记正文不受影响）", 3200, "info");
            queue = removeCardFromQueue(queue, card.cardID);
            if (current?.cardID !== card.cardID) return;
            showRetireModal = false;
            const nextHead = getNextQueueHead(queue);
            if (nextHead) {
                await setCurrent(nextHead);
            } else {
                stopTimeout();
                current = null;
                await loadQueue();
            }
        } catch (e: any) {
            if (isDisposed) return;
            showMessage(friendlyError(e, t), 4000, "error");
        } finally {
            if (!isDisposed) retireBusy = false;
        }
    }

    function closeMemoEditor() {
        if (!memoSaving) showMemoEditor = false;
    }

    function closeRetireModal() {
        if (!retireBusy) showRetireModal = false;
    }

    function onCardContentClick(e: MouseEvent) {
        const act = handleCardContentClick(e.target, showAnswer, cardEl);
        if (!act) return;
        e.stopPropagation();
        if (act.type === "zoom-image") {
            openZoomedImage(act.src, act.alt);
        } else if (act.type === "cloze-reveal") {
            stepRevealedCount = advanceClozeStep(stepRevealedCount, act.allRevealed, revealAnswer);
        }
    }

    function onCardContentDblClick(e: MouseEvent) {
        const canvasBlockId = handleCardCanvasDblClick(e.target, current?.blockID);
        if (canvasBlockId) {
            e.stopPropagation();
            openCanvasInEditor(canvasBlockId);
        }
    }

    function openZoomedImage(src: string, alt?: string) {
        zoomedImage = createZoomedImageState(src, alt);
    }

    function revealNextClozeOrAll(forceAll = false): boolean {
        const res = stepNextCloze(cardEl, forceAll);
        if (res.revealed) {
            stepRevealedCount = advanceClozeStep(stepRevealedCount, res.allRevealed, revealAnswer);
            return true;
        }
        return false;
    }

    function triggerKeyFeedback(key: string) {
        pressedKeyFeedback = key;
        setTimeout(() => {
            if (pressedKeyFeedback === key) pressedKeyFeedback = null;
        }, 180);
    }

    function closeZoomedImage() {
        zoomedImage = null;
        returnFocus();
    }

    /** TTS 朗读（Web Speech，防御式） */
    function speakText(text: string) {
        activeUtterance = speakReviewText(text, eff());
    }

    /** TTS 朗读答案（C9 朗读部分，Web Speech，防御式） */
    function speakAnswer() {
        activeUtterance = speakAnswerText(expectedText, cardHtml, eff());
    }

    /** 评分音效（Web Audio 合成，M 组 P2）：chime 清音 / wood 木鱼 / bell 铃；受 sfxEnabled 开关（250） */
    function playSfx(rating: Rating) {
        audioCtx = playReviewSfx(rating, eff(), audioCtx);
    }

    /** 打字题提交：判分并亮出答案（评分仍由用户按键确认，建议值显示为 chip） */
    function submitTyping() {
        if (!current || typingGrade) {
            return;
        }
        const res = evaluateCardTyping(expectedText, typingInput, eff().typingStrict);
        if (res.isBlank) {
            // 输入为空敲 Enter 直接翻面查看答案（放弃思考/不输入直接揭晓）
            revealAnswer();
            return;
        }
        typingGrade = res.typingGrade;
        showAnswer = true;
    }

    // —— 超时模式 ——

    function restartTimeout(remainingSeconds?: number) {
        stopTimeout();
        timeoutExpired = false;
        const s = eff();
        if (!isCountdownEligible({
            timeoutMode: s.timeoutMode,
            hasCurrent: Boolean(current),
            faceReady,
            sessionPaused,
            showPauseModal,
            showSessionOptionsModal,
        })) {
            timeoutLeft = 0;
            return;
        }
        lastTimeoutMode = s.timeoutMode;
        lastTimeoutSeconds = s.timeoutSeconds;
        countdownCtrl = createReviewCountdown({
            timeoutMode: s.timeoutMode,
            timeoutSeconds: remainingSeconds ?? s.timeoutSeconds,
            onTick: (left) => {
                timeoutLeft = left;
            },
            onExpire: (mode) => {
                showAnswer = true;
                answerRevealedAt = Date.now();
                if (mode === "forget") {
                    timeoutExpired = true;
                    suggestedRating = 1;
                }
            },
        });
        countdownCtrl.start();
    }

    function stopTimeout() {
        countdownCtrl?.stop();
        countdownCtrl = null;
    }

    function timeoutText(): string {
        return formatCountdown(timeoutLeft);
    }

    /** 完成页会话时长（544）：本页面挂载即会话起点，恢复会话也从恢复点起算 */
    let sessionStartedAt = $state(Date.now());
    function sessionDurationText(): string {
        return formatSessionDuration(sessionStartedAt);
    }

    /** 空队列态（R53 §3.9）：无任何作答即完成 → 「该范围没有到期的卡」而非 0 值完成庆祝 */
    const emptyQueue = $derived(
        isEmptyQueueSession(sessionDone, { new: sessionNew, review: sessionReview, forget: sessionForget, skip: sessionSkip })
    );

    /** 完成页今日目标进度（544）：本次会话有效评分 vs 每日复习目标 */
    function targetProgressText(): string {
        return formatTargetProgress(sessionNew + sessionReview, eff().dailyReviewTarget, t.review.doneTarget);
    }

    /** 连击里程碑（374）：7/30/100/365 天完成页专属庆祝 */
    function streakMilestoneText(): string {
        return formatStreakMilestone(calcStreak(ctx.getRevlog()), t.review.streakMilestone);
    }

    /** 每日一语（375）：按日期轮换的学习科学小贴士 */
    function dailyTip(): string {
        return getDailyScienceTip([t.review.tip1, t.review.tip2, t.review.tip3, t.review.tip4, t.review.tip5], eff().dailyTipEnabled);
    }

    // —— 评分 / 跳过 / 屏蔽 ——

    let historySnapshotSeq = 0;

    function pushHistory(opts?: { revlogAppended?: boolean; dismissedBlockID?: string; suspendedCardID?: string }): ReviewHistorySnapshot | null {
        if (!current) return null;
        const seq = ++historySnapshotSeq;
        const snap = createReviewHistorySnapshot({
            queue,
            pendingRequeues,
            reviewedIDs,
            skippedIDs: sessionSkipped,
            current,
            showAnswer,
            cardHtml,
            expectedText,
            faceError,
            occlusion: occl,
            counters: { new: sessionNew, review: sessionReview, forget: sessionForget, skip: sessionSkip },
            revlogAppended: opts?.revlogAppended ?? false,
            dismissedBlockID: opts?.dismissedBlockID,
            suspendedCardID: opts?.suspendedCardID,
            snapshotSeq: seq,
        });
        pushReviewHistory(history, snap);
        return snap;
    }

    function triggerUndoForSnapshot(snap: ReviewHistorySnapshot | null | undefined) {
        if (!snap || snap.snapshotSeq === undefined) return;
        const top = history[history.length - 1];
        if (top && top.snapshotSeq === snap.snapshotSeq) {
            undoHistory();
        } else {
            showMessage("已有后续作答，请按 P/Q 逐级撤销", 2000, "info");
        }
    }

    function undoHistory() {
        if (submitting || rescheduleBusy || dismissBusy) {
            return;
        }
        const snap = popReviewHistory(history);
        if (!snap) {
            showMessage(t.review.undoNone, 1800, "info");
            return;
        }
        if (snap.revlogAppended) {
            ctx.rollbackRevlog?.(snap.current?.cardID);
        }
        if (snap.dismissedBlockID && siyuanApi.setBlockAttrs) {
            void siyuanApi.setBlockAttrs(snap.dismissedBlockID, { [ATTR_LV_DISMISSED]: "" }).catch(() => {});
        }
        if (snap.suspendedCardID) {
            void Promise.resolve(ctx.unsuspendToday?.(snap.suspendedCardID)).catch(() => {});
        }
        if (snap.current?.cardID && snap.counters.forget < sessionForget) {
            const nextForgotten = new Set(forgottenCardIDs);
            nextForgotten.delete(snap.current.cardID);
            forgottenCardIDs = nextForgotten;
        }
        errorMsg = "";
        resetCardState();
        sessionDone = false;
        queue = snap.queue;
        pendingRequeues = snap.pendingRequeues;
        scheduleRequeueTimer();
        reviewedIDs = snap.reviewedIDs;
        sessionSkipped = snap.skippedIDs;
        current = snap.current;
        showAnswer = false;
        cardHtml = snap.cardHtml;
        expectedText = snap.expectedText;
        faceError = snap.faceError;
        occl = snap.occlusion;
        if (snap.current?.blockID) {
            void loadBlockDOM(snap.current.blockID);
        }
        cardShownAt = Date.now();
        sessionNew = snap.counters.new;
        sessionReview = snap.counters.review;
        sessionForget = snap.counters.forget;
        sessionSkip = snap.counters.skip;
        persistSession(); // 撤销后的计数同样落盘（AQ-2）
        restartTimeout();
        triggerHaptic(12); // Mobile Spec v1：撤销（含右滑撤销切卡）以触感确认生效
        showMessage(t.review.undoDone, 1500, "info");
    }

    async function rate(rating: Rating, force = false) {
        if (!canRateCurrentCard(Boolean(current), sessionPaused, showAnswer, force, actionBusy)) {
            return;
        }
        triggerHaptic(getRatingHapticPattern(rating));
        recovery = null; // BI-9：已开始评分=隐式选择继续原场
        submitting = true;
        pushHistory({ revlogAppended: false });
        let writeSucceeded = false;
        try {
            // A restored old session may still contain an extract. Recheck before any rating write.
            if (shouldBypassFsrs(await getBlockAttrs(current.blockID))) {
                writeSucceeded = true;
                await next();
                return;
            }
            if (current.cardID) {
                sessionCardMap.set(current.cardID, current);
            }
            // 会话强化重现卡（M3）：仅本地翻牌推进，不重复评内核、不计 revlog（调度不变）
            if (current.lvRequeue) {
                writeSucceeded = true;
                playSfx(rating);
                await next();
                return;
            }
            // Cram 考前突击快刷模式（对标 FSRS/Obsidian Cram）：纯过筛练习，不修改内核排期 due/interval
            if (cramActive || isCramMode) {
                writeSucceeded = true;
                playSfx(rating);
                reviewedIDs = [...reviewedIDs, current.cardID];
                if (rating === 1) {
                    const nextForgotten = new Set(forgottenCardIDs);
                    nextForgotten.add(current.cardID);
                    forgottenCardIDs = nextForgotten;
                }
                const wasNew = isCardNew(ctx.getRevlog(), current.cardID);
                const nextCounters = updateSessionCountersOnRate(
                    { new: sessionNew, review: sessionReview, forget: sessionForget, skip: sessionSkip },
                    rating,
                    wasNew
                );
                sessionNew = nextCounters.new;
                sessionReview = nextCounters.review;
                sessionForget = nextCounters.forget;
                sessionSkip = nextCounters.skip;
                if (rating === 1 && eff().requeueAgain) {
                    queueDelayedRequeue(current);
                }
                announce(t.review.liveRated, "polite");
                await next();
                return;
            }
            const wasNew = isCardNew(ctx.getRevlog(), current.cardID);
            playSfx(rating);
            await reviewRiffCard(current.deckID, current.cardID, rating, reviewedIDs);
            writeSucceeded = true;
            // AQ-13：作答耗时按设置封顶（后台停留/离席不制造超长样本），原生事件无此字段保持 N/A
            const dur = computeAnswerDuration(cardShownAt, eff().answerTimeCapSec);
            ctx.appendRevlog({ cardID: current.cardID, deckID: current.deckID, blockID: current.blockID, rating, source: "plugin", ...(dur !== undefined ? { dur } : {}) });
            if (history.length > 0) {
                history[history.length - 1].revlogAppended = true;
            }
            if (rating === 1) {
                const nextForgotten = new Set(forgottenCardIDs);
                nextForgotten.add(current.cardID);
                forgottenCardIDs = nextForgotten;
            }
            reviewedIDs = [...reviewedIDs, current.cardID];
            const prevTargetMet = (sessionNew + sessionReview) >= eff().dailyReviewTarget && eff().dailyReviewTarget > 0;
            const nextCounters = updateSessionCountersOnRate(
                { new: sessionNew, review: sessionReview, forget: sessionForget, skip: sessionSkip },
                rating,
                wasNew
            );
            if (!prevTargetMet && (nextCounters.new + nextCounters.review) >= eff().dailyReviewTarget && eff().dailyReviewTarget > 0) {
                triggerTargetCelebration();
            }
            sessionNew = nextCounters.new;
            sessionReview = nextCounters.review;
            sessionForget = nextCounters.forget;
            sessionSkip = nextCounters.skip;
            if (rating === 1 && eff().requeueAgain) {
                queueDelayedRequeue(current);
            }
            // AQ-2：先更新计数再落盘——重载恢复的进度与界面一致，不丢刚评的一张
            persistSession();
            announce(t.review.liveRated, "polite");
            const forgotCardID = rating === 1 ? current.cardID : null;
            const forgotBlockID = rating === 1 ? current.blockID : null;
            await next();
            // BJ-4：遗忘后显示错误原因标注（旁路增强，不阻塞下一张）。
            // 必须在 next() 之后置位——next() 开头会重置 showErrTags（F-3 审计修复：
            // 原先在 next() 前置位导致 chips 行被立即清除、从不显示）
            if (forgotCardID && ctx.tagErrorReason) {
                errTagCardID = forgotCardID;
                errTagBlockID = forgotBlockID ?? "";
                errTagged = false;
                showErrTags = true;
            }
        } catch (e: any) {
            // 评分失败保留现场（AJ11）：当前卡/答案态/队列不动，只通过 Toast 和语音提示错误，不抹除卡面
            if (!writeSucceeded) popReviewHistory(history);
            const err = friendlyError(e, t);
            showMessage(err, 4000, "error");
            announce(err, "assertive");
        } finally {
            submitting = false;
        }
    }

    async function skip() {
        if (!current || sessionPaused || actionBusy) {
            return;
        }
        recovery = null; // BI-9：同评分——有动作即隐式续场
        submitting = true;
        const isCram = cramActive;
        const undoSnap = pushHistory();
        let writeSucceeded = false;
        try {
            // 重现卡与 Cram 突击快刷不计内核跳过（同评分类：调度不变）
            if (!current.lvRequeue && !cramActive) {
                await skipReviewRiffCard(current.deckID, current.cardID);
                writeSucceeded = true;
                invalidateDueCache(); // AT-4：skip 移出今日到期，共享缓存失效（badge/总览下次读取拉新）
            } else {
                // Requeue and Cram cards are local-only and do not call the kernel.
                writeSucceeded = true;
            }
            sessionSkip += 1;
            sessionSkipped = [...sessionSkipped, current.cardID];
            // AQ-2：skip 也落盘——故障注入重载后跳过的卡不重复出现
            persistSession();
            announce(t.review.liveSkipped, "polite");
            await next();
            submitting = false;
            lvNotify.undo({
                source: "闪卡",
                message: isCram ? "仅本场跳过（突击快刷不改动 FSRS 排期）" : "仅本场跳过：今日顺延，不影响 FSRS 排期",
                undoLabel: "撤销",
                duration: 4000,
                onUndo: () => triggerUndoForSnapshot(undoSnap),
            });
        } catch (e: any) {
            // Skip follows the same pre-write snapshot rule as rating: a
            // failed request must not leave an undo entry for an unchanged
            // queue.
            if (!writeSucceeded) popReviewHistory(history);
            const err = friendlyError(e, t);
            showMessage(err, 4000, "error");
            announce(err, "assertive");
        } finally {
            submitting = false;
        }
    }

    async function suspendToday() {
        if (!current || isCardActionBusy(submitting, rescheduleBusy, dismissBusy)) { return; }
        const cardID = current.cardID;
        submitting = true;
        const undoSnap = pushHistory({ revlogAppended: false, suspendedCardID: cardID });
        let persisted = false;
        try {
            await Promise.resolve(ctx.suspendToday(cardID));
            persisted = true;
            const suspendedMsg = "今天不学：仅今日暂缓，明日自动恢复（保留 FSRS 进度）";
            announce(suspendedMsg, "polite");
            await next();
            submitting = false;
            lvNotify.undo({
                source: "闪卡",
                message: suspendedMsg,
                undoLabel: "撤销",
                duration: 5000,
                onUndo: () => triggerUndoForSnapshot(undoSnap),
            });
        } catch (e: any) {
            if (!persisted) popReviewHistory(history);
            const err = friendlyError(e, t);
            showMessage(err, 3000, "error");
            announce(err, "assertive");
        } finally {
            submitting = false;
        }
    }

    /** BJ-2：推进分级提示（不自动提交评分；纯展示+日志；v0.133.0 内容推导） */
    /** BJ-2：推进分级提示（BK-1 KO 优先 + 文本推导兜底；不自动提交评分） */
    /** BJ-2：提示级别指示文本（如"关键词提示 (1/2)"） */
    let cachedAvailLevels: HintLevel[] = [];
    function hintLevelText(): string {
        return resolveHintLevelIndicator(hintLevel, Boolean(current), cardHtml, cachedAvailLevels);
    }

    function advanceHint() {
        if (!current || showAnswer) return;
        const ko = ctx.getKOBySource?.(current.blockID);
        const res = advanceCardHint(cardHtml, hintLevel, current.cardID, ko?.fact, {
            expectedText,
            contextTitle: currentBreadcrumbs?.formattedText || currentHPath,
        });
        if (res) {
            hintLog = [...hintLog, res.hintLogEntry];
            hintLevel = res.level;
            hintText = res.text;
            if (res.shouldRevealAnswer) revealAnswer();
        }
    }

    async function next() {
        if (rescheduleBusy) return;
        // BJ-2：翻卡/切卡时重置提示
        hintLevel = null;
        hintText = "";
        // BJ-4：同步重置错误标注显示
        showErrTags = false;
        errTagged = false;
        // 记录上一张供回看（AJ2：只存数据，不自动打开浮层）
        const snapshot = createLastAnsweredSnapshot(current, cardHtml, showAnswer);
        if (snapshot) {
            lastAnswered = snapshot;
        }
        const rest = sliceQueueAfterCurrent(queue, current?.cardID);
        if (rest.length > 0) {
            queue = rest;
            await setCurrent(rest[0]);
        } else {
            // 本批复习完，继续拉取下一批（内核按每日上限分批返回）
            await loadQueue();
        }
    }

    /** 浮层关闭后焦点归还卡面（429）：键盘流不因开过关浮层而丢焦 */
    function returnFocus() {
        focusReviewRootOrCard(rootEl, cardEl);
    }

    function togglePeek() {
        const res = togglePeekCard(peek, lastAnswered);
        peek = res.nextPeek;
        if (res.status === "closed") {
            returnFocus();
        } else if (res.status === "none") {
            showMessage(t.review.peekNone, 1800, "info");
        }
    }

    function openInEditor() {
        const id = resolveEditorNavigationBlockId(undefined, current?.blockID);
        if (!id) {
            showMessage(t.review?.sourceNotFound ?? "原笔记块不存在或已被删除", 2500, "info");
            return;
        }
        if (zenMode) {
            zenMode = false;
        }
        suspendStopwatch();
        try {
            if (ctx.isMobile && canOpenMobileFile()) {
                disarmReviewHistory(true);
                openMobileFile(ctx.app, id);
                ctx.closeMobileReviewDialog?.();
            } else {
                openTab({ app: ctx.app, doc: { id, zoomIn: true } });
            }
        } catch (e: unknown) {
            resumeStopwatch();
            showMessage(friendlyError(e, t), 2500, "error");
        }
    }

    async function openCurrentDocContextMenu(e: MouseEvent) {
        const id = resolveEditorNavigationBlockId(undefined, current?.blockID);
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        try {
            const rows = await sqlQuery(`SELECT box, root_id FROM blocks WHERE id = '${id.replace(/'/g, "''")}' LIMIT 1`);
            const box = typeof rows?.[0]?.box === "string" ? (rows[0].box as string) : "";
            const root = typeof rows?.[0]?.root_id === "string" ? (rows[0].root_id as string) : id;
            if (box) {
                await showDocTreeNativeMenu({
                    notebookId: box,
                    docId: root || id,
                    position: { x: e.clientX, y: e.clientY },
                });
            }
        } catch {}
    }

    /** 快速改期（M3·FR5，f 键/按钮）：N 天后到期 */
    async function reschedule() {
        const card = current;
        if (!card || submitting || rescheduleBusy) return;
        const request = buildRescheduleRequest(card.cardID, rescheduleDays, retryReschedule);
        if (!request) return;
        retryReschedule = request;
        rescheduleBusy = true;
        rescheduleError = "";
        try {
            await batchSetRiffCardsDueTime([{ id: request.cardID, due: request.due }]);
            retryReschedule = null;
            rescheduleError = "";
            invalidateDueCache(); // AT-4：改期改变到期时间，共享缓存失效
            showMessage(t.review.rescheduled.replace("${n}", String(request.days)), 2000, "info");
            if (current?.cardID === card.cardID) {
                showReschedule = false;
                rescheduleBusy = false;
                await next();
            }
        } catch (e: any) {
            rescheduleError = friendlyError(e, t);
            announce(rescheduleError, "assertive");
        } finally {
            rescheduleBusy = false;
        }
    }

    /** 刷新当前卡内容（编辑返回后手动/自动触发） */
    async function refreshCard() {
        if (!current) return;
        answerCache.delete(current.blockID);
        await loadBlockDOM(current.blockID);
    }

    /** 编辑返回自动刷新（M3·FR5）：监听 visible 状态与窗口 focus 恢复时刷新卡面并恢复秒表 */
    $effect(() => {
        if (typeof document === "undefined") return;
        const handler = () => {
            if (document.visibilityState === "visible") {
                resumeStopwatch();
                if (current) refreshCard();
            }
        };
        const onWindowFocus = () => {
            resumeStopwatch();
            resumePausedSession();
        };
        document.addEventListener("visibilitychange", handler);
        window.addEventListener("focus", onWindowFocus);
        return () => {
            document.removeEventListener("visibilitychange", handler);
            window.removeEventListener("focus", onWindowFocus);
        };
    });

    /** 应用内返回检测（M3）：思源内切回复习页不触发 visibilitychange，
     * 以「离开面板 ≥15s 后重新点入」为编辑返回信号，节流刷新当前卡 */
    let lastPanelPointer = 0;
    function onPanelPointerDown(e: PointerEvent) {
        if (!current || !isEventInsideContainer(rootEl, e.target)) {
            return;
        }
        resumeStopwatch();
        resumePausedSession();
        const now = Date.now();
        if (shouldRefreshOnPanelPointer(lastPanelPointer, now)) {
            refreshCard();
        }
        lastPanelPointer = now;
    }

    /** 源上下文预览（M3）：只读展示来源块前后各 2 块 */
    let ctxOpen = $state(false);
    let ctxBlocks = $state<{ id: string; html: string }[]>([]);
    let ctxLoading = $state(false);
    let contextRequestSeq = 0;
    async function toggleContext() {
        ctxOpen = !ctxOpen;
        const seq = ++contextRequestSeq;
        if (ctxOpen && current) {
            const cardID = current.cardID;
            ctxLoading = true;
            ctxBlocks = [];
            try {
                const blocks = await ctx.getContextBlocks(current.blockID);
                if (seq === contextRequestSeq && current?.cardID === cardID && ctxOpen) ctxBlocks = blocks;
            } catch { /* 静默降级为空列表 */ }
            if (seq === contextRequestSeq) ctxLoading = false;
        }
    }

    function dueText(rating: string): string {
        return formatNextDueByRating(current?.nextDues, rating);
    }

    /** 键盘双通道去重（AJ 复核）：容器与 window 都绑了 onKeydown，
     * 焦点在面板内时事件会冒泡到 window 造成双触发（如 [ 开回看又立即关闭）。
     * 约定：容器通道处理焦点在面板内的按键；window 通道只处理面板外的。 */
    function onWindowKeydown(e: KeyboardEvent) {
        if (!rootEl || !rootEl.isConnected || rootEl.offsetParent === null) {
            return;
        }
        // CF-10: 长按 H 或 Alt+Space / Alt+H 临时透视答案
        if (!showAnswer && current && faceReady && !isInputOrEditable(e.target)) {
            if (((e.key === "h" || e.key === "H") && (e.repeat || e.altKey)) || (e.code === "Space" && e.altKey)) {
                isPeekingAnswer = true;
                e.preventDefault();
                return;
            }
        }
        if (isEventInsideContainer(rootEl, e.target)) {
            return;
        }
        onKeydown(e);
    }

    function onWindowKeyup(e: KeyboardEvent) {
        if (isPeekingAnswer) {
            if (e.key === "h" || e.key === "H" || e.code === "Space") {
                isPeekingAnswer = false;
                e.preventDefault();
            }
        }
    }

    function onKeydown(e: KeyboardEvent) {
        if (sessionPaused) return;
        // CF-10: 容器内长按 H 或 Alt+Space / Alt+H 临时透视答案
        if (!showAnswer && current && faceReady && !isInputOrEditable(e.target)) {
            if (((e.key === "h" || e.key === "H") && (e.repeat || e.altKey)) || (e.code === "Space" && e.altKey)) {
                isPeekingAnswer = true;
                e.preventDefault();
                return;
            }
        }
        if (zoomedImage) {
            if (e.key === "Escape") {
                closeZoomedImage();
                e.preventDefault();
            }
            return;
        }
        const anyActionModal = isAnyReviewModalOpen({ showPauseModal, showSessionOptionsModal, showMemoEditor, showRetireModal, showReschedule });
        const modalAct = resolveModalKeydownAction(e, anyActionModal, Boolean(memoSaving || retireBusy || rescheduleBusy));
        if (modalAct) {
            if (e.key === "Escape") e.preventDefault();
            if (modalAct.shouldClose) {
                showPauseModal = false;
                showSessionOptionsModal = false;
                showMemoEditor = false;
                showRetireModal = false;
                showReschedule = false;
                returnFocus();
            }
            return;
        }
        if (showMoreToolbar) {
            if (e.key === "Escape") { showMoreToolbar = false; e.preventDefault(); returnFocus(); }
            return;
        }
        if (shouldIgnoreReviewKeydown(e)) return;

        // 交互式题型快捷键路由（A/B/C/D、1/2、T/F/Y/N 等）
        const quizAct = resolveQuizKeyboardAction(e, interactiveQuiz, selectedChoiceKeys, showAnswer);
        if (quizAct) {
            e.preventDefault();
            if (quizAct.type === "submit-choice") submitChoiceAnswer();
            else if (quizAct.type === "pick-option") handleOptionPick(quizAct.optionKey);
            else if (quizAct.type === "pick-judge") handleJudgePick(quizAct.choice);
            return;
        }

        const action = resolveReviewKeyAction(e, {
            peekOpen: Boolean(peek),
            helpOpen,
            showAnswer,
            faceReady,
            hasCurrent: Boolean(current),
            hasLastAnswered: Boolean(lastAnswered || history.length > 0),
            ratingStyle: eff().ratingStyle,
            ratingKeyScheme: eff().ratingKeyScheme,
            isTargetInsideRoot: isEventInsideContainer(rootEl, e.target),
        });

        if (!action) return;

        const rating = resolveRatingFromShortcutAction(action);
        if (rating !== null) {
            if (Date.now() - answerRevealedAt < 150) {
                return;
            }
            triggerKeyFeedback(String(rating));
            void rate(rating);
            return;
        }

        switch (action) {
            case "toggle-reversed":
                reversedRecall = !reversedRecall;
                break;
            case "toggle-zen":
                zenMode = !zenMode;
                showMessage(zenMode ? "已开启沉浸专注模式 (按 z 退出)" : "已退出专注模式", 1500, "info");
                break;
            case "toggle-star":
                toggleStarCurrent();
                break;
            case "close-peek":
                peek = null;
                returnFocus();
                break;
            case "toggle-help":
                helpOpen = !helpOpen;
                break;
            case "close-help":
                helpOpen = false;
                returnFocus();
                break;
            case "reveal":
                triggerKeyFeedback(" ");
                if (e.shiftKey || !revealNextClozeOrAll(false)) {
                    revealAnswer();
                }
                break;
            case "rate-default":
                if (Date.now() - answerRevealedAt < 150) {
                    return;
                }
                const defaultRate = (timeoutExpired && lastTimeoutMode === "forget") ? 1 : ((suggestedRating as any) ?? 3);
                triggerKeyFeedback(String(defaultRate));
                void rate(defaultRate);
                break;
            case "advance-hint":
                advanceHint();
                break;
            case "toggle-peek":
                togglePeek();
                break;
            case "skip":
                skip();
                break;
            case "toggle-reschedule":
                showReschedule = !showReschedule;
                break;
            case "suspend":
                suspendToday();
                break;
            case "toggle-memo":
                showMemoEditor = !showMemoEditor;
                break;
            case "undo":
                undoHistory();
                break;
            case "dismiss":
                void dismissCurrentCard();
                break;
            case "open-editor":
                openInEditor();
                break;
        }
    }

    /** 点击翻面热区：卡面空白处才翻面（输入控件/链接/按钮不触发，为打字题预留） */
    // 触屏滑卡手势（M3·FR10）：右=良好 左=遗忘 上=翻面
    let touchStartX = 0;
    let touchStartY = 0;
    // 快速连滑节流（移动端防漏评）：手势冷却 180ms，动画播完才响应下一次滑动
    let lastSwipeHandledAt = 0;
    const SWIPE_COOLDOWN_MS = 180;

    function onTouchStart(e: TouchEvent) {
        const coords = extractSingleTouchCoords(e);
        if (coords) {
            touchStartX = coords.x;
            touchStartY = coords.y;
        }
    }

    // BI-9：恢复分支动作——resume 保场续用；summary 复用完成屏只读展示；narrow 直达范围选择；end 清现场重开
    function recoveryAct(branch: string) {
        recovery = null;
        recoverySnap = null;
        const res = resolveRecoveryAction(branch);
        if (res.type === "resume") {
            return; // 计数已恢复，队列照常
        }
        if (res.type === "summary") {
            sessionDone = true; // 只看摘要：完成屏展示已恢复计数，不评分不写卡
            return;
        }
        if (res.type === "narrow") {
            toolbarRef?.focusScope?.();
            showMessage(t.review.recoveryNarrowTip, 2500, "info");
            return;
        }
        // end：清空现场重新开始
        ctx.clearSessionState();
        // The previous session is no longer the session shown on screen. Do
        // not offer an undo that would restore cards from that discarded run.
        history = [];
        clearPendingRequeues();
        const resetProgress = createResetSessionProgress();
        reviewedIDs = resetProgress.reviewedIDs;
        sessionSkipped = resetProgress.skippedIDs;
        sessionNew = resetProgress.counters.new;
        sessionReview = resetProgress.counters.review;
        sessionForget = resetProgress.counters.forget;
        sessionSkip = resetProgress.counters.skip;
        loadQueue();
    }

    function onTouchEnd(e: TouchEvent) {
        if (!current) return;
        const touchEnd = extractChangedTouchCoords(e);
        if (!touchEnd) return;
        const anyModal = Boolean(showPauseModal || showSessionOptionsModal || showMoreToolbar || isOverlayTarget(e.target));
        // Mobile Spec v1：手机端横滑＝切卡不评级（左滑换下一张，右滑撤销并触感确认）；
        // 竖直手势（上滑翻面/答案侧上下评分）保持既有语义，桌面端触屏不变
        if (lvLaunchpad.isMobileFrontend() && !anyModal && !shouldIgnoreSwipeTarget(e.target)) {
            const dx = touchEnd.x - touchStartX;
            const dy = touchEnd.y - touchStartY;
            if (resolveMobileCardSwitch(dx, dy)) {
                // 连滑节流：冷却期内忽略本次手势，避免动画未完时连滑漏评/重复撤销
                const now = Date.now();
                if (now - lastSwipeHandledAt < SWIPE_COOLDOWN_MS) return;
                lastSwipeHandledAt = now;
                if (dx > 0) {
                    // 右滑＝撤销上一动作（恢复切走/误评的卡），撤销成功有触感确认
                    undoHistory();
                } else if (!submitting && !actionBusy) {
                    void skip(); // 左滑＝换下一张（不评级，可撤销）
                }
                return;
            }
        }
        const action = resolveTouchSwipe(showAnswer, { x: touchStartX, y: touchStartY }, touchEnd, e.target, anyModal);
        const outcome = mapSwipeActionToOutcome(action);
        if (outcome?.type === "rate") {
            // 翻面后评分：若翻面动作已完成（>=150ms），即便接近 180ms 节流边界也立即响应，防止快手手势漏评
            const now = Date.now();
            if (submitting || actionBusy) return;
            if (now - lastSwipeHandledAt < SWIPE_COOLDOWN_MS && (now - answerRevealedAt < 150)) return;
            lastSwipeHandledAt = now;
            void rate(outcome.rating);
        } else if (outcome?.type === "reveal" && faceReady) {
            const now = Date.now();
            if (now - lastSwipeHandledAt < SWIPE_COOLDOWN_MS) return;
            lastSwipeHandledAt = now;
            revealAnswer();
        }
    }

    function revealAnswer() {
        if (!faceReady || showAnswer) return;
        showAnswer = true;
        answerRevealedAt = Date.now();
        triggerHaptic(10);
    }

    function toggleStarCurrent() {
        if (!current) return;
        const wasStarred = isCardStarred(current);
        const res = toggleCardStar(starredCardIDs, current.cardID);
        const next = new Set(res.nextStarredIDs);
        const nextSessionStarred = new Set(sessionStarredCardIDs);
        if (wasStarred) {
            next.delete(current.cardID);
            if (current.blockID) next.delete(current.blockID);
            nextSessionStarred.delete(current.cardID);
        } else {
            next.add(current.cardID);
            if (current.blockID) next.add(current.blockID);
            nextSessionStarred.add(current.cardID);
        }
        starredCardIDs = next;
        sessionStarredCardIDs = nextSessionStarred;
        void ctx.toggleStarCard?.(current.blockID || current.cardID);
        const fb = formatStarToggleFeedback(!wasStarred);
        const starBtn = document.querySelector(".lv-review-header-star, .lv-zen-star") as HTMLElement | null;
        if (starBtn) {
            notifyInline(starBtn, fb.message);
        } else {
            showMessage(fb.message, fb.toastDuration, "info");
        }
        if (fb.hapticPattern) triggerHaptic(fb.hapticPattern);
    }

    function resetCramSessionState() {
        cramActive = true;
        isCramMode = true;
        purpose = "practice";
        clearPendingRequeues();
        recovery = null;
        recoverySnap = null;
        history = [];
        reviewedIDs = [];
        sessionSkipped = [];
        sessionNew = 0;
        sessionReview = 0;
        sessionForget = 0;
        sessionSkip = 0;
        sessionQuizTotal = 0;
        sessionQuizCorrect = 0;
        sessionDone = false;
        sessionStartedAt = Date.now();
    }

    function openCramModal() {
        showCramModal = true;
    }

    function startCramSession(options: { scope: CramScope; randomOrder: boolean }) {
        cramScope = options.scope;
        cramRandomOrder = options.randomOrder;
        resetCramSessionState();
        showCramModal = false;
        void loadQueue();
    }

    function exitCramSession() {
        cramActive = false;
        isCramMode = false;
        purpose = "review";
        showCramModal = false;
        sessionDone = false;
        void loadQueue();
    }

    let creatingSamples = $state(false);

    async function seedSampleCardsAndReload(switchToSampleDeck = false): Promise<boolean> {
        if (creatingSamples) return false;
        creatingSamples = true;
        try {
            const nbs = notebooks.length > 0 ? notebooks : await getNotebooks();
            notebooks = nbs;
            const targetNb = nbs.find(n => /小驴生态统一测试空间|小驴闪卡|小驴管家/.test(n.name || "")) ?? nbs[0];
            if (!targetNb) {
                showMessage(t.onboardingNoNotebook ?? "请先在思源中打开一个笔记本", 2800, "error");
                return false;
            }
            await createOnboardingSampleCards(targetNb.id, t);
            invalidateDueCache();
            const refreshedDecks = await getRiffDecks();
            decks = refreshedDecks;
            const sampleDeck = refreshedDecks.find(d => d.name === (t.onboardingDeckName ?? "示例卡组") && (Number(d.size) || 0) > 0);
            if (switchToSampleDeck && sampleDeck) {
                scopeKey = `deck:${sampleDeck.id}`;
                ctx.onScopePersist(scopeKey);
            } else if (scopeKey.startsWith("deck:")) {
                const cur = refreshedDecks.find(d => d.id === scopeKey.slice(5));
                if (!cur || (Number(cur.size) || 0) === 0) {
                    scopeKey = sampleDeck ? `deck:${sampleDeck.id}` : "all";
                    ctx.onScopePersist(scopeKey);
                }
            }
            await loadQueue();
            showMessage("已为您生成 13 张全类型内置示例闪卡 ✓", 2600, "info");
            return true;
        } catch (e: any) {
            showMessage(friendlyError(e, t), 3200, "error");
            return false;
        } finally {
            creatingSamples = false;
        }
    }

    async function startCramAll() {
        resetCramSessionState();
        await loadQueue();
        if (emptyQueue && scopeKey !== "all" && decks.some(d => (Number(d.size) || 0) > 0)) {
            scopeKey = "all";
            ctx.onScopePersist("all");
            await loadQueue();
        }
        if (emptyQueue) {
            const seeded = await seedSampleCardsAndReload(true);
            if (seeded && emptyQueue) {
                resetCramSessionState();
                await loadQueue();
            }
        }
        if (emptyQueue) {
            cramActive = false;
            isCramMode = false;
            showMessage("当前暂无可刷闪卡，可前往「卡组集市」导入精选卡组", 2800, "info");
        }
    }

    function startCramForgotten() {
        const forgottenCards = [...sessionCardMap.values()].filter(c => forgottenCardIDs.has(c.cardID));
        resetCramSessionState();
        if (forgottenCards.length > 0) {
            queue = forgottenCards.map(c => ({ ...c, lvRequeue: undefined }));
            void setCurrent(queue[0]);
        } else {
            void loadQueue();
        }
    }

    function startCramStarred() {
        const starredCards = [...sessionCardMap.values()].filter(c => isCardStarred(c) || sessionStarredCardIDs.has(c.cardID));
        resetCramSessionState();
        if (starredCards.length > 0) {
            queue = starredCards.map(c => ({ ...c, lvRequeue: undefined }));
            void setCurrent(queue[0]);
        } else {
            void loadQueue();
        }
    }

    function handleOptionPick(key: string) {
        if (!faceReady || showAnswer || !interactiveQuiz) return;
        const res = toggleChoiceSelection(selectedChoiceKeys, key, interactiveQuiz.isMultiple);
        selectedChoiceKeys = res.nextKeys;
        triggerHaptic(res.hapticStrength);
        if (res.shouldAutoSubmit) {
            clearAutoSubmitTimer();
            autoSubmitTimer = setTimeout(() => {
                autoSubmitTimer = null;
                if (!showAnswer) {
                    submitChoiceAnswer();
                }
            }, 100);
        }
    }

    function submitChoiceAnswer() {
        if (!interactiveQuiz || selectedChoiceKeys.length === 0) return;
        const res = evaluateChoiceQuiz(interactiveQuiz.options, selectedChoiceKeys, interactiveQuiz.isMultiple);
        if (res) {
            const nextScore = updateQuizScoreCounters({ total: sessionQuizTotal, correct: sessionQuizCorrect }, res.isCorrect);
            sessionQuizTotal = nextScore.total;
            sessionQuizCorrect = nextScore.correct;
            suggestedRating = res.suggestedRating;
            playSfx(res.sfxRating as any);
            triggerHaptic(res.hapticPattern);
            // 评级原位交互反馈，不弹 Toast
        }
        revealAnswer();
    }

    function handleJudgePick(val: boolean) {
        if (!faceReady || showAnswer || !interactiveQuiz) return;
        userJudgeChoice = val;
        triggerHaptic(10);
        clearAutoSubmitTimer();
        autoSubmitTimer = setTimeout(() => {
            autoSubmitTimer = null;
            if (!showAnswer) {
                const res = evaluateJudgeQuiz(val, interactiveQuiz.judgeAnswer);
                if (res) {
                    const nextScore = updateQuizScoreCounters({ total: sessionQuizTotal, correct: sessionQuizCorrect }, res.isCorrect);
                    sessionQuizTotal = nextScore.total;
                    sessionQuizCorrect = nextScore.correct;
                    suggestedRating = res.suggestedRating;
                    playSfx(res.sfxRating as any);
                    triggerHaptic(res.hapticPattern);
                    // 评级原位交互反馈，不弹 Toast
                }
                revealAnswer();
            }
        }, 100);
    }

    function handleFillCheck() {
        if (!faceReady || showAnswer || !interactiveQuiz) return;
        const text = typingInput.trim();
        if (!text) {
            // 输入为空敲 Enter 直接翻面查看答案（放弃思考/不输入直接揭晓）
            revealAnswer();
            return;
        }
        const target = interactiveQuiz.fillExpected || expectedText;
        if (target) {
            const res = evaluateFillQuiz(target, text, eff().typingStrict);
            if (res) {
                const nextScore = updateQuizScoreCounters({ total: sessionQuizTotal, correct: sessionQuizCorrect }, res.isCorrect);
                sessionQuizTotal = nextScore.total;
                sessionQuizCorrect = nextScore.correct;
                typingGrade = res.typingGrade ?? null;
                suggestedRating = res.suggestedRating;
                playSfx(res.sfxRating as any);
                triggerHaptic(res.hapticPattern);
                // 评级原位交互反馈，不弹 Toast
            }
        }
        revealAnswer();
    }

    function onContainerClick(e: MouseEvent) {
        if (shouldRevealOnContainerClick({
            hasModalsOpen: Boolean(showPauseModal || showSessionOptionsModal || showMoreToolbar),
            target: e.target,
            showAnswer,
            hasCurrent: Boolean(current),
            faceReady,
        })) {
            revealAnswer();
        }
    }

    onMount(() => {
        // T01 可用时间（docs/40）：开场即按偏好挂预算（原型 hero「可用时间 [15 分钟▾]」→ 会话结束条件）
        const prefBudget = ctx.preferredBudgetMin?.() ?? 0;
        if (prefBudget > 0) {
            setBudget(prefBudget);
        }
        // 会话中断恢复（M3）：仅正式复习（非 Cram 突击快刷）恢复当日进度与已复习 ID
        if (!cramActive) {
            const ss = ctx.getSessionState();
            const restored = restoreSessionProgress(ss, todayKey());
            if (restored) {
                reviewedIDs = restored.reviewedIDs;
                sessionSkipped = restored.skippedIDs;
                sessionNew = restored.counters.new;
                sessionReview = restored.counters.review;
                sessionForget = restored.counters.forget;
                sessionSkip = restored.counters.skip;
                // BI-9：有现场→给出恢复分支（跨天/零进度/队列空的禁用语义由纯模块判定）
                recoverySnap = createRecoverySnapshotFromCounters(
                    restored.recoverySnap.date,
                    restored.recoverySnap.today,
                    restored.counters
                );
                // BI-8：上次收工原因（若已收集）随横幅展示，辅助返场分流
                endPicked = ss?.endReason ?? null;
                recovery = recoveryOptions(recoverySnap);
            }
        }
        loadQueue();
        loadReturnCheck(); // BI-10：长期返场检查（只读，触发=长间隔或大积压）
        // 范围选择器数据源（失败静默：仅影响下拉项，不影响默认全部复习；若记忆卡组已空且存在其它有卡卡组则自愈切回全局，全库无卡或示例卡组为空时自动补齐内置示例卡）
        getRiffDecks().then(d => {
            decks = d;
            const totalSize = d.reduce((acc, x) => acc + (Number(x.size) || 0), 0);
            const curDeck = scopeKey.startsWith("deck:") ? d.find(x => x.id === scopeKey.slice(5)) : null;
            if (totalSize === 0 || (curDeck && curDeck.name === (t.onboardingDeckName ?? "示例卡组") && (Number(curDeck.size) || 0) === 0)) {
                void seedSampleCardsAndReload(Boolean(curDeck));
                return;
            }
            if (scopeKey.startsWith("deck:")) {
                if ((!curDeck || (Number(curDeck.size) || 0) === 0) && d.some(x => (Number(x.size) || 0) > 0)) {
                    scopeKey = "all";
                    ctx.onScopePersist("all");
                    void loadQueue();
                }
            }
        }).catch(() => { /* 旁路 */ });
        getNotebooks().then(n => (notebooks = n)).catch(() => { /* 旁路 */ });
        if (typeof window !== "undefined" && window.visualViewport) {
            window.visualViewport.addEventListener("resize", onViewportChange);
            window.visualViewport.addEventListener("scroll", onViewportChange, { passive: true });
        }
        // AT-10：设置保存后超时参数立即生效；评分风格/顺序等下一卡自然生效
        const offSettings = ctx.onSettingsChanged?.(() => {
            settingsRev++; // C-3：出题形态等 derived 以此为响应式信号，保存后立即生效
            if (ctx.getStarredCardIDs) {
                starredCardIDs = new Set(ctx.getStarredCardIDs());
            }
            const s = eff();
            if (current && !showAnswer && (s.timeoutMode !== lastTimeoutMode || s.timeoutSeconds !== lastTimeoutSeconds)) {
                restartTimeout();
            }
            lastTimeoutMode = s.timeoutMode;
            lastTimeoutSeconds = s.timeoutSeconds;
        });

        function onSwitchScopeEvent(e: Event) {
            const ce = e as CustomEvent<{ scope?: string; cram?: boolean }>;
            if (ce.detail) {
                let changed = false;
                if (typeof ce.detail.scope === "string") {
                    const nextScope = normalizeScopeKey(ce.detail.scope);
                    if (nextScope !== scopeKey) {
                        scopeKey = nextScope;
                        changed = true;
                    }
                }
                if (typeof ce.detail.cram === "boolean" && ce.detail.cram !== cramActive) {
                    cramActive = ce.detail.cram;
                    changed = true;
                    if (cramActive) {
                        resetCramSessionState();
                    } else {
                        purpose = "review";
                        clearPendingRequeues();
                        history = [];
                        const ss = ctx.getSessionState();
                        const restored = restoreSessionProgress(ss, todayKey());
                        if (restored) {
                            reviewedIDs = restored.reviewedIDs;
                            sessionSkipped = restored.skippedIDs;
                            sessionNew = restored.counters.new;
                            sessionReview = restored.counters.review;
                            sessionForget = restored.counters.forget;
                            sessionSkip = restored.counters.skip;
                        } else {
                            reviewedIDs = [];
                            sessionSkipped = [];
                            sessionNew = 0;
                            sessionReview = 0;
                            sessionForget = 0;
                            sessionSkip = 0;
                        }
                    }
                }
                if (changed) {
                    changeScope();
                }
            }
        }
        rootEl?.addEventListener("lv-switch-scope", onSwitchScopeEvent);

        return () => {
            offSettings?.();
            rootEl?.removeEventListener("lv-switch-scope", onSwitchScopeEvent);
            if (typeof window !== "undefined" && window.visualViewport) {
                window.visualViewport.removeEventListener("resize", onViewportChange);
                window.visualViewport.removeEventListener("scroll", onViewportChange);
            }
        };
    });

    // 遮罩 overlay 定位：监听图片加载、卡面布局和视口变化，避免晚加载或窄屏时坐标过期。
    $effect(() => {
        const activeOcclusion = occl;
        const target = cardEl;
        const html = cardHtml;
        positionOcclusion();
        if (!activeOcclusion || !target || !html) return;
        const image = findOcclusionTarget(target);
        if (!image) return;
        const throttledRemeasure = rafThrottle(() => {
            if (isDisposed) return;
            positionOcclusion();
        });
        const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => throttledRemeasure()) : null;
        observer?.observe(target);
        observer?.observe(image);
        image.addEventListener("load", throttledRemeasure);
        window.addEventListener("resize", throttledRemeasure);
        window.visualViewport?.addEventListener("resize", throttledRemeasure);
        window.visualViewport?.addEventListener("scroll", throttledRemeasure, { passive: true });
        return () => {
            throttledRemeasure.cancel();
            observer?.disconnect();
            image.removeEventListener("load", throttledRemeasure);
            window.removeEventListener("resize", throttledRemeasure);
            window.visualViewport?.removeEventListener("resize", throttledRemeasure);
            window.visualViewport?.removeEventListener("scroll", throttledRemeasure);
        };
    });

    onDestroy(() => {
        isDisposed = true;
        if (prevLeftDock || prevRightDock || prevBottomDock) {
            void applyZenMode(false);
        }
        disarmReviewHistory(true);
        throttledViewportChange.cancel();
        clearAutoSubmitTimer();
        if (targetCelebrationTimer) {
            clearTimeout(targetCelebrationTimer);
            targetCelebrationTimer = null;
        }
        stopTimeout(); // AJ7：销毁时清理倒计时，防止泄漏
        stopRequeueTimers();
        if (typeof window !== "undefined" && window.visualViewport) {
            window.visualViewport.removeEventListener("resize", onViewportChange);
            window.visualViewport.removeEventListener("scroll", onViewportChange);
        }
        if (activeUtterance && "speechSynthesis" in window) {
            speechSynthesis.cancel();
            activeUtterance = null;
        }
        closeReviewAudio(audioCtx);
        audioCtx = null;
    });
</script>

<svelte:window on:keydown={onWindowKeydown} on:keyup={onWindowKeyup} />
<svelte:document on:pointerdown={onPanelPointerDown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
    class="lv-review"
    class:lv-review--zen={zenMode}
    class:lv-keyboard-open={isKeyboardOpen}
    style={isKeyboardOpen ? `--lv-keyboard-inset:${keyboardInset}px;` : undefined}
    bind:this={rootEl}
    role="presentation"
    onclick={onContainerClick}
    onkeydown={(e) => onKeydown(e)}
    onfocusin={resumePausedSession}
    ontouchstart={onTouchStart}
    ontouchend={onTouchEnd}
    tabindex="-1"
>
    <!-- R57 复习顶栏：独立复习页签缺少 Hub 外壳时的固定返回路径（完成屏也可见；手机端整合 44x44px 关闭钮） -->
        <div class="lv-review-topbar">
            <button type="button" class="b3-button b3-button--small b3-button--outline lv-btn-tool" onclick={() => { disarmReviewHistory(); ctx.openDashboard(); }} title={t.review?.returnHome ?? "返回闪卡主页"}>
                <LvIcon name="chevron-left" size={13} />
                <span>{t.review?.backToHub ?? "返回闪卡中心"}</span>
            </button>
            <span class="lv-review-topbar-crumb">{t.review?.panelTitle ?? "复习"}</span>
            {#if ctx.onClose}
                <button
                    type="button"
                    class="lv-review-close-btn"
                    onclick={() => { disarmReviewHistory(); ctx.onClose?.(); }}
                    aria-label={t.common?.close ?? "关闭"}
                    title={t.common?.close ?? "关闭"}
                >
                    <LvIcon name="close" size={18} />
                </button>
            {/if}
        </div>
    {#if zenMode}
        <ReviewZenIsland
            {t}
            isStarred={isCardStarred(current)}
            disabled={!current || actionBusy}
            onAdjustFontScale={adjustFontScale}
            onToggleStar={toggleStarCurrent}
            onOpenMemo={() => { showMemoEditor = true; }}
            onExitZen={() => { zenMode = false; }}
        />
    {/if}
    <!-- AS-4：读屏播报区域（视觉隐藏） -->
    <LvLive message={liveMsg} tone={liveTone} />
    <ReviewSessionBanners
        {sessionPaused}
        {returnBanner}
        {recovery}
        {endPicked}
        {returnItems}
        {returnDismissed}
        {sessionDone}
        hasCurrent={!!current}
        {emptyQueue}
        {reliefChoices}
        {reliefOpen}
        qualityExcludedCount={qualityExcludedCardIDs.length}
        {t}
        onResumeSession={resumePausedSession}
        onDismissReturnBanner={() => (returnBanner = null)}
        onRecoveryAct={recoveryAct}
        onDismissReturnCheck={() => (returnDismissed = true)}
        onReliefPick={onReliefPick}
        onRecheckQuality={recheckQualityExcluded}
        onOpenMaintenance={() => ctx.openDashboard("maintenance")}
    />
    {#if showTargetCelebration}
        <div class="lv-target-celebration" data-testid="target-celebration-banner" role="status">
            <div class="lv-celebration-particles" aria-hidden="true">
                {#each [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as i}
                    <span class={`lv-particle lv-p-${i}`} style={`--i:${i}`}></span>
                {/each}
            </div>
            <div class="lv-celebration-content">
                <span class="lv-celebration-icon">🎉</span>
                <span class="lv-celebration-text">{t?.review?.targetCelebration ?? "今日复习目标达成！干得漂亮！"}</span>
            </div>
        </div>
    {/if}
    {#if loading}
        <div class="lv-center">{t.dashboard.loading}</div>
    {:else if errorMsg}
        <div class="lv-center lv-error-wrap">
            <LvError message={errorMsg} onretry={loadQueue} retryLabel={t.dashboard.refresh} />
        </div>
    {:else if requeueWaiting}
        <ReviewRequeueWaiting
            {headScopeLabel}
            {requeueWaitSeconds}
            historyLength={history.length}
            {actionBusy}
            {t}
            onRefresh={loadQueue}
            onUndo={undoHistory}
        />
    {:else if emptyQueue}
        <ReviewReadyDashboard
            {headScopeLabel}
            {qualityExcludedCardIDs}
            bind:scopeKey
            {decks}
            {notebooks}
            {t}
            onScopeChange={() => { ctx.onScopePersist(scopeKey); changeScope(); }}
            onRecheckQualityExcluded={recheckQualityExcluded}
            onOpenMaintenance={() => ctx.openDashboard("maintenance")}
            onStartCram={startCramAll}
            onScopeNew={() => { scopeKey = "new"; ctx.onScopePersist("new"); changeScope(); }}
            onOpenAuthoring={() => ctx.openDashboard("authoring")}
            onOpenInbox={() => ctx.openDashboard("inbox")}
            onOpenManager={() => ctx.openDashboard("manage")}
            onOpenMarketplace={() => ctx.openDashboard("marketplace")}
            onCreateSampleCards={() => void seedSampleCardsAndReload(true)}
            {creatingSamples}
            onRefreshQueue={loadQueue}
            onReturnHome={() => ctx.openDashboard()}
        />
    {:else if sessionDone || !current}
        <ReviewDonePanel
            {t}
            {sessionNew}
            {sessionReview}
            {sessionForget}
            {sessionSkip}
            {sessionQuizTotal}
            {sessionQuizCorrect}
            {purpose}
            {budgetMin}
            {budgetExpired}
            {remainingDue}
            streakMilestone={streakMilestoneText()}
            dailyTip={dailyTip()}
            {endPicked}
            starredCardCount={sessionStarredCardIDs.size || starredCardIDs.size}
            sessionDuration={sessionDurationText()}
            sessionMinutes={Math.max(1, Math.round((Date.now() - sessionStartedAt) / 60000))}
            targetProgress={targetProgressText()}
            isCramMode={cramActive || isCramMode}
            onPickEnd={pickEnd}
            onReturnHome={isCramMode ? exitCramSession : () => ctx.openDashboard()}
            onOpenManager={() => ctx.openDashboard("manage")}
            onReviewAgain={isCramMode ? () => { resetCramSessionState(); void loadQueue(); } : loadQueue}
            onCramForgotten={startCramForgotten}
            onCramStarred={startCramStarred}
        />
    {:else}
        <div class="lv-head">
            <ReviewProgressHeader
                {headScopeLabel}
                {entryCtx}
                cramActive={cramActive || isCramMode}
                {budgetMin}
                {budgetExpired}
                budgetClockText={budgetClockText()}
                {current}
                {showAnswer}
                timeoutMode={eff().timeoutMode}
                {timeoutLeft}
                timeoutText={timeoutText()}
                hideMetaUntilAnswer={eff().hideMetaUntilAnswer}
                {occl}
                {cardHtml}
                {cardMemo}
                {isCustomPluginAnswer}
                leechThreshold={eff().leechThreshold ?? DEFAULT_LEECH_THRESHOLD}
                isMarkedIssue={markedIssueCardIDs.has(current?.cardID ?? '')}
                currentProgress={reviewedIDs.length + 1}
                reviewedCount={reviewedIDs.length}
                totalCount={reviewedIDs.length + queue.length}
                {sessionForget}
                {t}
                onOpenDashboard={() => ctx.openDashboard()}
                onReturnToEntry={(point) => ctx.returnToEntry?.(point)}
                onDismissEntry={(kind, sourceID) => { ctx.dismissEntry?.(kind, sourceID); entryCtx = null; }}
            />
            <ReviewToolbar
                bind:this={toolbarRef}
                bind:scopeKey
                bind:purpose
                {decks}
                {notebooks}
                {current}
                {hasSvgCanvas}
                isStarred={isCardStarred(current)}
                isMarkedIssue={markedIssueCardIDs.has(current?.cardID ?? '')}
                isCramMode={cramActive || isCramMode}
                {actionBusy}
                {dismissBusy}
                {lastAnswered}
                bind:reversedRecall
                bind:zenMode
                {ctxOpen}
                {prefsOpen}
                {hasOverrides}
                {t}
                onOpenCramModal={openCramModal}
                onScopeChange={() => { ctx.onScopePersist(scopeKey); changeScope(); }}
                onAdjustFontScale={adjustFontScale}
                onOpenSessionOptions={openSessionOptions}
                onOpenCanvasInEditor={openCanvasInEditor}
                onToggleStar={toggleStarCurrent}
                onToggleMarkIssue={toggleMarkIssue}
                onPause={() => (showPauseModal = true)}
                onUndo={undoHistory}
                onSkip={skip}
                onToggleContext={toggleContext}
                onTogglePrefs={() => (prefsOpen = !prefsOpen)}
                onTogglePeek={togglePeek}
                onOpenInEditor={openInEditor}
                onRefreshCard={refreshCard}
                onSuspendToday={suspendToday}
                onOpenMemoEditor={() => (showMemoEditor = true)}
                onDismissCard={() => void dismissCurrentCard()}
                onOpenRetireModal={() => (showRetireModal = true)}
                onOpenHelp={() => (helpOpen = true)}
                onFocusScope={focusScopeInPrefs}
                onOpenContextMenu={openCurrentDocContextMenu}
            />
        </div>
        <ReviewSessionPrefs
            bind:this={prefsRef}
            open={prefsOpen}
            bind:scopeKey
            bind:purpose
            {decks}
            {notebooks}
            answerVariant={getInitialSessionVariant(eff())}
            ratingStyle={eff().ratingStyle}
            reverseOrder={eff().reverseOrder}
            mixedRotation={eff().mixedRotation === true}
            timeoutMode={eff().timeoutMode}
            {budgetMin}
            {budgetEstimate}
            {hasOverrides}
            {t}
            onScopeChange={() => { ctx.onScopePersist(scopeKey); changeScope(); }}
            onSetAnswerVariant={(v) => { tempAnswerVariant = v; applySessionOptions(); }}
            onSetOverride={setOverride}
            onSetBudget={setBudget}
            onResetOverrides={() => (sessionOverride = {})}
            onClose={() => (prefsOpen = false)}
        />
        <div class="lv-card b3-typography" class:lv-anim-glow={showAnswer} bind:this={cardEl} style={`max-width:${eff().cardMaxWidth}px; width:100%; margin:0 auto;`}>
            {#if current && isLeechCard(current, eff().leechThreshold ?? DEFAULT_LEECH_THRESHOLD)}
                <div class="lv-leech-warning-banner" role="alert" aria-live="assertive" data-testid="review-leech-warning">
                    <span class="lv-leech-icon"><LvIcon name="warning" size={15} /></span>
                    <span class="lv-leech-text">
                        <strong>{t?.review?.leechTitle ?? "水蛭卡预警"}</strong>：{t?.review?.leechWarning?.replace("${n}", String(current.lapses)) ?? `已遗忘 ${current.lapses} 次，建议精简问题或添加助记提示`}
                    </span>
                </div>
            {/if}
            <ReviewCardBreadcrumbs
                breadcrumbs={currentBreadcrumbs}
                hpath={currentHPath}
                bind:hideParentPath={hideBreadcrumbParentPath}
                {t}
                onToggleContext={toggleContext}
                onOpenInEditor={openInEditor}
                onContextMenu={openCurrentDocContextMenu}
            />
            {#if stopwatchSuspendedAt > 0}
                <div class="lv-stopwatch-suspended-badge" data-testid="review-stopwatch-suspended" role="status">
                    <LvIcon name="timer" size={12} />
                    <span>{t?.review?.stopwatchSuspended ?? "答题计时已挂起 (返回闪卡自动恢复)"}</span>
                </div>
            {/if}
            <ReviewCardBody
                {cardHtml}
                {faceError}
                currentCardID={current?.cardID ?? ""}
                showAnswer={showAnswer || isPeekingAnswer}
                maskedCardHtml={isPeekingAnswer ? cardHtml : maskedCardHtml}
                {interactiveQuiz}
                {selectedChoiceKeys}
                {userJudgeChoice}
                {typingInput}
                customRiffTitle={currentRiffTitle}
                cardFontScale={eff().cardFontScale}
                customCardCss={eff().customCardCss}
                {faceHints}
                {faceHintText}
                {t}
                onRetryFace={retryFace}
                {onCardContentClick}
                {onCardContentDblClick}
                onOptionPick={handleOptionPick}
                onSubmitChoice={submitChoiceAnswer}
                onJudgePick={handleJudgePick}
                onFillCheck={handleFillCheck}
                onTypingInput={(val) => { typingInput = val; }}
            />
            {#if isPeekingAnswer && !showAnswer}
                <div class="lv-peeking-banner" data-testid="review-peeking-badge" role="status">
                    <LvIcon name="eye" size={13} />
                    <span>{t?.review?.peekingAnswer ?? "临时透视答案中 (松开恢复)"}</span>
                </div>
            {/if}
            <ReviewMemoCallout
                {showAnswer}
                {cardMemo}
                {isCustomPluginAnswer}
                {cardHtml}
                {occl}
                {faceError}
                {t}
                onEditMemo={() => (showMemoEditor = true)}
            />
            <ReviewOcclusionOverlay
                {occl}
                {occlBox}
                bind:occlHidden
                showAnswer={showAnswer || isPeekingAnswer}
            />
            {#if !showAnswer}
                <ReviewRescheduleModal
                    open={showReschedule}
                    bind:rescheduleDays
                    {previewTargetLabel}
                    {rescheduleBusy}
                    {rescheduleError}
                    {retryReschedule}
                    {actionBusy}
                    {t}
                    onReschedule={reschedule}
                    onClose={() => { showReschedule = false; rescheduleError = ""; }}
                />
            {/if}
            <ReviewAnswerSection
                {showAnswer}
                {answerVariant}
                bind:typingInput
                {choiceFallbackMode}
                {choices}
                {choiceLoading}
                {hintText}
                hintLevelLabel={hintLevelText()}
                {faceReady}
                {typingGrade}
                ttsEnabled={eff().ttsEnabled}
                {t}
                onSubmitTyping={submitTyping}
                onPickChoice={(i) => {
                    pickChoice(i);
                }}
                onStartChoice={startChoice}
                onAdvanceHint={advanceHint}
                onPeekStart={() => { if (!showAnswer && current) isPeekingAnswer = true; }}
                onPeekEnd={() => { isPeekingAnswer = false; }}
                onRevealAnswer={revealAnswer}
                onSpeakAnswer={speakAnswer}
            />
        </div>
        <ReviewContextDrawer
            open={ctxOpen}
            blocks={ctxBlocks}
            loading={ctxLoading}
            currentBlockID={current?.blockID ?? ""}
            {t}
            onClose={() => (ctxOpen = false)}
        />
        <ReviewCountdownBanner
            {budgetMin}
            {budgetExpired}
            {showAnswer}
            {timeoutExpired}
            reviewedCount={reviewedIDs.length}
            {t}
            onRest={pauseSessionAndReturn}
            onContinue={() => (budgetMin = 0)}
        />
        <ReviewRatingBar
            {showAnswer}
            {stepRevealedCount}
            {faceReady}
            {pressedKeyFeedback}
            ratingStyle={eff().ratingStyle}
            ratingKeyScheme={eff().ratingKeyScheme}
            {suggestedRating}
            actionBusy={actionBusy}
            compact={eff().ratingDensity === "compact"}
            {dueText}
            {t}
            onRevealAnswer={revealAnswer}
            onRevealNextCloze={() => { if (!revealNextClozeOrAll(false)) revealAnswer(); }}
            onRate={rate}
        />

        <ReviewErrorTagBar
            open={showErrTags && !errTagged && Boolean(ctx.tagErrorReason)}
            {t}
            onTagError={(rid) => {
                ctx.tagErrorReason?.(errTagCardID, rid, errTagBlockID);
                errTagged = true;
                announce(`${t.review.errTagDone}: ${t.review.ko.errReasons[rid] ?? rid}`, "polite");
            }}
            onClose={() => (showErrTags = false)}
        />
    {/if}

    <ReviewHelpAndPeek
        {helpOpen}
        {peek}
        {t}
        onCloseHelp={() => { helpOpen = false; returnFocus(); }}
        onClosePeek={togglePeek}
    />

    <ReviewActionModals
        {t}
        {showPauseModal}
        {showSessionOptionsModal}
        {showMemoEditor}
        {showRetireModal}
        {zoomedImage}
        reviewedCount={reviewedIDs.length}
        skippedCount={sessionSkipped.length}
        {tempAnswerVariant}
        {memoDraft}
        {memoSaving}
        {retireBusy}
        {dismissBusy}
        onClosePause={() => (showPauseModal = false)}
        onConfirmPause={pauseSessionAndReturn}
        onCloseSessionOptions={() => (showSessionOptionsModal = false)}
        onApplySessionOptions={(v) => { tempAnswerVariant = v; applySessionOptions(); }}
        onCloseMemoEditor={closeMemoEditor}
        onSaveMemo={(m) => { memoDraft = m; void saveCardMemo(); }}
        onCloseRetireModal={closeRetireModal}
        onConfirmRetire={retireCurrentCard}
        onSuspendToday={suspendToday}
        onDismissCard={() => void dismissCurrentCard()}
        onCloseZoomedImage={closeZoomedImage}
    />

    <ReviewCramModal
        open={showCramModal}
        {t}
        initialScope={cramScope}
        initialRandomOrder={cramRandomOrder}
        isCramActive={cramActive || isCramMode}
        onClose={() => (showCramModal = false)}
        onStart={startCramSession}
        onExitCram={exitCramSession}
    />
</div>

<style lang="scss">
    .lv-review {
        container-type: inline-size;
        height: 100%;
        min-height: 0;
        min-width: 0;
        overflow-y: auto;
        overflow-x: hidden;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        /* 移动端安全区（306）：刘海屏/手势条不遮挡内容 */
        padding: calc(var(--lv-sp-4) + env(safe-area-inset-top, 0)) calc(var(--lv-sp-5) + env(safe-area-inset-right, 0))
            calc(var(--lv-sp-4) + env(safe-area-inset-bottom, 0)) calc(var(--lv-sp-5) + env(safe-area-inset-left, 0));
        gap: var(--lv-sp-3);
        position: relative;
        max-width: 880px;
        margin: 0 auto;
        width: 100%;

        @media (max-width: 680px) {
            padding: calc(6px + env(safe-area-inset-top, 0px)) calc(10px + env(safe-area-inset-right, 0px))
                calc(10px + env(safe-area-inset-bottom, 0px)) calc(10px + env(safe-area-inset-left, 0px));
            gap: 8px;

            :global(.lv-hub) & {
                padding-top: 6px !important;
                padding-bottom: 10px !important;
            }

            :global(.lv-center.lv-ready-wrap),
            :global(.lv-center.lv-done) {
                margin: 0 !important;
            }
        }

        &.lv-keyboard-open,
        :global(.lv-vv-keyboard-open) & {
            padding-top: calc(var(--lv-sp-1) + env(safe-area-inset-top, 0));
            padding-bottom: calc(var(--lv-sp-1) + env(safe-area-inset-bottom, 0));
            gap: var(--lv-sp-1);

            .lv-review-topbar {
                min-height: 34px;
            }
            .lv-card {
                flex: 1 1 auto;
                min-height: 104px;
                padding: var(--lv-sp-3) var(--lv-sp-3);
            }
        }

        @media (max-height: 460px) {
            padding-top: calc(var(--lv-sp-1) + env(safe-area-inset-top, 0));
            padding-bottom: calc(var(--lv-sp-1) + env(safe-area-inset-bottom, 0));
            gap: var(--lv-sp-1);

            .lv-review-topbar {
                min-height: 32px;
            }
            .lv-head {
                gap: var(--lv-sp-1);
            }
            .lv-card {
                flex: 1 1 auto;
                min-height: 96px;
                padding: var(--lv-sp-2) var(--lv-sp-3);
            }
        }

        .lv-center { margin: auto; color: var(--lv-color-text-muted); }
        .lv-error-wrap { width: min(560px, 92vw); }

        /* R57 复习顶栏：独立页签的固定返回路径，评分中与完成屏均可见 */
        .lv-review-topbar {
            display: flex;
            align-items: center;
            gap: var(--lv-sp-2);
            flex: none;
            min-height: 40px;
            max-width: 760px;
            width: 100%;
            margin: 0 auto;
        }
        .lv-review-topbar-crumb {
            color: var(--lv-color-text-muted);
            font-size: var(--lv-type-control-size);
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .lv-review-close-btn {
            margin-left: auto;
            flex: none;
            display: grid;
            place-items: center;
            width: 44px;
            height: 44px;
            min-width: 44px;
            min-height: 44px;
            padding: 0;
            border: 0;
            border-radius: var(--lv-r-circle);
            background: transparent;
            color: var(--lv-color-text-muted);
            cursor: pointer;
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;
            transition: background var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease);

            &:hover {
                background: color-mix(in srgb, var(--lv-color-text) 6%, transparent);
                color: var(--lv-color-text);
            }
            &:active {
                transform: scale(0.94);
            }
            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }
        }

        .lv-head {
            /* R52 review 面：三行结构（身份行 / 进度条 / 控制行），行距 8px、条底 1px 分隔 */
            display: flex; flex-direction: column; gap: var(--lv-sp-2);
            max-width: 760px; margin: 0 auto; width: 100%;
        }

        .lv-card {
            flex: 0 1 auto;
            box-sizing: border-box;
            position: relative;
            overflow: auto;
            background: var(--lv-color-surface);
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-dialog);
            box-shadow: var(--lv-shadow-review-card), var(--lv-inset-shine);
            /* 阶段 B · I3：卡面高度随内容自适应，紧凑内边距让评分栏在窄窗与 150% 缩放下始终留在首屏 */
            padding: clamp(calc(var(--lv-space-unit) * 6), 2.5vw, calc(var(--lv-space-unit) * 11)) clamp(calc(var(--lv-space-unit) * 7), 3vw, calc(var(--lv-space-unit) * 13));
            min-height: 148px;
            @media (max-width: 740px) { padding: calc(var(--lv-space-unit) * 6) calc(var(--lv-space-unit) * 6); }
            position: relative;
            background: var(--lv-color-surface);
            box-shadow: var(--lv-shadow-1), var(--lv-inset-shine);
            transition: box-shadow var(--lv-dur-2) var(--lv-ease), transform var(--lv-dur-2) var(--lv-ease), border-color var(--lv-dur-2) var(--lv-ease);

            &:hover { box-shadow: var(--lv-shadow-2), var(--lv-inset-shine); }

            // 超长卡面底部柔和滚动指示羽化（防突兀截断）
            &::after {
                content: "";
                position: sticky;
                bottom: 0;
                left: 0;
                right: 0;
                height: 14px;
                background: linear-gradient(to bottom, transparent, var(--lv-color-surface));
                pointer-events: none;
                margin-top: -14px;
                display: block;
                border-bottom-left-radius: var(--lv-r-dialog);
                border-bottom-right-radius: var(--lv-r-dialog);
                opacity: 0.6;
            }

            &.lv-anim-glow {
                border-color: var(--lv-primary-border);
            }
        }

        .lv-leech-warning-banner {
            display: flex;
            align-items: center;
            gap: var(--lv-sp-2);
            padding: calc(var(--lv-space-unit) * 2) calc(var(--lv-space-unit) * 4);
            margin-bottom: var(--lv-sp-3);
            border-radius: var(--lv-r-m);
            background: color-mix(in srgb, var(--lv-color-danger) 10%, var(--lv-color-surface));
            border: 1px solid color-mix(in srgb, var(--lv-color-danger) 30%, transparent);
            color: var(--lv-color-danger);
            font-size: var(--lv-type-meta-size);
            line-height: var(--lv-lh-meta);
            box-shadow: var(--lv-shadow-1);
            user-select: none;
            -webkit-user-select: none;

            .lv-leech-icon {
                display: inline-flex;
                align-items: center;
                flex-shrink: 0;
            }
            .lv-leech-text {
                font-variant-numeric: tabular-nums;
                strong {
                    font-weight: var(--lv-fw-heading);
                }
            }
        }

        :global(.lv-step-revealed) {
            background: color-mix(in srgb, var(--lv-color-brand) 14%, transparent) !important;
            color: var(--lv-color-text) !important;
            border-bottom: 2px solid var(--lv-color-brand) !important;
            border-radius: var(--lv-r-track);
            padding: 0 calc(var(--lv-space-unit) * 2);
            box-shadow: 0 2px 8px color-mix(in srgb, var(--lv-color-brand) 20%, transparent);
            animation: lv-pulse-glow 0.3s var(--lv-ease);
        }

        /* CF-10 透视状态标识 */
        .lv-peeking-banner {
            display: inline-flex;
            align-items: center;
            gap: var(--lv-sp-2);
            padding: 4px 12px;
            margin: var(--lv-sp-2) auto 0;
            border-radius: var(--b3-border-radius);
            background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
            border: 1px dashed var(--b3-theme-primary);
            color: var(--b3-theme-primary);
            font-size: var(--lv-type-small-size);
            animation: lv-fade-in 0.2s ease-out;
        }

        /* CF-03 答题计时挂起提示 */
        .lv-stopwatch-suspended-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 2px 10px;
            margin: 0 auto;
            border-radius: var(--b3-border-radius);
            background: var(--b3-theme-surface-lighter);
            color: var(--b3-theme-on-surface-light);
            font-size: var(--lv-type-smaller-size);
            border: 1px solid var(--b3-border-color);
        }

        /* CF-11 目标达成即时彩带与粒子微动效 */
        .lv-target-celebration {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: var(--lv-sp-2) var(--lv-sp-4);
            margin: var(--lv-sp-2) auto;
            border-radius: var(--b3-border-radius);
            background: linear-gradient(135deg, color-mix(in srgb, var(--b3-theme-primary) 15%, transparent), color-mix(in srgb, var(--lv-color-warning) 15%, transparent));
            border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 40%, transparent);
            box-shadow: 0 4px 14px color-mix(in srgb, var(--b3-theme-primary) 20%, transparent);
            overflow: hidden;
            z-index: 10;
        }

        .lv-celebration-content {
            display: flex;
            align-items: center;
            gap: var(--lv-sp-2);
            font-weight: 600;
            font-size: var(--lv-type-control-size);
            color: var(--b3-theme-on-background);
            z-index: 2;
        }

        .lv-celebration-particles {
            position: absolute;
            inset: 0;
            pointer-events: none;
            overflow: hidden;

            .lv-particle {
                position: absolute;
                width: 6px;
                height: 6px;
                border-radius: 50%;
                opacity: 0.85;
                animation: lv-confetti-float 2.8s ease-out infinite;

                &:nth-child(3n) { background: var(--lv-color-data); }
                &:nth-child(3n + 1) { background: var(--lv-color-success); }
                &:nth-child(3n + 2) { background: var(--lv-color-warning); }

                &:nth-child(1) { left: 10%; animation-delay: 0.1s; }
                &:nth-child(2) { left: 20%; animation-delay: 0.4s; }
                &:nth-child(3) { left: 30%; animation-delay: 0.2s; }
                &:nth-child(4) { left: 40%; animation-delay: 0.6s; }
                &:nth-child(5) { left: 50%; animation-delay: 0.3s; }
                &:nth-child(6) { left: 60%; animation-delay: 0.5s; }
                &:nth-child(7) { left: 70%; animation-delay: 0.15s; }
                &:nth-child(8) { left: 80%; animation-delay: 0.45s; }
                &:nth-child(9) { left: 90%; animation-delay: 0.25s; }
                &:nth-child(10) { left: 15%; animation-delay: 0.7s; }
                &:nth-child(11) { left: 55%; animation-delay: 0.35s; }
                &:nth-child(12) { left: 85%; animation-delay: 0.55s; }
            }
        }

        @keyframes lv-confetti-float {
            0% { transform: translateY(20px) scale(0.6); opacity: 0; }
            30% { opacity: 0.9; }
            100% { transform: translateY(-40px) scale(1.1); opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
            .lv-particle {
                display: none !important;
            }
            .lv-target-celebration {
                animation: none !important;
            }
        }
    }
</style>
