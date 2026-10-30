<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { getRiffDecks, createRiffDeck, type RiffDeck } from "@/api/riff";
    import { serializeQaCard, validateQaDraft } from "@/core/flashcard-quality";
    import { checkMinimumInformationPrinciple } from "@/core/incremental-learning";
    import LvKbd from "./kit/LvKbd.svelte";
    import LvIcon from "./kit/LvIcon.svelte";

    let { i18n, onCreate, onClose, embedded = false }: {
        i18n: any;
        /** markdown（问题 + ==答案== 挖空式单块）与目标卡组 */
        onCreate: (markdown: string, deckID: string, deckName: string, q?: string, a?: string, docID?: string) => Promise<{ docID: string; blockID: string } | void>;
        onClose: () => void;
        embedded?: boolean;
    } = $props();
    const t = $derived(i18n);

    let q = $state("");
    let a = $state("");
    let decks: RiffDeck[] = $state([]);
    let selected = $state("");
    let newName = $state("");
    let busy = $state(false);
    let deckLoadBusy = $state(false);
    let deckLoadError = $state("");
    let errorMsg = $state("");
    let template = $state<"qa" | "cloze" | "superblock">("qa");
    let isBidirectional = $state(false);
    let previewAnswer = $state(false);
    let createdNotice = $state("");
    let editorRoot: HTMLDivElement;
    let qTextareaEl: HTMLTextAreaElement | undefined = $state();
    let disposed = false;
    onDestroy(() => { disposed = true; });

    function insertCloze() {
        if (!qTextareaEl) return;
        const start = qTextareaEl.selectionStart ?? 0;
        const end = qTextareaEl.selectionEnd ?? 0;
        const selectedText = q.slice(start, end);
        const marker = "____";

        if (selectedText) {
            q = q.slice(0, start) + marker + q.slice(end);
            if (!a.trim()) {
                a = selectedText;
            }
        } else {
            q = q.slice(0, start) + marker + q.slice(start);
        }
        const nextPos = start + marker.length;
        setTimeout(() => {
            if (qTextareaEl) {
                qTextareaEl.focus();
                qTextareaEl.setSelectionRange(nextPos, nextPos);
            }
        }, 0);
    }

    const isMac = typeof navigator !== "undefined" && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || navigator.platform || "");

    const canCreateDeck = $derived(decks.some(d => d.id === selected) || !!newName.trim());
    const clozeParts = $derived(q.split("____"));
    const hasClozeMarker = $derived(clozeParts.length > 1);
    const draftIssues = $derived(validateQaDraft(q, a));
    const overloadNotice = $derived(checkMinimumInformationPrinciple(`${q} ${a}`));
    const canSubmit = $derived(!busy && draftIssues.length === 0 && canCreateDeck && (template !== "cloze" || hasClozeMarker));

    function setTemplate(value: "qa" | "cloze" | "superblock") {
        template = value;
        previewAnswer = false;
    }

    async function loadDecks() {
        if (deckLoadBusy) return;
        deckLoadBusy = true;
        deckLoadError = "";
        try {
            const loadedDecks = await getRiffDecks();
            if (disposed) return;
            decks = [...loadedDecks, ...decks.filter(deck => !loadedDecks.some(loaded => loaded.id === deck.id))];
            if (decks.length > 0 && !decks.some(d => d.id === selected)) {
                selected = decks[0].id;
            }
        } catch (e: any) {
            if (disposed) return;
            deckLoadError = e?.message ?? String(e);
        } finally {
            if (!disposed) deckLoadBusy = false;
        }
    }

    onMount(() => { void loadDecks(); });

    async function confirm() {
        if (!canSubmit) {
            return;
        }
        busy = true;
        errorMsg = "";
        createdNotice = "";
        try {
            let deckID = selected;
            let deckName = decks.find(d => d.id === deckID)?.name ?? "";
            if (newName.trim()) {
                const deck = await createRiffDeck(newName.trim());
                deckID = deck.id;
                deckName = deck.name;
                decks = [...decks, deck];
                selected = deckID;
                newName = "";
            }
            if (!deckID || (!newName.trim() && !decks.some(d => d.id === deckID))) {
                errorMsg = t.quickCardNeedDeck;
                return;
            }
            const question = q.trim();
            const answer = a.trim();
            if (template === "qa" && isBidirectional) {
                // 双向卡片：互为问答生成两张卡片（A -> B 与 B -> A）
                // 生产回调返回首面落点后，第二面复用同一文档；旧宿主/组件测试
                // 返回 void 时仍保持兼容，但生产路径不会再次 createDocWithMd。
                const first = await onCreate(serializeQaCard(question, answer), deckID, deckName, question, answer);
                if (first && first.docID) {
                    await onCreate(serializeQaCard(answer, question), deckID, deckName, answer, question, first.docID);
                } else {
                    await onCreate(serializeQaCard(answer, question), deckID, deckName, answer, question);
                }
                if (disposed) return;
                if (embedded) {
                    q = "";
                    a = "";
                    isBidirectional = false;
                    previewAnswer = false;
                    createdNotice = t.quickCardBidiDone ?? "双向卡片已生成（2 张）并加入卡组";
                } else {
                    onClose();
                }
            } else {
                const markdown = template === "cloze"
                    ? question.split("____").join(`==${answer}==`)
                    : template === "superblock"
                    ? `{{{col\n${question}\n\n${answer}\n}}}`
                    : serializeQaCard(question, answer);
                await onCreate(markdown, deckID, deckName, question, answer);
                if (disposed) return;
                if (embedded) {
                    q = "";
                    a = "";
                    previewAnswer = false;
                    createdNotice = t.quickCardDone;
                } else {
                    onClose();
                }
            }
        } catch (e: any) {
            if (disposed) return;
            errorMsg = e?.message ?? String(e);
        } finally {
            if (!disposed) busy = false;
        }
    }

    function onKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.repeat && !e.defaultPrevented && canSubmit
            && e.target instanceof Node && editorRoot?.contains(e.target) && !editorRoot.closest("[hidden], [inert]")) {
            e.preventDefault();
            confirm();
        } else if (e.key === "Escape" && !busy && !embedded
            && e.target instanceof Node && editorRoot?.contains(e.target) && !editorRoot.closest("[hidden], [inert]")) {
            e.preventDefault();
            onClose();
        }
    }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="lv-quickcard b3-typography" bind:this={editorRoot}>
    <div class="lv-qc-toolbar">
        <div class="lv-qc-template" role="group" aria-label={t.quickCardTemplateLabel}>
            <button type="button" class="lv-qc-tpl-btn" class:lv-qc-template-active={template === "qa"} aria-pressed={template === "qa"} disabled={busy} onclick={() => setTemplate("qa")}>
                <LvIcon name="message" size={15} /> <strong>{t.quickCardTemplateQA}</strong>
            </button>
            <button type="button" class="lv-qc-tpl-btn" class:lv-qc-template-active={template === "cloze"} aria-pressed={template === "cloze"} disabled={busy} onclick={() => setTemplate("cloze")}>
                <LvIcon name="edit" size={15} /> <strong>{t.quickCardTemplateCloze}</strong>
            </button>
            <button type="button" class="lv-qc-tpl-btn" class:lv-qc-template-active={template === "superblock"} aria-pressed={template === "superblock"} disabled={busy} onclick={() => setTemplate("superblock")} title={t.quickCardTemplateSuperBlockDesc}>
                <LvIcon name="cards" size={15} /> <strong>{t.quickCardTemplateSuperBlock}</strong>
            </button>
        </div>
        <div class="lv-qc-deck">
            <div class="lv-qc-label">{t.deckPickerTitle}</div>
            <div class="lv-qc-deck-inputs">
                <select class="b3-select" aria-label={t.deckPickerTitle} bind:value={selected} disabled={busy || decks.length === 0}>
                    {#each decks as d (d.id)}
                        <option value={d.id}>{d.name}</option>
                    {/each}
                </select>
                <input class="b3-text-field lv-qc-new" aria-label={t.deckNewName} placeholder={t.deckNewName} bind:value={newName} disabled={busy} />
            </div>
            {#if deckLoadBusy}
                <div class="ft__smaller ft__on-surface" role="status" aria-busy="true">{t.quickCardDeckLoading ?? "正在读取卡组…"}</div>
            {:else if deckLoadError}
                <div class="lv-qc-deck-error" role="alert">
                    <span>{(t.quickCardDeckLoadFail ?? "读取卡组失败：${error}").replace("${error}", deckLoadError)}</span>
                    <button type="button" class="b3-button b3-button--small b3-button--outline lv-btn-tool" disabled={deckLoadBusy} onclick={() => void loadDecks()}><LvIcon name="refresh" size={13} /> <span>{t.quickCardDeckRetry ?? "重试"}</span></button>
                </div>
            {/if}
            {#if decks.length === 0}
                <div class="ft__smaller ft__on-surface lv-qc-deck-hint">{deckLoadError ? (t.quickCardDeckFallback ?? "也可以直接输入新卡组名称继续。") : t.quickCardNeedDeck}</div>
            {/if}
        </div>
    </div>
    <div class="lv-qc-content">
        <section class="lv-qc-editor" aria-label={t.quickCardEditorLabel}>
            <label class="lv-qc-field">
                <div class="lv-qc-label-bar" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                    <span class="lv-qc-label">{t.quickCardQ}</span>
                    {#if template === "cloze"}
                        <button
                            type="button"
                            class="b3-button b3-button--small b3-button--outline lv-btn-tool lv-cloze-shortcut-btn"
                            title={t.quickCardClozeInsertHint ?? "选中文字设为挖空，或光标处插入空位 (Ctrl+H)"}
                            aria-label={t.quickCardClozeInsert ?? "插入挖空 (Ctrl+H)"}
                            aria-keyshortcuts="Control+h Meta+h"
                            onclick={(e) => { e.stopPropagation(); insertCloze(); }}
                        >
                            <LvIcon name="edit" size={12} />
                            <span>{t.quickCardClozeInsert ?? "一键挖空 (Ctrl+H)"}</span>
                        </button>
                    {/if}
                </div>
                <textarea
                    bind:this={qTextareaEl}
                    class="b3-text-field fn__block"
                    aria-label={t.quickCardQ}
                    rows="4"
                    bind:value={q}
                    placeholder={template === "cloze" ? t.quickCardClozeHint : t.quickCardQ}
                    disabled={busy}
                    spellcheck="false"
                    onkeydown={(e) => {
                        if (template === "cloze" && (e.ctrlKey || e.metaKey) && (e.key === "h" || e.key === "H")) {
                            e.preventDefault();
                            e.stopPropagation();
                            insertCloze();
                        }
                    }}
                ></textarea>
                {#if template === "cloze"}<div class="ft__smaller ft__on-surface lv-qc-help">{t.quickCardClozeHint}</div>{/if}
            </label>
            <label class="lv-qc-field">
                <div class="lv-qc-label">{t.quickCardA}</div>
                <textarea
                    class="b3-text-field fn__block"
                    aria-label={t.quickCardA}
                    rows="4"
                    bind:value={a}
                    placeholder={template === "superblock" ? (t.quickCardSuperBlockHint ?? "答案区支持多段文字，段落之间空行将自动拆分成独立的答案子块") : t.quickCardA}
                    disabled={busy}
                    spellcheck="false"
                ></textarea>
            </label>
            {#if template === "qa"}
                <label class="lv-qc-bidi-toggle">
                    <input type="checkbox" class="lv-check" bind:checked={isBidirectional} disabled={busy} />
                    <span>{t.quickCardBidiLabel ?? "生成双向卡片（互为问答 A ↔ B）"}</span>
                </label>
            {/if}
            <p class="lv-qc-guidance">{t.quickCardOneFactHint}</p>
        </section>
        <section class="lv-qc-preview" aria-label={t.quickCardPreviewTitle}>
            <div class="lv-qc-preview-heading">
                <div class="lv-qc-preview-tags">
                    <span>{t.quickCardPreviewTitle}</span>
                    <span class="lv-chip2 lv-chip2--default">
                        {#if template === "qa" && isBidirectional}<LvIcon name="swap" size={14} /> {t.cardTypeBadgeBidi ?? "双向"}
                        {:else if template === "superblock"}<LvIcon name="cards" size={14} /> {t.cardTypeBadgeSuperBlock ?? "超级块"}
                        {:else if template === "cloze"}<LvIcon name="edit" size={14} /> {t.cardTypeBadgeCloze ?? "挖空"}
                        {:else}<LvIcon name="message" size={14} /> {t.cardTypeBadgeQA ?? "问答"}
                        {/if}
                    </span>
                </div>
                <button type="button" class="b3-button b3-button--small b3-button--outline lv-btn-tool lv-qc-reveal" aria-expanded={previewAnswer} aria-controls="lv-qc-preview-face" onclick={() => (previewAnswer = !previewAnswer)}>
                    <LvIcon name="eye" size={13} /> <span>{previewAnswer ? t.quickCardHideAnswer : t.quickCardShowAnswer}</span>
                </button>
            </div>
            <div class="ft__smaller ft__on-surface lv-qc-preview-sub">{t.quickCardPreviewNote}</div>
            <div class="lv-qc-preview-face lv-unified-face" id="lv-qc-preview-face">
                <span class="lv-qc-preview-label">{t.quickCardPreviewFront}</span>
                {#if q.trim()}
                    {#if template === "cloze" && hasClozeMarker}
                        <p>{#each clozeParts as part, i (i)}{part}{#if i < clozeParts.length - 1}<span class="lv-qc-mask">{t.quickCardHiddenAnswer}</span>{/if}{/each}</p>
                    {:else if template === "superblock"}
                        <div class="lv-sb-question-section">
                            <p>{q}</p>
                        </div>
                        <div class="lv-card-answer-divider"></div>
                        <div class="lv-sb-answer-placeholder" aria-hidden="true">
                            <span class="lv-mask-slot">［ 超级块答案（{a.trim().split(/\n{2,}/).filter(Boolean).length || 1} 块内容）· 点击查看答案揭晓 ］</span>
                        </div>
                    {:else}
                        <p>{q}{#if template === "qa" && a.trim()}<span class="lv-qc-mask">{t.quickCardHiddenAnswer}</span>{/if}</p>
                    {/if}
                {:else}
                    <p class="lv-qc-placeholder">{t.quickCardPreviewEmpty}</p>
                {/if}
                {#if previewAnswer}
                    <div class="lv-qc-preview-answer">
                        <span class="lv-qc-preview-label">{t.quickCardPreviewBack}</span>
                        {#if template === "cloze" && hasClozeMarker && a.trim()}
                            <p>{q.split("____").join(a)}</p>
                        {:else if a.trim()}
                            <p>{a}</p>
                        {:else}
                            <p class="lv-qc-placeholder">{t.quickCardPreviewEmpty}</p>
                        {/if}
                    </div>
                {/if}
            </div>
        </section>
    </div>
    {#if overloadNotice.overloaded}
        <div class="lv-qc-overload-tip" role="status">
            {overloadNotice.suggestion}
        </div>
    {/if}
    {#if createdNotice}<div class="lv-qc-success" role="status">{createdNotice}</div>{/if}
    {#if errorMsg}
        <div class="ft__smaller lv-qc-error" role="alert">{errorMsg}</div>
    {/if}
    <div class="b3-dialog__action lv-qc-actions">
        {#if !embedded}
            <button
                class="b3-button b3-button--cancel"
                disabled={busy}
                title={`${window.siyuan.languages.cancel} (Esc)`}
                aria-keyshortcuts="Escape"
                onclick={onClose}
            >
                {window.siyuan.languages.cancel}
            </button>
        {/if}
        <button
            class="b3-button lv-btn-primary"
            disabled={!canSubmit}
            aria-keyshortcuts={isMac ? "Meta+Enter" : "Control+Enter"}
            title={`${t.quickCardCreate} (${isMac ? "⌘+Enter" : "Ctrl+Enter"})`}
            onclick={confirm}
        >
            {t.quickCardCreate} <LvKbd k={isMac ? "⌘ ↵" : "Ctrl ↵"} />
        </button>
    </div>
</div>

<style>
    .lv-quickcard {
        padding: var(--lv-sp-4);
        container: lv-quickcard / inline-size;
    }
    .lv-qc-overload-tip {
        margin: var(--lv-sp-2) 0;
        padding: calc(var(--lv-space-unit) * 4) calc(var(--lv-space-unit) * 7);
        border-radius: var(--lv-r-m);
        background: var(--lv-warn-soft);
        border: 1px solid color-mix(in srgb, var(--lv-color-warning) 28%, transparent);
        color: var(--lv-color-on-warning-soft);
        font-size: var(--lv-type-control-size);
        line-height: var(--lv-lh-meta);
        max-width: 48em;
        text-wrap: pretty;
    }
    .lv-qc-toolbar {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: calc(var(--lv-space-unit) * 10);
        margin-bottom: var(--lv-sp-4);
        padding-bottom: var(--lv-sp-3);
        border-bottom: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent);
    }
    .lv-qc-template {
        display: inline-flex;
        padding: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline));
        border-radius: var(--lv-r-pill);
        background: color-mix(in srgb, var(--lv-color-text) 6%, transparent);
        border: 1px solid var(--lv-border);
        gap: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline));
    }
    .lv-qc-template button {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 3);
        min-height: 38px;
        padding: 0 calc(var(--lv-space-unit) * 8);
        border: none;
        border-radius: var(--lv-r-pill);
        background: transparent;
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-control-size);
        font-weight: var(--lv-fw-emphasis);
        cursor: pointer;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        transition: all var(--lv-dur-1) var(--lv-ease);
    }
    .lv-qc-template button:hover:not(:disabled) {
        color: var(--lv-color-text);
        background: color-mix(in srgb, var(--lv-color-text) 4%, transparent);
    }
    .lv-qc-template button:focus-visible,
    .lv-qc-reveal:focus-visible,
    .lv-qc-toolbar :global(input:focus-visible),
    .lv-qc-toolbar :global(select:focus-visible),
    .lv-qc-editor :global(textarea:focus-visible) {
        outline: none;
        box-shadow: var(--lv-focus-ring);
        border-color: var(--lv-color-brand);
    }
    .lv-qc-template button:disabled { cursor: not-allowed; opacity: .55; }
    .lv-qc-template button.lv-qc-template-active {
        background: var(--lv-color-surface);
        color: var(--lv-color-brand);
        font-weight: var(--lv-fw-bold);
        box-shadow: 0 2px 8px color-mix(in srgb, black 6%, transparent), var(--lv-inset-shine);
    }
    .lv-qc-content { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--lv-sp-4); align-items: start; }
    .lv-qc-editor { min-width: 0; }
    .lv-qc-deck { flex: 1 1 320px; max-width: 520px; margin: 0; }
    .lv-qc-deck-inputs {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        select { flex: 1 1 180px; }
        .lv-qc-new { flex: 1 1 200px; margin: 0; }
    }
    /* R53：表单控件撑满面板宽度（宿主 .b3-text-field 默认定宽） */
    .lv-quickcard :global(.b3-text-field),
    .lv-quickcard :global(.b3-select) {
        width: 100%;
        touch-action: manipulation;
        transition: border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease);
    }
    .lv-quickcard .lv-qc-field { margin-bottom: var(--lv-sp-3); }
    .lv-qc-bidi-toggle {
        display: inline-flex;
        align-items: center;
        gap: var(--lv-sp-2);
        font-size: var(--lv-type-control-size);
        color: var(--lv-color-text-muted);
        cursor: pointer;
        margin-bottom: var(--lv-sp-2);
        user-select: none;
        &:hover { color: var(--lv-color-text); }
    }
    .lv-quickcard .lv-qc-label {
        font-size: var(--lv-type-control-size);
        font-weight: var(--lv-fw-semibold);
        color: var(--lv-color-text-muted);
        margin-bottom: var(--lv-sp-1);
    }
    .lv-quickcard .lv-qc-new { margin-top: 0; }
    .lv-quickcard .lv-qc-deck-hint { margin-top: var(--lv-sp-1); }
    .lv-qc-deck-error { display: flex; align-items: center; gap: var(--lv-sp-2); margin-top: var(--lv-sp-1); color: var(--lv-color-danger); font-size: 12px; overflow-wrap: anywhere; }
    .lv-quickcard .lv-qc-help { margin-top: calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline)); }
    .lv-qc-guidance {
        margin: 0;
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-control-size);
        line-height: var(--lv-lh-reading, 1.65);
        max-width: 48em;
        text-wrap: pretty;
    }
    .lv-qc-preview { display: flex; min-width: 0; flex-direction: column; gap: var(--lv-sp-2); margin: 0; }
    .lv-qc-preview-heading { display: flex; justify-content: space-between; align-items: center; gap: calc(var(--lv-space-unit) * 4); font-size: var(--lv-type-body-size); font-weight: var(--lv-fw-semibold); }
    .lv-qc-preview-tags { display: inline-flex; align-items: center; gap: var(--lv-sp-2); }
    .lv-qc-preview-sub { margin-bottom: calc(var(--lv-space-unit) * 1); color: var(--lv-color-text-muted); font-size: var(--lv-type-meta-size); }
    .lv-qc-reveal {
        border-radius: var(--lv-r-pill);
        padding: calc(var(--lv-space-unit) * 2) calc(var(--lv-space-unit) * 6);
        font-size: var(--lv-type-control-size);
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline));
    }
    .lv-qc-preview-face {
        min-width: 0;
        min-height: 258px;
        padding: calc(var(--lv-space-unit) * 12);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-dialog);
        background: var(--lv-color-surface);
        box-shadow: var(--lv-shadow-1), var(--lv-inset-shine);
        display: flex;
        flex-direction: column;
        justify-content: center;
        transition: box-shadow var(--lv-dur-2) var(--lv-ease), border-color var(--lv-dur-2) var(--lv-ease);
    }
    .lv-qc-preview-label {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 2);
        padding: calc(var(--lv-space-unit) * 1) calc(var(--lv-space-unit) * 4);
        border-radius: var(--lv-r-pill);
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
        font-size: var(--lv-type-meta-size);
        font-weight: var(--lv-fw-semibold);
        width: fit-content;
    }
    .lv-qc-preview-face p { margin: calc(var(--lv-space-unit) * 8) 0 0; font-size: 18px; line-height: var(--lv-lh-loose); white-space: pre-wrap; overflow-wrap: anywhere; max-width: 48em; text-wrap: pretty; }
    .lv-qc-preview-answer { margin-top: calc(var(--lv-space-unit) * 9); padding-top: 16px; border-top: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent); }
    .lv-qc-preview-answer p { margin-top: calc(var(--lv-space-unit) * 4); }
    .lv-qc-mask {
        display: inline-block;
        margin-left: calc(var(--lv-space-unit) * 2);
        padding: var(--lv-space-hairline) calc(var(--lv-space-unit) * 3);
        border-radius: var(--lv-r-tag);
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
        font-size: var(--lv-type-meta-size);
        font-weight: var(--lv-fw-emphasis);
        border: 1px dashed var(--lv-primary-border);
    }
    .lv-qc-placeholder { color: var(--lv-color-text-muted); opacity: .65; }
    .lv-qc-reveal { align-self: flex-start; min-height: 44px; }
    .lv-qc-success { margin: var(--lv-sp-2) 0; color: var(--lv-color-success); font-size: var(--lv-type-control-size); }
    @container lv-quickcard (min-width: 781px) {
        .lv-qc-content { grid-template-columns: minmax(0, 1fr) minmax(300px, .88fr); gap: 20px; }
        .lv-qc-preview { position: sticky; top: var(--lv-sp-4); }
    }
    @container lv-quickcard (max-width: 780px) {
        .lv-qc-toolbar { flex-direction: column; }
        .lv-qc-deck { width: 100%; max-width: none; }
        .lv-qc-preview-face { min-height: 220px; }
    }
    @container lv-quickcard (max-width: 480px) {
        .lv-qc-preview-heading { flex-direction: column; gap: 3px; }
        .lv-qc-preview-face { padding: calc(var(--lv-space-unit) * 10); }
    }
    .lv-quickcard .lv-qc-error {
        color: var(--lv-color-danger);
        margin-bottom: var(--lv-sp-2);
    }
    .lv-quickcard .b3-button {
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
    .lv-quickcard .lv-qc-actions {
        justify-content: flex-end;
        gap: var(--lv-sp-2);
    }
    .lv-quickcard .lv-qc-actions :global(.lv-kbd2) {
        margin-left: calc(var(--lv-space-unit) * 3);
        /* 宿主 b3-typography kbd 是白底——主按钮内回到透明 + on-primary 描边 */
        background: transparent;
        color: var(--lv-color-on-brand);
        border-color: color-mix(in srgb, var(--lv-color-on-brand) 40%, transparent);
        opacity: 0.9;
    }
    .lv-quickcard .b3-dialog__action { justify-content: flex-end; }
</style>
