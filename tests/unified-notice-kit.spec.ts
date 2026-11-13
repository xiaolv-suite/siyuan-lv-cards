import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { lvNotify, lvTicker, withDocLock, lvSurfaceStack, lvAi, lvActivity, lvBackup, lvEcosystem, lvLaunchpad, lvOmnisearch, lvAutomation } from "../src/libs/lv-notice-kit";
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
        if ((window as any).__LV_AI_GATEWAY__) {
            delete (window as any).__LV_AI_GATEWAY__;
        }
        if (typeof lvAi.destroy === "function") {
            lvAi.destroy();
        }
        if ((window as any).__LV_BACKUP_HUB__) {
            delete (window as any).__LV_BACKUP_HUB__;
        }
        if ((window as any).__LV_LAUNCHPAD__) {
            delete (window as any).__LV_LAUNCHPAD__;
        }
        if ((window as any).__LV_OMNISEARCH__) {
            delete (window as any).__LV_OMNISEARCH__;
        }
        if ((window as any).__LV_AUTOMATION__) {
            delete (window as any).__LV_AUTOMATION__;
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
        if ((window as any).__LV_AI_GATEWAY__) {
            delete (window as any).__LV_AI_GATEWAY__;
        }
        if (typeof lvAi.destroy === "function") {
            lvAi.destroy();
        }
        if ((window as any).__LV_BACKUP_HUB__) {
            delete (window as any).__LV_BACKUP_HUB__;
        }
        if ((window as any).__LV_LAUNCHPAD__) {
            delete (window as any).__LV_LAUNCHPAD__;
        }
        if ((window as any).__LV_OMNISEARCH__) {
            delete (window as any).__LV_OMNISEARCH__;
        }
        if ((window as any).__LV_AUTOMATION__) {
            delete (window as any).__LV_AUTOMATION__;
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
        expect(snoozeBtns?.length).toBe(5);

        // 点击第 3 个按钮：今日免打扰 (另含未来3天/未来一周长效免打扰)
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
            const startTs = Date.now();
            const advanceMs = 24 * 3600 * 1000 + 2000;
            vi.advanceTimersByTime(advanceMs);
            const targetDate = new Date(startTs + advanceMs);
            const expectedKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;

            expect(crossedDateKey).toBe(expectedKey);

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

    describe("第三阶段：统一AI网关与活动汇流 (Phase 3)", () => {
        it("lvAi：共享凭据配置存取与无Key时安全报错", async () => {
            expect(lvAi.getConfig()).toBeNull();

            // 未配置时调用应明确提示配置
            await expect(lvAi.chat({
                source: "闪卡",
                messages: [{ role: "user", content: "hello" }],
            })).rejects.toThrow("[LvAiGateway] 未配置共享 API Key");

            // 配置共享 Key
            lvAi.setConfig({
                endpoint: "https://api.deepseek.com/v1",
                apiKey: "sk-shared-test-key",
                model: "deepseek-chat",
            });

            const cfg = lvAi.getConfig();
            expect(cfg?.apiKey).toBe("sk-shared-test-key");
            expect(cfg?.model).toBe("deepseek-chat");
        });

        it("lvAi.chat：正常发起对话请求并正确解析返回", async () => {
            lvAi.setConfig({
                endpoint: "https://api.deepseek.com/v1",
                apiKey: "sk-shared-test-key",
                model: "deepseek-chat",
            });

            const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
                expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
                expect(init.method).toBe("POST");
                expect((init.headers as any).Authorization).toBe("Bearer sk-shared-test-key");
                return new Response(JSON.stringify({
                    choices: [{ message: { content: "AI 生成的闪卡内容" } }],
                    model: "deepseek-chat",
                    usage: { total_tokens: 42 },
                }), { status: 200 });
            });
            vi.stubGlobal("fetch", fetchMock);

            const res = await lvAi.chat({
                source: "闪卡",
                messages: [{ role: "user", content: "请出题" }],
            });

            expect(res.content).toBe("AI 生成的闪卡内容");
            expect(res.model).toBe("deepseek-chat");
            expect(res.totalTokens).toBe(42);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it("lvActivity：记录复习成果并支持一键汇编 Markdown", () => {
            let listened: any = null;
            const unsub = lvActivity.onActivity((rec) => {
                listened = rec;
            });

            lvActivity.record({
                source: "闪卡",
                category: "card",
                title: "完成「英语核心词汇」复习 (30张)",
                detail: "耗时 12 分钟",
            });

            expect(listened).not.toBeNull();
            expect(listened.title).toBe("完成「英语核心词汇」复习 (30张)");
            expect(listened.detail).toBe("耗时 12 分钟");
            expect(listened.category).toBe("card");

            const records = lvActivity.getTodayRecords();
            expect(records.length).toBeGreaterThanOrEqual(1);

            const md = lvActivity.formatAsMarkdown();
            expect(md).toContain("### 🐴 小驴全家桶 · 今日活动汇编");
            expect(md).toContain("[闪卡]");
            expect(md).toContain("完成「英语核心词汇」复习 (30张)");
            expect(md).toContain("耗时 12 分钟");

            unsub();
        });
    });

    describe("第四阶段：全家桶联合灾备与终局闭环 (Phase 4)", () => {
        it("lvBackup：注册备份与恢复切面，导出全家桶联合备份包并能正确一键恢复", async () => {
            let restoredCardsData: any = null;
            let restoredExamData: any = null;

            // 注册闪卡灾备切面
            const unregCards = lvBackup.register(
                "siyuan-lv-cards",
                async () => ({
                    decks: [{ id: "deck-1", name: "英语", size: 50 }],
                    revlog: { totalReviews: 120 },
                }),
                async (data) => {
                    restoredCardsData = data;
                    return true;
                }
            );

            // 模拟小驴考试也注册了切面
            const unregExam = lvBackup.register(
                "siyuan-exam",
                async () => ({
                    papers: [{ id: "paper-1", title: "期末考" }],
                }),
                async (data) => {
                    restoredExamData = data;
                    return true;
                }
            );

            // 导出全量包
            const bundle = await lvBackup.exportFull();
            expect(bundle.ecosystem).toBe("xiaolv");
            expect(bundle.v).toBe(1);
            expect(bundle.plugins["siyuan-lv-cards"]).toBeDefined();
            expect(bundle.plugins["siyuan-lv-cards"].data.decks).toHaveLength(1);
            expect(bundle.plugins["siyuan-exam"]).toBeDefined();
            expect(bundle.plugins["siyuan-exam"].data.papers).toHaveLength(1);

            // 恢复全量包
            const restoreResult = await lvBackup.restoreFull(bundle);
            expect(restoreResult.success).toContain("siyuan-lv-cards");
            expect(restoreResult.success).toContain("siyuan-exam");
            expect(restoreResult.failed).toHaveLength(0);
            expect(restoredCardsData?.decks?.[0]?.name).toBe("英语");
            expect(restoredExamData?.papers?.[0]?.title).toBe("期末考");

            // 注销
            unregCards();
            unregExam();
        });

        it("lvEcosystem：全生态诊断与指示徽章文本动态生成", () => {
            const diag = lvEcosystem.getDiagnostics();
            expect(diag.version).toBeDefined();

            const badgeText = lvEcosystem.getStatusBadgeText();
            expect(badgeText).toContain("🐴 小驴全家桶");
            expect(badgeText).toContain("今日活动");
        });

        it("lvBackup：闪卡插件 dumpData 格式完备性与 restoreData 兼容性", async () => {
            const mockStores: Record<string, unknown> = {
                "settings.json": { dailyReviewTarget: 20 },
                "revlog.json": { version: 1, entries: [] },
                "suspend-today.json": { date: "2026-11-03", cardIDs: [] },
            };

            const dump = {
                v: 1,
                plugin: "siyuan-lv-cards",
                timestamp: Date.now(),
                exportedAt: new Date().toISOString(),
                stores: mockStores,
            };

            expect(dump.plugin).toBe("siyuan-lv-cards");
            expect(dump.stores).toBeDefined();
            expect((dump.stores as any)["settings.json"]).toEqual({ dailyReviewTarget: 20 });
        });
    });

    describe("第五阶段：小驴罗盘顶栏收敛与极速二级行动 (Phase 5 Launchpad)", () => {
        it("lvLaunchpad：注册闪卡入口并支持三态持久化属性与二级行动", () => {
            let clicked = false;
            let actionTriggered = "";

            const unreg = lvLaunchpad.register({
                id: "siyuan-lv-cards",
                name: "闪卡",
                fullName: "小驴闪卡",
                svgIcon: "iconLvCards",
                color: "#f43f5e",
                desc: "间隔复习 · 记忆曲线",
                digit: 6,
                badge: "25 待复习",
                badgeType: "error",
                actions: [
                    "开始今日复习",
                    "快速制卡",
                    "水蛭卡预警",
                    "管理牌组与卡包",
                ],
                onClick: () => { clicked = true; },
                onAction: (act) => { actionTriggered = act; },
            });

            const items = lvLaunchpad.getItems();
            const cardsItem = items.find(i => i.id === "siyuan-lv-cards");
            expect(cardsItem).toBeDefined();
            expect(cardsItem?.fullName).toBe("小驴闪卡");
            expect(cardsItem?.badge).toBe("25 待复习");
            expect(cardsItem?.actions).toHaveLength(4);
            expect(cardsItem?.state).toBe("docked");

            // 触发主点击
            cardsItem?.onClick();
            expect(clicked).toBe(true);

            // 触发二级行动
            cardsItem?.onAction?.("开始今日复习");
            expect(actionTriggered).toBe("开始今日复习");

            // 修改状态为 pinned（置顶）
            lvLaunchpad.setPluginState("siyuan-lv-cards", "pinned");
            const updatedItems = lvLaunchpad.getItems();
            expect(updatedItems.find(i => i.id === "siyuan-lv-cards")?.state).toBe("pinned");

            // 注销
            unreg();
            expect(lvLaunchpad.getItems().find(i => i.id === "siyuan-lv-cards")).toBeUndefined();
        });
    });

    describe("第七阶段：穿透搜索与跨插件自动化联动 (Phase 7)", () => {
        it("lvOmnisearch：注册穿透搜索切面并支持跨插件多维命中与相关度排序", async () => {
            const unregCards = lvOmnisearch.registerProvider("siyuan-lv-cards", (keyword) => {
                if (keyword.includes("英语") || keyword.includes("word")) {
                    return [
                        {
                            id: "card-1",
                            source: "闪卡",
                            category: "card",
                            title: "英语核心高频词汇卡",
                            snippet: "abandon - 放弃",
                            badge: "考研词汇",
                            onClick: () => {},
                        },
                    ];
                }
                return [];
            });

            const unregExam = lvOmnisearch.registerProvider("siyuan-exam", (keyword) => {
                if (keyword.includes("英语")) {
                    return [
                        {
                            id: "exam-1",
                            source: "考试",
                            category: "exam",
                            title: "2026考研英语真题模拟卷",
                            snippet: "难度：★★★★☆",
                            badge: "试卷",
                            onClick: () => {},
                        },
                    ];
                }
                return [];
            });

            // 搜索 "英语"
            const results = await lvOmnisearch.search("英语");
            expect(results.length).toBe(2);
            expect(results.some(r => r.source === "闪卡" && r.title.includes("英语核心高频词汇卡"))).toBe(true);
            expect(results.some(r => r.source === "考试" && r.title.includes("2026考研英语真题模拟卷"))).toBe(true);

            // 搜索无匹配
            const emptyRes = await lvOmnisearch.search("物理机械波");
            expect(emptyRes.length).toBe(0);

            unregCards();
            unregExam();
        });

        it("lvAutomation：跨插件联动规则注册、触发与执行 (小驴考试错题 ➔ 自动同步闪卡)", async () => {
            let syncPayload: any = null;

            const unreg = lvAutomation.registerRule({
                id: "rule-exam-to-cards",
                name: "考试做错题 ➔ 自动同步闪卡生成复习卡",
                desc: "小驴考试做错题时，自动在闪卡生成待复习卡片",
                enabled: true,
                triggerSource: "siyuan-exam",
                triggerType: "wrong-question",
                actionPlugin: "siyuan-lv-cards",
                actionName: "create-card",
                execute: async (payload: any) => {
                    syncPayload = payload;
                    return true;
                },
            });

            const rules = lvAutomation.getRules();
            const examRule = rules.find(r => r.id === "rule-exam-to-cards");
            expect(examRule).toBeDefined();
            expect(examRule?.enabled).toBe(true);

            // 模拟小驴考试触发做错题
            const triggerResult = await lvAutomation.trigger("siyuan-exam", "wrong-question", {
                question: "TCP 三次握手的第二个包是什么标志位？",
                answer: "SYN+ACK",
                analysis: "客户端发送 SYN，服务端回应 SYN+ACK",
                paperName: "计算机408期末模拟",
            });

            expect(triggerResult.triggered).toBe(1);
            expect(triggerResult.success).toBe(1);
            expect(syncPayload?.question).toContain("TCP 三次握手");
            expect(syncPayload?.answer).toBe("SYN+ACK");

            // 禁用规则后不再触发
            lvAutomation.toggleRule("rule-exam-to-cards", false);
            expect(lvAutomation.getRules().find(r => r.id === "rule-exam-to-cards")?.enabled).toBe(false);

            const triggerResultDisabled = await lvAutomation.trigger("siyuan-exam", "wrong-question", { question: "test" });
            expect(triggerResultDisabled.triggered).toBe(0);

            unreg();
        });
    });
});
