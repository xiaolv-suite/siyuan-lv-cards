<script lang="ts">
    import LvIcon from "../kit/LvIcon.svelte";
    import { isSuperBlockHtml, isAttrQaCard, resolveAttrQaSubtype } from "@/core/card-face";
    import { isSequenceCard } from "@/core/sequence-card";
    import { hasDelimitedQa } from "@/core/delimited-qa";
    import { DEFAULT_LEECH_THRESHOLD } from "@/core/revlog";

    interface Props {
        headScopeLabel?: string;
        entryCtx?: any;
        cramActive?: boolean;
        budgetMin?: number;
        budgetExpired?: boolean;
        budgetClockText?: string;
        current?: any;
        showAnswer?: boolean;
        timeoutMode?: string;
        timeoutLeft?: number;
        timeoutText?: string;
        hideMetaUntilAnswer?: boolean;
        occl?: any;
        cardHtml?: string;
        cardMemo?: string;
        isCustomPluginAnswer?: boolean;
        customRiffTitle?: string;
        customRiffAnswer?: string;
        cardAttrs?: Record<string, string> | null;
        interactiveQuiz?: any;
        leechThreshold?: number;
        isMarkedIssue?: boolean;
        currentProgress?: number;
        reviewedCount?: number;
        totalCount?: number;
        sessionForget?: number;
        showReturnHome?: boolean;
        t: any;
        onOpenDashboard?: () => void;
        onReturnToEntry?: (point: any) => void;
        onDismissEntry?: (entryKind: string, sourceID: string) => void;
    }

    let {
        headScopeLabel = "",
        entryCtx = null,
        cramActive = false,
        budgetMin = 0,
        budgetExpired = false,
        budgetClockText = "",
        current = null,
        showAnswer = false,
        timeoutMode = "off",
        timeoutLeft = 0,
        timeoutText = "",
        hideMetaUntilAnswer = false,
        occl = null,
        cardHtml = "",
        cardMemo = "",
        isCustomPluginAnswer = false,
        customRiffTitle = "",
        customRiffAnswer = "",
        cardAttrs = null,
        interactiveQuiz = null,
        leechThreshold = DEFAULT_LEECH_THRESHOLD,
        isMarkedIssue = false,
        currentProgress = 1,
        reviewedCount = 0,
        totalCount = 1,
        sessionForget = 0,
        showReturnHome = true,
        t,
        onOpenDashboard = () => {},
        onReturnToEntry = () => {},
        onDismissEntry = () => {},
    }: Props = $props();

    let forgetWidth = $derived(`${(Math.max(0, sessionForget) / Math.max(1, totalCount)) * 100}%`);
    let passWidth = $derived(`${(Math.max(0, reviewedCount - sessionForget) / Math.max(1, totalCount)) * 100}%`);
</script>

<div class="lv-head-row" data-testid="review-head-row" data-prevent-swipe="true">
    <div class="lv-head-left" style="align-items: center; gap: var(--lv-sp-2); display: flex;">
        <span class="lv-eyebrow">{t?.review?.panelTitle ?? "复习"} · {headScopeLabel}</span>
        {#if showReturnHome}
            <button
                type="button"
                class="b3-button b3-button--small lv-btn-ghost lv-review-return-home"
                title={t?.review?.returnHome ?? "返回闪卡主页"}
                onclick={onOpenDashboard}
                data-testid="review-return-home-btn"
            >
                <LvIcon name="home" size={15} /> {t?.review?.returnHome ?? "返回主页"}
            </button>
        {/if}
    </div>
    {#if entryCtx}
        <!-- BI-3：入口上下文条（来源保留；取消/重开不丢，仅 × 显式清除） -->
        <span class="lv-entry" title={t?.entry?.title ?? "入口上下文"} data-testid="review-entry-ctx">
            <span class="lv-entry-from ft__smaller">{t?.entry?.title ?? "来源"}·{t?.entry?.kind?.[entryCtx.entryKind] || entryCtx.entryKind}</span>
            {#if entryCtx.returnPoint}
                <button
                    type="button"
                    class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                    onclick={() => onReturnToEntry(entryCtx.returnPoint)}
                    data-testid="review-return-entry-btn"
                >
                    <LvIcon name="chevron-left" size={12} />
                    <span>{t?.entry?.return ?? "返回"}</span>
                </button>
            {/if}
            <button
                type="button"
                class="b3-button b3-button--text b3-button--small lv-btn-tool"
                aria-label={t?.entry?.dismiss ?? "关闭"}
                title={t?.entry?.dismiss ?? "关闭"}
                onclick={() => onDismissEntry(entryCtx.entryKind, entryCtx.sourceID)}
                data-testid="review-dismiss-entry-btn"
            >
                <LvIcon name="close" size={12} />
            </button>
        </span>
    {/if}
    <div class="lv-head-center">
        <span class="lv-progress" data-testid="review-progress-text">{currentProgress} / {totalCount}</span>
    </div>
    <div class="lv-head-right">
        {#if cramActive}
            <span class="lv-chip2 lv-cram-golden-chip" data-testid="review-cram-chip" data-test-badge="cram-golden" title="突击快刷模式：不改动复习排期与正式学习记录">
                <LvIcon name="zap" size={12} />
                <span>突击快刷模式</span>
            </span>
        {/if}
        {#if budgetMin > 0}
            <!-- BI-12：预算倒计时；到点转为中性提示（不自动结束、不算失败） -->
            {#if budgetExpired}
                <span class="lv-chip2 lv-chip2--default" title={t?.review?.budgetDoneTip ?? "已达会话预算目标"} data-testid="review-budget-done-chip">{t?.review?.budgetDone ?? "时间到"}</span>
            {:else}
                <span class="lv-timeout lv-budget-chip" title={t?.review?.budgetLabel ?? "会话总倒计时"} data-testid="review-budget-chip"><LvIcon name="timer" size={13} /><small>总余</small> {budgetClockText}</span>
            {/if}
        {/if}
        {#if current?.lvRequeue}<span class="lv-chip2 lv-chip2--warn" title={t?.review?.requeueTip ?? "由于评分较低，本次会话内已自动重新入队"} data-testid="review-requeue-chip">{t?.review?.requeueChip ?? "重考"}</span>{/if}
        {#if timeoutMode !== "off" && !showAnswer}
            <span class="lv-timeout lv-card-timeout-chip" class:lv-timeout-low={timeoutLeft <= 10} title="单卡作答限时" data-testid="review-card-timeout-chip"><LvIcon name="zap" size={13} /><small>限时</small> {timeoutText}</span>
        {/if}
    </div>
</div>
<div class="lv-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={totalCount} aria-valuenow={reviewedCount} data-testid="review-progress-bar">
    <div class="lv-progress-seg lv-progress-seg--forget" style={`width:${forgetWidth}`}></div>
    <div class="lv-progress-seg" style={`width:${passWidth}`}></div>
</div>
<div class="lv-card-meta-bar" data-prevent-swipe="true">
    <span class="lv-tags">
        {#if !(hideMetaUntilAnswer && !showAnswer) && current}
            {#if current.state === 0}<span class="lv-chip2 lv-chip2--primary" data-testid="review-tag-new">{t?.review?.tagNew ?? "新卡"}</span>{/if}
            <span class="lv-chip2 lv-chip2--default" data-testid="review-tag-reps">{t?.review?.reps ?? "复习"} {current.reps ?? 0} · {t?.review?.lapses ?? "遗忘"} {current.lapses ?? 0}</span>
        {/if}
        <span class="lv-chip2 lv-chip2--default" data-testid="review-tag-type">
            {#if occl}<LvIcon name="image" size={14} /> {t?.cardTypeBadgeOcclusion ?? "遮挡"}
            {:else if isSuperBlockHtml(cardHtml)}<LvIcon name="cards" size={14} /> {t?.cardTypeBadgeSuperBlock ?? "超级块"}
            {:else if isSequenceCard(cardHtml, cardAttrs)}<LvIcon name="list" size={14} /> {t?.cardTypeBadgeSequence ?? "阶梯展开"}
            {:else if interactiveQuiz?.kind === "choice"}<LvIcon name="check" size={14} /> {interactiveQuiz.isMultiple ? (t?.cardTypeBadgeChoiceMulti ?? "多选题") : (t?.cardTypeBadgeChoiceSingle ?? "单选题")}
            {:else if interactiveQuiz?.kind === "judge"}<LvIcon name="check" size={14} /> {t?.cardTypeBadgeJudge ?? "判断题"}
            {:else if interactiveQuiz?.kind === "fill"}<LvIcon name="edit" size={14} /> {t?.cardTypeBadgeFill ?? "填空题"}
            {:else if isAttrQaCard(cardHtml, customRiffTitle, customRiffAnswer)}
                {@const attrSub = resolveAttrQaSubtype(cardAttrs, cardHtml, customRiffTitle, customRiffAnswer)}
                <LvIcon name="target" size={14} /> {attrSub === "direct" ? (t?.cardTypeBadgeAttrDirect ?? "属性问答 · 直接") : attrSub === "dual" ? (t?.cardTypeBadgeAttrDual ?? "属性问答 · 双面") : (t?.cardTypeBadgeAttrQa ?? "属性问答")}
            {:else if cardHtml?.includes("language-")}<LvIcon name="code" size={14} /> {t?.cardTypeBadgeCode ?? "代码"}
            {:else if (cardHtml?.includes("NodeList") || cardHtml?.includes("<ul") || cardHtml?.includes("<ol") || cardHtml?.includes("NodeListItem")) && (cardHtml?.includes("lv-masked") || cardHtml?.includes('data-type="mark"'))}<LvIcon name="list" size={14} /> {t?.cardTypeBadgeOutlineCloze ?? "大纲挖空"}
            {:else if cardHtml?.includes("lv-masked") || cardHtml?.includes('data-type="mark"')}<LvIcon name="edit" size={14} /> {t?.cardTypeBadgeCloze ?? "挖空"}
            {:else if cardMemo}<LvIcon name="lightbulb" size={14} /> {isCustomPluginAnswer ? (t?.cardTypeBadgePlugin ?? "插件答") : (t?.cardTypeBadgeMemo ?? "备注答")}
            {:else if hasDelimitedQa(cardHtml)}<LvIcon name="message" size={14} /> {t?.cardTypeBadgeQA ?? "问答"}
            {:else if cardHtml?.includes("NodeTable") || cardHtml?.includes("<table")}<LvIcon name="table" size={14} /> {t?.cardTypeBadgeTable ?? "表格"}
            {:else}<LvIcon name="book" size={14} /> {t?.cardTypeBadgeNative ?? "自由回忆"}
            {/if}
        </span>
        {#if current && current.lapses >= leechThreshold}
            <span class="lv-chip2 lv-chip2--warn" title={t?.review?.leechTip?.replace("${n}", String(current.lapses)) ?? `已遗忘 ${current.lapses} 次，建议拆解知识点`} data-testid="review-tag-leech"><LvIcon name="warning" size={14} /> {t?.review?.leechChip ?? "易混淆"}</span>
        {/if}
        {#if isMarkedIssue}
            <span class="lv-chip2 lv-chip2--warn" title={t?.review?.issueMarked ?? "已标记格式问题"} data-testid="review-tag-issue"><LvIcon name="flag" size={14} /> {t?.review?.issueChip ?? "格式问题"}</span>
        {/if}
    </span>
</div>

<style lang="scss">
    .lv-head-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-2);
        min-width: 0;
        flex-wrap: nowrap;
        min-height: 28px;
        overflow-x: auto;
        scrollbar-width: none;
        &::-webkit-scrollbar { display: none; }

        @media (max-width: 680px) {
            min-height: 26px;
            gap: var(--lv-sp-1);
            .lv-eyebrow,
            .lv-review-return-home {
                display: none !important;
            }
            -webkit-mask-image: none;
            mask-image: none;
            .lv-progress {
                padding-inline: calc(var(--lv-space-unit) * 2);
            }
        }

        .b3-button {
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }
        }
    }
    .lv-head-left {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        min-width: 0;
        flex-shrink: 1;
    }
    .lv-head-center {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }
    .lv-head-right {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-1);
        flex-shrink: 0;
    }
    .lv-card-meta-bar {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: var(--lv-sp-1);
        margin: 1px 0 2px;
        min-height: 20px;
        overflow-x: auto;
        scrollbar-width: none;
        &::-webkit-scrollbar { display: none; }
    }
    .lv-entry {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 1);
        padding: var(--lv-space-hairline) calc(var(--lv-space-unit) * 2);
        border-left: 2px solid var(--lv-color-brand);
        .lv-entry-from {
            color: var(--lv-color-text-muted);
            white-space: nowrap;
        }

        .b3-button {
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }
        }
    }
    .lv-progress {
        font-size: var(--lv-type-control-size);
        color: var(--lv-color-on-data-soft);
        background: var(--lv-data-soft);
        border: 1px solid var(--lv-data-border);
        border-radius: var(--lv-r-pill);
        padding: 1px 8px;
        font-weight: var(--lv-fw-semibold);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        box-shadow: var(--lv-shadow-1);
    }
    .lv-progress-bar {
        width: 100%;
        height: 4px;
        border-radius: var(--lv-r-pill);
        background: color-mix(in srgb, var(--lv-color-text) 8%, transparent);
        overflow: hidden;
        display: flex;
        margin: 2px 0 3px;
        .lv-progress-seg {
            height: 100%;
            border-radius: var(--lv-r-pill);
            background: var(--lv-color-data);
            transition: width var(--lv-dur-3) var(--lv-ease);
        }
        .lv-progress-seg--forget {
            background: var(--lv-color-danger);
        }
    }
    .lv-timeout {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline));
        font-size: var(--lv-type-control-size);
        color: var(--lv-color-text);
        background: color-mix(in srgb, var(--lv-color-text) 6%, transparent);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-pill);
        padding: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 5);
        font-variant-numeric: tabular-nums;
        font-weight: var(--lv-fw-semibold);
    }
    .lv-timeout-low {
        background: var(--lv-danger-soft);
        color: var(--lv-color-danger);
        border-color: var(--lv-danger-border);
        font-weight: var(--lv-fw-bold);
    }
    .lv-tags {
        display: flex;
        flex-wrap: nowrap;
        flex-shrink: 0;
        gap: var(--lv-sp-1);

        :global(.lv-chip2) {
            white-space: nowrap;
            flex-shrink: 0;
        }
    }
    .lv-cram-golden-chip {
        display: inline-flex;
        align-items: center;
        flex-shrink: 0;
        white-space: nowrap;
        gap: var(--lv-sp-1);
        background: var(--lv-warn-soft);
        border: 1px solid color-mix(in srgb, var(--lv-color-warning) 60%, transparent);
        color: var(--lv-color-on-warning-soft);
        font-weight: var(--lv-fw-semibold, 600);
        padding: 2px 8px;
        border-radius: var(--lv-r-tag, 999px);
        box-shadow: 0 0 8px color-mix(in srgb, var(--lv-color-warning) 25%, transparent);

        :global(svg) {
            color: var(--lv-color-warning);
        }
    }
    @media (max-width: 680px) {
        .lv-head-row {
            min-height: 28px;
            gap: var(--lv-sp-1);
            overflow-x: auto;
            scrollbar-width: none;
            &::-webkit-scrollbar { display: none; }
        }
        .lv-progress {
            flex-shrink: 0;
            position: static !important;
            padding: calc(var(--lv-space-unit) * 1) var(--lv-sp-2);
            font-size: var(--lv-type-meta-size);
        }
        .lv-timeout {
            flex-shrink: 0;
            white-space: nowrap;
            padding: calc(var(--lv-space-unit) * 1) var(--lv-sp-2);
            font-size: var(--lv-type-meta-size);
        }
        .lv-progress-bar {
            height: 4px;
            margin: var(--lv-sp-1) 0 var(--lv-sp-2);
        }
    }
    @container (max-width: 680px) {
        .lv-head-row {
            min-height: 28px;
            gap: var(--lv-sp-1);
            overflow-x: auto;
            scrollbar-width: none;
            &::-webkit-scrollbar { display: none; }
        }
        .lv-progress {
            flex-shrink: 0;
            position: static !important;
            padding: calc(var(--lv-space-unit) * 1) var(--lv-sp-2);
            font-size: var(--lv-type-meta-size);
        }
        .lv-timeout {
            flex-shrink: 0;
            white-space: nowrap;
            padding: calc(var(--lv-space-unit) * 1) var(--lv-sp-2);
            font-size: var(--lv-type-meta-size);
        }
        .lv-progress-bar {
            height: 4px;
            margin: var(--lv-sp-1) 0 var(--lv-sp-2);
        }
    }
</style>
