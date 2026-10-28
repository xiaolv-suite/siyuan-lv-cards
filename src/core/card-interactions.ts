/**
 * 卡片点击交互、画板快捷编辑与回看切换控制器（Card Interactions & Peek Manager）
 */

import { handleClozeClick } from "./cloze-stepper";

export type CardContentClickResult =
    | { type: "zoom-image"; src: string; alt?: string }
    | { type: "cloze-reveal"; allRevealed: boolean }
    | null;

/**
 * 解析卡面内容区域的单击交互（图片放大或挖空逐空揭晓）
 */
export function handleCardContentClick(
    target: EventTarget | null,
    showAnswer: boolean,
    cardEl: HTMLElement | null
): CardContentClickResult {
    if (!target || !(target instanceof Element) || typeof target.closest !== "function") return null;

    if (target.tagName.toLowerCase() === "img") {
        const img = target as HTMLImageElement;
        return { type: "zoom-image", src: img.src, alt: img.alt || undefined };
    }

    if (!showAnswer) {
        const mark = target.closest("span[data-type='mark'], mark.lv-masked, [data-cloze-idx]") as HTMLElement | null;
        if (mark) {
            const res = handleClozeClick(mark, cardEl);
            if (res.revealed) {
                return { type: "cloze-reveal", allRevealed: res.allRevealed };
            }
        }
    }

    return null;
}

/**
 * 解析双击画布/SVG在思源编辑器中打开的逻辑
 */
export function handleCardCanvasDblClick(
    target: EventTarget | null,
    currentBlockID?: string
): string | null {
    if (!target || !(target instanceof Element) || typeof target.closest !== "function") return null;
    const canvas = target.closest("svg, .lv-card-svg, [data-type='NodeWidget'], [data-subtype='widget'], img[src*='.svg'], img[src*='excalidraw']") as HTMLElement | null;
    if (canvas) {
        return canvas.closest("[data-node-id]")?.getAttribute("data-node-id") || currentBlockID || null;
    }
    return null;
}

export interface PeekToggleResult<T> {
    nextPeek: T | null;
    status: "opened" | "closed" | "none";
}

/**
 * 切换上一张已复习卡片的回看状态
 */
export function togglePeekCard<T>(
    currentPeek: T | null,
    lastAnswered: T | null
): PeekToggleResult<T> {
    if (currentPeek) {
        return { nextPeek: null, status: "closed" };
    }
    if (lastAnswered) {
        return { nextPeek: { ...lastAnswered }, status: "opened" };
    }
    return { nextPeek: null, status: "none" };
}

/**
 * 判定点击目标是否属于模态遮罩或二级菜单覆盖层
 */
export function isOverlayTarget(target: EventTarget | null): boolean {
    return target instanceof Element && Boolean(target.closest(".lv-modal-backdrop, .lv-toolbar-more-scrim, .lv-toolbar-more-menu"));
}

/**
 * 应用内离开面板重入刷新判定（离开面板超过阈值时长时触发刷新）
 */
export function shouldRefreshOnPanelPointer(
    lastPointerAt: number,
    now = Date.now(),
    thresholdMs = 15000
): boolean {
    return lastPointerAt > 0 && now - lastPointerAt >= thresholdMs;
}

