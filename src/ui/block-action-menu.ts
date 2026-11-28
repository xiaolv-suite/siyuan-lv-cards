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
import { lvSurfaceStack } from "@/libs/notice";

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
    let isAbove = false;
    if (belowAvail >= Math.min(estHeight, MIN_USABLE)) {
        // 下方空间充足：向下展开，剩余高度截断（内部滚动）
        top = anchorRect.bottom + gap;
        maxHeight = belowAvail;
    } else if (aboveAvail >= MIN_USABLE) {
        // 下方不足、上方充足：向上展开，底边对齐锚点上缘（不遮挡锚点）
        top = anchorRect.top - gap - estHeight;
        maxHeight = aboveAvail;
        isAbove = true;
    } else if (aboveAvail > belowAvail) {
        // 双向虽皆紧凑，但上方空间明显更大：智能向上展开，最大化可用可视区
        maxHeight = Math.max(120, aboveAvail);
        top = anchorRect.top - gap - maxHeight;
        isAbove = true;
    } else {
        // 下方空间更大或持平：向下展开，严格以可用边界截断
        top = anchorRect.bottom + gap;
        maxHeight = Math.max(120, belowAvail);
    }
    if (isAbove) {
        menu.classList.add(`${MENU_CLASS}--above`);
    } else {
        menu.classList.remove(`${MENU_CLASS}--above`);
    }

    let left = anchorRect.right - estWidth;
    if (left < margin) left = margin;
    if (left + estWidth > vw - margin) {
        left = Math.max(margin, vw - margin - estWidth);
    }

    const clampedEstHeight = Math.min(estHeight, maxHeight);
    const maxAllowedTop = Math.max(margin, vh - margin - clampedEstHeight);
    const clampedTop = Math.min(Math.max(margin, top), maxAllowedTop);

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(clampedTop)}px`;
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
            } else if (aboveAvail > belowAvail) {
                exactMax = Math.max(120, aboveAvail);
                exactTop = anchorRect.top - gap - Math.min(actualHeight, exactMax);
            } else {
                exactTop = anchorRect.bottom + gap;
                exactMax = Math.max(120, belowAvail);
            }

            let exactLeft = anchorRect.right - actualRect.width;
            if (exactLeft < margin) exactLeft = margin;
            if (exactLeft + actualRect.width > vw - margin) {
                exactLeft = Math.max(margin, vw - margin - actualRect.width);
            }

            const clampedActualHeight = Math.min(actualHeight, exactMax);
            const maxExactTop = Math.max(margin, vh - margin - clampedActualHeight);
            const clampedExactTop = Math.min(Math.max(margin, exactTop), maxExactTop);

            menu.style.left = `${Math.round(exactLeft)}px`;
            menu.style.top = `${Math.round(clampedExactTop)}px`;
            menu.style.maxHeight = `${Math.round(exactMax)}px`;
        });
    }
}

function isDangerAction(action: BlockActionDescriptor): boolean {
    return Boolean(action.destructive || (action as any).danger || action.id === "delete-block" || action.id === "cut-block");
}

function bindSafeTap(el: HTMLElement, onTap: () => void): void {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchMoved = false;
    let touchPicked = false;
    el.addEventListener("touchstart", (e) => {
        const t = e.touches?.[0];
        touchStartX = t ? t.clientX : 0;
        touchStartY = t ? t.clientY : 0;
        touchMoved = false;
    }, { passive: true });
    el.addEventListener("touchmove", (e) => {
        const t = e.touches?.[0];
        if (!t) return;
        if (Math.abs(t.clientX - touchStartX) > 8 || Math.abs(t.clientY - touchStartY) > 8) {
            touchMoved = true;
        }
    }, { passive: true });
    el.addEventListener("touchend", (e) => {
        if (touchMoved) {
            setTimeout(() => { touchMoved = false; }, 450);
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        touchPicked = true;
        setTimeout(() => { touchPicked = false; }, 450);
        onTap();
    }, { passive: false });
    el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (touchPicked || touchMoved) return;
        onTap();
    });
}

function renderSection(
    section: BlockActionGroupSection,
    i18n: Record<string, any> | undefined,
    onPick: (action: BlockActionDescriptor) => void,
    dense: boolean,
    snapshot?: BlockSnapshot,
    isDangerSection = false,
): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = isDangerSection ? `${MENU_CLASS}__section ${MENU_CLASS}__section--danger` : `${MENU_CLASS}__section`;

    const groupMeta = isDangerSection ? undefined : BLOCK_ACTION_GROUP_LABELS[section.group as BlockActionGroup];
    const head = document.createElement("div");
    head.className = isDangerSection ? `${MENU_CLASS}__section-head ${MENU_CLASS}__section-head--danger` : `${MENU_CLASS}__section-head`;
    const glyphChar = isDangerSection ? "⚠️" : groupMeta?.glyph;
    const headGlyph = glyphChar ? `<span class="${MENU_CLASS}__section-glyph">${glyphChar}</span>` : "";
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
        if (isDangerAction(action)) {
            item.classList.add(`${MENU_CLASS}__item--danger`);
            item.setAttribute("data-danger", "true");
        }

        // 动态自适应动作文案（如折叠状态）
        let actionLabel = pickLabel(i18n, action.labelKey, action.fallbackLabel);
        let actionSubtitle = action.subtitle;
        let actionGlyph = action.glyph;

        if ((action.id === "toggle-fold-block" || action.id === "toggle-block-fold") && snapshot) {
            if (snapshot.isFolded) {
                actionLabel = "展开子分支";
                actionSubtitle = "展开该块下属的大纲与全部子节点";
                actionGlyph = "📂";
            } else {
                actionLabel = "折叠子分支";
                actionSubtitle = "快速收起该块下属的大纲与子节点";
                actionGlyph = "📁";
            }
        } else if (action.id === "add-to-deck" && snapshot?.isCard) {
            actionLabel = "更换所属卡组";
            actionSubtitle = "当前块已在复习卡组中，点击可变更卡组归属";
        }

        // 左侧单字/语义字形图标徽章
        const glyphWrap = document.createElement("div");
        glyphWrap.className = `${MENU_CLASS}__glyph-wrap`;
        const glyph = document.createElement("span");
        glyph.className = `${MENU_CLASS}__glyph`;
        glyph.setAttribute("aria-hidden", "true");
        glyph.textContent = actionGlyph;
        glyphWrap.appendChild(glyph);
        item.appendChild(glyphWrap);

        // 中间双行内容区：主标题 + 功能简明副标题
        const contentWrap = document.createElement("div");
        contentWrap.className = `${MENU_CLASS}__item-content`;

        const titleRow = document.createElement("div");
        titleRow.className = `${MENU_CLASS}__item-title-row`;

        const text = document.createElement("span");
        text.className = `${MENU_CLASS}__label`;
        text.textContent = actionLabel;
        titleRow.appendChild(text);

        contentWrap.appendChild(titleRow);

        if (actionSubtitle) {
            if (dense) {
                // Command 中枢模式：副标题降级为原生悬浮提示，省 DOM 与纵向空间，信息不丢失
                item.title = actionSubtitle;
            } else {
                const sub = document.createElement("div");
                sub.className = `${MENU_CLASS}__item-subtitle`;
                sub.textContent = actionSubtitle;
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

        bindSafeTap(item, () => onPick(action));

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

    const rawSections = buildBlockActionMenu(snapshot, presence, preferences, externalActions);
    const renderedIds = new Set(rawSections.flatMap(s => s.actions.map(a => a.id)));
    const hasNewFold = renderedIds.has("toggle-block-fold");
    const hasNewDup = renderedIds.has("duplicate-block");
    const sections = rawSections
        .map(s => ({
            ...s,
            actions: s.actions.filter(a => {
                if (hasNewFold && a.id === "toggle-fold-block") return false;
                if (hasNewDup && a.id === "native-clone-block") return false;
                return true;
            }),
        }))
        .filter(s => s.actions.length > 0);
    if (sections.length === 0) {
        return () => { /* 无可执行动作 */ };
    }

    // ── 自适应密度判定（O(1)）：桌面端 > 阈值进入 Command 中枢双列模式，移动端保持轻量单列 ──
    const isMobileViewport = typeof window !== "undefined" && window.innerWidth <= 640;
    const totalCount = sections.reduce((sum, s) => sum + s.actions.length, 0);
    const dense = !isMobileViewport && totalCount > BLOCK_ACTION_DENSE_THRESHOLD;
    const currentEstWidth = isMobileViewport ? Math.min(window.innerWidth - 24, 320) : (dense ? 470 : 320);

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

    const toolsWrap = document.createElement("div");
    toolsWrap.style.cssText = "display: flex; align-items: center; gap: 6px; margin-left: auto;";

    const blockIdEl = document.createElement("span");
    blockIdEl.className = `${MENU_CLASS}__blockid`;
    if (isBatch) {
        blockIdEl.textContent = `多选选中`;
        blockIdEl.title = snapshot.batchBlockIDs!.join(", ");
    } else {
        blockIdEl.textContent = `#${snapshot.blockID.slice(0, 10)}`;
        blockIdEl.title = snapshot.blockID;
    }
    toolsWrap.appendChild(blockIdEl);

    // 右上角：【📦 资产库】直达按钮（置于头部右上角，直观且不遮挡主菜单内容）
    const storeBtn = document.createElement("button");
    storeBtn.type = "button";
    storeBtn.className = `${MENU_CLASS}__store-btn`;
    storeBtn.style.cssText = isMobileViewport
        ? "border: 1px solid color-mix(in srgb, var(--b3-theme-primary, #6366f1) 28%, transparent); background: color-mix(in srgb, var(--b3-theme-primary, #6366f1) 10%, var(--b3-theme-surface, transparent)); cursor: pointer; color: var(--b3-theme-primary, #6366f1); font-size: 12px; min-height: 44px; min-width: 44px; padding: 6px 12px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; font-weight: 600; line-height: 1.2; transition: all 0.15s ease; box-sizing: border-box;"
        : "border: 1px solid color-mix(in srgb, var(--b3-theme-primary, #6366f1) 28%, transparent); background: color-mix(in srgb, var(--b3-theme-primary, #6366f1) 10%, var(--b3-theme-surface, transparent)); cursor: pointer; color: var(--b3-theme-primary, #6366f1); font-size: 11px; padding: 2px 7px; border-radius: 6px; display: inline-flex; align-items: center; gap: 3px; font-weight: 600; line-height: 1.2; transition: all 0.15s ease;";
    storeBtn.title = "打开块助手资产库，分类装配动作与快捷栏";
    storeBtn.innerHTML = `<span>📦</span><span>资产库</span>`;
    bindSafeTap(storeBtn, () => {
        closeBlockActionMenu();
        const hub = (window as any).LvBlockAssistant || (window as any).__LV_BLOCK_ASSISTANT_HUB__;
        if (hub && typeof hub.openStoreDialog === "function") {
            hub.openStoreDialog();
        }
    });
    toolsWrap.appendChild(storeBtn);

    header.appendChild(toolsWrap);
    menu.appendChild(header);

    const pick = (action: BlockActionDescriptor) => {
        closeBlockActionMenu();
        try {
            void Promise.resolve(onAction(action)).catch(() => { /* 动作层已统一提示 */ });
        } catch {
            /* 动作层已统一提示 */
        }
    };

    // ─────────────────────────────────────────────────────────────
    // ⭐ 顶部常用优先快捷栏（Top Priority Quick Bar）：
    // 若用户配置了优先常驻项，在头部下方渲染一行精致单击快捷按钮，
    // 标注 1~5 数字角标，支持键盘数字闪电直达与一键极速触发。
    // ─────────────────────────────────────────────────────────────
    const pinnedActionIds = preferences?.pinnedActionIds ?? [];
    if (pinnedActionIds.length > 0) {
        const availableActionMap = new Map<string, BlockActionDescriptor>();
        for (const sec of sections) {
            for (const act of sec.actions) {
                if (!isDangerAction(act)) {
                    availableActionMap.set(act.id, act);
                }
            }
        }

        const activePinnedActions: BlockActionDescriptor[] = [];
        for (const pId of pinnedActionIds) {
            const match = availableActionMap.get(pId);
            if (match) activePinnedActions.push(match);
        }

        if (activePinnedActions.length > 0) {
            const quickBar = document.createElement("div");
            quickBar.className = `${MENU_CLASS}__quick-bar`;
            quickBar.style.cssText = `
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 6px 12px 8px;
                border-bottom: 1px solid var(--b3-theme-surface-lighter, rgba(0,0,0,0.06));
                background: color-mix(in srgb, #f59e0b 6%, var(--b3-theme-surface));
                overflow-x: auto;
            `;

            activePinnedActions.forEach((act, idx) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = `${MENU_CLASS}__quick-btn`;
                btn.setAttribute("data-action-id", act.id);
                btn.style.cssText = `
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 5px;
                    ${isMobileViewport ? "min-height: 44px; min-width: 44px; padding: 6px 12px; font-size: 12.5px;" : "padding: 3px 8px; font-size: 11.5px;"}
                    border-radius: 6px;
                    border: 1px solid rgba(245, 158, 11, 0.35);
                    background: color-mix(in srgb, #f59e0b 10%, var(--b3-theme-surface));
                    color: var(--b3-theme-on-surface);
                    cursor: pointer;
                    font-weight: 500;
                    white-space: nowrap;
                    transition: all 0.15s ease;
                    box-sizing: border-box;
                `;
                const actLabel = pickLabel(i18n, act.labelKey, act.fallbackLabel);
                btn.title = `${actLabel} (快捷键 ${idx + 1})`;
                // 2026-11-21 走查修复：改 DOM API 组装。第三方 registerAction 的 glyph/label 未转义，
                // 原 innerHTML 模板存在 HTML 注入面（开放互通动作可注入任意标签）。
                const numBadge = document.createElement("span");
                numBadge.style.cssText = "font-size: 9.5px; font-weight: 700; color: #d97706; background: rgba(245, 158, 11, 0.2); border-radius: 3px; padding: 0 4px; line-height: 1.3;";
                numBadge.textContent = String(idx + 1);
                const glyphSpan = document.createElement("span");
                glyphSpan.style.cssText = "font-size: 12px;";
                glyphSpan.textContent = act.glyph || "⚡";
                const labelSpan = document.createElement("span");
                labelSpan.style.cssText = "max-width: 90px; overflow: hidden; text-overflow: ellipsis;";
                labelSpan.textContent = actLabel;
                btn.append(numBadge, glyphSpan, labelSpan);
                bindSafeTap(btn, () => pick(act));
                quickBar.appendChild(btn);
            });

            menu.appendChild(quickBar);
        }
    }

    // 渲染各功能分段：安全操作按分组展示，所有 destructive / danger 项统一沉底并加危险分隔线
    const safeSections: BlockActionGroupSection[] = [];
    const dangerActions: BlockActionDescriptor[] = [];
    for (const section of sections) {
        const safeActions: BlockActionDescriptor[] = [];
        for (const act of section.actions) {
            if (isDangerAction(act)) {
                dangerActions.push(act);
            } else {
                safeActions.push(act);
            }
        }
        if (safeActions.length > 0) {
            safeSections.push({ ...section, actions: safeActions });
        }
    }
    for (const section of safeSections) {
        menu.appendChild(renderSection(section, i18n, pick, dense, snapshot));
    }
    if (dangerActions.length > 0) {
        const dangerDivider = document.createElement("div");
        dangerDivider.className = `${MENU_CLASS}__divider ${MENU_CLASS}__divider--danger`;
        dangerDivider.setAttribute("role", "separator");
        menu.appendChild(dangerDivider);
        menu.appendChild(renderSection({
            group: "native",
            labelKey: "blockActGroupDanger",
            fallbackLabel: "危险操作",
            actions: dangerActions,
        }, i18n, pick, dense, snapshot, true));
    }

    // ─────────────────────────────────────────────────────────────
    // 底部贴心操作栏：快捷键指引（桌面端支持 1~9 闪电数字直达）
    // ─────────────────────────────────────────────────────────────
    const footer = document.createElement("div");
    footer.className = `${MENU_CLASS}__footer`;
    footer.innerHTML = `
        <span class="${MENU_CLASS}__footer-hint">
            <kbd>↑</kbd><kbd>↓</kbd> 选择 &nbsp;·&nbsp; <kbd>Enter</kbd> 确认 &nbsp;·&nbsp; <kbd>1~9</kbd> 直达 &nbsp;·&nbsp; <kbd>Esc</kbd> 关闭
        </span>
    `;
    menu.appendChild(footer);

    // 移动端安全阻断遮罩层（防止关闭菜单时意外点透触碰正文超链接或唤起软键盘）
    let mobileMask: HTMLElement | null = null;
    if (isMobileViewport) {
        mobileMask = document.createElement("div");
        mobileMask.className = `${MENU_CLASS}__mobile-mask`;
        mobileMask.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 61;
            background: rgba(15, 23, 42, 0.28);
            backdrop-filter: blur(2px);
            -webkit-backdrop-filter: blur(2px);
        `;
        const swallowMask = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            closeBlockActionMenu();
        };
        mobileMask.addEventListener("pointerdown", swallowMask);
        mobileMask.addEventListener("touchend", swallowMask, { passive: false });
        mobileMask.addEventListener("click", swallowMask);
        document.body.appendChild(mobileMask);
    }

    document.body.appendChild(menu);
    activeMenu = menu;
    const isSafeExternalAnchor = !anchor.closest?.(".protyle-wysiwyg") && !anchor.hasAttribute?.("data-node-id");
    if (isSafeExternalAnchor) {
        try {
            (anchor as any).dataset.lvBamAnchor = "open";
        } catch { /* ignore */ }
    }

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
            e.stopPropagation();
            closeBlockActionMenu();
            anchor.focus?.();
            return;
        }

        // 键盘 1~9 闪电数字直达（Raycast / Alfred 级极速流）
        if (!e.ctrlKey && !e.altKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
            const num = parseInt(e.key, 10);
            const quickBtns = Array.from(menu.querySelectorAll<HTMLButtonElement>(`.${MENU_CLASS}__quick-btn`));
            if (quickBtns.length > 0 && num >= 1 && num <= quickBtns.length) {
                e.preventDefault();
                e.stopPropagation();
                quickBtns[num - 1].click();
                return;
            }
            const items = Array.from(menu.querySelectorAll<HTMLButtonElement>(`.${MENU_CLASS}__item`));
            if (num >= 1 && num <= items.length) {
                e.preventDefault();
                e.stopPropagation();
                items[num - 1].click();
                return;
            }
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
            if (next) {
                try {
                    next.focus({ preventScroll: true });
                } catch {
                    next.focus();
                }
                next.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
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

    const surfaceId = `lv-bam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const popSurface = lvSurfaceStack?.push?.({
        id: surfaceId,
        type: "menu",
        dismiss: () => {
            if (!menu.isConnected) return false;
            closeBlockActionMenu();
            anchor.focus?.();
            return true;
        },
    });

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScrollOrResize, { passive: true, capture: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });

    const cleanup = () => {
        popSurface?.();
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("scroll", onScrollOrResize, true);
        window.removeEventListener("resize", onScrollOrResize);
        if (followRaf !== null && typeof cancelAnimationFrame === "function") {
            cancelAnimationFrame(followRaf);
            followRaf = null;
        }
        if (mobileMask) {
            mobileMask.remove();
            mobileMask = null;
        }
        if (isSafeExternalAnchor) {
            try {
                delete (anchor as any).dataset.lvBamAnchor;
            } catch { /* ignore */ }
        }
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
