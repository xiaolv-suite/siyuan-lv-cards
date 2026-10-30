<script lang="ts">
    import type { HTMLInputAttributes } from "svelte/elements";

    /** 文本输入（Kit）：b3-text-field 标准封装（336） */
    let {
        value = $bindable(""),
        placeholder = "",
        type = "text",
        oninput,
        onkeydown,
        disabled = false,
        width = "",
        min,
        max,
        step,
        ariaLabel = "",
        spellcheck = false,
        autocomplete = "off",
    }: {
        value?: string;
        placeholder?: string;
        /** text/password/number/date/time */
        type?: string;
        oninput?: (v: string) => void;
        onkeydown?: (e: KeyboardEvent) => void;
        disabled?: boolean;
        width?: string;
        min?: number;
        max?: number;
        step?: number;
        /** AS-10：读屏标签（无 placeholder 场景必配） */
        ariaLabel?: string;
        spellcheck?: boolean;
        autocomplete?: HTMLInputAttributes["autocomplete"];
    } = $props();
</script>

<input
    class="b3-text-field"
    style={width ? `width:${width}` : ""}
    {type}
    {placeholder}
    {disabled}
    {min}
    {max}
    {step}
    {value}
    {spellcheck}
    {autocomplete}
    aria-label={ariaLabel || undefined}
    oninput={(e) => {
        value = (e.target as HTMLInputElement).value;
        oninput?.(value);
    }}
    onkeydown={(e) => {
        onkeydown?.(e);
    }}
/>

<style lang="scss">
    input.b3-text-field {
        box-sizing: border-box;
        vertical-align: middle;
        line-height: var(--lv-lh-control-lg);
        touch-action: manipulation;
        transition: border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-2) var(--lv-ease);

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
            border-color: var(--lv-color-brand);
        }
    }
</style>
