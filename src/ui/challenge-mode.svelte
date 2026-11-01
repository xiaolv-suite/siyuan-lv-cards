<script lang="ts">
    import { onDestroy } from "svelte";
    import { type RiffDueCard } from "@/api/riff";
    import { dueCache } from "@/api/due-shared";
    import { getBlockDOM } from "@/api/siyuan";
    import { maskMarkedAnswersForQuestion } from "@/core/card-face";
    import LvKbd from "./kit/LvKbd.svelte";
    import LvIcon from "./kit/LvIcon.svelte";

    let { i18n, onExit }: { i18n: any; onExit: () => void } = $props();
    const t = $derived(i18n);

    // CF-09: 限时挑战自定义倒计时时长（60s / 180s / 300s）
    const DURATION_STORAGE_KEY = "lv-cards.challenge.duration-sec";
    function loadSavedDuration(): number {
        try {
            const v = Number(localStorage.getItem(DURATION_STORAGE_KEY));
            if (v === 60 || v === 180 || v === 300) return v;
        } catch { /* 防御 */ }
        return 180;
    }
    const initialDuration = loadSavedDuration();
    let durationSec = $state<number>(initialDuration);
    function setDuration(sec: number) {
        durationSec = sec;
        remaining = sec;
        try {
            localStorage.setItem(DURATION_STORAGE_KEY, String(sec));
        } catch { /* 防御 */ }
    }

    let phase = $state<"idle" | "loading" | "running" | "empty" | "error" | "done">("idle");
    let errorMsg = $state("");
    let readFailures = $state(0);
    let remaining = $state(initialDuration);
    let known = $state(0);
    let unknown = $state(0);
    let cards: { blockID: string; dom: string }[] = $state([]);
    let idx = $state(0);
    /** 当前卡是否已揭晓答案；问题态遮住挖空和超级块答案，与正式复习一致 */
    let revealed = $state(false);
    let timer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;
    let loadSeq = 0;
    // AR-10：monotonic deadline——后台节流/休眠后按壁钟校正，不靠 interval 次数累计
    let deadline = 0;

    onDestroy(() => {
        disposed = true;
        loadSeq += 1;
        stopTimer();
    });

    function isCurrentLoad(seq: number) {
        return !disposed && seq === loadSeq;
    }

    function exit() {
        disposed = true;
        loadSeq += 1;
        stopTimer();
        onExit();
    }

    function stopTimer() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    function startTimer() {
        stopTimer();
        deadline = Date.now() + remaining * 1000;
        timer = setInterval(() => {
            remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            if (remaining <= 0) {
                finish(); // stopTimer 后 phase=done，interval 不再触发——0 秒只完成一次
            }
        }, 250);
    }

    async function fetchDom(blockID: string): Promise<string | null> {
        try {
            // AQ-20：统一内核响应校验，非 0 不再静默渲染空
            const dom = await getBlockDOM(blockID);
            return dom.trim() ? dom : null;
        } catch { return null; }
    }

    async function start() {
        if (phase === "loading" || phase === "running") return;
        const seq = ++loadSeq;
        phase = "loading";
        errorMsg = "";
        readFailures = 0;
        remaining = durationSec;
        known = 0; unknown = 0; idx = 0;
        cards = [];
        try {
            const data = await dueCache.get("");
            if (!isCurrentLoad(seq)) return;
            const due: RiffDueCard[] = data?.cards ?? [];
            if (due.length === 0) {
                phase = "empty";
                return;
            }
            const slice = due.slice(0, 30);
            const loaded: { blockID: string; dom: string }[] = [];
            let failed = 0;
            for (const c of slice) {
                const dom = await fetchDom(c.blockID);
                if (!isCurrentLoad(seq)) return;
                if (dom === null) {
                    failed += 1;
                } else {
                    loaded.push({ blockID: c.blockID, dom });
                }
            }
            cards = loaded;
            readFailures = failed;
            if (cards.length === 0) {
                errorMsg = failed > 0 ? t.challenge.readFailed : t.challenge.empty;
                phase = failed > 0 ? "error" : "empty";
                return;
            }
        } catch (e: any) {
            if (!isCurrentLoad(seq)) return;
            errorMsg = e?.message ?? String(e);
            phase = "error";
            return;
        }
        if (!isCurrentLoad(seq)) return;
        // AR-10：计时点与材料加载完成一致，倒计时期间不吞作答时间
        phase = "running";
        startTimer();
    }

    function mark(ok: boolean) {
        if (ok) known += 1; else unknown += 1;
        idx += 1;
        revealed = false;
        if (idx >= cards.length) finish();
    }

    function finish() {
        stopTimer();
        if (phase === "done") {
            return; // AR-10：超时与手动停止并发只完成一次
        }
        phase = "done";
    }

    function requestFinish() {
        if (phase === "running" && !window.confirm(t.challenge.stopConfirm ?? "当前挑战进度不会保存，确定结束吗？")) return;
        finish();
    }

    function onKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            e.preventDefault();
            if (phase === "running") requestFinish();
            else exit();
            return;
        }
        if (phase === "running") {
            if (e.key === "1" || e.key === "ArrowLeft" || e.key.toLowerCase() === "x") {
                e.preventDefault();
                mark(false);
            } else if (e.key === "2" || e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
                e.preventDefault();
                mark(true);
            } else if (e.key.toLowerCase() === "v") {
                e.preventDefault();
                revealed = true;
            }
        } else if (phase === "idle" && (e.key === " " || e.key === "Enter")) {
            e.preventDefault();
            void start();
        } else if (phase === "done" && (e.key === " " || e.key === "Enter")) {
            e.preventDefault();
            exit();
        }
    }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="lv-chal b3-typography" role="region" aria-label={t.challenge.title}>
    {#if phase === "idle"}
        <div class="lv-chal-center">
            <div class="lv-chal-icon"><LvIcon name="timer" size={34} /></div>
            <div class="lv-chal-title">{t.challenge.title}</div>
            <div class="lv-chal-desc">{t.challenge.desc.replace("${n}", String(Math.round(durationSec / 60)))}</div>
            <div class="lv-chal-dur-group" style="display: flex; gap: 8px; justify-content: center; margin: 10px 0 16px;">
                <button
                    type="button"
                    class="b3-button b3-button--small"
                    class:lv-btn-primary={durationSec === 60}
                    class:b3-button--outline={durationSec !== 60}
                    onclick={() => setDuration(60)}
                >
                    60秒 (1分钟)
                </button>
                <button
                    type="button"
                    class="b3-button b3-button--small"
                    class:lv-btn-primary={durationSec === 180}
                    class:b3-button--outline={durationSec !== 180}
                    onclick={() => setDuration(180)}
                >
                    180秒 (3分钟)
                </button>
                <button
                    type="button"
                    class="b3-button b3-button--small"
                    class:lv-btn-primary={durationSec === 300}
                    class:b3-button--outline={durationSec !== 300}
                    onclick={() => setDuration(300)}
                >
                    300秒 (5分钟)
                </button>
            </div>
            <button class="b3-button lv-btn-primary" onclick={start}>{t.challenge.start} <LvKbd k="Space" /></button>
            <div style="margin-top: var(--lv-sp-3)">
                <button
                    class="b3-button b3-button--cancel"
                    aria-keyshortcuts="Escape"
                    title={`${window.siyuan.languages.cancel} (Esc)`}
                    onclick={exit}
                >
                    {window.siyuan.languages.cancel}
                </button>
            </div>
        </div>
    {:else if phase === "loading"}
        <div class="lv-chal-center" aria-busy="true">
            <div class="lv-chal-icon"><LvIcon name="timer" size={34} /></div>
            <div class="lv-chal-title">{t.challenge.loading}</div>
            <button
                class="b3-button b3-button--cancel"
                aria-keyshortcuts="Escape"
                title={`${window.siyuan.languages.cancel} (Esc)`}
                onclick={exit}
            >
                {window.siyuan.languages.cancel}
            </button>
        </div>
    {:else if phase === "empty"}
        <div class="lv-chal-center">
            <div class="lv-chal-icon"><LvIcon name="cards" size={38} /></div>
            <div class="lv-chal-title">{t.challenge.empty}</div>
            <div class="fn__flex" style="gap: var(--lv-sp-2)">
                <button class="b3-button b3-button--outline lv-btn-tool" onclick={start}><LvIcon name="refresh" size={13} /> <span>{t.challenge.retry}</span></button>
                <button
                    class="b3-button b3-button--cancel"
                    aria-keyshortcuts="Escape"
                    title={`${window.siyuan.languages.cancel} (Esc)`}
                    onclick={exit}
                >
                    {window.siyuan.languages.cancel}
                </button>
            </div>
        </div>
    {:else if phase === "error"}
        <div class="lv-chal-center">
            <div class="lv-chal-icon"><LvIcon name="warning" size={34} /></div>
            <div class="lv-chal-title">{t.challenge.loadError}</div>
            <div class="lv-chal-desc" role="alert" aria-live="assertive">{errorMsg}</div>
            <div class="fn__flex" style="gap: var(--lv-sp-2)">
                <button class="b3-button b3-button--outline lv-btn-tool" onclick={start}><LvIcon name="refresh" size={13} /> <span>{t.challenge.retry}</span></button>
                <button
                    class="b3-button b3-button--cancel"
                    aria-keyshortcuts="Escape"
                    title={`${window.siyuan.languages.cancel} (Esc)`}
                    onclick={exit}
                >
                    {window.siyuan.languages.cancel}
                </button>
            </div>
        </div>
    {:else if phase === "running"}
        <div class="lv-chal-head">
            <span class="lv-chal-timer" class:lv-chal-low={remaining <= 30}>
                <LvIcon name="timer" size={16} /> {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
            </span>
            <span class="lv-chal-score">✓ {known} · ✗ {unknown}</span>
            <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" onclick={requestFinish}><LvIcon name="close" size={12} /> <span>{t.challenge.stop}</span></button>
        </div>
        {#if readFailures > 0}
            <div class="lv-notice lv-notice--warn" role="status">
                {t.challenge.readPartial.replace("${n}", String(readFailures))}
            </div>
        {/if}
        {#if cards[idx]}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="lv-chal-card lv-card2 b3-typography" data-testid="challenge-card" onclick={() => (revealed = true)}>
                {@html revealed ? cards[idx].dom : maskMarkedAnswersForQuestion(cards[idx].dom)}
            </div>
            {#if !revealed}
                <div class="lv-chal-reveal">
                    <button class="b3-button b3-button--outline b3-button--small lv-btn-tool" aria-keyshortcuts="v" onclick={() => (revealed = true)}>
                        <LvIcon name="eye" size={12} /> <span>{t.review?.showAnswer ?? "显示答案"}</span> <LvKbd k="V" />
                    </button>
                </div>
            {/if}
            <div class="lv-chal-actions">
                <button
                    class="b3-button lv-chal-btn lv-chal-unknown"
                    aria-keyshortcuts="1 ArrowLeft x"
                    onclick={() => mark(false)}
                >
                    <LvIcon name="close" size={13} /> <span>{t.challenge.unknown}</span> <LvKbd k="1" />
                </button>
                <button
                    class="b3-button lv-chal-btn lv-chal-known"
                    aria-keyshortcuts="2 ArrowRight Space Enter"
                    onclick={() => mark(true)}
                >
                    <LvIcon name="check" size={13} /> <span>{t.challenge.known}</span> <LvKbd k="2" />
                </button>
            </div>
        {:else}
            <div class="lv-chal-center">{t.challenge.loading}</div>
        {/if}
    {:else}
        <div class="lv-chal-center">
            <div class="lv-chal-icon"><LvIcon name="flag" size={34} /></div>
            <div class="lv-chal-title">{t.challenge.doneTitle}</div>
            <div class="lv-chal-desc" style="font-variant-numeric: tabular-nums;">
                ✓ {known} · ✗ {unknown} · {t.review?.doneSkip ?? "跳过"} {t.challenge.skipped}
            </div>
            <button class="b3-button lv-btn-primary" onclick={exit}><LvIcon name="check" size={13} /> <span>{t.challenge.closeBtn}</span></button>
        </div>
    {/if}
</div>

<style>
    .b3-button {
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
    .lv-chal { padding: var(--lv-sp-5); text-align: center; }
    .lv-chal-center {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--lv-sp-3);
        padding: var(--lv-sp-5);
    }
    .lv-chal-icon { font-size: var(--lv-type-hero-lg-size); }
    .lv-chal-title {
        font-size: var(--lv-type-section-size);
        font-weight: 700;
        text-wrap: balance;
    }
    .lv-chal-desc {
        color: var(--lv-color-text-muted);
        margin-bottom: var(--lv-sp-3);
        max-width: 48em;
        text-wrap: pretty;
        line-height: var(--lv-lh-reading, 1.65);
    }
    .lv-chal-head { display: flex; align-items: center; gap: var(--lv-sp-3); }
    .lv-chal-timer { font-size: var(--lv-type-section-size); font-weight: 700; font-variant-numeric: tabular-nums; color: var(--lv-color-brand); }
    .lv-chal-low { color: var(--lv-color-danger) !important; }
    .lv-chal-score { font-variant-numeric: tabular-nums; margin-left: auto; }
    .lv-chal-card {
        text-align: left;
        margin: var(--lv-sp-3) 0;
        padding: calc(var(--lv-space-unit) * 6) calc(var(--lv-space-unit) * 8);
        box-shadow: var(--lv-shadow-card), var(--lv-inset-shine);
        max-width: 48em;
        text-wrap: pretty;

        :global(p) {
            max-width: 48em;
            text-wrap: pretty;
            margin: var(--lv-sp-2) 0;
        }

        :global(img) {
            max-width: 100%;
            max-height: 48vh;
            height: auto;
            object-fit: contain;
            display: block;
            margin: var(--lv-sp-2) auto;
            border-radius: var(--lv-r-m);
        }
        :global(pre),
        :global(.language-math),
        :global(.katex-display) {
            overflow-x: auto;
            scrollbar-width: thin;
        }
    }
    .lv-chal-actions { display: flex; gap: var(--lv-sp-3); justify-content: center; }
    .lv-chal-reveal { display: flex; justify-content: center; margin-bottom: var(--lv-sp-2); }
    .lv-chal-card { cursor: pointer; }
    .lv-chal-btn {
        flex: 1;
        max-width: 160px;
        font-weight: var(--lv-fw-semibold);
        box-shadow: var(--lv-shadow-card);
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        transition: transform var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease);

        &:hover {
            transform: translateY(-1px);
            box-shadow: var(--lv-shadow-card-hover);
        }
        &:active {
            transform: translateY(1px) scale(0.98);
        }
        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
    .lv-chal-known { background: var(--lv-primary-soft); color: var(--lv-color-brand); }
    .lv-chal-unknown { background: var(--lv-danger-soft); color: var(--lv-color-danger); }
</style>
