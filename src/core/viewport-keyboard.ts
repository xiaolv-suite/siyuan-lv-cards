/**
 * 视口尺寸变化与软键盘避让计算器（Viewport & Keyboard Inset Utility）
 */

export interface KeyboardViewportState {
    isKeyboardOpen: boolean;
    keyboardInset: number;
}

/**
 * 根据窗口实际高度与 visualViewport 高度差计算软键盘弹出状态与避让距离（px）
 */
export function computeKeyboardViewportState(
    windowHeight: number,
    viewportHeight: number,
    threshold = 120
): KeyboardViewportState {
    const diff = windowHeight - viewportHeight;
    if (diff > threshold) {
        return { isKeyboardOpen: true, keyboardInset: diff };
    }
    return { isKeyboardOpen: false, keyboardInset: 0 };
}
