<script lang="ts">
    import LvIcon from "@/ui/kit/LvIcon.svelte";
    import { trapFocus } from "@/libs/focus-trap";
    import type { CramScope } from "@/core/cram-mode";

    interface Props {
        open?: boolean;
        t: any;
        initialScope?: CramScope;
        initialRandomOrder?: boolean;
        isCramActive?: boolean;
        onClose: () => void;
        onStart: (options: { scope: CramScope; randomOrder: boolean }) => void;
        onExitCram?: () => void;
    }

    let {
        open = false,
        t,
        initialScope = "all",
        initialRandomOrder = false,
        isCramActive = false,
        onClose,
        onStart,
        onExitCram,
    }: Props = $props();

    // svelte-ignore state_referenced_locally
    let selectedScope = $state<CramScope>(initialScope);
    // svelte-ignore state_referenced_locally
    let randomOrder = $state(initialRandomOrder);

    const cancelLabel = $derived(
        (typeof window !== "undefined" && (window as any).siyuan?.languages?.cancel)
            ? (window as any).siyuan.languages.cancel
            : (t?.cancel ?? "取消")
    );

    $effect(() => {
        if (open) {
            selectedScope = initialScope;
            randomOrder = initialRandomOrder;
        }
    });

    function handleStart() {
        onStart({ scope: selectedScope, randomOrder });
    }
</script>

{#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="lv-modal-backdrop lv-glass" tabindex="-1" onclick={onClose}>
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
            class="lv-cram-dialog lv-card2"
            role="dialog"
            aria-modal="true"
            aria-label="考前突击快刷"
            tabindex="-1"
            use:trapFocus={{ onEscape: onClose }}
            onclick={(e) => e.stopPropagation()}
            data-testid="cram-setup-modal"
        >
            <div class="lv-help-head">
                <span class="lv-cram-title">
                    <LvIcon name="zap" size={18} />
                    <span>考前突击快刷</span>
                </span>
                <div class="fn__flex-1"></div>
                <button
                    type="button"
                    class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                    aria-label={cancelLabel}
                    onclick={onClose}
                    data-testid="cram-modal-close-btn"
                >
                    <LvIcon name="close" size={13} />
                </button>
            </div>

            <div class="lv-cram-body">
                <div class="lv-cram-protection-notice">
                    <span class="lv-cram-protection-icon"><LvIcon name="target" size={16} /></span>
                    <div class="lv-cram-protection-text">
                        <strong>算法排期保护中</strong>
                        <span>评级纯过筛练习，绝不更新 due/stability/difficulty，绝不写 revlog，零污染长期记忆曲线。</span>
                    </div>
                </div>

                <div class="lv-cram-section">
                    <div class="lv-cram-section-label">突击刷题范围（三选一）</div>
                    <div class="lv-cram-scopes" role="radiogroup" aria-label="突击范围">
                        <button
                            type="button"
                            class="lv-cram-scope-opt"
                            class:lv-selected={selectedScope === "all"}
                            role="radio"
                            aria-checked={selectedScope === "all"}
                            onclick={() => (selectedScope = "all")}
                            data-testid="cram-scope-all"
                        >
                            <div class="lv-cram-scope-radio">
                                <span class="lv-radio-circle" class:lv-checked={selectedScope === "all"}></span>
                            </div>
                            <div class="lv-cram-scope-info">
                                <div class="lv-cram-scope-name">全部卡片</div>
                                <div class="lv-cram-scope-desc">当前卡组/全库所有闪卡无差别强化快刷</div>
                            </div>
                        </button>

                        <button
                            type="button"
                            class="lv-cram-scope-opt"
                            class:lv-selected={selectedScope === "weekDue"}
                            role="radio"
                            aria-checked={selectedScope === "weekDue"}
                            onclick={() => (selectedScope = "weekDue")}
                            data-testid="cram-scope-week"
                        >
                            <div class="lv-cram-scope-radio">
                                <span class="lv-radio-circle" class:lv-checked={selectedScope === "weekDue"}></span>
                            </div>
                            <div class="lv-cram-scope-info">
                                <div class="lv-cram-scope-name">本周待复习</div>
                                <div class="lv-cram-scope-desc">包含已逾期与未来 7 天内即将到期的卡片</div>
                            </div>
                        </button>

                        <button
                            type="button"
                            class="lv-cram-scope-opt"
                            class:lv-selected={selectedScope === "leech"}
                            role="radio"
                            aria-checked={selectedScope === "leech"}
                            onclick={() => (selectedScope = "leech")}
                            data-testid="cram-scope-leech"
                        >
                            <div class="lv-cram-scope-radio">
                                <span class="lv-radio-circle" class:lv-checked={selectedScope === "leech"}></span>
                            </div>
                            <div class="lv-cram-scope-info">
                                <div class="lv-cram-scope-name">仅水蛭卡 (lapses ≥ 5)</div>
                                <div class="lv-cram-scope-desc">集中突破遗忘 5 次及以上的高难易混淆顽固薄弱卡</div>
                            </div>
                        </button>
                    </div>
                </div>

                <div class="lv-cram-section">
                    <label class="lv-cram-checkbox-row">
                        <input
                            type="checkbox"
                            class="b3-switch fn__flex-center"
                            bind:checked={randomOrder}
                            data-testid="cram-random-order"
                        />
                        <span>随机乱序出题（打乱卡片顺序）</span>
                    </label>
                </div>
            </div>

            <div class="lv-cram-actions">
                {#if isCramActive && onExitCram}
                    <button
                        type="button"
                        class="b3-button b3-button--outline lv-btn-tool"
                        onclick={onExitCram}
                        data-testid="cram-exit-to-normal-btn"
                    >
                        退出突击，返回正常复习
                    </button>
                {/if}
                <div class="fn__flex-1"></div>
                <button type="button" class="b3-button b3-button--text" onclick={onClose}>
                    {cancelLabel}
                </button>
                <button
                    type="button"
                    class="b3-button lv-btn-primary lv-btn-cram-start"
                    onclick={handleStart}
                    data-testid="cram-start-btn"
                >
                    <LvIcon name="zap" size={14} />
                    <span>{isCramActive ? "应用并重新刷题" : "开始突击快刷"}</span>
                </button>
            </div>
        </div>
    </div>
{/if}

<style lang="scss">
    .lv-cram-dialog {
        width: min(520px, calc(100vw - 32px));
        max-height: calc(var(--lv-vv-h, 100dvh) - 32px);
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-3);
        padding: var(--lv-sp-4);
        padding-bottom: max(var(--lv-sp-4), env(safe-area-inset-bottom, 0px));
        background: var(--lv-color-surface);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-l);
        box-shadow: var(--lv-shadow-dialog);
    }

    .lv-cram-title {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: var(--lv-type-title-size);
        font-weight: var(--lv-fw-semibold);
        color: var(--lv-color-warning);

        :global(svg) {
            color: var(--lv-color-warning);
        }
    }

    .lv-cram-body {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-3);
    }

    .lv-cram-protection-notice {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 12px;
        border-radius: var(--lv-r-m);
        background: var(--lv-warn-soft);
        border: 1px solid color-mix(in srgb, var(--lv-color-warning) 35%, transparent);
        font-size: var(--lv-type-caption-size);
        line-height: var(--lv-lh-reading);

        .lv-cram-protection-icon {
            color: var(--lv-color-warning);
            margin-top: 1px;
            flex-shrink: 0;
        }

        .lv-cram-protection-text {
            display: flex;
            flex-direction: column;
            gap: 2px;

            strong {
                color: var(--lv-color-on-warning-soft);
            }
        }
    }

    .lv-cram-section {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);
    }

    .lv-cram-section-label {
        font-size: var(--lv-type-caption-size);
        font-weight: var(--lv-fw-medium);
        color: var(--lv-color-text-muted);
    }

    .lv-cram-scopes {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .lv-cram-scope-opt {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        border-radius: var(--lv-r-m);
        border: 1px solid var(--lv-border);
        background: var(--lv-color-canvas);
        cursor: pointer;
        text-align: left;
        min-height: 48px;
        touch-action: manipulation;
        transition: transform var(--lv-dur-fast) var(--lv-ease), background var(--lv-dur-fast) var(--lv-ease), border-color var(--lv-dur-fast) var(--lv-ease), box-shadow var(--lv-dur-fast) var(--lv-ease), color var(--lv-dur-fast) var(--lv-ease), opacity var(--lv-dur-fast) var(--lv-ease);

        &:hover {
            border-color: color-mix(in srgb, var(--lv-color-warning) 50%, var(--lv-border));
            background: color-mix(in srgb, var(--lv-color-warning) 6%, var(--lv-color-canvas));
        }

        &.lv-selected {
            border-color: var(--lv-color-warning);
            background: color-mix(in srgb, var(--lv-color-warning) 14%, var(--lv-color-surface));
            box-shadow: 0 0 0 1px var(--lv-color-warning);
        }
    }

    .lv-cram-scope-radio {
        flex-shrink: 0;

        .lv-radio-circle {
            display: inline-block;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            border: 2px solid var(--lv-border);
            position: relative;
            transition: transform var(--lv-dur-fast) var(--lv-ease), background var(--lv-dur-fast) var(--lv-ease), border-color var(--lv-dur-fast) var(--lv-ease), box-shadow var(--lv-dur-fast) var(--lv-ease), color var(--lv-dur-fast) var(--lv-ease), opacity var(--lv-dur-fast) var(--lv-ease);

            &.lv-checked {
                border-color: var(--lv-color-warning);
                background: var(--lv-color-warning);

                &::after {
                    content: "";
                    position: absolute;
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: var(--lv-color-on-warning);
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                }
            }
        }
    }

    .lv-cram-scope-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;

        .lv-cram-scope-name {
            font-size: var(--lv-type-body-size);
            font-weight: var(--lv-fw-medium);
            color: var(--lv-color-text);
        }

        .lv-cram-scope-desc {
            font-size: var(--lv-type-caption-size);
            color: var(--lv-color-text-muted);
            line-height: var(--lv-lh-reading);
        }
    }

    .lv-cram-checkbox-row {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: var(--lv-type-body-size);
        color: var(--lv-color-text);
        cursor: pointer;
        user-select: none;
        padding: 4px 0;
        min-height: 44px;
    }

    .lv-cram-actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--lv-sp-2);
        margin-top: var(--lv-sp-2);
        padding-top: var(--lv-sp-3);
        border-top: 1px solid var(--lv-border);

        .lv-btn-cram-start {
            background: var(--lv-color-warning);
            color: var(--lv-color-on-warning);
            border-color: var(--lv-color-warning);

            &:hover {
                background: color-mix(in srgb, var(--lv-color-warning) 85%, black);
                border-color: color-mix(in srgb, var(--lv-color-warning) 85%, black);
            }
        }
    }
</style>
