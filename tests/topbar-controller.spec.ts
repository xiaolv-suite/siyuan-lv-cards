import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TopbarController, type TopbarHost } from "@/bootstrap/topbar-controller";

describe("TopbarController 顶栏自愈控制器", () => {
    let host: TopbarHost;
    let addedIcons: string[] = [];
    let addedTopBars: any[] = [];
    let removedTopBars: string[] = [];
    let openedTabs: string[] = [];
    let showMenuEvents: any[] = [];

    beforeEach(() => {
        addedIcons = [];
        addedTopBars = [];
        removedTopBars = [];
        openedTabs = [];
        showMenuEvents = [];

        host = {
            i18n: { topbarTitle: "小驴闪卡" },
            settings: {
                topbarDirectReview: false,
                modules: { review: true },
                dailyReviewTarget: 20,
            },
            revlog: { days: {} },
            examPlans: { plans: [] },
            addIcons: (svg) => addedIcons.push(svg),
            addTopBar: (opts) => {
                addedTopBars.push(opts);
                const el = document.createElement("div");
                el.id = opts.id;
                document.body.appendChild(el);
                return el;
            },
            removeTopBar: (id) => {
                removedTopBars.push(id);
                document.getElementById(id)?.remove();
            },
            openTabOf: (tab) => openedTabs.push(tab),
            showTopbarMenu: (evt) => showMenuEvents.push(evt),
        };
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("初次调用 ensureTopBarElement 创建顶栏元素并添加图标", () => {
        const ctrl = new TopbarController(host, "<svg id='iconLvCards'></svg>");
        const el = ctrl.ensureTopBarElement();

        expect(el).toBeTruthy();
        expect(addedTopBars).toHaveLength(1);
        expect(addedTopBars[0].id).toBe(TopbarController.TOPBAR_ICON_ID);
        expect(ctrl.getElement()).toBe(el);

        // 重复调用返回同一连通元素，不重复创建
        const el2 = ctrl.ensureTopBarElement();
        expect(el2).toBe(el);
        expect(addedTopBars).toHaveLength(1);
    });

    it("当 DOM 断连时自动自愈重新创建", () => {
        const ctrl = new TopbarController(host, "<svg id='iconLvCards'></svg>");
        const el1 = ctrl.ensureTopBarElement();
        expect(el1).toBeTruthy();

        // 模拟宿主重建顶栏，旧节点断连
        el1?.remove();
        expect(el1?.isConnected).toBe(false);

        const el2 = ctrl.ensureTopBarElement();
        expect(el2).toBeTruthy();
        expect(addedTopBars).toHaveLength(2);
    });

    it("点击顶栏图标根据设置打开相应 Tab", () => {
        const ctrl = new TopbarController(host, "<svg id='iconLvCards'></svg>");
        ctrl.ensureTopBarElement();

        // 默认打开仪表盘
        addedTopBars[0].callback();
        expect(openedTabs).toContain("lv-cards-dashboard");
    });

    it("destroy 注销监听并移除顶栏", () => {
        const ctrl = new TopbarController(host, "<svg id='iconLvCards'></svg>");
        ctrl.ensureTopBarElement();

        ctrl.destroy();
        expect(removedTopBars).toContain(TopbarController.TOPBAR_ICON_ID);
        expect(ctrl.getElement()).toBeNull();
    });
});
