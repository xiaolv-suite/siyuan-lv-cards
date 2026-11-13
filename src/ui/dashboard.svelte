<script lang="ts">
    import { onMount } from "svelte";
    import type { App } from "siyuan";
    import { fade } from "svelte/transition";
    import { getRiffDecks, getRiffCards, renameRiffDeck, removeRiffDeck, type RiffDeck } from "@/api/riff";
    import { dueCache } from "@/api/due-shared";
    import { isSessionLive, type EndReason } from "@/core/session-state";
    import { decideTodayAction } from "@/core/today-decision";
    import { exportLvCardsDeckPackage, LvCardsExportError } from "@/core/lvcards-export";
    import { sqlQuery } from "@/api/siyuan";
    import { downloadFile } from "@/core/data-transfer";
    import { type MigrationStatus } from "@/api/flashcardV2";
    import { calcStreak, lastNDays, localDate, studySecondsOn, coverageStats, computeRetention, computeRetentionCurve, reviewStatsFor, type RevlogData, type RetentionResult, type CurvePoint, type CoverageStats } from "@/core/revlog";
    import { buildForecast, buildMonthGrid, dueMapFromForecast, get7DayForecast, smoothForecastLoad, type ForecastResult, type CalendarCell, type ForecastCardInput, type ForecastDay } from "@/core/forecast";
    import { renderDashboardReportMarkdown, computeWeekOverview, computeCurveSvgPaths } from "@/core/report-writer";
    import { openTab } from "siyuan";
    import { showMessage, lvEcosystem } from "@/libs/notice";
    import { friendlyError } from "@/api/errors";
    import { getMotionDuration } from "./kit/motion";
    import { findDormantKnowledgeBlocks, type DormantKnowledgeCandidate } from "@/core/dormant-knowledge";
    import { loadPinnedDeckIds, sortDecksWithPins, clusterDecksBySlash, getDeckEcosystemBadge } from "@/core/deck-management";
    import { getBridgeSafely, openExamModuleSafely } from "@/libs/ecosystem-bridge-kit";
    import LvPage from "./kit/LvPage.svelte";
    import LvSection from "./kit/LvSection.svelte";
    import LvStat from "./kit/LvStat.svelte";
    import LvHeatmap from "./kit/LvHeatmap.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import LvError from "./kit/LvError.svelte";
    import LvCalendar from "./kit/LvCalendar.svelte";
    import LvIcon from "./kit/LvIcon.svelte";

    export interface DashboardCtx {
        i18n: Record<string, any>;
        app: App;
        openDoc?: (id: string, zoomIn?: boolean) => void;
        getRevlog: () => RevlogData;
        getV2Status: () => MigrationStatus | null;
        getDailyTargets: () => { new: number; review: number };
        openReview: (options?: { scope?: string; cram?: boolean }) => void;
        /** 启动指定卡包/范围复习 */
        openReviewScope?: (scopeKey: string, cram?: boolean) => void;
        /** 空库时的直接制卡入口；与上手引导并列，避免新用户只能先看说明。 */
        openQuickCard?: () => void;
        openManagerDeck?: (deckID: string, deckName: string) => void;
        openManager: () => void;
        openOnboarding: () => void;
        getAIBatches: () => { id: string; date: string; deckID: string; blockIDs: string[]; tokens?: number }[];
        getLeechCards: () => { blockID: string; lapses: number }[];
        rewriteWithAI: (blockID: string) => void;
        writeReportDoc: (md: string) => Promise<void>;
        getExamCountdown: () => { name: string; days: number } | null;
        /** XP 激励开关（M8·FR3） */
        getXpEnabled: () => boolean;
        /** 订阅会话完成事件（549）：复习结束后跨页签刷新总览，返回取消函数 */
        onSessionFinished?: (cb: () => void) => () => void;
        /** 订阅评分事件（AT-11）：原生/插件两路评分统一经此失效统计缓存，返回取消函数 */
        onReviewed?: (cb: () => void) => () => void;
        /** 订阅跨前端存储重载事件：同步/其他窗口写入后刷新当前总览 */
        onStoresChanged?: (cb: () => void) => () => void;
        /** 文档维度覆盖（AQ-12）：块归属查内核后聚合；null=查询失败隐藏 */
        getDocCoverage?: () => Promise<{ docs: { docID: string; title: string; seen: number }[]; unattributed: number } | null>;
        /** 未完成的 AI 导入（ADR-7）：null=无 */
        getUnfinishedAIJob?: () => { id: string; done: number; total: number } | null;
        /** 打开 AI 向导（未完成导入的续传入口在其中） */
        openAIWizard?: () => void;
        /** 热力图范围周数（439） */
        getHeatmapWeeks: () => number;
        /** BJ-1：能力分布统计（基于已登记知识对象实例；口径=插件侧标注覆盖） */
        getCapabilityShare?: () => { cap: string; count: number; pct: number }[];
        /** BJ-4：错误原因分布统计（遗忘卡标注；口径=当日或全量） */
        getErrorReasonStats?: () => { reason: string; count: number }[];
        /** T01 今日行动 hero（docs/39 批 2）：当日会话状态（续场判断；可缺省） */
        getSessionState?: () => { date: string; reviewedIDs?: string[]; skippedIDs?: string[]; counters: { new: number; review: number; forget: number; skip: number }; endReason?: EndReason | null; completed?: boolean };
        /** T01 可用时间（docs/40）：hero 选择落偏好，复习开场默认预算 */
        getSessionBudget?: () => number;
        setSessionBudget?: (min: number) => void;
        /** T01 深度统计展开态持久化 */
        getDeepStatsOpen?: () => boolean;
        setDeepStatsOpen?: (open: boolean) => void;
        /** T08 待处理聚合（docs/40 批 5 简化版） */
        getInboxOpenCount?: () => number;
        getSuspendedCount?: () => number;
        getMaintenanceDebtCount?: () => number;
        restoreSuspendedToday?: () => Promise<number>;
        /** 直达 hub 其他页签（收件箱等） */
        openHubTab?: (id: string) => void;
        /** 沉睡知识批量收纳进材料收件箱 */
        enrollDormantBlocks?: (blockIDs: string[]) => Promise<number>;
        /** 把可信的今日到期数同步给 Hub 导航；读取开始/失败时传 null，避免显示过期数字。 */
        onDueCount?: (count: number | null) => void;
    }

    let { ctx }: { ctx: DashboardCtx } = $props();
    const t = $derived(ctx.i18n);

    let loading = $state(true);
    let decks: RiffDeck[] = $state([]);
    let pinnedDeckIds = $state<string[]>(loadPinnedDeckIds());
    let showAllEmptyDecks = $state(false);
    let showAllClusters = $state(false);
    const activeDecks = $derived(decks.filter(d => (d.size ?? 0) > 0));
    const emptyDecks = $derived(decks.filter(d => (d.size ?? 0) === 0));
    const displayedDecks = $derived.by(() => {
        const base = (activeDecks.length > 0 && !showAllEmptyDecks) ? activeDecks : decks;
        return sortDecksWithPins(base, pinnedDeckIds);
    });
    // CF-02: 今日卡组列表按斜杠分级树状聚类与折叠
    let collapsedClusters = $state<Set<string>>(new Set());
    function toggleCluster(prefix: string) {
        const next = new Set(collapsedClusters);
        if (next.has(prefix)) {
            next.delete(prefix);
        } else {
            next.add(prefix);
        }
        collapsedClusters = next;
    }
    const clusteredDecks = $derived(clusterDecksBySlash(displayedDecks));
    const visibleClusters = $derived(showAllClusters ? clusteredDecks : clusteredDecks.slice(0, 8));
    let dueCount = $state(0);
    let newCount = $state(0);
    // T01（docs/39 批 2）：今日行动 hero——当日未收场会话可「继续本场」；深度统计默认展开
    let sessReps = $state(0);
    let sessLive = $state(false);
    let deepOpen = $state(false);
    // T01 可用时间（docs/40）：hero 选择，落偏好并在复习开场生效
    let sessionBudget = $state(15);
    const BUDGET_CHOICES = [0, 5, 15, 30, 60] as const;
    let ecosystemBadgeText = $state(lvEcosystem.getStatusBadgeText());
    // 本地日期跨午夜后驱动页眉与本周视图重算；避免长时间驻留时“今日”停在前一天。
    let dayTick = $state(Date.now());
    let dayBoundaryTimer: ReturnType<typeof setTimeout> | null = null;
    // T08 待处理聚合（docs/40 批 5 简化版）：疑问/暂停/续传
    let inboxOpen = $state(0);
    let suspended = $state(0);
    let suspendedRestoreBusy = $state(false);
    let suspendedRestoreError = $state("");
    let dormantCount = $state(0);
    let dormantCandidates = $state<DormantKnowledgeCandidate[]>([]);
    let dormantAwakening = $state(false);
    let dormantSeq = 0;

    async function scanDormantKnowledge() {
        const seq = ++dormantSeq;
        try {
            const rows = await sqlQuery("SELECT id, markdown, ial FROM blocks WHERE markdown LIKE '%==%==' AND ial NOT LIKE '%custom-riff-decks%' LIMIT 20");
            if (seq !== dormantSeq) return;
            if (Array.isArray(rows)) {
                const mapped = rows.map((r: any) => ({
                    id: String(r.id ?? ""),
                    markdown: String(r.markdown ?? ""),
                    ial: String(r.ial ?? ""),
                }));
                const candidates = findDormantKnowledgeBlocks(mapped, 10);
                if (seq !== dormantSeq) return;
                dormantCandidates = candidates;
                dormantCount = candidates.length;
            }
        } catch {
            if (seq === dormantSeq) {
                dormantCandidates = [];
                dormantCount = 0;
            }
        }
    }

    async function awakenDormantKnowledge() {
        if (dormantAwakening || dormantCandidates.length === 0) return;
        dormantAwakening = true;
        try {
            if (ctx.enrollDormantBlocks) {
                const count = await ctx.enrollDormantBlocks(dormantCandidates.map(c => c.blockID));
                showMessage((t.dashboard?.dormantEnrolled ?? "已将 ${n} 处沉睡知识收纳至材料收件箱").replace("${n}", String(count)), 2500, "info");
                dormantCount = 0;
                dormantCandidates = [];
                ctx.openHubTab?.("inbox");
            } else if (ctx.openHubTab) {
                ctx.openHubTab("inbox");
            } else if (ctx.openQuickCard) {
                ctx.openQuickCard();
            }
        } catch (e: any) {
            showMessage(friendlyError(e, t), 3000, "error");
        } finally {
            dormantAwakening = false;
        }
    }
    // 页眉日期（R53 .page-head eyebrow 口径）：本地日期 YYYY.MM.DD
    function heroDateText(): string {
        void dayTick;
        const d = new Date();
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
    }
    let oldCount = $state(0);
    let streak = $state(0);
    let todayReview = $state(0);
    /** 今日作答用时分钟（AQ-13）：无 dur 记录时为 0 不展示 */
    let todayStudyMinutes = $state(0);
    /** 卡片覆盖（AQ-12 本地证据口径）：分母缺失时为 null 不展示 */
    let coverage = $state<CoverageStats | null>(null);
    /** 未完成的 AI 导入（ADR-7）：null=无 */
    let unfinishedAI = $state<{ id: string; done: number; total: number } | null>(null);
    /** BJ-4：错误原因分布（遗忘卡标注；null=宿主未提供或无数据） */
    let errStats = $state<{ reason: string; count: number }[] | null>(null);
    let totalCards = $state(0);
    let heat: { date: string; stat: { new: number; review: number; forget: number } }[] = $state([]);
    let revlogNote = $state("");
    let errorMsg = $state("");
    let hasLoadedSnapshot = $state(false);
    let lastSuccessfulAt = $state(0);
    let retention: RetentionResult | null = $state(null);
    let curve: CurvePoint[] = $state([]);
    let curveEl: SVGSVGElement | null = $state(null);

    /** 图表导出 PNG（M5）：SVG→canvas，CSS 变量先解析为具体色值（独立渲染无级联上下文） */
    function exportCurvePng() {
        if (!curveEl) return;
        const clone = curveEl.cloneNode(true) as SVGSVGElement;
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        const srcEls = Array.from(curveEl.querySelectorAll("*"));
        Array.from(clone.querySelectorAll("*")).forEach((el, i) => {
            const src = srcEls[i] as HTMLElement | SVGElement | undefined;
            if (!src) return;
            const cs = getComputedStyle(src);
            for (const prop of ["stroke", "fill", "stroke-width", "stroke-dasharray", "opacity"] as const) {
                const val = cs.getPropertyValue(prop);
                if (val && (el.getAttribute(prop) !== null || prop === "stroke" || prop === "fill")) {
                    el.setAttribute(prop, val.trim());
                }
            }
        });
        // 底色填充，避免透明背景导出后不可见
        const bg = getComputedStyle(document.body).getPropertyValue("--b3-theme-surface").trim() || getComputedStyle(document.documentElement).getPropertyValue("--lv-color-surface").trim() || "rgb(255, 255, 255)";
        const xml = new XMLSerializer().serializeToString(clone);
        const rect = `<rect x="0" y="0" width="100%" height="100%" fill="${bg}"/>`;
        const svgWithBg = xml.replace(/(<svg[^>]*>)/, `$1${rect}`);
        const url = URL.createObjectURL(new Blob([svgWithBg], { type: "image/svg+xml;charset=utf-8" }));
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = 960;
            canvas.height = 300;
            const c = canvas.getContext("2d");
            if (!c) { URL.revokeObjectURL(url); return; }
            c.fillStyle = bg;
            c.fillRect(0, 0, canvas.width, canvas.height);
            c.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            canvas.toBlob(blob => {
                if (!blob) return;
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `lv-cards-curve-${localDate(Date.now())}.png`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            });
        };
        img.onerror = () => URL.revokeObjectURL(url);
        img.src = url;
    }
    let aiQuality = $state<{ date: string; cards: number; reviews: number; rate: number | null }[]>([]);
    let leech: { blockID: string; lapses: number }[] = $state([]);
    let examChip = $state<{ name: string; days: number } | null>(null);
    let targets = $state({ new: 0, review: 0 });

    function curvePoints(pts: CurvePoint[]): string {
        return computeCurveSvgPaths(pts).empirical;
    }

    /** 理论参考线：固定衰减 R=exp(-t/5d)（个人化 S 待 V2 Stability） */
    function theoryPoints(pts: CurvePoint[]): string {
        return computeCurveSvgPaths(pts).theoretical;
    }

    /** 构建 Markdown 报告内容（总览+复习集+曲线+AI 批次） */
    function buildReportMd(): string {
        return renderDashboardReportMarkdown({
            dueCount,
            newCount,
            oldCount,
            todayReview,
            targetReview: ctx.getDailyTargets().review,
            streak,
            totalCards,
            decks,
            curve,
            aiQuality,
        });
    }

    /** 学习报告下载 Markdown 文件 */
    function downloadReport() {
        const md = buildReportMd();
        const blob = new Blob([md], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lv-cards-report-${localDate(Date.now())}.md`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /** AR-5：报告写入文档——busy 防重复点击 + catch 展示原因（报告纯函数随时可重试） */
    let writeBusy = $state(false);
    let writeError = $state("");
    async function writeDocReport() {
        if (writeBusy) {
            return;
        }
        writeBusy = true;
        writeError = "";
        try {
            await ctx.writeReportDoc(buildReportMd());
        } catch (e: unknown) {
            writeError = friendlyError(e, t);
        } finally {
            writeBusy = false;
        }
    }

    /** 数字滚动统一由 LvStat 的 animate 承担（reduced-motion 直落） */
    function targetPct(): number {
        const target = targets.review;
        if (target <= 0) {
            return -1;
        }
        return Math.min(100, Math.round((todayReview / target) * 100));
    }

    const todayDecision = $derived.by(() => {
        // 宿主的本地存储 getter 本身不是响应式源，每次成功快照和跨日后重新判定。
        void lastSuccessfulAt;
        void dayTick;
        const revlog = ctx.getRevlog();
        const lastEntry = revlog?.entries?.[revlog.entries.length - 1];
        const daysGap = lastEntry?.ts ? Math.floor((Date.now() - lastEntry.ts) / 86400000) : null;
        const maintDebt = ctx.getMaintenanceDebtCount ? ctx.getMaintenanceDebtCount() : 0;
        return decideTodayAction({
            dueCount,
            unknownDue: Boolean(errorMsg),
            hasLiveSession: sessLive,
            sessionReviewedCount: sessReps,
            daysGap,
            inboxCount: inboxOpen,
            maintenanceDebtCount: maintDebt,
            suspendedCount: suspended,
        }, t);
    });

    function heroActionLabel(): string {
        if (totalCards === 0 && ctx.openQuickCard) return t.cmdQuickCard ?? "快速制卡";
        return todayDecision.primaryActionLabel;
    }

    const hasExamBridge = $derived(Boolean(getBridgeSafely("exam")));

    function startReviewDeck(deckID: string) {
        if (ctx.openReviewScope) {
            ctx.openReviewScope(`deck:${deckID}`);
        } else {
            ctx.openReview();
        }
    }

    function startCramDeck(deckID: string) {
        if (ctx.openReviewScope) {
            ctx.openReviewScope(`deck:${deckID}`, true);
        } else {
            ctx.openReview({ scope: `deck:${deckID}`, cram: true });
        }
    }

    function startGlobalCram() {
        if (ctx.openReviewScope) {
            ctx.openReviewScope("all", true);
        } else {
            ctx.openReview({ scope: "all", cram: true });
        }
    }

    function heroAction(): void {
        if (todayDecision.actionDisabled) return;
        if (totalCards === 0 && ctx.openQuickCard) {
            ctx.openQuickCard();
            return;
        }
        if (todayDecision.primaryAction === "continue-review" || todayDecision.primaryAction === "start-review") {
            ctx.openReview();
        } else if (todayDecision.primaryAction === "open-inbox") {
            if (ctx.openHubTab) ctx.openHubTab("inbox");
            else ctx.openManager();
        } else if (todayDecision.primaryAction === "open-maintenance") {
            if (ctx.openHubTab) ctx.openHubTab("maintenance");
            else ctx.openManager();
        } else if (todayDecision.primaryAction === "open-library") {
            ctx.openManager();
        }
    }

    async function restoreSuspendedToday() {
        if (suspendedRestoreBusy || !ctx.restoreSuspendedToday) return;
        suspendedRestoreBusy = true;
        suspendedRestoreError = "";
        try {
            suspended = await ctx.restoreSuspendedToday();
        } catch (e) {
            const detail = friendlyError(e, t);
            suspendedRestoreError = t.dashboard.todoSuspendedFailed.replace("${error}", detail);
        } finally {
            suspendedRestoreBusy = false;
        }
    }

    async function copyTodayTask() {
        const prefix = t.dashboard?.dailyTaskPrefix ?? "记忆复习";
        const isComplete = dueCount === 0;
        const taskText = isComplete
            ? `- [x] ${prefix}：今日已无待复习闪卡`
            : `- [ ] ${prefix}：今日待复习 ${dueCount} 张闪卡`;
        try {
            await navigator.clipboard.writeText(taskText);
            showMessage(t.dashboard?.dailyTaskCopied ?? "已复制今日复习待办，可直接粘贴到日记或任务视界", 2500, "info");
        } catch {
            showMessage(taskText, 4000, "info");
        }
    }

    /** 本周星期一至星期日的本地记录；未来日期和未知记录保持为空，不补造学习量。 */
    function weekOverview() {
        void dayTick;
        return computeWeekOverview({ heat, localDateKey: localDate });
    }
    const currentWeek = $derived(weekOverview());
    const weekDateLabel = $derived.by(() => {
        const format = (date: Date) => date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        return t.dashboard.weekSubtitle
            .replace("${start}", format(currentWeek.start))
            .replace("${end}", format(currentWeek.end));
    });

    // ---- T14 学习日历与负载预测（docs/41 P0 · docs/42 §4）：深度统计区内懒加载，预测只读不改调度 ----
    let calForecast = $state<ForecastResult | null>(null);
    let calCells = $state<CalendarCell[]>([]);
    let calLoading = $state(false);
    let calLoadedOnce = $state(false);
    let calAttempted = $state(false);
    let calError = $state("");
    let calSelectedDate = $state<string | null>(null);
    let calSeq = 0;

    // ---- 未来 7 日复习负载预报（FSRS4Anki 对标 · 支持负载平滑削峰填谷） ----
    const SMOOTH_LOAD_STORAGE_KEY = "lv-cards-smooth-forecast";
    function readPersistedSmoothLoad(): boolean {
        try {
            return typeof localStorage !== "undefined" && localStorage.getItem(SMOOTH_LOAD_STORAGE_KEY) === "1";
        } catch {
            return false;
        }
    }
    let forecastRawCards = $state<ForecastCardInput[]>([]);
    let smoothLoadEnabled = $state(readPersistedSmoothLoad());
    let forecast7Days = $state<ForecastDay[]>([]);
    let forecast7Max = $state(1);
    let forecast7Total = $state(0);
    let mobileForecastExpanded = $state(false);

    function update7DayForecast(baseNow = new Date()) {
        const f7 = get7DayForecast(forecastRawCards, { today: baseNow, dailyNewTarget: targets.new, smooth: smoothLoadEnabled });
        forecast7Days = f7.days;
        forecast7Max = f7.maxCount;
        forecast7Total = f7.totalDue;
        if (forecastRawCards.length > 0) {
            const rawCal = buildForecast(forecastRawCards, { today: baseNow, horizonDays: 14, dailyNewTarget: targets.new });
            const calDays = smoothLoadEnabled ? smoothForecastLoad(rawCal.days) : rawCal.days;
            calForecast = { ...rawCal, days: calDays };
            const dueByDate = dueMapFromForecast(calDays);
            const reviewsByDate = new Map(heat.map(h => [h.date, h.stat.review]));
            calCells = buildMonthGrid(baseNow.getFullYear(), baseNow.getMonth() + 1, baseNow, reviewsByDate, dueByDate);
        }
    }

    function toggleSmoothLoad() {
        smoothLoadEnabled = !smoothLoadEnabled;
        try {
            if (typeof localStorage !== "undefined") {
                localStorage.setItem(SMOOTH_LOAD_STORAGE_KEY, smoothLoadEnabled ? "1" : "0");
            }
        } catch {
            /* 忽略存储受限环境 */
        }
        update7DayForecast();
    }

    function selectCalendarDate(date: string) {
        calSelectedDate = date;
    }

    const calSelectedSummary = $derived.by(() => {
        if (!calSelectedDate) return "";
        const local = heat.find(item => item.date === calSelectedDate)?.stat;
        const forecast = calForecast?.days.find(item => item.date === calSelectedDate);
        return t.dashboard.calSelected
            .replace("${date}", calSelectedDate)
            .replace("${review}", String(local?.review ?? 0))
            .replace("${new}", String(local?.new ?? 0))
            .replace("${due}", String((forecast?.reviews ?? 0) + (forecast?.news ?? 0)));
    });

    // 首次展开深度统计时拉取一次；此后随 refresh() 的 heat 更新不再自动重拉（预测是旁路增强）
    $effect(() => {
        if (deepOpen && !calAttempted) void loadForecast();
    });

    /** T-分享包（docs/41 P1）：整卡组导出为原生 .lvcards 分享包，支持完整分页与底层原始 Markdown 回读 */
    let ddExportBusy = $state(false);
    async function exportDeckShare(deckID: string, deckName: string) {
        if (ddExportBusy) return;
        ddExportBusy = true;
        try {
            const { pkgJson, cards } = await exportLvCardsDeckPackage(
                { id: deckID, name: deckName },
                (id, page, pageSize) => getRiffCards(id, page, pageSize),
                sqlQuery,
            );
            downloadFile(`${deckName}-${new Date().toISOString().slice(0, 10)}.lvcards`, pkgJson, "application/json");
            showMessage(t.dashboard.ddShareDone
                .replace("${qa}", String(cards.filter(l => l.kind === "qa" || l.kind === "code" || l.kind === "list").length))
                .replace("${c}", String(cards.filter(l => l.kind === "cloze").length)), 2500, "info");
        } catch (e) {
            if (e instanceof LvCardsExportError && e.code === "empty-deck") {
                showMessage(t.dashboard.ddShareEmpty, 2000, "info");
            } else {
                showMessage(friendlyError(e, t), 3500, "error");
            }
        } finally {
            ddExportBusy = false;
        }
    }

    async function renameDeckPrompt(deckID: string, currentName: string) {
        const next = window.prompt(t.dashboard.renameDeckPrompt ?? "请输入卡组的新名称：", currentName);
        if (!next || !next.trim() || next.trim() === currentName) return;
        try {
            await renameRiffDeck(deckID, next.trim());
            showMessage(t.dashboard.renameDeckDone ?? "卡组已成功重命名", 2000, "info");
            void refresh();
        } catch (e: any) {
            showMessage(friendlyError(e, t), 3000, "error");
        }
    }

    async function removeDeckConfirm(deckID: string, currentName: string) {
        const confirmed = window.confirm((t.dashboard.removeDeckConfirm ?? "确定删除卡组「${name}」？卡包内的笔记块本身不会受影响。").replace("${name}", currentName));
        if (!confirmed) return;
        try {
            await removeRiffDeck(deckID);
            showMessage(t.dashboard.removeDeckDone ?? "卡组已删除", 2000, "info");
            void refresh();
        } catch (e: any) {
            showMessage(friendlyError(e, t), 3000, "error");
        }
    }

    async function loadForecast() {
        if (calLoading) return;
        const seq = ++calSeq;
        calAttempted = true;
        calLoading = true;
        calError = "";
        try {
            const now = new Date();
            const cards: { due: string; state: number }[] = [];
            // 分页拉全量（上限 20 页 × 100）：页脚标注覆盖面，超出部分不进预测
            let page = 1;
            let pageCount = 1;
            do {
                const r = await getRiffCards("", page, 100);
                if (!r || typeof r !== "object") break;
                pageCount = Number(r.pageCount ?? 1);
                for (const b of r.blocks ?? []) {
                    const blockRec = b as unknown as { riffCard?: { due?: unknown; state?: unknown }; RiffCard?: { due?: unknown; state?: unknown } };
                    const rc = blockRec.riffCard ?? blockRec.RiffCard;
                    if (rc) cards.push({ due: String(rc.due ?? ""), state: Number(rc.state ?? 0) });
                }
                page += 1;
            } while (page <= pageCount && page <= 50);
            if (seq !== calSeq) return;
            forecastRawCards = cards;
            calForecast = buildForecast(cards, { today: now, horizonDays: 14, dailyNewTarget: targets.new });
            update7DayForecast(now);
            if (!smoothLoadEnabled) {
                const dueByDate = dueMapFromForecast(calForecast.days);
                const reviewsByDate = new Map(heat.map(h => [h.date, h.stat.review]));
                calCells = buildMonthGrid(now.getFullYear(), now.getMonth() + 1, now, reviewsByDate, dueByDate);
            }
            calLoadedOnce = true;
        } catch (e) {
            if (seq === calSeq) calError = friendlyError(e, t);
        }
        finally {
            if (seq === calSeq) calLoading = false;
        }
    }

    /** AR-6：刷新 generation——手动刷新/session-finished/reviewed 并发时旧响应不覆盖新状态 */
    let refreshSeq = 0;
    let reviewedTimer: ReturnType<typeof setTimeout> | null = null;

    /** AT-11：评分高频（连刷几张）时合并为一次刷新，保留用户当前页不闪动 */
    function scheduleRefresh() {
        if (reviewedTimer) {
            clearTimeout(reviewedTimer);
        }
        reviewedTimer = setTimeout(() => {
            reviewedTimer = null;
            refresh();
        }, 800);
    }

    async function refresh() {
        const seq = ++refreshSeq;
        loading = true;
        errorMsg = "";
        ctx.onDueCount?.(null);
        try {
            const [deckList, due] = await Promise.all([
                getRiffDecks(),
                dueCache.get(""), // AT-4：与 badge/挑战/配对等并发读取共享缓存，评分后经 invalidate 拉新
            ]);
            if (seq !== refreshSeq) {
                return; // 旧响应：不改统计与到期数
            }
            totalCards = deckList.reduce((acc, d) => acc + (d.size ?? 0), 0);
            decks = deckList.filter(d => {
                if ((d.size ?? 0) > 0) return true;
                return totalCards === 0 && !/^(lv-exam-preflight-|lv-dbg|e2e-)/i.test(d.name || "");
            });
            const revlog = ctx.getRevlog();
            streak = calcStreak(revlog);
            heat = lastNDays(revlog, Math.max(4, ctx.getHeatmapWeeks()) * 7);
            const todayKey = heat[heat.length - 1]?.date;
            const reviewedToday = todayKey ? (revlog.days[todayKey]?.review ?? 0) : 0;
            todayReview = reviewedToday;
            todayStudyMinutes = Math.round(studySecondsOn(revlog, localDate(Date.now())) / 60);
            coverage = coverageStats(revlog, totalCards || undefined);
            unfinishedAI = ctx.getUnfinishedAIJob?.() ?? null;
            errStats = ctx.getErrorReasonStats?.() ?? null;
            dueCount = due?.unreviewedCount ?? 0;
            ctx.onDueCount?.(dueCount);
            newCount = due?.unreviewedNewCardCount ?? 0;
            const sess = ctx.getSessionState?.();
            const d = new Date();
            const localToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            sessLive = isSessionLive(sess, localToday);
            sessReps = sessLive ? sess!.counters.new + sess!.counters.review + sess!.counters.forget : 0;
            sessionBudget = ctx.getSessionBudget?.() ?? 15;
            deepOpen = ctx.getDeepStatsOpen?.() ?? false;
            inboxOpen = ctx.getInboxOpenCount?.() ?? 0;
            suspended = ctx.getSuspendedCount?.() ?? 0;
            oldCount = due.unreviewedOldCardCount;
            const first = revlog.entries[0]?.ts;
            revlogNote = first ? new Date(first).toLocaleDateString() : "";
            retention = computeRetention(revlog);
            curve = computeRetentionCurve(revlog);
            aiQuality = ctx
                .getAIBatches()
                .filter(b => b.blockIDs.length > 0)
                .slice(-5)
                .reverse()
                .map(b => {
                    const stat = reviewStatsFor(revlog, b.blockIDs);
                    return { date: b.date, cards: b.blockIDs.length, reviews: stat.reviews, rate: stat.rate };
                });
            leech = ctx.getLeechCards().slice(0, 8);
            examChip = ctx.getExamCountdown();
            targets = ctx.getDailyTargets();
            ecosystemBadgeText = lvEcosystem.getStatusBadgeText();
            hasLoadedSnapshot = true;
            lastSuccessfulAt = Date.now();
            loading = false;
            void scanDormantKnowledge();
            void loadForecast();
        } catch (e: unknown) {
            if (seq === refreshSeq) {
                errorMsg = friendlyError(e, t);
            }
        } finally {
            if (seq === refreshSeq) {
                loading = false;
            }
        }
    }

    onMount(() => {
        refresh();
        const scheduleDayBoundary = () => {
            const now = new Date();
            const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            const delay = Math.max(1_000, next.getTime() - now.getTime() + 50);
            dayBoundaryTimer = setTimeout(() => {
                dayBoundaryTimer = null;
                dayTick = Date.now();
                void refresh();
                scheduleDayBoundary();
            }, delay);
        };
        scheduleDayBoundary();
        // 会话完成联动（549）+ 评分联动（AT-11）：跨页签失效总览缓存
        const offFinished = ctx.onSessionFinished?.(() => refresh());
        const offReviewed = ctx.onReviewed?.(() => scheduleRefresh());
        const offStores = ctx.onStoresChanged?.(() => scheduleRefresh());
        return () => {
            refreshSeq += 1;
            calSeq += 1;
            offFinished?.();
            offReviewed?.();
            offStores?.();
            if (reviewedTimer) {
                clearTimeout(reviewedTimer);
                reviewedTimer = null;
            }
            if (dayBoundaryTimer) {
                clearTimeout(dayBoundaryTimer);
                dayBoundaryTimer = null;
            }
        };
    });

    function onWindowKeydown(e: KeyboardEvent) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
        if ((e.key === " " || e.key === "Enter") && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (!todayDecision.actionDisabled && (!loading || hasLoadedSnapshot)) {
                e.preventDefault();
                heroAction();
            }
        } else if (e.key === "r" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (!loading) {
                e.preventDefault();
                void refresh();
            }
        } else if (e.key === "m" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            ctx.openManager();
        } else if ((e.key === "c" || e.key === "n") && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (ctx.openQuickCard) {
                e.preventDefault();
                ctx.openQuickCard();
            }
        }
    }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<LvPage eyebrow={`TODAY / ${heroDateText()}`} title={t.dashboard.title}>
    {#snippet actions()}
        <div class="lv-dashboard-action-group">
            <button
                class="b3-button b3-button--small b3-button--outline lv-btn-action"
                data-testid="dashboard-refresh-btn"
                disabled={loading}
                title={`${loading ? t.dashboard.loading : t.dashboard.refresh} (r)`}
                aria-keyshortcuts="r"
                onclick={refresh}
            >
                <LvIcon name="refresh" size={13} />
                <span>{loading ? t.dashboard.loading : t.dashboard.refresh}</span>
            </button>
        </div>
    {/snippet}

    {#if writeError}
        <!-- AR-5：写入失败原因就近展示（按钮 title 同步提示） -->
        <div class="lv-glass" style="border-color: var(--lv-color-danger); padding: 6px 10px; margin-bottom: calc(var(--lv-space-unit) * 4)" role="alert" aria-live="assertive">
            <span class="ft__smaller" style="color: var(--lv-color-danger); max-width: 48em; text-wrap: pretty; line-height: var(--lv-lh-reading, 1.65);">{writeError}</span>
        </div>
    {/if}
    {#if ctx.getV2Status()}
        <div class="lv-glass lv-v2banner">
            <span class="lv-dot"></span>
            <LvChip tone="primary">V2 · {ctx.getV2Status()!.state}</LvChip>
            <span class="ft__smaller ft__on-surface">{t.dashboard.v2Active}</span>
        </div>
    {/if}
    {#if examChip}
        <div class="lv-glass lv-v2banner" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <div style="display: inline-flex; align-items: center; gap: calc(var(--lv-space-unit) * 4); min-width: 0;">
                <LvChip tone={examChip.days <= 7 ? "error" : "warn"}><LvIcon name="graduation" size={14} /> {examChip.name} · {t.exam.daysLeft.replace("${n}", String(examChip.days))}</LvChip>
                <span class="ft__smaller ft__on-surface">{t.exam.examChipHint}</span>
            </div>
            <div style="display: inline-flex; gap: 6px; align-items: center;">
                {#if hasExamBridge}
                    <button type="button" class="b3-button b3-button--small b3-button--outline lv-btn-tool" onclick={() => openExamModuleSafely("practice")} title="打开小驴考试做题练习台">
                        <LvIcon name="graduation" size={12} />
                        <span>考试台</span>
                    </button>
                {/if}
                <button type="button" class="b3-button b3-button--small lv-btn-primary" onclick={() => ctx.openHubTab?.("learning")}>
                    <LvIcon name="zap" size={12} />
                    <span>{t.exam?.startToday ?? "冲刺复习"}</span>
                </button>
            </div>
        </div>
    {/if}

    {#if loading && !hasLoadedSnapshot}
        <!-- 感知性能：骨架对位真实布局（hero + 四瓦片），加载完成不跳动 -->
        <div class="lv-loading" aria-busy="true">
            <div class="lv-skeleton lv-sk-hero"></div>
            <div class="lv-sk-tiles">
                {#each [0, 1, 2, 3] as i (i)}
                    <div class="lv-skeleton lv-sk-tile"></div>
                {/each}
            </div>
        </div>
    {:else if errorMsg && !hasLoadedSnapshot}
        <LvError message={errorMsg} onretry={refresh} retryLabel={t.dashboard.refresh} />
    {:else if totalCards === 0}
        {#if errorMsg}<LvError message={errorMsg} onretry={refresh} retryLabel={t.dashboard.refresh} />{/if}
        {#if loading}<div class="lv-refresh-status" role="status" aria-live="polite">{t.dashboard.refreshing ?? t.dashboard.loading}</div>{/if}
        <section class="lv-first-use" aria-labelledby="lv-first-use-title">
            <div class="lv-eyebrow">{t.hubPrimaryToday ?? "今日"}</div>
            <h2 id="lv-first-use-title">{t.dashboard.emptyStateTitle ?? "让第一张卡，简单一点"}</h2>
            <p class="lv-first-use-lead">{t.dashboard.emptyStateDesc ?? t.dashboard.onboardingHint}</p>
            <div class="lv-empty-note-card">
                <div class="lv-empty-note-icon"><LvIcon name="lightbulb" size={20} /></div>
                <div class="lv-empty-note-content">
                    <strong>{t.dashboard.emptyGuideTitle ?? "思源笔记即是闪卡"}</strong>
                    <p>{t.dashboard.emptyGuideDesc ?? "无需单独录入卡片。在文档中选中文本打上 ==挖空==，或点击段落块图标「制作闪卡」，即可自动生成复习卡片。"}</p>
                </div>
            </div>
            <div class="lv-first-use-actions">
                {#if ctx.openHubTab}
                <button class="b3-button lv-btn-primary" onclick={() => ctx.openHubTab?.("marketplace")}>
                    <LvIcon name="star" size={14} /> 前往卡组集市一键导入刷卡
                </button>
                {/if}
                {#if ctx.openQuickCard}
                <button class="b3-button {ctx.openHubTab ? 'b3-button--outline' : 'lv-btn-primary'}" disabled={!ctx.openQuickCard} aria-describedby={!ctx.openQuickCard ? "lv-first-use-title" : undefined} onclick={() => ctx.openQuickCard?.()}>{t.dashboard.emptyStateCreate ?? t.cmdQuickCard ?? "新建闪卡"}</button>
                {/if}
                <button class="b3-button b3-button--outline lv-first-use-tour-btn" onclick={ctx.openOnboarding}>{t.dashboard.emptyGuideTour ?? t.dashboard.emptyStateTry ?? t.dashboard.onboardingStart}</button>
            </div>
            <div class="lv-first-use-steps">
                <div><span>1</span><p>{t.dashboard.emptyStepSource ?? "选一段值得记住的内容"}</p></div>
                <div><span>2</span><p>{t.dashboard.emptyStepQuestion ?? "写一个清楚的问题"}</p></div>
                <div><span>3</span><p>{t.dashboard.emptyStepRecall ?? "先回忆，再对照答案"}</p></div>
            </div>
        </section>
    {:else}
        {#if loading}
            <div class="lv-refresh-status" role="status" aria-live="polite">{t.dashboard.refreshing ?? t.dashboard.loading}</div>
        {/if}
        {#if errorMsg}
            <LvError message={errorMsg} onretry={refresh} retryLabel={t.dashboard.refresh} />
        {/if}
        {#if !errorMsg || hasLoadedSnapshot}
        {#if errorMsg && hasLoadedSnapshot}
            <div class="lv-notice lv-notice--warn" role="status">
                {t.dashboard.staleData.replace("${time}", new Date(lastSuccessfulAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}
            </div>
        {/if}

        <!-- AI 写入状态可能未知；所有入口统一进入恢复中心核对。 -->
        {#if unfinishedAI}
            <button
                class="lv-card2 lv-unfinished-ai"
                onclick={() => ctx.openHubTab ? ctx.openHubTab("recovery") : ctx.openAIWizard?.()}
            >
                <span><LvIcon name="timer" size={15} /> {t.dashboard.unfinishedAI
                    .replace("${done}", String(unfinishedAI.done))
                    .replace("${total}", String(unfinishedAI.total))}</span>
            </button>
        {/if}

        <!-- AR-8 错误态优先级：首次加载失败（无任何成功数据）时只显示错误+重试，
             不同时展示「空库→引导」误导与全 0 统计；有旧数据时横幅叠加旧值可见（标注上次刷新） -->
        <!-- T01 今日行动 + 本周节奏左右均衡主卡（填平右侧留白、收束左侧按钮堆叠） -->
        <div class="lv-hero">
            <div class="lv-hero-text">
                <div class="lv-hero-badge-row">
                    <div class="lv-hero-tags-group">
                        <span class="lv-tag lv-tag--brand">{todayDecision.tag}</span>
                        <div class="lv-hero-budget-pill">
                            <span class="lv-hero-budget-label"><LvIcon name="timer" size={13} /> {t.dashboard.heroTimeBudget}</span>
                            <select
                                class="b3-select lv-hero-budget-select"
                                aria-label={t.dashboard.heroTimeBudget}
                                value={String(sessionBudget)}
                                onchange={(e) => ctx.setSessionBudget?.(Number((e.currentTarget as HTMLSelectElement).value))}
                            >
                                {#each BUDGET_CHOICES as m (m)}
                                    <option value={String(m)}>{m === 0 ? t.dashboard.heroTimeOff : t.dashboard.heroTimeMin.replace("${n}", String(m))}</option>
                                {/each}
                            </select>
                        </div>
                    </div>
                </div>
                <div class="lv-hero-title">
                    {totalCards === 0 ? (t.dashboard.emptyHeroTitle ?? t.dashboard.heroStartTitle) : todayDecision.title}
                </div>
                <p class="lv-hero-desc">
                    {todayDecision.summary}
                </p>
                <div class="lv-hero-cta">
                    <button
                        class="b3-button lv-btn-primary"
                        disabled={todayDecision.actionDisabled || (loading && !hasLoadedSnapshot)}
                        title={`${heroActionLabel()} (Space / Enter)`}
                        aria-keyshortcuts="Space Enter"
                        aria-label={heroActionLabel()}
                        onclick={heroAction}
                    >
                        {heroActionLabel()}
                    </button>
                    {#if todayDecision.primaryAction === "start-review" || todayDecision.primaryAction === "continue-review"}
                        <button
                            type="button"
                            class="b3-button b3-button--outline lv-btn-tool"
                            onclick={copyTodayTask}
                            title={t.dashboard?.copyDailyTaskTitle ?? "复制今日复习待办（支持一键挂载到日记或任务视界 Task Horizon）"}
                        >
                            <LvIcon name="check" size={13} />
                            <span>{t.dashboard?.copyDailyTask ?? "复制待办"}</span>
                        </button>
                    {:else}
                        <button
                            type="button"
                            class="b3-button b3-button--outline lv-btn-tool"
                            onclick={() => ctx.openReview()}
                        >
                            <LvIcon name="cards" size={13} />
                            <span>自由复习</span>
                        </button>
                        <button
                            type="button"
                            class="b3-button b3-button--outline lv-btn-tool"
                            onclick={() => ctx.openQuickCard ? ctx.openQuickCard() : ctx.openHubTab?.("authoring")}
                        >
                            <LvIcon name="plus" size={13} />
                            <span>制作新卡</span>
                        </button>
                    {/if}
                </div>
            </div>

            <div class="lv-hero-week" aria-label={t.dashboard.weekTitle}>
                <div class="lv-hero-week-head">
                    <span class="lv-hero-week-streak">
                        <LvIcon name="flame" size={14} />
                        <span>{t.dashboard.streak ?? "连续学习"} <b>{streak}</b> {t.dashboard.streakUnit ?? "天"}</span>
                    </span>
                    {#if targetPct() >= 0}
                        <span class="lv-hero-week-meta">{t.dashboard.heroRingLabel} {targetPct()}%</span>
                    {:else}
                        <span class="lv-hero-week-meta">{weekDateLabel}</span>
                    {/if}
                </div>
                <div class="lv-today-week-grid" role="list" aria-label={t.dashboard.weekDaysLabel}>
                    {#each currentWeek.days as day (day.index)}
                        {@const label = t.dashboard.weekdays[day.index]}
                        <div class="lv-today-week-day" class:lv-today-week-day-active={day.active} class:lv-today-week-day-today={day.today} class:lv-today-week-day-future={day.future} role="listitem" aria-label={t.dashboard.weekDayAria.replace("${weekday}", label).replace("${date}", String(day.date.getDate())).replace("${state}", day.active ? t.dashboard.weekDayActivity.replace("${review}", String(day.reviews)).replace("${new}", String(day.newCards)) : day.future ? t.dashboard.weekFuture : t.dashboard.weekDayEmpty)}>
                            <span class="lv-week-day-label">{label}</span>
                            <i aria-hidden="true">
                                {#if day.active}
                                    <LvIcon name="check" size={12} />
                                {:else if day.today}
                                    {day.date.getDate()}
                                {:else}
                                    ·
                                {/if}
                            </i>
                        </div>
                    {/each}
                </div>
                <div class="lv-today-week-summary">
                    <span>{t.dashboard.weekActiveDays.replace("${n}", String(currentWeek.activeDays))}</span>
                    <strong>{currentWeek.reviews} <small>{t.dashboard.weekReviews}</small></strong>
                </div>
            </div>
        </div>

        <div class="lv-today-stats" role="region" aria-label={t.dashboard.todayStatsAriaLabel ?? "今日关键学习指标"}>
            <div class="lv-stat-cell">
                <LvStat label={t.dashboard.todayDue} detail={t.dashboard.dueCountDetail} value={dueCount} tone="primary" animate />
            </div>
            <div class="lv-stat-cell">
                <LvStat label={t.dashboard.newCards} detail={t.dashboard.newCardsDetail} value={newCount} tone="warn" animate />
            </div>
            <div class="lv-stat-cell">
                <LvStat label={t.dashboard.reviewCards} detail={t.dashboard.reviewCardsDetail} value={oldCount} tone="primary" animate />
            </div>
            <div class="lv-stat-cell">
                <LvStat
                    label={t.dashboard.todayDone}
                    detail={targets.review > 0 ? `目标达成率 ${targetPct()}%` : t.dashboard.dueCountDetail}
                    value={todayReview}
                    denom={targets.review > 0 ? String(targets.review) : ""}
                    tone="data"
                    progress={targetPct()}
                    animate
                />
            </div>
        </div>

        {#snippet deckItem(deck: RiffDeck, nested: boolean)}
            {@const eco = getDeckEcosystemBadge(deck.name)}
            <div class="lv-today-deck" class:lv-today-deck--nested={nested} class:lv-today-deck--has-cards={(deck.size ?? 0) > 0} class:lv-today-deck--pinned={pinnedDeckIds.includes(deck.id)}>
                <button
                    type="button"
                    class="lv-today-deck-main-btn"
                    aria-label={`${deck.name}, ${t.dashboard.deckCardCount.replace("${n}", String(deck.size ?? 0))}`}
                    onclick={() => ctx.openManagerDeck?.(deck.id, deck.name)}
                >
                    <span class="lv-deck-icon-badge" aria-hidden="true">
                        <LvIcon name={pinnedDeckIds.includes(deck.id) ? "star" : "book"} size={15} />
                    </span>
                    <span class="lv-today-deck-name">{nested ? deck.name.replace(/^[^/]+\//, "") : deck.name}</span>
                    {#if eco}
                        <span class="lv-tag lv-tag--{eco.colorTone}" style="font-size: 10px; padding: 1px 5px; margin-left: 6px; border-radius: 4px;">
                            <LvIcon name={eco.icon} size={10} /> <span>{eco.label}</span>
                        </span>
                    {/if}
                </button>
                <div class="lv-today-deck-actions">
                    <span class="lv-today-deck-count">{t.dashboard.deckCardCount.replace("${n}", String(deck.size ?? 0))}</span>
                    {#if eco?.origin === "exam" && hasExamBridge}
                        <button
                            type="button"
                            class="b3-button b3-button--small b3-button--outline lv-deck-quick-btn"
                            title="直达小驴考试练习台刷题"
                            onclick={() => openExamModuleSafely("practice")}
                        >
                            <LvIcon name="graduation" size={13} /> 考试台
                        </button>
                    {/if}
                    <button
                        type="button"
                        class="b3-button b3-button--small b3-button--outline lv-deck-quick-btn"
                        disabled={(deck.size ?? 0) === 0}
                        title={t.dashboard.cramDeckTip ?? `突击快刷此卡组（不改排期）`}
                        onclick={() => startCramDeck(deck.id)}
                        data-testid={`dashboard-cram-deck-${deck.id}`}
                    >
                        <LvIcon name="zap" size={13} /> {t.dashboard.cramDeck ?? "突击"}
                    </button>
                    <button
                        type="button"
                        class="b3-button b3-button--small b3-button--outline lv-deck-quick-btn"
                        disabled={(deck.size ?? 0) === 0}
                        title={(deck.size ?? 0) === 0 ? "卡组暂无可复习卡片" : `开始复习卡组「${deck.name}」`}
                        onclick={() => startReviewDeck(deck.id)}
                    >
                        <LvIcon name="cards" size={13} /> {(deck.size ?? 0) === 0 ? "暂无卡片" : (t.dashboard.openReview ?? "复习")}
                    </button>
                        <button type="button" class="b3-button b3-button--small lv-btn-ghost lv-btn-tool lv-deck-mgmt-btn" title={t.dashboard.renameDeck ?? "重命名卡组"} aria-label={`${t.dashboard.renameDeck ?? "重命名卡组"} ${deck.name}`} onclick={() => renameDeckPrompt(deck.id, deck.name)}>
                        <LvIcon name="edit" size={13} />
                    </button>
                    <button type="button" class="b3-button b3-button--small lv-btn-ghost lv-btn-tool lv-deck-mgmt-btn" disabled={ddExportBusy} title={t.dashboard.ddShareBtn} aria-label={`${t.dashboard.ddShareBtn} ${deck.name}`} onclick={() => exportDeckShare(deck.id, deck.name)}>
                        <LvIcon name="eye" size={13} />
                    </button>
                    <button type="button" class="b3-button b3-button--small lv-btn-ghost lv-menu-danger lv-btn-tool lv-deck-mgmt-btn" title={t.dashboard.deleteDeck ?? "删除卡组"} aria-label={`${t.dashboard.deleteDeck ?? "删除卡组"} ${deck.name}`} onclick={() => removeDeckConfirm(deck.id, deck.name)}>
                        <LvIcon name="trash" size={13} />
                    </button>
                </div>
            </div>
        {/snippet}

        {#if ctx.openManagerDeck && decks.length > 0}
            <LvSection id="sec-today-decks" title={t.dashboard.decksToday ?? "我的卡组"}>
                {#snippet actions()}
                    <div class="lv-today-decks-head-actions">
                        <button
                            type="button"
                            class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                            title={t.dashboard.cramAll ?? "Cram 考前突击快刷（不改排期）"}
                            onclick={startGlobalCram}
                            data-testid="dashboard-start-cram-btn"
                        >
                            <LvIcon name="zap" size={13} /> <span>{t.dashboard.cramAll ?? "考前突击快刷"}</span>
                        </button>
                        <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" onclick={() => ctx.openHubTab?.("decks")}>
                            <LvIcon name="cards" size={13} /> <span>{t.hubTabDecks ?? "卡包管理"}</span>
                        </button>
                        <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" onclick={() => ctx.openManager()}>
                            <LvIcon name="search" size={13} /> <span>{t.dashboard.decksViewAll ?? t.hubTabManage}</span>
                        </button>
                    </div>
                {/snippet}

                <div class="lv-today-decks-list">
                    {#each visibleClusters as cluster (cluster.prefix)}
                        {#if cluster.isGroup}
                            <div class="lv-deck-cluster">
                                <button
                                    type="button"
                                    class="lv-deck-cluster-head"
                                    onclick={() => toggleCluster(cluster.prefix)}
                                    aria-expanded={!collapsedClusters.has(cluster.prefix)}
                                >
                                    <span class="lv-cluster-arrow">
                                        <LvIcon name={collapsedClusters.has(cluster.prefix) ? "chevron-right" : "chevron-down"} size={13} />
                                    </span>
                                    <LvIcon name="book" size={14} />
                                    <strong class="lv-cluster-name">{cluster.prefix}</strong>
                                    <span class="lv-cluster-meta ft__smaller ft__on-surface">
                                        {cluster.decks.length} 个子卡包 · 共 {cluster.totalSize} 张
                                    </span>
                                </button>
                                {#if !collapsedClusters.has(cluster.prefix)}
                                    <div class="lv-deck-cluster-items">
                                        {#each cluster.decks as deck (deck.id)}
                                            {@render deckItem(deck, true)}
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        {:else}
                            {#each cluster.decks as deck (deck.id)}
                                {@render deckItem(deck, false)}
                            {/each}
                        {/if}
                    {/each}
                </div>
                {#if clusteredDecks.length > 8}
                    <div class="lv-empty-decks-bar" style="margin-bottom: var(--lv-sp-2);">
                        <button
                            type="button"
                            class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                            onclick={() => (showAllClusters = !showAllClusters)}
                        >
                            <LvIcon name={showAllClusters ? "chevron-up" : "chevron-down"} size={12} />
                            <span>{showAllClusters ? "收起多余卡包分组" : `其余 ${clusteredDecks.length - 8} 个卡包分组已折叠，点击展开全部 (${clusteredDecks.length})`}</span>
                        </button>
                    </div>
                {/if}
                {#if activeDecks.length > 0 && emptyDecks.length > 0}
                    <div class="lv-empty-decks-bar">
                        <button
                            type="button"
                            class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                            onclick={() => (showAllEmptyDecks = !showAllEmptyDecks)}
                        >
                            <LvIcon name={showAllEmptyDecks ? "chevron-up" : "chevron-down"} size={12} />
                            <span>{showAllEmptyDecks ? "收起无卡片的空卡组" : `其余 ${emptyDecks.length} 个空卡组已折叠，点击展开`}</span>
                        </button>
                    </div>
                {/if}
            </LvSection>
        {/if}

        <!-- T08 待处理与恢复：有待办才展开卡片，空态只用一行静默底栏，不堆空盒子 -->
        {#if inboxOpen === 0 && suspended === 0 && !unfinishedAI && dormantCount === 0}
            <div class="lv-todo-quiet">
                <div class="lv-todo-quiet-left">
                    <LvIcon name="check" size={14} />
                    <span>{t.dashboard.todoNone}</span>
                </div>
                {#if ctx.openHubTab}
                    <button type="button" class="b3-button b3-button--small b3-button--outline lv-btn-tool" onclick={() => ctx.openHubTab?.("recovery")}>
                        <LvIcon name="inbox" size={12} />
                        <span>{t.hubTabRecovery ?? "待处理与恢复"}</span>
                    </button>
                {/if}
            </div>
        {:else}
            <LvSection title={t.dashboard.todoTitle}>
                {#snippet actions()}
                    {#if ctx.openHubTab}
                        <button type="button" class="b3-button b3-button--small lv-btn-ghost lv-btn-tool" onclick={() => ctx.openHubTab?.("recovery")}>
                            <span>{t.hubTabRecovery ?? "待处理与恢复"}</span>
                        </button>
                    {/if}
                {/snippet}
                {#if inboxOpen > 0}
                    <div class="lv-todo-row">
                        <span>{t.dashboard.todoInbox.replace("${n}", String(inboxOpen))}</span>
                        {#if ctx.openHubTab}<button class="b3-button b3-button--small" onclick={() => ctx.openHubTab?.("inbox")}>{t.dashboard.todoAct}</button>{/if}
                    </div>
                {/if}
                {#if suspended > 0}
                    <div class="lv-todo-row">
                        <span>{t.dashboard.todoSuspended.replace("${n}", String(suspended))}</span>
                        {#if ctx.restoreSuspendedToday}
                            <button class="b3-button b3-button--small" disabled={suspendedRestoreBusy} aria-busy={suspendedRestoreBusy} onclick={restoreSuspendedToday}>{suspendedRestoreBusy ? t.dashboard.todoSuspendedSaving : t.dashboard.todoSuspendedAct}</button>
                        {/if}
                    </div>
                    {#if suspendedRestoreError}
                        <div class="lv-todo-error">
                            <LvError message={suspendedRestoreError} onretry={suspendedRestoreBusy ? undefined : restoreSuspendedToday} retryLabel={t.dashboard.todoSuspendedRetry} />
                        </div>
                    {/if}
                {/if}
                {#if unfinishedAI}
                    <div class="lv-todo-row">
                        <span>{t.dashboard.todoAI.replace("${n}", String(unfinishedAI.total - unfinishedAI.done))}</span>
                        {#if ctx.openHubTab}<button class="b3-button b3-button--small" onclick={() => ctx.openHubTab?.("recovery")}>{t.dashboard.todoAIAct}</button>
                        {:else if ctx.openAIWizard}<button class="b3-button b3-button--small" onclick={() => ctx.openAIWizard?.()}>{t.dashboard.todoAIAct}</button>{/if}
                    </div>
                {/if}
                {#if dormantCount > 0}
                    <div class="lv-todo-row">
                        <span>{t.dashboard.todoDormant ? t.dashboard.todoDormant.replace("${n}", String(dormantCount)) : `发现 ${dormantCount} 处包含重点高亮但尚未制卡的沉睡知识`}</span>
                        <button class="b3-button b3-button--small lv-btn-primary" disabled={dormantAwakening} onclick={awakenDormantKnowledge}>
                            <LvIcon name="lightbulb" size={12} />
                            <span>{dormantAwakening ? (t.dashboard?.todoSuspendedSaving ?? "收纳中…") : (t.dashboard.todoDormantAct ?? "去唤醒")}</span>
                        </button>
                    </div>
                {/if}
            </LvSection>
        {/if}

        <!-- T01 渐进展开：行动、今日四指标与卡组留在首屏；未来负载预测、报告导出与深度统计按需展开 -->
        <div class="lv-deep-toggle-wrap">
            <button
                type="button"
                class="b3-button b3-button--outline lv-deep-toggle"
                onclick={() => { deepOpen = !deepOpen; ctx.setDeepStatsOpen?.(deepOpen); }}
                aria-expanded={deepOpen}
            >
                <LvIcon name="timer" size={13} />
                <span>{t.dashboard.deepToggle ?? "深度统计"}</span>
                <LvIcon name={deepOpen ? "chevron-up" : "chevron-down"} size={13} />
            </button>
        </div>
        {#if deepOpen}
        <div in:fade={{ duration: getMotionDuration("emphasis") }}>
        <div class="lv-deep-report-bar">
            {#if coverage && coverage.coverage !== null}
                <span class="ft__smaller ft__on-surface">
                    {t.dashboard.coverageLine
                        .replace("${a}", String(coverage.seenCards))
                        .replace("${b}", String(coverage.totalCards))
                        .replace("${pct}", String(Math.round(coverage.coverage * 100)))
                        .replace("${since}", coverage.sinceDate ?? "")}
                </span>
            {:else}
                <span></span>
            {/if}
            <div class="lv-dashboard-action-group">
                <button class="b3-button b3-button--small b3-button--outline lv-btn-action" disabled={loading && !hasLoadedSnapshot} onclick={downloadReport}>
                    <LvIcon name="book" size={13} />
                    <span>{t.dashboard.report}</span>
                </button>
                <button class="b3-button b3-button--small b3-button--outline lv-btn-action" disabled={writeBusy || (loading && !hasLoadedSnapshot)} title={writeError || undefined} onclick={writeDocReport}>
                    <LvIcon name="edit" size={13} />
                    <span>{writeBusy ? "…" : t.dashboard.writeDoc}</span>
                </button>
            </div>
        </div>

        <section class="lv-today-forecast lv-card2" aria-labelledby="lv-forecast-title" data-testid="dashboard-7day-forecast" style="margin-bottom: var(--lv-sp-4);">
            <div class="lv-today-week-head">
                <div class="lv-forecast-title-group">
                    <h2 id="lv-forecast-title">{t.dashboard.forecast7Title ?? "未来 7 日复习负载预报"}</h2>
                    <span class="lv-today-week-range">{t.dashboard.forecast7Sub ?? "每日到期量预测与平滑削峰"}</span>
                </div>
                <div class="lv-forecast-head-actions">
                    <button
                        type="button"
                        class="b3-button b3-button--small lv-btn-tool"
                        class:lv-btn-primary={smoothLoadEnabled}
                        class:b3-button--outline={!smoothLoadEnabled}
                        aria-pressed={smoothLoadEnabled}
                        title={smoothLoadEnabled ? (t.dashboard.smoothLoadOn ?? "平滑已开启") : (t.dashboard.smoothLoadOff ?? "平滑已关闭")}
                        onclick={toggleSmoothLoad}
                        data-testid="dashboard-smooth-toggle-btn"
                    >
                        <LvIcon name="swap" size={12} />
                        <span>{t.dashboard.smoothLoad ?? "负载平滑"}: {smoothLoadEnabled ? (t.dashboard.stateOn ?? "开") : (t.dashboard.stateOff ?? "关")}</span>
                    </button>
                </div>
            </div>
            {#if forecast7Days.length > 0}
                <!-- Mobile Spec v1 深化：手机端收纳为单行徽记，点开才展开 7 日柱状图 -->
                <button
                    type="button"
                    class="lv-forecast-mobile-badge"
                    aria-expanded={mobileForecastExpanded}
                    onclick={() => (mobileForecastExpanded = !mobileForecastExpanded)}
                >
                    <span class="lv-forecast-badge-icon"><LvIcon name="timer" size={14} /></span>
                    <span class="lv-forecast-badge-text">
                        今日 <strong>{(forecast7Days[0]?.reviews ?? 0) + (forecast7Days[0]?.news ?? 0)}</strong> · 明日 <strong>{(forecast7Days[1]?.reviews ?? 0) + (forecast7Days[1]?.news ?? 0)}</strong> · 7日负载
                    </span>
                    <span class="lv-forecast-badge-toggle">
                        {mobileForecastExpanded ? "收起" : "展开"}
                        <LvIcon name={mobileForecastExpanded ? "chevron-up" : "chevron-down"} size={13} />
                    </span>
                </button>
                <div class="lv-forecast-bars-container" class:lv-forecast-bars-hidden-mobile={!mobileForecastExpanded}>
                    <div class="lv-forecast-bars-row" role="region" aria-label={t.dashboard.forecast7Title ?? "未来 7 日复习负载预报"}>
                        {#each forecast7Days as day, idx}
                            {@const totalDay = day.reviews + day.news}
                            {@const barHeightPct = Math.max(6, Math.min(100, Math.round((totalDay / Math.max(1, forecast7Max)) * 100)))}
                            <div class="lv-forecast-col" title={`${day.date}：复习 ${day.reviews} + 新卡 ${day.news}（共 ${totalDay} 张）`}>
                                <span class="lv-forecast-count">{totalDay}</span>
                                <div class="lv-forecast-bar-track">
                                    <div class="lv-forecast-bar-fill" style={`height: ${barHeightPct}%;`}>
                                        {#if day.reviews > 0}
                                            <div class="lv-forecast-seg-review" style={`height: ${Math.round((day.reviews / Math.max(1, totalDay)) * 100)}%;`}></div>
                                        {/if}
                                    </div>
                                </div>
                                <span class="lv-forecast-label">{idx === 0 ? (t.dashboard.todayLabel ?? "今天") : idx === 1 ? (t.dashboard.tomorrowLabel ?? "明天") : day.date.slice(5)}</span>
                            </div>
                        {/each}
                    </div>
                    <div class="lv-today-week-summary">
                        <span>{(t.dashboard.forecast7TotalDue ?? "总预计到期 ${n} 张").replace("${n}", String(forecast7Total))}</span>
                        {#if smoothLoadEnabled}
                            <span class="lv-chip2 lv-chip2--primary"><LvIcon name="check" size={11} /> {t.dashboard.smoothLoadBadge ?? "削峰填谷已优化"}</span>
                        {/if}
                    </div>
                </div>
            {:else}
                <div class="lv-today-week-summary">
                    <span class="ft__smaller ft__on-surface">{calLoading ? (t.dashboard.loading ?? "计算预测中...") : (t.dashboard.calEmpty ?? "预测窗口内没有到期卡片")}</span>
                </div>
            {/if}
        </section>

        <!-- 深度统计首行：连续/用时/总量瓦片（R53 T01 上限 4——次级指标折叠在此） -->
        <div class="fn__flex fn__flex-wrap lv-cards">
            <div class="lv-stat-cell">
                <LvStat label={t.dashboard.streak} value={streak} tone="warn" animate badgeIcon={streak >= 3 ? "flame" : undefined} />
            </div>
            {#if todayStudyMinutes > 0}
                <div class="lv-stat-cell">
                    <!-- AQ-13：今日作答用时（仅统计带耗时的插件面板评分；原生无字段不补 0） -->
                    <LvStat label={t.dashboard.studyTime} value={todayStudyMinutes} tone="neutral" />
                </div>
            {/if}
            <div class="lv-stat-cell">
                <LvStat label={t.dashboard.totalCards} value={totalCards} tone="neutral" animate />
            </div>
        </div>

        <LvSection title={t.dashboard.heatmap} sub={revlogNote ? `${t.dashboard.since} ${revlogNote}` : ""}>
            <LvHeatmap days={heat} />
        </LvSection>

        <!-- T14 学习日历与负载预测（docs/41 P0）：过去=复习热力，未来=到期负载；首次展开拉取，只读不改调度 -->
        <LvSection title={t.dashboard.calTitle} sub={t.dashboard.calSub}>
            {#if calError}
                <LvError message={calError} onretry={calLoading ? undefined : loadForecast} retryLabel={t.dashboard.refresh} />
            {/if}
            <LvCalendar
                monthLabel={`${new Date().getFullYear()} ${t.dashboard.calMonth} ${new Date().getMonth() + 1}`}
                cells={calCells}
                forecast={calForecast?.days ?? []}
                loading={calLoading && !calLoadedOnce}
                selectedDate={calSelectedDate}
                onselect={selectCalendarDate}
                labels={{
                    few: t.dashboard.calFew,
                    many: t.dashboard.calMany,
                    note: t.dashboard.calNote,
                    forecastTitle: t.dashboard.calForecastTitle,
                    empty: t.dashboard.calEmpty,
                }}
                caption={calForecast
                    ? t.dashboard.calCoverage.replace("${c}", String(calForecast.coveredTotal)).replace("${t}", String(calForecast.coveredTotal + calForecast.skippedTotal))
                        + (calForecast.skippedTotal > 0 ? " · " + t.dashboard.calSkipped.replace("${n}", String(calForecast.skippedTotal)) : "")
                        + (calSelectedSummary ? " · " + calSelectedSummary : "")
                    : ""}
            />
            {#if calSelectedDate}
                <div class="lv-cal-selected-card" data-testid="dashboard-cal-selected-card">
                    <div class="lv-cal-selected-meta">
                        <span class="lv-cal-selected-date">
                            <LvIcon name="calendar" size={14} />
                            <strong>{calSelectedDate}</strong>
                        </span>
                        <span class="lv-cal-selected-stat">{calSelectedSummary}</span>
                    </div>
                    <div class="lv-cal-selected-actions">
                        <button
                            type="button"
                            class="b3-button b3-button--small lv-btn-primary"
                            onclick={() => ctx.openReviewScope?.("all")}
                            title={`针对 ${calSelectedDate} 发起复习会话`}
                        >
                            <LvIcon name="learn" size={13} />
                            <span>发起复习</span>
                        </button>
                        <button
                            type="button"
                            class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                            onclick={() => ctx.openReviewScope?.("all", true)}
                            title="突击练习（全量刷题，不记入正式遗忘惩罚）"
                        >
                            <LvIcon name="zap" size={13} />
                            <span>突击</span>
                        </button>
                    </div>
                </div>
            {/if}
        </LvSection>

        <LvSection title={t.retention.title} sub={t.retention.sub}>
            {#if retention}
                <div class="lv-ret">
                    {#each [
                        { label: t.retention.first, tier: retention.new },
                        { label: t.retention.young, tier: retention.young },
                        { label: t.retention.mature, tier: retention.mature },
                    ] as row (row.label)}
                        <div class="lv-ret-row">
                            <span>{row.label}</span>
                            <span class="lv-ret-rate">
                                {row.tier.rate === null ? "—" : Math.round(row.tier.rate * 100) + "%"}
                                <span class="ft__smaller ft__on-surface">({row.tier.reviews})</span>
                            </span>
                        </div>
                    {/each}
                </div>
            {:else}
                <div class="lv-hint">{t.retention.none}</div>
            {/if}
        </LvSection>

        <LvSection title={t.retention.curve} sub={t.retention.curveSub}>
            {#snippet actions()}
                {#if curve.length >= 2}
                    <button class="b3-button b3-button--small lv-btn-tool" title={t.retention.exportPng} onclick={exportCurvePng}>
                        <LvIcon name="image" size={12} /> <span>PNG</span>
                    </button>
                {/if}
            {/snippet}
            {#if curve.length >= 2}
                {@const pts = curvePoints(curve)}
                {@const ptList = pts.trim().split(/\s+/)}
                {@const firstX = ptList[0]?.split(",")[0] ?? "10"}
                {@const lastX = ptList[ptList.length - 1]?.split(",")[0] ?? "300"}
                {@const areaPoints = `${firstX},90 ${pts} ${lastX},90`}
                <svg viewBox="0 0 320 100" class="lv-curve" role="img" aria-label={t.dashboard.retentionCurveTitle ?? "记忆留存曲线"} bind:this={curveEl}>
                    <defs>
                        <linearGradient id="lv-curve-gradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="var(--lv-color-data)" stop-opacity="0.25" />
                            <stop offset="100%" stop-color="var(--lv-color-data)" stop-opacity="0.0" />
                        </linearGradient>
                    </defs>
                    <!-- 参考虚线网格：极淡处理 -->
                    <line x1="8" y1="30" x2="312" y2="30" stroke="var(--lv-border)" stroke-dasharray="3 3" opacity="0.25" />
                    <line x1="8" y1="60" x2="312" y2="60" stroke="var(--lv-border)" stroke-dasharray="3 3" opacity="0.25" />
                    <line x1="8" y1="90" x2="312" y2="90" class="lv-curve-axis" opacity="0.6" />
                    <!-- 面积渐变阴影面与数据折线（数据语义色天青碧水蓝，粗圆头线条） -->
                    <polygon points={areaPoints} fill="url(#lv-curve-gradient)" stroke="none" />
                    <polyline fill="none" stroke="var(--lv-color-text-muted)" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.4" points={theoryPoints(curve)} />
                    <polyline fill="none" stroke="var(--lv-color-data)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" points={pts} />
                    {#each curve as p (p.days)}
                        <circle cx={10 + (p.days / Math.max(...curve.map(q => q.days), 1)) * 290} cy={90 - p.rate * 80} r="3.5" class="lv-curve-dot" fill="var(--lv-color-data)">
                            <title>{p.days}天 · {Math.round(p.rate * 100)}% (n={p.n})</title>
                        </circle>
                    {/each}
                </svg>
                <div class="ft__smaller ft__on-surface" style="margin-top: calc(var(--lv-space-unit) * 2)">{t.retention.theory}</div>
            {:else}
                <div class="lv-hint">{t.retention.curveNone}</div>
            {/if}
        </LvSection>

        <LvSection title={t.leech.title} sub={t.leech.sub}>
            {#if leech.length === 0}
                <div class="lv-hint">{t.leech.none}</div>
            {:else}
                {#each leech as l (l.blockID)}
                    <div class="fn__flex lv-airow">
                        <span class="ft__smaller ft__on-surface">ID {l.blockID.slice(0, 8)}…</span>
                        <div class="fn__flex-1"></div>
                        <LvChip tone={l.lapses >= 12 ? "error" : "warn"}>{t.leech.lapses}: {l.lapses}</LvChip>
                        <button class="b3-button b3-button--small" onclick={() => ctx.rewriteWithAI(l.blockID)}>{t.leech.rewriteAI}</button>
                        <button class="b3-button b3-button--small" onclick={() => {
                            try {
                                if (ctx.openDoc) {
                                    ctx.openDoc(l.blockID, true);
                                } else {
                                    openTab({ app: ctx.app, doc: { id: l.blockID, zoomIn: true } });
                                }
                            } catch (e: unknown) {
                                showMessage(friendlyError(e, t), 2500, "error");
                            }
                        }}>
                            {t.leech.rewrite}
                        </button>
                    </div>
                {/each}
            {/if}
        </LvSection>

        {#if errStats && errStats.length > 0}
            <!-- BJ-4：错误原因分布（遗忘卡标注；口径=全量累计） -->
            <LvSection title={t.errReasons?.title ?? "Error reasons"} sub={t.errReasons?.sub ?? ""}>
                <div class="fn__flex fn__flex-wrap lv-caps">
                    {#each errStats as s (s.reason)}
                        <div class="lv-stat-mini">
                            <div class="lv-mini-label">{t.errReasons?.[s.reason] ?? s.reason}</div>
                            <div class="lv-mini-num">{s.count}</div>
                        </div>
                    {/each}
                </div>
            </LvSection>
        {/if}
        </div>
        {/if}
    {/if}
        {/if}

    <footer class="lv-ecosystem-footer" style="display: flex; justify-content: center; align-items: center; padding: 24px 0 12px; margin-top: auto;">
        <span class="lv-ecosystem-badge" data-testid="ecosystem-status-badge" style="display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--lv-color-text-muted); padding: 4px 14px; border-radius: 999px; background: color-mix(in srgb, var(--lv-color-surface) 75%, transparent); border: 1px solid var(--lv-border); backdrop-filter: blur(4px); box-shadow: var(--lv-shadow-1);">
            {ecosystemBadgeText}
        </span>
    </footer>
</LvPage>

<style lang="scss">
    .lv-v2banner {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        padding: var(--lv-sp-2) var(--lv-sp-3);
        margin-bottom: var(--lv-sp-4);
    }

    // 规则三：统计优先指标通栏（竖分割线替代卡片包裹，44px大数字与小标签）
    .lv-today-stats {
        display: flex;
        align-items: stretch;
        background: var(--lv-color-surface);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-l);
        box-shadow: var(--lv-shadow-1), var(--lv-inset-shine);
        margin-bottom: var(--lv-sp-4);
        overflow: hidden;
    }
    .lv-today-stats .lv-stat-cell {
        flex: 1;
        min-width: 0;
        display: flex;
        position: relative;

        &:not(:last-child) {
            border-right: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent);
        }
    }
    :global(.lv-today-stats .lv-stat-cell .lv-card2) {
        flex: 1;
        min-width: 0;
        padding: calc(var(--lv-space-unit) * 5) calc(var(--lv-space-unit) * 7);
        border-radius: 0;
        background: transparent;
        border: none;
        box-shadow: none;

        &:hover {
            transform: none;
            box-shadow: none;
            background: color-mix(in srgb, var(--lv-color-canvas) 50%, transparent);
        }
    }

    // Hero 右侧内嵌本周节奏小面板（填平右侧大片空白，保持首屏紧凑呼吸感）
    .lv-hero-week {
        flex: 0 0 min(100%, 356px);
        min-width: 0;
        box-sizing: border-box;
        padding: 12px 14px;
        border-radius: var(--lv-r-m);
        background: color-mix(in srgb, var(--lv-color-surface) 90%, transparent);
        border: 1px solid color-mix(in srgb, var(--lv-color-brand) 14%, var(--lv-border));
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .lv-hero-week-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-2);
        font-size: var(--lv-type-meta-size);
    }
    .lv-hero-week-streak {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: var(--lv-color-text);
        font-weight: var(--lv-fw-medium);
        b {
            font-weight: var(--lv-fw-bold);
            font-variant-numeric: tabular-nums;
            color: var(--lv-color-brand);
        }
    }
    .lv-hero-week-meta {
        color: var(--lv-color-text-muted);
        font-variant-numeric: tabular-nums;
    }

    .lv-today-week-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--lv-sp-2); margin-bottom: calc(var(--lv-space-unit) * 1); }
    .lv-today-week-head h2 { font-size: var(--lv-type-label-size); line-height: 1.5; font-weight: var(--lv-fw-heading); margin: 0; }
    .lv-today-week-range { color: var(--lv-color-text-muted); font-size: var(--lv-type-caption-size); font-variant-numeric: tabular-nums; }

    .lv-today-week-grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 6px;
        margin: 0;
    }
    .lv-today-week-day {
        display: flex;
        min-width: 0;
        align-items: center;
        flex-direction: column;
        gap: 4px;
        padding: 6px 2px;
        border-radius: var(--lv-r-s);
        background: color-mix(in srgb, var(--lv-color-canvas) 65%, var(--lv-color-surface));
        border: 1px solid var(--lv-border);
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-caption-size);
        cursor: default;
        transition: border-color var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease);

        .lv-week-day-label {
            font-size: 11px;
            font-weight: var(--lv-fw-semibold);
            letter-spacing: 0.02em;
        }

        i {
            display: grid;
            width: 22px;
            height: 22px;
            place-items: center;
            border-radius: var(--lv-r-circle);
            background: color-mix(in srgb, var(--lv-color-text) 6%, transparent);
            font-size: 11px;
            font-style: normal;
            transition: transform var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease), border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease), opacity var(--lv-dur-1) var(--lv-ease);
        }

        &.lv-today-week-day-today {
            border-color: var(--lv-color-brand);
            background: color-mix(in srgb, var(--lv-color-brand) 8%, var(--lv-color-surface));
            i {
                background: var(--lv-primary-soft);
                color: var(--lv-color-brand);
                font-weight: var(--lv-fw-bold);
            }
        }

        &.lv-today-week-day-active i {
            background: var(--lv-color-data) !important;
            color: var(--lv-color-on-brand) !important;
            font-weight: var(--lv-fw-bold);
            outline: none !important;
        }

        &.lv-today-week-day-future {
            opacity: 0.55;
        }
    }
    .lv-today-week-summary { display: flex; align-items: center; justify-content: space-between; gap: var(--lv-sp-2); font-size: var(--lv-type-meta-size); color: var(--lv-color-text-muted); }
    .lv-today-week-summary strong { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--lv-color-data); }
    .lv-today-week-summary small { color: var(--lv-color-text-muted); font-size: var(--lv-type-meta-size); font-weight: var(--lv-fw-normal); }
    .lv-today-forecast {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-3);
    }
    .lv-forecast-mobile-badge {
        display: none;
    }
    @media (max-width: 780px) {
        .lv-forecast-mobile-badge {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            width: 100%;
            min-height: 42px;
            padding: 8px 14px;
            border-radius: var(--lv-r-pill);
            background: color-mix(in srgb, var(--lv-color-brand) 7%, var(--lv-color-surface));
            border: 1px solid color-mix(in srgb, var(--lv-color-brand) 18%, transparent);
            color: var(--lv-color-text);
            font-size: var(--lv-type-control-size);
            cursor: pointer;
            touch-action: manipulation;
            box-sizing: border-box;

            &:active {
                transform: scale(0.98);
            }
        }
        .lv-forecast-badge-icon {
            color: var(--lv-color-brand);
            display: grid;
            place-items: center;
        }
        .lv-forecast-badge-text strong {
            color: var(--lv-color-brand);
            font-variant-numeric: tabular-nums;
        }
        .lv-forecast-badge-toggle {
            display: inline-flex;
            align-items: center;
            gap: 2px;
            font-size: var(--lv-type-meta-size);
            color: var(--lv-color-text-muted);
        }
        .lv-forecast-bars-hidden-mobile {
            display: none !important;
        }
        .lv-hero-week {
            display: none;
        }
        .lv-deck-mgmt-btn {
            display: none !important;
        }
    }
    .lv-forecast-title-group {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-1);
    }
    .lv-forecast-head-actions {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
    }
    .lv-forecast-bars-row {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: var(--lv-sp-2);
        height: 110px;
        padding: var(--lv-sp-2) var(--lv-sp-1);
        box-sizing: border-box;
    }
    .lv-forecast-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex: 1;
        height: 100%;
        min-width: 0;
        gap: var(--lv-sp-1);
    }
    .lv-forecast-count {
        font-size: var(--lv-type-caption-size);
        color: var(--lv-color-text-muted);
        font-variant-numeric: tabular-nums;
        line-height: var(--lv-lh-tight, 1);
    }
    .lv-forecast-bar-track {
        flex: 1;
        width: clamp(14px, 3.2vw, 28px);
        background: color-mix(in srgb, var(--lv-color-text) 6%, transparent);
        border-radius: var(--lv-r-pill);
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        overflow: hidden;
    }
    .lv-forecast-bar-fill {
        width: 100%;
        background: var(--lv-color-data);
        border-radius: var(--lv-r-pill);
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        transition: height var(--lv-dur-2) var(--lv-ease);
        overflow: hidden;
    }
    .lv-forecast-seg-review {
        width: 100%;
        background: var(--lv-color-brand);
        border-radius: var(--lv-r-pill);
    }
    .lv-forecast-label {
        font-size: var(--lv-type-caption-size);
        color: var(--lv-color-text-muted);
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
        max-width: 100%;
    }
    .lv-empty-decks-bar {
        display: flex;
        justify-content: center;
        margin-top: var(--lv-sp-2);
    }
    .lv-cards { gap: var(--lv-sp-3); margin-bottom: var(--lv-sp-4); }
    .lv-first-use {
        max-width: 860px;
        margin: calc(var(--lv-space-unit) * 18) auto;
        padding: clamp(calc(var(--lv-space-unit) * 11), 4vw, calc(var(--lv-space-unit) * 21));
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-l);
        background: var(--lv-color-surface);
        text-align: center;
    }
    .lv-first-use h2 { margin: calc(var(--lv-space-unit) * 4) 0; font-size: var(--lv-type-display-size); line-height: var(--lv-lh-body); }
    .lv-first-use > p { max-width: 560px; margin: 0 auto; color: var(--lv-color-text-muted); font-size: var(--lv-type-body-size); line-height: var(--lv-lh-relaxed); }
    .lv-empty-note-card {
        display: flex;
        align-items: flex-start;
        gap: calc(var(--lv-space-unit) * 4);
        max-width: 600px;
        margin: calc(var(--lv-space-unit) * 8) auto 0;
        padding: calc(var(--lv-space-unit) * 4) calc(var(--lv-space-unit) * 6);
        border: 1px solid var(--lv-primary-border);
        border-radius: var(--lv-r-m);
        background: var(--lv-primary-soft);
        text-align: left;
    }
    .lv-empty-note-icon {
        font-size: var(--lv-type-heading-size);
        line-height: 1.2;
        flex-shrink: 0;
    }
    .lv-empty-note-content strong {
        display: block;
        color: var(--lv-color-brand);
        font-size: var(--lv-type-body-size);
        font-weight: var(--lv-fw-semibold);
        margin-bottom: calc(var(--lv-space-unit) * 1);
    }
    .lv-empty-note-content p {
        margin: 0;
        color: var(--lv-color-text);
        font-size: var(--lv-type-control-size);
        line-height: var(--lv-lh-reading);
        opacity: 0.9;
    }
    .lv-first-use-actions { display: flex; justify-content: center; flex-wrap: wrap; gap: var(--lv-sp-2); margin: calc(var(--lv-space-unit) * 11) 0 calc(var(--lv-space-unit) * 13); }
    .lv-first-use-actions button { min-height: 44px; }
    .lv-first-use-actions :global(.lv-btn-primary) {
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--lv-color-brand) 40%, transparent);
        animation: lv-pulse-glow 2.4s infinite cubic-bezier(0.4, 0, 0.6, 1);
    }
    @keyframes lv-pulse-glow {
        0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--lv-color-brand) 40%, transparent); }
        50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--lv-color-brand) 0%, transparent); }
    }
    @media (prefers-reduced-motion: reduce) {
        .lv-first-use-actions :global(.lv-btn-primary) { animation: none; }
    }
    .lv-first-use-steps {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--lv-sp-3);
        text-align: left;
    }
    .lv-first-use-steps > div {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: var(--lv-sp-3);
        padding: calc(var(--lv-space-unit) * 5) calc(var(--lv-space-unit) * 6);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        background: var(--lv-color-surface);
        box-shadow: var(--lv-shadow-1), var(--lv-inset-shine);
        transition: transform var(--lv-dur-2) var(--lv-ease),
            border-color var(--lv-dur-1) var(--lv-ease),
            box-shadow var(--lv-dur-2) var(--lv-ease);

        &:hover {
            transform: translateY(-2px);
            border-color: var(--lv-primary-border);
            box-shadow: var(--lv-shadow-2), var(--lv-inset-shine);
        }
    }
    .lv-first-use-steps span {
        display: grid;
        width: 32px;
        height: 32px;
        flex: none;
        place-items: center;
        border-radius: var(--lv-r-circle);
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
        font-size: var(--lv-type-control-size);
        font-weight: var(--lv-fw-bold);
        border: 1px solid var(--lv-primary-border);
        box-shadow: var(--lv-shadow-1);
    }
    .lv-hero-tags-group {
        display: inline-flex;
        align-items: center;
        gap: var(--lv-sp-2);
        flex-wrap: wrap;
    }
    .lv-dashboard-action-group {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 3);
        flex-wrap: wrap;
    }
    .lv-btn-action {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline));
        font-size: var(--lv-type-control-size);
        border-radius: var(--lv-r-pill);
        padding: calc(var(--lv-space-unit) * 2) calc(var(--lv-space-unit) * 5);
        background: var(--lv-color-surface);
        border: 1px solid var(--lv-border);
        color: var(--lv-color-text-muted);
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        transition: transform var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease), border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease), opacity var(--lv-dur-1) var(--lv-ease);

        &:hover:not(:disabled) {
            color: var(--lv-color-brand);
            border-color: var(--lv-color-brand);
            background: color-mix(in srgb, var(--lv-color-brand) 6%, var(--lv-color-surface));
        }

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
    .lv-hero-budget-pill {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 2);
        height: 26px;
        padding: 0 calc(var(--lv-space-unit) * 4);
        border-radius: var(--lv-r-pill);
        background: color-mix(in srgb, var(--lv-color-text) 5%, transparent);
        border: 1px solid var(--lv-border);
        font-size: var(--lv-type-meta-size);
        color: var(--lv-color-text-muted);
        box-sizing: border-box;

        .lv-hero-budget-label {
            display: inline-flex;
            align-items: center;
            gap: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline));
            white-space: nowrap;
        }
        .lv-hero-budget-select {
            border: none !important;
            outline: none !important;
            background: transparent !important;
            font-size: var(--lv-type-meta-size) !important;
            font-weight: var(--lv-fw-semibold) !important;
            color: var(--lv-color-brand) !important;
            padding: 0 calc(var(--lv-space-unit) * 1) !important;
            height: auto !important;
            min-height: unset !important;
            line-height: normal !important;
            box-shadow: none !important;
            cursor: pointer;

            &:focus-visible {
                outline: 2px solid var(--lv-color-focus, var(--lv-color-brand)) !important;
                outline-offset: 2px !important;
                border-radius: var(--lv-r-xs) !important;
            }
        }
    }
    .lv-first-use-steps p {
        margin: 0;
        color: var(--lv-color-text);
        font-size: var(--lv-type-body-size);
        line-height: var(--lv-lh-reading, 1.65);
        max-width: 48em;
        text-wrap: pretty;
    }
    .lv-refresh-status { margin: 0 0 var(--lv-sp-2); color: var(--lv-color-text-muted); font-size: var(--lv-type-control-size); }
    .lv-today-decks-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr));
        gap: var(--lv-sp-3);
    }
    .lv-deck-cluster {
        grid-column: 1 / -1;
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-2);
    }
    .lv-deck-cluster-head {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: transparent;
        border: none;
        padding: 4px 8px;
        cursor: pointer;
        text-align: left;
        color: var(--lv-color-text);
        border-radius: var(--b3-border-radius);
        width: fit-content;
        &:hover {
            background: color-mix(in srgb, var(--lv-color-brand) 8%, transparent);
            color: var(--lv-color-brand);
        }
    }
    .lv-cluster-arrow {
        display: inline-flex;
        align-items: center;
    }
    .lv-cluster-meta {
        margin-left: 6px;
        font-variant-numeric: tabular-nums;
        color: var(--lv-color-text-muted);
    }
    .lv-deck-cluster-items {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr));
        gap: var(--lv-sp-3);
        padding-left: var(--lv-sp-3);
        border-left: 2px dashed color-mix(in srgb, var(--lv-color-brand) 30%, transparent);
    }
    .lv-today-deck--nested {
        background: color-mix(in srgb, var(--b3-theme-surface) 90%, var(--b3-theme-surface-lighter));
    }

    .lv-today-deck {
        display: flex;
        flex-wrap: wrap;
        min-width: 0;
        min-height: 56px;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-3);
        padding: calc(var(--lv-space-unit) * 4) calc(var(--lv-space-unit) * 6);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-l);
        background: var(--lv-color-surface);
        box-shadow: var(--lv-shadow-1), var(--lv-inset-shine);
        text-align: left;
        cursor: default;
        content-visibility: auto;
        &--pinned {
            border-color: color-mix(in srgb, var(--lv-color-warning) 40%, var(--lv-border));
            .lv-deck-icon-badge {
                color: var(--lv-color-warning);
            }
        }
        contain-intrinsic-size: 0 56px;
        transition: transform var(--lv-dur-2) var(--lv-ease),
            box-shadow var(--lv-dur-2) var(--lv-ease),
            border-color var(--lv-dur-1) var(--lv-ease);

        &:hover {
            transform: translateY(-2px);
            border-color: var(--lv-primary-border);
            box-shadow: var(--lv-shadow-2), var(--lv-inset-shine);
        }

        &.lv-today-deck--has-cards {
            border-color: color-mix(in srgb, var(--lv-color-brand) 18%, var(--lv-border));
            &:hover {
                border-color: var(--lv-primary-border);
                box-shadow: var(--lv-shadow-2), var(--lv-inset-shine);
            }
        }

        .lv-today-deck-main-btn {
            display: flex;
            align-items: center;
            gap: calc(var(--lv-space-unit) * 3);
            min-width: 150px;
            flex: 1 1 180px;
            background: transparent;
            border: none;
            padding: 0;
            cursor: pointer;
            text-align: left;
            color: inherit;
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;

            &:hover .lv-today-deck-name {
                color: var(--lv-color-brand);
            }
            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
                border-radius: var(--lv-r-m);
            }
        }
        .lv-today-deck-name {
            min-width: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: var(--lv-type-body-size);
            font-weight: var(--lv-fw-semibold);
        }
        .lv-today-deck-actions {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: var(--lv-sp-2);
            margin-left: auto;
            flex-shrink: 0;
        }
        .lv-deck-quick-btn {
            border-radius: var(--lv-r-pill);
            padding: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 5);
            font-size: var(--lv-type-meta-size);
            font-weight: var(--lv-fw-semibold);
            color: var(--lv-color-brand);
            border-color: var(--lv-primary-border);
            white-space: nowrap;
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;
            transition: transform var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease), border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease), opacity var(--lv-dur-1) var(--lv-ease);

            &:hover:not(:disabled) {
                background: var(--lv-primary-soft);
                border-color: var(--lv-color-brand);
            }

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }

            &:disabled {
                color: var(--lv-color-text-muted) !important;
                border-color: var(--lv-border) !important;
                background: transparent !important;
                opacity: 0.65;
            }
        }
        .lv-deck-icon-badge {
            width: 32px;
            height: 32px;
            border-radius: var(--lv-r-notice);
            background: color-mix(in srgb, var(--lv-color-brand) 10%, var(--lv-color-surface));
            color: var(--lv-color-brand);
            border: 1px solid color-mix(in srgb, var(--lv-color-brand) 18%, transparent);
            display: grid;
            place-items: center;
            flex-shrink: 0;
            box-shadow: 0 1px 3px color-mix(in srgb, var(--lv-color-brand) 12%, transparent);
        }
        .lv-today-deck-count {
            font-size: var(--lv-type-caption-size);
            color: var(--lv-color-text-muted);
            background: color-mix(in srgb, var(--lv-color-text) 6%, transparent);
            padding: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 4);
            border-radius: var(--lv-r-pill);
            font-variant-numeric: tabular-nums;
            font-weight: var(--lv-fw-medium);
            white-space: nowrap;
        }
    }
    .lv-today-deck:focus-visible { outline: 2px solid var(--lv-color-brand); outline-offset: 2px; }

    @container lv-hub (max-width: 840px) {
        :global(.lv-hero) {
            flex-direction: column;
            align-items: stretch;
        }
        .lv-hero-week {
            flex: 1 1 auto;
            width: 100%;
        }
    }
    @container lv-hub (max-width: 780px) {
        .lv-today-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .lv-today-stats .lv-stat-cell:nth-child(2n) { border-right: none; }
        .lv-today-stats .lv-stat-cell:nth-child(-n+2) { border-bottom: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent); }
    }
    .lv-today-decks-head-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--lv-sp-1);
        align-items: center;
    }

    @container lv-hub (max-width: 560px) {
        .lv-first-use-steps { grid-template-columns: 1fr; }
        .lv-today-week-head {
            flex-wrap: wrap;
            gap: var(--lv-sp-2);
        }
        .lv-today-deck {
            padding: var(--lv-sp-2) var(--lv-sp-3);
            gap: var(--lv-sp-2);

            .lv-today-deck-main-btn {
                min-width: 0;
                flex: 1 1 130px;
            }
            .lv-today-deck-actions {
                gap: var(--lv-sp-1);
                margin-left: 0;
                width: 100%;
                justify-content: flex-end;
            }
        }
    }

    .lv-todo-quiet {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-2);
        padding: 10px 14px;
        margin: var(--lv-sp-3) 0 var(--lv-sp-4);
        background: color-mix(in srgb, var(--lv-color-text) 3%, var(--lv-color-surface));
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-control-size);

        .lv-todo-quiet-left {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            color: var(--lv-color-text);
        }
    }
    .lv-deep-toggle-wrap {
        display: flex;
        justify-content: center;
        margin: var(--lv-sp-3) 0 var(--lv-sp-4);
    }
    .lv-deep-toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 18px;
        border-radius: var(--lv-r-pill);
        font-size: var(--lv-type-control-size);
        background: var(--lv-color-surface);
        border: 1px solid var(--lv-border);
        box-shadow: var(--lv-shadow-1);
        color: var(--lv-color-text-muted);
        cursor: pointer;
        transition: transform var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease), border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease), opacity var(--lv-dur-1) var(--lv-ease);

        &:hover {
            color: var(--lv-color-brand);
            border-color: var(--lv-color-brand);
            background: color-mix(in srgb, var(--lv-color-brand) 6%, var(--lv-color-surface));
        }
    }
    .lv-deep-report-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-2);
        flex-wrap: wrap;
        margin: 0 0 var(--lv-sp-3);
    }

    /* T08 待处理行（docs/40 批 5）：行式布局 + 右侧动作 */
    .lv-todo-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-2);
        font-size: var(--lv-type-body-size);
        /* R52 .row：16px 行距 + 发丝分隔线（末行无线） */
        padding: var(--lv-sp-4) 0;
        border-bottom: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent);
    }
    .lv-todo-row:last-child { border-bottom: none; }
    .lv-todo-error { margin-top: var(--lv-sp-2); }
    .lv-unfinished-ai {
        display: block;
        width: 100%;
        text-align: left;
        font-size: var(--lv-type-control-size);
        color: var(--lv-color-text-muted);
        border: 1px dashed var(--lv-primary-border, var(--lv-color-brand));
        border-radius: var(--lv-r-m);
        padding: var(--lv-sp-2) var(--lv-sp-3);
        margin-bottom: var(--lv-sp-3);
        cursor: pointer;
        &:hover { background: var(--lv-primary-softer, transparent); }
    }
    .lv-loading {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-3);
        .lv-sk-hero { height: 172px; border-radius: var(--lv-r-l); }
        .lv-sk-tiles { display: flex; gap: var(--lv-sp-3); }
        .lv-sk-tile { flex: 1; height: 96px; border-radius: var(--lv-r-m); }
        @container lv-hub (max-width: 740px) {
            .lv-sk-tiles { flex-wrap: wrap; }
            .lv-sk-tile { flex: 1 1 40%; }
        }
    }
    @container lv-hub (max-width: 620px) {
        .lv-first-use { margin: var(--lv-sp-3) 0; }
        .lv-first-use-steps { grid-template-columns: 1fr; gap: 0; }
        .lv-first-use-steps > div { padding: var(--lv-sp-2) 0; }
    }

    .lv-ret {
        .lv-ret-row {
            display: flex; justify-content: space-between; align-items: center;
            padding: var(--lv-sp-2) 0;
            border-bottom: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent);
            font-size: var(--lv-type-body-size);
        }
        .lv-ret-row:last-child { border-bottom: none; }
        .lv-ret-rate { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--lv-color-data); }
    }

    .lv-cal-selected-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-3);
        margin-top: var(--lv-sp-3);
        padding: 10px 14px;
        background: var(--b3-theme-surface-lighter);
        border: 1px solid var(--b3-border-color);
        border-radius: var(--b3-border-radius);
        flex-wrap: wrap;
    }
    .lv-cal-selected-meta {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-3);
        flex-wrap: wrap;
    }
    .lv-cal-selected-date {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--b3-theme-primary);
    }
    .lv-cal-selected-stat {
        font-size: var(--lv-type-smaller-size);
        color: var(--lv-color-text-muted);
    }
    .lv-cal-selected-actions {
        display: inline-flex;
        align-items: center;
        gap: var(--lv-sp-2);
        flex-shrink: 0;
    }

    @media (max-width: 780px) {
        .lv-today-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .lv-today-stats .lv-stat-cell:nth-child(2n) { border-right: none; }
        .lv-today-stats .lv-stat-cell:nth-child(-n+2) { border-bottom: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent); }
    }
    @media (max-width: 680px) {
        .lv-first-use {
            padding: var(--lv-sp-4) var(--lv-sp-3) !important;
            margin-top: var(--lv-sp-2) !important;
        }
        .lv-first-use > .lv-eyebrow,
        .lv-first-use .lv-empty-note-card,
        .lv-first-use .lv-first-use-steps,
        .lv-first-use .lv-first-use-tour-btn {
            display: none !important;
        }
        .lv-first-use-actions {
            margin: var(--lv-sp-3) 0 0 !important;
            flex-direction: column;
            align-items: stretch;
        }
        .lv-first-use-actions button {
            width: 100%;
            justify-content: center;
        }
    }
    @media (max-width: 560px) {
        .lv-first-use-steps { grid-template-columns: 1fr; }
        .lv-today-week-head {
            flex-wrap: wrap;
            gap: var(--lv-sp-2);
        }
        .lv-today-deck {
            padding: var(--lv-sp-2) var(--lv-sp-3);
            gap: var(--lv-sp-2);

            .lv-today-deck-main-btn {
                min-width: 0;
                flex: 1 1 130px;
            }
            .lv-today-deck-actions {
                gap: var(--lv-sp-1);
                margin-left: 0;
                width: 100%;
                justify-content: flex-end;
            }
        }
    }

    .lv-airow {
        align-items: center;
        flex-wrap: wrap;
        gap: var(--lv-sp-2);
        padding: var(--lv-sp-2) 0;
        border-bottom: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent);
        &:last-child { border-bottom: none; }
    }

    .lv-curve {
        display: block;
        width: 100%;
        max-width: 480px;
        height: auto;
        overflow: hidden;
        .lv-curve-axis { stroke: var(--lv-border-strong); stroke-width: 1.5; }
        .lv-curve-dot {
            fill: var(--lv-color-data);
            stroke: var(--lv-color-surface);
            stroke-width: 2px;
            transition: transform var(--lv-dur-1) var(--lv-ease), r var(--lv-dur-1) var(--lv-ease);
            cursor: pointer;
            &:hover {
                r: 5.5;
                filter: drop-shadow(0 2px 6px color-mix(in srgb, var(--lv-color-data) 40%, transparent));
            }
        }
    }
</style>
