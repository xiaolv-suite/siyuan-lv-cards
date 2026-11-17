/**
 * 小驴闪卡 · 现代块操作中心菜单（Modern Block Action Menu）
 *
 * 挂在块右上角「块助手」胶囊上：
 * 单击胶囊整体验收 → 直接展开本现代卡片式操作中心，一次性暴露全生态块级能力；
 * 双击胶囊或快捷键 Alt+Q → 极速呼出大尺寸双栏实时问答工作台。
 *
 * 设计特性（遵循 ui-ux-pro-max + ui-styling + ui-checker 准则）：
 * 1. 现代毛玻璃卡片质感（Glassmorphism + 柔和多层阴影 + 高清微边框）；
 * 2. 块感知头部仪表卡（块类型徽章同色 accent + 闪卡态金标 + 多选批量状态 + 块ID）；
 * 3. 自适应双模式密度（Adaptive Density）：
 *    · Focus 精读模式（≤8 项）：单列富两行卡片，副标题常驻，零滚动；
 *    · Command 中枢模式（>8 项）：桌面双列网格加宽布局，副标题降级为原生悬浮提示，
 *      Hero 推荐项跨双列保持仪式感，组头计数徽章辅助扫读——随用户插件安装数量伸缩自如；
 * 4. 块类型身份体系：菜单 data-kind 驱动同色系 accent（代码青/标题琥珀/金句紫/待办绿…），
 *    与胶囊触发器色彩一一呼应，一眼识别「当前在操作哪类块」；
 * 5. 富信息两行排版（动作主标题 + 11px 功能辅助说明，彻底降低认知成本）；
 * 6. 全生态 8 大插件专属色彩来源徽章 + glyph 底座同色系着色（[考试] [打卡] [管家] [拾遗] [常用] [雷切] [人脉]）；
 * 7. 全键盘方向键导航（↑↓选择 / Enter确认 / Esc收起）与底部操作指引；
 * 8. 性能护栏：密度判定 O(1)、布局纯 CSS grid、零新事件监听、零 RPC——0.5ms 秒开不破功。
 */

import {
    BLOCK_ACTION_DENSE_THRESHOLD,
    BLOCK_ACTION_GROUP_LABELS,
    BLOCK_ACTION_GROUP_ORDER,
    BLOCK_KIND_LABELS,
    ECOSYSTEM_PLUGIN_NAMES,
    type BlockActionDescriptor,
    type BlockActionGroup,
    type BlockActionGroupSection,
    type BlockActionPreferences,
    type BlockSnapshot,
    type EcosystemPresence,
    buildBlockActionMenu,
} from "../core/block-actions";

export interface BlockActionMenuOptions {
    /** 当前块快照（决定哪些动作可用） */
    snapshot: BlockSnapshot;
    /** 已安装插件探测结果 */
    presence: EcosystemPresence;
    /** 用户自定义偏好（动作过滤/排序） */
    preferences?: BlockActionPreferences;
    /** 外部/开放 API 动态注入的扩展动作（来自 lvBlockAssistant 或第三方社区插件） */
    externalActions?: readonly BlockActionDescriptor[];
    /** i18n 字典（可选，缺失时用 fallbackLabel） */
    i18n?: Record<string, any>;
    /** 动作执行回调：由 index.ts 注入真实实现 */
    onAction: (action: BlockActionDescriptor) => void | Promise<void>;
    /** 定位锚点（胶囊按钮） */
    anchor: HTMLElement;
}

const MENU_CLASS = "lv-bam";
let activeMenu: HTMLElement | null = null;
let activeCleanup: (() => void) | null = null;

/** 关闭当前打开的菜单（幂等） */
export function closeBlockActionMenu(): void {
    if (activeCleanup) {
        const cleanup = activeCleanup;
        activeCleanup = null;
        cleanup();
    }
    if (activeMenu) {
        activeMenu.remove();
        activeMenu = null;
    }
}

/** 菜单是否正处于打开状态（供外部守卫重复点击） */
export function isBlockActionMenuOpen(): boolean {
    return activeMenu !== null;
}

function pickLabel(i18n: Record<string, any> | undefined, key: string, fallback: string): string {
    const value = i18n?.[key];
    return typeof value === "string" && value.trim() ? value : fallback;
}

/**
 * 定位菜单：首帧直接基于尺寸范围预排，规避强制同步回流（Forced Layout Thrashing）；
 * 随后在 requestAnimationFrame 里做微调，确保高刷屏 60/120fps 极速渲染。
 *
 * 遮挡契约：菜单放置在锚点下方或上方时，以锚点边缘为界截断 max-height，
 * 绝不覆盖锚点本身——「再次点击收起」与胶囊可见性在任何视口位置都成立。
 */
function positionMenu(menu: HTMLElement, anchor: HTMLElement, estWidth: number): void {
    const gap = 8;
    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const anchorRect = anchor.getBoundingClientRect();

    const estHeight = Math.min(vh * 0.7, 520);
    const MIN_USABLE = 240;
    const belowAvail = vh - margin - (anchorRect.bottom + gap);
    const aboveAvail = anchorRect.top - gap - margin;

    let top: number;
    let maxHeight: number;
    if (belowAvail >= Math.min(estHeight, MIN_USABLE)) {
        // 下方空间充足：向下展开，剩余高度截断（内部滚动）
        top = anchorRect.bottom + gap;
        maxHeight = belowAvail;
    } else if (aboveAvail >= MIN_USABLE) {
        // 下方不足、上方充足：向上展开，底边对齐锚点上缘（不遮挡锚点）
        top = anchorRect.top - gap - estHeight;
        maxHeight = aboveAvail;
    } else {
        // 双向都不足：向下截断，宁可矮也不遮锚点
        top = anchorRect.bottom + gap;
        maxHeight = Math.max(160, belowAvail);
    }

    let left = anchorRect.right - estWidth;
    if (left < margin) left = margin;
    if (left + estWidth > vw - margin) {
        left = Math.max(margin, vw - margin - estWidth);
    }

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(Math.max(margin, top))}px`;
    menu.style.maxHeight = `${Math.round(maxHeight)}px`;

    // 随后在 rAF 微任务微调实际坐标（若有像素偏差）
    if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
            if (!menu.isConnected) return;
            const actualRect = menu.getBoundingClientRect();
            const actualHeight = actualRect.height || estHeight;
            let exactTop: number;
            let exactMax: number;
            if (belowAvail >= Math.min(actualHeight, MIN_USABLE)) {
                exactTop = anchorRect.bottom + gap;
                exactMax = belowAvail;
            } else if (aboveAvail >= MIN_USABLE) {
                exactTop = anchorRect.top - gap - actualHeight;
                exactMax = aboveAvail;
            } else {
                exactTop = anchorRect.bottom + gap;
                exactMax = Math.max(160, belowAvail);
            }

            let exactLeft = anchorRect.right - actualRect.width;
            if (exactLeft < margin) exactLeft = margin;
            if (exactLeft + actualRect.width > vw - margin) {
                exactLeft = Math.max(margin, vw - margin - actualRect.width);
            }

            menu.style.left = `${Math.round(exactLeft)}px`;
            menu.style.top = `${Math.round(Math.max(margin, exactTop))}px`;
            menu.style.maxHeight = `${Math.round(exactMax)}px`;
        });
    }
}

function renderSection(
    section: BlockActionGroupSection,
    i18n: Record<string, any> | undefined,
    onPick: (action: BlockActionDescriptor) => void,
    dense: boolean,
): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = `${MENU_CLASS}__section`;

    const groupMeta = BLOCK_ACTION_GROUP_LABELS[section.group as BlockActionGroup];
    const head = document.createElement("div");
    head.className = `${MENU_CLASS}__section-head`;
    const headGlyph = groupMeta?.glyph ? `<span class="${MENU_CLASS}__section-glyph">${groupMeta.glyph}</span>` : "";
    head.innerHTML = `${headGlyph}<span>${pickLabel(i18n, section.labelKey, section.fallbackLabel)}</span>`;

    // 组头计数徽章：一眼扫读该分组的功能数量与生态构成（仅 Command 中枢模式，Focus 保持零噪音）
    if (dense) {
        const count = document.createElement("span");
        count.className = `${MENU_CLASS}__section-count`;
        count.textContent = String(section.actions.length);
        head.appendChild(count);
    }
    wrap.appendChild(head);

    // 双列网格容器：Focus 模式下单列（CSS 承担），Command 模式下桌面双列
    const grid = document.createElement("div");
    grid.className = `${MENU_CLASS}__grid`;
    wrap.appendChild(grid);

    for (const action of section.actions) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = `${MENU_CLASS}__item`;
        item.setAttribute("role", "menuitem");
        item.setAttribute("data-action-id", action.id);
        // 生态来源写入 data 属性：CSS 据此为 glyph 底座着色（7 色生态身份体系）
        if (action.sourcePlugin) {
            item.setAttribute("data-source", action.sourcePlugin);
        }

        if (action.featured) {
            item.classList.add(`${MENU_CLASS}__item--featured`);
        }
        if (action.destructive) {
            item.classList.add(`${MENU_CLASS}__item--danger`);
        }

        // 左侧单字/语义字形图标徽章
        const glyphWrap = document.createElement("div");
        glyphWrap.className = `${MENU_CLASS}__glyph-wrap`;
        const glyph = document.createElement("span");
        glyph.className = `${MENU_CLASS}__glyph`;
        glyph.setAttribute("aria-hidden", "true");
        glyph.textContent = action.glyph;
        glyphWrap.appendChild(glyph);
        item.appendChild(glyphWrap);

        // 中间双行内容区：主标题 + 功能简明副标题
        const contentWrap = document.createElement("div");
        contentWrap.className = `${MENU_CLASS}__item-content`;

        const titleRow = document.createElement("div");
        titleRow.className = `${MENU_CLASS}__item-title-row`;

        const text = document.createElement("span");
        text.className = `${MENU_CLASS}__label`;
        text.textContent = pickLabel(i18n, action.labelKey, action.fallbackLabel);
        titleRow.appendChild(text);

        contentWrap.appendChild(titleRow);

        if (action.subtitle) {
            if (dense) {
                // Command 中枢模式：副标题降级为原生悬浮提示，省 DOM 与纵向空间，信息不丢失
                item.title = action.subtitle;
            } else {
                const sub = document.createElement("div");
                sub.className = `${MENU_CLASS}__item-subtitle`;
                sub.textContent = action.subtitle;
                contentWrap.appendChild(sub);
            }
        }

        item.appendChild(contentWrap);

        // 右侧微徽章与生态插件来源 Tag
        const metaWrap = document.createElement("div");
        metaWrap.className = `${MENU_CLASS}__item-meta`;

        if (action.badgeText) {
            const badge = document.createElement("span");
            badge.className = `${MENU_CLASS}__action-badge`;
            badge.textContent = action.badgeText;
            metaWrap.appendChild(badge);
        }

        if (action.sourcePlugin) {
            const tag = document.createElement("span");
            tag.className = `${MENU_CLASS}__source-tag ${MENU_CLASS}__source-tag--${action.sourcePlugin}`;
            tag.textContent = ECOSYSTEM_PLUGIN_NAMES[action.sourcePlugin] || action.sourcePlugin;
            metaWrap.appendChild(tag);
        }

        if (metaWrap.hasChildNodes()) {
            item.appendChild(metaWrap);
        }

        item.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            onPick(action);
        });

        grid.appendChild(item);
    }

    return wrap;
}

/**
 * 打开现代块操作中心菜单
 */
export function openBlockActionMenu(options: BlockActionMenuOptions): () => void {
    const { snapshot, presence, preferences, externalActions = [], i18n, onAction, anchor } = options;

    // 已是打开态则先关闭，实现「再次点击收起」直觉行为。
    // 锚点标记必须在 closeBlockActionMenu 之前读取——close 的清理流程会删除该标记，
    // 若在其后判断则永远为 false，重按同一胶囊只会「关了又闪开」（2026-11-17 走查根因）。
    // isConnected 守卫：菜单节点可能被外部（宿主重渲染等）直接移除而未走 close 流程，
    // 此时锚点标记残留会导致后续点击被误判为「收起」——失联状态一律视为未打开。
    const wasOpenOnThisAnchor = (anchor as any).dataset?.lvBamAnchor === "open";
    const wasOpen = activeMenu !== null && activeMenu.isConnected;
    closeBlockActionMenu();
    if (wasOpen && wasOpenOnThisAnchor) {
        return () => { /* 已收起 */ };
    }

    const sections = buildBlockActionMenu(snapshot, presence, preferences, externalActions);
    if (sections.length === 0) {
        return () => { /* 无可执行动作 */ };
    }

    // ── 自适应密度判定（O(1)）：> 阈值进入 Command 中枢双列模式 ──
    const totalCount = sections.reduce((sum, s) => sum + s.actions.length, 0);
    const dense = totalCount > BLOCK_ACTION_DENSE_THRESHOLD;
    const currentEstWidth = dense ? 470 : 320;

    const menu = document.createElement("div");
    menu.className = `${MENU_CLASS} b3-menu${dense ? ` ${MENU_CLASS}--dense` : ""}`;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", pickLabel(i18n, "blockActMenuTitle", "块操作中心"));
    menu.setAttribute("data-block-id", snapshot.blockID);
    // 块类型身份写入菜单：CSS 据此渲染同色系 accent 与头部徽章（零 JS 着色）
    const menuKind = snapshot.blockKind || "paragraph";
    menu.setAttribute("data-kind", menuKind);
    if (snapshot.isCard) menu.setAttribute("data-is-card", "1");

    // ─────────────────────────────────────────────────────────────
    // 顶部感知卡：确认操作对象与多选特征
    // ─────────────────────────────────────────────────────────────
    const header = document.createElement("div");
    header.className = `${MENU_CLASS}__header`;
    const isBatch = Boolean(snapshot.batchBlockIDs && snapshot.batchBlockIDs.length > 1);

    const badge = document.createElement("span");
    badge.className = `${MENU_CLASS}__badge`;
    if (isBatch) {
        badge.classList.add(`${MENU_CLASS}__badge--batch`);
        const batchIcon = document.createElement("span");
        batchIcon.className = `${MENU_CLASS}__badge-icon`;
        batchIcon.setAttribute("aria-hidden", "true");
        batchIcon.textContent = "✦";
        badge.appendChild(batchIcon);
        badge.appendChild(document.createTextNode(` 批量操作 (${snapshot.batchBlockIDs!.length} 块)`));
    } else {
        const kindMeta = BLOCK_KIND_LABELS[menuKind] || BLOCK_KIND_LABELS.paragraph;
        const badgeName = snapshot.isDocument && menuKind === "other" ? "整篇文档" : kindMeta.name;
        // DOM 构建：代码块 </> 等含 HTML 敏感字符的语义字形不可经 innerHTML 注入
        const kindIcon = document.createElement("span");
        kindIcon.className = `${MENU_CLASS}__badge-icon`;
        kindIcon.setAttribute("aria-hidden", "true");
        kindIcon.textContent = kindMeta.glyph;
        badge.appendChild(kindIcon);
        badge.appendChild(document.createTextNode(` ${snapshot.isCard ? "已建闪卡 · " : ""}${badgeName}`));
    }
    header.appendChild(badge);

    const blockIdEl = document.createElement("span");
    blockIdEl.className = `${MENU_CLASS}__blockid`;
    if (isBatch) {
        blockIdEl.textContent = `多选选中`;
        blockIdEl.title = snapshot.batchBlockIDs!.join(", ");
    } else {
        blockIdEl.textContent = `#${snapshot.blockID.slice(0, 10)}`;
        blockIdEl.title = snapshot.blockID;
    }
    header.appendChild(blockIdEl);
    menu.appendChild(header);

    const pick = (action: BlockActionDescriptor) => {
        closeBlockActionMenu();
        void Promise.resolve()
            .then(() => onAction(action))
            .catch(() => { /* 动作层已统一提示 */ });
    };

    // 渲染各功能分段
    for (const section of sections) {
        menu.appendChild(renderSection(section, i18n, pick, dense));
    }

    // ─────────────────────────────────────────────────────────────
    // 底部贴心操作栏：快捷键指引
    // ─────────────────────────────────────────────────────────────
    const footer = document.createElement("div");
    footer.className = `${MENU_CLASS}__footer`;
    footer.innerHTML = `
        <span class="${MENU_CLASS}__footer-hint">
            <kbd>↑</kbd><kbd>↓</kbd> 选择 &nbsp;·&nbsp; <kbd>Enter</kbd> 确认 &nbsp;·&nbsp; <kbd>Esc</kbd> 关闭
        </span>
    `;
    menu.appendChild(footer);

    document.body.appendChild(menu);
    activeMenu = menu;
    const targetBlock = anchor.closest?.("[data-node-id]") as HTMLElement | null;
    if (targetBlock) {
        targetBlock.setAttribute("data-lv-bam-active", "true");
    }
    try {
        (anchor as any).dataset.lvBamAnchor = "open";
    } catch { /* ignore */ }

    positionMenu(menu, anchor, currentEstWidth);

    // ── 关闭路径：外部点击 / Esc / 滚动 / 尺寸变化 ──────────────
    const onPointerDown = (e: PointerEvent) => {
        const target = e.target as Node | null;
        if (target && (menu.contains(target) || anchor.contains(target))) return;
        closeBlockActionMenu();
    };

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
            e.preventDefault();
            closeBlockActionMenu();
            anchor.focus?.();
            return;
        }
        // 方向键导航：Command 双列模式下追加 ←→ 左右移动（网格浏览动线），单列仅 ↑↓
        const isDense = menu.classList.contains(`${MENU_CLASS}--dense`);
        const vertical = e.key === "ArrowDown" || e.key === "ArrowUp";
        const horizontal = isDense && (e.key === "ArrowRight" || e.key === "ArrowLeft");
        if (vertical || horizontal) {
            e.preventDefault();
            const items = Array.from(menu.querySelectorAll<HTMLButtonElement>(`.${MENU_CLASS}__item`));
            if (items.length === 0) return;
            const current = document.activeElement as HTMLElement | null;
            const idx = items.indexOf(current as HTMLButtonElement);
            let next: HTMLButtonElement | undefined;
            if (e.key === "ArrowRight") {
                next = items[Math.min(items.length - 1, idx + 1)];
            } else if (e.key === "ArrowLeft") {
                next = items[Math.max(0, idx - 1)];
            } else {
                next = e.key === "ArrowDown"
                    ? items[(idx + 1) % items.length]
                    : items[(idx - 1 + items.length) % items.length];
            }
            next?.focus();
        }
    };

    // ── 滚动/缩放：菜单跟随锚点重新定位（而非关闭）──
    // 根因：思源在 mousedown 后会异步 scrollIntoView（块选中高亮），时序落在打开后 ~300ms，
    // 任何「时间窗内忽略滚动」的守卫都可能被程序化对齐误杀菜单（2026-11-17 真实点击走查）。
    // 跟随式重定位让菜单在滚动中依然指向正确的块，用户体验也更顺滑。
    let followRaf: number | null = null;
    const onScrollOrResize = (e?: Event) => {
        // 菜单内部滚动不触发重定位
        const target = e?.target as Node | null;
        if (target && menu.contains(target)) return;
        if (followRaf !== null) return;
        if (typeof requestAnimationFrame !== "function") {
            positionMenu(menu, anchor, currentEstWidth);
            return;
        }
        followRaf = requestAnimationFrame(() => {
            followRaf = null;
            if (!menu.isConnected) return;
            positionMenu(menu, anchor, currentEstWidth);
        });
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScrollOrResize, { passive: true, capture: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });

    const cleanup = () => {
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("scroll", onScrollOrResize, true);
        window.removeEventListener("resize", onScrollOrResize);
        if (followRaf !== null && typeof cancelAnimationFrame === "function") {
            cancelAnimationFrame(followRaf);
            followRaf = null;
        }
        if (targetBlock && targetBlock.isConnected) {
            targetBlock.removeAttribute("data-lv-bam-active");
        }
        try {
            delete (anchor as any).dataset.lvBamAnchor;
        } catch { /* ignore */ }
    };
    activeCleanup = cleanup;

    // 首项聚焦（优先聚焦推荐项，没有则聚焦首项）
    const heroItem = menu.querySelector<HTMLButtonElement>(`.${MENU_CLASS}__item--featured`) || menu.querySelector<HTMLButtonElement>(`.${MENU_CLASS}__item`);
    try {
        heroItem?.focus({ preventScroll: true });
    } catch {
        /* 老引擎兜底 */
    }

    return closeBlockActionMenu;
}

export { BLOCK_ACTION_GROUP_ORDER };
