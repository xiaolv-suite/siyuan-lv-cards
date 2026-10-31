<script lang="ts">
    import { fade } from "svelte/transition";
    import LvIcon from "@/ui/kit/LvIcon.svelte";
    import { getMotionDuration } from "@/ui/kit/motion";
    import { maskMarkedAnswersForQuestion } from "@/core/card-face";
    import { trapFocus } from "@/libs/focus-trap";

    let {
        helpOpen = false,
        peek = null,
        t,
        onCloseHelp,
        onClosePeek,
    }: {
        helpOpen?: boolean;
        peek?: { html: string; revealed: boolean } | null;
        t: any;
        onCloseHelp: () => void;
        onClosePeek: () => void;
    } = $props();

    let helpEl = $state<HTMLElement | null>(null);

    $effect(() => {
        if (helpOpen && helpEl) {
            helpEl.focus();
        }
    });

    const cancelLabel = $derived(
        (typeof window !== "undefined" && (window as any).siyuan?.languages?.cancel)
            ? (window as any).siyuan.languages.cancel
            : "取消"
    );

    const shortcutRows = $derived([
        { k: "Space / Enter", d: t.review?.helpFlipRate ?? "翻面 / 默认评分" },
        { k: "Shift+Space", d: t.review?.helpRevealAll ?? "全部揭晓（跳过逐步回忆）" },
        { k: "A / B / C / D", d: "选择题选项点击或快捷作答" },
        { k: "T / F / Y / N (1 / 2)", d: "判断题正确 / 错误判定" },
        { k: "1-4 / ← ↓ → ↑", d: "自评打分（重来 / 困难 / 良好 / 简单）" },
        { k: "z", d: "沉浸专注模式（隐藏多余干扰）" },
        { k: "*", d: "快速星标收藏重点卡片" },
        { k: "r", d: t.review?.helpReverse ?? "翻转问答自测" },
        { k: "p / q", d: t.review?.helpUndo ?? "撤销上一张评分" },
        { k: "x / 0", d: t.review?.helpSkip ?? "跳过此卡" },
        { k: "s", d: t.review?.helpSuspend ?? "今日暂停" },
        { k: "Ctrl+D / ⌘+D", d: t.review?.helpDismiss ?? "归档隐藏此卡（可按 P/Q 撤销）" },
        { k: "m", d: t.review?.tbMemo ?? "助记便签" },
        { k: "[", d: t.review?.helpPeek ?? "回看上一张" },
        { k: "f", d: t.review?.helpReschedule ?? "快速改期" },
        { k: "e", d: t.review?.helpEdit ?? "打开思源原生编辑器" },
        { k: "h", d: t.review?.helpHint ?? "推进分级提示" },
        { k: "?", d: "打开 / 关闭快捷键帮助" },
    ]);
</script>

{#if helpOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
        class="lv-help lv-glass"
        tabindex="-1"
        bind:this={helpEl}
        use:trapFocus={{ onEscape: onCloseHelp }}
        transition:fade={{ duration: getMotionDuration("normal") }}
        onclick={(e: Event) => e.stopPropagation()}
        onkeydown={(e) => { if (e.key === "Escape" || e.key === "?") { e.stopPropagation(); onCloseHelp(); } }}
        role="dialog"
        aria-modal="true"
        aria-label={t.review?.helpTitle ?? "快捷键帮助"}
    >
        <div class="lv-help-head">
            <span>{t.review?.helpTitle ?? "快捷键帮助"}</span>
            <div class="fn__flex-1"></div>
            <button
                class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                aria-label={cancelLabel}
                aria-keyshortcuts="Escape"
                title={`${cancelLabel} (Esc)`}
                onclick={onCloseHelp}
            >
                <LvIcon name="close" size={13} />
            </button>
        </div>
        <div class="lv-help-body">
            {#each shortcutRows as row (row.k)}
                <div class="lv-help-row">
                    <span class="lv-kbd2">{row.k}</span>
                    <span class="fn__flex-1">{row.d}</span>
                </div>
            {/each}
        </div>
    </div>
{/if}

{#if peek}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
        class="lv-peek lv-glass"
        tabindex="-1"
        use:trapFocus={{ onEscape: onClosePeek }}
        transition:fade={{ duration: getMotionDuration("normal") }}
        onclick={(e: Event) => e.stopPropagation()}
        onkeydown={(e) => { if (e.key === "Escape" || e.key === "[") { e.stopPropagation(); onClosePeek(); } }}
        role="dialog"
        aria-modal="true"
        aria-label={t.review?.peekTitle ?? "回看上一张卡片"}
    >
        <div class="lv-peek-head">
            <span>{t.review?.peekTitle ?? "回看上一张卡片"}</span>
            <div class="fn__flex-1"></div>
            <button
                class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                aria-label={cancelLabel}
                aria-keyshortcuts="Escape"
                title={`${cancelLabel} (Esc)`}
                onclick={onClosePeek}
            >
                <LvIcon name="close" size={13} />
            </button>
        </div>
        <div class="lv-peek-body b3-typography lv-card-content" class:lv-masked={!peek.revealed}>
            {@html peek.revealed ? peek.html : maskMarkedAnswersForQuestion(peek.html)}
        </div>
    </div>
{/if}

<style lang="scss">
    .lv-peek {
        position: absolute;
        inset: var(--lv-sp-4) var(--lv-sp-5);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-l);
        box-shadow: var(--lv-shadow-2);
        display: flex;
        flex-direction: column;
        z-index: var(--lv-z-review-peek);
        overflow: hidden;
        .lv-peek-head {
            display: flex;
            align-items: center;
            gap: var(--lv-sp-2);
            padding: var(--lv-sp-2) var(--lv-sp-4);
            border-bottom: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent);
            font-size: var(--lv-type-control-size);
            color: var(--lv-color-text-muted);

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
        .lv-peek-body {
            flex: 1;
            overflow: auto;
            overscroll-behavior: contain;
            padding: var(--lv-sp-4);
        }
    }

    .lv-help {
        position: absolute;
        inset: var(--lv-sp-4) var(--lv-sp-5);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-l);
        box-shadow: var(--lv-shadow-2);
        display: flex;
        flex-direction: column;
        z-index: var(--lv-z-review-help);
        overflow: hidden;
        .lv-help-head {
            display: flex;
            align-items: center;
            gap: var(--lv-sp-2);
            padding: var(--lv-sp-2) var(--lv-sp-4);
            border-bottom: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent);
            font-size: var(--lv-type-control-size);
            color: var(--lv-color-text-muted);

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
        .lv-help-body {
            flex: 1;
            overflow: auto;
            overscroll-behavior: contain;
            padding: var(--lv-sp-4);
            display: grid;
            grid-template-columns: 1fr;
            gap: 0 var(--lv-sp-4);

            @media (min-width: 580px) {
                grid-template-columns: 1fr 1fr;
            }
        }
        .lv-kbd2 {
            font-variant-numeric: tabular-nums;
            font-family: var(--lv-font-mono, monospace);
        }
        .lv-help-row {
            display: flex;
            gap: var(--lv-sp-3);
            align-items: center;
            padding: var(--lv-sp-2) 0;
            border-bottom: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent);
            font-size: var(--lv-type-body-size);
            line-height: var(--lv-lh-body);
            &:last-child {
                border-bottom: none;
            }

            span:last-child {
                max-width: 48em;
                text-wrap: pretty;
            }
        }
    }
</style>
