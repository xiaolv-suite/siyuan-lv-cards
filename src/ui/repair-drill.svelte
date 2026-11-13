<script lang="ts">
    /**
     * T10 修卡演练（docs/13 §12，starline help 面）：独立样例上的五步修卡练习。
     * 纪律：固定公开样例、零网络（"固定 AI 改法"不发请求）、零数据写入、
     * 演练进度与旁路练习表现不迁入真实学习、不产生正式评分。
     * T10 扩容（2026-10-06）：样例库两则——题面过宽 / 缺少必要条件（选择器切换）。
     */
    import { fade } from "svelte/transition";
    import { getMotionDuration } from "./kit/motion";
    import LvSteps from "./kit/LvSteps.svelte";
    import LvIcon from "./kit/LvIcon.svelte";
    import { sqlQuery } from "@/api/siyuan";
    import { showMessage } from "@/libs/notice";

    let { i18n, onClose }: { i18n: any; onClose: () => void } = $props();
    const t = $derived(i18n);

    const STEPS = 5;
    let step = $state(1); // 1..5
    let sampleIdx = $state(0);
    let draft = $state("");
    let revealed = $state(false);
    let importing = $state(false);
    let customSample = $state<{
        label: string;
        material: string;
        brokenQ: string;
        issue: string;
        fixed: string;
        answer: string;
    } | null>(null);

    const samples = $derived.by(() => {
        const base = [
            {
                label: t.drillSample1 ?? "样例 1：题面过宽",
                material: t.drillMaterial,
                brokenQ: t.drillBrokenQ,
                issue: t.drillIssue,
                fixed: t.drillFixed,
                answer: t.drillAnswer,
            },
            {
                label: t.drillSample2 ?? "样例 2：缺少前提",
                material: t.drill2Material,
                brokenQ: t.drill2BrokenQ,
                issue: t.drill2Issue,
                fixed: t.drill2Fixed,
                answer: t.drill2Answer,
            },
        ];
        if (customSample) {
            base.push(customSample);
        }
        return base;
    });
    const sample = $derived(samples[sampleIdx] ?? samples[0]);

    async function importPersonalLeechCard() {
        if (importing) return;
        importing = true;
        try {
            const rows = await sqlQuery(
                "SELECT id, content, markdown FROM blocks WHERE (ial LIKE '%custom-lv-leech=\"true\"%' OR ial LIKE '%custom-lv-lapses=\"%') ORDER BY updated DESC LIMIT 10"
            );
            if (!rows || rows.length === 0) {
                showMessage("当前卡库未检测到水蛭卡（遗忘记录良好），无需急救！", 2500, "info");
                return;
            }
            const target = rows[Math.floor(Math.random() * rows.length)] as any;
            const md = String(target?.markdown || target?.content || "").trim();
            const match = md.match(/==([^=]+)==/);
            const answer = match ? match[1].trim() : "核心知识点";
            const brokenQ = md.replace(/==([^=]+)==/g, "____");

            customSample = {
                label: `实战：${String(target?.content || md).slice(0, 8)}…`,
                material: `【个人水蛭卡原块】\n${md}`,
                brokenQ: brokenQ || md,
                issue: "【顽疾诊断】该卡在日常复习中发生多次遗忘。常见病灶：题干过长缺少前置关键词定位、单空记忆负载过大，或缺少明确场景提示。",
                fixed: "【重构建议】将知识点拆解为原子化问答；明确核心触发语境（例如：「在...场景下」）；确保答案单空唯一。",
                answer,
            };
            sampleIdx = 2;
            step = 1;
            draft = customSample.brokenQ;
            revealed = false;
            showMessage("已成功导入个人真实水蛭卡案例，开始 5 步救治演练！", 2500, "info");
        } catch (e: any) {
            showMessage(`导入失败：${e?.message ?? String(e)}`, 3000, "error");
        } finally {
            importing = false;
        }
    }

    const stepLabels = $derived([
        t.drillStep1,
        t.drillStep2,
        t.drillStep3,
        t.drillStep4,
        t.drillStep5,
    ]);

    function pickSample(i: number) {
        sampleIdx = i;
        step = 1;
        draft = samples[i].brokenQ;
        revealed = false;
    }

    // 初值：默认样例的坏卡题面（切换样例时由 pickSample 重置）
    // svelte-ignore state_referenced_locally -- 初值刻意的
    draft = samples[0].brokenQ;

    function onKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            e.preventDefault();
            onClose();
            return;
        }
        if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
        if (e.key === "ArrowRight") {
            if (step < STEPS) {
                e.preventDefault();
                step += 1;
            }
        } else if (e.key === "ArrowLeft") {
            if (step > 1) {
                e.preventDefault();
                step -= 1;
            }
        }
    }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="lv-aiwiz lv-drill b3-typography" role="region" aria-label={t.drillBadge ?? "修卡演练"}>
    <div class="lv-drill-head">
        <LvSteps steps={stepLabels} current={step - 1} />
        <span class="lv-tag lv-tag--brand">{t.drillBadge}</span>
        <div class="fn__flex-1"></div>
        <button
            type="button"
            class="b3-button b3-button--small b3-button--outline lv-btn-tool"
            aria-label="关闭修卡演练"
            title="关闭 (Esc)"
            onclick={onClose}
        >
            <LvIcon name="close" size={13} />
        </button>
    </div>

    <!-- 样例选择器（T10 扩容 + CF-15 真实水蛭卡实战导入） -->
    <div class="lv-drill-samples">
        {#each samples as sm, i (i)}
            <button
                class="b3-button b3-button--small {sampleIdx === i ? 'lv-btn-primary' : 'b3-button--outline'}"
                aria-pressed={sampleIdx === i}
                onclick={() => pickSample(i)}
            >{sm.label}</button>
        {/each}
        <button
            type="button"
            class="b3-button b3-button--small b3-button--outline lv-btn-tool"
            disabled={importing}
            onclick={importPersonalLeechCard}
            title="从个人真实水蛭卡库提取高遗忘卡片进行救治重构演练"
        >
            <LvIcon name="zap" size={12} />
            <span>{importing ? "正在提取…" : "导入个人水蛭卡实战"}</span>
        </button>
    </div>

    {#key `${sampleIdx}-${step}`}
        <div class="lv-drill-stage" transition:fade={{ duration: getMotionDuration("normal") }}>
            {#if step === 1}
                <!-- 看材料与必要条件 -->
                <div class="lv-card2 lv-drill-card">
                    <div class="lv-eyebrow">{t.drillMaterialLabel}</div>
                    <p style="line-height: var(--lv-lh-reading-loose); margin: 10px 0">{sample.material}</p>
                    <div class="ft__smaller ft__on-surface">{t.drillMaterialNote}</div>
                </div>
                <div class="lv-notice lv-notice--warn">{t.drillIntro}</div>
            {:else if step === 2}
                <!-- 找出题面的问题 -->
                <div class="lv-card2 lv-drill-card">
                    <div class="lv-eyebrow">{t.drillCardLabel}</div>
                    <div style="font-weight: var(--lv-fw-heading); margin: 10px 0; line-height: 1.65">{sample.brokenQ}</div>
                </div>
                <div class="lv-notice lv-notice--warn">{sample.issue}</div>
            {:else if step === 3}
                <!-- 修改并看实际卡面 -->
                <div>
                    <label class="ft__smaller" style="display: block; margin-bottom: 6px; font-weight: var(--lv-fw-medium);" for="drill-rewrite">{t.drillEditLabel}</label>
                    <textarea
                        id="drill-rewrite"
                        class="b3-text-field fn__block"
                        rows="2"
                        bind:value={draft}
                        spellcheck="false"
                        autocomplete="off"
                        aria-label={t.drillEditLabel}
                    ></textarea>
                </div>
                <div class="lv-card2 lv-drill-card">
                    <div class="lv-eyebrow">{t.aiWizard.previewQLabel}</div>
                    <div style="font-weight: var(--lv-fw-heading); margin: 8px 0 0; line-height: 1.65">{draft || "—"}</div>
                </div>
                <div class="lv-notice">{t.drillEditNote}</div>
            {:else if step === 4}
                <!-- 对照固定改法（不发请求） -->
                <div class="lv-card2 lv-drill-card">
                    <div class="lv-eyebrow">{t.drillEditLabel}</div>
                    <div style="margin: 8px 0 0; line-height: 1.65">{draft || "—"}</div>
                </div>
                <div class="lv-card2 lv-drill-card">
                    <div class="lv-eyebrow">{t.drillFixedLabel}</div>
                    <div style="margin: 8px 0 0; line-height: 1.65">{sample.fixed}</div>
                </div>
                <div class="lv-notice">{t.drillCompareNote}</div>
            {:else}
                <!-- 旁路试练：自评对照，不迁入真实证据 -->
                <div class="lv-card2 lv-drill-card">
                    <div class="lv-eyebrow">{t.drillPractice}</div>
                    <div style="font-weight: var(--lv-fw-heading); margin: 10px 0; line-height: 1.65">{draft || "—"}</div>
                    {#if revealed}
                        <div style="border-top: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent); padding-top: 12px; margin-top: 12px; line-height: 1.65">{sample.answer}</div>
                    {:else}
                        <button class="b3-button lv-btn-primary" style="margin-top: 8px" onclick={() => (revealed = true)}>{t.drillReveal}</button>
                    {/if}
                </div>
                <div class="lv-notice">{t.drillPracticeNote}</div>
            {/if}
        </div>
    {/key}

    <div class="lv-drill-foot">
        <button
            class="b3-button b3-button--outline lv-btn-tool"
            disabled={step <= 1}
            aria-keyshortcuts="ArrowLeft"
            title={`${t.drillPrev} (←)`}
            onclick={() => (step = Math.max(1, step - 1))}
        >
            <LvIcon name="chevron-left" size={13} /> <span>{t.drillPrev}</span>
        </button>
        <span class="ft__smaller ft__on-surface" style="font-variant-numeric: tabular-nums;">{step} / {STEPS}</span>
        {#if step < STEPS}
            <button
                class="b3-button lv-btn-primary"
                style="display: inline-flex; align-items: center; gap: calc(var(--lv-space-unit) * 2);"
                aria-keyshortcuts="ArrowRight"
                title={`${t.drillNext} (→)`}
                onclick={() => (step = Math.min(STEPS, step + 1))}
            >
                <span>{t.drillNext}</span> <LvIcon name="chevron-right" size={13} />
            </button>
        {:else}
            <button class="b3-button lv-btn-primary" onclick={onClose}>{t.drillExit}</button>
        {/if}
    </div>
    <div class="ft__smaller ft__on-surface lv-drill-caption">{t.drillFoot}</div>
</div>

<style>
    .lv-drill {
        width: 100%;
        box-sizing: border-box;
        padding: 20px 24px;
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-3);
        overflow-y: auto;
        max-height: min(82vh, 720px);
    }
    .lv-drill-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-3);
        flex-wrap: wrap;
        padding-bottom: var(--lv-sp-3);
        border-bottom: 1px solid var(--lv-border);
    }
    .lv-drill-samples {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        flex-wrap: wrap;
    }
    .lv-drill-stage {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-3);
    }
    .lv-drill-card {
        padding: 16px 18px;
        margin: 0;
    }
    .lv-drill-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-2);
        padding-top: var(--lv-sp-3);
        margin-top: var(--lv-sp-1);
        border-top: 1px solid var(--lv-border);
    }
    .lv-drill-caption {
        text-align: center;
        max-width: 48em;
        margin: 0 auto;
        text-wrap: pretty;
    }
    .lv-aiwiz .b3-button {
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
    .lv-aiwiz .b3-text-field {
        touch-action: manipulation;
        transition: border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease);

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
            border-color: var(--lv-color-brand);
        }
    }
    .lv-aiwiz p {
        max-width: 48em;
        text-wrap: pretty;
    }
    .lv-aiwiz :global(.lv-card2) {
        transition: transform var(--lv-dur-2) var(--lv-ease),
            border-color var(--lv-dur-1) var(--lv-ease),
            box-shadow var(--lv-dur-2) var(--lv-ease);

        &:hover {
            transform: translateY(-1px);
            border-color: var(--lv-border-strong);
            box-shadow: var(--lv-shadow-card-hover), var(--lv-inset-shine);
        }
    }
</style>
