import { describe, expect, it, vi } from "vitest";
import { registerDashboardTab, registerReviewTab, buildHubMountProps, buildReviewMountProps } from "@/bootstrap/tab-registrars";
import { bindMobileVisualViewport } from "@/libs/dialog";

describe("tab-registrars 页签装配器与生命周期解耦", () => {
    it("正确向宿主注册 TAB_DASHBOARD 闪卡中心页签", () => {
        const addedTabs: any[] = [];
        const dummyPlugin = {
            addTab: vi.fn((tab) => {
                addedTabs.push(tab);
            }),
            i18n: { dashboard: { title: "闪卡中心" } },
            settings: { modules: {} },
        };

        const dummyDeps = {
            loadHubMount: vi.fn(),
            loadReviewMount: vi.fn(),
            mountChunkFallback: vi.fn(),
        };

        registerDashboardTab(dummyPlugin as any, dummyDeps as any);

        expect(dummyPlugin.addTab).toHaveBeenCalled();
        expect(addedTabs[0].type).toBe("lv-cards-dashboard");
        expect(typeof addedTabs[0].init).toBe("function");
    });

    it("正确向宿主注册 TAB_REVIEW 复习工作台页签", () => {
        const addedTabs: any[] = [];
        const dummyPlugin = {
            addTab: vi.fn((tab) => {
                addedTabs.push(tab);
            }),
            i18n: { review: { title: "复习" } },
            settings: { modules: {} },
        };

        const dummyDeps = {
            loadHubMount: vi.fn(),
            loadReviewMount: vi.fn(),
            mountChunkFallback: vi.fn(),
        };

        registerReviewTab(dummyPlugin as any, dummyDeps as any);

        expect(dummyPlugin.addTab).toHaveBeenCalled();
        expect(addedTabs[0].type).toBe("lv-cards-review");
        expect(typeof addedTabs[0].init).toBe("function");
    });

    it("buildReviewMountProps 支持移动端全屏宿主注入 onOpenDashboard 与 onClose 回调", () => {
        const onOpenDashboard = vi.fn();
        const onClose = vi.fn();
        const dummyPlugin = {
            i18n: { review: { title: "复习" } },
            app: {},
            settings: { lastReviewScope: "all", starredCards: [] },
            entryContexts: { contexts: [] },
        };

        const props = buildReviewMountProps(
            dummyPlugin as any,
            { scope: "deck:d-1", cram: true },
            { onOpenDashboard, onClose },
        ) as any;

        expect(props.initialScope).toBe("deck:d-1");
        expect(props.initialCram).toBe(true);
        expect(props.ctx.onClose).toBe(onClose);

        props.ctx.openDashboard("decks");
        expect(onOpenDashboard).toHaveBeenCalledWith("decks");
    });

    it("buildHubMountProps 支持透传移动端关闭回调 onCloseMobile", () => {
        const onCloseMobile = vi.fn();
        const dummyPlugin = {
            i18n: { dashboard: {} },
            app: {},
            settings: { uiMode: "advanced", modules: {} },
            inbox: { items: [] },
            suspendToday: { cardIDs: [] },
            sourceHealth: { entries: [] },
            aiBatches: { batches: [] },
            examPlans: { plans: [] },
            learningGoals: { goals: [] },
            knowledgeObjects: { objects: [] },
            errorTags: { tags: {} },
            contentLifecycles: { lifecycles: {} },
            aiJobs: { jobs: [] },
        };
        const dummyDeps = {
            loadHubMount: vi.fn(),
            loadReviewMount: vi.fn(),
            mountChunkFallback: vi.fn(),
        };

        const props = buildHubMountProps(dummyPlugin as any, dummyDeps as any, { tab: "manage" }, { onCloseMobile }) as any;
        expect(props.initialTab).toBe("manage");
        expect(props.onCloseMobile).toBe(onCloseMobile);
    });

    it("bindMobileVisualViewport 同步 --lv-vv-h 与软键盘状态并在销毁时完整解绑", () => {
        const listeners = new Map<string, Set<() => void>>();
        const fakeVv = {
            height: 760,
            addEventListener: vi.fn((type: string, fn: () => void) => {
                if (!listeners.has(type)) listeners.set(type, new Set());
                listeners.get(type)!.add(fn);
            }),
            removeEventListener: vi.fn((type: string, fn: () => void) => {
                listeners.get(type)?.delete(fn);
            }),
        };
        const prevVv = window.visualViewport;
        const prevInner = window.innerHeight;
        Object.defineProperty(window, "innerHeight", { configurable: true, value: 760 });
        Object.defineProperty(window, "visualViewport", { configurable: true, value: fakeVv });

        try {
            const host = document.createElement("div");
            const unbind = bindMobileVisualViewport(host);
            expect(host.style.getPropertyValue("--lv-vv-h")).toBe("760px");
            expect(host.classList.contains("lv-vv-keyboard-open")).toBe(false);

            fakeVv.height = 440;
            listeners.get("resize")?.forEach((cb) => cb());
            expect(host.style.getPropertyValue("--lv-vv-h")).toBe("440px");
            expect(host.classList.contains("lv-vv-keyboard-open")).toBe(true);

            unbind();
            expect(fakeVv.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
            expect(fakeVv.removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
        } finally {
            Object.defineProperty(window, "visualViewport", { configurable: true, value: prevVv });
            Object.defineProperty(window, "innerHeight", { configurable: true, value: prevInner });
        }
    });
});
