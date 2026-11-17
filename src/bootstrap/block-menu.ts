/**
 * 块图标与选区制卡菜单构建引擎（BlockMenu）
 * 统筹思源笔记编辑器点击块图标时弹出的菜单项构建（添加到卡组/收件箱/选区挖空/图片遮挡/从卡组移除），
 * 采用逻辑计算与原生 Menu 分离，便于离线测试。
 */

export interface BlockElementLike {
    getAttribute?(attr: string): string | null;
    dataset?: Record<string, string | undefined>;
}

/**
 * 从 DOM 元素数组中安全提取有效块 ID
 */
export function extractBlockIDs(elements?: BlockElementLike[]): string[] {
    if (!Array.isArray(elements) || elements.length === 0) {
        return [];
    }
    return elements
        .map(el => el.getAttribute?.("data-node-id") || el.dataset?.nodeId || "")
        .filter(Boolean);
}

export interface BlockMenuItemDescriptor {
    id: "add-to-deck" | "add-to-inbox" | "make-cloze" | "make-occlusion" | "remove-from-deck" | "make-from-selection" | "set-card-question" | "add-doc-review" | "remove-doc-review";
    icon: string;
    label: string;
    click: () => void | Promise<void>;
}

export const BLOCK_MENU_ICON_CLASS = "lv-cards-menu-icon";
export const PLUGIN_MENU_ICON_CLASS = BLOCK_MENU_ICON_CLASS;

/** Keep host menu layout/keyboard behavior while marking only our icons for size containment. */
export function addBlockMenuItems(
    menu: { addItem(item: Omit<BlockMenuItemDescriptor, "id"> & { iconClass: string }): void },
    items: BlockMenuItemDescriptor[],
): void {
    for (const item of items) {
        menu.addItem({
            icon: item.icon,
            iconClass: BLOCK_MENU_ICON_CLASS,
            label: item.label,
            click: item.click,
        });
    }
}

export interface BlockMenuConfig {
    blockIDs: string[];
    modules: {
        inbox?: boolean;
    };
    i18n: Record<string, any>;
    actions: {
        addToDeck: (blockIDs: string[]) => void;
        addToInbox?: (blockIDs: string[]) => void;
        makeCloze?: (blockID: string) => void;
        makeOcclusion?: (blockID: string) => void;
        removeFromDeck: (blockIDs: string[]) => void;
        /** R59 用编辑器选中文本打开快速制卡（题面预填），便于原位无缝制卡 */
        makeFromSelection?: (blockID: string, selectionText: string) => void;
        /** 设置或编辑免侵入闪卡问题（属性问答卡，零侵入笔记正文） */
        setCardQuestion?: (blockID: string) => void;
        /** 加入整篇文档间隔温故排期（Obsidian SR 风格） */
        addDocReview?: (docId: string) => void;
        /** 移出整篇文档间隔温故排期 */
        removeDocReview?: (docId: string) => void;
    };
    /** R59 编辑器当前选区文本（菜单弹出会抢焦点，须在构建期捕获） */
    selectionText?: string;
    /** 当前目标是否已加入文档温故排期 */
    isAlreadyDocReview?: boolean;
    /** 当前块是否已入卡包或具有闪卡问答属性 */
    isAlreadyCard?: boolean;
}

/**
 * 计算块图标菜单项列表（纯逻辑）
 */
export function computeBlockMenuItems(config: BlockMenuConfig): BlockMenuItemDescriptor[] {
    const { blockIDs, modules, i18n, actions, selectionText, isAlreadyDocReview, isAlreadyCard } = config;
    if (blockIDs.length === 0) {
        return [];
    }

    const items: BlockMenuItemDescriptor[] = [];
    const countSuffix = blockIDs.length > 1 ? ` ×${blockIDs.length}` : "";

    items.push({
        id: "add-to-deck",
        icon: "iconLvCards",
        label: (i18n.menuAddToDeck ?? "小驴闪卡：添加到卡组") + countSuffix,
        click: () => actions.addToDeck(blockIDs),
    });

    if (blockIDs.length >= 1 && actions.setCardQuestion) {
        items.push({
            id: "set-card-question",
            icon: "iconEdit",
            label: isAlreadyCard ? (i18n.menuEditCardQuestion ?? "小驴闪卡：编辑闪卡问答 (问题·答案)") : (i18n.menuSetCardQuestion ?? "小驴闪卡：设置闪卡问答 (问题·答案)"),
            click: () => actions.setCardQuestion?.(blockIDs[0]),
        });
    }

    // 文档温故入口（单块且提供回调时）
    if (blockIDs.length === 1) {
        if (isAlreadyDocReview && actions.removeDocReview) {
            items.push({
                id: "remove-doc-review",
                icon: "iconLvCards",
                label: i18n.menuRemoveDocReview ?? "小驴闪卡：移出文档温故排期",
                click: () => actions.removeDocReview?.(blockIDs[0]),
            });
        } else if (!isAlreadyDocReview && actions.addDocReview) {
            items.push({
                id: "add-doc-review",
                icon: "iconLvCards",
                label: i18n.menuAddDocReview ?? "小驴闪卡：加入文档温故排期",
                click: () => actions.addDocReview?.(blockIDs[0]),
            });
        }
    }

    // R59 选中文本一键带起草稿：选区非空且单块时，用选中文本预填快速制卡题面
    if (blockIDs.length === 1 && actions.makeFromSelection && selectionText && selectionText.length >= 2) {
        items.push({
            id: "make-from-selection",
            icon: "iconLvCards",
            label: i18n.menuMakeFromSelection ?? "小驴闪卡：用选中文本制卡",
            click: () => actions.makeFromSelection?.(blockIDs[0], selectionText),
        });
    }

    if (modules.inbox && actions.addToInbox) {
        items.push({
            id: "add-to-inbox",
            icon: "iconLvCards",
            label: (i18n.menuAddToInbox ?? "小驴闪卡：加入材料收件箱") + countSuffix,
            click: () => actions.addToInbox?.(blockIDs),
        });
    }

    if (blockIDs.length === 1) {
        if (actions.makeCloze) {
            items.push({
                id: "make-cloze",
                icon: "iconLvCards",
                label: i18n.menuMakeCloze ?? "小驴闪卡：挖空并制卡",
                click: () => actions.makeCloze?.(blockIDs[0]),
            });
        }
        if (actions.makeOcclusion) {
            items.push({
                id: "make-occlusion",
                icon: "iconLvCards",
                label: i18n.menuMakeOcclusion ?? "小驴闪卡：制作遮挡卡",
                click: () => actions.makeOcclusion?.(blockIDs[0]),
            });
        }
    }

    if (isAlreadyCard !== false) {
        items.push({
            id: "remove-from-deck",
            icon: "iconLvCards",
            label: i18n.menuRemoveFromDeck ?? "小驴闪卡：从卡组移除",
            click: () => actions.removeFromDeck(blockIDs),
        });
    }

    return items;
}

/**
 * 包装文本为思源挖空 Markdown 语法
 */
export function formatClozeText(text: string): string {
    const trimmed = text.trim();
    return trimmed ? `==${trimmed}==` : "";
}
