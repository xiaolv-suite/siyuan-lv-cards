const { chromium } = require('D:/思源插件/小驴管家/node_modules/playwright');
const fs = require('fs');
const path = require('path');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ 
        viewport: { width: 390, height: 844 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
    });
    const outDir = 'D:/思源插件配套/测试工作区/xiaolv-mobile-review/artifacts/verified_cards_exam';
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    console.log('Connecting to SiYuan 6807 mobile review...');
    await page.goto('http://127.0.0.1:6807/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Emulate mobile container in SiYuan
    await page.evaluate(() => {
        if (window.siyuan?.config?.system) {
            window.siyuan.config.system.container = 'mobile';
            window.siyuan.config.system.isMobile = true;
        }
    });

    // Dismiss notifications
    await page.evaluate(() => document.querySelectorAll('#lv-notice-host, .lv-notice-card').forEach(n => n.remove()));

    // =========================================================================
    // 1. 小驴考试：移动端首页大盘与按钮完整性检验
    // =========================================================================
    console.log('\n=== 1. 小驴考试：首页大盘与按钮完整性 ===');
    await page.evaluate(() => {
        const p = window.siyuan.ws.app.plugins.find(x => x.name === 'siyuan-exam');
        p.isMobile = true;
        p?.openPractice?.();
    });
    await page.waitForTimeout(1500);
    await page.evaluate(() => document.querySelectorAll('#lv-notice-host, .lv-notice-card').forEach(n => n.remove()));

    await page.screenshot({ path: path.join(outDir, 'exam_entry_dashboard.png') });
    console.log('Captured exam_entry_dashboard.png');

    // =========================================================================
    // 2. 小驴考试：退出确认模态弹窗 UI 重构检验
    // =========================================================================
    console.log('\n=== 2. 小驴考试：退出确认模态弹窗 ===');
    const resumeOrStartBtn = page.locator('button:has-text("继续上次练习"), button:has-text("快速自测")').first();
    if (await resumeOrStartBtn.count() > 0) {
        await resumeOrStartBtn.click({ force: true });
        await page.waitForTimeout(1000);

        const exitBtn = page.locator('.lv-session-exit-btn, button:has-text("结束练习")').first();
        if (await exitBtn.count() > 0) {
            await exitBtn.click({ force: true });
            await page.waitForTimeout(800);

            // Screenshot the centered exit dialog
            await page.screenshot({ path: path.join(outDir, 'exam_exit_dialog.png') });
            console.log('Captured exam_exit_dialog.png');

            // Click cancel to resume
            const cancelBtn = page.locator('.b3-button--cancel, button:has-text("继续做题")').first();
            if (await cancelBtn.count() > 0) {
                await cancelBtn.click({ force: true });
                await page.waitForTimeout(500);
                console.log('Exit canceled successfully, resumed practice session');
            }
        }
    }

    // Close Exam tab/dialog
    await page.evaluate(() => {
        document.querySelectorAll('.lv-exam-mobile-dialog, .b3-dialog').forEach(d => d.remove());
    });
    await page.waitForTimeout(600);

    // =========================================================================
    // 3. 小驴闪卡：移动端全屏 Dialog 复习卡面与输入排版检验
    // =========================================================================
    console.log('\n=== 3. 小驴闪卡：复习卡面与输入排版 ===');
    await page.evaluate(() => {
        const p = window.siyuan.ws.app.plugins.find(x => x.name === 'siyuan-lv-cards');
        p.isMobile = true;
        p?.openTabOf?.('review');
    });
    await page.waitForTimeout(1500);
    await page.evaluate(() => document.querySelectorAll('#lv-notice-host, .lv-notice-card').forEach(n => n.remove()));

    await page.screenshot({ path: path.join(outDir, 'cards_mobile_review.png') });
    console.log('Captured cards_mobile_review.png');

    await browser.close();
    console.log('\nVerification run finished! Runtime errors:', errors.length);
})();
