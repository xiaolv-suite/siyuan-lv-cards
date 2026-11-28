<script lang="ts">
    // T14 学习日历（docs/42 §3.11/§4）：过去=复习热力，未来=到期负载；雾靛 Mist Indigo 扁平风格。
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
            <div class="lv-cal-divider"></div>
            <div class="lv-cal-forecast">
                <div class="lv-cal-forecast-head"><span>{labels.forecastTitle ?? ""}</span></div>
                {#if isEmpty}
                    <div class="hint">{labels.empty ?? ""}</div>
                {:else}
                    <div class="lv-forecast">
                        {#each forecast as d (d.date)}
                            {@const total = d.reviews + d.news}
                            {@const pct = total === 0 ? 0 : Math.max(10, Math.round((total / maxLoad) * 100))}
                            {@const forecastLabel = accessibleForecastLabel(d)}
                            <div class="lv-forecast-col" title={forecastLabel} aria-label={forecastLabel} role="img">
                                <span class="lv-forecast-count" class:lv-forecast-count--active={total > 0}>{total}</span>
                                <div class="lv-forecast-track" aria-hidden="true">
                                    <i
                                        class:lv-forecast-hi={total >= 18}
                                        class:lv-forecast-zero={total === 0}
                                        style={`height:${total === 0 ? 4 : pct}%`}
                                    ></i>
                                </div>
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
        {#if caption}<p class="tiny lv-cal-caption">{caption}</p>{/if}
    {/if}
</div>

<style>
    .lv-cal {
        container-type: inline-size;
        min-width: 0;
        font-family: var(--lv-font-sans, Inter, "PingFang SC", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif);
        font-variant-numeric: tabular-nums;
    }
    .lv-cal-grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 6px;
        width: 100%;
        max-width: min(100%, 760px);
        margin: 8px auto 0;
        min-width: 0;
    }
    .lv-cal-wd {
        font-size: 11px;
        letter-spacing: 0.04em;
        color: var(--lv-color-text-muted);
        text-align: center;
        font-weight: 600;
        padding: 4px 0;
    }
    .lv-cal-day {
        aspect-ratio: 1.3;
        border: 1px solid var(--lv-border);
        border-radius: 10px;
        padding: 6px 8px;
        font-family: inherit;
        font-size: 12px;
        line-height: 1.2;
        color: var(--lv-color-text-muted);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        font-variant-numeric: tabular-nums;
        background: var(--lv-color-surface);
        text-align: left;
        min-height: 40px;
        box-sizing: border-box;
        transition: transform 140ms cubic-bezier(0.16, 1, 0.3, 1),
            border-color 140ms ease,
            background-color 140ms ease;

        &:not(.lv-cal-off):hover {
            transform: translateY(-1px);
            border-color: var(--lv-indigo-accent, #697CEB);
            z-index: var(--lv-z-card-control, 1);
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
        box-shadow: 0 0 0 2px var(--lv-indigo-border, rgba(105, 124, 235, 0.30));
        border-color: var(--lv-indigo-accent, #697CEB);
        z-index: var(--lv-z-elevated, 2);
    }
    button.lv-cal-day[aria-pressed="true"] {
        border-color: var(--lv-indigo-accent, #697CEB);
        background: var(--lv-indigo-soft, #EEF0FE);
        box-shadow: 0 0 0 2px var(--lv-indigo-border, rgba(105, 124, 235, 0.30));
    }
    .lv-cal-day b {
        font-size: 12px;
        color: var(--lv-color-text);
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        line-height: 1.2;
    }
    .lv-cal-off {
        border-color: transparent;
        background: transparent;
    }
    .lv-cal-day.past1 {
        background: var(--lv-heat-1, #E4E8FD);
        border-color: color-mix(in srgb, var(--lv-indigo-accent, #697CEB) 16%, var(--lv-border));
    }
    .lv-cal-day.past1 b { color: var(--lv-heat-text-1, #434B8C); }
    .lv-cal-day.past2 {
        background: var(--lv-heat-2, #C2CCFA);
        border-color: color-mix(in srgb, var(--lv-indigo-accent, #697CEB) 26%, var(--lv-border));
    }
    .lv-cal-day.past2 b { color: var(--lv-heat-text-2, #31397A); }
    .lv-cal-day.past3 {
        background: var(--lv-heat-3, #96A6F5);
        border-color: color-mix(in srgb, var(--lv-indigo-accent, #697CEB) 42%, var(--lv-border));
    }
    .lv-cal-day.past3 b { color: var(--lv-heat-text-3, #1E245C); }
    .lv-cal-day.today {
        border: 2px solid var(--lv-indigo-accent, #697CEB);
        box-shadow: none;
    }
    .lv-cal-day.today b {
        color: var(--lv-indigo-accent-strong, #4F62D6);
        font-weight: 700;
    }
    .lv-cal-day.future1 {
        background: var(--lv-indigo-future-1, #F4F5FD);
        border-style: dashed;
        border-color: var(--lv-indigo-border, rgba(105, 124, 235, 0.30));
    }
    .lv-cal-day.future2 {
        background: var(--lv-indigo-future-2, #E8ECFC);
        border-style: dashed;
        border-color: var(--lv-indigo-border, rgba(105, 124, 235, 0.30));
    }
    .lv-cal-day.future3 {
        background: var(--lv-indigo-future-3, #D6DEFB);
        border-style: dashed;
        border-color: var(--lv-indigo-accent, #697CEB);
    }
    .lv-cal-day.future1 b,
    .lv-cal-day.future2 b,
    .lv-cal-day.future3 b {
        color: var(--lv-indigo-accent-strong, #4F62D6);
    }

    .lv-cal-legend {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 12px;
        flex-wrap: wrap;
        font-size: 11px;
    }
    .lv-cal-legend-group {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 10px;
        border-radius: 999px;
        background: var(--lv-heat-0, #F5F6FA);
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
        width: 11px;
        height: 11px;
        border-radius: 3px;
        display: inline-block;
        border: 1px solid var(--lv-heat-0-border, rgba(100, 116, 139, 0.14));
        box-sizing: border-box;
    }
    .lv-cal-sw.past1 { background: var(--lv-heat-1, #E4E8FD); border-color: transparent; }
    .lv-cal-sw.past2 { background: var(--lv-heat-2, #C2CCFA); border-color: transparent; }
    .lv-cal-sw.past3 { background: var(--lv-heat-3, #96A6F5); border-color: transparent; }
    .lv-cal-sw.future2 {
        background: var(--lv-indigo-future-2, #E8ECFC);
        border: 1px dashed var(--lv-indigo-accent, #697CEB);
    }

    .lv-cal-divider {
        height: 1px;
        background: var(--lv-border);
        margin: 14px 0 12px;
    }
    .lv-cal-forecast-head {
        font-size: 13px;
        font-weight: 600;
        color: var(--lv-color-text);
        margin-bottom: 8px;
    }
    .lv-cal-forecast {
        min-width: 0;
        max-width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
    }
    .lv-forecast {
        display: flex;
        gap: 6px;
        align-items: stretch;
        height: 112px;
        margin-top: 6px;
        min-width: min(100%, 280px);
    }
    .lv-forecast-col {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
    }
    .lv-forecast-count {
        font-size: 11px;
        line-height: 1;
        color: var(--lv-color-text-muted);
        font-variant-numeric: tabular-nums;
    }
    .lv-forecast-count--active {
        color: var(--lv-color-text);
        font-weight: 600;
    }
    .lv-forecast-track {
        flex: 1;
        width: clamp(10px, 58%, 16px);
        background: var(--lv-indigo-track, #F2F4FA);
        border-radius: 999px;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        overflow: hidden;
        min-height: 0;
    }
    .lv-forecast-track i {
        display: block;
        width: 100%;
        background: linear-gradient(180deg, var(--lv-indigo-accent, #697CEB) 0%, var(--lv-heat-3, #96A6F5) 100%);
        border-radius: 999px;
        transition: height 180ms cubic-bezier(0.16, 1, 0.3, 1), opacity 140ms ease;
    }
    .lv-forecast-track i.lv-forecast-hi {
        background: var(--lv-heat-4, #697CEB);
    }
    .lv-forecast-track i.lv-forecast-zero {
        background: var(--lv-heat-0-border, rgba(100, 116, 139, 0.14));
    }
    .lv-forecast-date {
        font-size: 10.5px;
        line-height: 1;
        color: var(--lv-color-text-muted);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }
    .lv-cal-caption {
        margin: 10px 0 0;
        font-size: 11.5px;
        color: var(--lv-color-text-muted);
        line-height: 1.5;
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

    @container (max-width: 480px) {
        .lv-cal-grid { gap: 4px; }
        .lv-cal-day { padding: 4px; min-height: 34px; aspect-ratio: 1.05; border-radius: 8px; }
        .lv-cal-day b { font-size: 11px; }
        .lv-forecast { gap: 3px; }
    }
    @container (max-width: 360px) {
        .lv-cal-grid { gap: 2px; }
        .lv-cal-day { padding: 2px; min-height: 30px; aspect-ratio: 1; border-radius: 6px; }
        .lv-cal-day b { font-size: 10px; }
    }
</style>
