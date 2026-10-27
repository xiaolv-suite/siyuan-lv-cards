import { describe, expect, it, vi } from "vitest";
import { registerDashboardTab, registerReviewTab } from "@/bootstrap/tab-registrars";

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
});
