<script lang="ts">
    import LvIcon from "@/ui/kit/LvIcon.svelte";
    import { countUp } from "@/ui/kit/countup";
    import { END_REASONS, type EndReason } from "@/core/session-state";
    import { PURPOSE_PROFILES, type SessionPurpose } from "@/core/session-purpose";

    let {
        t,
        sessionNew = 0,
        sessionReview = 0,
        sessionForget = 0,
        sessionSkip = 0,
        sessionQuizTotal = 0,
        sessionQuizCorrect = 0,
        purpose = "review",
        budgetMin = 0,
        budgetExpired = false,
        remainingDue = null,
        streakMilestone = "",
        dailyTip = "",
        endPicked = null,
        starredCardCount = 0,
        sessionDuration = "",
        targetProgress = "",
        onPickEnd,
        onReturnHome,
        onOpenManager,
        onReviewAgain,
        onCramForgotten,
        onCramStarred,
    }: {
        t: any;
        sessionNew?: number;
        sessionReview?: number;
        sessionForget?: number;
        sessionSkip?: number;
        sessionQuizTotal?: number;
        sessionQuizCorrect?: number;
        purpose?: SessionPurpose;
        budgetMin?: number;
        budgetExpired?: boolean;
        remainingDue?: number | null;
        streakMilestone?: string;
        dailyTip?: string;
        endPicked?: string | null;
        starredCardCount?: number;
        sessionDuration?: string;
        targetProgress?: string;
        onPickEnd: (r: EndReason) => void;
        onReturnHome: () => void;
        onOpenManager: () => void;
        onReviewAgain: () => void;
        onCramForgotten: () => void;
        onCramStarred: () => void;
    } = $props();

    const totalAnswered = $derived(sessionNew + sessionReview + sessionForget);
    const retentionRate = $derived(
        totalAnswered > 0
            ? Math.round(((sessionNew + sessionReview) / totalAnswered) * 100)
            : 0
    );
    const quizAccuracy = $derived(
        sessionQuizTotal > 0
            ? Math.round(sessionQuizCorrect / sessionQuizTotal * 100)
            : 0
    );
</script>

<div class="lv-center lv-done">
    <!-- T07 结果面（R52 results）：单面板 + check 徽 + 大数字统计 + 行式补充 + NEXT 软面板 -->
    <div class="lv-done-panel">
        <div class="lv-done-head">
            <span class="check lv-done-check" aria-hidden="true"><LvIcon name="check" size={24} /></span>
            <div class="lv-done-headtext">
                <div class="lv-done-title">{t.review?.done ?? "今日已完成"}</div>
                <div class="lv-done-sub">
                    {t.review?.doneNew ?? "新学"} {sessionNew} · {t.review?.doneReview ?? "复习"} {sessionReview} · {t.review?.doneForget ?? "遗忘"} {sessionForget} · {t.review?.doneSkip ?? "跳过"} {sessionSkip}
                </div>
            </div>
            {#if totalAnswered > 0}
                <div class="lv-done-retention-bubble" class:lv-ret-high={retentionRate >= 80} class:lv-ret-mid={retentionRate >= 60 && retentionRate < 80}>
                    <LvIcon name="zap" size={13} />
                    <span>{t.review?.doneRetention ?? "留存率"} {retentionRate}%</span>
                </div>
            {/if}
            {#if sessionQuizTotal > 0}
                <div class="lv-done-quiz-bubble" class:lv-quiz-high={quizAccuracy >= 80} class:lv-quiz-mid={quizAccuracy >= 60 && quizAccuracy < 80}>
                    <LvIcon name="check" size={13} />
                    <span>实战命中率 {quizAccuracy}% ({sessionQuizCorrect}/{sessionQuizTotal})</span>
                </div>
            {/if}
        </div>
        <div class="lv-done-stats">
            <div class="lv-done-stat">
                <span class="lv-done-stat-label">{t.review?.doneReview ?? "复习"} · {t.review?.doneNew ?? "新学"}</span>
                <span class="lv-hero-num" use:countUp={totalAnswered}>{totalAnswered}</span>
                <p>{PURPOSE_PROFILES[purpose]?.grading === "informal" ? t.review?.purposeInformal : t.review?.doneConfirm}</p>
            </div>
            <div class="lv-done-stat">
                <span class="lv-done-stat-label">{t.review?.doneSkip ?? "跳过"}</span>
                <span class="lv-hero-num" use:countUp={sessionSkip}>{sessionSkip}</span>
                <p>{t.review?.skipNotRated ?? "不计入评分"}</p>
            </div>
            <div class="lv-done-stat">
                <span class="lv-done-stat-label">{t.review?.sessionTime ?? "用时"}</span>
                <span class="lv-hero-num">{sessionDuration}</span>
                <p>{targetProgress}</p>
            </div>
        </div>
        {#if budgetMin > 0}
            <div class="lv-notice">{budgetExpired ? t.review?.budgetDoneTip : t.review?.budgetOn}</div>
        {/if}
        {#if remainingDue !== null && remainingDue > 0}
            <div class="lv-notice">{(t.review?.remainingDue ?? "还有 ${n} 张待复习").replace("${n}", String(remainingDue))}</div>
        {/if}
        {#if streakMilestone}
            <div class="lv-done-milestone">{streakMilestone}</div>
        {/if}
        {#if dailyTip}
            <div class="lv-done-tip">{dailyTip}</div>
        {/if}
        <!-- BI-8：收工原因收集 -->
        <div class="lv-done-end-box" role="group" aria-label={t.endReason?.title ?? "收工原因"}>
            <span class="lv-done-end-title">{t.endReason?.title ?? "收工原因"}</span>
            <div class="lv-done-end-chips">
                {#each END_REASONS as r (r)}
                    <button
                        type="button"
                        class="lv-chipbtn"
                        class:lv-chipbtn-active={endPicked === r}
                        aria-pressed={endPicked === r}
                        onclick={() => onPickEnd(r)}
                    >
                        {#if endPicked === r}<LvIcon name="check" size={12} />{/if}
                        <span>{t.endReason?.[r] ?? r}</span>
                    </button>
                {/each}
            </div>
        </div>
        {#if sessionSkip > 0 || sessionForget > 0 || starredCardCount > 0}
            <div class="lv-done-next">
                <div class="lv-eyebrow">{t.review?.nextTitle ?? "下一步建议"}</div>
                {#if sessionSkip > 0}
                    <div class="lv-next-row">
                        <span>{(t.review?.nextSkipped ?? "跳过了 ${n} 张卡片").replace("${n}", String(sessionSkip))}</span>
                        <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" onclick={onReturnHome}><LvIcon name="home" size={12} /> <span>{t.review?.nextAct ?? "去处理"}</span></button>
                    </div>
                {/if}
                {#if sessionForget > 0}
                    <div class="lv-next-row" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                        <span>{(t.review?.nextForgotten ?? "遗忘了 ${n} 张卡片").replace("${n}", String(sessionForget))}</span>
                        <button type="button" class="b3-button b3-button--small lv-btn-primary" onclick={onCramForgotten}>
                            <LvIcon name="flame" size={13} /> {t.review?.reinforceMistakes ?? "强化这批遗忘卡"}
                        </button>
                    </div>
                {/if}
                {#if starredCardCount > 0}
                    <div class="lv-next-row" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                        <span>⭐ 本场共星标了 {starredCardCount} 张重点卡片</span>
                        <button type="button" class="b3-button b3-button--small lv-btn-primary" onclick={onCramStarred}>
                            <LvIcon name="star" size={13} /> 立即专项练习星标卡
                        </button>
                    </div>
                {/if}
            </div>
        {/if}
        <div class="fn__flex lv-done-actions" style="justify-content: center; gap: var(--lv-sp-2)">
            <button class="b3-button lv-btn-primary" onclick={onReturnHome}><LvIcon name="home" size={16} /> <span>{t.review?.returnHome ?? "返回闪卡主页"}</span></button>
            <button class="b3-button b3-button--outline lv-btn-tool" onclick={onOpenManager}><LvIcon name="cards" size={14} /> <span>{t.menuManager ?? "卡片管理"}</span></button>
            <button class="b3-button b3-button--outline lv-btn-tool" onclick={onReviewAgain}><LvIcon name="refresh" size={14} /> <span>{t.review?.again ?? "再来一组"}</span></button>
        </div>
    </div>
</div>

<style>
    .lv-center { margin: auto; color: var(--lv-color-text-muted); }
    .lv-done-panel {
        width: min(620px, 100%);
        background: var(--lv-color-surface);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-l);
        box-shadow: var(--lv-shadow-2), var(--lv-inset-shine);
        padding: var(--lv-sp-5);
        text-align: left;
    }
    .lv-done-head {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-3);
        margin-bottom: var(--lv-sp-4);
        flex-wrap: wrap;
    }
    .lv-done-retention-bubble {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 2);
        padding: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 5);
        border-radius: var(--lv-r-pill);
        font-size: var(--lv-type-meta-size);
        font-weight: var(--lv-fw-semibold);
        font-variant-numeric: tabular-nums;
        background: var(--lv-data-soft);
        color: var(--lv-color-on-data-soft);
        border: 1px solid var(--lv-data-border);
    }
    .lv-done-retention-bubble.lv-ret-high {
        background: var(--lv-data-soft);
        color: var(--lv-color-data);
        border-color: var(--lv-data-border);
    }
    .lv-done-retention-bubble.lv-ret-mid {
        background: var(--lv-warn-soft);
        color: var(--lv-color-on-warning-soft);
        border-color: color-mix(in srgb, var(--lv-color-warning) 30%, transparent);
    }
    .lv-done-check {
        width: 32px;
        height: 32px;
        border-radius: var(--lv-r-circle);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: var(--lv-type-title-size);
        flex: none;
        background: var(--lv-good-soft);
        color: var(--lv-color-on-success-soft);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--lv-color-success) 14%, transparent);
    }
    .lv-done-title {
        font-size: var(--lv-type-display-size);
        font-weight: var(--lv-fw-heading);
        letter-spacing: -0.03em;
        line-height: var(--lv-lh-body);
    }
    .lv-done-sub {
        font-size: var(--lv-type-body-size);
        color: var(--lv-color-text-muted);
        font-variant-numeric: tabular-nums;
        margin-top: calc(var(--lv-space-unit) * 1);
    }
    .lv-done-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--lv-sp-4);
        padding: var(--lv-sp-3) 0 var(--lv-sp-2);
        border-top: 1px solid var(--lv-border);
    }
    .lv-done-stat {
        display: flex;
        flex-direction: column;
        gap: calc(var(--lv-space-unit) * 1);
        min-width: 0;
    }
    .lv-done-stat .lv-done-stat-label {
        font-size: var(--lv-type-meta-size);
        color: var(--lv-color-text-muted);
        letter-spacing: 0.02em;
    }
    .lv-done-stat .lv-hero-num {
        font-size: var(--lv-type-display-hero);
        line-height: var(--lv-type-display-hero-line);
        font-weight: var(--lv-fw-semibold);
        font-variant-numeric: tabular-nums;
        color: var(--lv-color-text);
        letter-spacing: -0.03em;
        margin: calc(var(--lv-space-unit) * 1) 0;
    }
    .lv-done-stat:first-child .lv-hero-num {
        color: var(--lv-color-data);
    }
    .lv-done-stat p {
        margin: 0;
        font-size: var(--lv-type-meta-size);
        color: var(--lv-color-text-muted);
        opacity: .85;
    }
    .lv-done-milestone {
        color: var(--lv-color-warning);
        font-weight: var(--lv-fw-semibold);
        font-size: var(--lv-type-body-size);
    }
    .lv-done-tip {
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-control-size);
        opacity: 0.85;
        line-height: var(--lv-lh-reading);
    }
    .lv-done-end-box {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);
        align-items: center;
        margin-top: var(--lv-sp-3);
        padding: var(--lv-sp-3);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        background: color-mix(in srgb, var(--lv-color-text) 3%, transparent);
    }
    .lv-done-actions {
        gap: var(--lv-sp-2);
        justify-content: flex-end;
        margin-top: var(--lv-sp-4);
        padding-top: var(--lv-sp-4);
        border-top: 1px solid var(--lv-border);
    }
    .lv-done-next {
        margin-top: var(--lv-sp-4);
        padding: var(--lv-sp-3) var(--lv-sp-4);
        background: var(--lv-surface-hover);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        text-align: left;
    }
    .lv-next-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-2);
        font-size: var(--lv-type-body-size);
        padding: calc(var(--lv-space-unit) * 2) 0;
    }
    .lv-done {
        animation: lv-done-fade var(--lv-dur-3) var(--lv-ease) both;
    }
    @keyframes lv-done-fade {
        from { opacity: 0; transform: translateY(4px); }
    }
</style>
