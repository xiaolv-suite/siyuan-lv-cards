import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { lvNotify, lvTicker, withDocLock, lvSurfaceStack } from "../src/libs/lv-notice-kit";
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
        if (window.__LV_TICKER__) {
            window.__LV_TICKER__.destroy();
        }
        if (window.__LV_DOC_LOCKS__) {
            window.__LV_DOC_LOCKS__.clear();
        }
        localStorage.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
        if (window.__LV_NOTICE_HUB__) {
            window.__LV_NOTICE_HUB__.destroy();
        }
        if (window.__LV_TICKER__) {
            window.__LV_TICKER__.destroy();
        }
        if (window.__LV_DOC_LOCKS__) {
            window.__LV_DOC_LOCKS__.clear();
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

    it("大批量文档抽取制卡进度折叠更新，自动计数并更新最新消息文本", () => {
        showMessage("正在抽取制卡进度 10/50");
        showMessage("正在抽取制卡进度 25/50");
        showMessage("正在抽取制卡进度 50/50");

        const host = document.getElementById("lv-notice-host");
        const capsules = host?.querySelectorAll(".lv-notice-capsule");
        expect(capsules?.length).toBe(1);
        expect(capsules?.[0].textContent).toContain("正在抽取制卡进度 50/50");
        expect(capsules?.[0].textContent).toContain("×3");
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

    describe("第二阶段：系统资源与并发加固 (Phase 2)", () => {
        it("lvTicker.onMinute：消灭定时器风暴，每分钟整点统一对齐唤醒", () => {
            let tickCount = 0;
            const unsub = lvTicker.onMinute("siyuan-lv-cards", () => {
                tickCount++;
            });

            // 59秒内不触发第二次
            vi.advanceTimersByTime(59000);
            expect(tickCount).toBe(0);

            // 60秒时统一对齐唤醒
            vi.advanceTimersByTime(2000);
            expect(tickCount).toBe(1);

            // 再次推进 60秒
            vi.advanceTimersByTime(60000);
            expect(tickCount).toBe(2);

            unsub();
            vi.advanceTimersByTime(60000);
            expect(tickCount).toBe(2);
        });

        it("lvTicker.onDateCross：跨日零点准时触发，无需后台频繁轮询比对日期", () => {
            let crossedDateKey = "";
            const unsub = lvTicker.onDateCross("siyuan-lv-cards", (newDate) => {
                crossedDateKey = newDate;
            });

            // 推进时间越过午夜
            const now = new Date();
            const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
            const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

            // 推进 25 小时
            vi.advanceTimersByTime(25 * 3600 * 1000);
            expect(crossedDateKey).toBe(tomorrowKey);

            unsub();
        });

        it("withDocLock：同文档排队互斥串行执行，避免内核 write lock 冲突", async () => {
            const executionOrder: string[] = [];

            const task1 = withDocLock("doc-1", async () => {
                await new Promise((r) => setTimeout(r, 50));
                executionOrder.push("task1-done");
                return "res1";
            });

            const task2 = withDocLock("doc-1", async () => {
                executionOrder.push("task2-start");
                return "res2";
            });

            // 针对不同 docId 的任务不阻塞，并行执行
            const taskOther = withDocLock("doc-2", async () => {
                executionOrder.push("task-other");
                return "res-other";
            });

            // 推进 10ms，doc-2 优先完成
            vi.advanceTimersByTime(10);
            await taskOther;
            expect(executionOrder).toContain("task-other");

            // 推进 50ms，doc-1 的 task1 完成后 task2 立即执行
            vi.advanceTimersByTime(50);
            const [r1, r2] = await Promise.all([task1, task2]);
            expect(r1).toBe("res1");
            expect(r2).toBe("res2");
            expect(executionOrder.indexOf("task1-done")).toBeLessThan(executionOrder.indexOf("task2-start"));
        });

        it("withDocLock：某任务抛出异常时自动释放锁，不阻塞后续排队任务", async () => {
            const taskFail = withDocLock("doc-fail", async () => {
                throw new Error("write crash");
            });

            await expect(taskFail).rejects.toThrow("write crash");

            // 锁已正确释放，后续任务正常运行
            const taskSuccess = await withDocLock("doc-fail", async () => {
                return "recovered";
            });
            expect(taskSuccess).toBe("recovered");
        });
    });
});
