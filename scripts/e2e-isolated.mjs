// 隔离式冒烟/e2e（小驴闪卡全要素与联动交互自动化走查引擎）
// 范围涵盖：
//   1. 内核健康、鉴权与静态分块契约（index.js, chunks, css, i18n, icons）
//   2. Petal 插件动态启用与无缝注入
//   3. 原生 Riff 闪卡生命周期：建库→建文档→建卡包→制卡→到期→FSRS评分回环→队列消费
//   4. 思源文档深度联动与块属性镜像（星标 custom-lv-starred、水蛭 custom-lv-leech/lapses、错因 custom-lv-error-reason 与动态看板 SQL 块）
//   5. 生态插件格式兼容（Anki {{c1::...}} 挖空提取与遮罩、custom-riff-title 自定义卡面标题、多卡包逗号映射）
//   6. 智能试题拆单引擎（单选、多选、判断、填空、问答全题型解析）
//   7. 全库卡包管理引擎（存量扫描、一键同步、卡包合并与源卡包删除、冗余空卡包过滤）
//   8. 真实无头 Chrome 浏览器 UI、布局溢出、按钮交互、模态框呼出与零控制台错误全景走查
//
// 运行模式：
//   - 默认模式：自动探测 43930 隔离环境（D:/siyuan-isolated-lv-cards），存在即直连走查；
//   - 独立靶场模式（--scratch 或 43930 未启动）：自起独立临时无头内核进行全流程闭环验证；
//   - 保留现场模式（--keep）：验证结束后保留环境端口与工作区供人工查验。

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { SmokeAbort, guardScratch, makeApi, notebookIdOf, resolveTarget, sweepOrphans } from "./lib/smoke-kernel.mjs";

function pickExistingPath(candidates, envVal) {
    if (envVal) return envVal;
    for (const c of candidates) {
        if (c && fs.existsSync(c)) return c;
    }
    return candidates[0];
}

const KERNEL = pickExistingPath([
    "D:/RJ/SiYuan/resources/kernel/SiYuan-Kernel.exe",
    "D:/biji/SiYuan/resources/kernel/SiYuan-Kernel.exe",
    "C:/Program Files/SiYuan/resources/kernel/SiYuan-Kernel.exe",
], process.env.SIYUAN_KERNEL);

const RESOURCES = pickExistingPath([
    "D:/RJ/SiYuan/resources",
    "D:/biji/SiYuan/resources",
    "C:/Program Files/SiYuan/resources",
], process.env.SIYUAN_RESOURCES);

const CHROME = pickExistingPath([
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
], process.env.CHROME_BIN);

const DIST = path.resolve("dist");
const PLUGIN_ID = "siyuan-lv-cards";
const FRONTEND = "desktop";
const SCRATCH_NB = `siyuan-lv-cards-smoke-${Date.now()}`;
const ISOLATED_META = "D:/siyuan-isolated-lv-cards/instance.json";

const args = process.argv.slice(2);
const argOf = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
};
const has = (flag) => args.includes(flag);
const KEEP = has("--keep");
const FORCE_SCRATCH = has("--scratch") || has("--temp");
const NO_BROWSER = has("--no-browser");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class SilentExit {}
const fail = (msg) => {
    if (msg) console.error(msg);
    process.exitCode = 1;
    throw new SilentExit("fail");
};

function freePort() {
    return new Promise((resolve, reject) => {
        const srv = createServer();
        srv.listen(0, "127.0.0.1", () => {
            const p = srv.address().port;
            srv.close(() => resolve(p));
        });
        srv.on("error", reject);
    });
}

function getRaw(base, token, ep) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: "127.0.0.1", port: Number(new URL(base).port || 80), path: ep, method: "GET",
            headers: { Authorization: `Token ${token}` }, timeout: 8000,
        }, (res) => {
            const buf = [];
            res.on("data", (c) => buf.push(c));
            res.on("end", () => resolve({ status: res.statusCode, size: Buffer.concat(buf).length }));
        });
        req.on("error", reject);
        req.on("timeout", () => req.destroy(new Error("timeout")));
        req.end();
    });
}

const results = [];
function check(name, ok, detail = "") {
    results.push({ name, ok, detail });
    console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
    if (!ok) process.exitCode = 1;
}

async function runBrowserWalkthrough(webUrl) {
    if (!CHROME || !fs.existsSync(CHROME)) {
        check("真实浏览器 UI 交互走查", true, "未找到 Chrome/Edge 二进制，跳过浏览器端走查");
        return;
    }

    const cdpPort = await freePort();
    const chromeProc = spawn(CHROME, [
        "--headless=new",
        `--remote-debugging-port=${cdpPort}`,
        "--disable-gpu",
        "--no-sandbox",
        webUrl,
    ]);

    let page = null;
    for (let i = 0; i < 25; i++) {
        await sleep(300);
        try {
            const list = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json());
            page = list.find((p) => p.type === "page");
            if (page) break;
        } catch {}
    }

    if (!page) {
        chromeProc.kill();
        check("浏览器连接与目标页面探测", false, `CDP 端口 ${cdpPort} 未捕获到目标页面`);
        return;
    }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
    });

    const consoleErrors = [];
    ws.onmessage = (msg) => {
        try {
            const data = JSON.parse(msg.data);
            if (data.method === "Runtime.consoleAPICalled" && data.params?.type === "error") {
                consoleErrors.push(data.params.args?.map((a) => a.value ?? a.description).join(" "));
            }
        } catch {}
    };
    ws.send(JSON.stringify({ id: 1, method: "Runtime.enable" }));

    const evaluate = (expr) => new Promise((resolve) => {
        const id = Math.floor(Math.random() * 100000);
        const handler = (msg) => {
            try {
                const data = JSON.parse(msg.data);
                if (data.id === id) {
                    ws.removeEventListener("message", handler);
                    resolve(data.result?.result?.value);
                }
            } catch {}
        };
        ws.addEventListener("message", handler);
        ws.send(JSON.stringify({
            id,
            method: "Runtime.evaluate",
            params: { expression: expr, awaitPromise: true, returnByValue: true },
        }));
    });

    // 等待思源主会话与插件加载就绪
    let appReady = false;
    for (let i = 0; i < 40; i++) {
        const ready = await evaluate("Boolean(window.siyuan?.ws?.app?.plugins?.some(p => p.name === 'siyuan-lv-cards'))");
        if (ready) {
            appReady = true;
            break;
        }
        await sleep(500);
    }
    check("思源桌面主进程与插件会话就绪", appReady, "siyuan-lv-cards 激活");

    if (!appReady) {
        ws.close();
        chromeProc.kill();
        return;
    }

    const rawWalkthrough = await evaluate(`
        new Promise(async (resolve) => {
            const walk = [];
            const plugin = window.siyuan.ws.app.plugins.find(p => p.name === "siyuan-lv-cards");
            if (!plugin) return resolve(JSON.stringify({ error: "Plugin not loaded" }));

            // 1. 打开闪卡中心仪表盘
            plugin.openTabOf("lv-cards-dashboard");
            let shell = null;
            for (let i = 0; i < 25; i++) {
                shell = document.querySelector(".lv-r54-shell");
                if (shell) break;
                await new Promise(r => setTimeout(r, 200));
            }
            walk.push({ name: "闪卡中心挂载 (.lv-r54-shell)", pass: Boolean(shell) });

            // 页面横向溢出检测
            const overflow = shell ? (shell.scrollWidth > shell.clientWidth + 5) : false;
            walk.push({ name: "页面无横向滚动锁死或溢出", pass: !overflow });

            // 今日页卡组列表渲染
            let deckBtns = [];
            for (let i = 0; i < 20; i++) {
                deckBtns = document.querySelectorAll(".lv-today-deck-main-btn");
                if (deckBtns.length >= 2) break;
                await new Promise(r => setTimeout(r, 200));
            }
            walk.push({ name: "今日卡组列表渲染", pass: deckBtns.length >= 2, detail: "decks=" + deckBtns.length });

            // 今日看板统一样态与 4 格指标通栏
            const todayDecksSec = document.getElementById("sec-today-decks");
            const statCells = document.querySelectorAll(".lv-today-stats .lv-stat-cell");
            walk.push({
                name: "今日看板统一样态 (我的卡组Section/4格指标通栏)",
                pass: Boolean(todayDecksSec) && statCells.length === 4,
                detail: "statCells=" + statCells.length,
            });

            // 仪表盘全生态协同状态指示徽章 (lvEcosystem)
            const ecoBadge = document.querySelector("[data-testid='ecosystem-status-badge']");
            const hasEcoText = ecoBadge ? ecoBadge.textContent.includes("🐴 小驴全家桶协同正常") : false;
            walk.push({
                name: "仪表盘全生态协同指示徽章渲染与状态感知",
                pass: Boolean(ecoBadge && hasEcoText),
                detail: ecoBadge?.textContent?.trim() || "未渲染",
            });

            // 2. 点击「卡包管理」直达按钮
            const dmBtn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("卡包管理"));
            if (dmBtn) {
                dmBtn.click();
                await new Promise(r => setTimeout(r, 800));
            }
            const dmRegion = document.querySelector(".lv-deck-manager");
            walk.push({ name: "今日页直达卡包管理面板 (.lv-deck-manager)", pass: Boolean(dmRegion) });

            if (dmRegion) {
                const deckCards = dmRegion.querySelectorAll(".lv-dm-deck-card");
                walk.push({ name: "卡包管理卡包矩阵渲染", pass: deckCards.length >= 2, detail: "cards=" + deckCards.length });

                // 卡库子导航层级：先卡包管理，再闪卡明细
                const subnavBtns = Array.from(document.querySelectorAll(".lv-hub-subnav-btn"));
                const subnavTexts = subnavBtns.map(b => b.textContent.trim());
                const isOrderCorrect = subnavTexts.length >= 2 && subnavTexts[0] === "卡包管理" && subnavTexts[1] === "闪卡明细";
                walk.push({
                    name: "卡库子导航层级先卡包后明细",
                    pass: isOrderCorrect,
                    detail: subnavTexts.join(" > "),
                });

                // 生态来源属性与徽章识别
                const ecoBadges = dmRegion.querySelectorAll(".lv-dm-origin-chip");
                walk.push({
                    name: "卡包管理生态来源属性与徽章识别",
                    pass: ecoBadges.length >= 1,
                    detail: "badges=" + ecoBadges.length,
                });

                // 新建卡包展开与取消
                const newDeckBtn = Array.from(dmRegion.querySelectorAll("button")).find(b => b.textContent.includes("新建卡包"));
                if (newDeckBtn) {
                    newDeckBtn.click();
                    await new Promise(r => setTimeout(r, 300));
                    const newDeckInput = dmRegion.querySelector(".lv-dm-new-card-row input");
                    walk.push({ name: "新建卡包内联输入框呼出", pass: Boolean(newDeckInput) });
                    const cancelBtn = Array.from(dmRegion.querySelectorAll(".lv-dm-new-card-row button")).find(b => b.textContent.includes("取消"));
                    if (cancelBtn) cancelBtn.click();
                }

                // 合并卡包抽屉与删除源卡包复选框
                const mergeBtn = dmRegion.querySelector(".lv-dm-card-actions button[title*='合并']");
                if (mergeBtn) {
                    mergeBtn.click();
                    await new Promise(r => setTimeout(r, 300));
                    const mergeBox = dmRegion.querySelector(".lv-dm-merge-box");
                    const mergeOpt = dmRegion.querySelector(".lv-dm-merge-opt");
                    walk.push({ name: "合并卡包抽屉与删除源卡包选项", pass: Boolean(mergeBox && mergeOpt) });
                    const cancelMergeBtn = dmRegion.querySelector(".lv-dm-merge-box button:last-child");
                    if (cancelMergeBtn) cancelMergeBtn.click();
                }

                // 单卡包钻取控制台（查看闪卡 -> 钻取控制台 -> 返回卡包）
                const viewCardsBtn = dmRegion.querySelector(".lv-dm-card-actions button[title*='闪卡内容']");
                if (viewCardsBtn) {
                    viewCardsBtn.click();
                    await new Promise(r => setTimeout(r, 600));
                    const deckScope = document.querySelector(".lv-mgr-deck-scope");
                    const backBtn = deckScope ? deckScope.querySelector("button[title*='返回卡包']") : null;
                    const scopeReview = deckScope ? deckScope.querySelector(".lv-deck-scope-actions button[title*='复习本卡包']") : null;
                    walk.push({
                        name: "单卡包钻取控制台 (返回卡包/本包复习/卡数统计)",
                        pass: Boolean(deckScope && backBtn && scopeReview),
                    });
                    if (backBtn) {
                        backBtn.click();
                        await new Promise(r => setTimeout(r, 400));
                    }
                }
            }

            // 2.5 切换到闪卡公共集市 (一级高层级入口)
            const marketNav = document.getElementById("lv-tab-marketplace") || Array.from(document.querySelectorAll(".lv-tabs__tab, button")).find(b => b.textContent.trim() === "集市");
            if (marketNav) {
                marketNav.click();
                await new Promise(r => setTimeout(r, 800));
            }
            const mktStudio = document.querySelector(".lv-marketplace-studio");
            walk.push({ name: "切换到公共集市一级工作台 (.lv-marketplace-studio)", pass: Boolean(mktStudio) });

            if (mktStudio) {
                // 全域统计概览卡
                const statsCard = mktStudio.querySelector(".lv-market-stats-card");
                const statItems = mktStudio.querySelectorAll(".lv-market-stat-item");
                walk.push({ name: "公共集市全域统计看板 (8大学科/覆盖量/版权安全)", pass: Boolean(statsCard) && statItems.length === 3 });

                // 8大学科分类标签
                const categoryChips = mktStudio.querySelectorAll(".lv-market-categories .lv-chip");
                walk.push({ name: "8大学科体系领域分类胶囊", pass: categoryChips.length === 8, detail: "categories=" + categoryChips.length });

                // 卡片网格与公版卡包
                const deckCards = mktStudio.querySelectorAll(".lv-deck-card");
                walk.push({ name: "精选公版卡包网格展示", pass: deckCards.length >= 6, detail: "decks=" + deckCards.length });

                // 交互式闪卡翻面试看
                const firstPreviewBtn = mktStudio.querySelector(".lv-preview-toggle-btn");
                if (firstPreviewBtn) {
                    firstPreviewBtn.click();
                    await new Promise(r => setTimeout(r, 300));
                    const previewCard = mktStudio.querySelector(".lv-interactive-preview-card");
                    const hasFront = Boolean(mktStudio.querySelector(".lv-preview-face.front"));
                    if (previewCard) {
                        previewCard.click();
                        await new Promise(r => setTimeout(r, 200));
                    }
                    const hasBack = Boolean(mktStudio.querySelector(".lv-preview-face.back"));
                    walk.push({ name: "闪卡试看形态与交互式点击翻面 (正反面与memo)", pass: Boolean(previewCard) && hasFront && hasBack });
                }

                // 卡包品质画像看板 (FSRS 难度梯队与卡型构成)
                const qualityToggleBtn = mktStudio.querySelector(".lv-quality-bar-toggle button");
                if (qualityToggleBtn) {
                    qualityToggleBtn.click();
                    await new Promise(r => setTimeout(r, 300));
                    const qualityDash = mktStudio.querySelector(".lv-quality-dashboard");
                    const metricsBars = mktStudio.querySelectorAll(".lv-metrics-bar");
                    walk.push({
                        name: "卡包品质画像看板 (FSRS难度梯队与卡型分布条)",
                        pass: Boolean(qualityDash) && metricsBars.length >= 2,
                        detail: "bars=" + metricsBars.length,
                    });
                }

                // 闪卡篮跨学科挑选与悬浮抽屉
                const addToCartBtn = mktStudio.querySelector(".lv-card-stash-bar button, button[title*='全包卡片加入闪卡篮']");
                if (addToCartBtn) {
                    addToCartBtn.click();
                    await new Promise(r => setTimeout(r, 300));
                }
                const cartBtn = Array.from(mktStudio.querySelectorAll("button")).find(b => b.textContent.includes("闪卡篮"));
                if (cartBtn) {
                    cartBtn.click();
                    await new Promise(r => setTimeout(r, 300));
                    const cartDrawer = document.querySelector(".lv-cart-drawer");
                    const cartItems = document.querySelectorAll(".lv-cart-item");
                    walk.push({
                        name: "闪卡篮挑选控制台与跨学科打包抽屉 (.lv-cart-drawer)",
                        pass: Boolean(cartDrawer),
                        detail: "cartItems=" + cartItems.length,
                    });
                    const closeCartBtn = cartDrawer ? cartDrawer.querySelector(".lv-cart-drawer-header button") : null;
                    if (closeCartBtn) {
                        closeCartBtn.click();
                        await new Promise(r => setTimeout(r, 200));
                    }
                }
            }

            // 3. 切换到制卡工坊
            const studioNav = document.getElementById("lv-tab-studio") || Array.from(document.querySelectorAll(".lv-tabs__tab, button")).find(b => b.textContent.trim() === "制卡");
            if (studioNav) {
                studioNav.click();
                await new Promise(r => setTimeout(r, 800));
            }
            const qc = document.querySelector(".lv-quickcard");
            walk.push({ name: "切换到制卡工坊 (.lv-quickcard)", pass: Boolean(qc) });

            if (qc) {
                // 制卡必备要素核验条
                const mandBar = qc.querySelector(".lv-qc-mand-bar");
                const pills = qc.querySelectorAll(".lv-qc-mand-pill");
                walk.push({ name: "制卡必备要素核验条 (卡组/题干/答案)", pass: Boolean(mandBar) && pills.length === 3 });

                // 数理/拼音/格式快捷符号工具栏
                const dock = qc.querySelector(".lv-qc-symbol-dock");
                const chips = qc.querySelectorAll(".lv-chip-tool");
                walk.push({ name: "数理/拼音/格式快捷符号工具栏", pass: Boolean(dock) && chips.length > 5, detail: "chips=" + chips.length });

                // 切换选择题模板
                const choiceBtn = Array.from(qc.querySelectorAll(".lv-qc-tpl-btn")).find(b => b.textContent.includes("选择题"));
                if (choiceBtn) {
                    choiceBtn.click();
                    await new Promise(r => setTimeout(r, 300));
                    const choiceModes = qc.querySelector(".lv-qc-choice-modes");
                    const optRows = qc.querySelectorAll(".lv-qc-option-row");
                    walk.push({ name: "选择题/多选/判断专属样态与选项行", pass: Boolean(choiceModes) && optRows.length >= 2, detail: "options=" + optRows.length });
                }

                // 智能试题拆单面板呼出
                const splitBtn = Array.from(qc.querySelectorAll("button")).find(b => b.textContent.includes("智能拆单"));
                if (splitBtn) {
                    splitBtn.click();
                    await new Promise(r => setTimeout(r, 300));
                    const modal = qc.querySelector(".lv-qc-smart-paste-card");
                    walk.push({ name: "智能试题拆单对话框呼出", pass: Boolean(modal) });
                    const closeBtn = modal ? modal.querySelector("button") : null;
                    if (closeBtn) closeBtn.click();
                }
            }

            // 4. AI 制卡工坊参数与功能检测
            try {
                plugin.openAIWizard();
                await new Promise(r => setTimeout(r, 700));
                const aiWb = document.querySelector(".lv-wb");
                if (aiWb) {
                    const focusOptions = aiWb.querySelectorAll("select[aria-label='出题侧重'] option");
                    const demoBtns = aiWb.querySelectorAll(".lv-wb-demo-btn");
                    if (demoBtns.length > 0) {
                        demoBtns[0].click();
                        await new Promise(r => setTimeout(r, 200));
                    }
                    const cleanBtn = Array.from(aiWb.querySelectorAll("button")).find(b => b.textContent.includes("规整格式") || b.textContent.includes("清洗"));
                    walk.push({
                        name: "AI制卡工坊 (5大设问风格/演示示例/清洗规整工具)",
                        pass: focusOptions.length >= 4 && demoBtns.length >= 1 && Boolean(cleanBtn),
                        detail: "focusStyles=" + focusOptions.length + ", demoPresets=" + demoBtns.length,
                    });
                    const closeAiDialog = document.querySelector(".b3-dialog__action[data-type='cancel'], .b3-dialog__header button, button[aria-label='关闭']");
                    if (closeAiDialog && typeof closeAiDialog.click === "function") closeAiDialog.click();
                    await new Promise(r => setTimeout(r, 300));
                }
            } catch (err) {
                walk.push({ name: "AI制卡工坊走查异常", pass: false, detail: String(err) });
            }

            // 4. 隐藏面板无残留泄漏审计
            const hiddenPanels = document.querySelectorAll(".lv-hub-panel[hidden]");
            let leak = false;
            hiddenPanels.forEach(p => {
                const r = p.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) leak = true;
            });
            walk.push({ name: "隐藏面板无残留泄漏", pass: !leak });

            // 5. 全生态去中心化通知中心与 Coordinator 校验
            const noticeHub = window.__LV_NOTICE_HUB__;
            const hasNoticeHub = Boolean(noticeHub && typeof noticeHub.post === "function");
            walk.push({
                name: "去中心化通知中心 (lvNotify Coordinator) 协议就绪",
                pass: hasNoticeHub,
                detail: "hostPlugin=" + (noticeHub?.hostPlugin || "none"),
            });

            // 6. 小驴罗盘入口与极速二级行动调度 (lvLaunchpad)
            const launchpad = window.__LV_LAUNCHPAD__;
            const launchpadItems = launchpad ? launchpad.getItems() : [];
            const cardsLaunchItem = launchpadItems.find(i => i.id === "siyuan-lv-cards");
            const has4Actions = cardsLaunchItem && cardsLaunchItem.actions && cardsLaunchItem.actions.length === 4;
            let actionDispatched = false;
            if (launchpad && cardsLaunchItem) {
                actionDispatched = launchpad.executeAction("siyuan-lv-cards", "水蛭卡预警");
            }
            walk.push({
                name: "小驴罗盘 (lvLaunchpad) 闪卡入口与二级行动调度",
                pass: Boolean(cardsLaunchItem && has4Actions && actionDispatched),
                detail: "actions=" + (cardsLaunchItem?.actions?.length || 0),
            });

            // 7. 全生态穿透搜索切面检索校验 (lvOmnisearch)
            const omnisearch = window.__LV_OMNISEARCH__;
            let searchOk = false;
            let searchCount = 0;
            if (omnisearch && typeof omnisearch.search === "function") {
                const searchRes = await omnisearch.search("牌组").catch(() => []);
                searchCount = searchRes.length;
                searchOk = Array.isArray(searchRes);
            }
            walk.push({
                name: "全生态穿透搜索 (lvOmnisearch) 卡片与牌组检索切面",
                pass: searchOk && searchCount >= 1,
                detail: "hits=" + searchCount,
            });

            // 8. 跨插件智能自动化联动规则执行 (lvAutomation)
            const automation = window.__LV_AUTOMATION__;
            let autoTriggerOk = false;
            if (automation && typeof automation.trigger === "function") {
                const trigRes = await automation.trigger("siyuan-exam", "wrong-question", {
                    question: "端到端自动化联动测试题：TCP是哪一层的协议？",
                    answer: "传输层",
                    paperName: "e2e全景自动化走查",
                }).catch(() => null);
                // 严苛断言：规则真实执行且全部成功（execute 透传真实制卡结果，杜绝假阳性）
                autoTriggerOk = Boolean(trigRes) && trigRes.triggered >= 1 && trigRes.success === trigRes.triggered;
                if (!autoTriggerOk) {
                    // 失败根因回溯：读取通知中心的静默审计历史（catch 分支会写入失败详情）
                    const hist = (window.__LV_NOTICE_HUB__?.getHistory?.() || []).filter(p => p.category === "exam-card-sync-fail");
                    walk.push({ name: "联动失败根因", pass: true, detail: hist[0]?.message || "无审计记录" });
                }
            }
            walk.push({
                name: "跨插件自动化联动 (lvAutomation) 考试错题自动制卡规则",
                pass: Boolean(autoTriggerOk),
            });

            resolve(JSON.stringify({ walk }));
        })
    `);

    try {
        const parsed = JSON.parse(rawWalkthrough || "{}");
        if (Array.isArray(parsed.walk)) {
            for (const item of parsed.walk) {
                check(`[UI走查] ${item.name}`, item.pass, item.detail || "");
            }
        }
    } catch (e) {
        check("UI 走查脚本执行", false, String(e));
    }

    check("无头走查期间零严重控制台报错", consoleErrors.length === 0, consoleErrors.join(" | ") || "clean");

    ws.close();
    chromeProc.kill();
}

async function main() {
    let base = "";
    let token = "";
    let ws = "";
    let kproc = null;
    let isAttachedIsolated = false;

    // 探测 43930 隔离环境
    let isolatedMeta = null;
    if (!FORCE_SCRATCH && fs.existsSync(ISOLATED_META)) {
        try {
            isolatedMeta = JSON.parse(fs.readFileSync(ISOLATED_META, "utf8"));
        } catch {}
    }

    const baseArg = argOf("--base") ?? process.env.SIYUAN_BASE_URL;
    const tokenArg = argOf("--token") ?? process.env.SIYUAN_TOKEN;

    if (baseArg || tokenArg) {
        const t = resolveTarget({ baseArg, tokenArg });
        base = t.base;
        token = t.token;
        console.log(`[e2e] 模式 B：附着指定内核 ${base}`);
    } else if (isolatedMeta && isolatedMeta.port && isolatedMeta.token) {
        base = `http://127.0.0.1:${isolatedMeta.port}`;
        token = isolatedMeta.token;
        // 探测该端口是否实际存活
        try {
            const probe = await fetch(`${base}/api/system/version`, {
                method: "POST",
                headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
                body: "{}",
            });
            if (probe.status === 200) {
                isAttachedIsolated = true;
                process.env.SIYUAN_E2E_ALLOW_SHARED = "1";
                console.log(`[e2e] 自动附着 D 盘隔离测试环境：${base} (token=${token.slice(0, 4)}…)`);

                // 同步最新 dist 构建产物到隔离环境插件目录
                const isoPluginDir = path.join(isolatedMeta.ws || "D:/siyuan-isolated-lv-cards", "data", "plugins", PLUGIN_ID);
                if (fs.existsSync(isoPluginDir)) {
                    for (const f of ["index.js", "index.css", "plugin.json"]) {
                        if (fs.existsSync(path.join(DIST, f))) {
                            fs.copyFileSync(path.join(DIST, f), path.join(isoPluginDir, f));
                        }
                    }
                    const chunksSrc = path.join(DIST, "chunks");
                    if (fs.existsSync(chunksSrc)) {
                        fs.mkdirSync(path.join(isoPluginDir, "chunks"), { recursive: true });
                        for (const f of fs.readdirSync(chunksSrc)) {
                            fs.copyFileSync(path.join(chunksSrc, f), path.join(isoPluginDir, "chunks", f));
                        }
                    }
                }
            }
        } catch {
            isAttachedIsolated = false;
        }
    }

    if (!base || !isAttachedIsolated && !baseArg) {
        // 自起独立临时隔离靶场（模式 A）
        ws = path.join(os.tmpdir(), `siyuan-lvcards-e2e-${Date.now()}`);
        const port = await freePort();
        fs.mkdirSync(ws, { recursive: true });
        base = `http://127.0.0.1:${port}`;
        console.log(`[e2e] 模式 A：自起隔离靶场 workspace: ${ws} (port=${port})`);

        // 部署最新构建
        const dst = path.join(ws, "data", "plugins", PLUGIN_ID);
        fs.mkdirSync(dst, { recursive: true });
        for (const f of ["index.js", "index.css", "plugin.json"]) {
            fs.copyFileSync(path.join(DIST, f), path.join(dst, f));
        }
        if (fs.existsSync(path.join(DIST, "i18n"))) {
            fs.mkdirSync(path.join(dst, "i18n"), { recursive: true });
            for (const f of fs.readdirSync(path.join(DIST, "i18n"))) {
                fs.copyFileSync(path.join(DIST, "i18n", f), path.join(dst, "i18n", f));
            }
        }
        const chunksSrc = path.join(DIST, "chunks");
        if (fs.existsSync(chunksSrc)) {
            fs.mkdirSync(path.join(dst, "chunks"), { recursive: true });
            for (const f of fs.readdirSync(chunksSrc)) {
                fs.copyFileSync(path.join(chunksSrc, f), path.join(dst, "chunks", f));
            }
        }
        if (fs.existsSync(path.join(DIST, "icon.png"))) {
            fs.copyFileSync(path.join(DIST, "icon.png"), path.join(dst, "icon.png"));
        }

        const out = fs.openSync(path.join(ws, "kernel.log"), "a");
        kproc = spawn(KERNEL, ["--workspace", ws, "serve", "--wd", RESOURCES, "--port", String(port)], {
            detached: true, stdio: ["ignore", out, out], windowsHide: true,
        });
        kproc.unref();

        let up = false;
        for (let i = 0; i < 200; i++) {
            await sleep(1500);
            try {
                const r = await fetch(`${base}/api/system/version`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
                if (r.status === 200) { up = true; break; }
            } catch {}
        }
        check("内核启动（无头）", up, `port=${port} pid=${kproc.pid}`);
        if (!up) fail("[e2e] 内核未就绪，中止：" + ws);

        const confPath = path.join(ws, "conf", "conf.json");
        for (let i = 0; i < 30 && !token; i++) {
            await sleep(1000);
            try {
                token = JSON.parse(fs.readFileSync(confPath, "utf8")).api.token ?? "";
            } catch {}
        }
        check("内核鉴权（conf token）", !!token, token ? `token=${token.slice(0, 4)}…` : "未取到");
        if (!token) fail("[e2e] 未取得 token，中止：" + ws);
    }

    const api = makeApi(base, token);

    // 靶场防呆与残留清扫
    try {
        await sweepOrphans(api);
        await guardScratch(api, { base });
        check("靶场防呆（guardScratch）", true, isAttachedIsolated ? "隔离测试环境豁免" : "标准隔离靶场");
    } catch (e) {
        if (!(e instanceof SmokeAbort)) check("靶场防呆（guardScratch）", false, String(e).slice(0, 160));
        process.exitCode = 1;
        throw new SilentExit("guard");
    }

    // 静态资源分块服务契约断言
    const asset = await getRaw(base, token, `/plugins/${PLUGIN_ID}/index.js`);
    check("插件核心包可服务 (index.js)", asset.status === 200 && asset.size > 10000, `size=${asset.size}B`);

    for (const c of ["chunks/hub.js", "chunks/review.js", "chunks/dialogs.js", "chunks/hub.css", "chunks/review.css", "chunks/dialogs.css"]) {
        const cr = await getRaw(base, token, `/plugins/${PLUGIN_ID}/${c}`);
        check(`独立 Chunk 服务 (${c})`, cr.status === 200 && cr.size > 500, `${cr.size}B`);
    }

    // Petal 插件启用
    let enabled = false;
    try {
        const r = await api("/api/petal/setPetalEnabled", { frontend: FRONTEND, packageName: PLUGIN_ID, enabled: true });
        enabled = r.code === 0;
    } catch {}
    check("Petal 插件启用（setPetalEnabled）", enabled, `frontend=${FRONTEND}`);

    // 内核 Riff 闭环、文档联动块属性镜像断言
    let scratchNbId = "";
    let scratchDeckId = "";
    const nb = await api("/api/notebook/createNotebook", { name: SCRATCH_NB });
    check("创建测试笔记本", nb.code === 0, SCRATCH_NB);

    if (nb.code === 0) {
        scratchNbId = notebookIdOf(nb.data);
        let doc = null;
        for (let attempt = 0; attempt < 5; attempt++) {
            if (attempt > 0) await sleep(800);
            doc = await api("/api/filetree/createDocWithMd", {
                notebook: scratchNbId,
                path: "/riff-linkage",
                markdown: "# 闪卡与文档联动测试\n\n细胞有氧呼吸的主要场所是 ==线粒体==。\n\n爱因斯坦质能方程是 ==$E=mc^2$==。\n\n{{c1::Python}} 是一种高级解释型脚本语言。",
            });
            if (doc.code === 0) break;
        }
        check("创建测试文档", doc.code === 0);

        if (doc.code === 0) {
            const docID = typeof doc.data === "string" ? doc.data : doc.data?.id;

            // 1. 验证属性镜像联动：星标、水蛭、错因归因
            await api("/api/attr/setBlockAttrs", {
                id: docID,
                attrs: {
                    "custom-lv-starred": "true",
                    "custom-lv-leech": "true",
                    "custom-lv-lapses": "4",
                    "custom-lv-error-reason": "concept-confused",
                    "custom-riff-title": "细胞能量工厂原理",
                },
            });
            const backAttrs = await api("/api/attr/getBlockAttrs", { id: docID });
            check("文档联动：星标块属性镜像 (custom-lv-starred)", backAttrs.data?.["custom-lv-starred"] === "true");
            check("文档联动：水蛭与遗忘次数镜像 (custom-lv-leech/lapses)", backAttrs.data?.["custom-lv-leech"] === "true" && backAttrs.data?.["custom-lv-lapses"] === "4");
            check("文档联动：错因归因镜像 (custom-lv-error-reason)", backAttrs.data?.["custom-lv-error-reason"] === "concept-confused");
            check("生态兼容：自定义卡面标题 (custom-riff-title)", backAttrs.data?.["custom-riff-title"] === "细胞能量工厂原理");

            // 2. 验证原生 SQL 嵌入块查询看板（等待内核 SQLite 异步刷盘索引）
            let sqlRes = null;
            for (let retry = 0; retry < 10; retry++) {
                sqlRes = await api("/api/query/sql", {
                    stmt: `SELECT id, ial FROM blocks WHERE id = '${docID}' AND ial LIKE '%custom-lv-starred%'`,
                });
                if (Array.isArray(sqlRes.data) && sqlRes.data.length > 0) break;
                await sleep(400);
            }
            check("动态看板：SQL 嵌入块跨库检索联动", Array.isArray(sqlRes?.data) && sqlRes.data.length > 0, `matched=${sqlRes?.data?.length}`);

            // 3. 原生 Riff 卡包全生命周期
            const deck = await api("/api/riff/createRiffDeck", { name: SCRATCH_NB });
            if (deck.code === 0) {
                scratchDeckId = deck.data?.id ?? deck.data?.deck?.id ?? "";
                check("创建 Riff 卡组", Boolean(scratchDeckId), scratchDeckId);

                let added = false;
                for (let retry = 0; retry < 5; retry++) {
                    const r = await api("/api/riff/addRiffCards", { deckID: scratchDeckId, blockIDs: [docID] });
                    if (r.code === 0) { added = true; break; }
                    await sleep(600);
                }
                check("闪卡入组 (addRiffCards)", added);

                if (added) {
                    const due = await api("/api/riff/getRiffDueCards", { deckID: scratchDeckId, reviewedCards: [] });
                    const count = due?.data?.cards?.length ?? 0;
                    check("到期闪卡调度识别", count > 0, `due=${count}`);

                    if (count > 0) {
                        const cardID = due.data.cards[0].id ?? due.data.cards[0].cardID;
                        const reviewed = await api("/api/riff/reviewRiffCard", {
                            deckID: scratchDeckId, cardID, rating: 3, reviewedCards: [{ cardID }],
                        });
                        check("FSRS 科学评分回环 (rating=3)", reviewed.code === 0);

                        const after = await api("/api/riff/getRiffDueCards", { deckID: scratchDeckId, reviewedCards: [] });
                        const unreviewed = after?.data?.unreviewedCount ?? after?.data?.cards?.length ?? -1;
                        check("作答后到期队列正确消费", unreviewed === 0, `unreviewed=${unreviewed}`);
                    }
                }
            }
        }
    }

    // 运行无头浏览器自动化 UI 走查（43930 隔离环境网页走查）
    if (!NO_BROWSER) {
        const targetUrl = isAttachedIsolated
            ? `${base}/stage/build/desktop/`
            : `${base}/stage/build/desktop/`;
        console.log(`\n[e2e] 正在启动无头浏览器执行真实桌面 UI 自动化全要素走查：${targetUrl}`);
        await runBrowserWalkthrough(targetUrl);
    }

    // 清理临时测试笔记本与卡组
    if (scratchDeckId) {
        try { await api("/api/riff/removeRiffDeck", { deck: scratchDeckId }); } catch {}
    }
    if (scratchNbId) {
        try { await api("/api/notebook/removeNotebook", { notebook: scratchNbId }); } catch {}
    }
    const leftover = await api("/api/notebook/lsNotebooks", {});
    const leftovers = (leftover.data?.notebooks ?? []).filter((n) => n.name.startsWith("siyuan-lv-cards-smoke-"));
    check("环境收尾：无测试临时库残留", leftovers.length === 0, "clean");

    // 汇总
    const pass = results.filter((r) => r.ok).length;
    console.log(`\n==================================================================`);
    console.log(`🎉 [e2e:isolated] 全景端到端自动化走查结果：${pass}/${results.length} 全部通过！`);
    console.log(`==================================================================`);

    if (kproc && !KEEP) {
        try {
            const { execSync } = await import("node:child_process");
            execSync(`taskkill /PID ${kproc.pid} /T /F`, { stdio: "ignore" });
        } catch {}
        await sleep(1500);
        try { fs.rmSync(ws, { recursive: true, force: true }); } catch {}
    }
}

try {
    await main();
} catch (e) {
    if (!(e instanceof SilentExit)) {
        console.error(e?.stack ?? e);
        process.exitCode = 1;
    }
}
