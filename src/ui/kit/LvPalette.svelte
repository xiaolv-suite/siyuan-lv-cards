<script lang="ts">
    // T13 ⌘K 命令面板（docs/42 §3.10）：输入过滤 + 分组结果 + ↑↓/Enter/Esc 键盘流。
    // 纯展示组件：命令表与执行回调由宿主注入（core/palette.ts 承担过滤逻辑）。
    import { filterPaletteCommands, flattenPaletteGroups, loadRecentCommandIds, recordRecentCommandId, type PaletteCommand } from "@/core/palette";
    import LvIcon from "./LvIcon.svelte";

    let {
        commands,
        placeholder = "",
        groupNames = {},
        labels = {},
        onrun,
        onClose,
    }: {
        commands: PaletteCommand[];
        placeholder?: string;
        /** 组键 → 展示名 */
        groupNames?: Record<string, string>;
        labels?: { empty?: string; foot?: string };
        onrun: (cmd: PaletteCommand) => void;
        onClose: () => void;
    } = $props();

    const paletteId = $props.id();
    const inputId = `${paletteId}-input`;
    const listboxId = `${paletteId}-listbox`;
    let query = $state("");
    let selected = $state(0);
    let composing = $state(false);
    let revealSelection = $state(true);
    let recentIds = $state<string[]>(loadRecentCommandIds());

    // The command source is already scoped by the host. Do not silently hide
    // authorized commands behind the pure helper's generic 12-item default.
    const groups = $derived(filterPaletteCommands(commands, query, commands.length, recentIds));
    const flat = $derived(flattenPaletteGroups(groups));

    function groupLabel(key: string): string {
        if (key === "recent") return groupNames.recent ?? "最近常用";
        return groupNames[key] ?? key;
    }

    const optionId = (index: number) => `${paletteId}-option-${encodeURIComponent(flat[index].id)}`;
    const activeOptionId = $derived(flat[selected] ? optionId(selected) : undefined);

    // Query or command-source changes reset selection to the first visible
    // command, including replacement with an equally sized list.
    $effect(() => {
        flat;
        selected = 0;
        revealSelection = true;
    });

    // Keep the active result visible without moving focus away from the
    // editable combobox. `nearest` avoids jumping the scroll position.
    $effect(() => {
        if (!revealSelection || !flat[selected]) return;
        document.getElementById(optionId(selected))?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });

    function selectAt(index: number, reveal = true) {
        selected = index;
        revealSelection = reveal;
    }

    function runAt(index: number) {
        const cmd = flat[index];
        if (!cmd) return;
        recordRecentCommandId(cmd.id);
        onrun(cmd);
        onClose();
    }

    function onKeydown(e: KeyboardEvent) {
        if (composing || e.isComposing || e.keyCode === 229) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (flat.length > 0) selectAt((selected + 1) % flat.length);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (flat.length > 0) selectAt((selected - 1 + flat.length) % flat.length);
        } else if (e.key === "Home") {
            if (query.length === 0) {
                e.preventDefault();
                if (flat.length > 0) selectAt(0);
            }
        } else if (e.key === "End") {
            if (query.length === 0) {
                e.preventDefault();
                if (flat.length > 0) selectAt(flat.length - 1);
            }
        } else if (e.key === "Enter") {
            e.preventDefault();
            runAt(selected);
        } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        }
    }
</script>

<div class="lv-palette" role="dialog" aria-label={placeholder} tabindex="-1" onkeydown={onKeydown}>
    <div class="lv-palette-head">
        <!-- svelte-ignore a11y_autofocus -->
        <input
            id={inputId}
            type="text"
            bind:value={query}
            {placeholder}
            autofocus
            role="combobox"
            aria-label={placeholder}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded="true"
            aria-activedescendant={activeOptionId}
            oncompositionstart={() => (composing = true)}
            oncompositionend={() => (composing = false)}
            onkeydown={(e: KeyboardEvent) => { e.stopPropagation(); onKeydown(e); }}
        />
        <button
            type="button"
            class="lv-palette-close"
            aria-label="关闭命令面板"
            title="关闭 (Esc)"
            onclick={onClose}
        >
            <LvIcon name="close" size={14} />
        </button>
    </div>
    <div id={listboxId} class="lv-palette-body" role="listbox" aria-label={placeholder}>
        {#if flat.length === 0}
            <div class="lv-palette-empty">{labels.empty ?? ""}</div>
        {:else}
            {#each groups as g (g.group)}
                <div role="group" aria-label={groupLabel(g.group)}>
                    <div class="lv-palette-group" aria-hidden="true">{groupLabel(g.group)}</div>
                    {#each g.items as cmd (cmd.id)}
                        {@const index = flat.indexOf(cmd)}
                        <button
                            type="button"
                            class="lv-palette-item"
                            class:lv-palette-sel={index === selected}
                            id={optionId(index)}
                            role="option"
                            tabindex="-1"
                            aria-selected={index === selected}
                            onmouseenter={() => selectAt(index, false)}
                            onclick={() => runAt(index)}
                        >
                            <span class="lv-palette-label">{cmd.label}</span>
                            {#if cmd.hint}<span class="lv-palette-hint">{cmd.hint}</span>{/if}
                        </button>
                    {/each}
                </div>
            {/each}
        {/if}
    </div>
    {#if labels.foot}
        <div class="lv-palette-foot"><span>↑↓</span> {labels.foot}</div>
    {/if}
</div>

<style>
    .lv-palette {
        display: flex;
        flex-direction: column;
        width: 100%;
        min-width: 0;
        min-height: 120px;
        max-height: calc(100vh - 56px);
        max-height: calc(100dvh - 56px);
        box-sizing: border-box;
    }
    .lv-palette-head {
        display: flex;
        align-items: center;
        border-bottom: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent);
        flex-shrink: 0;
    }
    .lv-palette input {
        width: 100%;
        box-sizing: border-box;
        flex: 1;
        min-width: 0;
        border: 0;
        border-radius: 0;
        padding: calc(var(--lv-space-unit) * 6 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 8);
        font-size: var(--lv-type-body-sm-size);
        background: transparent;
        touch-action: manipulation;
    }
    .lv-palette-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        min-width: 44px;
        border: 0;
        background: transparent;
        color: var(--lv-color-text-muted);
        cursor: pointer;
        touch-action: manipulation;
        border-radius: var(--lv-r-circle);
        margin-right: 6px;
        transition: transform var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease), border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease), opacity var(--lv-dur-1) var(--lv-ease);
    }
    .lv-palette-close:hover {
        background: color-mix(in srgb, var(--lv-color-text) 8%, transparent);
        color: var(--lv-color-text);
    }
    .lv-palette-close:active {
        transform: scale(0.94);
    }
    .lv-palette input:focus-visible {
        outline: none;
        border-color: var(--lv-color-brand);
        box-shadow: var(--lv-focus-ring);
    }
    .lv-palette-body {
        max-height: 320px;
        overflow: auto;
        min-height: 0;
        overscroll-behavior: contain;
        padding: calc(var(--lv-space-unit) * 3) 0 calc(var(--lv-space-unit) * 5);
    }
    .lv-palette-group {
        font-size: var(--lv-type-caption-size);
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--lv-color-text-muted);
        font-weight: var(--lv-fw-heading);
        margin: calc(var(--lv-space-unit) * 5) calc(var(--lv-space-unit) * 7) calc(var(--lv-space-unit) * 2);
    }
    .lv-palette-item {
        display: flex;
        align-items: flex-start;
        gap: calc(var(--lv-space-unit) * 5);
        width: 100%;
        box-sizing: border-box;
        min-height: 44px;
        padding: calc(var(--lv-space-unit) * 4 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 7);
        border: 0;
        border-radius: 0;
        background: transparent;
        font-size: var(--lv-type-body-size);
        text-align: left;
        line-height: var(--lv-lh-meta);
        white-space: normal;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        transition: background var(--lv-dur-1) var(--lv-ease);
    }
    .lv-palette-item:hover { background: transparent; color: inherit; }
    .lv-palette-item:focus-visible {
        outline: none;
        box-shadow: inset 0 0 0 2px var(--lv-color-brand);
    }
    .lv-palette-sel,
    .lv-palette-sel:hover {
        background: var(--lv-primary-soft);
        color: var(--lv-color-on-brand-soft);
        border-left: 2px solid var(--lv-color-brand);
    }
    .lv-palette-label { min-width: 0; flex: 1; overflow-wrap: anywhere; }
    .lv-palette-hint { min-width: 0; max-width: 40%; font-size: var(--lv-type-meta-size); color: var(--lv-color-text-muted); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; white-space: normal; text-align: right; }
    .lv-palette-empty {
        padding: calc(var(--lv-space-unit) * 11) calc(var(--lv-space-unit) * 8);
        text-align: center;
        font-size: var(--lv-type-control-size);
        color: var(--lv-color-text-muted);
        max-width: 48em;
        text-wrap: pretty;
        line-height: var(--lv-lh-reading, 1.65);
    }
    .lv-palette-foot {
        display: flex;
        flex-shrink: 0;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 3);
        padding: calc(var(--lv-space-unit) * 4) calc(var(--lv-space-unit) * 7);
        border-top: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent);
        font-size: var(--lv-type-meta-size);
        color: var(--lv-color-text-muted);

        span {
            font-family: var(--lv-font-mono, monospace);
            font-variant-numeric: tabular-nums;
            padding: var(--lv-space-hairline) calc(var(--lv-space-unit) * 2);
            border-radius: var(--lv-r-tag);
            background: color-mix(in srgb, var(--lv-color-text) 6%, transparent);
            border: 1px solid var(--lv-border);
            font-size: var(--lv-type-caption-size);
        }
    }
</style>
