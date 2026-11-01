<script lang="ts">
    import { onDestroy } from "svelte";
    import { scale } from "svelte/transition";
    import { dueCache } from "@/api/due-shared";
    import { getRiffCards, getRiffDecks, type RiffDeck } from "@/api/riff";
    import { getBlockDOM } from "@/api/siyuan";
    import { extractMarkTexts, MARK_SELECTOR } from "@/core/card-face";
    import LvEmpty from "./kit/LvEmpty.svelte";
    import LvError from "./kit/LvError.svelte";
    import LvIcon from "./kit/LvIcon.svelte";

    /** 配对挑战（M4·FR4）：到期挖空卡限时配对——左列题面（挖空）× 右列答案（mark 文本），
     * 只入激励不计调度。无挖空的卡自动跳过。 */

    interface Pair {
        cardID: string;
        prompt: string;
        answer: string;
    }

    let { i18n, onExit }: { i18n: any; onExit: () => void } = $props();
    const t = $derived(i18n);

    let phase = $state<"loading" | "running" | "done" | "notEnough" | "error">("loading");
    let errorMsg = $state("");
    let availableDecks = $state<RiffDeck[]>([]);
    let selectedDeckId = $state<string>("");
    let pairs = $state<Pair[]>([]);
    // 左列（题面，原序）与右列（答案，洗牌）
    let left = $state<Pair[]>([]);
    let right = $state<Pair[]>([]);
    let pickedLeft = $state("");
    let pickedRight = $state("");
    let matched = $state<Set<string>>(new Set());
    let mistakes = $state(0);
    let seconds = $state(0);
    let timer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;
    let loadGeneration = 0;
    let loadBusy = $state(false);
    let requestBusy = false;

    $effect(() => {
        load();
        return () => {
            stopTimer();
        };
    });

    onDestroy(() => {
        disposed = true;
        loadGeneration += 1;
        stopTimer();
    });

    function stopTimer() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    function shuffle<T>(arr: T[]): T[] {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    async function load() {
        if (requestBusy) return;
        requestBusy = true;
        loadBusy = true;
        const generation = ++loadGeneration;
        stopTimer();
        phase = "loading";
        errorMsg = "";
        try {
            if (availableDecks.length === 0) {
                try {
                    const dl = await getRiffDecks();
                    if (disposed || generation !== loadGeneration) return;
                    availableDecks = (dl ?? []).filter(d => (d.size ?? 0) > 0);
                } catch { /* 旁路 */ }
            }

            let candidates: { cardID: string; blockID: string }[] = [];
            if (selectedDeckId) {
                const resp = await getRiffCards(selectedDeckId, 1, 24);
                if (disposed || generation !== loadGeneration) return;
                candidates = (resp.blocks ?? []).map((b: any) => ({
                    cardID: String(b.riffCard?.id ?? b.riffCard?.cardID ?? b.id ?? ""),
                    blockID: String(b.id ?? ""),
                })).filter((c: any) => Boolean(c.cardID && c.blockID));
            } else {
                const due = await dueCache.get("");
                if (disposed || generation !== loadGeneration) return;
                candidates = (due?.cards ?? []).map(c => ({ cardID: c.cardID, blockID: c.blockID })).slice(0, 16);
            }

            const found: Pair[] = [];
            let failedCards = 0;
            for (const c of candidates) {
                if (found.length >= 8) { break; }
                try {
                    // AQ-20：统一内核响应校验，非 0 视为单卡失败跳过
                    const html = await getBlockDOM(c.blockID);
                    if (disposed || generation !== loadGeneration) return;
                    const holder = document.createElement("div");
                    holder.innerHTML = html;
                    const marks = extractMarkTexts(holder);
                    if (marks.length === 0) { continue; } // 无挖空的卡不参与配对
                    // 题面：所有挖空段统一替换为 ____（答案串 = 各挖空文本合并）
                    holder.querySelectorAll(MARK_SELECTOR).forEach(m => m.replaceWith(document.createTextNode("____")));
                    const prompt = (holder.textContent ?? "").trim().replace(/\s+/g, " ");
                    if (prompt.length < 4) { continue; }
                    found.push({ cardID: c.cardID, prompt, answer: marks.join(" / ") });
                } catch {
                    if (disposed || generation !== loadGeneration) return;
                    failedCards += 1;
                }
            }
            if (found.length < 4 && !selectedDeckId) {
                // 闭环保障：全库到期卡不足 4 张时平滑回退读取卡库中已有卡片，支持用户在无到期时随时练习
                try {
                    const fallbackCards = await getRiffCards("", 1, 20);
                    for (const b of fallbackCards.blocks ?? []) {
                        if (found.length >= 8) break;
                        if (found.some(f => f.cardID === b.id)) continue;
                        try {
                            const html = await getBlockDOM(b.id);
                            if (disposed || generation !== loadGeneration) return;
                            const holder = document.createElement("div");
                            holder.innerHTML = html;
                            const marks = extractMarkTexts(holder);
                            if (marks.length === 0) continue;
                            holder.querySelectorAll(MARK_SELECTOR).forEach(m => m.replaceWith(document.createTextNode("____")));
                            const prompt = (holder.textContent ?? "").trim().replace(/\s+/g, " ");
                            if (prompt.length < 4) continue;
                            found.push({ cardID: b.id, prompt, answer: marks.join(" / ") });
                        } catch {
                            // 跳过单卡读取失败
                        }
                    }
                } catch {
                    // 非致命 fallback
                }
            }
            if (found.length < 4) {
                if (failedCards > 0 && found.length === 0) {
                    errorMsg = t.pairing.loadFailed;
                    phase = "error";
                    return;
                }
                phase = "notEnough";
                return;
            }
            pairs = found;
            left = shuffle(found);
            right = shuffle(found);
            startTimer();
            phase = "running";
        } catch (e: any) {
            if (disposed || generation !== loadGeneration) return;
            errorMsg = e?.message ?? String(e);
            phase = "error";
        } finally {
            requestBusy = false;
            loadBusy = false;
        }
    }

    function startTimer() {
        seconds = 0;
        stopTimer();
        timer = setInterval(() => { seconds += 1; }, 1000);
    }

    function pickLeft(p: Pair) {
        if (matched.has(p.cardID)) { return; }
        pickedLeft = p.cardID;
        tryMatch();
    }

    function pickRight(p: Pair) {
        if (matched.has(p.cardID)) { return; }
        pickedRight = p.cardID;
        tryMatch();
    }

    function tryMatch() {
        if (!pickedLeft || !pickedRight) { return; }
        if (pickedLeft === pickedRight) {
            const next = new Set(matched);
            next.add(pickedLeft);
            matched = next;
        } else {
            mistakes += 1;
        }
        pickedLeft = "";
        pickedRight = "";
        if (matched.size === pairs.length) {
            stopTimer();
            phase = "done";
        }
    }

    function exit() {
        if (phase === "running" && !window.confirm(t.pairing.exitConfirm ?? "当前配对进度不会保存，确定退出吗？")) return;
        onExit();
    }
</script>

<svelte:window on:keydown={(e) => { if (e.key === "Escape") { e.preventDefault(); exit(); } }} />

<div class="lv-pair b3-typography">
    {#if phase === "loading"}
        <div class="lv-pair-center">{t.dashboard.loading}</div>
    {:else if phase === "notEnough"}
        <!-- R53 §3.9：空态走标准组件（图标圈 + 说明 + 动作钮），居中限宽不顶满 -->
        <div class="lv-pair-center">
            <div class="lv-pair-empty-wrap">
                {#if availableDecks.length > 0}
                    <div style="margin-bottom: var(--lv-sp-3); display: flex; justify-content: center;">
                        <select
                            class="b3-select"
                            bind:value={selectedDeckId}
                            onchange={(e) => { selectedDeckId = e.currentTarget.value; void load(); }}
                            aria-label="选择挑战卡包"
                        >
                            <option value="">全库到期卡片</option>
                            {#each availableDecks as d (d.id)}
                                <option value={d.id}>{d.name} ({d.size ?? 0})</option>
                            {/each}
                        </select>
                    </div>
                {/if}
                <LvEmpty text={selectedDeckId ? "所选卡包内包含挖空的闪卡不足 4 张" : t.pairing.notEnough} actionLabel={t.pairing.exit} onaction={onExit} />
            </div>
        </div>
    {:else if phase === "error"}
        <div class="lv-pair-center">
            <LvError message={errorMsg} onretry={load} retryLabel={t.dashboard.refresh} />
        </div>
    {:else if phase === "running"}
        <div class="lv-pair-head">
            {#if availableDecks.length > 0}
                <select
                    class="b3-select lv-pair-deck-select"
                    bind:value={selectedDeckId}
                    onchange={(e) => { selectedDeckId = e.currentTarget.value; void load(); }}
                    aria-label="切换卡包范围"
                    title="选择配对挑战卡包范围"
                >
                    <option value="">全库到期卡片</option>
                    {#each availableDecks as d (d.id)}
                        <option value={d.id}>{d.name} ({d.size ?? 0})</option>
                    {/each}
                </select>
            {/if}
            <span class="lv-chip2 lv-chip2--primary"><LvIcon name="timer" size={14} /> {seconds}s</span>
            <span class="lv-chip2 lv-chip2--default">{t.pairing.pairs}: {matched.size} / {pairs.length}</span>
            <span class="lv-chip2 lv-chip2--error">{t.pairing.mistakes}: {mistakes}</span>
            <div class="fn__flex-1"></div>
            <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" onclick={exit}><LvIcon name="moon" size={12} /> <span>{t.pairing.exit}</span></button>
        </div>
        <div class="lv-pair-grid">
            <div class="lv-pair-col">
                {#each left as p (p.cardID)}
                    {#if !matched.has(p.cardID)}
                        <button class="lv-pair-cell" class:lv-pair-on={pickedLeft === p.cardID} onclick={() => pickLeft(p)} out:scale={{ duration: 160, start: 1.04 }}>{p.prompt}</button>
                    {/if}
                {/each}
            </div>
            <div class="lv-pair-col">
                {#each right as p (`r-${p.cardID}`)}
                    {#if !matched.has(p.cardID)}
                        <button class="lv-pair-cell lv-pair-ans" class:lv-pair-on={pickedRight === p.cardID} onclick={() => pickRight(p)} out:scale={{ duration: 160, start: 1.04 }}>{p.answer}</button>
                    {/if}
                {/each}
            </div>
        </div>
    {:else}
        <div class="lv-pair-center">
            <div class="lv-done-badge" aria-hidden="true"><LvIcon name="check" size={24} /></div>
            <div class="lv-pair-result">{t.pairing.doneTitle}</div>
            <div class="ft__smaller ft__on-surface lv-pair-summary">
                {t.pairing.doneTime.replace("${s}", String(seconds))} · {t.pairing.mistakes}: {mistakes}
            </div>
            <div class="fn__flex lv-pair-done-actions" style="gap: calc(var(--lv-space-unit) * 4); margin-top: 12px; justify-content: center">
                <button
                    class="b3-button lv-btn-primary"
                    disabled={loadBusy}
                    aria-busy={loadBusy}
                    title={`${t.pairing.again} (Enter)`}
                    aria-keyshortcuts="Enter"
                    onclick={load}
                >
                    <LvIcon name="refresh" size={13} /> <span>{loadBusy ? (t.pairing.loading ?? t.dashboard.loading) : t.pairing.again}</span>
                </button>
                <button
                    class="b3-button b3-button--outline lv-btn-tool"
                    title={`${t.pairing.exit} (Esc)`}
                    aria-keyshortcuts="Escape"
                    onclick={exit}
                >
                    <span>{t.pairing.exit}</span>
                </button>
            </div>
        </div>
    {/if}
</div>

<style>
    .lv-pair-deck-select {
        height: 28px;
        font-size: var(--lv-type-small-size);
        max-width: 180px;
        padding: 0 8px;
    }
    .lv-pair { min-height: 320px; display: flex; flex-direction: column; }
    .lv-pair-empty-wrap { width: min(440px, 100%); }
    .lv-pair-center {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: calc(var(--lv-space-unit) * 3);
        padding: var(--lv-sp-5);
        text-align: center;
    }
    .lv-pair-head {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-3);
        .lv-chip2 {
            font-variant-numeric: tabular-nums;
        }
    }
    .lv-pair-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--lv-sp-3); }
    .lv-pair-col { display: flex; flex-direction: column; gap: var(--lv-sp-2); }
    .lv-pair-cell {
        text-align: left;
        padding: var(--lv-sp-3);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        background: var(--lv-color-surface);
        box-shadow: var(--lv-shadow-1), var(--lv-inset-shine);
        cursor: pointer;
        font-size: var(--lv-type-body-size);
        line-height: var(--lv-lh-meta);
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        transition: border-color var(--lv-dur-1) var(--lv-ease),
            background-color var(--lv-dur-1) var(--lv-ease),
            transform var(--lv-dur-1) var(--lv-ease),
            box-shadow var(--lv-dur-1) var(--lv-ease);

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }

        &:hover {
            border-color: var(--lv-border-strong);
            transform: translateY(-1px);
            box-shadow: var(--lv-shadow-2), var(--lv-inset-shine);
        }
        &:active {
            transform: translateY(1px) scale(0.985);
        }
    }
    .lv-pair-on {
        border-color: var(--lv-color-brand) !important;
        background: var(--lv-primary-soft) !important;
        color: var(--lv-color-brand);
        box-shadow: 0 0 0 1.5px var(--lv-color-brand), var(--lv-shadow-1) !important;
    }
    .lv-pair-ans { color: var(--lv-color-text-muted); }
    .lv-pair-result {
        font-size: var(--lv-type-section-size);
        font-weight: 700;
        text-wrap: balance;
    }
    .lv-pair-summary {
        max-width: 48em;
        text-wrap: pretty;
        font-variant-numeric: tabular-nums;
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
</style>
