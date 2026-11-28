/**
 * 小驴闪卡 · 编辑器块级闪卡状态判定与共享胶囊刷新辅助
 *
 * 唯一块助手（#lv-shared-block-capsule + 共享 .lv-bam 菜单）已全权收归全生态底座 lvBlockAssistant。
 * 本模块仅保留闪卡领域纯判定与 refreshCapsule 桥接，严禁自绘任何重复胶囊或监听 hover/focus。
 */

import { lvBlockAssistant, isBlockOrProtyleReadOnly } from "../libs/lv-notice-kit";
import { isBlockFlashcardExcluded, isBlockV2FlashcardSource } from "./block-attributes";

const PLUGIN_REVIEW_OR_PREVIEW_SELECTOR = ".lv-review, .lv-cards-root, .lv-card-content, .lv-peek-body, .lv-detail-preview, .lv-cards-dialog, .lv-bam";

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

export function isBlockElementReadOnly(blockEl: Element | null | undefined): boolean {
    if (!blockEl) return false;
    const blockId = blockEl.getAttribute?.("data-node-id") || "";
    if (isBlockOrProtyleReadOnly(blockId, blockEl as HTMLElement)) return true;
    const wysiwyg = (blockEl as HTMLElement).closest?.(".protyle-wysiwyg");
    if (wysiwyg?.getAttribute?.("data-readonly") === "true") return true;
    if ((blockEl as HTMLElement).getAttribute?.("data-readonly") === "true") return true;
    return false;
}

export function isCardEditorBlock(blockEl: HTMLElement): boolean {
    if (!blockEl) return false;
    if (isBlockFlashcardExcluded(blockEl)) return false;
    if (isBlockV2FlashcardSource(blockEl)) return true;
    const title = (blockEl.getAttribute("custom-riff-title") || blockEl.getAttribute("custom-lv-question") || "").trim();
    return blockEl.hasAttribute("custom-riff-decks")
        || Boolean(title)
        || blockEl.hasAttribute("custom-lv-answer")
        || blockEl.hasAttribute("custom-card-answer")
        || blockEl.hasAttribute("custom-riff-answer")
        || blockEl.hasAttribute("custom-lv-attr-subtype");
}

export function refreshFloatingPill(blockID?: string): boolean {
    try {
        lvBlockAssistant.refreshCapsule(blockID);
        return true;
    } catch {
        return false;
    }
}
