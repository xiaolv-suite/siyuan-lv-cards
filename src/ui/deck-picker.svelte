<script lang="ts">
    import { onMount } from "svelte";
    import { getRiffDecks, createRiffDeck, type RiffDeck } from "@/api/riff";
    import LvIcon from "./kit/LvIcon.svelte";

    let { newNamePlaceholder = "", firstDeckNamePlaceholder = newNamePlaceholder, emptyDeckText = "", retryLabel = "Retry", confirmLabel = "OK", loadingLabel = "Loading…", busyLabel = "Saving…", decks: initialDecks = null, onBeforeConfirm = () => undefined, onConfirm, onClose }: {
        newNamePlaceholder?: string;
        firstDeckNamePlaceholder?: string;
        emptyDeckText?: string;
        retryLabel?: string;
        confirmLabel?: string;
        loadingLabel?: string;
        busyLabel?: string;
        /** 调用方已持有卡组列表时直传，避免重复请求 */
        decks?: RiffDeck[] | null;
        /** AR-2：支持 Promise——成功后才关闭，失败保留选择与输入 */
        onBeforeConfirm?: () => void | boolean | Promise<void | boolean>;
        onConfirm: (deckID: string, deckName: string) => void | boolean | Promise<void | boolean>;
        onClose: () => void;
    } = $props();

    // 初值语义：调用方可直传卡组列表避免重复请求，挂载后不更新
    // svelte-ignore state_referenced_locally
    let decks: RiffDeck[] = $state(initialDecks ?? []);
    // svelte-ignore state_referenced_locally
    let selected = $state(initialDecks?.[0]?.id ?? "");
    let newName = $state("");
    let busy = $state(false);
    // svelte-ignore state_referenced_locally
    let loading = $state(!initialDecks);
    let errorMsg = $state("");
    let loadError = $state("");
    // 创建卡组成功但后续加卡失败时保留创建结果；重试不能再创建一个同名卡组。
    const createdDraftDecks = new Map<string, RiffDeck>();

    async function loadDecks() {
        loading = true;
        loadError = "";
        try {
            decks = await getRiffDecks();
            selected = decks[0]?.id ?? "";
        } catch (e: any) {
            loadError = e?.message ?? String(e);
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        if (initialDecks) {
            return;
        }
        void loadDecks();
    });

    async function confirm() {
        if (busy) {
            return;
        }
        busy = true;
        errorMsg = "";
        try {
            const proceed = await onBeforeConfirm?.();
            if (proceed === false) {
                return;
            }
            let deckID = selected;
            let deckName = decks.find(d => d.id === deckID)?.name ?? "";
            if (newName.trim()) {
                const name = newName.trim();
                let createdDeck = createdDraftDecks.get(name);
                if (!createdDeck) {
                    createdDeck = await createRiffDeck(name);
                    createdDraftDecks.set(name, createdDeck);
                }
                deckID = createdDeck.id;
                deckName = createdDeck.name;
            }
            if (!deckID) {
                return;
            }
            // AR-2：等写入成功才关闭；失败/取消保留编辑内容与选择
            const result = await onConfirm(deckID, deckName);
            if (result !== false) {
                onClose();
            }
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        } finally {
            busy = false;
        }
    }

    function onKeydown(e: KeyboardEvent) {
        if (busy) return;
        /* IME 合成期让路：Enter 属确认选字，误触会以未确认的名称建卡包。 */
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        } else if (e.key === "Enter" && (selected || newName.trim()) && !loadError) {
            e.preventDefault();
            void confirm();
        }
    }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="lv-deckpicker b3-typography">
    {#if loading}
        <div class="ft__on-surface" role="status" aria-busy="true">{loadingLabel}</div>
    {:else}
        <div class="lv-dp-list" role="radiogroup">
            {#each decks as d (d.id)}
                <label class="fn__flex lv-dp-row" class:lv-dp-row--selected={selected === d.id}>
                    <input type="radio" name="lv-deck" value={d.id} bind:group={selected} />
                    <span class="fn__flex-1">{d.name}</span>
                    <span class="ft__smaller ft__on-surface lv-dp-count">{d.size}</span>
                </label>
            {/each}
            {#if loadError}
                <div class="ft__smaller" style="color: var(--lv-color-danger); max-width: 48em; text-wrap: pretty; line-height: var(--lv-lh-reading, 1.65);" role="alert" aria-live="assertive">{loadError}</div>
                <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" aria-label={retryLabel} disabled={loading || busy} onclick={loadDecks}>
                    <LvIcon name="refresh" size={12} />
                    <span>{retryLabel}</span>
                </button>
            {:else if decks.length === 0}
                <div class="ft__smaller ft__on-surface" style="max-width: 48em; text-wrap: pretty; line-height: var(--lv-lh-reading, 1.65);">{emptyDeckText}</div>
            {/if}
        </div>
        <div class="lv-dp-new">
            <input
                class="b3-text-field fn__block"
                placeholder={decks.length === 0 ? firstDeckNamePlaceholder : newNamePlaceholder}
                aria-label={decks.length === 0 ? firstDeckNamePlaceholder : newNamePlaceholder}
                spellcheck="false"
                autocomplete="off"
                bind:value={newName}
            />
        </div>
        {#if errorMsg}
            <div class="ft__smaller" style="color: var(--lv-color-danger); max-width: 48em; text-wrap: pretty; line-height: var(--lv-lh-reading, 1.65);" role="alert" aria-live="assertive">{errorMsg}</div>
        {/if}
        <div class="b3-dialog__action">
            <button
                class="b3-button b3-button--cancel"
                aria-label={window.siyuan.languages.cancel}
                aria-keyshortcuts="Escape"
                title={`${window.siyuan.languages.cancel} (Esc)`}
                disabled={busy}
                onclick={onClose}
            >
                <LvIcon name="close" size={14} />
            </button>
            <div class="fn__space"></div>
            <button
                class="b3-button lv-btn-primary"
                disabled={busy || !!loadError || (!selected && !newName.trim())}
                aria-busy={busy}
                aria-keyshortcuts="Enter"
                onclick={confirm}
            >
                {busy ? busyLabel : `${confirmLabel} ↵`}
            </button>
        </div>
    {/if}
</div>

<style>
    .lv-deckpicker {
        width: 100%;
        box-sizing: border-box;
        padding: var(--lv-sp-4) var(--lv-sp-5);
    }
    .lv-deckpicker .b3-button {
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
    .lv-deckpicker .b3-text-field {
        touch-action: manipulation;
        transition: border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease);

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
            border-color: var(--lv-color-brand);
        }
    }
    .lv-deckpicker .ft__smaller {
        max-width: 48em;
        text-wrap: pretty;
        line-height: var(--lv-lh-reading, 1.65);
    }
    .lv-deckpicker .lv-dp-count {
        font-variant-numeric: tabular-nums;
    }
    .lv-deckpicker .lv-dp-list {
        max-height: 200px;
        overflow: auto;
        scrollbar-width: thin;
        scrollbar-color: color-mix(in srgb, var(--lv-color-text) 18%, transparent) transparent;
        overscroll-behavior: contain;
        margin-bottom: var(--lv-sp-3);
    }
    .lv-deckpicker .lv-dp-row {
        gap: var(--lv-sp-2);
        align-items: center;
        padding: var(--lv-sp-2);
        border-radius: var(--lv-r-s);
        cursor: pointer;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        transition: background var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease);

        &:focus-within {
            outline: none;
            box-shadow: inset 0 0 0 1.5px var(--lv-color-brand);
        }
    }
    .lv-deckpicker .lv-dp-row:hover { background: var(--lv-primary-softer); }
    .lv-deckpicker .lv-dp-row--selected {
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
        font-weight: var(--lv-fw-semibold);
    }
    .lv-deckpicker .lv-dp-new { margin-bottom: var(--lv-sp-2); }
    .lv-deckpicker .b3-dialog__action { justify-content: flex-end; }
</style>
