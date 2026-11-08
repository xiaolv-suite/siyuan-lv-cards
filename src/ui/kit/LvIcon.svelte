<script lang="ts">
    export type LvIconName =
        | "home" | "cards" | "plus" | "learn" | "settings" | "inbox" | "search" | "question" | "bell"
        | "book" | "target" | "lightbulb" | "calendar" | "graduation" | "flag" | "zap" | "eye" | "edit" | "refresh"
        | "moon" | "ban" | "timer" | "image" | "code" | "message" | "warning" | "dice" | "flame" | "star" | "check"
        | "trash" | "close" | "swap" | "list" | "store" | "chevron-up" | "chevron-down" | "chevron-right" | "chevron-left";

    let { name, size = 18 }: { name: LvIconName; size?: number } = $props();

    /**
     * 思源笔记 3.8+ 本体原生 24x24 Lucide 空心线性图标映射（stroke-width=1.7, fill=none）。
     * 仅映射经实测确认为 24x24 空心 stroke 结构的原生 symbol，杜绝实心块与比例失真。
     */
    const siyuanSymbolMap: Partial<Record<LvIconName, string>> = {
        home: "iconCalendar",
        calendar: "iconCalendar",
        cards: "iconLvCards",
        plus: "iconAdd",
        learn: "iconBrain",
        settings: "iconSettings",
        inbox: "iconInbox",
        search: "iconSearch",
        question: "iconHelp",
        book: "iconNotebook",
        target: "iconFocus",
        flag: "iconBookmark",
        zap: "iconZap",
        eye: "iconEye",
        edit: "iconEdit",
        refresh: "iconRefresh",
        moon: "iconDark",
        timer: "iconClock",
        image: "iconImage",
        code: "iconCode",
        warning: "iconTriangleAlert",
        dice: "iconDices",
        star: "iconStar",
        check: "iconCheck",
        trash: "iconTrashcan",
        close: "iconClose",
        list: "iconList",
        store: "iconBazaar",
        "chevron-up": "iconUp",
        "chevron-down": "iconDown",
        "chevron-right": "iconRight",
        "chevron-left": "iconLeft",
    };

    /** 同规格 24x24 Lucide 空心线性路径（stroke-width=1.7），用于补充项及单测环境兜底 */
    const outlinePaths: Record<LvIconName, string> = {
        home: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
        cards: "M8 6h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM4 18V5a2 2 0 0 1 2-2h11M10 14l2.2 2.2 4.3-4.4",
        plus: "M12 5v14M5 12h14",
        learn: "M12 18V5M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4M17.6 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.6 1.5M18 5.1a4 4 0 0 1 2.5 5.8M18 18a4 4 0 0 0 2-7.5M20 17.5A4 4 0 1 1 12 18a4 4 0 1 1-8-.5M6 18a4 4 0 0 1-2-7.5M6 5.1a4 4 0 0 0-2.5 5.8",
        settings: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
        inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
        search: "m21 21-4.34-4.34M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
        question: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z",
        bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
        book: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
        target: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2",
        lightbulb: "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4",
        calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
        graduation: "M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0zM22 10v6M6 12.5V16a6 3 0 0 0 12 0v-3.5",
        flag: "M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.5.87l-4.5-2.58a2 2 0 0 0-2 0L6.5 20.87A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z",
        zap: "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",
        eye: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
        edit: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497zM15 5l4 4",
        refresh: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M3 21v-5h5",
        moon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z",
        ban: "m4.9 4.9 14.2 14.2M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z",
        timer: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
        image: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM21 15l-3.09-3.09a2 2 0 0 0-2.82 0L6 21",
        code: "m10 9-3 3 3 3m4 0 3-3-3-3M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
        message: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
        warning: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3zM12 9v4M12 17h.01",
        dice: "M4 10h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM17.92 14l3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6M6 18h.01M10 14h.01M15 6h.01M18 9h.01",
        flame: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",
        star: "m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
        check: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm4 9 2 2 4-4",
        trash: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
        close: "M18 6 6 18M6 6l12 12",
        swap: "m16 3 4 4-4 4M20 7H4m4 14-4-4 4-4M4 17h16",
        list: "M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01",
        store: "m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4M2 7h20",
        "chevron-up": "m18 15-6-6-6 6",
        "chevron-down": "m6 9 6 6 6-6",
        "chevron-right": "m9 18 6-6-6-6",
        "chevron-left": "m15 18-6-6 6-6",
    };

    const symId = $derived(siyuanSymbolMap[name]);
    const useNativeSym = $derived(Boolean(symId && typeof document !== "undefined" && document.getElementById(symId)));
</script>

{#if useNativeSym && symId}
<svg
    class="lv-icon"
    width={size}
    height={size}
    style={`width:${size}px;height:${size}px;`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
>
    <use href={`#${symId}`} xlink:href={`#${symId}`}></use>
</svg>
{:else}
<svg
    class="lv-icon"
    width={size}
    height={size}
    style={`width:${size}px;height:${size}px;fill:none!important;stroke:currentColor!important;`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
>
    <path d={outlinePaths[name] || ""} fill="none" />
</svg>
{/if}

<style>
    svg.lv-icon {
        display: block;
        flex: none;
        margin: 0;
        fill: none !important;
        stroke: currentColor;
    }
</style>
