import { beforeEach, describe, expect, it, vi } from "vitest";
import { lvBlockAssistant } from "../src/libs/lv-notice-kit";
import { buildBlockActionMenu } from "../src/core/block-actions";

describe("小驴全能块助手开放互通与多插件单例竞选测试", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete (window as any).__LV_BLOCK_ASSISTANT_HUB__;
        delete (window as any).LvBlockAssistant;
    });

    it("挂载 window.LvBlockAssistant 全局开放 API，支持第三方插件一键注册动作", () => {
        const actionsBefore = lvBlockAssistant.getActions();
        expect(actionsBefore.some(a => a.id === "focus-block")).toBe(true);

        // 模拟外部社区插件调用 window.LvBlockAssistant.registerAction
        const mockExecute = vi.fn();
        const unregister = (window as any).LvBlockAssistant.registerAction({
            id: "third-party-simpread",
            group: "community",
            label: "简悦精读高亮归档",
            subtitle: "将本块转为简悦稍后读重点笔记",
            glyph: "📑",
            execute: mockExecute,
        });

        const actionsAfter = lvBlockAssistant.getActions();
        const simpreadAction = actionsAfter.find(a => a.id === "third-party-simpread");
        expect(simpreadAction).toBeTruthy();
        expect(simpreadAction?.label).toBe("简悦精读高亮归档");

        // 执行该动作
        simpreadAction?.execute("b-simpread-1", {});
        expect(mockExecute).toHaveBeenCalledWith("b-simpread-1", {});

        // 注销动作
        unregister();
        expect(lvBlockAssistant.getActions().some(a => a.id === "third-party-simpread")).toBe(false);
    });

    it("自动探测思源社区思维导图插件并在 community 分组动态呈现", () => {
        (window as any).siyuan = {
            ws: {
                app: {
                    plugins: [{ name: "siyuan-plugin-mindmap", displayName: "思维导图" }],
                },
            },
        };

        const actions = lvBlockAssistant.getActions();
        const mindmapAction = actions.find(a => a.id === "community-mindmap");
        expect(mindmapAction).toBeTruthy();
        expect(mindmapAction?.label).toContain("思维导图");
    });

    it("多小驴插件并发运行时，自动进行 Leader 单例竞选与优雅注销交接", () => {
        const leaderOpenFn = vi.fn();
        const backupOpenFn = vi.fn();

        // 1. 第一个插件（如小驴闪卡）启动并当选 Leader
        const cleanLeader = lvBlockAssistant.ensureLeader("siyuan-lv-cards", leaderOpenFn);
        expect((window as any).__LV_BLOCK_ASSISTANT_HUB__.leaderPlugin).toBe("siyuan-lv-cards");

        // 2. 第二个插件（如小驴打卡）启动，成为 Provider，不抢夺 Leader
        const cleanBackup = lvBlockAssistant.ensureLeader("siyuan-checkin", backupOpenFn);
        expect((window as any).__LV_BLOCK_ASSISTANT_HUB__.leaderPlugin).toBe("siyuan-lv-cards");

        // 调用打开菜单，由当前 Leader 执行
        const anchor = document.createElement("button");
        lvBlockAssistant.openMenu("b-leader-test", anchor);
        expect(leaderOpenFn).toHaveBeenCalledWith("b-leader-test", anchor);
        expect(backupOpenFn).not.toHaveBeenCalled();

        // 3. 第一个插件卸载，第二个插件平滑自动当选为新 Leader 接管
        cleanLeader();
        expect((window as any).__LV_BLOCK_ASSISTANT_HUB__.leaderPlugin).toBe("siyuan-checkin");

        lvBlockAssistant.openMenu("b-backup-test", anchor);
        expect(backupOpenFn).toHaveBeenCalledWith("b-backup-test", anchor);

        cleanBackup();
    });
});
