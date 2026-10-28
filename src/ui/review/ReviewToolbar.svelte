<script lang="ts">
    import LvIcon from "@/ui/kit/LvIcon.svelte";
    import type { RiffDeck } from "@/api/riff";
    import { SESSION_PURPOSES, PURPOSE_PROFILES, type SessionPurpose } from "@/core/session-purpose";

    let {
        scopeKey = $bindable("all"),
        purpose = $bindable("review" as SessionPurpose),
        decks = [],
        notebooks = [],
        current = null,
        hasSvgCanvas = false,
        isStarred = false,
        isMarkedIssue = false,
        actionBusy = false,
        dismissBusy = false,
        lastAnswered = null,
        reversedRecall = $bindable(false),
        zenMode = $bindable(false),
        ctxOpen = false,
        prefsOpen = false,
        hasOverrides = false,
        t,
        onScopeChange,
        onAdjustFontScale,
        onOpenSessionOptions,
        onOpenCanvasInEditor,
        onToggleStar,
        onToggleMarkIssue,
        onPause,
        onUndo,
        onSkip,
        onToggleContext,
        onTogglePrefs,
        onTogglePeek,
        onOpenInEditor,
        onRefreshCard,
        onSuspendToday,
        onOpenMemoEditor,
        onDismissCard,
        onOpenRetireModal,
        onOpenHelp,
    }: {
        scopeKey?: string;
        purpose?: SessionPurpose;
        decks?: RiffDeck[];
        notebooks?: { id: string; name: string }[];
        current?: any;
        hasSvgCanvas?: boolean;
        isStarred?: boolean;
        isMarkedIssue?: boolean;
        actionBusy?: boolean;
        dismissBusy?: boolean;
        lastAnswered?: any;
        reversedRecall?: boolean;
        zenMode?: boolean;
        ctxOpen?: boolean;
        prefsOpen?: boolean;
        hasOverrides?: boolean;
        t: any;
        onScopeChange: () => void;
        onAdjustFontScale: (delta: number) => void;
        onOpenSessionOptions: () => void;
        onOpenCanvasInEditor?: () => void;
        onToggleStar: () => void;
        onToggleMarkIssue: () => void;
        onPause: () => void;
        onUndo: () => void;
        onSkip: () => void;
        onToggleContext: () => void;
        onTogglePrefs: () => void;
        onTogglePeek: () => void;
        onOpenInEditor: () => void;
        onRefreshCard: () => void;
        onSuspendToday: () => void;
        onOpenMemoEditor: () => void;
        onDismissCard: () => void;
        onOpenRetireModal: () => void;
        onOpenHelp: () => void;
    } = $props();

    let showMoreToolbar = $state(false);
    let scopeEl = $state<HTMLSelectElement | null>(null);

    function handleWindowKeydown(e: KeyboardEvent) {
        if (showMoreToolbar && e.key === "Escape") {
            showMoreToolbar = false;
            e.preventDefault();
        }
    }

    export function focusScope() {
        scopeEl?.focus();
    }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="lv-head-row lv-head-tools">
    <select
        class="b3-select lv-scope"
        bind:this={scopeEl}
        bind:value={scopeKey}
        onchange={onScopeChange}
        title={t.review?.scopeTitle ?? "复习范围"}
        aria-label={t.review?.scopeTitle ?? "复习范围"}
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

    <!-- BI-2：本次会话目的（结束条件随目的显示；informal 不计入每日目标） -->
    <select
        class="b3-select lv-scope"
        bind:value={purpose}
        title={t.review?.purposeTitle ?? "会话目的"}
        aria-label={t.review?.purposeTitle ?? "会话目的"}
    >
        {#each SESSION_PURPOSES as p (p)}
            <option value={p}>{t.purpose?.[p]?.name ?? p}</option>
        {/each}
    </select>

    <!-- R53 主色即动作：结束条件章是信息不是按钮——优雅胶囊态 + 目标语义前缀 + 提示解释 -->
    <span
        class="lv-chip2 lv-chip2--default lv-purpose-end-chip"
        title={PURPOSE_PROFILES[purpose]?.grading === "formal" ? (t.review?.purposeFormal ?? "正式复习") : (t.review?.purposeInformal ?? "随性自测")}
    >
        <LvIcon name="target" size={12} /> {t.purpose?.[purpose]?.end ?? "完成"}
    </span>

    <div class="fn__flex-1"></div>

    <!-- docs/13 §4：图标可读、操作不依赖 hover；常驻核心高频操作，二级动作折叠进更多气泡 -->
    <div class="lv-font-scale-group" title={t.review?.fontScaleTitle ?? "调整卡面字号"}>
        <button type="button" class="b3-button b3-button--small lv-btn-ghost lv-font-btn" title="缩小卡面字号" onclick={() => onAdjustFontScale(-0.1)}>A−</button>
        <button type="button" class="b3-button b3-button--small lv-btn-ghost lv-font-btn" title="放大卡面字号" onclick={() => onAdjustFontScale(0.1)}>A+</button>
    </div>

    <button
        type="button"
        class="b3-button b3-button--small lv-btn-ghost lv-tool-btn"
        title={t.review?.sessionOptionsTitle ?? "本场偏好"}
        aria-label={t.review?.sessionOptionsTitle ?? "本场偏好"}
        onclick={onOpenSessionOptions}
    >
        <LvIcon name="zap" size={14} />
        <span class="lv-tool-btn-label"> {(t.review?.sessionOptionsTitle ?? "偏好").slice(0, 4)}</span>
    </button>

    {#if hasSvgCanvas && onOpenCanvasInEditor}
        <button
            type="button"
            class="b3-button b3-button--small lv-btn-ghost lv-tool-btn lv-canvas-edit-btn"
            title={t.review?.canvasDoubleClickTip ?? "编辑画布 (或双击画布)"}
            aria-label="编辑画布"
            onclick={onOpenCanvasInEditor}
        >
            <LvIcon name="edit" size={13} />
            <span class="lv-tool-btn-label"> {t.review?.tbEditCanvas ?? "编辑画布"}</span>
        </button>
    {/if}

    <button
        type="button"
        class="b3-button b3-button--small lv-btn-ghost lv-tool-btn"
        class:lv-btn-starred={isStarred}
        title="星标重点卡片 (*)"
        aria-label="星标重点卡片"
        aria-pressed={isStarred}
        disabled={!current || actionBusy}
        onclick={onToggleStar}
    >
        <LvIcon name="star" size={14} />
        <span class="lv-tool-btn-label"> {isStarred ? "已星标" : "星标"}</span>
    </button>

    <button
        type="button"
        class="b3-button b3-button--small lv-btn-ghost lv-tool-btn"
        class:lv-btn-primary={isMarkedIssue}
        title={isMarkedIssue ? (t.review?.issueMarked ?? "已标记疑问") : (t.review?.tbMarkIssue ?? "标记疑问")}
        aria-label={t.review?.tbMarkIssue ?? "标记疑问"}
        aria-pressed={isMarkedIssue}
        disabled={!current || actionBusy || isMarkedIssue}
        onclick={onToggleMarkIssue}
    >
        <LvIcon name="flag" size={14} />
        <span class="lv-tool-btn-label"> {isMarkedIssue ? (t.review?.issueChip ?? "待修") : (t.review?.tbMarkIssue ?? "标记")}</span>
    </button>

    <button
        type="button"
        class="b3-button b3-button--small lv-btn-ghost lv-tool-btn"
        title={t.review?.pauseTitle ?? "暂停这场复习"}
        aria-label={t.review?.pauseTitle ?? "暂停这场复习"}
        disabled={actionBusy}
        onclick={onPause}
    >
        <LvIcon name="moon" size={14} />
        <span class="lv-tool-btn-label"> {t.review?.tbPause ?? "暂停"}</span>
    </button>

    <button
        type="button"
        class="b3-button b3-button--small lv-btn-ghost lv-tool-btn"
        title={t.review?.undoTitle ?? "撤销上一张评分 (P/Q)"}
        aria-label={t.review?.undoTitle ?? "撤销上一张评分 (P/Q)"}
        disabled={actionBusy}
        onclick={onUndo}
    >
        <LvIcon name="refresh" size={13} />
        <span class="lv-tool-btn-label"> {t.review?.tbUndo ?? "撤销"}</span>
    </button>

    <button
        type="button"
        class="b3-button b3-button--small lv-btn-ghost lv-tool-btn"
        disabled={actionBusy}
        onclick={onSkip}
    >
        <LvIcon name="chevron-right" size={13} />
        <span class="lv-tool-btn-label"> {t.review?.skip ?? "跳过"}</span>
    </button>

    <div class="lv-toolbar-more-wrap">
        <button
            type="button"
            class="b3-button b3-button--small lv-btn-ghost lv-tool-btn"
            class:lv-btn-primary={showMoreToolbar}
            title={t.review?.tbMoreDesc ?? (t.review?.tbMore ?? "更多动作")}
            aria-label={t.review?.tbMoreDesc ?? (t.review?.tbMore ?? "更多动作")}
            aria-expanded={showMoreToolbar}
            onclick={() => (showMoreToolbar = !showMoreToolbar)}
        >
            ··· {t.review?.tbMore ?? "更多"}
        </button>

        {#if showMoreToolbar}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="lv-toolbar-more-scrim" onclick={() => (showMoreToolbar = false)}></div>
            <div class="lv-toolbar-more-menu" role="menu">
                <button
                    type="button"
                    class="lv-toolbar-menu-item"
                    class:lv-active={reversedRecall}
                    title={t.review?.enableReversed ?? "翻转问答自测 (R)"}
                    onclick={() => { reversedRecall = !reversedRecall; showMoreToolbar = false; }}
                >
                    <span class="lv-menu-icon"><LvIcon name="refresh" size={16} /></span>
                    <span>{reversedRecall ? (t.review?.cancelReversed ?? "恢复正常顺序") : (t.review?.enableReversed ?? "翻转问答自测 (R)")}</span>
                </button>

                <button
                    type="button"
                    class="lv-toolbar-menu-item"
                    class:lv-active={zenMode}
                    title="沉浸专注模式 (z)"
                    onclick={() => { zenMode = !zenMode; showMoreToolbar = false; }}
                >
                    <span class="lv-menu-icon"><LvIcon name="eye" size={16} /></span>
                    <span>{zenMode ? "退出专注模式 (z)" : "沉浸专注模式 (z)"}</span>
                </button>

                <button
                    type="button"
                    class="lv-toolbar-menu-item"
                    class:lv-active={ctxOpen}
                    title={t.review?.ctxToggle ?? "查看来源上下文"}
                    onclick={() => { onToggleContext(); showMoreToolbar = false; }}
                >
                    <span class="lv-menu-icon"><LvIcon name="book" size={16} /></span>
                    <span>{t.review?.tbCtx ?? "来源上下文"}</span>
                </button>

                <button
                    type="button"
                    class="lv-toolbar-menu-item"
                    class:lv-active={prefsOpen || hasOverrides}
                    title={t.review?.prefsTitle ?? "本场偏好"}
                    onclick={() => { onTogglePrefs(); showMoreToolbar = false; }}
                >
                    <span class="lv-menu-icon"><LvIcon name="settings" size={16} /></span>
                    <span>{t.review?.tbPrefs ?? "本场偏好"}{hasOverrides ? " ●" : ""}</span>
                </button>

                <button
                    type="button"
                    class="lv-toolbar-menu-item"
                    disabled={!lastAnswered}
                    title={t.review?.peekPrev ?? "回看上一张"}
                    onclick={() => { onTogglePeek(); showMoreToolbar = false; }}
                >
                    <span class="lv-menu-icon"><LvIcon name="eye" size={16} /></span>
                    <span>{t.review?.peekPrev ?? "回看上一张"}</span>
                </button>

                <button
                    type="button"
                    class="lv-toolbar-menu-item"
                    title={t.review?.openInEditor ?? "在编辑器中打开"}
                    onclick={() => { onOpenInEditor(); showMoreToolbar = false; }}
                >
                    <span class="lv-menu-icon"><LvIcon name="edit" size={16} /></span>
                    <span>{t.review?.openInEditor ?? (t.review?.open ?? "在编辑器中打开")}</span>
                </button>

                <button
                    type="button"
                    class="lv-toolbar-menu-item"
                    title={t.review?.refreshCard ?? "刷新当前卡面"}
                    onclick={() => { onRefreshCard(); showMoreToolbar = false; }}
                >
                    <span class="lv-menu-icon"><LvIcon name="refresh" size={16} /></span>
                    <span>{t.review?.tbRefresh ?? "刷新卡面"}</span>
                </button>

                <button
                    type="button"
                    class="lv-toolbar-menu-item"
                    disabled={actionBusy}
                    title={t.review?.suspendToday ?? "今日不再复习此卡"}
                    onclick={() => { onSuspendToday(); showMoreToolbar = false; }}
                >
                    <span class="lv-menu-icon"><LvIcon name="moon" size={16} /></span>
                    <span>{t.review?.suspendToday ?? (t.review?.tbSuspend ?? "今日暂停")}</span>
                </button>

                <button
                    type="button"
                    class="lv-toolbar-menu-item"
                    disabled={!current || actionBusy}
                    title={t.review?.tbMemo ?? "助记便签"}
                    onclick={() => { onOpenMemoEditor(); showMoreToolbar = false; }}
                >
                    <span class="lv-menu-icon"><LvIcon name="lightbulb" size={16} /></span>
                    <span>{t.review?.tbMemo ?? "助记便签"}</span>
                </button>

                <button
                    type="button"
                    class="lv-toolbar-menu-item"
                    disabled={!current || actionBusy || dismissBusy}
                    title={t.review?.tbDismiss ?? "解散归档 (Ctrl+D)"}
                    onclick={() => { onDismissCard(); showMoreToolbar = false; }}
                >
                    <span class="lv-menu-icon"><LvIcon name="close" size={16} /></span>
                    <span>{t.review?.tbDismiss ?? "解散归档 (Ctrl+D)"}</span>
                </button>

                <button
                    type="button"
                    class="lv-toolbar-menu-item lv-menu-danger"
                    disabled={!current || actionBusy}
                    title={t.review?.retireCard ?? "移出当前卡组"}
                    onclick={() => { onOpenRetireModal(); showMoreToolbar = false; }}
                >
                    <span class="lv-menu-icon"><LvIcon name="ban" size={16} /></span>
                    <span>{t.review?.retireCard ?? "移出卡组"}</span>
                </button>

                <div class="lv-toolbar-menu-divider"></div>

                <button
                    type="button"
                    class="lv-toolbar-menu-item"
                    title={t.review?.helpTitle ?? "快捷键帮助"}
                    onclick={() => { onOpenHelp(); showMoreToolbar = false; }}
                >
                    <span class="lv-menu-icon"><LvIcon name="question" size={16} /></span>
                    <span>{t.review?.tbHelp ?? "快捷键帮助 (?)"}</span>
                </button>
            </div>
        {/if}
    </div>
</div>

<style lang="scss">
    .lv-head-tools {
        display: flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline));
        min-width: 0;
        flex-wrap: nowrap;

        .lv-scope {
            height: 28px;
            min-height: 28px;
            line-height: var(--lv-lh-control-lg);
            min-width: 6em;
            max-width: 135px;
            padding: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 3);
            border-radius: var(--lv-r-pill);
            border: 1px solid var(--lv-border);
            background: var(--lv-color-surface);
            color: var(--lv-color-text);
            font-size: var(--lv-type-meta-size);
            text-align: center;
            text-align-last: center;
            vertical-align: middle;
            box-sizing: border-box;
            box-shadow: 0 1px 2px color-mix(in srgb, black 3%, transparent);
            flex-shrink: 1;

            option {
                text-align: left;
                line-height: normal;
            }
        }

        .lv-purpose-end-chip {
            height: 28px;
            box-sizing: border-box;
            padding: 0 calc(var(--lv-space-unit) * 4);
            font-size: var(--lv-type-meta-size);
            font-weight: var(--lv-fw-medium);
            display: inline-flex;
            align-items: center;
            gap: calc(var(--lv-space-unit) * 2);
            white-space: nowrap;
            border-radius: var(--lv-r-pill);
            border: 1px solid var(--lv-border);
            background: var(--lv-color-surface);
            box-shadow: 0 1px 2px color-mix(in srgb, black 3%, transparent);
            flex-shrink: 0;
        }

        .lv-font-scale-group {
            height: 28px;
            box-sizing: border-box;
            display: inline-flex;
            align-items: center;
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-pill);
            background: var(--lv-color-surface);
            box-shadow: 0 1px 2px color-mix(in srgb, black 3%, transparent);
            overflow: hidden;
            flex-shrink: 0;
            .lv-font-btn {
                height: 26px;
                padding: 0 calc(var(--lv-space-unit) * 3 + var(--lv-space-hairline));
                font-size: var(--lv-type-meta-size);
                border: none;
                border-radius: 0;
                color: var(--lv-color-text-muted);
                &:hover:not(:disabled) {
                    color: var(--lv-color-brand);
                    background: var(--lv-primary-soft);
                }
            }
        }

        .lv-tool-btn {
            height: 28px;
            box-sizing: border-box;
            padding: 0 calc(var(--lv-space-unit) * 4);
            border-radius: var(--lv-r-pill);
            background: var(--lv-color-surface);
            border: 1px solid var(--lv-border);
            color: var(--lv-color-text-muted);
            white-space: nowrap;
            flex-shrink: 0;
            display: inline-flex;
            align-items: center;
            gap: calc(var(--lv-space-unit) * 2);
            font-size: var(--lv-type-meta-size);
            box-shadow: 0 1px 2px color-mix(in srgb, black 3%, transparent);
            transition: all var(--lv-dur-1) var(--lv-ease);

            &:hover:not(:disabled) {
                border-color: var(--lv-color-brand);
                color: var(--lv-color-brand);
                background: color-mix(in srgb, var(--lv-color-brand) 6%, var(--lv-color-surface));
            }
        }

        .lv-toolbar-more-wrap {
            position: relative;
            flex-shrink: 0;
        }

        .lv-toolbar-more-scrim {
            position: fixed;
            inset: 0;
            z-index: var(--lv-z-popover);
            background: transparent;
        }

        .lv-toolbar-more-menu {
            position: absolute;
            top: calc(100% + var(--lv-sp-2));
            right: 0;
            z-index: calc(var(--lv-z-popover) + 1);
            min-width: 180px;
            padding: var(--lv-sp-2);
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-m);
            background: var(--lv-color-surface);
            box-shadow: var(--lv-shadow-float);
            display: flex;
            flex-direction: column;
            gap: calc(var(--lv-space-unit) * 1);
            animation: lv-modal-pop var(--lv-dur-1) var(--lv-ease);
        }

        .lv-toolbar-menu-item {
            display: flex;
            align-items: center;
            gap: calc(var(--lv-space-unit) * 2);
            padding: calc(var(--lv-space-unit) * 2) calc(var(--lv-space-unit) * 3);
            border: none;
            background: transparent;
            color: var(--lv-color-text);
            font-size: var(--lv-type-control-size);
            border-radius: var(--lv-r-s);
            cursor: pointer;
            text-align: left;
            width: 100%;
            transition: background var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease);

            &:hover:not(:disabled) {
                background: var(--lv-surface-hover);
                color: var(--lv-color-brand);
            }
            &:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            &.lv-active {
                color: var(--lv-color-brand);
                font-weight: var(--lv-fw-semibold);
                background: var(--lv-primary-soft);
            }
        }

        .lv-toolbar-menu-divider {
            height: 1px;
            background: var(--lv-border);
            margin: calc(var(--lv-space-unit) * 1) 0;
        }

        .lv-menu-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            opacity: 0.75;
        }

        .lv-menu-danger {
            color: var(--lv-color-danger) !important;
            &:hover:not(:disabled) {
                background: var(--lv-danger-soft) !important;
                color: var(--lv-color-danger) !important;
            }
        }
    }

    @media (max-width: 740px) {
        .lv-head-tools {
            .lv-tool-btn-label { display: none; }
            .lv-tool-btn { padding: 0 calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline)); }
        }
    }
</style>
