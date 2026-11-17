/**
 * 小驴闪卡 · 免侵入属性问答卡 Protyle 编辑器服务（Editor QA Service）
 *
 * 核心设计原则：
 * 1. 零正文侵入：问题写入思源块属性（custom-riff-title），正文原样保持笔记纯净；
 * 2. 编辑器无感渲染：通过 CSS ::after 呈现 @@「问题内容」，聚焦编辑时自动隐退；
 * 3. 原生属性栏快捷入口：在闪卡块的 .protyle-attr 注入轻量 ✍️ 按钮，一键调起修改；
 * 4. 极致性能与防抖守卫：利用 dataset 状态缓存与 MutationObserver 自致突变过滤，规避重复渲染与布局抖动；
 * 5. 100% 互通：兼容闪卡工具箱（sy-flashcard-toolbox-plugin）的 custom-riff-title 属性与 flashcard-title-edit 事件。
 */

import { inferBlockKindFromElement, BLOCK_KIND_LABELS, type SiYuanBlockKind } from "./block-actions";

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
}

export interface EditorQaServiceInstance {
    scan: (root?: HTMLElement | Document) => void;
    dispose: () => void;
}

let activeSelectedBlock: HTMLElement | null = null;

/**
 * 移动端当前选中的活跃块（单例跟踪，确保屏幕仅留唯一的块助手）
 */
export function setActiveSelectedBlock(block: HTMLElement | null): void {
    if (activeSelectedBlock === block) return;
    if (activeSelectedBlock && activeSelectedBlock.isConnected) {
        activeSelectedBlock.removeAttribute("data-lv-selected");
    }
    activeSelectedBlock = block;
    if (activeSelectedBlock && activeSelectedBlock.isConnected) {
        activeSelectedBlock.setAttribute("data-lv-selected", "true");
    }
}

export function getActiveSelectedBlock(): HTMLElement | null {
    return activeSelectedBlock;
}

/**
 * 快速检查块是否已被有效装饰（O(1) 末子节点直接探查，避免慢速深度 querySelector）
 */
export function isBlockDecorated(blockEl: HTMLElement): boolean {
    const lastChild = blockEl.lastElementChild;
    if (lastChild && lastChild.classList.contains("protyle-attr")) {
        const pill = (lastChild as any).__lvPill;
        if (pill && pill.isConnected) return true;
        return Boolean(lastChild.querySelector(".lv-card-badge-pill"));
    }
    return Boolean(blockEl.querySelector(":scope > .protyle-attr .lv-card-badge-pill"));
}

/**
 * 在块元素上装饰属性问答标题及快捷修改按钮
 * 内置缓存防抖：若题面与绑定状态未变，则直接跳过，零额外 DOM 操作
 * @returns true 表示已完成装饰（可打已装饰标记）；false 表示块尚未渲染出 .protyle-attr，需后续重试
 */
export function decorateEditorBlock(
    blockEl: HTMLElement,
    onEditQuestion: (blockID: string) => void,
    onOpenBlockActions?: (blockID: string, anchor: HTMLElement) => void
): boolean {
    const blockID = blockEl.getAttribute("data-node-id");
    if (!blockID) return false;

    // 1. 处理自定义问题标题展示（data-custom-title）
    const title = (blockEl.getAttribute("custom-riff-title") || blockEl.getAttribute("custom-lv-question") || "").trim();
    // 性能优化：优先检查首个子元素，99% 的思源块首子节点即为 contenteditable
    const firstChild = blockEl.firstElementChild as HTMLElement | null;
    const contentEl = (firstChild && firstChild.getAttribute("contenteditable") === "true")
        ? firstChild
        : (blockEl.querySelector('div[contenteditable="true"]') as HTMLElement | null) || blockEl;

    if (title) {
        if (contentEl.getAttribute("data-custom-title") !== title) {
            contentEl.setAttribute("data-custom-title", title);
        }
    } else {
        if (contentEl.hasAttribute("data-custom-title")) {
            contentEl.removeAttribute("data-custom-title");
        }
        // 清理可能遗留在块容器上的旧属性
        if (blockEl !== contentEl && blockEl.hasAttribute("data-custom-title")) {
            blockEl.removeAttribute("data-custom-title");
        }
    }

    // 2. 在 .protyle-attr 注入一体化交互胶囊按钮
    // 闪卡块：显示【✦ 闪卡 #N ✏️】，彻底合并旧的静态 ::before 序号与独立编辑按钮，杜绝与原生日期等信息的重叠冲突；
    // 普通块：hover 时显示精致微光【✦ 设为问答卡】，一键直接调起属性问答设置，彻底解决普通块找不到入口的问题！
    const isCard = blockEl.hasAttribute("custom-riff-decks") || Boolean(title);

    const blockKind = inferBlockKindFromElement(blockEl);
    const kindMeta = BLOCK_KIND_LABELS[blockKind] || BLOCK_KIND_LABELS.paragraph;

    // 性能优化：思源中 .protyle-attr 恒为块容器的末尾子节点，O(1) 提取消除全局属性扫描
    const lastChild = blockEl.lastElementChild as HTMLElement | null;
    const lastAttr = (lastChild && lastChild.classList.contains("protyle-attr"))
        ? lastChild
        : (blockEl.querySelector(":scope > .protyle-attr") as HTMLElement | null);
    // 属性栏尚未渲染时返回 false：调用方据此不打「已装饰」标记，下次悬浮/扫描可重试，
    // 否则普通块会在懒加载首次悬浮时被永久标记为已装饰而永不出现入口（2026-11-16 实机回归根因）。
    if (!lastAttr) return false;

    // 仅在存在多个子元素时清理历史遗留独立类名按钮，消除每次无谓遍历
    if (lastAttr.childElementCount > 1) {
        const oldBtn = lastAttr.querySelector(".lv-cards-attr-edit-btn:not(.lv-card-badge-pill)") as HTMLElement | null;
        if (oldBtn) oldBtn.remove();
    }

    const cachedPill = (lastAttr as any).__lvPill as HTMLButtonElement | null;
    const existingPill = (cachedPill && cachedPill.isConnected)
        ? cachedPill
        : (lastAttr.querySelector(".lv-card-badge-pill") as HTMLButtonElement | null);
    if (existingPill) (lastAttr as any).__lvPill = existingPill;

    const tooltipText = isCard
        ? (title ? `✦ 闪卡「${title.slice(0, 18)}${title.length > 18 ? '…' : ''}」：单击展开块操作中心 (双击或 Alt+Q 编辑问答)` : "✦ 闪卡：单击展开块操作中心 (双击或 Alt+Q 编辑问答)")
        : `✦ ${kindMeta.actionLead}：单击展开块操作中心 (双击或 Alt+Q 问答制卡)`;

    if (!existingPill) {
        const btn = document.createElement("button");
        btn.type = "button";
        // 注意：严禁复用旧类名 lv-cards-attr-edit-btn——index.scss 为隐藏历史独立按钮写了
        // `display:none !important`，复用会让胶囊连同序号一起被永久隐藏（2026-11-16 实机回归根因）。
        btn.className = `b3-tooltips b3-tooltips__w lv-card-badge-pill ${isCard ? 'lv-card-badge-pill--card' : 'lv-card-badge-pill--ordinary'}`;
        btn.setAttribute("aria-label", tooltipText);
        btn.setAttribute("title", tooltipText);
        btn.setAttribute("data-block-id", blockID);
        btn.setAttribute("data-block-kind", blockKind);
        // 供旧样式/外部工具箱识别（不参与隐藏规则命中）
        btn.setAttribute("data-lv-card-attr-btn", "1");

        const wantsMore = Boolean(onOpenBlockActions);
        renderPillContent(btn, isCard, wantsMore, blockKind);
        (btn as any).__lvHasMore = wantsMore;
        // 展开区在 click 时读取该引用（而非闭包捕获），保证回调更新后立即生效
        (btn as any).__lvOpenBlockActions = onOpenBlockActions;
        (lastAttr as any).__lvPill = btn;

        let lastTriggerTime = 0;
        const triggerAction = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            const now = Date.now();
            if (now - lastTriggerTime < 260) return;
            lastTriggerTime = now;

            const handler = (btn as any).__lvOpenBlockActions as ((id: string, anchor: HTMLElement) => void) | undefined;
            if (handler) {
                // 用户现代直觉：点击块助手直接展开下拉菜单
                handler(blockID, btn);
            } else {
                // 降级回退：无菜单回调时直接打开问答弹窗
                setTimeout(() => {
                    onEditQuestion(blockID);
                }, 60);
            }
        };

        btn.addEventListener("click", triggerAction);
        btn.addEventListener("mousedown", (e) => {
            e.stopPropagation();
            // 真实鼠标按下的默认行为会清除文档文本选区，导致「挖空并制卡」在
            // click 装配快照时永远读不到选区（2026-11-17 实机走查根因）。
            // 仅在存在有效选区时阻止默认，保持选区存活到菜单打开。
            const sel = document.getSelection();
            if (sel && sel.rangeCount > 0 && sel.toString().trim().length > 0) {
                e.preventDefault();
            }
        });
        btn.addEventListener("touchend", triggerAction, { passive: false });

        // 双击胶囊直达问答设置工作台（保留高频制卡用户的极速物理通道）
        btn.addEventListener("dblclick", (e) => {
            e.preventDefault();
            e.stopPropagation();
            onEditQuestion(blockID);
        });

        // 右键胶囊 = 展开块操作中心
        btn.addEventListener("contextmenu", (e) => {
            if (!onOpenBlockActions) return;
            e.preventDefault();
            e.stopPropagation();
            onOpenBlockActions(blockID, btn);
        });

        lastAttr.appendChild(btn);
    } else {
        existingPill.setAttribute("data-block-id", blockID);
        existingPill.setAttribute("aria-label", tooltipText);
        existingPill.setAttribute("title", tooltipText);
        const wasCard = existingPill.classList.contains("lv-card-badge-pill--card");
        const prevKind = existingPill.getAttribute("data-block-kind");
        // ▾ 展开区是否存在需与回调可用性保持一致（首次渲染时回调可能尚未就绪）
        const wantsMore = Boolean(onOpenBlockActions);
        const hasMore = Boolean((existingPill as any).__lvHasMore ?? existingPill.querySelector(".lv-card-badge-pill__more"));
        if (wasCard !== isCard || wantsMore !== hasMore || prevKind !== blockKind) {
            // 同样不得复用旧类名 lv-cards-attr-edit-btn（会被 display:none !important 隐藏）
            existingPill.className = `b3-tooltips b3-tooltips__w lv-card-badge-pill ${isCard ? 'lv-card-badge-pill--card' : 'lv-card-badge-pill--ordinary'}`;
            existingPill.setAttribute("data-lv-card-attr-btn", "1");
            existingPill.setAttribute("data-block-kind", blockKind);
            renderPillContent(existingPill, isCard, wantsMore, blockKind);
            (existingPill as any).__lvHasMore = wantsMore;
        }
        (existingPill as any).__lvOpenBlockActions = onOpenBlockActions;
    }
    return true;
}

/**
 * 渲染胶囊内部结构。
 *
 * 现代一体化 Capsule 设计：整颗胶囊整体可点，直接呼出下拉菜单。
 * 形态 A（无 ▾）：纯编辑按钮，向后兼容。
 * 形态 B（有 ▾）：主体（图标 + 自适应块文案/卡片序号）+ ▾ 指示标，
 *   整颗胶囊单击 = 展开块操作中心下拉菜单；双击 / Alt+Q = 直达问答工作台。
 */
function renderPillContent(
    pill: HTMLElement,
    isCard: boolean,
    withMore: boolean,
    blockKind: SiYuanBlockKind = "paragraph",
): void {
    const kindMeta = BLOCK_KIND_LABELS[blockKind] || BLOCK_KIND_LABELS.paragraph;

    // 用 DOM API 构建：语义字形（如代码块的 </>）含 HTML 敏感字符，
    // innerHTML 注入会被解析器当作结束标签丢弃（2026-11-17 走查实机根因）。
    const icon = document.createElement("span");
    icon.className = "lv-card-badge-pill__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = isCard ? "✦" : kindMeta.glyph;
    pill.appendChild(icon);

    if (isCard) {
        const seq = document.createElement("span");
        seq.className = "lv-card-badge-pill__seq";
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

    if (!withMore) return;

    // 现代一体化胶囊：整颗胶囊一体化可点，末端附带精致的 ▾ 展开标记
    const divider = document.createElement("span");
    divider.className = "lv-card-badge-pill__divider";
    divider.setAttribute("aria-hidden", "true");
    const more = document.createElement("span");
    more.className = "lv-card-badge-pill__more";
    more.setAttribute("role", "button");
    more.setAttribute("tabindex", "0");
    more.setAttribute("aria-label", "展开块操作中心");
    more.setAttribute("title", "展开块操作中心");
    more.textContent = "▾";
    pill.appendChild(divider);
    pill.appendChild(more);
}

/**
 * 启动编辑器属性问答卡实时监听与装饰服务
 */
export function startEditorQaService(options: EditorQaServiceOptions): EditorQaServiceInstance {
    let disposed = false;
    let scanTimer: any = null;

    const scan = (root: HTMLElement | Document = document) => {
        if (disposed) return;
        // 优先限定在活动的 wysiwyg 编辑器内，减少全文档扫描开销
        const selector = '.protyle-wysiwyg [custom-riff-decks], .protyle-wysiwyg [custom-riff-title], [custom-riff-decks], [custom-riff-title]';
        const blocks = root.querySelectorAll?.(selector) ?? [];
        blocks.forEach((el) => {
            if (el instanceof HTMLElement) {
                if (decorateEditorBlock(el, options.onEditQuestion, options.onOpenBlockActions)) {
                    el.setAttribute("data-lv-decorated", "true");
                }
            }
        });
    };

    const scheduleScan = () => {
        if (disposed || scanTimer) return;
        // 采用 requestAnimationFrame 或轻微延时合并宏任务，避免快速打字期间阻塞渲染
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
            scanTimer = window.requestAnimationFrame(() => {
                scanTimer = null;
                scan(document);
            });
        } else {
            scanTimer = setTimeout(() => {
                scanTimer = null;
                scan(document);
            }, 80);
        }
    };

    // 1. 监听 DOM 树变化与闪卡属性变更（严格排除自身装饰引发的连锁触发）
    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
        observer = new MutationObserver((mutations) => {
            let shouldScan = false;
            for (const m of mutations) {
                // 打字极速早退路径：无新增节点或正在正文编辑区（含行内加粗/链接/高亮等容器）输入普通文字时，零开销跳过
                if (m.type === "childList") {
                    if (m.addedNodes.length === 0) continue;
                    const isEditable = m.target instanceof Element && (m.target.getAttribute("contenteditable") === "true" || Boolean(m.target.closest('[contenteditable="true"]')));
                    if (isEditable) {
                        let hasCardCandidate = false;
                        for (let i = 0; i < m.addedNodes.length; i++) {
                            const n = m.addedNodes[i];
                            if (n instanceof Element && (n.hasAttribute("data-node-id") || n.hasAttribute("custom-riff-decks") || n.hasAttribute("custom-riff-title"))) {
                                hasCardCandidate = true;
                                break;
                            }
                        }
                        if (!hasCardCandidate) continue;
                    }
                }

                // 忽略自身按钮注入或属性栏内部操作
                if (m.target instanceof Element) {
                    if (m.target.classList.contains("lv-card-badge-pill") || m.target.closest(".lv-card-badge-pill, [data-lv-card-attr-btn], .ft-editor-edit-btn")) {
                        continue;
                    }
                }
                if (m.type === "childList") {
                    for (let i = 0; i < m.addedNodes.length; i++) {
                        const node = m.addedNodes[i];
                        if (node instanceof Element) {
                            if (node.classList.contains("lv-card-badge-pill") || node.hasAttribute("data-lv-card-attr-btn") || node.classList.contains("ft-editor-edit-btn")) {
                                continue;
                            }
                            // 仅当新增节点是卡片或包含卡片子节点时触发扫描
                            if (
                                node.hasAttribute("custom-riff-decks") ||
                                node.hasAttribute("custom-riff-title") ||
                                (node.querySelector && node.querySelector("[custom-riff-decks], [custom-riff-title]"))
                            ) {
                                shouldScan = true;
                                break;
                            }
                        }
                    }
                } else if (m.type === "attributes") {
                    const attr = m.attributeName;
                    if (attr === "custom-riff-decks" || attr === "custom-riff-title" || attr === "custom-lv-question") {
                        shouldScan = true;
                        break;
                    }
                }
                if (shouldScan) break;
            }
            if (shouldScan) {
                scheduleScan();
            }
        });

        try {
            observer.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["custom-riff-decks", "custom-riff-title", "custom-lv-question"],
            });
        } catch {
            /* ignore */
        }
    }

    // 2. 外部闪卡工具箱事件兼容监听 (flashcard-title-edit)
    const onTitleEditEvent = (e: Event) => {
        const detail = (e as CustomEvent)?.detail;
        const blockId = detail?.blockId || detail?.id;
        if (blockId && typeof blockId === "string") {
            options.onEditQuestion(blockId);
        }
    };
    if (typeof document !== "undefined") {
        document.addEventListener("flashcard-title-edit", onTitleEditEvent);
    }

    // 3. 鼠标悬浮普通块时即时懒加载装饰（同块瞬态缓存 + 零主线程开销）
    // 仅在装饰真正成功后才打 data-lv-decorated 标记：属性栏尚未渲染时保持可重试。
    let lastHoveredBlock: HTMLElement | null = null;
    let hasPrefetched = false;

    const onWysiwygMouseOver = (e: MouseEvent) => {
        if (disposed) return;
        const target = (e.target as HTMLElement)?.closest?.(".protyle-wysiwyg [data-node-id]") as HTMLElement | null;
        // 性能护栏：同块内细小鼠标移动 0 耗时即刻跳过，绝不重复遍历 DOM
        if (!target || target === lastHoveredBlock) {
            return;
        }
        lastHoveredBlock = target;

        // 排除文档标题（.protyle-title，无 .protyle-attr）
        if (target.classList.contains("protyle-title") || target.querySelector(":scope > .protyle-title__input")) {
            return;
        }

        // 智能预热：首次掠过编辑器块时，在浏览器 requestIdleCallback 空闲时间静默预热资源
        if (!hasPrefetched && options.onPrefetch) {
            hasPrefetched = true;
            if (typeof window !== "undefined" && "requestIdleCallback" in window) {
                (window as any).requestIdleCallback(() => options.onPrefetch?.(), { timeout: 2000 });
            } else {
                setTimeout(() => options.onPrefetch?.(), 100);
            }
        }

        // 装饰判据：标记缺失【或】胶囊已被思源局部重渲染清空时均重新装饰。
        if (!target.hasAttribute("data-lv-decorated") || !isBlockDecorated(target)) {
            if (decorateEditorBlock(target, options.onEditQuestion, options.onOpenBlockActions)) {
                target.setAttribute("data-lv-decorated", "true");
            }
        }
    };
    if (typeof document !== "undefined") {
        document.addEventListener("mouseover", onWysiwygMouseOver, { passive: true });
    }

    // 4. 触屏交互与移动端精准显隐：
    //    手机端要在选中块时，当前块的块助手才出现，否则都是隐藏状态。
    //    通过 touchstart + focusin + selectionchange 实时跟踪活动块，
    //    实现「选中即现、移开即隐、零多余胶囊覆盖」的极简体验。
    let lastTouchedBlock: HTMLElement | null = null;
    const onWysiwygTouchStart = (e: Event) => {
        if (disposed) return;
        const target = (e.target as HTMLElement)?.closest?.(".protyle-wysiwyg [data-node-id]") as HTMLElement | null;
        if (!target) {
            // 点击空白区域（非操作菜单/弹窗）：清除移动端块选中激活态
            const insideMenu = (e.target as HTMLElement)?.closest?.(".lv-bam, .b3-dialog, .b3-menu");
            if (!insideMenu) {
                setActiveSelectedBlock(null);
            }
            return;
        }
        if (target.classList.contains("protyle-title")) return;

        if (target !== lastTouchedBlock) {
            lastTouchedBlock = target;
        }

        if (!target.hasAttribute("data-lv-decorated") || !isBlockDecorated(target)) {
            if (decorateEditorBlock(target, options.onEditQuestion, options.onOpenBlockActions)) {
                target.setAttribute("data-lv-decorated", "true");
            }
        }
        setActiveSelectedBlock(target);
    };

    const onWysiwygFocusIn = (e: FocusEvent) => {
        if (disposed) return;
        const block = (e.target as HTMLElement)?.closest?.(".protyle-wysiwyg [data-node-id]") as HTMLElement | null;
        if (block && !block.classList.contains("protyle-title")) {
            if (!block.hasAttribute("data-lv-decorated") || !isBlockDecorated(block)) {
                if (decorateEditorBlock(block, options.onEditQuestion, options.onOpenBlockActions)) {
                    block.setAttribute("data-lv-decorated", "true");
                }
            }
            setActiveSelectedBlock(block);
        }
    };

    const onSelectionChange = () => {
        if (disposed) return;
        const sel = document.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const anchor = sel.anchorNode;
        const anchorEl = anchor instanceof HTMLElement ? anchor : anchor?.parentElement;
        const block = anchorEl?.closest?.(".protyle-wysiwyg [data-node-id]") as HTMLElement | null;
        if (block && !block.classList.contains("protyle-title")) {
            if (!block.hasAttribute("data-lv-decorated") || !isBlockDecorated(block)) {
                if (decorateEditorBlock(block, options.onEditQuestion, options.onOpenBlockActions)) {
                    block.setAttribute("data-lv-decorated", "true");
                }
            }
            setActiveSelectedBlock(block);
        }
    };

    if (typeof document !== "undefined") {
        if ("ontouchstart" in window) {
            document.addEventListener("touchstart", onWysiwygTouchStart, { passive: true });
        }
        document.addEventListener("focusin", onWysiwygFocusIn, { passive: true });
        document.addEventListener("selectionchange", onSelectionChange, { passive: true });
    }

    // 初次扫描
    scheduleScan();

    return {
        scan,
        dispose: () => {
            disposed = true;
            if (scanTimer) {
                if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
                    window.cancelAnimationFrame(scanTimer);
                } else {
                    clearTimeout(scanTimer);
                }
                scanTimer = null;
            }
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            if (typeof document !== "undefined") {
                document.removeEventListener("flashcard-title-edit", onTitleEditEvent);
                document.removeEventListener("mouseover", onWysiwygMouseOver);
                if ("ontouchstart" in window) {
                    document.removeEventListener("touchstart", onWysiwygTouchStart);
                }
                document.removeEventListener("focusin", onWysiwygFocusIn);
                document.removeEventListener("selectionchange", onSelectionChange);
                setActiveSelectedBlock(null);
                // 干净清理所有注入的按钮与数据属性
                document.querySelectorAll(".lv-card-badge-pill, .lv-cards-attr-edit-btn").forEach((el) => el.remove());
                document.querySelectorAll("[data-custom-title]").forEach((el) => el.removeAttribute("data-custom-title"));
                document.querySelectorAll("[data-lv-decorated]").forEach((el) => el.removeAttribute("data-lv-decorated"));
                document.querySelectorAll("[data-lv-selected]").forEach((el) => el.removeAttribute("data-lv-selected"));
                document.querySelectorAll("[data-lv-bam-active]").forEach((el) => el.removeAttribute("data-lv-bam-active"));
            }
        },
    };
}
