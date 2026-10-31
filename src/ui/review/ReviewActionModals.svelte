<script lang="ts">
    import LvIcon from "@/ui/kit/LvIcon.svelte";
    import { trapFocus } from "@/libs/focus-trap";

    let {
        t,
        showPauseModal = false,
        showSessionOptionsModal = false,
        showMemoEditor = false,
        showRetireModal = false,
        zoomedImage = null,
        reviewedCount = 0,
        skippedCount = 0,
        tempAnswerVariant = "normal",
        memoDraft = "",
        memoSaving = false,
        retireBusy = false,
        dismissBusy = false,
        onClosePause,
        onConfirmPause,
        onCloseSessionOptions,
        onApplySessionOptions,
        onCloseMemoEditor,
        onSaveMemo,
        onCloseRetireModal,
        onConfirmRetire,
        onSuspendToday,
        onDismissCard,
        onCloseZoomedImage,
    }: {
        t: any;
        showPauseModal?: boolean;
        showSessionOptionsModal?: boolean;
        showMemoEditor?: boolean;
        showRetireModal?: boolean;
        zoomedImage?: { src: string; alt?: string } | null;
        reviewedCount?: number;
        skippedCount?: number;
        tempAnswerVariant?: "normal" | "choice" | "typing";
        memoDraft?: string;
        memoSaving?: boolean;
        retireBusy?: boolean;
        dismissBusy?: boolean;
        onClosePause: () => void;
        onConfirmPause: () => void;
        onCloseSessionOptions: () => void;
        onApplySessionOptions: (variant: "normal" | "choice" | "typing") => void;
        onCloseMemoEditor: () => void;
        onSaveMemo: (memo: string) => void;
        onCloseRetireModal: () => void;
        onConfirmRetire: () => void;
        onSuspendToday?: () => void;
        onDismissCard?: () => void;
        onCloseZoomedImage: () => void;
    } = $props();

    // 灯箱缩放与平移状态
    let imgScale = $state(1);
    let imgPanX = $state(0);
    let imgPanY = $state(0);
    let isDraggingImg = $state(false);
    let dragStartX = 0;
    let dragStartY = 0;
    let lightboxEl = $state<HTMLElement | null>(null);

    const cancelLabel = $derived(
        (typeof window !== "undefined" && (window as any).siyuan?.languages?.cancel)
            ? (window as any).siyuan.languages.cancel
            : "Cancel"
    );

    $effect(() => {
        if (!zoomedImage || !lightboxEl) return;
        const trap = trapFocus(lightboxEl, { onEscape: onCloseZoomedImage, restoreOnRelease: false });
        return () => trap.release();
    });

    $effect(() => {
        if (zoomedImage) {
            imgScale = 1;
            imgPanX = 0;
            imgPanY = 0;
        }
    });

    function onLightboxWheel(e: WheelEvent) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        imgScale = Math.min(4, Math.max(0.5, Math.round((imgScale + delta) * 100) / 100));
    }

    function onLightboxPointerDown(e: PointerEvent) {
        if (e.button !== 0) return;
        isDraggingImg = true;
        dragStartX = e.clientX - imgPanX;
        dragStartY = e.clientY - imgPanY;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }

    function onLightboxPointerMove(e: PointerEvent) {
        if (!isDraggingImg) return;
        imgPanX = e.clientX - dragStartX;
        imgPanY = e.clientY - dragStartY;
    }

    function onLightboxPointerUp() {
        isDraggingImg = false;
    }

    function onImageDblClick() {
        imgScale = 1;
        imgPanX = 0;
        imgPanY = 0;
    }
</script>

{#if showPauseModal}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="lv-modal-backdrop lv-glass" tabindex="-1" onclick={onClosePause}>
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="lv-pause-dialog lv-card2" role="dialog" aria-modal="true" aria-label={t.review?.pauseTitle ?? "暂停这场复习"} tabindex="-1" use:trapFocus={{ onEscape: onClosePause }} onclick={(e) => e.stopPropagation()}>
            <div class="lv-help-head">
                <span style="font-weight: var(--lv-fw-semibold); font-size: var(--lv-type-title-size)">{t.review?.pauseTitle ?? "暂停这场复习"}</span>
                <div class="fn__flex-1"></div>
                <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" aria-label={cancelLabel} onclick={onClosePause}><LvIcon name="close" size={13} /></button>
            </div>
            <div style="padding: var(--lv-sp-3) 0">
                <p class="ft__smaller ft__on-surface" style="line-height: var(--lv-lh-reading)">{t.review?.pauseDesc ?? "当前范围、进度与本场偏好已安全保留。"}</p>
                <div style="margin-top: var(--lv-sp-2); font-size: var(--lv-type-control-size); color: var(--lv-color-brand); font-variant-numeric: tabular-nums;">
                    {t.review?.doneConfirm ?? "已正式评分"}: <strong>{reviewedCount}</strong> · {t.review?.skipNotRated ?? "跳过"}: <strong>{skippedCount}</strong>
                </div>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: var(--lv-sp-2); margin-top: var(--lv-sp-3)">
                <button class="b3-button b3-button--text" onclick={onClosePause}>{t.review?.pauseContinue ?? "继续本场"}</button>
                <button class="b3-button lv-btn-primary" onclick={onConfirmPause}>{t.review?.pauseConfirm ?? "暂停并返回今日"}</button>
            </div>
        </div>
    </div>
{/if}

{#if showSessionOptionsModal}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="lv-modal-backdrop lv-glass" tabindex="-1" onclick={onCloseSessionOptions}>
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="lv-pause-dialog lv-card2" role="dialog" aria-modal="true" aria-label={t.review?.sessionOptionsTitle ?? "本场偏好"} tabindex="-1" use:trapFocus={{ onEscape: onCloseSessionOptions }} onclick={(e) => e.stopPropagation()}>
            <div class="lv-help-head">
                <span style="font-weight: var(--lv-fw-semibold); font-size: var(--lv-type-title-size)">{t.review?.sessionOptionsTitle ?? "本场偏好与出题形态"}</span>
                <div class="fn__flex-1"></div>
                <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" aria-label={cancelLabel} onclick={onCloseSessionOptions}><LvIcon name="close" size={13} /></button>
            </div>
            <div style="padding: var(--lv-sp-3) 0; display: flex; flex-direction: column; gap: var(--lv-sp-2)">
                <p class="ft__smaller ft__on-surface">{t.review?.sessionOptionsHint ?? "仅当前复习面板生效，切页后还原全局设置。"}</p>
                <label class="ft__smaller ft__on-surface" style="display: flex; align-items: center; gap: var(--lv-sp-2); margin-top: var(--lv-sp-1)">
                    <span>{t.review?.answerModeLabel ?? "作答方式"}</span>
                    <select class="b3-select fn__flex-1" bind:value={tempAnswerVariant}>
                        <option value="normal">{t.review?.modeRecall ?? "自由回忆"}</option>
                        <option value="choice">{t.review?.modeChoice ?? "选择题"}</option>
                        <option value="typing">{t.review?.modeTyping ?? "打字练习"}</option>
                    </select>
                </label>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: var(--lv-sp-2); margin-top: var(--lv-sp-3)">
                <button class="b3-button b3-button--text" onclick={onCloseSessionOptions}>取消</button>
                <button class="b3-button lv-btn-primary" onclick={() => onApplySessionOptions(tempAnswerVariant)}>{t.review?.applySessionOptions ?? "应用到本场"}</button>
            </div>
        </div>
    </div>
{/if}

{#if showMemoEditor}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="lv-modal-backdrop lv-glass" tabindex="-1" onclick={onCloseMemoEditor}>
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="lv-pause-dialog lv-card2" role="dialog" aria-modal="true" aria-label={t.review?.memoModalTitle ?? "助记便签"} tabindex="-1" use:trapFocus={{ onEscape: onCloseMemoEditor }} onclick={(e) => e.stopPropagation()}>
            <div class="lv-help-head">
                <span style="font-weight: var(--lv-fw-semibold); font-size: var(--lv-type-title-size)"><LvIcon name="lightbulb" size={17} /> {t.review?.memoModalTitle ?? "给未来的自己留助记线索"}</span>
                <div class="fn__flex-1"></div>
                <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" disabled={memoSaving} aria-label={cancelLabel} onclick={onCloseMemoEditor}><LvIcon name="close" size={13} /></button>
            </div>
            <div style="padding: var(--lv-sp-3) 0">
                <p class="ft__smaller ft__on-surface" style="line-height: var(--lv-lh-reading)">{t.review?.memoModalDesc ?? "写下一句巧记口诀、易错陷阱或关键关联。下次复习此卡时将直接呈现。"}</p>
                <textarea
                    class="b3-text-field fn__block"
                    rows="3"
                    style="margin-top: var(--lv-sp-2)"
                    placeholder={t.review?.memoPlaceholder ?? "例如：谐音记忆口诀、与某定理的对比..."}
                    aria-label="助记便签"
                    bind:value={memoDraft}
                    disabled={memoSaving}
                ></textarea>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: var(--lv-sp-2); margin-top: var(--lv-sp-3)">
                <button class="b3-button b3-button--text" disabled={memoSaving} onclick={onCloseMemoEditor}>取消</button>
                <button class="b3-button lv-btn-primary" disabled={memoSaving} onclick={() => onSaveMemo(memoDraft)}>
                    {memoSaving ? "保存中…" : (t.review?.memoSave ?? "保存便签")}
                </button>
            </div>
        </div>
    </div>
{/if}

{#if showRetireModal}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="lv-modal-backdrop lv-glass" tabindex="-1" onclick={() => { if (!retireBusy && !dismissBusy) onCloseRetireModal(); }}>
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="lv-pause-dialog lv-card2" role="dialog" aria-modal="true" aria-label={t.review?.retireCardTitle ?? "移出复习"} tabindex="-1" use:trapFocus={{ onEscape: () => { if (!retireBusy && !dismissBusy) onCloseRetireModal(); } }} onclick={(e) => e.stopPropagation()}>
            <div class="lv-help-head">
                <span style="font-weight: var(--lv-fw-semibold); font-size: var(--lv-type-title-size)"><LvIcon name="ban" size={17} /> {t.review?.retireCardTitle ?? "将此卡移出复习"}</span>
                <div class="fn__flex-1"></div>
                <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" disabled={retireBusy || dismissBusy} aria-label={cancelLabel} onclick={onCloseRetireModal}><LvIcon name="close" size={13} /></button>
            </div>
            <div style="padding: var(--lv-sp-3) 0; display: flex; flex-direction: column; gap: var(--lv-sp-2)">
                {#if onSuspendToday}
                    <div class="lv-remove-choice-row" style="display: flex; align-items: center; gap: var(--lv-sp-3); padding: var(--lv-sp-2) var(--lv-sp-3); border: 1px solid var(--lv-border); border-radius: var(--lv-r-s);">
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight: var(--lv-fw-semibold); font-size: var(--lv-type-control-size);">{t.review?.suspendToday ?? "今天不学"} <span class="ft__smaller ft__on-surface">(S)</span></div>
                            <div class="ft__smaller ft__on-surface" style="margin-top: 2px;">仅今日暂缓，明日自动回到到期队列，保留全部 FSRS 复习进度。</div>
                        </div>
                        <button type="button" class="b3-button b3-button--outline b3-button--small" disabled={retireBusy || dismissBusy} onclick={() => { onSuspendToday(); onCloseRetireModal(); }}>{t.review?.suspendToday ?? "今天不学"}</button>
                    </div>
                {/if}
                {#if onDismissCard}
                    <div class="lv-remove-choice-row" style="display: flex; align-items: center; gap: var(--lv-sp-3); padding: var(--lv-sp-2) var(--lv-sp-3); border: 1px solid var(--lv-border); border-radius: var(--lv-r-s);">
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight: var(--lv-fw-semibold); font-size: var(--lv-type-control-size);">归档隐藏 <span class="ft__smaller ft__on-surface">(Ctrl+D)</span></div>
                            <div class="ft__smaller ft__on-surface" style="margin-top: 2px;">保留内核 FSRS 进度，在本插件日常复习中不再出题（可按 P/Q 撤销或在卡库恢复；思源原生闪卡面板仍可见）。</div>
                        </div>
                        <button type="button" class="b3-button b3-button--outline b3-button--small" disabled={retireBusy || dismissBusy} onclick={() => { onDismissCard(); onCloseRetireModal(); }}>归档隐藏</button>
                    </div>
                {/if}
                <div class="lv-remove-choice-row" style="display: flex; align-items: center; gap: var(--lv-sp-3); padding: var(--lv-sp-2) var(--lv-sp-3); border: 1px solid color-mix(in srgb, var(--lv-color-danger) 30%, var(--lv-border)); border-radius: var(--lv-r-s); background: color-mix(in srgb, var(--lv-color-danger) 4%, transparent);">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: var(--lv-fw-semibold); font-size: var(--lv-type-control-size); color: var(--lv-color-danger);">移出卡组（清空排期进度）</div>
                        <div class="ft__smaller ft__on-surface" style="margin-top: 2px;">{t.review?.retireCardDesc ?? "从思源卡组彻底移除并清空该卡的内核 FSRS 复习进度（再次入组将按新卡从零重学；原笔记正文不受影响）。"}</div>
                    </div>
                    <button type="button" class="b3-button lv-btn-danger b3-button--small" disabled={retireBusy || dismissBusy} onclick={onConfirmRetire}>
                        {retireBusy ? "处理中…" : (t.review?.retireCardConfirm ?? "确认移出")}
                    </button>
                </div>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: var(--lv-sp-2); margin-top: var(--lv-sp-1)">
                <button class="b3-button b3-button--text" disabled={retireBusy || dismissBusy} onclick={onCloseRetireModal}>取消</button>
            </div>
        </div>
    </div>
{/if}

{#if zoomedImage}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
        class="lv-img-lightbox lv-glass"
        role="dialog"
        aria-modal="true"
        aria-label="图片全屏聚焦预览"
        tabindex="-1"
        bind:this={lightboxEl}
        onclick={onCloseZoomedImage}
        onwheel={onLightboxWheel}
    >
        <div class="lv-lightbox-toolbar" onclick={(e) => e.stopPropagation()} tabindex="-1">
            <button type="button" tabindex="-1" class="b3-button b3-button--small b3-button--text" title="缩小" aria-label="缩小图片" onclick={() => (imgScale = Math.max(0.5, Math.round((imgScale - 0.2) * 100) / 100))}>−</button>
            <span class="lv-lightbox-scale-num" title="双击图片还原">{Math.round(imgScale * 100)}%</span>
            <button type="button" tabindex="-1" class="b3-button b3-button--small b3-button--text" title="放大" aria-label="放大图片" onclick={() => (imgScale = Math.min(4, Math.round((imgScale + 0.2) * 100) / 100))}>+</button>
            <button type="button" tabindex="-1" class="b3-button b3-button--small b3-button--outline lv-lightbox-reset" title="还原 1:1" aria-label="还原图片原始比例 1:1" onclick={onImageDblClick}>1:1</button>
            <button type="button" class="b3-button b3-button--small lv-img-lightbox-close" aria-label={cancelLabel} onclick={onCloseZoomedImage}><LvIcon name="close" size={14} /></button>
        </div>

        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
            class="lv-img-lightbox-content"
            style={`transform: translate(${imgPanX}px, ${imgPanY}px) scale(${imgScale}); cursor: ${imgScale > 1 ? (isDraggingImg ? 'grabbing' : 'grab') : 'zoom-in'};`}
            onclick={(e) => e.stopPropagation()}
            ondblclick={onImageDblClick}
            onpointerdown={onLightboxPointerDown}
            onpointermove={onLightboxPointerMove}
            onpointerup={onLightboxPointerUp}
            onpointercancel={onLightboxPointerUp}
        >
            <img src={zoomedImage.src} alt={zoomedImage.alt ?? "Flashcard image preview"} draggable="false" />
        </div>
    </div>
{/if}

<style lang="scss">
    .lv-pause-dialog {
        .b3-button {
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }
        }

        .b3-select,
        .b3-text-field {
            touch-action: manipulation;
            transition: border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease);

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
                border-color: var(--lv-color-brand);
            }
        }

        .lv-help-head span {
            text-wrap: balance;
        }

        p {
            max-width: 48em;
            text-wrap: pretty;
            line-height: var(--lv-lh-reading, 1.65);
        }
    }

    .lv-lightbox-toolbar {
        position: absolute;
        top: 20px;
        right: 24px;
        z-index: var(--lv-z-popover);
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 3);
        padding: calc(var(--lv-space-unit) * 2) calc(var(--lv-space-unit) * 5);
        background: color-mix(in srgb, var(--lv-color-surface) 88%, black 12%);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-pill);
        box-shadow: var(--lv-shadow-float);

        .b3-button {
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }
        }

        .lv-lightbox-scale-num {
            font-size: var(--lv-type-control-size);
            font-weight: var(--lv-fw-semibold);
            color: var(--lv-color-text);
            min-width: 44px;
            text-align: center;
            user-select: none;
            font-variant-numeric: tabular-nums;
        }

        .lv-lightbox-reset {
            font-size: var(--lv-type-meta-size);
            padding: calc(var(--lv-space-unit) * 1) calc(var(--lv-space-unit) * 3 + var(--lv-space-hairline));
            border-radius: var(--lv-r-pill);
        }
    }

    .lv-img-lightbox {
        position: fixed;
        inset: 0;
        z-index: var(--lv-z-modal-backdrop, 1000);
        background: rgba(0, 0, 0, 0.82);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--lv-sp-4);
        cursor: zoom-out;
        animation: lv-modal-pop var(--lv-dur-2) var(--lv-ease);

        .lv-img-lightbox-content {
            position: relative;
            max-width: 95vw;
            max-height: 92vh;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: default;

            img {
                max-width: 100%;
                max-height: 90vh;
                object-fit: contain;
                border-radius: var(--lv-r-m);
                box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
                user-select: none;
            }
        }

        .lv-img-lightbox-close {
            width: 28px;
            height: 28px;
            border-radius: var(--lv-r-circle);
            background: var(--lv-color-surface);
            color: var(--lv-color-text);
            display: grid;
            place-items: center;
            cursor: pointer;
            border: 1px solid var(--lv-border);
            &:hover {
                background: var(--lv-surface-hover);
                color: var(--lv-color-brand);
            }
        }
    }
</style>
