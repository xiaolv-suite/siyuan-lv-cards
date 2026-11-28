// BX-3 本场偏好：覆盖合并与最小化（纯函数，脱离 Svelte 组件可单测）
// 语义：本场覆盖优先、全局兜底；与全局同值的覆盖项自动摘除（覆盖面最小化，
// hasOverrides 仅在真正偏离全局时亮显）。

/** 融合读取：override 只需是部分字段，其余回落 base */
export function mergeSessionPrefs<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
    return { ...base, ...override };
}

/** 摘除与 base 同值的覆盖键，返回修剪后的覆盖集（可能为空对象） */
export function pruneSessionPrefs<T extends Record<string, unknown>>(base: T, next: Partial<T>): Partial<T> {
    const out: Partial<T> = { ...next };
    for (const k of Object.keys(out) as (keyof T)[]) {
        if (String(out[k]) === String(base[k])) {
            delete out[k];
        }
    }
    return out;
}

export type SessionVariantOption = "normal" | "typing" | "choice";

/**
 * 将全局或本场题型设置映射为弹窗单选值
 */
export function getInitialSessionVariant(settings: {
    typingEnabled?: boolean;
    choiceEnabled?: boolean;
}): SessionVariantOption {
    return settings.typingEnabled ? "typing" : settings.choiceEnabled ? "choice" : "normal";
}

/**
 * 将临时题型选择映射为覆盖项
 */
export function resolveSessionVariantOverrides(
    variant: SessionVariantOption
): Record<string, boolean> {
    return {
        typingEnabled: variant === "typing",
        choiceEnabled: variant === "choice",
        mixedRotation: false,
    };
}

/**
 * 判定给定的覆盖字典中是否包含需要重启倒计时的键
 */
export function shouldRestartTimeoutOnOverrides(overrides: Record<string, unknown>): boolean {
    return "timeoutMode" in overrides || "timeoutSeconds" in overrides;
}

