<script lang="ts">
    // T14 学习日历（docs/42 §3.11/§4）：过去=复习热力，未来=到期负载；数据由宿主注入。
    import type { CalendarCell, ForecastDay } from "@/core/forecast";
    import LvSkeleton from "./LvSkeleton.svelte";

    const DEFAULT_WEEK_DAYS = ["一", "二", "三", "四", "五", "六", "日"];

    let {
        monthLabel,
        cells,
        forecast,
        labels = {},
        weekDays = DEFAULT_WEEK_DAYS,
        dateLabel,
        forecastDayLabel,
        caption = "",
        loading = false,
        selectedDate = null,
        onselect,
    }: {
        /** 标题「2026 年 10 月」 */
        monthLabel: string;
        cells: CalendarCell[];
        forecast: ForecastDay[];
        labels?: { few?: string; many?: string; note?: string; forecastTitle?: string; empty?: string };
        /** Optional localized weekday labels, in Monday-first order. */
        weekDays?: string[];
        /** Optional complete accessible name for each date cell. */
        dateLabel?: (date: string, cell: CalendarCell) => string;
        /** Optional localized accessible name for each forecast bar. */
        forecastDayLabel?: (day: ForecastDay) => string;
        caption?: string;
        loading?: boolean;
        /** 可选的受控选中日期（YYYY-MM-DD）；未提供时不显示选中态。 */
        selectedDate?: string | null;
        /** 提供后，日期格变为可键盘操作的按钮并在选中时回调日期。 */
        onselect?: (date: string) => void;
    } = $props();

    const displayedWeekDays = $derived(weekDays.length === 7 ? weekDays : DEFAULT_WEEK_DAYS);
    const maxLoad = $derived(Math.max(1, ...forecast.map(d => d.reviews + d.news)));
    const isEmpty = $derived(forecast.every(d => d.reviews + d.news === 0));

    function selectDate(date: string | null) {
        if (date) onselect?.(date);
    }

    function accessibleDateLabel(cell: CalendarCell): string {
        if (!cell.date) return "";
        return dateLabel?.(cell.date, cell) ?? cell.date;
    }

    function accessibleForecastLabel(day: ForecastDay): string {
        return forecastDayLabel?.(day) ?? `${day.date} · ${day.reviews + day.news}`;
    }
</script>

<div class="lv-cal">
    {#if loading}
        <LvSkeleton count={1} height={180} />
    {:else}
        <div class="lv-cal-grid" aria-label={monthLabel}>
            {#each displayedWeekDays as d, i (i)}
                <span class="lv-cal-wd">{d}</span>
            {/each}
            {#each cells as c, i (i)}
                {#if c.date === null}
                    <span class="lv-cal-day lv-cal-off"></span>
                {:else if onselect}
                    <button
                        type="button"
                        class={`lv-cal-day ${c.tone}`}
                        title={c.date}
                        aria-label={accessibleDateLabel(c)}
                        aria-pressed={selectedDate === c.date}
                        onclick={() => selectDate(c.date)}
                    >
                        <b>{c.day}</b>
                    </button>
                {:else}
                    <span class={`lv-cal-day ${c.tone}`} title={c.date} aria-label={accessibleDateLabel(c)}>
                        <b>{c.day}</b>
                    </span>
                {/if}
            {/each}
        </div>
        <div class="lv-cal-legend">
            <div class="lv-cal-legend-group">
                <span class="hint">{labels.few ?? ""}</span>
                <span class="lv-cal-sw-row">
                    {#each [1, 2, 3] as lvl (lvl)}
                        <span class={`lv-cal-sw past${lvl}`}></span>
                    {/each}
                </span>
                <span class="hint">{labels.many ?? ""}</span>
            </div>
            {#if forecast.length > 0}
                <div class="lv-cal-legend-group lv-cal-legend-group--future">
                    <span class="lv-cal-sw future2"></span>
                    <span class="hint">{labels.forecastTitle ?? "未来到期"}</span>
                </div>
            {/if}
            <span class="hint lv-cal-legend-note">{labels.note ?? ""}</span>
        </div>
        {#if forecast.length > 0}
            <div class="divider"></div>
            <div class="lv-cal-forecast">
                <div class="lv-secthead"><span>{labels.forecastTitle ?? ""}</span></div>
                {#if isEmpty}
                    <div class="hint">{labels.empty ?? ""}</div>
                {:else}
                    <div class="lv-forecast">
                        {#each forecast as d (d.date)}
                            {@const total = d.reviews + d.news}
                            {@const forecastLabel = accessibleForecastLabel(d)}
                            <div class="lv-forecast-col" title={forecastLabel} aria-label={forecastLabel} role="img">
                                <span class="lv-forecast-count">{total}</span>
                                <i
                                    aria-hidden="true"
                                    class:lv-forecast-hi={total >= 18}
                                    class:lv-forecast-zero={total === 0}
                                    style={`height:${Math.max(total === 0 ? 3 : 10, Math.round(total / maxLoad * 100))}%`}
                                ></i>
                                <span class="lv-forecast-date">{d.date.slice(8)}</span>
                            </div>
                        {/each}
                    </div>
                    <ul class="lv-cal-forecast-text lv-visually-hidden" aria-label={labels.forecastTitle ?? "Forecast"}>
                        {#each forecast as d (d.date)}
                            <li>{d.date}: {d.reviews + d.news}</li>
                        {/each}
                    </ul>
                {/if}
            </div>
        {/if}
        {#if caption}<p class="tiny" style="margin: calc(var(--lv-space-unit) * 5) 0 0">{caption}</p>{/if}
    {/if}
</div>

<style>
    .lv-cal { container-type: inline-size; min-width: 0; }
    .lv-cal-grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline));
        /* 宽卡自适应铺满，但限制单格上限避免巨块；窄容器自然收缩 */
        width: 100%;
        max-width: min(100%, 780px);
        margin: calc(var(--lv-space-unit) * 4) auto 0;
        min-width: 0;
    }
    .lv-cal-wd {
        font-size: var(--lv-type-caption-size);
        letter-spacing: 0.1em;
        color: var(--lv-color-text-muted);
        text-align: center;
        font-weight: var(--lv-fw-heading);
        padding: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline)) 0;
    }
    .lv-cal-day {
        aspect-ratio: 1.35;
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        padding: calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 3 + var(--lv-space-hairline));
        font-size: var(--lv-type-meta-size);
        color: var(--lv-color-text-muted);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        font-variant-numeric: tabular-nums;
        background: var(--lv-color-surface);
        font: inherit;
        text-align: left;
        min-height: 44px;
        box-sizing: border-box;
        box-shadow: 0 1px 2px color-mix(in srgb, black 3%, transparent);
        transition: transform var(--lv-dur-2) var(--lv-ease),
            border-color var(--lv-dur-1) var(--lv-ease),
            box-shadow var(--lv-dur-2) var(--lv-ease);

        &:not(.lv-cal-off):hover {
            transform: translateY(-1.5px);
            border-color: var(--lv-primary-border);
            box-shadow: var(--lv-shadow-2);
            z-index: var(--lv-z-card-control);
        }
    }
    button.lv-cal-day {
        cursor: pointer;
        appearance: none;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
    }
    button.lv-cal-day:focus-visible {
        outline: none;
        box-shadow: var(--lv-focus-ring);
        border-color: var(--lv-color-brand);
        z-index: var(--lv-z-elevated);
    }
    button.lv-cal-day[aria-pressed="true"] {
        border-color: var(--lv-color-brand);
        background: color-mix(in srgb, var(--lv-color-brand) 18%, var(--lv-color-surface));
        box-shadow: 0 0 0 1.5px var(--lv-color-brand), var(--lv-shadow-1);
    }
    .lv-cal-day b { font-size: var(--lv-type-control-size); color: var(--lv-color-text); font-weight: var(--lv-fw-semibold); font-variant-numeric: tabular-nums; }
    .lv-cal-off { border-color: transparent; background: transparent; }
    .lv-cal-day.past1 { background: color-mix(in srgb, var(--lv-color-data) 12%, var(--lv-color-surface)); }
    .lv-cal-day.past2 { background: color-mix(in srgb, var(--lv-color-data) 26%, var(--lv-color-surface)); }
    .lv-cal-day.past3 { background: color-mix(in srgb, var(--lv-color-data) 42%, var(--lv-color-surface)); }
    .lv-cal-day.past2 b, .lv-cal-day.past3 b { color: var(--lv-color-data); }
    .lv-cal-day.today {
        border: 2px solid var(--lv-color-brand);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--lv-color-brand) 25%, transparent);
    }
    .lv-cal-day.future1 { background: color-mix(in srgb, var(--lv-color-warning) 14%, var(--lv-color-surface)); }
    .lv-cal-day.future2 { background: color-mix(in srgb, var(--lv-color-warning) 26%, var(--lv-color-surface)); }
    .lv-cal-day.future3 { background: color-mix(in srgb, var(--lv-color-warning) 40%, var(--lv-color-surface)); }
    .lv-cal-legend {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        margin-top: calc(var(--lv-space-unit) * 6);
        flex-wrap: wrap;
    }
    .lv-cal-legend-group {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 2);
        padding: calc(var(--lv-space-unit) * 1) calc(var(--lv-space-unit) * 3);
        border-radius: var(--lv-r-pill);
        background: color-mix(in srgb, var(--lv-color-canvas) 80%, var(--lv-color-surface));
        border: 1px solid var(--lv-border);
    }
    .lv-cal-sw-row {
        display: inline-flex;
        align-items: center;
        gap: 3px;
    }
    .lv-cal-legend-note {
        margin-left: auto;
    }
    .lv-cal-sw {
        width: 13px;
        height: 13px;
        border-radius: var(--lv-r-xs);
        display: inline-block;
        border: 1px solid var(--lv-border);
    }
    .lv-cal-sw.past1 { background: color-mix(in srgb, var(--lv-color-data) 12%, var(--lv-color-surface)); }
    .lv-cal-sw.past2 { background: color-mix(in srgb, var(--lv-color-data) 26%, var(--lv-color-surface)); }
    .lv-cal-sw.past3 { background: color-mix(in srgb, var(--lv-color-data) 42%, var(--lv-color-surface)); }
    .lv-cal-sw.future2 { background: color-mix(in srgb, var(--lv-color-warning) 24%, var(--lv-color-surface)); }
    .lv-cal-forecast {
        min-width: 0;
        max-width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
    }
    .lv-forecast {
        display: flex;
        gap: calc(var(--lv-space-unit) * 1);
        align-items: stretch;
        height: 92px;
        margin-top: calc(var(--lv-space-unit) * 4);
        min-width: min(100%, 280px);
    }
    .lv-forecast-col {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
    }
    .lv-forecast-count {
        font-size: var(--lv-type-caption-size);
        line-height: 1;
        color: var(--lv-color-text-muted);
        font-variant-numeric: tabular-nums;
    }
    .lv-forecast-col i {
        flex: 1;
        width: min(60%, 22px);
        align-self: flex-end;
        background: color-mix(in srgb, var(--lv-color-warning) 22%, var(--lv-color-surface));
        border-top: 2px solid var(--lv-color-warning);
        border-radius: var(--lv-r-pill) var(--lv-r-pill) 0 0;
        transition: background var(--lv-dur-1) var(--lv-ease);
        cursor: pointer;

        &:hover {
            background: color-mix(in srgb, var(--lv-color-warning) 50%, var(--lv-color-surface));
        }
    }
    .lv-forecast-col i.lv-forecast-hi {
        background: color-mix(in srgb, var(--lv-color-warning) 40%, var(--lv-color-surface));
    }
    .lv-forecast-col i.lv-forecast-zero {
        background: color-mix(in srgb, var(--lv-color-text) 6%, transparent);
        border-top: none;
        border-radius: var(--lv-r-xs);
    }
    .lv-forecast-date {
        font-size: 10px;
        line-height: 1;
        color: var(--lv-color-text-muted);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }
    .lv-visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: calc(var(--lv-space-hairline) * -1);
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
        border: 0;
    }

    /* The Hub owns the responsive container; keep this component usable in a
       narrow embedded panel even when the viewport itself is wide. */
    .lv-cal { min-width: 0; container-type: inline-size; }
    @container (max-width: 480px) {
        .lv-cal-grid { gap: calc(var(--lv-space-unit) * 1); }
        .lv-cal-day { padding: calc(var(--lv-space-unit) * 1) 2px; min-height: 34px; aspect-ratio: 1.1; }
        .lv-cal-day b { font-size: 11px; }
    }
    @container (max-width: 360px) {
        .lv-cal-grid { gap: 2px; }
        .lv-cal-day { padding: 1px; min-height: 30px; aspect-ratio: 1; border-radius: var(--lv-r-tag); }
        .lv-cal-day b { font-size: 10px; }
    }
</style>
