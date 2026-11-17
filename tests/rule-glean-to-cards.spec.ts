import { describe, it, expect, vi, afterEach } from "vitest";
import { lvAutomation } from "@/libs/notice";

describe("拾遗消费规则自动化联动 (rule-glean-to-cards)", () => {
    let unreg: (() => void) | null = null;

    afterEach(() => {
        if (unreg) {
            unreg();
            unreg = null;
        }
    });

    it("硬断言 5: lvAutomation 注册拾遗联动规则并精确校验 triggerSource 与 triggerType", () => {
        let capturedPayload: any = null;

        unreg = lvAutomation.registerRule({
            id: "rule-glean-to-cards",
            name: "拾遗高亮 ➔ 自动同步闪卡生成复习卡",
            desc: "小驴拾遗高亮制卡请求时，自动在闪卡生成待复习新卡",
            enabled: true,
            triggerSource: "siyuan-glean",
            triggerType: "create-card-request",
            actionPlugin: "siyuan-lv-cards",
            actionName: "create-card",
            execute: async (payload: any) => {
                capturedPayload = payload;
                return true;
            },
        });

        // 验证规则列表与元信息
        const rule = lvAutomation.getRules().find(r => r.id === "rule-glean-to-cards");
        expect(rule).toBeDefined();
        expect(rule?.enabled).toBe(true);
        expect(rule?.triggerSource).toBe("siyuan-glean");
        expect(rule?.triggerType).toBe("create-card-request");
        expect(rule?.actionName).toBe("create-card");
    });

    it("硬断言 5: 严格按照联动契约消费 front/back/tags/sourceBlockId/sourceTitle", async () => {
        let receivedPayload: any = null;

        unreg = lvAutomation.registerRule({
            id: "rule-glean-to-cards",
            name: "拾遗高亮 ➔ 自动同步闪卡生成复习卡",
            desc: "小驴拾遗高亮制卡请求时，自动在闪卡生成待复习新卡",
            enabled: true,
            triggerSource: "siyuan-glean",
            triggerType: "create-card-request",
            actionPlugin: "siyuan-lv-cards",
            actionName: "create-card",
            execute: async (payload: any) => {
                receivedPayload = payload;
                const { front, back, tags, sourceBlockId, sourceTitle } = payload;
                if (!front) return false;
                return true;
            },
        });

        // 模拟小驴拾遗发起制卡事件广播
        const mockGleanPayload = {
            front: "什么是浏览器事件循环（Event Loop）？",
            back: "处理宏任务和微任务的执行时序机制，先微后宏。",
            tags: ["JavaScript", "浏览器原理"],
            sourceBlockId: "20261105120000-glean01",
            sourceTitle: "前端面试高频考点拾遗",
        };

        const triggerResult = await lvAutomation.trigger("siyuan-glean", "create-card-request", mockGleanPayload);

        expect(triggerResult.triggered).toBe(1);
        expect(triggerResult.success).toBe(1);

        // 深度比对接收到的载荷字段
        expect(receivedPayload).toEqual(mockGleanPayload);
        expect(receivedPayload.front).toBe("什么是浏览器事件循环（Event Loop）？");
        expect(receivedPayload.back).toContain("处理宏任务和微任务");
        expect(receivedPayload.tags).toEqual(["JavaScript", "浏览器原理"]);
        expect(receivedPayload.sourceBlockId).toBe("20261105120000-glean01");
        expect(receivedPayload.sourceTitle).toBe("前端面试高频考点拾遗");
    });

    it("规则停用时不再触发，清理函数生效", async () => {
        let executed = false;

        unreg = lvAutomation.registerRule({
            id: "rule-glean-to-cards",
            triggerSource: "siyuan-glean",
            triggerType: "create-card-request",
            actionName: "create-card",
            execute: async () => {
                executed = true;
                return true;
            },
        });

        // 停用规则
        lvAutomation.toggleRule("rule-glean-to-cards", false);
        const resDisabled = await lvAutomation.trigger("siyuan-glean", "create-card-request", { front: "test" });
        expect(resDisabled.triggered).toBe(0);
        expect(executed).toBe(false);

        // 注销清理
        unreg();
        unreg = null;
        expect(lvAutomation.getRules().find(r => r.id === "rule-glean-to-cards")).toBeUndefined();
    });
});
