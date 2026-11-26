/**
 * 小驴闪卡 · 免侵入属性问答卡 Protyle 编辑器服务（Editor QA Service）
 *
 * 核心架构铁律（Zero-Touch `.protyle-wysiwyg` DOM Invariant）：
 * 1. 100% 脱离式浮动 Portal 胶囊：唯一胶囊 #lv-cards-floating-pill 挂载在 document.body 下，
 *    绝对禁止向 .protyle-wysiwyg / [data-node-id] / .protyle-attr / [contenteditable="true"]
 *    内部注入任何 DOM 节点、写入任何 class 或自定义属性（杜绝思源 Lute 序列化污染）；
 * 2. 纯 CSS 属性问答渲染：custom-riff-title / custom-lv-question 直接由 CSS ::after 读取原生 IAL 呈现；
 * 3. 编辑 / 删块 / 滚屏 / 触摸瞬时隐身：打字、删除、IME、剪切粘贴、滚屏与滑动立即卸载浮动胶囊；
 * 4. 动作前置严格复验：挂载与执行动作前复验 isConnected / !closest('.fn__none') / 可见视口 rect。
 */

import { inferBlockKindFromElement, isBlockElementReadOnly, BLOCK_KIND_LABELS, WRITE_BLOCK_ACTION_IDS, type SiYuanBlockKind } from "./block-actions";
import { openBlockTypeMorphPicker, morphBlockTypeTo, lvBlockAssistant, isReadOnlySafeBlockAction, isBlockOrProtyleReadOnly } from "../libs/lv-notice-kit";

export const FLOATING_PILL_ID = "lv-cards-floating-pill";

const CARD_ATTR_NAMES = [
    "custom-riff-decks",
    "custom-riff-title",
    "custom-lv-question",
    "custom-lv-answer",
    "custom-card-answer",
    "custom-riff-answer",
    "custom-lv-attr-subtype",
] as const;

const CARD_SEQ_SELECTOR = [
    "[data-node-id][custom-riff-decks]",
    "[data-node-id][custom-riff-title]",
    "[data-node-id][custom-lv-question]",
].join(", ");

const PLUGIN_REVIEW_OR_PREVIEW_SELECTOR = ".lv-review, .lv-cards-root, .lv-card-content, .lv-peek-body, .lv-detail-preview, .lv-cards-dialog, .lv-bam";
const FLOATING_PILL_AND_MENU_SELECTOR = `#${FLOATING_PILL_ID}, .lv-card-badge-pill, .lv-bam`;
const EDITOR_DOM_SUBTREE_SELECTOR = '.protyle-wysiwyg, [data-node-id], .protyle-attr, [contenteditable="true"]';
const DETACHED_BODY_PILL_SELECTOR = `#${FLOATING_PILL_ID}, .lv-card-badge-pill`;
const DETACHED_BODY_ALL_PORTALS_SELECTOR = `#${FLOATING_PILL_ID}, .lv-card-badge-pill, .lv-bam, .lv-bam__mobile-mask, .lv-bam-mobile-mask`;

const SELECTION_DEBOUNCE_MS = 120;
const TYPING_QUIET_MS = 500;
const MODIFIER_ONLY_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "NumLock", "ScrollLock"]);
const EDIT_NAVIGATION_KEYS = new Set([
    "Backspace", "Delete", "Enter", "Tab",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "Home", "End", "PageUp", "PageDown",
]);
const INLINE_TYPING_TAGS = new Set([
    "WBR", "BR", "SPAN", "B", "I", "STRONG", "EM", "U", "S",
    "CODE", "MARK", "A", "SUB", "SUP", "FONT", "SMALL",
]);

function resolveDoubleClickActionId(): string {
    try {
        const g = typeof window !== "undefined" ? (window as any).LvBlockAssistant : null;
        if (g && typeof g.getDoubleClickActionId === "function") {
            const val = String(g.getDoubleClickActionId() || "").trim();
            if (val) return val;
        }
    } catch { /* ignore */ }
    try {
        if (typeof lvBlockAssistant?.getDoubleClickActionId === "function") {
            const val = String(lvBlockAssistant.getDoubleClickActionId() || "").trim();
            if (val) return val;
        }
    } catch { /* ignore */ }
    return "morph-block-type";
}

export function isInsidePluginReviewOrPreview(el: Element | null | undefined): boolean {
    if (!el || typeof el.closest !== "function") return false;
    return Boolean(el.closest(PLUGIN_REVIEW_OR_PREVIEW_SELECTOR));
}

export function isValidEditorBlock(el: Element | null | undefined): el is HTMLElement {
    if (!(el instanceof HTMLElement)) return false;
    if (!el.closest(".protyle-wysiwyg")) return false;
    if (el.classList.contains("protyle-wysiwyg") || el.classList.contains("protyle-title") || el.getAttribute("data-type") === "NodeDocument") {
        return false;
    }
    if (el.querySelector(":scope > .protyle-title__input")) {
        return false;
    }
    return !isInsidePluginReviewOrPreview(el);
}

export interface PinnedQuickActionItem {
    id: string;
    glyph: string;
    label: string;
    badgeText?: string;
}

export interface EditorQaServiceOptions {
    onEditQuestion: (blockID: string) => void;
    /**
     * 块操作中心展开回调（可选）。
     * 传入则胶囊尾部渲染 ▾ 展开区；未传入时保持纯编辑按钮形态（向后兼容）。
     */
    onOpenBlockActions?: (blockID: string, anchor: HTMLElement) => void;
    /**
     * 资源智能预热回调（可选）。
     * 鼠标首次掠过编辑器块时在浏览器 idle 空闲时刻执行预热，达成后续点击 0ms 秒开。
     */
    onPrefetch?: () => void;
    /** 读取当前置顶常驻快捷动作 (最多 3~5 个展示在胶囊内) */
    getPinnedActions?: () => PinnedQuickActionItem[];
    /** 执行置顶快捷动作回调 */
    onRunAction?: (actionId: string, blockID: string, anchor?: HTMLElement) => void | Promise<void>;
    /**
     * 针对编辑器中心容器的监听挂载点（可选）。
     * 轨道 A 启动优化：将 MutationObserver 范围限定到编辑器中心容器（.layout__center），
     * 避免全局 document.body 监听引发的 CPU 抖动；并在 onunload / dispose 时彻底断开。
     */
    targetContainer?: HTMLElement | null;
    /** 块助手总开关判定（关闭态绝不挂载胶囊或呼出菜单） */
    isEnabled?: () => boolean;
    /** 停用时同步收起已打开菜单的回调 */
    onDisableCleanup?: () => void;
}

export interface EditorQaServiceInstance {
    scan: (root?: HTMLElement | Document) => void;
    dispose: () => void;
}

let activeSelectedBlock: HTMLElement | null = null;
let floatingPillEl: HTMLButtonElement | null = null;
let floatingPillBlockEl: HTMLElement | null = null;
let globalSelectionQuietUntil = 0;

export function suppressCapsuleAfterBlockDelete(quietMs = 900): void {
    globalSelectionQuietUntil = Math.max(globalSelectionQuietUntil, Date.now() + quietMs);
    activeSelectedBlock = null;
    unmountFloatingPill(true);
}

/**
 * 移动端 / 焦点当前选中的活跃块（纯内存单例跟踪，严禁向 DOM 写 data-lv-selected）
 */
export function setActiveSelectedBlock(block: HTMLElement | null): void {
    activeSelectedBlock = block && block.isConnected ? block : null;
}

export function getActiveSelectedBlock(): HTMLElement | null {
    if (activeSelectedBlock && !activeSelectedBlock.isConnected) {
        activeSelectedBlock = null;
    }
    return activeSelectedBlock;
}

export function isCardEditorBlock(blockEl: HTMLElement): boolean {
    const title = (blockEl.getAttribute("custom-riff-title") || blockEl.getAttribute("custom-lv-question") || "").trim();
    return blockEl.hasAttribute("custom-riff-decks")
        || Boolean(title)
        || blockEl.hasAttribute("custom-lv-answer")
        || blockEl.hasAttribute("custom-card-answer")
        || blockEl.hasAttribute("custom-riff-answer")
        || blockEl.hasAttribute("custom-lv-attr-subtype");
}

function isBlockActionMenuCurrentlyOpen(): boolean {
    if (floatingPillEl?.dataset?.lvBamAnchor === "open") return true;
    if (typeof document !== "undefined") {
        return Boolean(document.querySelector(".lv-bam"));
    }
    return false;
}

function isBlockVisibleForFloatingPill(blockEl: HTMLElement | null | undefined): blockEl is HTMLElement {
    if (!blockEl || !blockEl.isConnected) return false;
    if (blockEl.closest(".fn__none")) return false;
    if (blockEl.style?.display === "none" || blockEl.style?.visibility === "hidden") return false;
    if (typeof blockEl.getBoundingClientRect !== "function") return false;
    const rect = blockEl.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const winW = typeof window !== "undefined" ? (window.innerWidth || 1280) : 1280;
    const winH = typeof window !== "undefined" ? (window.innerHeight || 800) : 800;
    if (rect.bottom <= 0 || rect.top >= winH || rect.right <= 0 || rect.left >= winW) {
        return false;
    }
    return true;
}

function isCompactViewport(): boolean {
    if (typeof window === "undefined") return false;
    if ((window.innerWidth || 1280) <= 768) return true;
    try {
        if (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches) {
            return true;
        }
    } catch { /* ignore */ }
    return false;
}

function positionFloatingPill(pill: HTMLButtonElement, blockEl: HTMLElement): boolean {
    if (!isBlockVisibleForFloatingPill(blockEl)) return false;
    const rect = blockEl.getBoundingClientRect();
    const winW = typeof window !== "undefined" ? (window.innerWidth || 1280) : 1280;
    const winH = typeof window !== "undefined" ? (window.innerHeight || 800) : 800;
    const safeMargin = 8;

    const pillW = pill.offsetWidth > 0 ? pill.offsetWidth : 120;
    const pillH = pill.offsetHeight > 0 ? pill.offsetHeight : 24;
    const compact = isCompactViewport();

    let rawLeft = rect.right - pillW - 4;
    let rawTop: number;

    if (compact) {
        // 移动端 / 窄屏：定位在目标块上方右侧安全边沿，绝不遮挡正文文字与光标
        rawTop = rect.top - pillH - 6;
        if (rawTop < safeMargin) {
            rawTop = rect.top < pillH + safeMargin
                ? rect.bottom + 4
                : safeMargin;
        }
    } else {
        // 桌面端：对齐目标块右上角
        rawTop = rect.top - Math.round(pillH * 0.6);
        if (rawTop < safeMargin) {
            rawTop = Math.max(safeMargin, rect.top + 2);
        }
    }

    const maxLeft = Math.max(safeMargin, winW - pillW - safeMargin);
    const maxTop = Math.max(safeMargin, winH - pillH - safeMargin);
    const clampedLeft = Math.round(Math.min(Math.max(safeMargin, rawLeft), maxLeft));
    const clampedTop = Math.round(Math.min(Math.max(safeMargin, rawTop), maxTop));

    pill.style.transform = `translate3d(${clampedLeft}px, ${clampedTop}px, 0)`;
    return true;
}

function isDetachedBodyPortalNode(el: Element | null | undefined): el is Element {
    if (!el || typeof document === "undefined" || !document.body) return false;
    if (el.parentElement !== document.body) return false;
    if (typeof el.closest === "function" && el.closest(EDITOR_DOM_SUBTREE_SELECTOR)) return false;
    return true;
}

function cleanupDetachedBodyPortals(includeMenus = false): void {
    if (typeof document === "undefined" || !document.body) return;
    try {
        const pillById = document.getElementById(FLOATING_PILL_ID);
        if (isDetachedBodyPortalNode(pillById)) {
            pillById.remove();
        }
        const selector = includeMenus ? DETACHED_BODY_ALL_PORTALS_SELECTOR : DETACHED_BODY_PILL_SELECTOR;
        document.body.querySelectorAll(selector).forEach((el) => {
            if (isDetachedBodyPortalNode(el)) {
                el.remove();
            }
        });
    } catch { /* ignore */ }
}

export function unmountFloatingPill(force = false): void {
    if (!force && isBlockActionMenuCurrentlyOpen()) {
        return;
    }
    floatingPillBlockEl = null;
    if (floatingPillEl) {
        try {
            delete (floatingPillEl as any).__lvTargetBlock;
            if (isDetachedBodyPortalNode(floatingPillEl)) {
                floatingPillEl.remove();
            }
        } catch { /* ignore */ }
        floatingPillEl = null;
    }
    cleanupDetachedBodyPortals(false);
}

function computeCardSequenceInEditor(blockEl: HTMLElement): number {
    const wysiwyg = blockEl.closest(".protyle-wysiwyg");
    if (!wysiwyg) return 0;
    const cardNodes = wysiwyg.querySelectorAll(CARD_SEQ_SELECTOR);
    for (let i = 0; i < cardNodes.length; i++) {
        if (cardNodes[i] === blockEl) {
            return i + 1;
        }
    }
    return 0;
}

/**
 * 检查块当前是否正由脱离式浮动胶囊服务中
 */
export function isBlockDecorated(blockEl: HTMLElement): boolean {
    if (
        !floatingPillEl
        || !floatingPillEl.isConnected
        || typeof document === "undefined"
        || floatingPillEl.parentElement !== document.body
        || floatingPillBlockEl !== blockEl
    ) {
        return false;
    }
    return floatingPillEl.classList.contains("lv-card-badge-pill--card") === isCardEditorBlock(blockEl);
}

function ensureFloatingPillElement(
    onEditQuestion: (blockID: string) => void,
    onOpenBlockActions?: (blockID: string, anchor: HTMLElement) => void,
    onRunAction?: (actionId: string, blockID: string, anchor?: HTMLElement) => void | Promise<void>,
): HTMLButtonElement {
    if (floatingPillEl && floatingPillEl.isConnected && floatingPillEl.parentElement === document.body) {
        (floatingPillEl as any).__lvEditQuestion = onEditQuestion;
        (floatingPillEl as any).__lvOpenBlockActions = onOpenBlockActions;
        (floatingPillEl as any).__lvRunAction = onRunAction;
        return floatingPillEl;
    }

    if (typeof document !== "undefined") {
        const existingPill = document.getElementById(FLOATING_PILL_ID);
        if (isDetachedBodyPortalNode(existingPill)) {
            existingPill.remove();
        }
    }

    const btn = document.createElement("button");
    btn.id = FLOATING_PILL_ID;
    btn.type = "button";
    btn.setAttribute("data-lv-card-attr-btn", "1");
    (btn as any).__lvEditQuestion = onEditQuestion;
    (btn as any).__lvOpenBlockActions = onOpenBlockActions;
    (btn as any).__lvRunAction = onRunAction;

    let lastTriggerTime = 0;
    let touchTriggered = false;

    const validateLiveTarget = (): { blockID: string; targetBlock: HTMLElement } | null => {
        const targetBlock = (btn as any).__lvTargetBlock as HTMLElement | undefined;
        const currentBlockID = btn.getAttribute("data-block-id") || "";
        if (!currentBlockID || !targetBlock || !isBlockVisibleForFloatingPill(targetBlock)) {
            unmountFloatingPill(true);
            return null;
        }
        return { blockID: currentBlockID, targetBlock };
    };

    const triggerAction = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const now = Date.now();
        if (now - lastTriggerTime < 320) return;
        lastTriggerTime = now;

        const live = validateLiveTarget();
        if (!live) return;

        try {
            if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
                navigator.vibrate(10);
            }
        } catch { /* ignore */ }

        const handler = (btn as any).__lvOpenBlockActions as ((id: string, anchor: HTMLElement) => void) | undefined;
        if (handler) {
            handler(live.blockID, btn);
        } else {
            setTimeout(() => {
                if (!isBlockVisibleForFloatingPill(live.targetBlock)) {
                    unmountFloatingPill(true);
                    return;
                }
                const editHandler = (btn as any).__lvEditQuestion as ((id: string) => void) | undefined;
                (editHandler || onEditQuestion)(live.blockID);
            }, 60);
        }
    };

    btn.addEventListener("click", (e) => {
        if (touchTriggered) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        triggerAction(e);
    });

    btn.addEventListener("mousedown", (e) => {
        // 浮动胶囊位于 document.body，必须无条件阻止 mousedown 默认行为以保护编辑器文本选区与光标
        e.preventDefault();
        e.stopPropagation();
    });

    btn.addEventListener("touchend", (e) => {
        touchTriggered = true;
        setTimeout(() => { touchTriggered = false; }, 450);
        triggerAction(e);
    }, { passive: false });

    btn.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const live = validateLiveTarget();
        if (!live) return;

        const dblActionId = resolveDoubleClickActionId();
        if (!dblActionId || dblActionId === "none") return;

        const isReadOnly = isBlockElementReadOnly(live.targetBlock) || isBlockOrProtyleReadOnly(live.blockID, live.targetBlock);
        if (isReadOnly && (!isReadOnlySafeBlockAction(dblActionId) || WRITE_BLOCK_ACTION_IDS.has(dblActionId))) {
            return;
        }
        const runner = (btn as any).__lvRunAction as ((actionId: string, blockID: string, anchor?: HTMLElement) => void | Promise<void>) | undefined;
        if (runner) {
            void runner(dblActionId, live.blockID, btn);
        } else if (dblActionId === "morph-block-type") {
            openBlockTypeMorphPicker(live.blockID, btn, async (targetType) => {
                await morphBlockTypeTo(live.blockID, targetType);
            });
        } else if (dblActionId === "edit-card-qa") {
            const editHandler = (btn as any).__lvEditQuestion as ((id: string) => void) | undefined;
            (editHandler || onEditQuestion)(live.blockID);
        } else {
            void lvBlockAssistant.executeDoubleClickAction(live.blockID, null);
        }
    });

    btn.addEventListener("contextmenu", (e) => {
        const handler = (btn as any).__lvOpenBlockActions as ((id: string, anchor: HTMLElement) => void) | undefined;
        if (!handler) return;
        e.preventDefault();
        e.stopPropagation();
        const live = validateLiveTarget();
        if (!live) return;
        handler(live.blockID, btn);
    });

    floatingPillEl = btn;
    return btn;
}

/**
 * 将唯一脱离式浮动交互胶囊（#lv-cards-floating-pill）挂载到 document.body 并精确定位到目标块。
 * 严格遵循零侵入红线：绝不向 blockEl / .protyle-attr / [contenteditable] 写入任何节点、class 或属性。
 */
export function decorateEditorBlock(
    blockEl: HTMLElement,
    onEditQuestion: (blockID: string) => void,
    onOpenBlockActions?: (blockID: string, anchor: HTMLElement) => void,
    getPinnedActions?: () => PinnedQuickActionItem[],
    onRunAction?: (actionId: string, blockID: string, anchor?: HTMLElement) => void | Promise<void>,
): boolean {
    if (typeof document === "undefined" || !document.body) return false;
    if (isInsidePluginReviewOrPreview(blockEl)) return false;
    if (blockEl.classList.contains("protyle-wysiwyg") || blockEl.classList.contains("protyle-title") || blockEl.getAttribute("data-type") === "NodeDocument") {
        return false;
    }
    if (blockEl.querySelector(":scope > .protyle-title__input")) return false;

    const blockID = blockEl.getAttribute("data-node-id");
    if (!blockID) return false;

    if (!isBlockVisibleForFloatingPill(blockEl)) {
        if (floatingPillBlockEl === blockEl) {
            unmountFloatingPill(true);
        }
        return false;
    }

    const title = (blockEl.getAttribute("custom-riff-title") || blockEl.getAttribute("custom-lv-question") || "").trim();
    const isCard = isCardEditorBlock(blockEl);
    const blockKind = inferBlockKindFromElement(blockEl);
    const kindMeta = BLOCK_KIND_LABELS[blockKind] || BLOCK_KIND_LABELS.paragraph;
    const cardSeq = isCard ? computeCardSequenceInEditor(blockEl) : 0;

    const tooltipText = isCard
        ? (title ? `✦ 闪卡「${title.slice(0, 16)}${title.length > 16 ? "…" : ""}」· 块助手：单击展开操作中心 (双击快捷转换块类型 · Alt+Q 编辑问答)` : "✦ 闪卡 · 块助手：单击展开操作中心 (双击快捷转换块类型 · Alt+Q 编辑问答)")
        : `✦ ${kindMeta.actionLead} · 块助手：单击展开操作中心 (双击快捷转换块类型 · Alt+Q 问答工作台)`;

    const pill = ensureFloatingPillElement(onEditQuestion, onOpenBlockActions, onRunAction);
    pill.className = `b3-tooltips b3-tooltips__w lv-card-badge-pill ${isCard ? "lv-card-badge-pill--card" : "lv-card-badge-pill--ordinary"}`;
    pill.setAttribute("aria-label", tooltipText);
    pill.setAttribute("data-block-id", blockID);
    pill.setAttribute("data-block-kind", blockKind);
    pill.setAttribute("data-lv-card-attr-btn", "1");
    pill.removeAttribute("title");
    (pill as any).__lvTargetBlock = blockEl;

    const wantsMore = Boolean(onOpenBlockActions);
    const pinnedActions = getPinnedActions ? getPinnedActions() : [];
    const isMobileScreen = typeof window !== "undefined" && window.innerWidth <= 640;
    const pinnedKey = pinnedActions.map((a) => `${a.id}:${a.glyph}`).join(",");
    const renderSig = `${isCard ? "1" : "0"}|${wantsMore ? "1" : "0"}|${blockKind}|${cardSeq}|${isMobileScreen ? "m" : "d"}|${pinnedKey}`;

    if ((pill as any).__lvRenderSig !== renderSig) {
        renderPillContent(pill, isCard, wantsMore, blockKind, pinnedActions, onRunAction, blockID, cardSeq);
        (pill as any).__lvRenderSig = renderSig;
    }

    if (!pill.isConnected || pill.parentElement !== document.body) {
        document.body.appendChild(pill);
    }

    floatingPillBlockEl = blockEl;

    if (!positionFloatingPill(pill, blockEl)) {
        unmountFloatingPill(true);
        return false;
    }
    return true;
}

function renderPillContent(
    pill: HTMLElement,
    isCard: boolean,
    withMore: boolean,
    blockKind: SiYuanBlockKind = "paragraph",
    pinnedActions?: PinnedQuickActionItem[],
    onRunAction?: (actionId: string, blockID: string, anchor?: HTMLElement) => void | Promise<void>,
    blockID?: string,
    cardSeq = 0,
): void {
    pill.innerHTML = "";
    const kindMeta = BLOCK_KIND_LABELS[blockKind] || BLOCK_KIND_LABELS.paragraph;

    const icon = document.createElement("span");
    icon.className = "lv-card-badge-pill__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = isCard ? "✦" : kindMeta.glyph;
    pill.appendChild(icon);

    if (isCard) {
        const seq = document.createElement("span");
        seq.className = "lv-card-badge-pill__seq";
        seq.textContent = cardSeq > 0 ? `闪卡 #${cardSeq}` : "闪卡";
        pill.appendChild(seq);
        const action = document.createElement("span");
        action.className = "lv-card-badge-pill__action";
        action.innerHTML = `<svg class="lv-icon" viewBox="0 0 24 24"><use xlink:href="#iconEdit"></use></svg>`;
        pill.appendChild(action);
    } else {
        const text = document.createElement("span");
        text.className = "lv-card-badge-pill__text";
        text.textContent = kindMeta.actionLead;
        pill.appendChild(text);
    }

    if (pinnedActions && pinnedActions.length > 0 && onRunAction && blockID) {
        const quickSlot = document.createElement("span");
        quickSlot.className = "lv-card-badge-pill__quick-slot";
        const isMobileScreen = typeof window !== "undefined" && window.innerWidth <= 640;
        const maxSlots = isMobileScreen ? 3 : 5;
        pinnedActions.slice(0, maxSlots).forEach((act) => {
            const qBtn = document.createElement("span");
            qBtn.className = "b3-tooltips b3-tooltips__s lv-card-badge-pill__quick-btn";
            qBtn.setAttribute("role", "button");
            qBtn.setAttribute("tabindex", "0");
            qBtn.setAttribute("data-action-id", act.id);
            const tip = `${act.label}${act.badgeText ? ` (${act.badgeText})` : ""}`;
            qBtn.setAttribute("aria-label", tip);
            qBtn.textContent = act.glyph;

            const runWithVisualFeedback = async () => {
                const targetBlock = (pill as any).__lvTargetBlock as HTMLElement | undefined;
                if (!targetBlock || !isBlockVisibleForFloatingPill(targetBlock)) {
                    unmountFloatingPill(true);
                    return;
                }
                try {
                    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
                        navigator.vibrate(12);
                    }
                } catch { /* ignore */ }
                const currentBlockID = pill.getAttribute("data-block-id") || blockID;
                const runner = (pill as any).__lvRunAction || onRunAction;
                const originalGlyph = qBtn.textContent;
                try {
                    await runner(act.id, currentBlockID, qBtn);
                    if (act.id.startsWith("copy-") || act.id.includes("copy")) {
                        qBtn.textContent = "✓";
                        qBtn.style.color = "#10b981";
                        setTimeout(() => {
                            if (qBtn.isConnected) {
                                qBtn.textContent = originalGlyph;
                                qBtn.style.color = "";
                            }
                        }, 500);
                    }
                } catch { /* ignore */ }
            };

            qBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                void runWithVisualFeedback();
            });
            qBtn.addEventListener("touchend", (e) => {
                e.preventDefault();
                e.stopPropagation();
                void runWithVisualFeedback();
            }, { passive: false });
            qBtn.addEventListener("mousedown", (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            qBtn.addEventListener("dblclick", (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            qBtn.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            quickSlot.appendChild(qBtn);
        });
        pill.appendChild(quickSlot);
    }

    if (!withMore) return;

    const divider = document.createElement("span");
    divider.className = "lv-card-badge-pill__divider";
    divider.setAttribute("aria-hidden", "true");
    const more = document.createElement("span");
    more.className = "b3-tooltips b3-tooltips__s lv-card-badge-pill__more";
    more.setAttribute("role", "button");
    more.setAttribute("tabindex", "0");
    more.setAttribute("aria-label", "展开块操作中心");
    more.textContent = "▾";
    pill.appendChild(divider);
    pill.appendChild(more);
}

function hasCardOrBlockMarker(el: Element): boolean {
    return el.hasAttribute("data-node-id")
        || el.hasAttribute("custom-riff-decks")
        || el.hasAttribute("custom-riff-title")
        || el.hasAttribute("custom-lv-question")
        || el.hasAttribute("custom-lv-answer")
        || el.hasAttribute("custom-card-answer")
        || el.hasAttribute("custom-riff-answer")
        || el.hasAttribute("custom-lv-attr-subtype");
}

function isInsideEditorSurface(target: EventTarget | null): boolean {
    const el = target instanceof Element ? target : null;
    if (!el) return false;
    if (el.closest(FLOATING_PILL_AND_MENU_SELECTOR)) return false;
    if (isInsidePluginReviewOrPreview(el)) return false;
    return Boolean(el.closest(".protyle-wysiwyg"));
}

/**
 * 启动编辑器属性问答卡与零侵入脱离式块助手服务
 */
export function startEditorQaService(options: EditorQaServiceOptions): EditorQaServiceInstance {
    let disposed = false;
    let scanTimer: any = null;
    let scanTimerType: "raf" | "timeout" | null = null;
    let selectionDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSelectionBlock: HTMLElement | null = null;
    let typingUntil = 0;
    let cachedPinnedActions: PinnedQuickActionItem[] | null = null;
    let lastHoveredBlock: HTMLElement | null = null;
    let hasPrefetched = false;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchTargetBlock: HTMLElement | null = null;
    let isTouchScrolling = false;

    const pendingBlocks = new Set<HTMLElement>();
    let fullScanQueued = false;

    const cancelScanTimer = () => {
        if (!scanTimer) return;
        if (scanTimerType === "raf" && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
            window.cancelAnimationFrame(scanTimer);
        } else {
            clearTimeout(scanTimer);
        }
        scanTimer = null;
        scanTimerType = null;
    };

    const clearSelectionDebounce = () => {
        if (selectionDebounceTimer) {
            clearTimeout(selectionDebounceTimer);
            selectionDebounceTimer = null;
        }
    };

    const checkEnabled = (): boolean => {
        if (disposed) return false;
        if (options.isEnabled) {
            try {
                return Boolean(options.isEnabled());
            } catch {
                return true;
            }
        }
        return true;
    };

    const getCachedPinnedActions = (): PinnedQuickActionItem[] => {
        if (cachedPinnedActions !== null) return cachedPinnedActions;
        cachedPinnedActions = options.getPinnedActions ? options.getPinnedActions() : [];
        return cachedPinnedActions;
    };

    const mountOrUpdateFloatingPill = (blockEl: HTMLElement): boolean => {
        if (!checkEnabled() || !isValidEditorBlock(blockEl)) return false;
        return decorateEditorBlock(
            blockEl,
            options.onEditQuestion,
            options.onOpenBlockActions,
            getCachedPinnedActions,
            options.onRunAction,
        );
    };

    const cleanupBlockAssistantDom = () => {
        cancelScanTimer();
        clearSelectionDebounce();
        lastSelectionBlock = null;
        typingUntil = 0;
        pendingBlocks.clear();
        fullScanQueued = false;
        lastHoveredBlock = null;
        touchTargetBlock = null;
        unmountFloatingPill(true);
        setActiveSelectedBlock(null);
        options.onDisableCleanup?.();
        cleanupDetachedBodyPortals(true);
    };

    const triggerTypingSilenceAndHide = (target: EventTarget | null) => {
        const insideEditor = isInsideEditorSurface(target)
            || (typeof document !== "undefined" && isInsideEditorSurface(document.activeElement));
        if (!insideEditor) return;
        typingUntil = Date.now() + TYPING_QUIET_MS;
        cancelScanTimer();
        clearSelectionDebounce();
        lastHoveredBlock = null;
        unmountFloatingPill(true);
    };

    const scan = (root: HTMLElement | Document = document) => {
        if (disposed) return;
        if (!checkEnabled()) {
            cleanupBlockAssistantDom();
            return;
        }
        if (root instanceof HTMLElement && isInsidePluginReviewOrPreview(root)) {
            return;
        }
        // 仅当浮动胶囊已为当前根内某块激活时刷新；不主动在静止全屏扫描时强行弹出胶囊
        if (floatingPillBlockEl) {
            if (!isBlockVisibleForFloatingPill(floatingPillBlockEl)) {
                unmountFloatingPill(true);
            } else if (root === document || (root instanceof HTMLElement && root.contains(floatingPillBlockEl))) {
                mountOrUpdateFloatingPill(floatingPillBlockEl);
            }
        }
    };

    const flushIncrementalScan = () => {
        scanTimer = null;
        scanTimerType = null;
        if (disposed) return;
        if (!checkEnabled()) {
            cleanupBlockAssistantDom();
            return;
        }
        if (fullScanQueued) {
            fullScanQueued = false;
            pendingBlocks.clear();
            scan(document);
            return;
        }
        const blocks = Array.from(pendingBlocks);
        pendingBlocks.clear();
        if (floatingPillBlockEl && !isBlockVisibleForFloatingPill(floatingPillBlockEl)) {
            unmountFloatingPill(true);
            return;
        }
        for (const el of blocks) {
            if (el === floatingPillBlockEl && el.isConnected) {
                mountOrUpdateFloatingPill(el);
            }
        }
    };

    const scheduleScan = (full = false) => {
        if (disposed || !checkEnabled()) return;
        if (full) fullScanQueued = true;
        if (scanTimer) return;
        const remainingQuiet = full ? 0 : Math.max(0, typingUntil - Date.now());
        if (remainingQuiet > 0) {
            scanTimerType = "timeout";
            scanTimer = setTimeout(() => {
                scanTimer = null;
                scanTimerType = null;
                if (disposed || !checkEnabled()) return;
                const stillQuiet = Math.max(0, typingUntil - Date.now());
                if (stillQuiet > 0 && !fullScanQueued) {
                    scheduleScan(false);
                    return;
                }
                flushIncrementalScan();
            }, remainingQuiet);
            return;
        }
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
            scanTimerType = "raf";
            scanTimer = window.requestAnimationFrame(flushIncrementalScan);
        } else {
            scanTimerType = "timeout";
            scanTimer = setTimeout(flushIncrementalScan, 80);
        }
    };

    // 1. 监听 DOM 树与闪卡属性变更（严格剪枝，且检测到当前锚定块被移除时瞬时卸载胶囊）
    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
        observer = new MutationObserver((mutations) => {
            if (!checkEnabled()) return;
            if (floatingPillBlockEl && !floatingPillBlockEl.isConnected) {
                suppressCapsuleAfterBlockDelete(900);
            }
            let hasPending = false;
            for (const m of mutations) {
                if (m.type === "childList") {
                    if (m.addedNodes.length === 0) continue;
                    let anyStructuralCandidate = false;
                    for (let i = 0; i < m.addedNodes.length; i++) {
                        const n = m.addedNodes[i];
                        if (n.nodeType !== 1) continue;
                        const el = n as Element;
                        if (
                            el.id === FLOATING_PILL_ID
                            || el.classList.contains("lv-card-badge-pill")
                            || el.hasAttribute("data-lv-card-attr-btn")
                            || el.classList.contains("ft-editor-edit-btn")
                        ) {
                            continue;
                        }
                        if (hasCardOrBlockMarker(el) || !INLINE_TYPING_TAGS.has(el.tagName)) {
                            anyStructuralCandidate = true;
                            break;
                        }
                    }
                    if (!anyStructuralCandidate) continue;
                }

                if (m.target instanceof Element && (isInsidePluginReviewOrPreview(m.target) || m.target.closest(FLOATING_PILL_AND_MENU_SELECTOR))) {
                    continue;
                }
                if (m.type === "childList") {
                    const isEditable = m.target instanceof Element && (m.target.getAttribute("contenteditable") === "true" || Boolean(m.target.closest('[contenteditable="true"]')));
                    if (isEditable) {
                        let hasCardCandidate = false;
                        for (let i = 0; i < m.addedNodes.length; i++) {
                            const n = m.addedNodes[i];
                            if (n instanceof Element && hasCardOrBlockMarker(n)) {
                                hasCardCandidate = true;
                                break;
                            }
                        }
                        if (!hasCardCandidate) continue;
                    }
                } else if (m.type === "attributes" && m.target instanceof HTMLElement) {
                    const attr = m.attributeName;
                    if (
                        attr && (CARD_ATTR_NAMES as readonly string[]).includes(attr)
                        && isValidEditorBlock(m.target)
                        && m.target === floatingPillBlockEl
                    ) {
                        pendingBlocks.add(m.target);
                        hasPending = true;
                    }
                }
            }
            if (hasPending) {
                scheduleScan(false);
            }
        });

        const center = options.targetContainer
            || (typeof document !== "undefined"
                ? (document.querySelector(".layout__center") || document.querySelector(".protyle-content") || document.querySelector("#layouts") || document.body || document.documentElement)
                : null);

        if (center) {
            try {
                observer.observe(center, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: [...CARD_ATTR_NAMES],
                });
            } catch { /* ignore */ }
        }
    }

    // 2. 外部事件兼容与配置热更新
    const onTitleEditEvent = (e: Event) => {
        if (disposed || !checkEnabled()) return;
        const detail = (e as CustomEvent)?.detail;
        const blockId = detail?.blockId || detail?.id;
        if (blockId && typeof blockId === "string") {
            options.onEditQuestion(blockId);
        }
    };

    const onActionConfigChange = () => {
        if (disposed) return;
        cachedPinnedActions = null;
        if (!checkEnabled()) {
            cleanupBlockAssistantDom();
            return;
        }
        if (floatingPillEl) {
            (floatingPillEl as any).__lvRenderSig = undefined;
        }
        if (floatingPillBlockEl && isBlockVisibleForFloatingPill(floatingPillBlockEl)) {
            mountOrUpdateFloatingPill(floatingPillBlockEl);
        }
    };

    const onEnabledChanged = () => {
        if (disposed) return;
        if (!checkEnabled()) {
            cleanupBlockAssistantDom();
        } else {
            scheduleScan(true);
        }
    };

    const onStorageChanged = (e: StorageEvent) => {
        if (e.key === "lv_block_assistant_enabled_v1") {
            onEnabledChanged();
        }
    };

    if (typeof document !== "undefined") {
        document.addEventListener("flashcard-title-edit", onTitleEditEvent);
    }
    if (typeof window !== "undefined") {
        window.addEventListener("lv-block-action-config-changed", onActionConfigChange);
        window.addEventListener("lv-block-action-store-updated", onActionConfigChange);
        window.addEventListener("lv-block-assistant-enabled-changed", onEnabledChanged);
        window.addEventListener("storage", onStorageChanged);
    }

    // 3. 桌面悬浮与脱离式浮动胶囊跟随
    const onWysiwygMouseOver = (e: MouseEvent) => {
        if (disposed) return;
        if (!checkEnabled()) {
            cleanupBlockAssistantDom();
            return;
        }
        if (Date.now() < typingUntil || Date.now() < globalSelectionQuietUntil) return;

        const eventTarget = e.target as HTMLElement | null;
        if (eventTarget?.closest?.(FLOATING_PILL_AND_MENU_SELECTOR) || isInsidePluginReviewOrPreview(eventTarget)) {
            return;
        }
        if (isBlockActionMenuCurrentlyOpen()) {
            return;
        }

        const rawTarget = eventTarget?.closest?.(".protyle-wysiwyg [data-node-id]") as HTMLElement | null;
        const target = isValidEditorBlock(rawTarget) ? rawTarget : null;
        if (!target) {
            if (lastHoveredBlock !== null || floatingPillEl !== null) {
                lastHoveredBlock = null;
                unmountFloatingPill(false);
            }
            return;
        }

        if (target === lastHoveredBlock && isBlockDecorated(target)) {
            return;
        }
        lastHoveredBlock = target;

        if (!hasPrefetched && options.onPrefetch) {
            hasPrefetched = true;
            if (typeof window !== "undefined" && "requestIdleCallback" in window) {
                (window as any).requestIdleCallback(() => options.onPrefetch?.(), { timeout: 2000 });
            } else {
                setTimeout(() => options.onPrefetch?.(), 100);
            }
        }

        mountOrUpdateFloatingPill(target);
    };

    const onDocumentMouseLeave = () => {
        if (disposed) return;
        lastHoveredBlock = null;
        unmountFloatingPill(false);
    };

    const onGlobalKeydown = (e: KeyboardEvent) => {
        if (disposed) return;
        if (e.key === "Escape") {
            lastSelectionBlock = null;
            lastHoveredBlock = null;
            setActiveSelectedBlock(null);
            unmountFloatingPill(true);
            return;
        }
        const isEditShortcut = (e.ctrlKey || e.metaKey)
            && !MODIFIER_ONLY_KEYS.has(e.key)
            && /^(x|v|z|y|backspace|delete|enter)$/i.test(e.key || "");
        const isEditOrNavKey = EDIT_NAVIGATION_KEYS.has(e.key)
            || isEditShortcut
            || (!e.ctrlKey && !e.metaKey && !e.altKey && !MODIFIER_ONLY_KEYS.has(e.key));
        if (isEditOrNavKey) {
            triggerTypingSilenceAndHide(e.target);
        }
    };

    const onBeforeInputOrInput = (e: Event) => {
        if (disposed) return;
        triggerTypingSilenceAndHide(e.target);
    };

    const onGlobalPointerDown = (e: MouseEvent | PointerEvent) => {
        if (disposed) return;
        const el = e.target as HTMLElement | null;
        if (!el?.closest?.(`.protyle-wysiwyg [data-node-id], ${FLOATING_PILL_AND_MENU_SELECTOR}, .b3-dialog, .b3-menu`)) {
            lastSelectionBlock = null;
            lastHoveredBlock = null;
            setActiveSelectedBlock(null);
            unmountFloatingPill(false);
        }
    };

    const onGlobalScroll = (e: Event) => {
        if (disposed) return;
        const target = e.target as Element | null;
        if (target?.closest?.(".lv-bam")) return;
        cancelScanTimer();
        clearSelectionDebounce();
        lastHoveredBlock = null;
        if (isBlockActionMenuCurrentlyOpen()) {
            if (floatingPillEl && floatingPillBlockEl && isBlockVisibleForFloatingPill(floatingPillBlockEl)) {
                positionFloatingPill(floatingPillEl, floatingPillBlockEl);
            } else {
                unmountFloatingPill(true);
            }
            return;
        }
        unmountFloatingPill(true);
    };

    const onWindowResize = () => {
        if (disposed) return;
        lastHoveredBlock = null;
        if (isBlockActionMenuCurrentlyOpen()) {
            if (floatingPillEl && floatingPillBlockEl && isBlockVisibleForFloatingPill(floatingPillBlockEl)) {
                positionFloatingPill(floatingPillEl, floatingPillBlockEl);
            } else {
                unmountFloatingPill(true);
            }
            return;
        }
        unmountFloatingPill(true);
    };

    // 4. 触屏交互与移动端精准显隐（轻触显隐，滑动瞬时卸载）
    const onWysiwygTouchStart = (e: TouchEvent) => {
        if (disposed || !checkEnabled()) return;
        const eventTarget = e.target as HTMLElement | null;
        if (eventTarget?.closest?.(FLOATING_PILL_AND_MENU_SELECTOR)) {
            return;
        }
        const touch = e.touches?.[0] || (e as any).changedTouches?.[0];
        if (touch) {
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
        } else {
            touchStartX = 0;
            touchStartY = 0;
        }
        isTouchScrolling = false;
        const rawTouchTarget = eventTarget?.closest?.(".protyle-wysiwyg [data-node-id]") as HTMLElement | null;
        const target = isValidEditorBlock(rawTouchTarget) ? rawTouchTarget : null;
        touchTargetBlock = target;
        if (!target) {
            const insideMenu = eventTarget?.closest?.(`${FLOATING_PILL_AND_MENU_SELECTOR}, .b3-dialog, .b3-menu`);
            if (!insideMenu) {
                setActiveSelectedBlock(null);
                unmountFloatingPill(false);
            }
            return;
        }

        mountOrUpdateFloatingPill(target);
        setActiveSelectedBlock(target);
    };

    const onGlobalTouchMove = (e: TouchEvent) => {
        if (disposed) return;
        const eventTarget = e.target as Element | null;
        if (eventTarget?.closest?.(".lv-bam")) return;
        const touch = e.touches?.[0];
        if (touch && (touchStartX !== 0 || touchStartY !== 0)) {
            const dx = Math.abs(touch.clientX - touchStartX);
            const dy = Math.abs(touch.clientY - touchStartY);
            if (dx <= 8 && dy <= 8) return;
        }
        isTouchScrolling = true;
        cancelScanTimer();
        clearSelectionDebounce();
        unmountFloatingPill(false);
    };

    const onWysiwygTouchEnd = (e: TouchEvent) => {
        if (disposed || !checkEnabled()) return;
        const eventTarget = e.target as HTMLElement | null;
        if (eventTarget?.closest?.(FLOATING_PILL_AND_MENU_SELECTOR)) {
            return;
        }
        if (isTouchScrolling) {
            return;
        }
        const target = touchTargetBlock;
        if (!target || !isValidEditorBlock(target)) {
            const insideMenu = eventTarget?.closest?.(`${FLOATING_PILL_AND_MENU_SELECTOR}, .b3-dialog, .b3-menu`);
            if (!insideMenu) {
                setActiveSelectedBlock(null);
                unmountFloatingPill(false);
            }
            return;
        }

        mountOrUpdateFloatingPill(target);
        setActiveSelectedBlock(target);
    };

    const onWysiwygFocusIn = (e: FocusEvent) => {
        if (disposed || !checkEnabled()) return;
        if (Date.now() < typingUntil || Date.now() < globalSelectionQuietUntil || isBlockActionMenuCurrentlyOpen()) return;
        const rawBlock = (e.target as HTMLElement)?.closest?.(".protyle-wysiwyg [data-node-id]") as HTMLElement | null;
        const block = isValidEditorBlock(rawBlock) ? rawBlock : null;
        if (block) {
            lastSelectionBlock = block;
            mountOrUpdateFloatingPill(block);
            setActiveSelectedBlock(block);
        }
    };

    const flushSelectionChange = () => {
        if (disposed || !checkEnabled()) return;
        if (Date.now() < typingUntil || Date.now() < globalSelectionQuietUntil || isBlockActionMenuCurrentlyOpen()) return;
        const sel = document.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const anchor = sel.anchorNode;
        const anchorEl = anchor instanceof HTMLElement ? anchor : anchor?.parentElement;
        const rawBlock = anchorEl?.closest?.(".protyle-wysiwyg [data-node-id]") as HTMLElement | null;
        const block = isValidEditorBlock(rawBlock) ? rawBlock : null;
        if (block && block === lastSelectionBlock && getActiveSelectedBlock() === block && isBlockDecorated(block)) {
            return;
        }
        if (!block && lastSelectionBlock === null) return;
        lastSelectionBlock = block;
        if (block) {
            mountOrUpdateFloatingPill(block);
            setActiveSelectedBlock(block);
        }
    };

    const onSelectionChange = () => {
        if (disposed || !checkEnabled()) return;
        clearSelectionDebounce();
        const quietRemaining = Math.max(0, typingUntil - Date.now());
        const delay = Math.max(SELECTION_DEBOUNCE_MS, quietRemaining);
        selectionDebounceTimer = setTimeout(() => {
            selectionDebounceTimer = null;
            if (disposed || !checkEnabled()) return;
            const remaining = Math.max(0, typingUntil - Date.now());
            if (remaining > 0) {
                selectionDebounceTimer = setTimeout(() => {
                    selectionDebounceTimer = null;
                    flushSelectionChange();
                }, remaining);
                return;
            }
            flushSelectionChange();
        }, delay);
    };

    if (typeof document !== "undefined") {
        cleanupDetachedBodyPortals(true);
        document.addEventListener("mouseover", onWysiwygMouseOver, { passive: true });
        document.addEventListener("mouseleave", onDocumentMouseLeave, { passive: true });
        document.addEventListener("keydown", onGlobalKeydown, { capture: true, passive: true });
        document.addEventListener("beforeinput", onBeforeInputOrInput, { capture: true, passive: true });
        document.addEventListener("input", onBeforeInputOrInput, { capture: true, passive: true });
        document.addEventListener("compositionstart", onBeforeInputOrInput, { capture: true, passive: true });
        document.addEventListener("cut", onBeforeInputOrInput, { capture: true, passive: true });
        document.addEventListener("paste", onBeforeInputOrInput, { capture: true, passive: true });
        document.addEventListener("pointerdown", onGlobalPointerDown, { passive: true });
        document.addEventListener("touchmove", onGlobalTouchMove, { passive: true });
        if (typeof window !== "undefined" && "ontouchstart" in window) {
            document.addEventListener("touchstart", onWysiwygTouchStart, { passive: true });
            document.addEventListener("touchend", onWysiwygTouchEnd, { passive: true });
        }
        document.addEventListener("focusin", onWysiwygFocusIn, { passive: true });
        document.addEventListener("selectionchange", onSelectionChange, { passive: true });
    }
    if (typeof window !== "undefined") {
        window.addEventListener("scroll", onGlobalScroll, { passive: true, capture: true });
        window.addEventListener("resize", onWindowResize, { passive: true });
    }

    if (checkEnabled()) {
        scheduleScan(true);
    }

    return {
        scan,
        dispose: () => {
            disposed = true;
            globalSelectionQuietUntil = 0;
            cancelScanTimer();
            clearSelectionDebounce();
            lastSelectionBlock = null;
            typingUntil = 0;
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            if (typeof window !== "undefined") {
                window.removeEventListener("lv-block-action-config-changed", onActionConfigChange);
                window.removeEventListener("lv-block-action-store-updated", onActionConfigChange);
                window.removeEventListener("lv-block-assistant-enabled-changed", onEnabledChanged);
                window.removeEventListener("storage", onStorageChanged);
                window.removeEventListener("scroll", onGlobalScroll, true);
                window.removeEventListener("resize", onWindowResize);
            }
            if (typeof document !== "undefined") {
                document.removeEventListener("flashcard-title-edit", onTitleEditEvent);
                document.removeEventListener("mouseover", onWysiwygMouseOver);
                document.removeEventListener("mouseleave", onDocumentMouseLeave);
                document.removeEventListener("keydown", onGlobalKeydown, true);
                document.removeEventListener("beforeinput", onBeforeInputOrInput, true);
                document.removeEventListener("input", onBeforeInputOrInput, true);
                document.removeEventListener("compositionstart", onBeforeInputOrInput, true);
                document.removeEventListener("cut", onBeforeInputOrInput, true);
                document.removeEventListener("paste", onBeforeInputOrInput, true);
                document.removeEventListener("pointerdown", onGlobalPointerDown);
                document.removeEventListener("touchmove", onGlobalTouchMove);
                if (typeof window !== "undefined" && "ontouchstart" in window) {
                    document.removeEventListener("touchstart", onWysiwygTouchStart);
                    document.removeEventListener("touchend", onWysiwygTouchEnd);
                }
                document.removeEventListener("focusin", onWysiwygFocusIn);
                document.removeEventListener("selectionchange", onSelectionChange);
                lastHoveredBlock = null;
                touchTargetBlock = null;
                unmountFloatingPill(true);
                setActiveSelectedBlock(null);
                cleanupDetachedBodyPortals(true);
            }
        },
    };
}
