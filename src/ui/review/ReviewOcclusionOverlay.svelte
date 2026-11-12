<script lang="ts">
    import type { OcclusionData } from "@/core/occlusion";

    interface Props {
        occl?: OcclusionData | null;
        occlBox?: { l: number; t: number; w: number; h: number } | null;
        occlHidden?: number[];
        showAnswer?: boolean;
        onToggleRect?: (index: number) => void;
    }

    let {
        occl = null,
        occlBox = null,
        occlHidden = $bindable([]),
        showAnswer = false,
        onToggleRect = () => {},
    }: Props = $props();

    function toggleIndex(index: number) {
        if (occlHidden.includes(index)) {
            occlHidden = occlHidden.filter((x) => x !== index);
        } else {
            occlHidden = [...occlHidden, index];
        }
        onToggleRect(index);
    }

    function handleRectClick(e: MouseEvent, index: number) {
        if (showAnswer) return;
        e.stopPropagation();
        toggleIndex(index);
    }

    function handleKeyDown(e: KeyboardEvent, index: number) {
        if (showAnswer) return;
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            toggleIndex(index);
        }
    }
</script>

<!-- 未揭晓的遮挡框必须完全不透明：半透明会让框下的文字/标注透出来，等于提前看到答案 -->
{#if occl && occlBox}
    <!-- 遮罩 overlay：问题态实心（点击逐框显隐），答案态半透明全显 -->
    <svg
        class="lv-occl-overlay"
        style={`left:${occlBox.l}px;top:${occlBox.t}px;width:${occlBox.w}px;height:${occlBox.h}px;`}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        data-testid="review-occl-overlay"
    >
        {#each occl.rects as r, i (i)}
            {@const revealed = showAnswer || occlHidden.includes(i)}
            <rect
                x={r.x * 100}
                y={r.y * 100}
                width={r.w * 100}
                height={r.h * 100}
                fill="var(--lv-color-brand)"
                opacity={revealed ? (showAnswer ? 0.12 : 0.05) : 1}
                stroke="var(--lv-primary-border)"
                stroke-width="0.3"
                role="button"
                tabindex={showAnswer ? -1 : 0}
                aria-label={`遮挡框 ${i + 1}`}
                style={`cursor:${showAnswer ? "default" : "pointer"}`}
                onclick={(e: MouseEvent) => handleRectClick(e, i)}
                onkeydown={(e: KeyboardEvent) => handleKeyDown(e, i)}
                data-testid={`review-occl-rect-${i}`}
                data-revealed={revealed}
            />
        {/each}
    </svg>
{/if}

<style lang="scss">
    .lv-occl-overlay {
        position: absolute;
        z-index: var(--lv-z-card-control);

        rect {
            touch-action: manipulation;
            transition: opacity var(--lv-dur-1) var(--lv-ease), stroke var(--lv-dur-1) var(--lv-ease), stroke-width var(--lv-dur-1) var(--lv-ease);

            &:focus-visible {
                outline: none;
                stroke: var(--lv-color-brand);
                stroke-width: 0.8;
            }
        }
    }
</style>
