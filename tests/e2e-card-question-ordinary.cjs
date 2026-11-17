const playwright = require("D:/思源插件/小驴常用/node_modules/playwright");

async function runE2E() {
    console.log("🚀 [E2E] 启动 Chromium 无头浏览器，连接评审工作区 (6807)...");
    const browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    page.on("console", msg => {
        console.log(`   [Browser Console ${msg.type()}]`, msg.text());
    });
    page.on("pageerror", err => console.error("   ❌ [Page Error]", err.message, err.stack));

    try {
        console.log("📖 [E2E] 正在访问思源笔记页面...");
        await page.goto("http://127.0.0.1:6807/", { waitUntil: "networkidle" });
        await page.waitForTimeout(3000);

        // 1. 打开一篇文档
        console.log("📑 [E2E] 点击文档树节点打开真实笔记文档...");
        const docOpenInfo = await page.evaluate(() => {
            const docItem = document.querySelector('.file-tree .b3-list-item[data-type="navigation-file"]');
            if (!docItem) return { success: false, reason: "未找到文档树节点" };
            (docItem).click();
            return { success: true, title: docItem.textContent.trim() };
        });
        console.log("   文档打开状态:", docOpenInfo);
        await page.waitForTimeout(2000);

        // 2. 检查编辑器与普通块
        const testTarget = await page.evaluate(() => {
            const pBlocks = Array.from(document.querySelectorAll('.protyle-wysiwyg [data-node-id][data-type="NodeParagraph"]'));
            // 找一个普通块（不带闪卡属性的块）
            const normal = pBlocks.find(b => !b.hasAttribute("custom-riff-decks") && !b.hasAttribute("custom-riff-title")) || pBlocks[0];
            if (!normal) return null;
            return {
                id: normal.getAttribute("data-node-id"),
                text: normal.textContent.trim(),
                isAlreadyCard: normal.hasAttribute("custom-riff-decks") || normal.hasAttribute("custom-riff-title")
            };
        });

        if (!testTarget) {
            throw new Error("❌ 编辑器中未找到可用段落块！");
        }
        console.log(`🎯 [E2E] 选定测试普通块: ID=${testTarget.id}, isCard=${testTarget.isAlreadyCard}, text=「${testTarget.text.slice(0, 30)}」`);

        // 3. 模拟思源原生块图标菜单弹出并点击【小驴闪卡：设置闪卡问答 (问题·答案)】
        console.log("🖱️ [E2E] 模拟思源原生块图标菜单弹出并点击菜单项...");
        const clickResult = await page.evaluate(async (blockId) => {
            const plugin = window.siyuan.ws.app.plugins.find(p => p.name === "siyuan-lv-cards");
            const targetEl = document.querySelector(`.protyle-wysiwyg [data-node-id="${blockId}"]`);
            if (!plugin || !targetEl) return { success: false, reason: "plugin 或 targetEl 不存在" };

            // 使用思源原生 Menu 类
            const MenuClass = window.siyuan.menus.menu.constructor;
            const menu = new MenuClass();

            // 派发 click-blockicon 事件
            plugin.eventBus.emit("click-blockicon", {
                menu,
                blockElements: [targetEl],
                target: targetEl
            });

            // 弹出菜单到页面
            menu.popup({ x: 300, y: 300 });

            // 在真实 DOM 中查找菜单项
            const menuButtons = Array.from(document.querySelectorAll(".b3-menu__item"));
            const targetBtn = menuButtons.find(btn => btn.textContent.includes("闪卡问答") || btn.textContent.includes("属性问答") || btn.textContent.includes("设置闪卡问题"));

            if (!targetBtn) {
                return {
                    success: false,
                    reason: "菜单中未找到设置闪卡问答按钮",
                    availableLabels: menuButtons.map(b => b.textContent.trim())
                };
            }

            const btnText = targetBtn.textContent.trim();
            // 触发真实点击
            targetBtn.click();
            return { success: true, clickedBtn: btnText };
        }, testTarget.id);

        console.log("   菜单点击响应:", clickResult);
        if (!clickResult.success) {
            throw new Error(`❌ 菜单点击失败: ${clickResult.reason}`);
        }

        // 4. 等待弹窗弹出（给宏任务 60ms 延时以及 Svelte 5 挂载留出缓冲）
        console.log("⏳ [E2E] 等待免侵入属性问答设置弹窗弹出并验证 DOM 结构...");
        await page.waitForSelector(".lv-qa-dialog-modal", { timeout: 5000 });

        const modalCheck = await page.evaluate(() => {
            const modal = document.querySelector(".lv-qa-dialog-modal");
            const dialog = document.querySelector(".b3-dialog");
            const textarea = modal?.querySelector("textarea");
            const statusPill = modal?.querySelector(".lv-qa-status-pill");
            const answerContent = modal?.querySelector(".lv-qa-answer-content");
            const saveBtn = modal?.querySelector(".lv-qa-btn-save");
            const deckSelect = modal?.querySelector(".lv-qa-deck-select");

            return {
                modalFound: Boolean(modal),
                dialogFound: Boolean(dialog),
                statusText: statusPill?.textContent?.trim(),
                answerPreview: answerContent?.textContent?.trim()?.slice(0, 40),
                textareaPresent: Boolean(textarea),
                saveBtnPresent: Boolean(saveBtn),
                deckSelectPresent: Boolean(deckSelect)
            };
        });

        console.log("   弹窗结构审查:", modalCheck);
        if (!modalCheck.modalFound || !modalCheck.textareaPresent) {
            throw new Error("❌ 属性问答弹窗未成功渲染或关键组件缺失！");
        }
        console.log("✅ [E2E] 弹窗验证通过：属性问答弹窗已成功秒开弹出！");

        // 5. 模拟用户输入「问题」与「自定义答案」并点击保存
        console.log("✍️ [E2E] 模拟用户输入测试「提问」与「自定义答案」并点击保存...");
        const testQuestionText = "【E2E真实自测】这是用于验证普通块属性问答的核心概念提问？";
        const testAnswerText = "【E2E自定义答案】这是精炼标准答案要点，笔记原文将附后备查。";
        await page.fill(".lv-qa-prompt-section .lv-qa-textarea", testQuestionText);
        await page.fill(".lv-qa-textarea--answer", testAnswerText);
        await page.waitForTimeout(300);

        // 点击保存按钮
        await page.click(".lv-qa-btn-save");
        console.log("   点击【保存闪卡问题】完成，等待保存事务落盘...");
        await page.waitForTimeout(1500);

        // 6. 验证保存后的结果：弹窗关闭且块属性 custom-riff-title 与 custom-riff-answer 双双写入成功
        const verifyResult = await page.evaluate((blockId) => {
            const modal = document.querySelector(".lv-qa-dialog-modal");
            const targetEl = document.querySelector(`.protyle-wysiwyg [data-node-id="${blockId}"]`);
            const titleAttr = targetEl?.getAttribute("custom-riff-title");
            const answerAttr = targetEl?.getAttribute("custom-riff-answer");
            const customTitleAttr = targetEl?.getAttribute("data-custom-title") || targetEl?.querySelector("[data-custom-title]")?.getAttribute("data-custom-title");

            return {
                modalClosed: !modal,
                blockFound: Boolean(targetEl),
                titleAttr,
                answerAttr,
                customTitleAttr
            };
        }, testTarget.id);

        console.log("   保存后状态审查:", verifyResult);
        if (!verifyResult.modalClosed) {
            throw new Error("❌ 保存后弹窗未自动关闭！");
        }
        if (verifyResult.titleAttr !== testQuestionText) {
            throw new Error(`❌ 块属性 custom-riff-title 未正确写入！期望: ${testQuestionText}, 实际: ${verifyResult.titleAttr}`);
        }
        if (verifyResult.answerAttr !== testAnswerText) {
            throw new Error(`❌ 块属性 custom-riff-answer 未正确写入！期望: ${testAnswerText}, 实际: ${verifyResult.answerAttr}`);
        }

        console.log("🎉 [E2E] 第一阶段（普通块块图标菜单设题+设答）100% 成功通过！");

        // 7. 测试第二阶段：在已设为闪卡的块上，模拟右键菜单 open-menu-content 点击编辑，验证双向回填
        console.log("🖱️ [E2E] 第二阶段：模拟右键菜单 open-menu-content 触发编辑并验证问题+答案双向回填...");
        const contextMenuResult = await page.evaluate(async (blockId) => {
            const plugin = window.siyuan.ws.app.plugins.find(p => p.name === "siyuan-lv-cards");
            const targetEl = document.querySelector(`.protyle-wysiwyg [data-node-id="${blockId}"]`);
            const MenuClass = window.siyuan.menus.menu.constructor;
            const menu = new MenuClass();

            plugin.eventBus.emit("open-menu-content", {
                menu,
                element: targetEl,
                protyle: { wysiwyg: { element: document.querySelector(".protyle-wysiwyg") } }
            });

            menu.popup({ x: 350, y: 350 });

            const menuButtons = Array.from(document.querySelectorAll(".b3-menu__item"));
            const targetBtn = menuButtons.find(btn => btn.textContent.includes("闪卡问答") || btn.textContent.includes("属性问答") || btn.textContent.includes("设置闪卡"));
            if (!targetBtn) {
                return { success: false, reason: "右键菜单中未找到属性问答项" };
            }
            targetBtn.click();
            return { success: true, btnText: targetBtn.textContent.trim() };
        }, testTarget.id);

        console.log("   右键菜单点击响应:", contextMenuResult);
        await page.waitForSelector(".lv-qa-dialog-modal", { timeout: 5000 });

        const editCheck = await page.evaluate(() => {
            const modal = document.querySelector(".lv-qa-dialog-modal");
            const qTextarea = modal?.querySelector(".lv-qa-prompt-section textarea");
            const aTextarea = modal?.querySelector(".lv-qa-textarea--answer");
            const statusPill = modal?.querySelector(".lv-qa-status-pill");

            return {
                modalFound: Boolean(modal),
                statusText: statusPill?.textContent?.trim(),
                filledQuestion: qTextarea?.value,
                filledAnswer: aTextarea?.value,
            };
        });

        console.log("   编辑弹窗状态回填审查:", editCheck);
        if (editCheck.filledQuestion !== testQuestionText) {
            throw new Error(`❌ 编辑弹窗未正确回填原问题！期望: ${testQuestionText}, 实际: ${editCheck.filledQuestion}`);
        }
        if (editCheck.filledAnswer !== testAnswerText) {
            throw new Error(`❌ 编辑弹窗未正确回填原自定义答案！期望: ${testAnswerText}, 实际: ${editCheck.filledAnswer}`);
        }

        // 8. 测试第三阶段：点击「恢复正文答案」，保存后验证 custom-riff-answer 被清除但 custom-riff-title 保留
        console.log("🔄 [E2E] 第三阶段：点击「恢复正文答案」，保存后验证答案回退正文机制...");
        await page.click(".lv-qa-answer-reset-btn");
        await page.waitForTimeout(300);
        await page.click(".lv-qa-btn-save");
        await page.waitForTimeout(1500);

        const resetVerify = await page.evaluate((blockId) => {
            const targetEl = document.querySelector(`.protyle-wysiwyg [data-node-id="${blockId}"]`);
            return {
                titleAttr: targetEl?.getAttribute("custom-riff-title"),
                answerAttr: targetEl?.getAttribute("custom-riff-answer"),
            };
        }, testTarget.id);

        console.log("   恢复正文答案后属性审查:", resetVerify);
        if (resetVerify.titleAttr !== testQuestionText) {
            throw new Error(`❌ 问题属性被意外清除！期望: ${testQuestionText}, 实际: ${resetVerify.titleAttr}`);
        }
        if (resetVerify.answerAttr !== null && resetVerify.answerAttr !== "") {
            throw new Error(`❌ 答案属性未能恢复回退状态！期望 null/空, 实际: ${resetVerify.answerAttr}`);
        }

        console.log("🎉 [E2E] 全流程真实端到端测试 100% 成功通过！");
        console.log("   - 设问 + 设答 (custom-riff-title + custom-riff-answer): 写入与持久化成功");
        console.log("   - 二次编辑与双向回填: 问题与答案 100% 回填至对应编辑器");
        console.log("   - 恢复正文答案机制: 自定义答案安全清除，无缝回退正文，问题题面安然无恙");

    } finally {
        await browser.close();
        console.log("🏁 [E2E] 浏览器已安全退出。");
    }
}

runE2E().catch(err => {
    console.error("❌❌❌ [E2E 失败]:", err);
    process.exit(1);
});
