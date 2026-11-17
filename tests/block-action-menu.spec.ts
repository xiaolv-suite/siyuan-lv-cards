import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    closeBlockActionMenu,
    isBlockActionMenuOpen,
    openBlockActionMenu,
} from "../src/ui/block-action-menu";

describe("block-action-menu 现代块操作中心菜单 UI 契约", () => {
    beforeEach(() => {
        closeBlockActionMenu();
        document.body.innerHTML = "";
        vi.clearAllMocks();
    });

    const createAnchor = () => {
        const anchor = document.createElement("button");
        anchor.className = "lv-card-badge-pill";
        anchor.getBoundingClientRect = () => ({
            top: 100,
            bottom: 122,
            left: 200,
            right: 280,
            width: 80,
            height: 22,
            x: 200,
            y: 100,
            toJSON: () => {},
        });
        document.body.appendChild(anchor);
        return anchor;
    };

    it("正确渲染现代感知头部、Hero 推荐卡片与生态徽章（Command 中枢双列密度）", () => {
        const anchor = createAnchor();
        const onAction = vi.fn();

        openBlockActionMenu({
            snapshot: {
                blockID: "20261116120000-abcdef1",
                blockKind: "code",
                isCard: false,
                hasText: true,
            },
            presence: { exam: true, checkin: true, common: true },
            onAction,
            anchor,
        });

        expect(isBlockActionMenuOpen()).toBe(true);
        const menu = document.querySelector(".lv-bam") as HTMLElement;
        expect(menu).toBeTruthy();

        // 1. 验证感知头部 + 块类型身份写入菜单（代码块 → data-kind=code）
        const header = menu.querySelector(".lv-bam__header");
        expect(header).toBeTruthy();
        expect(header?.textContent).toContain("代码片段");
        expect(header?.textContent).toContain("#2026111612");
        expect(menu.getAttribute("data-kind")).toBe("code");

        // 2. 自适应密度：>10 项自动进入 Command 中枢双列模式
        expect(menu.classList.contains("lv-bam--dense")).toBe(true);

        // 3. Hero 推荐项（问答工作台）：副标题降级为原生悬浮提示（省 DOM），主标与徽标保留
        const featuredItem = menu.querySelector(".lv-bam__item--featured") as HTMLElement;
        expect(featuredItem).toBeTruthy();
        expect(featuredItem.textContent).toContain("编辑问答");
        expect(featuredItem.title).toContain("零污染属性提问 · 主动回忆工作台");
        expect(featuredItem.textContent).toContain("推荐 · Alt+Q");

        // 4. Command 模式不再渲染常驻副标题节点（信息不丢失，降级为 title）
        expect(menu.querySelector(".lv-bam__item-subtitle")).toBeNull();

        // 5. 组头计数徽章：数字总和应等于菜单动作总数
        const counts = Array.from(menu.querySelectorAll(".lv-bam__section-count")) as HTMLElement[];
        expect(counts.length).toBeGreaterThan(0);
        const total = counts.reduce((sum, el) => sum + Number(el.textContent || "0"), 0);
        expect(total).toBeGreaterThan(10);

        // 6. 生态插件来源写入 data-source 供 glyph 底座着色 + 保留彩色文字徽章
        const examAction = menu.querySelector('[data-action-id="to-exam-question"]') as HTMLElement;
        expect(examAction).toBeTruthy();
        expect(examAction.getAttribute("data-source")).toBe("exam");
        const examTag = menu.querySelector(".lv-bam__source-tag--exam");
        expect(examTag).toBeTruthy();
        expect(examTag?.textContent).toBe("考试");

        const checkinTag = menu.querySelector(".lv-bam__source-tag--checkin");
        expect(checkinTag).toBeTruthy();
        expect(checkinTag?.textContent).toBe("打卡");

        // 7. 验证底部快捷提示栏
        const footer = menu.querySelector(".lv-bam__footer");
        expect(footer).toBeTruthy();
        expect(footer?.textContent).toContain("选择");
        expect(footer?.textContent).toContain("关闭");
    });

    it("自适应双模式：批量多选等 ≤10 项场景回落 Focus 精读单列（副标题常驻 + 无计数噪音）", () => {
        const anchor = createAnchor();
        openBlockActionMenu({
            snapshot: {
                blockID: "20261116120000-focus",
                blockKind: "paragraph",
                batchBlockIDs: ["b1", "b2", "b3"],
                hasText: true,
            },
            presence: { exam: false, checkin: false, common: false, home: false, contacts: false, glean: false, raikiri: false },
            onAction: vi.fn(),
            anchor,
        });

        const menu = document.querySelector(".lv-bam") as HTMLElement;
        // Focus 精读模式：不挂 dense 类
        expect(menu.classList.contains("lv-bam--dense")).toBe(false);
        expect(menu.getAttribute("data-kind")).toBe("paragraph");
        // 副标题以 DOM 常驻（富两行排版，信息一目了然）
        const subtitle = menu.querySelector(".lv-bam__item-subtitle");
        expect(subtitle).toBeTruthy();
        expect(subtitle?.textContent).toContain("收录入指定卡包");
        // Focus 模式不渲染组头计数徽章（零噪音）
        expect(menu.querySelector(".lv-bam__section-count")).toBeNull();
        // 批量模式头部徽章
        const batchBadge = menu.querySelector(".lv-bam__badge--batch");
        expect(batchBadge).toBeTruthy();
    });

    it("功能门禁实机渲染：无选区/无图/非代码块时对应动作不渲染进菜单", () => {
        const anchor = createAnchor();
        openBlockActionMenu({
            snapshot: {
                blockID: "20261116120000-gated",
                blockKind: "paragraph",
                hasText: true,
            },
            presence: { exam: false, checkin: false, common: false, home: false, contacts: false, glean: false, raikiri: false },
            onAction: vi.fn(),
            anchor,
        });

        const menu = document.querySelector(".lv-bam") as HTMLElement;
        // 无选区 → 无挖空制卡
        expect(menu.querySelector('[data-action-id="make-cloze"]')).toBeNull();
        // 无图 → 无遮挡卡
        expect(menu.querySelector('[data-action-id="make-occlusion"]')).toBeNull();
        // 非代码块 → 无雷切工作台
        expect(menu.querySelector('[data-action-id="speedswitch-workbench"]')).toBeNull();
    });

    it("遮挡契约：视口底部锚点上翻时菜单不覆盖锚点（再次点击可收起）", () => {
        const anchor = createAnchor();
        // 把锚点推到视口底部（jsdom 视口 1024×768）
        anchor.getBoundingClientRect = () => ({
            top: 600,
            bottom: 622,
            left: 800,
            right: 960,
            width: 160,
            height: 22,
            x: 800,
            y: 600,
            toJSON: () => {},
        });

        openBlockActionMenu({
            snapshot: { blockID: "20261116120000-flip", blockKind: "paragraph", hasText: true },
            presence: { exam: false, checkin: false, common: false, home: false, contacts: false, glean: false, raikiri: false },
            onAction: vi.fn(),
            anchor,
        });

        const menu = document.querySelector(".lv-bam") as HTMLElement;
        expect(menu).toBeTruthy();
        // 上翻：maxHeight 以锚点顶边为界（600 - 8 gap - 12 margin = 580）
        expect(menu.style.maxHeight).toBe("580px");
        // 菜单顶边严格高于锚点上缘（不覆盖锚点）
        expect(parseInt(menu.style.top, 10)).toBeLessThanOrEqual(600 - 8);
    });

    it("滚动跟随：滚动/缩放时菜单跟随锚点重定位而非误杀（思源 scrollIntoView 兼容）", async () => {
        const anchor = createAnchor();

        openBlockActionMenu({
            snapshot: { blockID: "20261116120000-scroll", blockKind: "paragraph", hasText: true },
            presence: { exam: false, checkin: false, common: false, home: false, contacts: false, glean: false, raikiri: false },
            onAction: vi.fn(),
            anchor,
        });
        expect(isBlockActionMenuOpen()).toBe(true);
        const menu = document.querySelector(".lv-bam") as HTMLElement;
        const topBefore = menu.style.top;

        // 思源块选中后的程序化 scrollIntoView：锚点位移也不误杀，菜单跟随
        const orig = anchor.getBoundingClientRect.bind(anchor);
        anchor.getBoundingClientRect = () => {
            const r = orig();
            return { ...r, top: r.top + 120, bottom: r.bottom + 120 };
        };
        window.dispatchEvent(new Event("scroll"));
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

        expect(isBlockActionMenuOpen()).toBe(true);
        expect(menu.style.top).not.toBe(topBefore);
    });

    it("Command 双列模式支持 ←→ 横向键盘导航", () => {
        const anchor = createAnchor();
        openBlockActionMenu({
            snapshot: {
                blockID: "20261116120000-nav",
                blockKind: "paragraph",
                hasText: true,
            },
            presence: { exam: true, checkin: true, common: true, home: true, contacts: true, glean: true, raikiri: true },
            onAction: vi.fn(),
            anchor,
        });

        const menu = document.querySelector(".lv-bam") as HTMLElement;
        expect(menu.classList.contains("lv-bam--dense")).toBe(true);
        const items = Array.from(menu.querySelectorAll<HTMLButtonElement>(".lv-bam__item"));
        const first = items[0];
        first.focus();

        // ArrowRight 向后移动一项
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        expect(document.activeElement).toBe(items[1]);

        // ArrowLeft 向回移动一项
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
        expect(document.activeElement).toBe(items[0]);
    });

    it("多选批量模式下，顶部呈现渐变批量状态且过滤单块动作", () => {
        const anchor = createAnchor();
        openBlockActionMenu({
            snapshot: {
                blockID: "20261116120000-b1",
                batchBlockIDs: ["b1", "b2", "b3"],
                blockKind: "paragraph",
                isCard: false,
                hasText: true,
            },
            presence: {},
            onAction: vi.fn(),
            anchor,
        });

        const menu = document.querySelector(".lv-bam") as HTMLElement;
        const batchBadge = menu.querySelector(".lv-bam__badge--batch");
        expect(batchBadge).toBeTruthy();
        expect(batchBadge?.textContent).toContain("批量操作 (3 块)");

        // 批量模式排除单块问答与遮挡
        expect(menu.querySelector('[data-action-id="edit-card-qa"]')).toBeNull();
        expect(menu.querySelector('[data-action-id="make-occlusion"]')).toBeNull();
        // 保留支持批量的动作
        expect(menu.querySelector('[data-action-id="copy-block-ref"]')).toBeTruthy();
    });

    it("点击动作项触发 onAction 回调并自动关闭菜单", async () => {
        const anchor = createAnchor();
        const onAction = vi.fn();

        openBlockActionMenu({
            snapshot: {
                blockID: "20261116120000-action",
                blockKind: "paragraph",
                hasText: true,
            },
            presence: {},
            onAction,
            anchor,
        });

        const copyItem = document.querySelector('[data-action-id="copy-block-ref"]') as HTMLButtonElement;
        expect(copyItem).toBeTruthy();
        copyItem.click();
        await Promise.resolve();

        expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: "copy-block-ref" }));
        expect(isBlockActionMenuOpen()).toBe(false);
    });

    it("按下 Escape 键优雅收起菜单并归还焦点", () => {
        const anchor = createAnchor();
        const focusSpy = vi.spyOn(anchor, "focus");

        openBlockActionMenu({
            snapshot: {
                blockID: "20261116120000-esc",
                blockKind: "paragraph",
            },
            presence: {},
            onAction: vi.fn(),
            anchor,
        });

        expect(isBlockActionMenuOpen()).toBe(true);
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        expect(isBlockActionMenuOpen()).toBe(false);
        expect(focusSpy).toHaveBeenCalled();
    });

    it("再次点击同一胶囊应收起菜单（切换直觉行为）", () => {
        const anchor = createAnchor();

        openBlockActionMenu({
            snapshot: { blockID: "20261116120000-toggle", blockKind: "paragraph", hasText: true },
            presence: { exam: false, checkin: false, common: false, home: false, contacts: false, glean: false, raikiri: false },
            onAction: vi.fn(),
            anchor,
        });
        expect(isBlockActionMenuOpen()).toBe(true);

        // 第二次打开同一锚点：必须识别为收起意图，而不是「关了又闪开」
        openBlockActionMenu({
            snapshot: { blockID: "20261116120000-toggle", blockKind: "paragraph", hasText: true },
            presence: { exam: false, checkin: false, common: false, home: false, contacts: false, glean: false, raikiri: false },
            onAction: vi.fn(),
            anchor,
        });
        expect(isBlockActionMenuOpen()).toBe(false);
        expect(document.querySelector(".lv-bam")).toBeNull();
    });

    it("失联守卫：菜单节点被外部移除后，下次点击必须能正常重新打开", () => {
        const anchor = createAnchor();

        openBlockActionMenu({
            snapshot: { blockID: "20261116120000-orphan", blockKind: "paragraph", hasText: true },
            presence: { exam: false, checkin: false, common: false, home: false, contacts: false, glean: false, raikiri: false },
            onAction: vi.fn(),
            anchor,
        });
        expect(isBlockActionMenuOpen()).toBe(true);

        // 模拟宿主/第三方直接移除菜单节点（未走 close 流程，锚点标记残留）
        document.querySelector(".lv-bam")?.remove();
        expect(isBlockActionMenuOpen()).toBe(true); // activeMenu 引用仍在（内部状态未走清理）

        // 失联守卫：不应误判为「收起」，而应重新打开
        openBlockActionMenu({
            snapshot: { blockID: "20261116120000-orphan", blockKind: "paragraph", hasText: true },
            presence: { exam: false, checkin: false, common: false, home: false, contacts: false, glean: false, raikiri: false },
            onAction: vi.fn(),
            anchor,
        });
        expect(isBlockActionMenuOpen()).toBe(true);
        expect(document.querySelector(".lv-bam")).toBeTruthy();
        closeBlockActionMenu();
    });
});
