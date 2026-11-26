import { queryBlockElementById } from "../libs/lv-notice-kit";

export function findFloatingPillAnchor(blockID: string): HTMLElement | null {
    if (typeof document === "undefined" || !blockID) return null;
    const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(blockID)
        : blockID.replace(/"/g, '\\"');
    return document.querySelector(`#lv-cards-floating-pill[data-block-id="${escaped}"]`) as HTMLElement | null;
}

/**
 * 双分屏同文档优先级解析：优先当前锚点所属 Protyle / 激活分屏 `.layout__wnd--active .protyle:not(.fn__none)`，
 * 再回退到普通可见 Protyle，最后兜底 queryBlockElementById。
 */
export function findActiveProtyleBlockElement(blockID: string, anchor?: Element | null): HTMLElement | null {
    if (typeof document === "undefined" || !blockID) return null;
    const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(blockID)
        : blockID.replace(/"/g, '\\"');
    if (anchor) {
        const anchorProtyle = anchor.closest?.(".protyle");
        if (anchorProtyle) {
            const inSameProtyle = anchorProtyle.querySelector(`.protyle-wysiwyg [data-node-id="${escaped}"]`) as HTMLElement | null;
            if (inSameProtyle) return inSameProtyle;
        }
    }
    const activeEl = document.querySelector(`.layout__wnd--active .protyle:not(.fn__none) .protyle-wysiwyg [data-node-id="${escaped}"]`) as HTMLElement | null;
    if (activeEl) return activeEl;
    const visibleEl = document.querySelector(`.protyle:not(.fn__none) .protyle-wysiwyg [data-node-id="${escaped}"]`) as HTMLElement | null;
    if (visibleEl) return visibleEl;
    return (document.querySelector(`.protyle-wysiwyg [data-node-id="${escaped}"]`) as HTMLElement | null)
        || (queryBlockElementById(blockID) as HTMLElement | null);
}
