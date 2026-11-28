/**
 * 编辑器右键菜单与块图标菜单监听集成（Editor Menu Listeners）
 * 统管 open-menu-doctree, click-blockicon, open-menu-content 菜单挂载与温故文档标记。
 */

import { setBlockAttrs, getBlockAttrs } from "@/api/siyuan";
import { buildDocInitialAttrs, buildDocRemoveAttrs } from "@/core/document-review";
import { extractBlockIDs, computeBlockMenuItems, addBlockMenuItems, BLOCK_MENU_ICON_CLASS } from "@/bootstrap/block-menu";
import { openBlockTypeMorphPicker, morphBlockTypeTo } from "@/libs/lv-notice-kit";
import { findActiveProtyleBlockElement, findFloatingPillAnchor } from "@/core/block-dom-utils";
import { isBlockFlashcardExcluded, isBlockV2FlashcardSource } from "@/core/block-attributes";

export function createEditorMenuListeners(plugin: any) {
    const addDocToReview = async (docId: string) => {
        try {
            await setBlockAttrs(docId, buildDocInitialAttrs());
            plugin.showNotice(plugin.i18n.menuAddDocReviewSuccess ?? "✦ 已加入整篇文档温故排期", 2500, "info");
        } catch (e) {
            plugin.showNotice("加入文档温故排期失败：" + (e instanceof Error ? e.message : e), 3000, "error");
        }
    };

    const removeDocFromReview = async (docId: string) => {
        try {
            await setBlockAttrs(docId, buildDocRemoveAttrs());
            plugin.showNotice(plugin.i18n.menuRemoveDocReviewSuccess ?? "已移出文档温故排期", 2500, "info");
        } catch (e) {
            plugin.showNotice("移出文档温故排期失败：" + (e instanceof Error ? e.message : e), 3000, "error");
        }
    };

    const onDocTreeMenu = async (event: CustomEvent<{ menu: any; docpath?: string; selectIds?: string[] }>) => {
        try {
            const docIDs = event.detail?.selectIds || [];
            if (!event.detail?.menu || docIDs.length === 0) return;
            const docId = docIDs[0];
            const attrs = await getBlockAttrs(docId);
            const isAlready = attrs?.["custom-lv-note-review"] === "true";
            event.detail.menu.addItem({
                icon: "iconLvCards",
                iconClass: BLOCK_MENU_ICON_CLASS,
                label: isAlready ? (plugin.i18n.menuRemoveDocReview ?? "移出文档温故排期") : (plugin.i18n.menuAddDocReview ?? "✦ 加入文档温故排期"),
                click: () => {
                    if (isAlready) void removeDocFromReview(docId);
                    else void addDocToReview(docId);
                },
            });
        } catch {}
    };

    const onBlockIcon = ({ detail }: any) => {
        try {
            let blockIDs = extractBlockIDs(detail?.blockElements);
            if (blockIDs.length === 0 && detail?.element) blockIDs = extractBlockIDs([detail.element]);
            if (blockIDs.length === 0 && detail?.target) {
                const closest = detail.target.closest?.("[data-node-id]");
                if (closest) blockIDs = extractBlockIDs([closest]);
            }
            if (blockIDs.length === 0) {
                const selectEl = document.querySelector(".layout__wnd--active .protyle-wysiwyg--select[data-node-id], .protyle-wysiwyg--select[data-node-id]");
                if (selectEl) blockIDs = extractBlockIDs([selectEl]);
            }
            if (blockIDs.length === 0 || !detail?.menu) return;

            const clozeRange = blockIDs.length === 1 && document.getSelection()?.rangeCount
                ? document.getSelection()!.getRangeAt(0).cloneRange()
                : null;
            const clozeText = clozeRange?.toString().trim() ?? "";

            const firstEl = (detail?.blockElements?.[0] || detail?.element || (blockIDs[0] ? document.querySelector(`[data-node-id="${blockIDs[0]}"]`) : undefined)) as HTMLElement | undefined;
            const isAlreadyDocReview = Boolean(firstEl?.getAttribute("custom-lv-note-review") === "true");
            const isExcludedSource = isBlockFlashcardExcluded(firstEl);
            const isAlreadyCard = !isExcludedSource && Boolean(
                isBlockV2FlashcardSource(firstEl)
                || plugin.v2SourceIndex?.hasBlock?.(blockIDs[0])
                || firstEl?.hasAttribute("custom-riff-decks")
                || firstEl?.hasAttribute("custom-riff-title")
                || firstEl?.hasAttribute("custom-lv-question")
                || firstEl?.hasAttribute("custom-lv-answer")
                || firstEl?.hasAttribute("custom-card-answer")
                || firstEl?.hasAttribute("custom-lv-attr-subtype")
            );

            const items = computeBlockMenuItems({
                blockIDs,
                modules: plugin.settings.modules,
                i18n: plugin.i18n,
                selectionText: clozeText,
                isAlreadyDocReview,
                isAlreadyCard,
                actions: {
                    addToDeck: (ids) => plugin.openDeckPicker(ids),
                    openBlockActionCenter: (ids) => {
                        const targetId = ids[0];
                        const targetEl = (detail?.blockElements?.[0] || detail?.element || (targetId ? findActiveProtyleBlockElement(targetId) : undefined)) as HTMLElement | undefined;
                        const anchor = findFloatingPillAnchor(targetId) || targetEl || document.body;
                        void plugin.openBlockActionCenter(targetId, anchor);
                    },
                    morphBlockType: (id) => {
                        const targetEl = (detail?.blockElements?.[0] || detail?.element || (id ? findActiveProtyleBlockElement(id) : undefined)) as HTMLElement | undefined;
                        const anchor = findFloatingPillAnchor(id) || targetEl || document.body;
                        openBlockTypeMorphPicker(id, anchor, async (targetType) => {
                            await morphBlockTypeTo(id, targetType);
                        });
                    },
                    makeFromSelection: (id, text) => { void plugin.openQuickCardFromSelection(id, text); },
                    setCardQuestion: (id) => { setTimeout(() => { void plugin.openCardQuestionDialog(id); }, 60); },
                    addDocReview: (id) => void addDocToReview(id),
                    removeDocReview: (id) => void removeDocFromReview(id),
                    addToInbox: (ids) => {
                        void plugin.addInboxItems(ids);
                    },
                    makeCloze: (id) => plugin.makeClozeCard(id, clozeRange, clozeText),
                    makeOcclusion: (id) => plugin.openDeckPicker([id], {
                        skipAdd: true,
                        onPicked: (deckID: string) => plugin.openOcclusionEditor(id, deckID),
                    }),
                    removeFromDeck: (ids) => plugin.removeCardsFromDeck(ids),
                },
            });
            addBlockMenuItems(detail.menu, items);
        } catch {}
    };

    const onMenuContent = ({ detail }: any) => {
        try {
            if (!detail?.menu) return;
            let blockIDs: string[] = [];
            if (detail?.protyle?.wysiwyg?.element) {
                const selectedElements = detail.protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select");
                blockIDs = extractBlockIDs(Array.from(selectedElements));
            }
            if (blockIDs.length === 0 && detail?.element) blockIDs = extractBlockIDs([detail.element]);
            if (blockIDs.length === 0) {
                const range = detail.range || (document.getSelection()?.rangeCount ? document.getSelection()!.getRangeAt(0) : null);
                const node = range?.commonAncestorContainer;
                const closestBlock = (node instanceof HTMLElement ? node : node?.parentElement)?.closest?.("[data-node-id]");
                if (closestBlock) {
                    const id = closestBlock.getAttribute("data-node-id");
                    if (id) blockIDs = [id];
                }
            }
            if (blockIDs.length === 0) return;

            const selectedText = detail.range ? detail.range.toString().trim() : (document.getSelection()?.toString()?.trim() ?? "");

            detail.menu.addItem({
                icon: "iconEdit",
                iconClass: BLOCK_MENU_ICON_CLASS,
                label: plugin.i18n.menuSetCardQuestion ?? "小驴闪卡：设置闪卡问答 (问题·答案)",
                accelerator: "⌥Q",
                click: () => {
                    setTimeout(() => { void plugin.openCardQuestionDialog(blockIDs[0]); }, 60);
                },
            });

            if (selectedText && selectedText.length >= 2) {
                detail.menu.addItem({
                    icon: "iconLvCards",
                    iconClass: BLOCK_MENU_ICON_CLASS,
                    label: plugin.i18n.menuMakeFromSelection ?? "用选中文本制卡",
                    click: () => { void plugin.openQuickCardFromSelection(blockIDs[0], selectedText); },
                });
            }

            detail.menu.addItem({
                icon: "iconLvCards",
                iconClass: BLOCK_MENU_ICON_CLASS,
                label: (plugin.i18n.menuAddToDeck ?? "添加到卡组") + (blockIDs.length > 1 ? ` ×${blockIDs.length}` : ""),
                click: () => plugin.openDeckPicker(blockIDs),
            });
        } catch {}
    };

    return {
        onDocTreeMenu,
        onBlockIcon,
        onMenuContent,
        addDocToReview,
        removeDocFromReview,
    };
}
