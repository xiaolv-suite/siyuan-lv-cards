<script lang="ts">
    let {
        days,
        lessLabel = "少",
        moreLabel = "多",
        unitLabel = "次",
    }: {
        days: { date: string; stat: { new: number; review: number; forget: number } }[];
        lessLabel?: string;
        moreLabel?: string;
        unitLabel?: string;
    } = $props();

    function cellTotal(d: { stat: { new: number; review: number; forget: number } }): number {
        return (d.stat?.new ?? 0) + (d.stat?.review ?? 0);
    }

    function heatLevel(n: number): 0 | 1 | 2 | 3 | 4 {
        if (n <= 0) return 0;
        if (n >= 30) return 4;
        if (n >= 15) return 3;
        if (n >= 5) return 2;
        return 1;
    }

    function heatColor(n: number): string {
        const lvl = heatLevel(n);
        if (lvl === 0) return "var(--lv-heat-0, #F5F6FA)";
        if (lvl === 1) return "var(--lv-heat-1, #E4E8FD)";
        if (lvl === 2) return "var(--lv-heat-2, #C2CCFA)";
        if (lvl === 3) return "var(--lv-heat-3, #96A6F5)";
        return "var(--lv-heat-4, #697CEB)";
    }

    function cellTitle(d: { date: string; stat: { new: number; review: number; forget: number } }): string {
        const total = cellTotal(d);
        const parts = [`${d.date}: ${total}`];
        if (d.stat.new > 0) parts.push(`新 ${d.stat.new}`);
        if (d.stat.review > 0) parts.push(`复习 ${d.stat.review}`);
        if (d.stat.forget > 0) parts.push(`-${d.stat.forget}`);
        return parts.join(" · ");
    }

    function weekdayMondayFirst(dateStr: string): number {
        const parsed = new Date(`${dateStr}T00:00:00`);
        if (Number.isNaN(parsed.getTime())) return 0;
        return (parsed.getDay() + 6) % 7;
    }

    const leadingPads = $derived(days.length > 0 ? weekdayMondayFirst(days[0].date) : 0);
    const weekCols = $derived(days.length > 0 ? Math.max(1, Math.ceil((days.length + leadingPads) / 7)) : 1);
    const activeDays = $derived(days.filter(d => cellTotal(d) > 0).length);
    const totalReviews = $derived(days.reduce((sum, d) => sum + cellTotal(d), 0));

    const monthMarkers = $derived.by(() => {
        if (days.length === 0) return [] as { col: number; label: string }[];
        const out: { col: number; label: string }[] = [];
        let lastMonth = "";
        let lastCol = -4;
        for (let i = 0; i < days.length; i++) {
            const ym = days[i].date.slice(0, 7);
            const col = Math.floor((i + leadingPads) / 7);
            const dayOfMonth = Number(days[i].date.slice(8, 10));
            if (ym !== lastMonth) {
                lastMonth = ym;
                // 首列仅剩半月残周时跳过标注，避免把紧邻的下一个完整月挤压掉
                if (col === 0 && dayOfMonth > 15 && days.length > 35) continue;
                if (col - lastCol >= 3) {
                    const m = Number(days[i].date.slice(5, 7));
                    if (Number.isFinite(m) && m >= 1 && m <= 12) {
                        out.push({ col, label: `${m}月` });
                        lastCol = col;
                    }
                }
            }
        }
        return out;
    });

    let scrollEl: HTMLElement | null = $state(null);
    $effect(() => {
        void days.length;
        if (scrollEl && scrollEl.scrollWidth > scrollEl.clientWidth) {
            scrollEl.scrollLeft = scrollEl.scrollWidth;
        }
    });
</script>

<div class="lv-heatmap-wrap" role="region" aria-label="学习活跃度热力图">
    <div class="lv-heat-surface">
        <div class="lv-heat-scroll" bind:this={scrollEl}>
            <div
                class="lv-heat-board"
                class:lv-heat-board--fluid={weekCols >= 24}
                style={`--lv-heat-cols: ${weekCols};`}
            >
                {#if days.length > 0 && weekCols >= 6}
                    <div class="lv-heat-months" aria-hidden="true">
                        <span class="lv-heat-corner"></span>
                        <div class="lv-heat-month-track">
                            {#each monthMarkers as m (m.col)}
                                <span class="lv-heat-month-label" style={`grid-column: ${m.col + 1};`}>{m.label}</span>
                            {/each}
                        </div>
                    </div>
                {/if}
                <div class="lv-heat-body">
                    {#if days.length > 0}
                        <div class="lv-heat-weekdays" aria-hidden="true">
                            <span>一</span>
                            <span></span>
                            <span>三</span>
                            <span></span>
                            <span>五</span>
                            <span></span>
                            <span>日</span>
                        </div>
                    {/if}
                    <div class="lv-heatmap" class:lv-heatmap--fluid={weekCols >= 24}>
                        {#each Array.from({ length: leadingPads }, (_, idx) => idx) as padIdx (padIdx)}
                            <div class="lv-cell-pad" aria-hidden="true"></div>
                        {/each}
                        {#each days as d, i (d.date)}
                            {@const total = cellTotal(d)}
                            {@const lvl = heatLevel(total)}
                            <div
                                class={`lv-cell is-level-${lvl}`}
                                class:lv-cell-today={i === days.length - 1}
                                style={`background: ${heatColor(total)}`}
                                title={cellTitle(d)}
                                role="img"
                                aria-label={cellTitle(d)}
                            ></div>
                        {/each}
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="lv-heat-meta">
        <span class="lv-heat-summary">
            {#if days.length > 0}
                近 {days.length} 天 · 活跃 <strong>{activeDays}</strong> 天 · 共 <strong>{totalReviews}</strong> {unitLabel}
            {/if}
        </span>
        <div class="lv-heat-legend" aria-label="活跃度图例">
            <span class="lv-heat-legend-txt">{lessLabel}</span>
            <span class="lv-legend-cell is-level-0" style="background: var(--lv-heat-0, #F5F6FA); border: 1px solid var(--lv-heat-0-border, rgba(100, 116, 139, 0.14));"></span>
            <span class="lv-legend-cell is-level-1" style="background: var(--lv-heat-1, #E4E8FD);"></span>
            <span class="lv-legend-cell is-level-2" style="background: var(--lv-heat-2, #C2CCFA);"></span>
            <span class="lv-legend-cell is-level-3" style="background: var(--lv-heat-3, #96A6F5);"></span>
            <span class="lv-legend-cell is-level-4" style="background: var(--lv-heat-4, #697CEB);"></span>
            <span class="lv-heat-legend-txt">{moreLabel}</span>
        </div>
    </div>
</div>

<style>
    .lv-heatmap-wrap {
        min-width: 0;
        width: 100%;
        max-width: 100%;
        overflow: hidden;
        font-family: var(--lv-font-sans, Inter, "PingFang SC", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif);
        font-variant-numeric: tabular-nums;
    }
    .lv-heat-surface {
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m, 14px);
        background: var(--lv-color-surface);
        padding: 12px 14px;
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
    }
    .lv-heat-scroll {
        width: 100%;
        max-width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        padding: 3px 4px 4px;
        box-sizing: border-box;
        scrollbar-width: thin;
        scrollbar-color: var(--lv-border-strong, transparent) transparent;
    }
    .lv-heat-board {
        display: flex;
        flex-direction: column;
        gap: 6px;
        width: fit-content;
        min-width: 100%;
    }
    .lv-heat-board--fluid {
        width: 100%;
        min-width: max(100%, calc(var(--lv-heat-cols, 17) * 14px));
    }
    .lv-heat-months {
        display: grid;
        grid-template-columns: 22px minmax(0, 1fr);
        align-items: center;
        gap: 6px;
    }
    .lv-heat-corner {
        width: 22px;
    }
    .lv-heat-month-track {
        display: grid;
        grid-template-columns: repeat(var(--lv-heat-cols, 17), minmax(12px, 22px));
        gap: 4px;
        min-width: 0;
    }
    .lv-heat-board--fluid .lv-heat-month-track {
        grid-template-columns: repeat(var(--lv-heat-cols, 52), minmax(11px, 1fr));
    }
    .lv-heat-month-label {
        font-size: 11px;
        font-weight: 500;
        color: var(--lv-color-text-muted);
        white-space: nowrap;
        line-height: 1.2;
    }
    .lv-heat-body {
        display: grid;
        grid-template-columns: 22px minmax(0, 1fr);
        align-items: stretch;
        gap: 6px;
    }
    .lv-heat-weekdays {
        display: grid;
        grid-template-rows: repeat(7, 1fr);
        gap: 4px;
        align-items: center;
        font-size: 10.5px;
        color: var(--lv-color-text-muted);
        line-height: 1;
        user-select: none;
    }
    .lv-heatmap {
        display: grid;
        grid-template-rows: repeat(7, auto);
        grid-auto-flow: column;
        grid-auto-columns: minmax(12px, 22px);
        gap: 4px;
        width: fit-content;
        align-items: center;
    }
    .lv-heatmap--fluid {
        width: 100%;
        grid-template-columns: repeat(var(--lv-heat-cols, 52), minmax(11px, 1fr));
        grid-auto-columns: unset;
    }
    .lv-cell-pad {
        width: 100%;
        aspect-ratio: 1;
        min-width: 11px;
        min-height: 11px;
    }
    .lv-cell {
        width: 100%;
        aspect-ratio: 1;
        min-width: 11px;
        min-height: 11px;
        border-radius: 3.5px;
        box-sizing: border-box;
        transition: transform 140ms cubic-bezier(0.16, 1, 0.3, 1), outline-color 140ms ease;
        outline: 1px solid transparent;
        position: relative;
    }
    .lv-cell.is-level-0 {
        border: 1px solid var(--lv-heat-0-border, rgba(100, 116, 139, 0.12));
    }
    .lv-cell:hover {
        transform: scale(1.18);
        z-index: var(--lv-z-elevated, 2);
        outline: 1.5px solid var(--lv-indigo-accent, #697CEB);
    }
    .lv-cell-today {
        outline: 2px solid var(--lv-indigo-accent, #697CEB);
        outline-offset: 1px;
    }
    .lv-heat-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px 14px;
        margin-top: 10px;
    }
    .lv-heat-summary {
        font-size: 12px;
        color: var(--lv-color-text-muted);
    }
    .lv-heat-summary strong {
        color: var(--lv-indigo-accent-strong, #4F62D6);
        font-weight: 600;
    }
    .lv-heat-legend {
        display: inline-flex;
        gap: 4px;
        align-items: center;
        margin-left: auto;
    }
    .lv-heat-legend-txt {
        font-size: 11px;
        color: var(--lv-color-text-muted);
        margin: 0 2px;
    }
    .lv-legend-cell {
        width: 11px;
        height: 11px;
        border-radius: 3px;
        display: inline-block;
        box-sizing: border-box;
    }
</style>
