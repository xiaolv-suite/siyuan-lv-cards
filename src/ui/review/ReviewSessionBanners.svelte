<script lang="ts">
    import LvIcon from "../kit/LvIcon.svelte";

    interface Props {
        sessionPaused?: boolean;
        returnBanner?: { planText: string; steps: string[]; capText: string } | null;
        recovery?: any[] | null;
        endPicked?: string | null;
        returnItems?: Array<{ key: string; level: string; text: string }> | null;
        returnDismissed?: boolean;
        sessionDone?: boolean;
        hasCurrent?: boolean;
        emptyQueue?: boolean;
        reliefChoices?: Array<{ key: string }>;
        reliefOpen?: string | null;
        qualityExcludedCount?: number;
        t: any;
        onResumeSession?: () => void;
        onDismissReturnBanner?: () => void;
        onRecoveryAct?: (branch: string) => void;
        onDismissReturnCheck?: () => void;
        onReliefPick?: (key: string) => void;
        onRecheckQuality?: () => void;
        onOpenMaintenance?: () => void;
    }

    let {
        sessionPaused = false,
        returnBanner = null,
        recovery = null,
        endPicked = null,
        returnItems = null,
        returnDismissed = false,
        sessionDone = false,
        hasCurrent = false,
        emptyQueue = false,
        reliefChoices = [],
        reliefOpen = null,
        qualityExcludedCount = 0,
        t,
        onResumeSession = () => {},
        onDismissReturnBanner = () => {},
        onRecoveryAct = () => {},
        onDismissReturnCheck = () => {},
        onReliefPick = () => {},
        onRecheckQuality = () => {},
        onOpenMaintenance = () => {},
    }: Props = $props();
</script>

{#if sessionPaused}
    <div class="lv-recover" role="status">
        <span>{t.review.pauseTitle}</span>
        <button class="b3-button b3-button--small lv-btn-tool" onclick={onResumeSession}>
            <LvIcon name="refresh" size={12} /> <span>{t.review.pauseContinue}</span>
        </button>
    </div>
{/if}

<!-- BI-27 返场分流（docs/13 §4 BI-27 UI 接线）：方案展示可忽略，不自动改预算/队列 -->
{#if returnBanner && !recovery}
    <div class="lv-notice" role="status">
        <div class="lv-eyebrow">{t.review.returnTriageTitle}</div>
        <div style="margin-top: calc(var(--lv-space-unit) * 2)">{returnBanner.planText}</div>
        <div class="ft__smaller ft__on-surface" style="margin-top: calc(var(--lv-space-unit) * 2)">{returnBanner.steps.join(" · ")}</div>
        <div class="ft__smaller ft__on-surface" style="margin-top: calc(var(--lv-space-unit) * 1)">{returnBanner.capText}</div>
        <div style="margin-top: calc(var(--lv-space-unit) * 3); text-align: right">
            <button class="b3-button b3-button--small" onclick={onDismissReturnBanner}>{t.review.returnDismiss}</button>
        </div>
    </div>
{/if}

<!-- BI-9：中断恢复分支（四选一，用户拍板；disabled 项带原因） -->
{#if recovery}
    <div class="lv-recover" role="group" aria-label={t.review.recoveryTitle}>
        <span class="lv-recover-title">{t.review.recoveryTitle}</span>
        {#if endPicked}
            <!-- BI-8：上次收工原因随横幅提示（辅助返场分流；不改变任何分支语义） -->
            <span class="ft__smaller ft__on-surface" style="opacity:.75">{t.endReason.last}{t.endReason[endPicked] ?? ""}</span>
        {/if}
        {#each recovery as opt (opt.branch)}
            <button
                class="b3-button b3-button--small"
                class:b3-button--outline={opt.branch !== "resume"}
                class:lv-btn-primary={opt.branch === "resume"}
                disabled={!opt.enabled}
                title={opt.enabled ? "" : (t.recovery[opt.disabledWhyKey?.replace("recovery.", "")] ?? opt.disabledWhyKey ?? "")}
                onclick={() => onRecoveryAct(opt.branch)}
            >{t.recovery[opt.branch]}</button>
        {/each}
    </div>
{/if}

{#if returnItems && !returnDismissed && !sessionDone && hasCurrent && !emptyQueue}
    <!-- BI-10：长期返场检查（只读预览；不写内核，重建归 BI-28 可撤销批次） -->
    <div class="lv-return" role="status" aria-live="polite">
        <span class="lv-return-title">{t.returnCheck.bannerTitle}</span>
        {#each returnItems as it (it.key)}
            <span class="lv-chip2" class:lv-chip2--warn={it.level === "warn"} class:lv-chip2--default={it.level !== "warn"}>{it.text}</span>
        {/each}
        <button class="b3-button b3-button--text b3-button--small" onclick={onDismissReturnCheck}>{t.returnCheck.dismiss}</button>
    </div>
    <!-- BI-13：减负选择（点击展开对 due/历史的影响说明；纯建议可跳过） -->
    <div class="lv-return lv-relief" role="group" aria-label={t.loadRelief.title}>
        <span class="lv-return-title">{t.loadRelief.title}</span>
        {#each reliefChoices as c (c.key)}
            <button
                class="b3-button b3-button--small"
                aria-expanded={reliefOpen === c.key}
                onclick={() => onReliefPick(c.key)}
            >{t.loadRelief[c.key]}</button>
        {/each}
    </div>
    {#if reliefOpen}
        <div class="lv-return lv-relief-impact" aria-live="polite">
            <span class="ft__smaller ft__on-surface">{t.loadRelief.impact[reliefOpen]}</span>
        </div>
    {/if}
{/if}

{#if qualityExcludedCount > 0 && !emptyQueue}
    <div class="lv-notice lv-notice--warn" role="status" aria-live="polite" style="display: flex; align-items: center; justify-content: space-between; gap: var(--lv-sp-2); flex-wrap: wrap;">
        <span style="font-variant-numeric: tabular-nums;">{t.review.qualityExcluded.replace("${n}", String(qualityExcludedCount))}</span>
        <div style="display: flex; gap: var(--lv-sp-2); align-items: center;">
            <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" onclick={onRecheckQuality}>
                <LvIcon name="refresh" size={12} /> <span>{t.review.qualityRecheck}</span>
            </button>
            <button class="b3-button b3-button--small lv-btn-primary lv-btn-tool" onclick={onOpenMaintenance}>
                <LvIcon name="settings" size={12} /> <span>{t.review.openMaintenance ?? "前往维护中心修复"}</span>
            </button>
        </div>
    </div>
{/if}

<style lang="scss">
    .b3-button {
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }

    /* BI-9：恢复分支横幅 */
    .lv-recover {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        flex-wrap: wrap;
        margin: 0 var(--lv-sp-5) var(--lv-sp-2);
        padding: var(--lv-sp-2) var(--lv-sp-3);
        background: var(--lv-primary-softer);
        border: 1px solid var(--lv-primary-border);
        border-radius: var(--lv-r-m);
        font-size: var(--lv-type-body-size);
    }
    /* BI-10：长期返场检查横幅（warn 项多时换行；只读预览） */
    .lv-return {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        flex-wrap: wrap;
        max-width: 760px;
        margin: 0 auto var(--lv-sp-2);
        width: 100%;
        box-sizing: border-box;
        padding: calc(var(--lv-space-unit) * 4) calc(var(--lv-space-unit) * 7);
        background: color-mix(in srgb, var(--lv-color-warning) 8%, var(--lv-color-surface));
        border: 1px solid color-mix(in srgb, var(--lv-color-warning) 30%, transparent);
        border-radius: var(--lv-r-m);
        box-shadow: 0 1px 3px color-mix(in srgb, black 3%, transparent);
        font-size: var(--lv-type-control-size);
    }
    .lv-relief {
        button {
            border-radius: var(--lv-r-pill);
            border: 1px solid var(--lv-border);
            background: var(--lv-color-surface);
            font-size: var(--lv-type-meta-size);
            padding: calc(var(--lv-space-unit) * 1) calc(var(--lv-space-unit) * 5);
            color: var(--lv-color-text);
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;
            transition: all var(--lv-dur-1) var(--lv-ease);
            &:hover {
                border-color: var(--lv-color-brand);
                color: var(--lv-color-brand);
                background: var(--lv-primary-soft);
            }
            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }
        }
    }
    .lv-relief-impact span {
        max-width: 48em;
        text-wrap: pretty;
        line-height: var(--lv-lh-reading, 1.65);
    }
    .lv-return-title {
        color: var(--lv-color-text-muted);
        margin-right: var(--lv-sp-1);
        font-weight: var(--lv-fw-semibold);
    }
    .lv-recover-title {
        color: var(--lv-color-text-muted);
        margin-right: var(--lv-sp-1);
    }
</style>
