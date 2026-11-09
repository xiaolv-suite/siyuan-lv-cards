<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "@/libs/notice";
    import { getNotebooks, type Notebook } from "@/api/siyuan";
    import LvSection from "./kit/LvSection.svelte";
    import LvRow from "./kit/LvRow.svelte";
    import LvIcon from "./kit/LvIcon.svelte";
    import { formatRiffCardEntryError } from "@/api/due-shared";

    let { i18n, applyPersona, createSampleCards, openReview, openHelp, openSampleDoc, onClose }: {
        i18n: any;
        applyPersona: (id: "exam" | "notes" | "language") => void;
        createSampleCards: (notebookId: string) => Promise<string | null>;
        openReview: () => void;
        openHelp: () => void;
        openSampleDoc: (docId: string) => void;
        onClose: () => void;
    } = $props();
    const t = $derived(i18n);

    let step = $state(1);
    let persona = $state<"exam" | "notes" | "language" | "">("");
    let notebooks: Notebook[] = $state([]);
    let nbId = $state("");
    let notebookLoading = $state(true);
    let notebookError = $state("");
    let busy = $state(false);
    let errorMsg = $state("");
    let sampleDocId = $state("");

    const personaKeys = [
        { id: "exam", nameKey: "personaExam" },
        { id: "notes", nameKey: "personaNotes" },
        { id: "language", nameKey: "personaLanguage" },
    ] as const;

    async function loadNotebooks() {
        notebookLoading = true;
        notebookError = "";
        try {
            notebooks = await getNotebooks();
            if (notebooks.length > 0) {
                const preferred = notebooks.find((n) => /小驴空间|小驴生态统一测试空间|小驴笔记本|小驴闪卡/.test(n.name || "")) ?? notebooks[0];
                nbId = preferred.id;
            } else {
                nbId = "";
                notebookError = t.onboardingNoNotebook;
            }
        } catch (e: any) {
            nbId = "";
            notebookError = e?.message ?? String(e);
        } finally {
            notebookLoading = false;
        }
    }

    onMount(() => {
        void loadNotebooks();
    });

    function pickPersona(id: "exam" | "notes" | "language") {
        persona = id;
        applyPersona(id);
        step = 2;
    }

    /** 跳过示例创建，直接完成引导进入应用 */
    function skipAllSamples() {
        finish();
    }

    async function createSamples() {
        if (busy || !nbId) {
            errorMsg = notebooks.length === 0 ? t.onboardingNoNotebook : "";
            return;
        }
        busy = true;
        errorMsg = "";
        try {
            sampleDocId = (await createSampleCards(nbId)) ?? "";
            step = 3;
        } catch (e: any) {
            errorMsg = formatRiffCardEntryError(e, t, e?.message ?? String(e));
        } finally {
            busy = false;
        }
    }

    function finish() {
        openReview();
        onClose();
    }

    function openSamples() {
        if (sampleDocId) openSampleDoc(sampleDocId);
        showMessage(t.onboardingSamplesTip ?? "已为您打开示例笔记！随时可点击顶栏小驴闪卡图标或按 Alt+K 开启复习", 4000, "info");
        onClose();
    }

    function openHelpAndClose() {
        openHelp();
        onClose();
    }

    function onWindowKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        }
    }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="lv-onboarding b3-typography">
    <div class="lv-ob-head">
        <span class="lv-ob-step">{t.onboardingStep} {step} / 3</span>
        <div class="fn__flex-1"></div>
        <button
            class="b3-button b3-button--small b3-button--outline lv-btn-tool"
            aria-keyshortcuts="Escape"
            title={`${t.onboardingSkip} (Esc)`}
            onclick={onClose}
        >
            <span>{t.onboardingSkip}</span>
        </button>
    </div>

    {#if step === 1}
        <!-- R59 直通引导：选画像 = 一步完成。点画像即建示例并进入完成页，不再有中间确认步 -->
        <LvSection title={t.onboardingPersonaQ} sub={t.onboardingPersonaHint}>
            <div class="fn__flex fn__flex-wrap lv-ob-cards">
                {#each personaKeys as p (p.id)}
                    <button class="lv-persona" class:lv-persona-active={persona === p.id} disabled={busy} aria-busy={busy && persona === p.id} onclick={() => pickPersona(p.id)}>
                        <div class="lv-persona-name">{t[p.nameKey]}</div>
                        <div class="ft__smaller ft__on-surface">{t[p.nameKey + "_desc"]}</div>
                    </button>
                {/each}
            </div>
            <div class="lv-ob-create-status" role="status" aria-live="polite">
                {#if busy}
                    <span aria-busy="true">{t.onboardingCreatingSamples ?? "正在为您创建全类型示例卡组（13 类卡面）…"}</span>
                {:else if notebookLoading}
                    <span aria-busy="true">{t.dashboard.loading}</span>
                {:else if notebookError}
                    <span class="lv-ob-create-warn" role="alert">{notebookError}</span>
                    <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" disabled={busy} onclick={loadNotebooks}><LvIcon name="refresh" size={12} /> <span>{t.dashboard.refresh}</span></button>
                {:else if errorMsg}
                    <span class="lv-ob-create-warn" role="alert">{errorMsg}</span>
                {:else}
                    <span>{t.onboardingOneClickHint ?? "点击任一画像，自动创建「示例卡组」（含问答 / 挖空 / 选择题 / 判断题 / 填空 / 公式等 13 类示例卡）并进入完成页。"}</span>
                {/if}
            </div>
            <details class="lv-ob-advanced">
                <summary class="ft__smaller ft__on-surface">{t.onboardingAdvancedPick ?? "自定义示例存放的笔记本"}</summary>
                <div class="fn__flex" style="align-items: center; gap: var(--lv-sp-2); margin-top: var(--lv-sp-2)">
                    <select class="b3-select" style="min-width: 220px; flex: 1" bind:value={nbId} disabled={notebookLoading || notebooks.length === 0 || busy}>
                        {#each notebooks as n (n.id)}
                            <option value={n.id}>{n.name}</option>
                        {/each}
                    </select>
                </div>
            </details>
            <div class="lv-ob-intro">
                <strong>{t.onboardingHowTitle}</strong>
                <div class="ft__smaller ft__on-surface">{t.onboardingHowDesc}</div>
            </div>
            <div class="lv-ob-types">
                <strong>{t.onboardingTypesTitle}</strong>
                <div class="lv-ob-type-grid">
                    <span><b><LvIcon name="message" size={14} /> {t.onboardingTypeQa}</b>{t.onboardingTypeQaDesc}</span>
                    <span><b><LvIcon name="edit" size={14} /> {t.onboardingTypeCloze}</b>{t.onboardingTypeClozeDesc}</span>
                    <span><b><LvIcon name="code" size={14} /> {t.onboardingTypeFormula}</b>{t.onboardingTypeFormulaDesc}</span>
                    <span><b><LvIcon name="book" size={14} /> {t.onboardingTypeList}</b>{t.onboardingTypeListDesc}</span>
                    <span><b><LvIcon name="target" size={14} /> {t.onboardingTypeConcept}</b>{t.onboardingTypeConceptDesc}</span>
                </div>
            </div>
            <div class="fn__flex" style="justify-content: flex-end; margin-top: var(--lv-sp-2)">
                <button class="b3-button b3-button--text" disabled={busy} onclick={skipAllSamples}>
                    <span>{t.onboardingSkipToApp ?? "跳过示例，直接开始使用"}</span> <LvIcon name="chevron-right" size={12} />
                </button>
            </div>
        </LvSection>
    {:else if step === 2}
        <LvSection title={t.onboardingSampleTitle} sub={t.onboardingSampleHint}>
            <div class="lv-ob-callout">{t.onboardingSampleNotice}</div>
            <LvRow label={t.onboardingNotebook}>
                {#snippet children()}
                    <select class="b3-select" style="min-width: 220px; flex: 1" bind:value={nbId} disabled={notebookLoading || notebooks.length === 0}>
                        {#each notebooks as n (n.id)}
                            <option value={n.id}>{n.name}</option>
                        {/each}
                    </select>
                {/snippet}
            </LvRow>
            {#if notebookLoading}
                <div class="ft__smaller ft__on-surface" role="status" style="margin-top: var(--lv-sp-2)">{t.dashboard.loading}</div>
            {:else if notebookError}
                <div class="lv-notice lv-notice--warn" role="alert" aria-live="assertive" style="margin-top: var(--lv-sp-2)">{notebookError}</div>
                <div class="fn__flex" style="justify-content: flex-end; margin-top: var(--lv-sp-1)">
                    <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" disabled={busy} onclick={loadNotebooks}><LvIcon name="refresh" size={13} /> <span>{t.dashboard.refresh}</span></button>
                </div>
            {/if}
            {#if errorMsg}
                <div class="lv-notice lv-notice--warn" role="alert" aria-live="assertive" style="margin-top: var(--lv-sp-2); border-color: var(--lv-danger-border); background: var(--lv-danger-soft); color: var(--lv-color-danger)">{errorMsg}</div>
            {/if}
            <div class="fn__flex" style="justify-content: flex-end; gap: var(--lv-sp-2); margin-top: var(--lv-sp-2)">
                <button class="b3-button b3-button--outline lv-btn-tool" onclick={() => (step = 1)}><LvIcon name="chevron-left" size={12} /> <span>{t.onboardingBack}</span></button>
                <button
                    class="b3-button lv-btn-primary"
                    disabled={busy || notebookLoading || !nbId}
                    aria-busy={busy}
                    title={busy ? "…" : t.onboardingCreate}
                    onclick={createSamples}
                >
                    <LvIcon name="plus" size={13} />
                    <span>{busy ? "…" : t.onboardingCreate}</span>
                </button>
            </div>
        </LvSection>
    {:else}
        <LvSection title={t.onboardingDoneTitle}>
            <div class="ft__on-surface lv-ob-done-desc">{t.onboardingDoneDesc}</div>
            <div class="fn__flex" style="justify-content: flex-end; gap: var(--lv-sp-2); margin-top: var(--lv-sp-3)">
                <button class="b3-button b3-button--outline lv-btn-tool" onclick={openHelpAndClose}><LvIcon name="question" size={12} /> <span>{t.onboardingHelp}</span></button>
                {#if sampleDocId}
                    <button class="b3-button b3-button--outline lv-btn-tool" onclick={openSamples}><LvIcon name="book" size={12} /> <span>{t.onboardingOpenSamples}</span></button>
                {/if}
                <button class="b3-button lv-btn-primary" onclick={finish}>
                    <span>{t.onboardingFinish}</span> <LvIcon name="chevron-right" size={13} />
                </button>
            </div>
        </LvSection>
    {/if}
</div>

<style>
    .lv-onboarding {
        padding: var(--lv-sp-4);
        max-width: 640px;
        margin: 0 auto;
        height: 100%;
        overflow: auto;
        scrollbar-width: thin;
        scrollbar-color: color-mix(in srgb, var(--lv-color-text) 18%, transparent) transparent;
        overscroll-behavior: contain;
        box-sizing: border-box;

        .b3-button {
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }
        }

        .b3-select {
            touch-action: manipulation;
            transition: border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease);

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
                border-color: var(--lv-color-brand);
            }
        }
    }
    .lv-ob-done-desc {
        max-width: 48em;
        text-wrap: pretty;
        line-height: var(--lv-lh-relaxed);
        margin: var(--lv-sp-2) 0;
    }
    .lv-ob-head {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-3);
    }
    .lv-ob-step {
        font-size: var(--lv-type-control-size);
        color: var(--lv-color-text-muted);
        font-variant-numeric: tabular-nums;
    }
    .lv-ob-cards {
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-3);
    }
    .lv-ob-intro, .lv-ob-types {
        margin-bottom: var(--lv-sp-3);
        padding: var(--lv-sp-4);
        background: var(--lv-primary-soft);
        border: 1px solid var(--lv-primary-border);
        border-radius: var(--lv-r-l);
        box-shadow: var(--lv-shadow-1), var(--lv-inset-shine);
        transition: transform var(--lv-dur-1) var(--lv-ease), border-color var(--lv-dur-1) var(--lv-ease);
    }
    .lv-ob-intro strong, .lv-ob-types strong { display: block; margin-bottom: var(--lv-sp-1); }
    .lv-ob-type-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--lv-sp-2); }
    .lv-ob-type-grid span { display: flex; flex-direction: column; gap: calc(var(--lv-space-unit) * 1); font-size: var(--lv-type-control-size); }
    .lv-ob-type-grid b { display: inline-flex; align-items: center; gap: 6px; font-size: var(--lv-type-body-size); }
    .lv-ob-callout {
        margin-bottom: var(--lv-sp-3);
        padding: var(--lv-sp-2) var(--lv-sp-3);
        border-left: 3px solid var(--lv-color-brand);
        background: var(--lv-color-canvas-subtle);
        border-radius: 0 var(--lv-r-s) var(--lv-r-s) 0;
        font-size: var(--lv-type-control-size);
        max-width: 48em;
        text-wrap: pretty;
        line-height: var(--lv-lh-reading, 1.65);
    }
    .lv-ob-create-status {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        flex-wrap: wrap;
        margin: var(--lv-sp-2) 0 var(--lv-sp-3);
        padding: calc(var(--lv-space-unit) * 2) calc(var(--lv-space-unit) * 4);
        border-radius: var(--lv-r-m);
        background: color-mix(in srgb, var(--lv-color-brand) 5%, var(--lv-color-surface));
        border: 1px solid color-mix(in srgb, var(--lv-color-brand) 14%, var(--lv-border));
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-meta-size);
        line-height: var(--lv-lh-body);
    }
    .lv-ob-create-warn { color: var(--lv-color-warning); }
    .lv-ob-advanced summary { cursor: pointer; user-select: none; -webkit-user-select: none; }
    .lv-persona:disabled { opacity: 0.72; cursor: progress; }
    .lv-persona {
        flex: 1 1 140px;
        padding: var(--lv-sp-3);
        cursor: pointer;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        border: 1px solid var(--lv-border);
        background: var(--lv-color-surface);
        text-align: left;
        border-radius: var(--lv-r-l);
        box-shadow: var(--lv-shadow-1), var(--lv-inset-shine);
        transition: border-color var(--lv-dur-2) var(--lv-ease), transform var(--lv-dur-2) var(--lv-ease),
            box-shadow var(--lv-dur-2) var(--lv-ease);

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
    .lv-persona:hover {
        transform: translateY(-2px);
        box-shadow: var(--lv-shadow-2), var(--lv-inset-shine);
        border-color: var(--lv-border-strong);
    }
    .lv-persona-active {
        border-color: var(--lv-color-brand);
        background: var(--lv-primary-soft);
        box-shadow: 0 0 0 1.5px var(--lv-color-brand), var(--lv-shadow-1);
    }
    .lv-persona-name {
        font-weight: var(--lv-fw-semibold);
        margin-bottom: calc(var(--lv-space-unit) * 1);
        text-wrap: balance;
    }
    @media (max-width: 480px) {
        .lv-ob-type-grid { grid-template-columns: 1fr; }
    }
</style>
