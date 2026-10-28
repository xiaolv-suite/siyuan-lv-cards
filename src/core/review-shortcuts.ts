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

    // 6. h: 推进分级提示（仅问题态）
    if (e.key === "h" && !ctx.showAnswer && ctx.hasCurrent) {
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
    if (e.key === "e" || e.key === "E") {
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

    // 9. 后续评分与撤销必须在答案揭晓后生效
    if (!ctx.showAnswer) {
        return null;
    }

    // 10. 评分按键（1~4 或 1~3，以及方向键 ←/→/↓/↑ 单手盲打流）
    if (ctx.ratingStyle === "three") {
        if (e.key === "1" || e.key === "ArrowLeft") return "rate-1";
        if (e.key === "2" || e.key === "ArrowDown") return "rate-2";
        if (e.key === "3" || e.key === "ArrowRight") return "rate-3";
    } else {
        if (e.key === "1" || e.key === "ArrowLeft") return "rate-1";
        if (e.key === "2" || e.key === "ArrowDown") return "rate-2";
        if (e.key === "3" || e.key === "ArrowRight") return "rate-3";
        if (e.key === "4" || e.key === "ArrowUp") return "rate-4";
    }

    // 11. p / q: 撤销上一张评分
    if (e.key === "p" || e.key === "q") {
        return "undo";
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
    if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.repeat) {
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
}

/**
 * 判定当前是否存在任意复习操作模态弹窗处于打开状态
 */
export function isAnyReviewModalOpen(flags: ReviewModalFlags): boolean {
    return Boolean(flags.showPauseModal || flags.showSessionOptionsModal || flags.showMemoEditor || flags.showRetireModal);
}
