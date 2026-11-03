import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { lvNotify } from "../src/libs/lv-notice-kit";
import {
    showMessage,
    notifyBatchCardCreation,
    notifyDailyReviewReminder,
    notifyInline,
} from "../src/libs/notice";

describe("全生态去中心化统一通知系统 (Epoch 7 Standard)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // 清理已有 DOM 和挂载
        const oldHost = document.getElementById("lv-notice-host");
        if (oldHost) oldHost.remove();
        if (window.__LV_NOTICE_HUB__) {
            window.__LV_NOTICE_HUB__.destroy();
        }
        localStorage.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
        if (window.__LV_NOTICE_HUB__) {
            window.__LV_NOTICE_HUB__.destroy();
        }
        const oldHost = document.getElementById("lv-notice-host");
        if (oldHost) oldHost.remove();
        localStorage.clear();
    });

    it("自举 Coordinator 与单例注册，卸载时平滑交棒", () => {
        const unregisterA = lvNotify.registerPlugin("siyuan-lv-cards");
        expect(window.__LV_NOTICE_HUB__).toBeDefined();
        expect(window.__LV_NOTICE_HUB__?.hostPlugin).toBe("siyuan-lv-cards");

        let relinquished = false;
        const unregisterB = lvNotify.registerPlugin("siyuan-exam", () => {
            relinquished = true;
        });

        // 闪卡卸载交棒
        unregisterA();
        expect(relinquished).toBe(true);
        expect(window.__LV_NOTICE_HUB__?.hostPlugin).toBe("siyuan-exam");

        unregisterB();
        expect(window.__LV_NOTICE_HUB__).toBeUndefined();
    });

    it("四级降噪：瞬时微胶囊 (capsule) 正常渲染与自动淡出", () => {
        const id = lvNotify.capsule({
            source: "小驴闪卡",
            message: "设置已保存",
            duration: 2500,
        });

        const host = document.getElementById("lv-notice-host");
        expect(host).not.toBeNull();
        const capsule = host?.querySelector(".lv-notice-capsule");
        expect(capsule).not.toBeNull();
        expect(capsule?.textContent).toContain("小驴闪卡");
        expect(capsule?.textContent).toContain("设置已保存");

        // 推进时间到 2500ms 后自动关闭
        vi.advanceTimersByTime(2600);
        expect(host?.querySelector(".lv-notice-capsule")).toBeNull();
    });

    it("批量抽取制卡时同类通知自动折叠计数 (×2, ×3)，严禁瀑布连弹", () => {
        notifyBatchCardCreation("已加入卡组 (1 张)");
        notifyBatchCardCreation("已加入卡组 (1 张)");
        notifyBatchCardCreation("已加入卡组 (1 张)");

        const host = document.getElementById("lv-notice-host");
        const cards = host?.querySelectorAll(".lv-notice-capsule");
        // 自动合流为 1 条，而不是 3 个气泡连弹
        expect(cards?.length).toBe(1);
        expect(cards?.[0].textContent).toContain("已加入卡组 (1 张)");
        expect(cards?.[0].textContent).toContain("×3");
    });

    it("通用 showMessage 智能分流：错误提升为 Card 且带关闭，常规为 Capsule", () => {
        // 常规 info
        showMessage("已复制到剪贴板", 2000, "info");
        let host = document.getElementById("lv-notice-host");
        expect(host?.querySelector(".lv-notice-capsule")).not.toBeNull();
        expect(host?.querySelector(".lv-notice-card")).toBeNull();

        // 错误信息提升为卡片
        showMessage("内核写入失败", 4000, "error");
        const errorCard = host?.querySelector(".lv-notice-card[data-level='error']");
        expect(errorCard).not.toBeNull();
        expect(errorCard?.textContent).toContain("小驴闪卡提示");
        expect(errorCard?.textContent).toContain("内核写入失败");
    });

    it("每日复习提醒卡片：带【开始复习】直达动作与【稍后提醒 / 今日免打扰】延期能力", async () => {
        let reviewStarted = false;
        const id = notifyDailyReviewReminder({
            count: 15,
            message: "今日有 15 张卡片待复习",
            onStartReview: () => {
                reviewStarted = true;
            },
        });

        expect(id).not.toBeNull();
        const host = document.getElementById("lv-notice-host");
        const card = host?.querySelector(".lv-notice-card");
        expect(card).not.toBeNull();
        expect(card?.textContent).toContain("今日有 15 张卡片待复习");

        // 存在【开始复习】按钮
        const actionBtn = card?.querySelector(".lv-notice-btn--primary") as HTMLButtonElement | null;
        expect(actionBtn).not.toBeNull();
        expect(actionBtn?.textContent).toContain("开始复习");

        actionBtn?.click();
        expect(reviewStarted).toBe(true);

        // 点击后异步等待 microtask 完成收起
        await Promise.resolve();
        expect(host?.querySelector(".lv-notice-card")).toBeNull();
    });

    it("每日免打扰：点击今日免打扰后，当天不再弹出每日提醒", () => {
        notifyDailyReviewReminder({
            count: 8,
            message: "今日有 8 张卡片待复习",
            onStartReview: () => {},
        });

        const host = document.getElementById("lv-notice-host");
        const snoozeBtns = host?.querySelectorAll("[data-snooze-idx]");
        expect(snoozeBtns?.length).toBe(3);

        // 点击第 3 个按钮：今日免打扰
        const muteBtn = snoozeBtns?.[2] as HTMLButtonElement;
        expect(muteBtn.textContent).toContain("今日免打扰");
        muteBtn.click();

        // 当日免打扰生效
        expect(lvNotify.isMutedToday("daily-review-reminder")).toBe(true);

        // 再次触发被静默阻断，返回 null
        const blockedId = notifyDailyReviewReminder({
            count: 8,
            message: "今日有 8 张卡片待复习",
            onStartReview: () => {},
        });
        expect(blockedId).toBeNull();
    });

    it("复习评级与按钮原位微动效：直接在按钮上产生原位反馈，绝不弹窗", () => {
        const btn = document.createElement("button");
        document.body.appendChild(btn);

        notifyInline(btn, "认识");
        expect(btn.classList.contains("lv-inline-feedback-active")).toBe(true);
        expect(btn.classList.contains("lv-inline-feedback--success")).toBe(true);
        expect(btn.getAttribute("title")).toBe("认识");

        // 坚决不产生 DOM 弹窗
        const host = document.getElementById("lv-notice-host");
        expect(host?.children.length ?? 0).toBe(0);

        // 1秒后自动恢复
        vi.advanceTimersByTime(1100);
        expect(btn.classList.contains("lv-inline-feedback-active")).toBe(false);
        expect(btn.getAttribute("title")).toBeNull();
        btn.remove();
    });
});
