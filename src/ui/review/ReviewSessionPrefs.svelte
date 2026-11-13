<script lang="ts">
    import { tick } from "svelte";
    import LvIcon from "@/ui/kit/LvIcon.svelte";
    import LvSwitch from "@/ui/kit/LvSwitch.svelte";
    import type { RiffDeck } from "@/api/riff";
    import { SESSION_PURPOSES, type SessionPurpose } from "@/core/session-purpose";
    import type { ReviewSettings } from "../review.svelte";

    const BUDGET_PRESETS = [5, 10, 15, 20, 25, 30, 45, 60] as const;

    let {
        open = false,
        scopeKey = $bindable("all"),
        purpose = $bindable("review" as SessionPurpose),
        decks = [],
        notebooks = [],
        answerVariant = "normal",
        ratingStyle = "four",
        reverseOrder = false,
        mixedRotation = false,
        timeoutMode = "off",
        budgetMin = 15,
        budgetEstimate = null,
        hasOverrides = false,
        t,
        onScopeChange,
        onSetAnswerVariant,
        onSetOverride,
        onSetBudget,
        onResetOverrides,
        onClose,
    }: {
        open?: boolean;
        scopeKey?: string;
        purpose?: SessionPurpose;
        decks?: RiffDeck[];
        notebooks?: { id: string; name: string }[];
        answerVariant?: "normal" | "choice" | "typing";
        ratingStyle?: "four" | "three";
        reverseOrder?: boolean;
        mixedRotation?: boolean;
        timeoutMode?: "off" | "reveal" | "forget";
        budgetMin?: number;
        budgetEstimate?: { done: number; left: number } | null;
        hasOverrides?: boolean;
        t: any;
        onScopeChange?: () => void;
        onSetAnswerVariant?: (variant: "normal" | "choice" | "typing") => void;
        onSetOverride: (key: keyof ReviewSettings, value: unknown) => void;
        onSetBudget: (min: number) => void;
        onResetOverrides: () => void;
        onClose?: () => void;
    } = $props();

    let scopeSelectEl = $state<HTMLSelectElement | null>(null);

    export async function focusScope() {
        await tick();
        scopeSelectEl?.focus();
    }

    function clampBudgetMinutes(value: unknown): number {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) return 0;
        return Math.max(5, Math.min(480, Math.round(n)));
    }
</script>

{#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_no_noninteractive_element_interactions -->
    <div
        class="lv-prefs"
        role="region"
        tabindex="-1"
        aria-label={t.review?.prefsTitle ?? "本场偏好"}
        onkeydown={(e) => { if (e.key === "Escape" && onClose) { e.stopPropagation(); onClose(); } }}
    >
        <div class="lv-prefs-head">
            <span class="lv-prefs-title"><LvIcon name="settings" size={14} /> {t.review?.prefsTitle ?? "本场偏好"}</span>
            <span class="ft__smaller ft__on-surface">{t.review?.prefsHint ?? "仅对当前复习面板生效，离开后恢复全局设置"}</span>
            <div class="fn__flex-1"></div>
            {#if onClose}
                <button
                    type="button"
                    class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                    onclick={onClose}
                    aria-label="关闭"
                    aria-keyshortcuts="Escape"
                    title="关闭 (Esc)"
                >
                    <LvIcon name="close" size={12} />
                </button>
            {/if}
        </div>
        {#if onScopeChange}
            <div class="lv-prefs-row">
                <span>{t.review?.scopeTitle ?? "复习范围"}</span>
                <div class="fn__flex-1"></div>
                <select
                    class="b3-select b3-select--small lv-scope"
                    bind:this={scopeSelectEl}
                    bind:value={scopeKey}
                    aria-label={t.review?.scopeTitle ?? "复习范围"}
                    onchange={onScopeChange}
                >
                    <option value="all">{t.review?.scopeAll ?? "全部卡片"}</option>
                    <option value="new">{t.review?.scopeNew ?? "仅新卡"}</option>
                    <option value="old">{t.review?.scopeOld ?? "仅旧卡"}</option>
                    {#if decks.length > 0}
                        <optgroup label={t.dashboard?.decks ?? "卡组"}>
                            {#each decks as d (d.id)}
                                <option value={`deck:${d.id}`}>{d.name}</option>
                            {/each}
                        </optgroup>
                    {/if}
                    {#if notebooks.length > 0}
                        <optgroup label={t.review?.scopeNotebooks ?? "笔记本"}>
                            {#each notebooks as n (n.id)}
                                <option value={`notebook:${n.id}`}>{n.name}</option>
                            {/each}
                        </optgroup>
                    {/if}
                </select>
                <select
                    class="b3-select b3-select--small"
                    bind:value={purpose}
                    aria-label={t.review?.purposeTitle ?? "会话目的"}
                >
                    {#each SESSION_PURPOSES as p (p)}
                        <option value={p}>{t.purpose?.[p]?.name ?? p}</option>
                    {/each}
                </select>
            </div>
        {/if}
        {#if onSetAnswerVariant}
            <div class="lv-prefs-row">
                <span>{t.review?.answerModeLabel ?? "作答方式"}</span>
                <div class="fn__flex-1"></div>
                <select
                    class="b3-select b3-select--small"
                    aria-label={t.review?.answerModeLabel ?? "作答方式"}
                    value={answerVariant}
                    onchange={(e: Event) => onSetAnswerVariant((e.target as HTMLSelectElement).value as "normal" | "choice" | "typing")}
                >
                    <option value="normal">{t.review?.modeRecall ?? "自由回忆"}</option>
                    <option value="choice">{t.review?.modeChoice ?? "选择题"}</option>
                    <option value="typing">{t.review?.modeTyping ?? "打字练习"}</option>
                </select>
            </div>
        {/if}
        <div class="lv-prefs-row">
            <span>{t.settings?.ratingStyle ?? "评分制"}</span>
            <div class="fn__flex-1"></div>
            <button type="button" class="b3-button b3-button--small" class:lv-btn-primary={ratingStyle === "four"} onclick={() => onSetOverride("ratingStyle", "four")}>
                {t.review?.prefsFour ?? "四档"}
            </button>
            <button type="button" class="b3-button b3-button--small" class:lv-btn-primary={ratingStyle === "three"} onclick={() => onSetOverride("ratingStyle", "three")}>
                {t.review?.prefsThree ?? "三档"}
            </button>
        </div>
        <div class="lv-prefs-row">
            <span>{t.settings?.reverseOrder ?? "双向问答反转"}</span>
            <div class="fn__flex-1"></div>
            <LvSwitch
                checked={reverseOrder}
                ariaLabel={t.settings?.reverseOrder ?? "双向问答反转"}
                onchange={(val) => onSetOverride("reverseOrder", val)}
            />
        </div>
        <div class="lv-prefs-row">
            <span>{t.settings?.mixedRotationLabel ?? "混合题型轮换"}</span>
            <div class="fn__flex-1"></div>
            <LvSwitch
                checked={mixedRotation}
                ariaLabel={t.settings?.mixedRotationLabel ?? "混合题型轮换"}
                onchange={(val) => onSetOverride("mixedRotation", val)}
            />
        </div>
        <div class="lv-prefs-row">
            <span>{t.settings?.timeoutMode ?? "超时处理"}</span>
            <div class="fn__flex-1"></div>
            <select class="b3-select b3-select--small" value={timeoutMode} onchange={(e: Event) => onSetOverride("timeoutMode", (e.target as HTMLSelectElement).value)}>
                <option value="off">{t.settings?.timeoutOff ?? "关闭限时"}</option>
                <option value="reveal">{t.settings?.timeoutReveal ?? "自动翻面"}</option>
                <option value="forget">{t.settings?.timeoutForget ?? "记为遗忘"}</option>
            </select>
        </div>
        <div class="lv-prefs-row">
            <span>{t.review?.budgetLabel ?? "单场时间预算"}</span>
            <div class="fn__flex-1"></div>
            <select class="b3-select b3-select--small" value={String(budgetMin)} onchange={(e: Event) => onSetBudget(Number((e.target as HTMLSelectElement).value))}>
                <option value="0">{t.review?.budgetOff ?? "不设预算"}</option>
                {#each BUDGET_PRESETS as m (m)}
                    <option value={String(m)}>{(t.review?.budgetMinutes ?? "${n} 分钟").replace("${n}", String(m))}</option>
                {/each}
                {#if budgetMin > 0 && !(BUDGET_PRESETS as readonly number[]).includes(budgetMin)}
                    <option value={String(budgetMin)}>{(t.review?.budgetMinutes ?? "${n} 分钟").replace("${n}", String(budgetMin))}</option>
                {/if}
            </select>
            <input
                class="b3-text-field b3-text-field--small lv-budget-custom"
                type="number"
                inputMode="numeric"
                min="5"
                max="480"
                step="5"
                spellcheck="false"
                autocomplete="off"
                aria-label={t.review?.budgetCustomLabel ?? "自定义预算"}
                placeholder={t.review?.budgetCustomHint ?? "分钟"}
                onchange={(e: Event) => onSetBudget(clampBudgetMinutes((e.target as HTMLInputElement).value))}
            />
        </div>
        {#if budgetEstimate}
            <div class="lv-prefs-row">
                <span class="ft__smaller ft__on-surface" style="font-variant-numeric: tabular-nums;">
                    {(t.review?.budgetEst ?? "预计完成 ${done} 张 · 剩余 ${left} 张").replace("${done}", String(budgetEstimate.done)).replace("${left}", String(budgetEstimate.left))}
                </span>
            </div>
        {/if}
        <div class="lv-prefs-row">
            <div class="fn__flex-1"></div>
            <button type="button" class="b3-button b3-button--small" disabled={!hasOverrides} onclick={onResetOverrides}>
                {t.review?.prefsReset ?? "恢复全局默认"}
            </button>
        </div>
    </div>
{/if}

<style lang="scss">
    .lv-prefs {
        max-width: var(--lv-card-max, 880px);
        width: 100%;
        margin: 0 auto var(--lv-sp-2);
        padding: var(--lv-sp-3);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        background: var(--lv-surface-hover);
        font-size: var(--lv-type-body-size);
        box-sizing: border-box;

        .lv-prefs-head {
            display: flex;
            align-items: baseline;
            gap: var(--lv-sp-2);
            margin-bottom: var(--lv-sp-2);
            flex-wrap: wrap;

            .lv-prefs-title {
                font-weight: var(--lv-fw-semibold);
                display: inline-flex;
                align-items: center;
                gap: var(--lv-sp-1);
                text-wrap: balance;
            }
        }

        .lv-prefs-row {
            display: flex;
            align-items: center;
            gap: var(--lv-sp-2);
            padding: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline)) 0;
            flex-wrap: wrap;

            .lv-budget-custom {
                width: 68px;
            }

            .lv-scope {
                height: 28px;
                min-height: 28px;
                line-height: var(--lv-lh-control-lg);
                text-align-last: center;
                vertical-align: middle;
            }
        }

        .b3-button,
        .b3-select,
        .b3-text-field {
            touch-action: manipulation;

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }
        }
    }
</style>
