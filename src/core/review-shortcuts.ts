/**
 * 专注复习全局快捷键调度解析器（纯函数，隔离 DOM 事件与组件生命周期）
 */

export type ReviewKeyAction =
    | "close-peek"
    | "toggle-help"
    | "close-help"
    | "reveal"
    | "rate-default"
    | "rate-1"
    | "rate-2"
    | "rate-3"
    | "rate-4"
    | "advance-hint"
    | "toggle-peek"
    | "skip"
    | "toggle-reschedule"
    | "suspend"
    | "toggle-memo"
    | "undo"
    | "dismiss"
    | "open-editor"
    | "toggle-reversed"
    | "toggle-zen"
    | "toggle-star"
    | null;

export interface ReviewShortcutContext {
    peekOpen: boolean;
    helpOpen: boolean;
    showAnswer: boolean;
    faceReady: boolean;
    hasCurrent: boolean;
    hasLastAnswered: boolean;
    ratingStyle?: "three" | "four";
    /** 复习评分键位方案（CF-18）：number=数字键 1-4，jkl=主键区 J/K/L/;，both=两者均可 */
    ratingKeyScheme?: "number" | "jkl" | "both";
    /** 事件目标是否在复习容器内部 */
    isTargetInsideRoot?: boolean;
}

export interface ReviewKeyEventLike {
    key: string;
    code?: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    target?: EventTarget | null;
    preventDefault?: () => void;
}

/**
 * 判定事件触发源是否属于表单或富文本可编辑元素（这些元素自身需要接收所有按键）
 */
export function isInputOrEditable(target: EventTarget | null | undefined): boolean {
    if (!target) return false;
    const el = target as HTMLElement;
    if (typeof el.tagName !== "string") return false;
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea") return true;
    if (el.isContentEditable || el.getAttribute?.("contenteditable") === "true") return true;
    return false;
}

/**
 * 判定事件触发源是否为交互控件（按钮、下拉、超链接）
 */
export function isInteractiveControl(target: EventTarget | null | undefined): boolean {
    if (!target) return false;
    const el = target as HTMLElement;
    if (typeof el.tagName !== "string") return false;
    const tag = el.tagName.toLowerCase();
    return tag === "button" || tag === "select" || tag === "a";
}

/**
 * 解析复习场景中的键盘操作
 */
export function resolveReviewKeyAction(
    e: ReviewKeyEventLike,
    ctx: ReviewShortcutContext,
): ReviewKeyAction {
    // 1. 回看弹窗打开时：只响应关闭 Peek
    if (ctx.peekOpen) {
        if (e.key === "Escape" || e.key === "[") {
            e.preventDefault?.();
            return "close-peek";
        }
        return null;
    }

    // 2. 帮助遮罩开关与拦截
    if (e.key === "?") {
        return "toggle-help";
    }
    if (ctx.helpOpen) {
        if (e.key === "Escape") {
            return "close-help";
        }
        return null;
    }

    // 3. 输入控件不抢占（输入框正常打字）
    if (isInputOrEditable(e.target)) {
        return null;
    }

    // 4. 交互控件防护（如宿主工具栏按钮不抢 Space/Enter）
    if (isInteractiveControl(e.target) && !ctx.isTargetInsideRoot) {
        return null;
    }

    // 5. Space / Enter 主动作：问题态翻面，答案态默认评分（良好 3）
    if (e.code === "Space" || e.code === "Enter" || e.key === " " || e.key === "Enter") {
        e.preventDefault?.();
        if (!ctx.showAnswer) {
            return ctx.faceReady ? "reveal" : null;
        }
        return "rate-default";
    }

    // 6. h / H: 推进分级提示（仅问题态，TextFold 渐进线索）
    if ((e.key === "h" || e.key === "H") && !ctx.showAnswer && ctx.hasCurrent) {
        e.preventDefault?.();
        return "advance-hint";
    }

    // 7. [: 切换回看上一张已复习卡片
    if (e.key === "[") {
        if (ctx.hasLastAnswered) {
            return "toggle-peek";
        }
        return null;
    }

    // 8. 辅助控制（问题态与答案态均可用，对齐工具栏）
    if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
        if (ctx.hasCurrent) {
            e.preventDefault?.();
            return "dismiss";
        }
        return null;
    }
    if (e.key === "x" || e.key === "0") {
        return "skip";
    }
    if (e.key === "f") {
        return "toggle-reschedule";
    }
    if (e.key === "s") {
        return "suspend";
    }
    if (e.key === "e" || e.key === "E" || e.key === "o" || e.key === "O") {
        if (ctx.hasCurrent) {
            e.preventDefault?.();
            return "open-editor";
        }
        return null;
    }
    if (e.key === "m") {
        if (ctx.hasCurrent) {
            e.preventDefault?.();
            return "toggle-memo";
        }
        return null;
    }
    if ((e.key === "r" || e.key === "R") && !ctx.showAnswer && ctx.hasCurrent) {
        e.preventDefault?.();
        return "toggle-reversed";
    }
    if ((e.key === "z" || e.key === "Z") && !e.ctrlKey && !e.metaKey) {
        e.preventDefault?.();
        return "toggle-zen";
    }
    if (e.key === "*" && ctx.hasCurrent) {
        e.preventDefault?.();
        return "toggle-star";
    }

    if (e.key === "p" || e.key === "q") {
        return ctx.hasLastAnswered ? "undo" : null;
    }

    // 9. 后续评分必须在答案揭晓后生效
    if (!ctx.showAnswer) {
        return null;
    }

    // 10. 评分按键（1~4 或 1~3，方向键 ←/→/↓/↑ 单手盲打，以及人体工学 J/K/L/;）
    const scheme = ctx.ratingKeyScheme ?? "both";
    const allowNum = scheme === "number" || scheme === "both";
    const allowJkl = scheme === "jkl" || scheme === "both";
    const k = e.key;
    const lower = k.toLowerCase();

    if (ctx.ratingStyle === "three") {
        if ((allowNum && (k === "1" || k === "ArrowLeft")) || (allowJkl && lower === "j")) return "rate-1";
        if ((allowNum && (k === "2" || k === "ArrowDown")) || (allowJkl && lower === "k")) return "rate-2";
        if ((allowNum && (k === "3" || k === "ArrowRight")) || (allowJkl && lower === "l")) return "rate-3";
    } else {
        if ((allowNum && (k === "1" || k === "ArrowLeft")) || (allowJkl && lower === "j")) return "rate-1";
        if ((allowNum && (k === "2" || k === "ArrowDown")) || (allowJkl && lower === "k")) return "rate-2";
        if ((allowNum && (k === "3" || k === "ArrowRight")) || (allowJkl && lower === "l")) return "rate-3";
        if ((allowNum && (k === "4" || k === "ArrowUp")) || (allowJkl && (k === ";" || k === "；"))) return "rate-4";
    }

    return null;
}

/**
 * 判定键盘事件是否应当被全局复习快捷键调度忽略
 * （已默认阻止、输入法合成中、修饰键组合、长按重复，或交互控件按钮上的 Space/Enter）
 */
export function shouldIgnoreReviewKeydown(e: {
    defaultPrevented?: boolean;
    isComposing?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    repeat?: boolean;
    key?: string;
    target?: EventTarget | null;
}): boolean {
    if (e.defaultPrevented || e.isComposing || e.altKey || e.repeat) {
        return true;
    }
    // 允许 Ctrl+D / Cmd+D（解散/归档卡片），其他修饰键组合默认忽略
    const isDismissShortcut = (e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D");
    if ((e.ctrlKey || e.metaKey) && !isDismissShortcut) {
        return true;
    }
    if ((e.key === "Enter" || e.key === " ") && e.target instanceof Element) {
        if (e.target.closest("button, select, a, [role='button']")) {
            return true;
        }
    }
    return false;
}

export interface ModalKeyboardResolution {
    shouldIntercept: boolean;
    shouldClose: boolean;
    isBusy: boolean;
}

/**
 * 解析模态窗口打开时的键盘事件拦截与退出响应
 */
export function resolveModalKeydownAction(
    e: { key: string },
    isAnyModalOpen: boolean,
    isModalBusy: boolean
): ModalKeyboardResolution | null {
    if (!isAnyModalOpen) return null;
    if (e.key === "Escape") {
        return { shouldIntercept: true, shouldClose: !isModalBusy, isBusy: isModalBusy };
    }
    return { shouldIntercept: true, shouldClose: false, isBusy: isModalBusy };
}

export interface ReviewModalFlags {
    showPauseModal: boolean;
    showSessionOptionsModal: boolean;
    showMemoEditor: boolean;
    showRetireModal: boolean;
    showReschedule?: boolean;
}

/**
 * 判定当前是否存在任意复习操作模态弹窗处于打开状态（包含改期弹窗）
 */
export function isAnyReviewModalOpen(flags: ReviewModalFlags): boolean {
    return Boolean(flags.showPauseModal || flags.showSessionOptionsModal || flags.showMemoEditor || flags.showRetireModal || flags.showReschedule);
}

/**
 * 从快捷键动作解析对应的评级数值（1-4）
 */
export function resolveRatingFromShortcutAction(action: ReviewKeyAction): 1 | 2 | 3 | 4 | null {
    if (action === "rate-1") return 1;
    if (action === "rate-2") return 2;
    if (action === "rate-3") return 3;
    if (action === "rate-4") return 4;
    return null;
}
