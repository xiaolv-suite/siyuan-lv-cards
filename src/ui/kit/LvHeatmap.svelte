<script lang="ts">
    let { days }: {
        days: { date: string; stat: { new: number; review: number; forget: number } }[];
    } = $props();

    // 规律二：两色分工——热力图为正向学习成果数据，专属使用【数据语义色】(天青水蓝)派生色阶
    function heatColor(n: number): string {
        if (n <= 0) {
            return "transparent";
        }
        const alpha = n >= 30 ? 100 : n >= 15 ? 65 : n >= 5 ? 40 : 20;
        return `color-mix(in srgb, var(--lv-color-data) ${alpha}%, transparent)`;
    }

    function cellTitle(d: { date: string; stat: { new: number; review: number; forget: number } }): string {
        const parts = [`${d.date}: ${d.stat.review}`];
        if (d.stat.new > 0) parts.push(`+${d.stat.new}`);
        if (d.stat.forget > 0) parts.push(`-${d.stat.forget}`);
        return parts.join(" · ");
    }
</script>

<div class="lv-heatmap-wrap" role="region" aria-label="学习活跃度热力图">
    <!-- 周数大时网格远超卡宽：横向滚动（GitHub 式），避免溢出卡片 -->
    <div class="lv-heat-scroll">
        <div class="lv-heatmap">
            {#each days as d, i (d.date)}
                <div
                    class="lv-cell"
                    class:lv-cell-today={i === days.length - 1}
                    style={`background: ${heatColor(d.stat.review)}`}
                    title={cellTitle(d)}
                    role="img"
                    aria-label={cellTitle(d)}
                ></div>
            {/each}
        </div>
    </div>
    <div class="lv-heat-legend ft__smaller ft__on-surface">
        <span class="lv-legend-cell" style="background: transparent; border: 1px solid var(--lv-border)"></span>
        <span class="lv-legend-cell" style="background: color-mix(in srgb, var(--lv-color-data) 20%, transparent)"></span>
        <span class="lv-legend-cell" style="background: color-mix(in srgb, var(--lv-color-data) 40%, transparent)"></span>
        <span class="lv-legend-cell" style="background: color-mix(in srgb, var(--lv-color-data) 65%, transparent)"></span>
        <span class="lv-legend-cell" style="background: var(--lv-color-data)"></span>
    </div>
</div>

<style>
    .lv-heatmap-wrap { min-width: 0; width: 100%; max-width: 100%; overflow: hidden; }
    .lv-heat-scroll {
        width: 100%;
        max-width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        padding-bottom: calc(var(--lv-space-unit) * 2);
        scrollbar-width: thin;
        scrollbar-color: var(--lv-border-strong, transparent) transparent;
    }
    .lv-heatmap {
        display: grid;
        grid-template-rows: repeat(7, 12px);
        grid-auto-flow: column;
        grid-auto-columns: 12px;
        gap: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline));
        width: fit-content;
    }
    .lv-cell {
        width: 12px;
        height: 12px;
        border-radius: var(--lv-r-optical);
        /* 空格可见度：微透同族灰 */
        background-color: color-mix(in srgb, var(--lv-color-text) 8%, transparent);
        transition: transform var(--lv-dur-1) var(--lv-ease), outline var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease);
        outline: 1px solid transparent;
        position: relative;
    }
    .lv-cell:hover {
        transform: scale(1.3);
        z-index: var(--lv-z-elevated);
        outline-color: var(--lv-data-border);
        box-shadow: 0 2px 6px color-mix(in srgb, var(--lv-color-data) 32%, transparent);
    }
    .lv-cell-today { outline: 2px solid var(--lv-color-data); outline-offset: 1px; }
    .lv-heat-legend {
        display: flex;
        gap: calc(var(--lv-space-unit) * 3);
        align-items: center;
        margin-top: var(--lv-sp-2);
        justify-content: flex-end;
    }
    .lv-legend-cell { width: 10px; height: 10px; border-radius: var(--lv-r-optical); display: inline-block; }
</style>
