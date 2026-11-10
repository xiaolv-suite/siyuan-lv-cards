<script lang="ts">
    import LvIcon from "@/ui/kit/LvIcon.svelte";
    import type { RiffDeck } from "@/api/riff";
    import type { SessionPurpose } from "@/core/session-purpose";

    let {
        scopeKey = $bindable("all"),
        purpose = $bindable("review" as SessionPurpose),
        decks = [],
        notebooks = [],
        current = null,
        hasSvgCanvas = false,
        isStarred = false,
        isMarkedIssue = false,
        isCramMode = false,
        actionBusy = false,
        lastAnswered = null,
        reversedRecall = $bindable(false),
        zenMode = $bindable(false),
        ctxOpen = false,
        prefsOpen = false,
        hasOverrides = false,
        t,
        onOpenCramModal = () => {},
        onAdjustFontScale,
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
        onOpenMemoEditor,
        onOpenRetireModal,
        onOpenHelp,
        onFocusScope,
    }: {
        scopeKey?: string;
        purpose?: SessionPurpose;
        decks?: RiffDeck[];
        notebooks?: { id: string; name: string }[];
        current?: any;
        hasSvgCanvas?: boolean;
        isStarred?: boolean;
        isMarkedIssue?: boolean;
        isCramMode?: boolean;
        actionBusy?: boolean;
        dismissBusy?: boolean;
        lastAnswered?: any;
        reversedRecall?: boolean;
        zenMode?: boolean;
        ctxOpen?: boolean;
        prefsOpen?: boolean;
        hasOverrides?: boolean;
        t: any;
        onOpenCramModal?: () => void;
        onScopeChange?: () => void;
        onAdjustFontScale: (delta: number) => void;
        onOpenSessionOptions?: () => void;
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
        onSuspendToday?: () => void;
        onOpenMemoEditor: () => void;
        onDismissCard?: () => void;
        onOpenRetireModal: () => void;
        onOpenHelp: () => void;
        onFocusScope?: () => void;
    } = $props();

    let showMoreToolbar = $state(false);
    let moreMenuEl = $state<HTMLDivElement | null>(null);

    const scopeSummaryLabel = $derived.by(() => {
        if (scopeKey === "new") return t.review?.scopeNew ?? "仅新卡";
        if (scopeKey === "old") return t.review?.scopeOld ?? "仅旧卡";
        if (scopeKey.startsWith("deck:")) {
            const id = scopeKey.slice(5);
            return decks.find(d => d.id === id)?.name ?? (t.dashboard?.decks ?? "卡组");
        }
        if (scopeKey.startsWith("notebook:")) {
            const id = scopeKey.slice(9);
            return notebooks.find(n => n.id === id)?.name ?? (t.review?.scopeNotebooks ?? "笔记本");
        }
        return t.review?.scopeAll ?? "全部卡片";
    });

    const purposeLabel = $derived(t.purpose?.[purpose]?.name ?? "");

    function handleWindowKeydown(e: KeyboardEvent) {
        if (showMoreToolbar && e.key === "Escape") {
            showMoreToolbar = false;
            e.preventDefault();
        }
    }

    function handleMoreMenuKeydown(e: KeyboardEvent) {
        if (!moreMenuEl) return;
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
        const items = [...moreMenuEl.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        if (items.length === 0) return;
        e.preventDefault();
        const curIdx = items.indexOf(document.activeElement as HTMLButtonElement);
        let nextIdx = 0;
        if (e.key === "Home") nextIdx = 0;
        else if (e.key === "End") nextIdx = items.length - 1;
        else if (e.key === "ArrowDown") nextIdx = curIdx < 0 ? 0 : (curIdx + 1) % items.length;
        else if (e.key === "ArrowUp") nextIdx = curIdx <= 0 ? items.length - 1 : curIdx - 1;
        items[nextIdx]?.focus();
    }

    export function focusScope() {
        if (onFocusScope) onFocusScope();
        else onTogglePrefs();
    }

    function handleEditClick() {
        if (hasSvgCanvas && onOpenCanvasInEditor) onOpenCanvasInEditor();
        else onOpenInEditor();
    }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="lv-head-row lv-head-tools">
    <div class="lv-head-tools-scroll">
    <!-- 左侧安静的范围/目的胶囊：点击直接展开统一的“本场偏好”切换范围或目的，避免顶栏常驻两个下拉框 -->
    <button
        type="button"
        class="b3-button b3-button--small lv-btn-ghost lv-scope-summary"
        class:lv-active={prefsOpen || hasOverrides}
        title={`${t.review?.scopeTitle ?? "复习范围"}：${scopeSummaryLabel}${purposeLabel ? ` · ${purposeLabel}` : ""}（点击调整本场偏好）`}
        aria-label={t.review?.prefsTitle ?? "本场偏好"}
        aria-expanded={prefsOpen}
        onclick={onTogglePrefs}
    >
        <LvIcon name="book" size={13} />
        <span class="lv-scope-summary-text">{scopeSummaryLabel}{#if purposeLabel && purpose !== "review"} · {purposeLabel}{/if}</span>
        {#if hasOverrides}<span aria-hidden="true">●</span>{/if}
    </button>

    <button
        type="button"
        class="b3-button b3-button--small lv-btn-ghost lv-tool-btn lv-cram-btn"
        class:lv-cram-btn-active={isCramMode}
        title={isCramMode ? "⚡ 突击快刷模式中（排期保护）" : "⚡ 考前突击快刷"}
        aria-label="考前突击快刷"
        disabled={actionBusy}
        onclick={onOpenCramModal}
        data-testid="review-tb-cram-btn"
    >
        <LvIcon name="zap" size={13} />
        <span class="lv-tool-btn-label">
            {#if isCramMode}
                突击中
            {:else}
                <span class="lv-cram-label-full">⚡ 考前突击快刷</span>
                <span class="lv-cram-label-short">⚡ 快刷</span>
            {/if}
        </span>
    </button>

    <div class="fn__flex-1"></div>

    <!-- 阶段 B · I2：顶栏右侧严格只常驻 5 个高频按钮（撤销、跳过、编辑、星标、更多） -->
    <button
        type="button"
        class="b3-button b3-button--small lv-btn-ghost lv-tool-btn"
        title={t.review?.undoTitle ?? "撤销上一张评分 (P/Q)"}
        aria-label={t.review?.undoTitle ?? "撤销上一张评分 (P/Q)"}
        aria-keyshortcuts="p q"
        disabled={actionBusy}
        onclick={onUndo}
    >
        <LvIcon name="refresh" size={13} />
        <span class="lv-tool-btn-label">{t.review?.tbUndo ?? "撤销"}</span>
    </button>

    <button
        type="button"
        class="b3-button b3-button--small lv-btn-ghost lv-tool-btn"
        title={`${t.review?.skip ?? "跳过"} (X)`}
        aria-label={t.review?.skip ?? "跳过"}
        aria-keyshortcuts="x 0"
        disabled={actionBusy}
        onclick={onSkip}
    >
        <LvIcon name="chevron-right" size={13} />
        <span class="lv-tool-btn-label">{t.review?.skip ?? "跳过"}</span>
    </button>

    <button
        type="button"
        class="b3-button b3-button--small lv-btn-ghost lv-tool-btn"
        title={hasSvgCanvas && onOpenCanvasInEditor
            ? (t.review?.canvasDoubleClickTip ?? "编辑画布 (E)")
            : `${t.review?.openInEditor ?? "在编辑器中打开"} (E)`}
        aria-label={hasSvgCanvas && onOpenCanvasInEditor
            ? "编辑画布"
            : (t.review?.openInEditor ?? "在编辑器中打开")}
        aria-keyshortcuts="e"
        disabled={!current || actionBusy}
        onclick={handleEditClick}
    >
        <LvIcon name="edit" size={13} />
        <span class="lv-tool-btn-label">{hasSvgCanvas && onOpenCanvasInEditor ? (t.review?.tbEditCanvas ?? "画布") : (t.review?.tbEdit ?? "编辑")}</span>
    </button>
    </div>

    <button
        type="button"
        class="b3-button b3-button--small lv-btn-ghost lv-tool-btn lv-tool-btn--pinned"
        class:lv-btn-starred={isStarred}
        title="星标重点卡片 (*)"
        aria-label="星标重点卡片"
        aria-keyshortcuts="*"
        aria-pressed={isStarred}
        disabled={!current || actionBusy}
        onclick={onToggleStar}
    >
        <LvIcon name="star" size={14} />
        <span class="lv-tool-btn-label">{isStarred ? "已星标" : "星标"}</span>
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
            ··· <span class="lv-tool-btn-label">{t.review?.tbMore ?? "更多"}</span>
        </button>

        {#if showMoreToolbar}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="lv-toolbar-more-scrim" onclick={() => (showMoreToolbar = false)}></div>
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <div
                class="lv-toolbar-more-menu"
                role="group"
                aria-label={t.review?.tbMoreDesc ?? "更多动作"}
                bind:this={moreMenuEl}
                onkeydown={handleMoreMenuKeydown}
            >
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
                    class:lv-active={isCramMode}
                    disabled={actionBusy}
                    title="⚡ 考前突击快刷"
                    onclick={() => { onOpenCramModal(); showMoreToolbar = false; }}
                    data-testid="review-menu-cram-btn"
                >
                    <span class="lv-menu-icon"><LvIcon name="zap" size={16} /></span>
                    <span>{isCramMode ? "⚡ 突击快刷中（排期保护）" : "⚡ 考前突击快刷…"}</span>
                </button>

                <button
                    type="button"
                    class="lv-toolbar-menu-item"
                    disabled={actionBusy}
                    title={t.review?.pauseTitle ?? "暂停这场复习"}
                    aria-label={t.review?.pauseTitle ?? "暂停这场复习"}
                    onclick={() => { onPause(); showMoreToolbar = false; }}
                >
                    <span class="lv-menu-icon"><LvIcon name="moon" size={16} /></span>
                    <span>{t.review?.tbPause ?? "暂停本场"}</span>
                </button>

                <!-- 阶段 B · I1：将“今天不学 / 归档隐藏 / 移出卡组”收口为单一“移出复习…”入口 -->
                <button
                    type="button"
                    class="lv-toolbar-menu-item lv-menu-danger"
                    disabled={!current || actionBusy}
                    title={t.review?.retireCard ?? "移出复习…"}
                    onclick={() => { onOpenRetireModal(); showMoreToolbar = false; }}
                >
                    <span class="lv-menu-icon"><LvIcon name="ban" size={16} /></span>
                    <span>{t.review?.retireCard ?? "移出复习…"}</span>
                </button>

                <div class="lv-toolbar-menu-divider"></div>

                <button
                    type="button"
                    class="lv-toolbar-menu-item"
                    class:lv-active={isMarkedIssue}
                    disabled={!current || actionBusy || isMarkedIssue}
                    title={isMarkedIssue ? (t.review?.issueMarked ?? "已标记疑问") : (t.review?.tbMarkIssue ?? "标记疑问")}
                    aria-label={t.review?.tbMarkIssue ?? "标记疑问"}
                    aria-pressed={isMarkedIssue}
                    onclick={() => { onToggleMarkIssue(); showMoreToolbar = false; }}
                >
                    <span class="lv-menu-icon"><LvIcon name="flag" size={16} /></span>
                    <span>{isMarkedIssue ? (t.review?.issueMarked ?? "已标记疑问") : (t.review?.tbMarkIssue ?? "标记疑问")}</span>
                </button>

                <button
                    type="button"
                    class="lv-toolbar-menu-item"
                    disabled={!current || actionBusy}
                    title={`${t.review?.tbMemo ?? "助记便签"} (M)`}
                    aria-keyshortcuts="m"
                    onclick={() => { onOpenMemoEditor(); showMoreToolbar = false; }}
                >
                    <span class="lv-menu-icon"><LvIcon name="lightbulb" size={16} /></span>
                    <span>{t.review?.tbMemo ?? "助记便签"}</span>
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
                    class:lv-active={reversedRecall}
                    title={t.review?.enableReversed ?? "翻转问答自测 (R)"}
                    aria-keyshortcuts="r"
                    onclick={() => { reversedRecall = !reversedRecall; showMoreToolbar = false; }}
                >
                    <span class="lv-menu-icon"><LvIcon name="refresh" size={16} /></span>
                    <span>{reversedRecall ? (t.review?.cancelReversed ?? "恢复正常顺序") : (t.review?.enableReversed ?? "翻转问答自测 (R)")}</span>
                </button>

                <button
                    type="button"
                    class="lv-toolbar-menu-item"
                    class:lv-active={zenMode}
                    title="沉浸专注模式 (Z)"
                    aria-keyshortcuts="z"
                    onclick={() => { zenMode = !zenMode; showMoreToolbar = false; }}
                >
                    <span class="lv-menu-icon"><LvIcon name="eye" size={16} /></span>
                    <span>{zenMode ? "退出专注模式 (Z)" : "沉浸专注模式 (Z)"}</span>
                </button>

                <button
                    type="button"
                    class="lv-toolbar-menu-item"
                    disabled={!lastAnswered}
                    title={`${t.review?.peekPrev ?? "回看上一张"} ([)`}
                    aria-keyshortcuts="["
                    onclick={() => { onTogglePeek(); showMoreToolbar = false; }}
                >
                    <span class="lv-menu-icon"><LvIcon name="eye" size={16} /></span>
                    <span>{t.review?.peekPrev ?? "回看上一张"}</span>
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

                <div class="lv-toolbar-font-row" role="group" aria-label={t.review?.fontScaleTitle ?? "调整卡面字号"}>
                    <span class="lv-toolbar-font-label">{t.review?.fontScaleTitle ?? "卡面字号"}</span>
                    <div class="fn__flex-1"></div>
                    <button type="button" class="b3-button b3-button--small b3-button--outline lv-font-btn" title="缩小卡面字号" aria-label="缩小卡面字号" onclick={() => onAdjustFontScale(-0.1)}>A−</button>
                    <button type="button" class="b3-button b3-button--small b3-button--outline lv-font-btn" title="放大卡面字号" aria-label="放大卡面字号" onclick={() => onAdjustFontScale(0.1)}>A+</button>
                </div>

                <div class="lv-toolbar-menu-divider"></div>

                <button
                    type="button"
                    class="lv-toolbar-menu-item"
                    title={t.review?.helpTitle ?? "快捷键帮助"}
                    aria-keyshortcuts="?"
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
        gap: calc(var(--lv-space-unit) * 2);
        min-width: 0;
        width: 100%;
        flex-wrap: nowrap;

        .lv-head-tools-scroll {
            display: flex;
            align-items: center;
            gap: calc(var(--lv-space-unit) * 2);
            flex: 1 1 0;
            min-width: 0;
            flex-wrap: nowrap;
            overflow-x: auto;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;

            &::-webkit-scrollbar {
                display: none;
            }
        }

        .b3-button,
        .lv-tool-btn,
        .lv-scope-summary,
        .lv-font-btn,
        .lv-toolbar-menu-item {
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }
        }

        .lv-scope-summary {
            height: 28px;
            max-width: 220px;
            box-sizing: border-box;
            padding: 0 calc(var(--lv-space-unit) * 3 + var(--lv-space-hairline));
            border-radius: var(--lv-r-pill);
            background: var(--lv-color-surface);
            border: 1px solid var(--lv-border);
            color: var(--lv-color-text-muted);
            display: inline-flex;
            align-items: center;
            gap: calc(var(--lv-space-unit) * 2);
            font-size: var(--lv-type-meta-size);
            min-width: 0;
            flex-shrink: 1;

            .lv-scope-summary-text {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            &:hover,
            &.lv-active {
                border-color: var(--lv-color-brand);
                color: var(--lv-color-brand);
                background: color-mix(in srgb, var(--lv-color-brand) 6%, var(--lv-color-surface));
            }
        }

        .lv-tool-btn {
            height: 28px;
            box-sizing: border-box;
            padding: 0 calc(var(--lv-space-unit) * 3 + var(--lv-space-hairline));
            border-radius: var(--lv-r-pill);
            background: var(--lv-color-surface);
            border: 1px solid var(--lv-border);
            color: var(--lv-color-text-muted);
            white-space: nowrap;
            flex-shrink: 0;
            display: inline-flex;
            align-items: center;
            gap: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline));
            font-size: var(--lv-type-meta-size);
            box-shadow: 0 1px 2px color-mix(in srgb, black 3%, transparent);
            transition: all var(--lv-dur-1) var(--lv-ease);

            &:hover:not(:disabled) {
                border-color: var(--lv-color-brand);
                color: var(--lv-color-brand);
                background: color-mix(in srgb, var(--lv-color-brand) 6%, var(--lv-color-surface));
            }

            &.lv-cram-btn {
                color: var(--lv-color-warning);
                :global(svg) {
                    color: var(--lv-color-warning);
                }

                .lv-cram-label-short {
                    display: none;
                }

                @media (max-width: 900px) {
                    .lv-cram-label-full { display: none; }
                    .lv-cram-label-short { display: inline; }
                }
                @container (max-width: 900px) {
                    .lv-cram-label-full { display: none; }
                    .lv-cram-label-short { display: inline; }
                }

                &:hover:not(:disabled) {
                    border-color: var(--lv-color-warning);
                    color: var(--lv-color-on-warning-soft);
                    background: var(--lv-warn-soft);
                }

                &.lv-cram-btn-active {
                    border-color: var(--lv-color-warning);
                    background: var(--lv-warn-soft);
                    color: var(--lv-color-on-warning-soft);
                    font-weight: var(--lv-fw-semibold, 600);
                }
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
            min-width: 200px;
            max-width: min(260px, calc(100vw - 24px));
            max-height: min(68vh, 420px);
            overflow-y: auto;
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

        .lv-toolbar-font-row {
            display: flex;
            align-items: center;
            gap: var(--lv-sp-1);
            padding: calc(var(--lv-space-unit) * 1) calc(var(--lv-space-unit) * 3);
            font-size: var(--lv-type-control-size);
            color: var(--lv-color-text-muted);

            .lv-font-btn {
                min-width: 30px;
                height: 24px;
                padding: 0 calc(var(--lv-space-unit) * 2);
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

    @media (max-width: 640px) {
        .lv-head-tools {
            gap: var(--lv-sp-1);
            .lv-head-tools-scroll { gap: var(--lv-sp-1); }
            .lv-scope-summary {
                max-width: 112px;
                padding: 0 var(--lv-sp-2);
            }
            .lv-tool-btn-label { display: none; }
            .lv-tool-btn {
                min-width: 30px;
                padding: 0 calc(var(--lv-space-unit) * 2);
                justify-content: center;
            }
        }
    }
    @container (max-width: 640px) {
        .lv-head-tools {
            gap: var(--lv-sp-1);
            .lv-head-tools-scroll { gap: var(--lv-sp-1); }
            .lv-scope-summary {
                max-width: 112px;
                padding: 0 var(--lv-sp-2);
            }
            .lv-tool-btn-label { display: none; }
            .lv-tool-btn {
                min-width: 30px;
                padding: 0 calc(var(--lv-space-unit) * 2);
                justify-content: center;
            }
        }
    }
</style>
