<script lang="ts">
    import { onMount } from "svelte";
    import { openTab } from "siyuan";
    import { getRiffCards, getRiffDecks, type RiffDeck } from "@/api/riff";
    import { dueCache } from "@/api/due-shared";
    import { friendlyError } from "@/api/errors";
    import { sqlQuery } from "@/api/siyuan";
    import { showMessage } from "@/libs/notice";
    import {
        calcStreak,
        coverageStats,
        computeRetention,
        computeRetentionCurve,
        lastNDays,
        localDate,
        reviewStatsFor,
        studySecondsOn,
        type CoverageStats,
        type CurvePoint,
        type RetentionResult,
        type RevlogData,
    } from "@/core/revlog";
    import {
        buildForecast,
        buildMonthGrid,
        dueMapFromForecast,
        get7DayForecast,
        smoothForecastLoad,
        type CalendarCell,
        type ForecastCardInput,
        type ForecastDay,
        type ForecastResult,
    } from "@/core/forecast";
    import { computeCurveSvgPaths, renderDashboardReportMarkdown } from "@/core/report-writer";
    import type { DashboardCtx } from "./dashboard.svelte";
    import LvPage from "./kit/LvPage.svelte";
    import LvSection from "./kit/LvSection.svelte";
    import LvHeatmap from "./kit/LvHeatmap.svelte";
    import LvCalendar from "./kit/LvCalendar.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import LvError from "./kit/LvError.svelte";
    import LvIcon from "./kit/LvIcon.svelte";

    type StatsFilter = "all" | "activity" | "forecast" | "retention";

    let { ctx }: { ctx: DashboardCtx } = $props();
    const t = $derived(ctx.i18n);
    const sp = $derived(t.statsPage ?? {});

    let filter = $state<StatsFilter>("all");
    const filterTabs = $derived<{ id: StatsFilter; label: string }[]>([
        { id: "all", label: sp.filterAll ?? "全部视图" },
        { id: "activity", label: sp.filterActivity ?? "热力与日历" },
        { id: "forecast", label: sp.filterForecast ?? "到期预报" },
        { id: "retention", label: sp.filterRetention ?? "记忆与难点" },
    ]);

    function onFilterTabKeydown(e: KeyboardEvent, idx: number) {
        const count = filterTabs.length;
        if (count === 0) return;
        let next: number | null = null;
        if (e.key === "ArrowRight") next = (idx + 1) % count;
        else if (e.key === "ArrowLeft") next = (idx - 1 + count) % count;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = count - 1;
        if (next === null) return;
        e.preventDefault();
        filter = filterTabs[next].id;
        const tablist = (e.currentTarget as HTMLElement | null)?.closest('[role="tablist"]');
        tablist?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
    }
    let loading = $state(true);
    let hasLoadedSnapshot = $state(false);
    let errorMsg = $state("");

    // 基础统计状态
    let revlog = $state<RevlogData>({ version: 1, entries: [], days: {} });
    let decks = $state<RiffDeck[]>([]);
    let totalCards = $state(0);
    let streak = $state(0);
    let totalReviews = $state(0);
    let activeDaysCount = $state(0);
    let todayReview = $state(0);
    let todayStudyMinutes = $state(0);
    let coverage = $state<CoverageStats | null>(null);
    let targets = $state({ new: 0, review: 0 });
    let revlogNote = $state("");

    // 热力图跨度（默认展示全年 52 周以铺满宽屏卡片，消除左上角缩团空洞）
    // svelte-ignore state_referenced_locally -- initial span derived once from host setting
    let spanWeeks = $state<number>(ctx.getHeatmapWeeks?.() >= 26 ? ctx.getHeatmapWeeks() : 52);
    const heat = $derived(lastNDays(revlog, Math.max(4, spanWeeks) * 7));

    // 保持率与曲线
    let retention = $state<RetentionResult | null>(null);
    let curve = $state<CurvePoint[]>([]);
    let curveEl: SVGSVGElement | null = $state(null);
    let aiQuality = $state<{ date: string; cards: number; reviews: number; rate: number | null }[]>([]);
    let leech = $state<{ blockID: string; lapses: number }[]>([]);
    let leechSummaries = $state<Record<string, string>>({});
    let errStats = $state<{ reason: string; count: number }[] | null>(null);

    // 日历与 7/14 日预测
    const SMOOTH_LOAD_STORAGE_KEY = "lv-cards-smooth-forecast";
    function readPersistedSmoothLoad(): boolean {
        try {
            return typeof localStorage !== "undefined" && localStorage.getItem(SMOOTH_LOAD_STORAGE_KEY) === "1";
        } catch {
            return false;
        }
    }
    let calForecast = $state<ForecastResult | null>(null);
    let calCells = $state<CalendarCell[]>([]);
    let calLoading = $state(false);
    let calLoadedOnce = $state(false);
    let calError = $state("");
    let calSelectedDate = $state<string | null>(null);
    let calSeq = 0;

    let forecastRawCards = $state<ForecastCardInput[]>([]);
    let smoothLoadEnabled = $state(readPersistedSmoothLoad());
    let dueSummary = $state<{ dueCount: number; newCount: number; oldCount: number } | null>(null);
    let forecast7Days = $state<ForecastDay[]>([]);
    let forecast7Max = $state(1);
    let forecast7Total = $state(0);

    let writeBusy = $state(false);
    let writeError = $state("");

    const overallRetentionPct = $derived.by(() => {
        if (!retention) return null;
        const tiers = [retention.new, retention.young, retention.mature];
        let weightedSum = 0;
        let weightTotal = 0;
        for (const tier of tiers) {
            if (tier.rate !== null && tier.reviews > 0) {
                weightedSum += tier.rate * tier.reviews;
                weightTotal += tier.reviews;
            }
        }
        if (weightTotal === 0) return null;
        return Math.round((weightedSum / weightTotal) * 100);
    });

    function heroDateText(): string {
        const d = new Date();
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
    }

    function formatLeechSummary(raw: string): string {
        const cleaned = raw
            .replace(/==([^=]+)==/g, "$1")
            .replace(/[#*`>~[\]()]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        if (!cleaned) return "";
        return cleaned.length > 30 ? `${cleaned.slice(0, 30)}…` : cleaned;
    }

    function openLeechBlock(blockID: string) {
        try {
            if (ctx.openDoc) {
                ctx.openDoc(blockID, true);
            } else {
                openTab({ app: ctx.app, doc: { id: blockID, zoomIn: true } });
            }
        } catch (e: unknown) {
            showMessage(friendlyError(e, t), 2500, "error");
        }
    }

    const CURVE_SVG_OPTS = { xMin: 32, xSpan: 276, yBase: 90, yAmp: 78 };

    function curvePoints(pts: CurvePoint[]): string {
        return computeCurveSvgPaths(pts, CURVE_SVG_OPTS).empirical;
    }

    function theoryPoints(pts: CurvePoint[]): string {
        return computeCurveSvgPaths(pts, CURVE_SVG_OPTS).theoretical;
    }

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
        const bg = getComputedStyle(document.body).getPropertyValue("--b3-theme-surface").trim()
            || getComputedStyle(document.documentElement).getPropertyValue("--lv-color-surface").trim()
            || "rgb(255, 255, 255)";
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

    function buildReportMd(): string {
        const todayForecast = forecast7Days[0];
        const fallbackNew = todayForecast?.news ?? 0;
        const fallbackOld = todayForecast?.reviews ?? 0;
        const dueCount = dueSummary ? dueSummary.dueCount : (fallbackNew + fallbackOld);
        const newCount = dueSummary ? dueSummary.newCount : fallbackNew;
        const oldCount = dueSummary ? dueSummary.oldCount : fallbackOld;
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

    async function writeDocReport() {
        if (writeBusy) return;
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

    function update7DayForecast(baseNow = new Date()) {
        const f7 = get7DayForecast(forecastRawCards, { today: baseNow, dailyNewTarget: targets.new, smooth: smoothLoadEnabled });
        forecast7Days = f7.days;
        forecast7Max = f7.maxCount;
        forecast7Total = f7.totalDue;
        const reviewsByDate = new Map(Object.entries(revlog.days).map(([date, s]) => [date, (s.new ?? 0) + (s.review ?? 0)]));
        if (forecastRawCards.length > 0) {
            const rawCal = buildForecast(forecastRawCards, { today: baseNow, horizonDays: 14, dailyNewTarget: targets.new });
            const calDays = smoothLoadEnabled ? smoothForecastLoad(rawCal.days) : rawCal.days;
            calForecast = { ...rawCal, days: calDays };
            calCells = buildMonthGrid(baseNow.getFullYear(), baseNow.getMonth() + 1, baseNow, reviewsByDate, dueMapFromForecast(calDays));
        } else {
            calCells = buildMonthGrid(baseNow.getFullYear(), baseNow.getMonth() + 1, baseNow, reviewsByDate, new Map());
        }
    }

    function toggleSmoothLoad() {
        smoothLoadEnabled = !smoothLoadEnabled;
        try {
            if (typeof localStorage !== "undefined") {
                localStorage.setItem(SMOOTH_LOAD_STORAGE_KEY, smoothLoadEnabled ? "1" : "0");
            }
        } catch {
            /* ignore */
        }
        update7DayForecast();
    }

    function selectCalendarDate(date: string) {
        calSelectedDate = date;
    }

    const calSelectedSummary = $derived.by(() => {
        if (!calSelectedDate) return "";
        const local = revlog.days[calSelectedDate];
        const forecast = calForecast?.days.find(item => item.date === calSelectedDate);
        return t.dashboard.calSelected
            .replace("${date}", calSelectedDate)
            .replace("${review}", String(local?.review ?? 0))
            .replace("${new}", String(local?.new ?? 0))
            .replace("${due}", String((forecast?.reviews ?? 0) + (forecast?.news ?? 0)));
    });

    async function loadForecast() {
        if (calLoading) return;
        const seq = ++calSeq;
        calLoading = true;
        calError = "";
        try {
            const now = new Date();
            const cards: ForecastCardInput[] = [];
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
            calLoadedOnce = true;
        } catch (e) {
            if (seq === calSeq) {
                calError = friendlyError(e, t);
                update7DayForecast(new Date());
            }
        } finally {
            if (seq === calSeq) calLoading = false;
        }
    }

    let refreshSeq = 0;
    let reviewedTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleRefresh() {
        if (reviewedTimer) clearTimeout(reviewedTimer);
        reviewedTimer = setTimeout(() => {
            reviewedTimer = null;
            void refresh();
        }, 800);
    }

    async function refresh() {
        const seq = ++refreshSeq;
        loading = true;
        errorMsg = "";
        try {
            const [deckList, cardsIndex, dueRes] = await Promise.all([
                getRiffDecks(),
                getRiffCards("", 1, 1),
                dueCache?.get?.("")?.catch(() => null) ?? Promise.resolve(null),
            ]);
            if (seq !== refreshSeq) return;
            if (dueRes && typeof dueRes.unreviewedCount === "number") {
                const dc = dueRes.unreviewedCount ?? 0;
                const nc = dueRes.unreviewedNewCardCount ?? 0;
                const oc = dueRes.unreviewedOldCardCount ?? Math.max(0, dc - nc);
                dueSummary = { dueCount: dc, newCount: nc, oldCount: oc };
            }

            decks = deckList.filter(d => (d.size ?? 0) > 0);
            totalCards = (typeof cardsIndex?.total === "number" && cardsIndex.total > 0)
                ? cardsIndex.total
                : (deckList.reduce((acc, d) => acc + (d.size ?? 0), 0) || (cardsIndex?.total ?? 0));

            const nextRevlog = ctx.getRevlog();
            revlog = nextRevlog;
            targets = ctx.getDailyTargets();
            streak = calcStreak(nextRevlog);

            const dayEntries = Object.values(nextRevlog.days ?? {});
            totalReviews = dayEntries.reduce((acc, d) => acc + (d?.new ?? 0) + (d?.review ?? 0), 0);
            activeDaysCount = dayEntries.filter(d => ((d?.new ?? 0) + (d?.review ?? 0)) > 0).length;

            const todayKey = localDate(Date.now());
            const todayStat = nextRevlog.days[todayKey];
            todayReview = (todayStat?.new ?? 0) + (todayStat?.review ?? 0);
            todayStudyMinutes = Math.round(studySecondsOn(nextRevlog, todayKey) / 60);
            coverage = coverageStats(nextRevlog, totalCards || undefined);
            errStats = ctx.getErrorReasonStats?.() ?? null;
            const first = nextRevlog.entries[0]?.ts;
            revlogNote = first ? new Date(first).toLocaleDateString() : "";

            retention = computeRetention(nextRevlog);
            curve = computeRetentionCurve(nextRevlog);
            aiQuality = ctx
                .getAIBatches()
                .filter(b => b.blockIDs.length > 0)
                .slice(-5)
                .reverse()
                .map(b => {
                    const stat = reviewStatsFor(nextRevlog, b.blockIDs);
                    return { date: b.date, cards: b.blockIDs.length, reviews: stat.reviews, rate: stat.rate };
                });

            leech = ctx.getLeechCards().slice(0, 8);
            if (leech.length > 0) {
                const ids = leech.map(l => `'${String(l.blockID).replace(/'/g, "''")}'`).join(",");
                void sqlQuery(`SELECT id, content, markdown FROM blocks WHERE id IN (${ids}) LIMIT 10`)
                    .then((rows: any) => {
                        if (seq !== refreshSeq) return;
                        if (!Array.isArray(rows)) {
                            leechSummaries = {};
                            return;
                        }
                        const next: Record<string, string> = {};
                        for (const r of rows) {
                            const id = String(r?.id ?? "");
                            const sum = formatLeechSummary(String(r?.content || r?.markdown || ""));
                            if (id && sum) next[id] = sum;
                        }
                        leechSummaries = next;
                    })
                    .catch(() => {
                        if (seq === refreshSeq) leechSummaries = {};
                    });
            } else {
                leechSummaries = {};
            }

            update7DayForecast(new Date());
            hasLoadedSnapshot = true;
            loading = false;
            void loadForecast();
        } catch (e: unknown) {
            if (seq === refreshSeq) {
                errorMsg = friendlyError(e, t);
            }
        } finally {
            if (seq === refreshSeq) loading = false;
        }
    }

    onMount(() => {
        void refresh();
        const offFinished = ctx.onSessionFinished?.(() => void refresh());
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
        };
    });
</script>

<LvPage
    pageId="lv-stats-page"
    eyebrow={`${sp.eyebrow ?? "学习统计"} · ${heroDateText()}`}
    title={sp.title ?? t.hubPrimaryStats ?? "统计分析"}
    subtitle={sp.subtitle ?? "复习热力、到期预测与记忆保持率，全视角掌握学习节奏。"}
>
    {#snippet actions()}
        <div class="lv-stats-actions">
            <button
                type="button"
                class="b3-button b3-button--small b3-button--outline lv-btn-action"
                data-testid="stats-refresh-btn"
                disabled={loading}
                onclick={refresh}
            >
                <LvIcon name="refresh" size={13} />
                <span>{loading ? t.dashboard.loading : t.dashboard.refresh}</span>
            </button>
            <button
                type="button"
                class="b3-button b3-button--small b3-button--outline lv-btn-action"
                disabled={loading && !hasLoadedSnapshot}
                onclick={downloadReport}
            >
                <LvIcon name="book" size={13} />
                <span>{t.dashboard.report}</span>
            </button>
            <button
                type="button"
                class="b3-button b3-button--small b3-button--outline lv-btn-action"
                disabled={writeBusy || (loading && !hasLoadedSnapshot)}
                title={writeError || undefined}
                onclick={writeDocReport}
            >
                <LvIcon name="edit" size={13} />
                <span>{writeBusy ? "…" : t.dashboard.writeDoc}</span>
            </button>
        </div>
    {/snippet}

    <div class="lv-stats-page">
        {#if writeError}
            <div class="lv-stats-alert" role="alert" aria-live="assertive">{writeError}</div>
        {/if}
        {#if errorMsg && !hasLoadedSnapshot}
            <LvError message={errorMsg} onretry={refresh} retryLabel={t.dashboard.refresh} />
        {:else}
            {#if errorMsg}
                <LvError message={errorMsg} onretry={refresh} retryLabel={t.dashboard.refresh} />
            {/if}

            <!-- 顶部概览条：雾靛克制 4 指标卡 + 分段子视图过滤 -->
            <div class="lv-stats-overview" role="region" aria-label="统计概览指标">
                <div class="lv-stats-kpi">
                    <span class="lv-stats-kpi-label">{t.dashboard.streak ?? "连续学习"}</span>
                    <div class="lv-stats-kpi-value">
                        <strong>{streak}</strong>
                        <small>{sp.streakUnit ?? "天"}</small>
                    </div>
                    <span class="lv-stats-kpi-sub">{sp.activeDays ?? "活跃天数"} {activeDaysCount}</span>
                </div>
                <div class="lv-stats-kpi">
                    <span class="lv-stats-kpi-label">{t.dashboard.totalCards ?? "卡片总量"}</span>
                    <div class="lv-stats-kpi-value">
                        <strong>{totalCards}</strong>
                    </div>
                    <span class="lv-stats-kpi-sub">
                        {#if coverage && coverage.coverage !== null}
                            已学 {coverage.seenCards}/{coverage.totalCards} ({Math.round(coverage.coverage * 100)}%)
                        {:else}
                            今日已学 {todayReview}
                        {/if}
                    </span>
                </div>
                <div class="lv-stats-kpi">
                    <span class="lv-stats-kpi-label">{sp.totalReviews ?? "累计正式评分"}</span>
                    <div class="lv-stats-kpi-value lv-stats-kpi-value--indigo">
                        <strong>{totalReviews}</strong>
                    </div>
                    <span class="lv-stats-kpi-sub">
                        {todayStudyMinutes > 0 ? `${t.dashboard.studyTime ?? "今日用时"} ${todayStudyMinutes} 分钟` : (revlogNote ? `记录自 ${revlogNote}` : "本地正式评分记录")}
                    </span>
                </div>
                <div class="lv-stats-kpi">
                    <span class="lv-stats-kpi-label">{sp.retentionOverall ?? "记忆保持率"}</span>
                    <div class="lv-stats-kpi-value lv-stats-kpi-value--indigo">
                        <strong>{overallRetentionPct === null ? "—" : `${overallRetentionPct}%`}</strong>
                    </div>
                    <span class="lv-stats-kpi-sub">
                        {retention?.mature?.reviews ? `成熟卡 ${retention.mature.rate !== null ? Math.round(retention.mature.rate * 100) + "%" : "—"}` : (t.retention.sub ?? "稳定期回忆率")}
                    </span>
                </div>
            </div>

            <div class="lv-stats-toolbar">
                <div class="lv-stats-pills" role="tablist" aria-orientation="horizontal" aria-label="统计分区筛选">
                    {#each filterTabs as item, idx (item.id)}
                        <button
                            type="button"
                            role="tab"
                            aria-selected={filter === item.id}
                            tabindex={filter === item.id ? 0 : -1}
                            class="lv-stats-pill"
                            class:is-active={filter === item.id}
                            onclick={() => (filter = item.id)}
                            onkeydown={(e) => onFilterTabKeydown(e, idx)}
                        >
                            {item.label}
                        </button>
                    {/each}
                </div>
            </div>

            {#if filter === "all" || filter === "activity"}
                <LvSection
                    id="sec-stats-heatmap"
                    title={t.dashboard.heatmap ?? "复习热力图"}
                    sub={revlogNote ? `${t.dashboard.since} ${revlogNote}` : ""}
                >
                    {#snippet actions()}
                        <div class="lv-stats-span-pills" role="group" aria-label="热力图时间跨度">
                            {#each [
                                { w: 17, label: sp.span17w ?? "近 17 周" },
                                { w: 26, label: sp.span26w ?? "近半年" },
                                { w: 52, label: sp.span52w ?? "近一年" },
                            ] as opt (opt.w)}
                                <button
                                    type="button"
                                    class="lv-stats-span-pill"
                                    class:is-active={spanWeeks === opt.w}
                                    aria-pressed={spanWeeks === opt.w}
                                    onclick={() => (spanWeeks = opt.w)}
                                >
                                    {opt.label}
                                </button>
                            {/each}
                        </div>
                    {/snippet}
                    <LvHeatmap days={heat} lessLabel={sp.less ?? "少"} moreLabel={sp.more ?? "多"} />
                </LvSection>
            {/if}

            {#if filter === "all" || filter === "activity" || filter === "forecast"}
                <div class="lv-stats-grid" class:lv-stats-grid--single={filter === "activity" || filter === "forecast"}>
                    {#if filter === "all" || filter === "activity"}
                        <div class="lv-stats-col-main">
                            <LvSection id="sec-stats-calendar" title={t.dashboard.calTitle ?? "学习日历"} sub={t.dashboard.calSub}>
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
                        </div>
                    {/if}

                    <div class="lv-stats-col-side">
                        {#if filter === "all" || filter === "forecast"}
                            <section class="lv-today-forecast lv-card2" aria-labelledby="lv-forecast-title" data-testid="dashboard-7day-forecast">
                                <div class="lv-forecast-head">
                                    <div class="lv-forecast-title-group">
                                        <h2 id="lv-forecast-title">{t.dashboard.forecast7Title ?? "未来 7 日复习负载预报"}</h2>
                                        <span class="lv-forecast-sub">{t.dashboard.forecast7Sub ?? "每日到期量预测与平滑削峰"}</span>
                                    </div>
                                    <button
                                        type="button"
                                        class="lv-smooth-pill"
                                        class:is-active={smoothLoadEnabled}
                                        aria-pressed={smoothLoadEnabled}
                                        title={smoothLoadEnabled ? (t.dashboard.smoothLoadOn ?? "平滑已开启") : (t.dashboard.smoothLoadOff ?? "平滑已关闭")}
                                        onclick={toggleSmoothLoad}
                                        data-testid="dashboard-smooth-toggle-btn"
                                    >
                                        <LvIcon name="swap" size={12} />
                                        <span>{t.dashboard.smoothLoad ?? "负载平滑"}: {smoothLoadEnabled ? (t.dashboard.stateOn ?? "开") : (t.dashboard.stateOff ?? "关")}</span>
                                    </button>
                                </div>
                                {#if calError && filter === "forecast"}
                                    <LvError message={calError} onretry={calLoading ? undefined : loadForecast} retryLabel={t.dashboard.refresh} />
                                {/if}
                                {#if forecast7Days.length > 0}
                                    <div class="lv-forecast-bars-row" role="region" aria-label={t.dashboard.forecast7Title ?? "未来 7 日复习负载预报"}>
                                        {#each forecast7Days as day, idx (day.date)}
                                            {@const totalDay = day.reviews + day.news}
                                            {@const barHeightPct = totalDay === 0 ? 4 : Math.max(10, Math.min(100, Math.round((totalDay / Math.max(1, forecast7Max)) * 100)))}
                                            <div class="lv-forecast-col" title={`${day.date}：复习 ${day.reviews} + 新卡 ${day.news}（共 ${totalDay} 张）`}>
                                                <span class="lv-forecast-count" class:is-active={totalDay > 0}>{totalDay}</span>
                                                <div class="lv-forecast-bar-track">
                                                    <div
                                                        class="lv-forecast-bar-fill"
                                                        class:is-zero={totalDay === 0}
                                                        style={`height: ${barHeightPct}%;`}
                                                    >
                                                        {#if day.reviews > 0}
                                                            <div class="lv-forecast-seg-review" style={`height: ${Math.round((day.reviews / Math.max(1, totalDay)) * 100)}%;`}></div>
                                                        {/if}
                                                    </div>
                                                </div>
                                                <span class="lv-forecast-label">{idx === 0 ? (t.dashboard.todayLabel ?? "今天") : idx === 1 ? (t.dashboard.tomorrowLabel ?? "明天") : day.date.slice(5)}</span>
                                            </div>
                                        {/each}
                                    </div>
                                    <div class="lv-forecast-foot">
                                        <span>{(t.dashboard.forecast7TotalDue ?? "总预计到期 ${n} 张").replace("${n}", String(forecast7Total))}</span>
                                        <div class="lv-forecast-foot-legend">
                                            <span class="lv-forecast-dot lv-forecast-dot--review"></span><span>复习</span>
                                            <span class="lv-forecast-dot lv-forecast-dot--new"></span><span>新卡</span>
                                            {#if smoothLoadEnabled}
                                                <span class="lv-chip2 lv-chip2--primary"><LvIcon name="check" size={11} /> {t.dashboard.smoothLoadBadge ?? "削峰填谷已优化"}</span>
                                            {/if}
                                        </div>
                                    </div>
                                {:else}
                                    <div class="lv-forecast-foot">
                                        <span>{calLoading ? (t.dashboard.loading ?? "计算预测中...") : (t.dashboard.calEmpty ?? "预测窗口内没有到期卡片")}</span>
                                    </div>
                                {/if}
                            </section>
                        {/if}

                        {#if filter === "all"}
                            <LvSection id="sec-stats-curve-inline" title={t.retention.curve ?? "记忆保持曲线（实测）"} sub={t.retention.curveSub}>
                                {#snippet actions()}
                                    {#if curve.length >= 2}
                                        <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" title={t.retention.exportPng} onclick={exportCurvePng}>
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
                                    <div class="lv-curve-wrap">
                                        <svg viewBox="0 0 320 105" class="lv-curve" role="img" aria-label={t.dashboard.retentionCurveTitle ?? "记忆留存曲线"} bind:this={curveEl}>
                                            <defs>
                                                <linearGradient id="lv-indigo-curve-grad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stop-color="var(--lv-heat-4, #697CEB)" stop-opacity="0.22" />
                                                    <stop offset="100%" stop-color="var(--lv-heat-4, #697CEB)" stop-opacity="0.0" />
                                                </linearGradient>
                                            </defs>
                                            <line x1="28" y1="12" x2="312" y2="12" stroke="var(--lv-chart-grid)" stroke-dasharray="3 3" />
                                            <line x1="28" y1="51" x2="312" y2="51" stroke="var(--lv-chart-grid)" stroke-dasharray="3 3" />
                                            <line x1="28" y1="90" x2="312" y2="90" class="lv-curve-axis" />
                                            <text x="2" y="16" class="lv-curve-ylabel">100%</text>
                                            <text x="8" y="55" class="lv-curve-ylabel">50%</text>
                                            <text x="14" y="94" class="lv-curve-ylabel">0%</text>
                                            <polygon points={areaPoints} fill="url(#lv-indigo-curve-grad)" stroke="none" />
                                            <polyline fill="none" stroke="var(--lv-chart-theory, #8B93A7)" stroke-width="1.3" stroke-dasharray="4 3" points={theoryPoints(curve)} />
                                            <polyline fill="none" stroke="var(--lv-heat-4, #697CEB)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" points={pts} />
                                            {#each curve as p (p.days)}
                                                <circle cx={32 + (p.days / Math.max(...curve.map(q => q.days), 1)) * 276} cy={90 - p.rate * 78} r="3.5" class="lv-curve-dot">
                                                    <title>{p.days}天 · {Math.round(p.rate * 100)}% (n={p.n})</title>
                                                </circle>
                                            {/each}
                                        </svg>
                                        <div class="lv-curve-legend">
                                            <span><i class="lv-curve-swatch lv-curve-swatch--emp"></i> 实测保持率</span>
                                            <span><i class="lv-curve-swatch lv-curve-swatch--theory"></i> {t.retention.theory}</span>
                                        </div>
                                    </div>
                                {:else}
                                    <div class="lv-hint">{t.retention.curveNone}</div>
                                {/if}
                                {#if retention}
                                    <div class="lv-ret lv-ret--compact">
                                        {#each [
                                            { label: t.retention.first, tier: retention.new },
                                            { label: t.retention.young, tier: retention.young },
                                            { label: t.retention.mature, tier: retention.mature },
                                        ] as row (row.label)}
                                            <div class="lv-ret-row">
                                                <span class="lv-ret-label">{row.label}</span>
                                                <div class="lv-ret-bar-track" aria-hidden="true">
                                                    <div class="lv-ret-bar-fill" style={`width: ${row.tier.rate === null ? 0 : Math.round(row.tier.rate * 100)}%;`}></div>
                                                </div>
                                                <span class="lv-ret-rate">
                                                    {row.tier.rate === null ? "—" : Math.round(row.tier.rate * 100) + "%"}
                                                    <span class="lv-ret-count">({row.tier.reviews})</span>
                                                </span>
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            </LvSection>
                        {/if}
                    </div>
                </div>
            {/if}

            {#if filter === "retention"}
                <div class="lv-stats-grid">
                    <LvSection id="sec-stats-retention" title={t.retention.title} sub={t.retention.sub}>
                        {#if retention}
                            <div class="lv-ret">
                                {#each [
                                    { label: t.retention.first, tier: retention.new },
                                    { label: t.retention.young, tier: retention.young },
                                    { label: t.retention.mature, tier: retention.mature },
                                ] as row (row.label)}
                                    <div class="lv-ret-row">
                                        <span class="lv-ret-label">{row.label}</span>
                                        <div class="lv-ret-bar-track" aria-hidden="true">
                                            <div class="lv-ret-bar-fill" style={`width: ${row.tier.rate === null ? 0 : Math.round(row.tier.rate * 100)}%;`}></div>
                                        </div>
                                        <span class="lv-ret-rate">
                                            {row.tier.rate === null ? "—" : Math.round(row.tier.rate * 100) + "%"}
                                            <span class="lv-ret-count">({row.tier.reviews})</span>
                                        </span>
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <div class="lv-hint">{t.retention.none}</div>
                        {/if}
                    </LvSection>

                    <LvSection id="sec-stats-curve" title={t.retention.curve} sub={t.retention.curveSub}>
                        {#snippet actions()}
                            {#if curve.length >= 2}
                                <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" title={t.retention.exportPng} onclick={exportCurvePng}>
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
                            <div class="lv-curve-wrap">
                                <svg viewBox="0 0 320 105" class="lv-curve" role="img" aria-label={t.dashboard.retentionCurveTitle ?? "记忆留存曲线"} bind:this={curveEl}>
                                    <defs>
                                        <linearGradient id="lv-indigo-curve-grad-tab" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stop-color="var(--lv-heat-4, #697CEB)" stop-opacity="0.22" />
                                            <stop offset="100%" stop-color="var(--lv-heat-4, #697CEB)" stop-opacity="0.0" />
                                        </linearGradient>
                                    </defs>
                                    <line x1="28" y1="12" x2="312" y2="12" stroke="var(--lv-chart-grid)" stroke-dasharray="3 3" />
                                    <line x1="28" y1="51" x2="312" y2="51" stroke="var(--lv-chart-grid)" stroke-dasharray="3 3" />
                                    <line x1="28" y1="90" x2="312" y2="90" class="lv-curve-axis" />
                                    <text x="2" y="16" class="lv-curve-ylabel">100%</text>
                                    <text x="8" y="55" class="lv-curve-ylabel">50%</text>
                                    <text x="14" y="94" class="lv-curve-ylabel">0%</text>
                                    <polygon points={areaPoints} fill="url(#lv-indigo-curve-grad-tab)" stroke="none" />
                                    <polyline fill="none" stroke="var(--lv-chart-theory, #8B93A7)" stroke-width="1.3" stroke-dasharray="4 3" points={theoryPoints(curve)} />
                                    <polyline fill="none" stroke="var(--lv-heat-4, #697CEB)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" points={pts} />
                                    {#each curve as p (p.days)}
                                        <circle cx={32 + (p.days / Math.max(...curve.map(q => q.days), 1)) * 276} cy={90 - p.rate * 78} r="3.5" class="lv-curve-dot">
                                            <title>{p.days}天 · {Math.round(p.rate * 100)}% (n={p.n})</title>
                                        </circle>
                                    {/each}
                                </svg>
                                <div class="lv-curve-legend">
                                    <span><i class="lv-curve-swatch lv-curve-swatch--emp"></i> 实测保持率</span>
                                    <span><i class="lv-curve-swatch lv-curve-swatch--theory"></i> {t.retention.theory}</span>
                                </div>
                            </div>
                        {:else}
                            <div class="lv-hint">{t.retention.curveNone}</div>
                        {/if}
                    </LvSection>
                </div>
            {/if}

            {#if filter === "all" || filter === "retention"}
                <div class="lv-stats-bottom-grid" class:lv-stats-bottom-grid--single={!errStats || errStats.length === 0}>
                    <LvSection id="sec-stats-leech" title={t.leech.title} sub={t.leech.sub}>
                        {#if leech.length === 0}
                            <div class="lv-hint">{t.leech.none}</div>
                        {:else}
                            {#each leech as l (l.blockID)}
                                {@const summary = leechSummaries[l.blockID] || (t.leech?.untitled ?? "未命名卡片")}
                                <div class="fn__flex lv-airow">
                                    <button
                                        type="button"
                                        class="lv-leech-summary-btn"
                                        title={summary}
                                        onclick={() => openLeechBlock(l.blockID)}
                                    >
                                        {summary}
                                    </button>
                                    <div class="fn__flex-1"></div>
                                    <LvChip tone={l.lapses >= 12 ? "error" : "warn"}>{t.leech.lapses}: {l.lapses}</LvChip>
                                    <button class="b3-button b3-button--small b3-button--outline" onclick={() => ctx.rewriteWithAI(l.blockID)}>{t.leech.rewriteAI}</button>
                                    <button class="b3-button b3-button--small b3-button--outline" onclick={() => openLeechBlock(l.blockID)}>
                                        {t.leech.rewrite}
                                    </button>
                                </div>
                            {/each}
                        {/if}
                    </LvSection>

                    {#if errStats && errStats.length > 0}
                        <LvSection id="sec-stats-errors" title={t.errReasons?.title ?? "Error reasons"} sub={t.errReasons?.sub ?? ""}>
                            <div class="lv-err-grid">
                                {#each errStats as s (s.reason)}
                                    <div class="lv-err-item">
                                        <span class="lv-err-label">{t.errReasons?.[s.reason] ?? s.reason}</span>
                                        <strong class="lv-err-count">{s.count}</strong>
                                    </div>
                                {/each}
                            </div>
                        </LvSection>
                    {/if}
                </div>
            {/if}
        {/if}
    </div>
</LvPage>

<style lang="scss">
    .lv-stats-page {
        font-family: var(--lv-font-sans, Inter, "PingFang SC", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif);
        font-variant-numeric: tabular-nums;
        min-width: 0;
    }
    .lv-stats-actions {
        display: inline-flex;
        align-items: center;
        gap: var(--lv-sp-2);
        flex-wrap: wrap;
    }
    .lv-btn-action {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        white-space: nowrap;
        gap: 5px;
        font-size: var(--lv-type-control-size);
        border-radius: var(--lv-r-pill);
        padding: 4px 12px;
        background: var(--lv-color-surface);
        border: 1px solid var(--lv-border);
        color: var(--lv-color-text-muted);
        cursor: pointer;

        &:hover:not(:disabled) {
            color: var(--lv-indigo-accent-strong, #4F62D6);
            border-color: var(--lv-indigo-accent, #697CEB);
            background: var(--lv-indigo-soft, #EEF0FE);
        }
    }
    .lv-stats-alert {
        border: 1px solid var(--lv-color-danger);
        color: var(--lv-color-danger);
        border-radius: var(--lv-r-m);
        padding: 8px 12px;
        margin-bottom: var(--lv-sp-3);
        font-size: var(--lv-type-body-size);
    }

    /* 顶部 4 指标条 */
    .lv-stats-overview {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        background: var(--lv-color-surface);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-l, 16px);
        box-shadow: var(--lv-shadow-1);
        margin-bottom: var(--lv-sp-4);
        overflow: hidden;
    }
    .lv-stats-kpi {
        padding: 14px 18px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;

        &:not(:last-child) {
            border-right: 1px solid var(--lv-border);
        }
    }
    .lv-stats-kpi-label {
        font-size: 11.5px;
        font-weight: 500;
        color: var(--lv-color-text-muted);
    }
    .lv-stats-kpi-value {
        display: flex;
        align-items: baseline;
        gap: 4px;
        color: var(--lv-color-text);

        strong {
            font-size: 26px;
            line-height: 1.15;
            font-weight: 600;
            letter-spacing: -0.02em;
            font-variant-numeric: tabular-nums;
        }
        small {
            font-size: 12px;
            color: var(--lv-color-text-muted);
            font-weight: 500;
        }
        &.lv-stats-kpi-value--indigo strong {
            color: var(--lv-indigo-accent-strong, #4F62D6);
        }
    }
    .lv-stats-kpi-sub {
        font-size: 11px;
        color: var(--lv-color-text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* 分段子视图工具条 */
    .lv-stats-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-4);
        flex-wrap: wrap;
    }
    .lv-stats-pills {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px;
        border-radius: 999px;
        border: 1px solid var(--lv-border);
        background: var(--lv-heat-0, #F5F6FA);
        max-width: 100%;
        overflow-x: auto;
        scrollbar-width: none;
    }
    .lv-stats-pill {
        border: 1px solid transparent;
        border-radius: 999px;
        background: transparent;
        color: var(--lv-color-text-muted);
        font-family: inherit;
        font-size: 12px;
        font-weight: 500;
        padding: 5px 14px;
        white-space: nowrap;
        cursor: pointer;
        transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease;

        &:hover {
            color: var(--lv-color-text);
        }
        &.is-active {
            background: var(--lv-color-surface);
            color: var(--lv-indigo-accent-strong, #4F62D6);
            border-color: var(--lv-indigo-border, rgba(105, 124, 235, 0.30));
            font-weight: 600;
        }
    }

    .lv-stats-span-pills {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 2px;
        border-radius: 999px;
        background: var(--lv-heat-0, #F5F6FA);
        border: 1px solid var(--lv-border);
    }
    .lv-stats-span-pill {
        border: 1px solid transparent;
        border-radius: 999px;
        background: transparent;
        color: var(--lv-color-text-muted);
        font-family: inherit;
        font-size: 11px;
        font-weight: 500;
        padding: 3px 10px;
        cursor: pointer;

        &.is-active {
            background: var(--lv-color-surface);
            color: var(--lv-indigo-accent-strong, #4F62D6);
            border-color: var(--lv-indigo-border, rgba(105, 124, 235, 0.30));
            font-weight: 600;
        }
    }

    /* 双栏平衡网格 */
    .lv-stats-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
        gap: var(--lv-sp-4);
        align-items: start;
    }
    .lv-stats-grid--single {
        grid-template-columns: minmax(0, 1fr);
    }
    .lv-stats-col-main,
    .lv-stats-col-side {
        min-width: 0;
        display: flex;
        flex-direction: column;
    }
    .lv-stats-bottom-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: var(--lv-sp-4);
        align-items: start;
    }
    .lv-stats-bottom-grid--single {
        grid-template-columns: minmax(0, 1fr);
    }

    /* 7日负载预报（Mist Indigo 扁平柱状） */
    .lv-today-forecast {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: var(--lv-sp-4);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-l, 16px);
        background: var(--lv-color-surface);
        padding: 16px 18px;
        box-shadow: var(--lv-shadow-1);
    }
    .lv-forecast-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
    }
    .lv-forecast-title-group {
        display: flex;
        flex-direction: column;
        gap: 2px;

        h2 {
            margin: 0;
            font-size: 15px;
            font-weight: 600;
            color: var(--lv-color-text);
            line-height: 1.4;
        }
    }
    .lv-forecast-sub {
        font-size: 12px;
        color: var(--lv-color-text-muted);
    }
    .lv-smooth-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 11px;
        border-radius: 999px;
        border: 1px solid var(--lv-border);
        background: var(--lv-heat-0, #F5F6FA);
        color: var(--lv-color-text-muted);
        font-family: inherit;
        font-size: 11.5px;
        font-weight: 500;
        cursor: pointer;

        &.is-active {
            background: var(--lv-indigo-soft, #EEF0FE);
            border-color: var(--lv-indigo-border, rgba(105, 124, 235, 0.30));
            color: var(--lv-indigo-accent-strong, #4F62D6);
            font-weight: 600;
        }
    }
    .lv-forecast-bars-row {
        display: flex;
        align-items: stretch;
        justify-content: space-between;
        gap: 8px;
        height: 120px;
        padding: 4px 2px;
        box-sizing: border-box;
    }
    .lv-forecast-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex: 1;
        height: 100%;
        min-width: 0;
        gap: 5px;
    }
    .lv-forecast-count {
        font-size: 11px;
        color: var(--lv-color-text-muted);
        font-variant-numeric: tabular-nums;
        line-height: 1;

        &.is-active {
            color: var(--lv-color-text);
            font-weight: 600;
        }
    }
    .lv-forecast-bar-track {
        flex: 1;
        width: clamp(14px, 3vw, 24px);
        background: var(--lv-indigo-track, #F2F4FA);
        border-radius: 999px;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        overflow: hidden;
        min-height: 0;
    }
    .lv-forecast-bar-fill {
        width: 100%;
        background: var(--lv-heat-2, #C2CCFA);
        border-radius: 999px;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        transition: height 180ms cubic-bezier(0.16, 1, 0.3, 1);
        overflow: hidden;

        &.is-zero {
            background: var(--lv-heat-0-border, rgba(100, 116, 139, 0.14));
        }
    }
    .lv-forecast-seg-review {
        width: 100%;
        background: var(--lv-heat-4, #697CEB);
        border-radius: 999px;
    }
    .lv-forecast-label {
        font-size: 11px;
        color: var(--lv-color-text-muted);
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
    }
    .lv-forecast-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px;
        font-size: 12px;
        color: var(--lv-color-text-muted);
    }
    .lv-forecast-foot-legend {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
    }
    .lv-forecast-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        display: inline-block;
    }
    .lv-forecast-dot--review { background: var(--lv-heat-4, #697CEB); }
    .lv-forecast-dot--new { background: var(--lv-heat-2, #C2CCFA); }

    /* 日历选中日期操作卡 */
    .lv-cal-selected-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-3);
        margin-top: 12px;
        padding: 10px 14px;
        background: var(--lv-indigo-soft, #EEF0FE);
        border: 1px solid var(--lv-indigo-border, rgba(105, 124, 235, 0.30));
        border-radius: 12px;
        flex-wrap: wrap;
    }
    .lv-cal-selected-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
    }
    .lv-cal-selected-date {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--lv-indigo-accent-strong, #4F62D6);
        font-size: 12.5px;
    }
    .lv-cal-selected-stat {
        font-size: 12px;
        color: var(--lv-color-text-muted);
    }
    .lv-cal-selected-actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
    }

    /* 记忆保持曲线 & 分层保持率 */
    .lv-curve-wrap {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .lv-curve {
        display: block;
        width: 100%;
        height: auto;
        overflow: visible;
    }
    .lv-curve-axis {
        stroke: var(--lv-border-strong);
        stroke-width: 1.25;
    }
    .lv-curve-ylabel {
        font-size: 9px;
        fill: var(--lv-color-text-muted);
        font-family: inherit;
        font-variant-numeric: tabular-nums;
    }
    .lv-curve-dot {
        fill: var(--lv-heat-4, #697CEB);
        stroke: var(--lv-color-surface);
        stroke-width: 2px;
        cursor: pointer;
    }
    .lv-curve-legend {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 14px;
        font-size: 11px;
        color: var(--lv-color-text-muted);

        > span {
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }
    }
    .lv-curve-swatch {
        display: inline-block;
        width: 14px;
        height: 3px;
        border-radius: 2px;
    }
    .lv-curve-swatch--emp {
        background: var(--lv-heat-4, #697CEB);
    }
    .lv-curve-swatch--theory {
        border-top: 2px dashed var(--lv-chart-theory, #8B93A7);
        height: 0;
    }

    .lv-ret {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .lv-ret--compact {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid var(--lv-border);
    }
    .lv-ret-row {
        display: grid;
        grid-template-columns: minmax(80px, auto) 1fr auto;
        align-items: center;
        gap: 12px;
        padding: 6px 0;
        font-size: 12.5px;
    }
    .lv-ret-label {
        color: var(--lv-color-text);
    }
    .lv-ret-bar-track {
        height: 6px;
        border-radius: 999px;
        background: var(--lv-indigo-track, #F2F4FA);
        overflow: hidden;
    }
    .lv-ret-bar-fill {
        height: 100%;
        border-radius: 999px;
        background: var(--lv-heat-4, #697CEB);
        transition: width 220ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .lv-ret-rate {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        color: var(--lv-indigo-accent-strong, #4F62D6);
        text-align: right;
    }
    .lv-ret-count {
        font-size: 11px;
        font-weight: 400;
        color: var(--lv-color-text-muted);
        margin-left: 2px;
    }

    /* 易混淆卡与错因 */
    .lv-airow {
        align-items: center;
        flex-wrap: wrap;
        gap: var(--lv-sp-2);
        padding: 8px 0;
        border-bottom: 1px solid var(--lv-border);
        &:last-child { border-bottom: none; }
    }
    .lv-leech-summary-btn {
        border: none;
        background: transparent;
        padding: 2px 4px;
        margin: 0;
        color: var(--lv-color-text);
        font-family: inherit;
        font-size: 12.5px;
        text-align: left;
        cursor: pointer;
        border-radius: 6px;
        max-width: 60%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;

        &:hover {
            color: var(--lv-indigo-accent-strong, #4F62D6);
            background: var(--lv-indigo-soft, #EEF0FE);
        }
    }
    .lv-err-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 10px;
    }
    .lv-err-item {
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid var(--lv-border);
        background: var(--lv-heat-0, #F5F6FA);
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .lv-err-label {
        font-size: 11.5px;
        color: var(--lv-color-text-muted);
    }
    .lv-err-count {
        font-size: 20px;
        font-weight: 600;
        color: var(--lv-indigo-accent-strong, #4F62D6);
        font-variant-numeric: tabular-nums;
    }
    .lv-hint {
        color: var(--lv-color-text-muted);
        font-size: 12.5px;
    }

    @container lv-hub (max-width: 960px) {
        .lv-stats-grid,
        .lv-stats-bottom-grid {
            grid-template-columns: minmax(0, 1fr);
        }
    }
    @container lv-hub (max-width: 780px) {
        :global(#lv-stats-page .lv-pagehead-main) {
            display: none !important;
        }
        :global(#lv-stats-page .lv-pagehead-actions) {
            width: 100%;
            max-width: none;
            padding-top: 0;
            justify-content: flex-start;
        }
        .lv-stats-overview {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .lv-stats-kpi:nth-child(2n) {
            border-right: none;
        }
        .lv-stats-kpi:nth-child(-n+2) {
            border-bottom: 1px solid var(--lv-border);
        }
        .lv-stats-kpi {
            padding: 12px 14px;
        }
        .lv-stats-kpi-value strong {
            font-size: 22px;
        }
    }
    @media (max-width: 960px) {
        .lv-stats-grid,
        .lv-stats-bottom-grid {
            grid-template-columns: minmax(0, 1fr);
        }
    }
    @media (max-width: 780px) {
        .lv-stats-overview {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .lv-stats-kpi:nth-child(2n) {
            border-right: none;
        }
        .lv-stats-kpi:nth-child(-n+2) {
            border-bottom: 1px solid var(--lv-border);
        }
    }
</style>
