<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { Protyle } from "siyuan";
    import LvIcon from "../kit/LvIcon.svelte";
    import type { DocReviewItem } from "@/core/document-review";

    interface Props {
        docItem: DocReviewItem;
        t: any;
        onRate: (rating: 1 | 2 | 3 | 4) => void;
        onSnooze: (days: number) => void;
        onRemove: () => void;
        onClose?: () => void;
    }

    let {
        docItem,
        t,
        onRate = () => {},
        onSnooze = () => {},
        onRemove = () => {},
        onClose = () => {},
    }: Props = $props();

    let protyleContainer = $state<HTMLElement | null>(null);
    let protyleInstance: any = null;
    let isProtyleLoaded = $state(false);

    function initProtyle(targetDocId: string) {
        if (!targetDocId || !protyleContainer) return;

        // 若已有实例，先销毁
        if (protyleInstance) {
            try {
                protyleInstance.destroy?.();
            } catch {}
            protyleInstance = null;
        }

        const app = (window as any).siyuan?.ws?.app || (window as any).siyuan?.app || (window as any).app;
        const ProtyleClass = (typeof Protyle !== "undefined" ? Protyle : null)
            || (window as any).__lvSiyuan?.Protyle
            || (window as any).siyuan?.Protyle
            || (window as any).Protyle;

        if (app && ProtyleClass) {
            try {
                protyleInstance = new ProtyleClass(app, protyleContainer, {
                    blockId: targetDocId,
                    render: {
                        background: false,
                        title: true,
                        gutter: true,
                        scroll: true,
                        breadcrumb: true,
                    },
                    action: ["cb-get-hl"],
                });
                isProtyleLoaded = true;
            } catch (err) {
                console.warn("[siyuan-lv-cards] 初始化 Protyle 失败，降级展示", err);
                isProtyleLoaded = false;
            }
        } else {
            isProtyleLoaded = false;
        }
    }

    $effect(() => {
        if (docItem.docId && protyleContainer) {
            initProtyle(docItem.docId);
        }
    });

    function handleKeyDown(e: KeyboardEvent) {
        if (e.isComposing || e.keyCode === 229) return;
        const target = e.target as HTMLElement;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
            return;
        }

        if (e.key === "1") {
            e.preventDefault();
            onRate(1);
        } else if (e.key === "2") {
            e.preventDefault();
            onRate(2);
        } else if (e.key === "3") {
            e.preventDefault();
            onRate(3);
        } else if (e.key === "4") {
            e.preventDefault();
            onRate(4);
        } else if (e.code === "Space" || e.key === " ") {
            if (protyleContainer) {
                e.preventDefault();
                const scrollEl = protyleContainer.querySelector(".protyle-content") || protyleContainer;
                const scrollDelta = window.innerHeight * 0.7;
                scrollEl.scrollBy({ top: e.shiftKey ? -scrollDelta : scrollDelta, behavior: "smooth" });
            }
        }
    }

    onMount(() => {
        window.addEventListener("keydown", handleKeyDown);
    });

    onDestroy(() => {
        if (typeof window !== "undefined") {
            window.removeEventListener("keydown", handleKeyDown);
        }
        if (protyleInstance) {
            try {
                protyleInstance.destroy?.();
            } catch {}
            protyleInstance = null;
        }
    });
</script>

<div class="lv-doc-canvas-wrapper" data-prevent-swipe="true">
    <!-- 玻璃拟态顶部悬浮复习控制台 (Desktop Sticky / Mobile Fixed) -->
    <header class="lv-doc-floating-bar" data-prevent-swipe="true">
        <div class="lv-doc-meta-info">
            <span class="lv-doc-tag">
                <LvIcon name="book" size={13} />
                <span>{t.docReviewBadge ?? "文档温故"}</span>
            </span>
            <span class="lv-doc-title-text" title={docItem.title}>{docItem.title}</span>
            <span class="lv-doc-interval-badge">
                已温故 {docItem.reps} 次 · 当前间隔 {docItem.intervalDays} 天
            </span>
        </div>

        <div class="lv-doc-actions-cluster">
            <div class="lv-doc-rate-buttons">
                <button
                    type="button"
                    class="lv-doc-btn is-rate is-again"
                    onclick={() => onRate(1)}
                    title="重读 (1)"
                >
                    <span class="lv-rate-kbd">1</span>
                    <span>重读</span>
                </button>
                <button
                    type="button"
                    class="lv-doc-btn is-rate is-hard"
                    onclick={() => onRate(2)}
                    title="需加强 (2)"
                >
                    <span class="lv-rate-kbd">2</span>
                    <span>需加强</span>
                </button>
                <button
                    type="button"
                    class="lv-doc-btn is-rate is-good"
                    onclick={() => onRate(3)}
                    title="顺畅 (3)"
                >
                    <span class="lv-rate-kbd">3</span>
                    <span>顺畅</span>
                </button>
                <button
                    type="button"
                    class="lv-doc-btn is-rate is-easy"
                    onclick={() => onRate(4)}
                    title="精通 (4)"
                >
                    <span class="lv-rate-kbd">4</span>
                    <span>精通</span>
                </button>
            </div>

            <div class="lv-doc-aux-buttons">
                <button
                    type="button"
                    class="lv-doc-btn is-aux"
                    onclick={() => onSnooze(7)}
                    title={t.docReviewSnooze ?? "延期 7 天"}
                >
                    <LvIcon name="timer" size={12} />
                    <span>{t.docReviewSnooze ?? "延期 7 天"}</span>
                </button>
                <button
                    type="button"
                    class="lv-doc-btn is-aux is-remove"
                    onclick={onRemove}
                    title={t.menuRemoveDocReview ?? "移出温故"}
                >
                    <LvIcon name="ban" size={12} />
                    <span>移出</span>
                </button>
                <button
                    type="button"
                    class="lv-doc-btn is-aux"
                    onclick={onClose}
                    title="返回卡片复习"
                >
                    <LvIcon name="close" size={12} />
                    <span>返回</span>
                </button>
            </div>
        </div>
    </header>

    <!-- 原生 Protyle 容器长文阅读画布 -->
    <main class="lv-doc-protyle-host">
        <div bind:this={protyleContainer} class="lv-doc-protyle-container">
            {#if !isProtyleLoaded}
                <!-- 纯 Node 单测或未初始化 Protyle 时的降级阅读面板 -->
                <div class="lv-doc-fallback-view">
                    <div class="lv-doc-fallback-header">
                        <h2>{docItem.title}</h2>
                        <div class="lv-doc-fallback-path">{docItem.hpath}</div>
                    </div>
                    <div class="lv-doc-fallback-body">
                        <p class="lv-fallback-tip">
                            （整篇文档温故模式：已连接思源原生编辑器；若需修改正文或选中文字按 <code>==</code> / <code>/qa</code> 制卡，可直接在长文内操作）
                        </p>
                    </div>
                </div>
            {/if}
        </div>
    </main>
</div>

<style lang="scss">
    .lv-doc-canvas-wrapper {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 500px;
        box-sizing: border-box;
        overflow: hidden;
        background: var(--b3-theme-background, var(--lv-color-canvas, #ffffff));
    }

    .lv-doc-floating-bar {
        position: sticky;
        top: 0;
        z-index: 50;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 10px 20px;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        background: color-mix(in srgb, var(--b3-theme-background, #fff) 88%, transparent);
        border-bottom: 1px solid var(--lv-border, rgba(0, 0, 0, 0.08));
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
        box-sizing: border-box;
    }

    .lv-doc-meta-info {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        flex: 1;
    }

    .lv-doc-tag {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
        font-weight: 600;
        color: var(--lv-color-brand, var(--b3-theme-primary, #0284c7));
        background: color-mix(in srgb, var(--lv-color-brand, var(--b3-theme-primary, #0284c7)) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--lv-color-brand, var(--b3-theme-primary, #0284c7)) 25%, transparent);
        padding: 3px 10px;
        border-radius: 999px;
        flex-shrink: 0;
    }

    .lv-doc-title-text {
        font-size: 14px;
        font-weight: 600;
        color: var(--lv-color-text, currentColor);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 260px;
    }

    .lv-doc-interval-badge {
        font-size: 12px;
        color: var(--lv-color-text-muted, #777);
        flex-shrink: 0;
    }

    .lv-doc-actions-cluster {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
    }

    .lv-doc-rate-buttons {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .lv-doc-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        border-radius: 6px;
        border: 1px solid var(--lv-border, rgba(0, 0, 0, 0.1));
        background: color-mix(in srgb, var(--lv-color-canvas, #fff) 90%, transparent);
        color: var(--lv-color-text, currentColor);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        touch-action: manipulation;
        transition: transform 0.1s ease, background 0.15s ease, border-color 0.15s ease;

        &:active {
            transform: scale(0.96);
        }

        &.is-again {
            &:hover {
                color: var(--b3-theme-error, var(--lv-color-danger, #ef4444));
                border-color: var(--b3-theme-error, var(--lv-color-danger, #ef4444));
                background: color-mix(in srgb, var(--b3-theme-error, var(--lv-color-danger, #ef4444)) 10%, transparent);
            }
        }

        &.is-hard {
            &:hover {
                color: var(--b3-theme-warning, var(--lv-color-warning, #f59e0b));
                border-color: var(--b3-theme-warning, var(--lv-color-warning, #f59e0b));
                background: color-mix(in srgb, var(--b3-theme-warning, var(--lv-color-warning, #f59e0b)) 10%, transparent);
            }
        }

        &.is-good {
            &:hover {
                color: var(--b3-theme-success, var(--lv-color-success, #10b981));
                border-color: var(--b3-theme-success, var(--lv-color-success, #10b981));
                background: color-mix(in srgb, var(--b3-theme-success, var(--lv-color-success, #10b981)) 10%, transparent);
            }
        }

        &.is-easy {
            &:hover {
                color: var(--b3-theme-primary, var(--lv-color-brand, #3b82f6));
                border-color: var(--b3-theme-primary, var(--lv-color-brand, #3b82f6));
                background: color-mix(in srgb, var(--b3-theme-primary, var(--lv-color-brand, #3b82f6)) 10%, transparent);
            }
        }

        &.is-aux {
            color: var(--lv-color-text-muted, #666);
            font-size: 12px;
            padding: 6px 10px;

            &:hover {
                color: var(--lv-color-brand, var(--b3-theme-primary, #6366f1));
                background: color-mix(in srgb, var(--lv-color-brand, var(--b3-theme-primary, #6366f1)) 8%, transparent);
            }

            &.is-remove:hover {
                color: var(--lv-color-danger, #ef4444);
                background: color-mix(in srgb, var(--lv-color-danger, #ef4444) 10%, transparent);
            }
        }
    }

    .lv-rate-kbd {
        display: inline-block;
        padding: 1px 5px;
        font-size: 10px;
        font-family: monospace;
        font-weight: 700;
        border-radius: 3px;
        background: color-mix(in srgb, var(--lv-color-canvas, #fff) 80%, rgba(0,0,0,0.06));
        border: 1px solid var(--lv-border, rgba(0, 0, 0, 0.15));
    }

    .lv-doc-aux-buttons {
        display: flex;
        align-items: center;
        gap: 6px;
        border-left: 1px solid var(--lv-border, rgba(0, 0, 0, 0.1));
        padding-left: 10px;
    }

    .lv-doc-protyle-host {
        flex: 1;
        width: 100%;
        overflow-y: auto;
        display: flex;
        justify-content: center;
        box-sizing: border-box;
    }

    .lv-doc-protyle-container {
        width: 100%;
        max-width: 920px;
        min-height: 100%;
        box-sizing: border-box;
        padding: 16px 24px 80px;
    }

    .lv-doc-fallback-view {
        padding: 24px;
        max-width: 800px;
        margin: 40px auto;
        border: 1px solid var(--lv-border, rgba(0, 0, 0, 0.1));
        border-radius: 8px;
        background: color-mix(in srgb, var(--lv-color-canvas, #fff) 95%, transparent);
    }

    .lv-doc-fallback-header h2 {
        margin: 0 0 8px;
        font-size: 1.4rem;
    }

    .lv-doc-fallback-path {
        color: var(--lv-color-text-muted, #777);
        font-size: 13px;
        margin-bottom: 20px;
    }

    .lv-fallback-tip {
        line-height: 1.6;
        color: var(--lv-color-text-muted, #666);
    }

    @media (max-width: 768px) {
        .lv-doc-floating-bar {
            position: fixed;
            top: auto;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
            flex-direction: column;
            gap: 8px;
            box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08);
        }

        .lv-doc-meta-info {
            width: 100%;
            justify-content: space-between;
        }

        .lv-doc-title-text {
            max-width: 160px;
        }

        .lv-doc-actions-cluster {
            width: 100%;
            justify-content: space-between;
        }

        .lv-doc-rate-buttons {
            flex: 1;
            justify-content: space-between;
        }

        .lv-doc-btn {
            min-height: 44px;
            padding: 8px 10px;
        }

        .lv-doc-protyle-container {
            max-width: 100%;
            padding: 12px 10px 140px;
        }
    }
</style>
