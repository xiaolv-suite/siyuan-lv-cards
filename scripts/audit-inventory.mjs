/**
 * scripts/audit-inventory.mjs
 * 全量交互与界面元素扫描工具
 * 自动扫描源码中的所有页面、面板、弹窗、抽屉、按钮、菜单、下拉、输入、设置、快捷键、空态与错误态
 */
import fs from "fs";
import path from "path";

const SRC_DIR = "src";

// 模块映射规则
function determineModule(filePath) {
    if (filePath.includes("bootstrap/topbar-menu") || filePath.includes("bootstrap/commands") || filePath.includes("onboarding.svelte") || filePath.includes("LvPalette.svelte")) {
        return { id: "M1", name: "全局入口与主导航/引导" };
    }
    if (filePath.includes("dashboard.svelte") || filePath.includes("LvCalendar.svelte") || filePath.includes("LvHeatmap.svelte")) {
        return { id: "M2", name: "今日仪表盘与每日任务/深度统计" };
    }
    if (filePath.includes("manager.svelte") || filePath.includes("deck-manager.svelte") || filePath.includes("deck-picker.svelte") || filePath.includes("card-detail.svelte")) {
        return { id: "M3", name: "卡库管理与卡包管理/抽屉/批量操作" };
    }
    if (filePath.includes("studio-workbench.svelte") || filePath.includes("quick-card.svelte") || filePath.includes("card-editor.svelte") || filePath.includes("ai-wizard.svelte") || filePath.includes("occlusion-editor.svelte") || filePath.includes("marker-cards.svelte")) {
        return { id: "M4", name: "制卡工作台与AI向导/题型/遮挡" };
    }
    if (filePath.includes("learning-page.svelte") || filePath.includes("pairing-game.svelte") || filePath.includes("challenge-mode.svelte") || filePath.includes("exam-page.svelte") || filePath.includes("goals-page.svelte") || filePath.includes("inbox-page.svelte")) {
        return { id: "M5", name: "学习中心与游戏挑战/考试/收集箱" };
    }
    if (filePath.includes("review.svelte") || filePath.includes("src/ui/review/")) {
        return { id: "M6", name: "复习全屏/抽屉界面与翻面/评分/归因" };
    }
    if (filePath.includes("settings.svelte") || filePath.includes("settings.ts")) {
        return { id: "M7", name: "设置中心全部配置项" };
    }
    if (filePath.includes("bootstrap/block-menu") || filePath.includes("src/index.ts")) {
        return { id: "M8", name: "思源笔记文档深度联动与编辑器菜单" };
    }
    if (filePath.includes("maintenance-page.svelte") || filePath.includes("recovery-page.svelte") || filePath.includes("repair-drill.svelte") || filePath.includes("lifecycle-panel.svelte") || filePath.includes("misconception-panel.svelte") || filePath.includes("relations-panel.svelte") || filePath.includes("ko-panel.svelte")) {
        return { id: "M9", name: "卡库维护诊断与修卡演练/认知网络" };
    }
    return { id: "M0", name: "其他界面组件" };
}

function scanFile(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    const items = [];
    const relPath = filePath.replace(/\\/g, "/");
    const mod = determineModule(relPath);

    // 1. 扫描页面与面板 (Page / Panel)
    if (relPath.endsWith("hub.svelte")) {
        items.push(
            { type: "页面与面板", location: `${relPath}:#lv-hub-today-panel`, label: "今日面板 (#lv-hub-today-panel)", action: "切换展示今日学习总览与卡组待复习" },
            { type: "页面与面板", location: `${relPath}:#lv-hub-manage-panel`, label: "卡库管理面板 (#lv-hub-manage-panel)", action: "切换展示全部卡片列表、筛选与卡包管理" },
            { type: "页面与面板", location: `${relPath}:#lv-hub-studio-panel`, label: "制卡工作台面板 (#lv-hub-studio-panel)", action: "切换展示快速制卡、AI制卡与题型工作台" },
            { type: "页面与面板", location: `${relPath}:#lv-hub-learn-panel`, label: "学习中心面板 (#lv-hub-learn-panel)", action: "切换展示配对、挑战、考试、目标与收集箱" },
            { type: "页面与面板", location: `${relPath}:#lv-hub-settings-panel`, label: "设置中心面板 (#lv-hub-settings-panel)", action: "切换展示完整配置表单" }
        );
    }

    // 2. 扫描弹窗与抽屉 (Dialog / Drawer)
    if (relPath.includes("onboarding.svelte")) {
        items.push({ type: "弹窗与抽屉", location: `${relPath}:1`, label: "新手引导弹窗 (Onboarding Dialog)", action: "首启或手动呼出，展示功能简介与卡片演练" });
    } else if (relPath.includes("card-detail.svelte")) {
        items.push({ type: "弹窗与抽屉", location: `${relPath}:1`, label: "卡片详情右侧抽屉 (CardDetail Drawer)", action: "右侧滑出展示卡片元数据、调度指标与关联状态" });
    } else if (relPath.includes("deck-manager.svelte")) {
        items.push({ type: "弹窗与抽屉", location: `${relPath}:1`, label: "卡包管理模态框 (DeckManager Modal)", action: "弹出进行卡包新建、重命名与合并" });
    } else if (relPath.includes("deck-picker.svelte")) {
        items.push({ type: "弹窗与抽屉", location: `${relPath}:1`, label: "卡包选择器弹窗 (DeckPicker Modal)", action: "弹出供用户搜索选择目标卡包" });
    } else if (relPath.includes("card-editor.svelte")) {
        items.push({ type: "弹窗与抽屉", location: `${relPath}:1`, label: "卡片编辑器弹窗 (CardEditor Modal)", action: "弹出全功能编辑卡面正反面与属性" });
    } else if (relPath.includes("ai-wizard.svelte")) {
        items.push({ type: "弹窗与抽屉", location: `${relPath}:1`, label: "AI 制卡向导弹窗 (AIWizard Modal)", action: "弹出输入文本/文档一键 AI 拆单制卡" });
    } else if (relPath.includes("occlusion-editor.svelte")) {
        items.push({ type: "弹窗与抽屉", location: `${relPath}:1`, label: "图片遮挡编辑器弹窗 (OcclusionEditor Modal)", action: "弹出在图片上绘制矩形遮罩制卡" });
    } else if (relPath.includes("repair-drill.svelte")) {
        items.push({ type: "弹窗与抽屉", location: `${relPath}:1`, label: "修卡演练模态框 (RepairDrill Modal)", action: "弹出针对水蛭/错题进行针对性重学演练" });
    } else if (relPath.includes("pairing-game.svelte")) {
        items.push({ type: "弹窗与抽屉", location: `${relPath}:1`, label: "配对挑战全屏弹窗 (PairingGame Modal)", action: "弹出开始概念与答案消除连线游戏" });
    } else if (relPath.includes("challenge-mode.svelte")) {
        items.push({ type: "弹窗与抽屉", location: `${relPath}:1`, label: "限时挑战全屏弹窗 (ChallengeMode Modal)", action: "弹出开始限时冲刺突击复习" });
    } else if (relPath.includes("ReviewRescheduleModal.svelte")) {
        items.push({ type: "弹窗与抽屉", location: `${relPath}:1`, label: "重新安排计划模态框 (Reschedule Modal)", action: "弹出选择自定义下次复习天数" });
    } else if (relPath.includes("ReviewContextDrawer.svelte")) {
        items.push({ type: "弹窗与抽屉", location: `${relPath}:1`, label: "复习上下文抽屉 (Context Drawer)", action: "展示卡片来源上下文、反向链接与笔记片段" });
    } else if (relPath.includes("LvPalette.svelte")) {
        items.push({ type: "弹窗与抽屉", location: `${relPath}:1`, label: "命令控制台浮层 (Alt+K Palette)", action: "快速搜索并触发全部插件命令" });
    }

    // 3. 逐行扫描 Svelte 交互元素
    lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        const loc = `${relPath}:${lineNum}`;

        // 按钮 / 图标按钮
        if (line.includes("<button") || line.includes("<LvButton")) {
            const isIcon = line.includes("b3-button--icon") || line.includes("lv-icon-btn") || line.includes("<LvIcon") || line.includes("aria-label");
            const labelMatch = line.match(/>([^<>{]+)</) || line.match(/aria-label="([^"]+)"/) || line.match(/title="([^"]+)"/) || line.match(/data-testid="([^"]+)"/);
            const label = labelMatch ? labelMatch[1].trim() : "按钮";
            const clickMatch = line.match(/on:click=\{([^}]+)\}/) || line.match(/onclick=\{([^}]+)\}/);
            const action = clickMatch ? `触发: ${clickMatch[1].slice(0, 40)}` : "点击动作";
            items.push({
                type: isIcon ? "图标按钮" : "按钮",
                location: loc,
                label: label || "操作按钮",
                action: action
            });
        }

        // 下拉与分段
        if (line.includes("<select") || line.includes("<LvSelect")) {
            const match = line.match(/bind:value=\{([^}]+)\}/) || line.match(/aria-label="([^"]+)"/);
            items.push({
                type: "下拉与分段控件",
                location: loc,
                label: match ? `选择: ${match[1]}` : "下拉选择控件",
                action: "选择不同配置或过滤项"
            });
        }
        if (line.includes("<LvSegmented")) {
            items.push({
                type: "下拉与分段控件",
                location: loc,
                label: "分段切换控件 (Segmented)",
                action: "切换视图或过滤维度"
            });
        }

        // 输入框与开关
        if (line.includes("<input") || line.includes("<LvInput") || line.includes("<textarea")) {
            if (line.includes("type=\"checkbox\"") || line.includes("<LvSwitch") || line.includes("b3-switch")) {
                const match = line.match(/bind:checked=\{([^}]+)\}/) || line.match(/bind:value=\{([^}]+)\}/);
                items.push({
                    type: "输入框与开关",
                    location: loc,
                    label: match ? `开关: ${match[1]}` : "切换开关 (Switch)",
                    action: "启用或停用指定选项"
                });
            } else {
                const match = line.match(/bind:value=\{([^}]+)\}/) || line.match(/placeholder="([^"]+)"/);
                items.push({
                    type: "输入框与开关",
                    location: loc,
                    label: match ? `输入框: ${match[1]}` : "文本/数值输入框",
                    action: "输入或修改数据"
                });
            }
        }

        // 空态与错误态
        if (line.includes("<LvEmpty") || line.includes("class=\"lv-empty") || line.includes("class=\"b3-empty\"")) {
            items.push({
                type: "空态与错误态",
                location: loc,
                label: "空数据状态 (Empty State)",
                action: "无数据时呈现占位与引导操作"
            });
        }
        if (line.includes("<LvError") || line.includes("class=\"lv-error") || line.includes("error-tag")) {
            items.push({
                type: "空态与错误态",
                location: loc,
                label: "异常与错误状态 (Error State)",
                action: "报错提示与恢复引导"
            });
        }
    });

    return items.map(it => ({ ...it, module: mod }));
}

// 扫描命令与菜单
function scanBootstrap() {
    const items = [];

    // 快捷键与命令
    const cmdFile = "src/bootstrap/commands.ts";
    const cmdContent = fs.readFileSync(cmdFile, "utf8");
    const cmdMatches = cmdContent.matchAll(/langKey:\s*"([^"]+)",\s*langText:\s*([^,\n]+),\s*hotkey:\s*"([^"]*)",\s*callback:\s*\(\)\s*=>\s*([^,\n]+)/g);
    for (const m of cmdMatches) {
        items.push({
            module: { id: "M1", name: "全局入口与主导航/引导" },
            type: "快捷键与命令",
            location: `${cmdFile}`,
            label: `命令: ${m[1]} (快捷键: ${m[3] || "无"})`,
            action: `执行: ${m[4].trim()}`
        });
    }

    // 顶栏右键菜单
    const topMenuFile = "src/bootstrap/topbar-menu.ts";
    const topMenuContent = fs.readFileSync(topMenuFile, "utf8");
    const topMatches = topMenuContent.matchAll(/id:\s*"([^"]+)"[\s\S]*?(?:label:\s*([^,\n]+)|type:\s*"([^"]+)")/g);
    for (const m of topMatches) {
        if (m[1].startsWith("sep-")) continue;
        items.push({
            module: { id: "M1", name: "全局入口与主导航/引导" },
            type: "菜单项与右键菜单",
            location: `${topMenuFile}`,
            label: `顶栏菜单项: ${m[1]}`,
            action: "点击打开对应功能模块或切换私密模式"
        });
    }

    // 块菜单
    const blkMenuFile = "src/bootstrap/block-menu.ts";
    const blkMenuContent = fs.readFileSync(blkMenuFile, "utf8");
    const blkMatches = blkMenuContent.matchAll(/id:\s*"([^"]+)"[\s\S]*?label:\s*([^,\n]+)/g);
    for (const m of blkMatches) {
        items.push({
            module: { id: "M8", name: "思源笔记文档深度联动与编辑器菜单" },
            type: "菜单项与右键菜单",
            location: `${blkMenuFile}`,
            label: `块右键菜单项: ${m[1]}`,
            action: "针对选中的笔记块执行制卡/入库/挖空/遮挡/移除"
        });
    }

    // 面包屑与斜杠命令 (src/index.ts)
    items.push(
        {
            module: { id: "M8", name: "思源笔记文档深度联动与编辑器菜单" },
            type: "快捷键与命令",
            location: "src/index.ts",
            label: "斜杠命令: /flashcard (/shanka /小驴闪卡)",
            action: "在编辑器当前块执行原位快速制卡"
        },
        {
            module: { id: "M8", name: "思源笔记文档深度联动与编辑器菜单" },
            type: "按钮与图标按钮",
            location: "src/index.ts",
            label: "面包屑按钮: 复习本文档 (iconLvCards)",
            action: "一键调起以当前文档为范围的复习会话"
        }
    );

    // 设置项清单 (src/ui/settings.svelte 与 src/core/settings.ts)
    const settingsFile = "src/core/settings.ts";
    const setContent = fs.readFileSync(settingsFile, "utf8");
    const setMatch = setContent.match(/export const DEFAULT_SETTINGS: LvCardsSettings = \{([\s\S]*?)\n\};/);
    if (setMatch) {
        const setLines = setMatch[1].split("\n").filter(l => l.includes(":") && !l.trim().startsWith("//"));
        for (const l of setLines) {
            const key = l.split(":")[0].trim();
            if (key) {
                items.push({
                    module: { id: "M7", name: "设置中心全部配置项" },
                    type: "设置项",
                    location: `${settingsFile}:${key}`,
                    label: `配置项: ${key}`,
                    action: "持久化存储与动态配置系统行为"
                });
            }
        }
    }

    return items;
}

function run() {
    function getSvelteFiles(dir) {
        let results = [];
        for (const item of fs.readdirSync(dir)) {
            const full = path.join(dir, item);
            if (fs.statSync(full).isDirectory()) results = results.concat(getSvelteFiles(full));
            else if (item.endsWith(".svelte")) results.push(full);
        }
        return results;
    }

    const svelteFiles = getSvelteFiles("src/ui");
    let allItems = [];
    for (const f of svelteFiles) {
        allItems = allItems.concat(scanFile(f));
    }
    allItems = allItems.concat(scanBootstrap());

    // 统计数据
    const total = allItems.length;
    const byType = {};
    const byModule = {};

    for (const it of allItems) {
        byType[it.type] = (byType[it.type] || 0) + 1;
        byModule[it.module.id] = byModule[it.module.id] || { name: it.module.name, count: 0, items: [] };
        byModule[it.module.id].count++;
        byModule[it.module.id].items.push(it);
    }

    console.log("=== 扫描完成 ===");
    console.log("交互元素总数:", total);
    console.log("\n按类型统计:", JSON.stringify(byType, null, 2));
    console.log("\n按模块统计:");
    for (const [id, data] of Object.entries(byModule)) {
        console.log(`  [${id}] ${data.name}: ${data.count} 项`);
    }

    // 输出 JSON 数据
    fs.writeFileSync("docs/inventory-data.json", JSON.stringify({ total, byType, byModule, allItems }, null, 2), "utf8");
    console.log("\n已输出数据到 docs/inventory-data.json");
}

run();
