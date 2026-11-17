/**
 * 小驴闪卡 · 隔离环境独立网页服务脚本 (serve-isolated-web.mjs)
 *
 * 核心目标：
 * 1. 严格在 D 盘建立独立、隔离的思源工作区（默认 D:/siyuan-isolated-lv-cards），绝不触碰日常笔记库（D:/SIYUAN）与 6806 端口；
 * 2. 分配独立测试端口（默认 43929，区别于小驴管家的 43919 与日常思源的 6806）；
 * 3. 部署并激活最新的 dist/ 插件包与预置走查卡组、文档与《闪卡动态看板与错题本》；
 * 4. 内核以脱离后台进程（detached）持久运行，浏览器随时访问 http://127.0.0.1:43929/stage/build/desktop/ 即可全功能交互测试；
 * 5. 支持随时重载最新构建（--reload）、查询状态（--status）与安全停止（--stop）。
 */

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const DIST = path.join(REPO_ROOT, "dist");
const PLUGIN_ID = "siyuan-lv-cards";
const DEFAULT_PORT = 43930;
const DEFAULT_WORKSPACE = "D:/siyuan-isolated-lv-cards";
const INSTANCE_META_FILE = "instance.json";
const SLEEP = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 解析命令行参数
const argv = process.argv.slice(2);
const getArg = (flag) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
};
const hasFlag = (flag) => argv.includes(flag);

const PORT = Number(getArg("--port") || process.env.TEST_ISOLATED_PORT || DEFAULT_PORT);
const WORKSPACE = path.resolve(getArg("--workspace") || process.env.SIYUAN_ISOLATED_WS || DEFAULT_WORKSPACE);
const STOP_ONLY = hasFlag("--stop");
const STATUS_ONLY = hasFlag("--status");
const RELOAD_ONLY = hasFlag("--reload");
const CLEAN_BOOT = hasFlag("--clean");

function checkPortFree(port) {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.once("error", reject);
        srv.listen({ host: "127.0.0.1", port, exclusive: true }, () => srv.close((e) => (e ? reject(e) : resolve())));
    });
}

function resolveKernel() {
    const candidates = [
        process.env.SIYUAN_KERNEL,
        "D:\\RJ\\SiYuan\\resources\\kernel\\SiYuan-Kernel.exe",
        "D:\\biji\\SiYuan\\resources\\kernel\\SiYuan-Kernel.exe",
        path.join(process.env.ProgramFiles || "C:\\Program Files", "SiYuan", "resources", "kernel", "SiYuan-Kernel.exe"),
    ].filter(Boolean);
    const kernel = candidates.find((c) => fs.existsSync(c));
    if (!kernel) throw new Error("未找到 SiYuan-Kernel.exe，可通过环境变量 SIYUAN_KERNEL 指定路径");
    const appDir = path.resolve(path.dirname(kernel), "..");
    for (const req of ["stage", "appearance"]) {
        if (!fs.existsSync(path.join(appDir, req))) throw new Error(`思源 resources 目录缺少 ${req}: ${appDir}`);
    }
    return { kernel, appDir };
}

function readInstanceMeta(ws) {
    try {
        const p = path.join(ws, INSTANCE_META_FILE);
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch { /* ignore */ }
    return null;
}

function saveInstanceMeta(ws, meta) {
    fs.mkdirSync(ws, { recursive: true });
    fs.writeFileSync(path.join(ws, INSTANCE_META_FILE), JSON.stringify(meta, null, 2), "utf8");
}

function readToken(ws) {
    try {
        const confPath = path.join(ws, "conf", "conf.json");
        if (fs.existsSync(confPath)) {
            const conf = JSON.parse(fs.readFileSync(confPath, "utf8"));
            return conf?.api?.token || "";
        }
    } catch { /* ignore */ }
    return "";
}

async function isKernelAlive(port, token = "") {
    try {
        const headers = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Token ${token}`;
        const res = await fetch(`http://127.0.0.1:${port}/api/system/version`, {
            method: "POST",
            headers,
            body: "{}",
            signal: AbortSignal.timeout(2000),
        });
        if (res.status === 200) {
            const json = await res.json();
            return { alive: true, version: json.data || "unknown" };
        }
    } catch { /* not alive */ }
    return { alive: false };
}

function killProcessTree(pid) {
    if (!pid) return;
    try {
        execSync(`powershell.exe -NoProfile -Command "Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue"`, { stdio: "ignore" });
    } catch { /* ignore */ }
}

async function stopRunningKernel(ws, port) {
    const meta = readInstanceMeta(ws);
    let stopped = false;

    // 1. 根据 PID 强制关闭
    if (meta?.pid) {
        killProcessTree(meta.pid);
        stopped = true;
    }

    // 2. 检查端口是否有其他占用进程并清理
    try {
        const out = execSync(`powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`, { encoding: "utf8" }).trim();
        for (const line of out.split(/\r?\n/)) {
            const pid = Number(line.trim());
            if (pid && pid > 0) {
                killProcessTree(pid);
                stopped = true;
            }
        }
    } catch { /* ignore */ }

    await SLEEP(1000);
    return stopped;
}

function deployPluginPackage(ws) {
    if (!fs.existsSync(path.join(DIST, "index.js"))) {
        throw new Error("dist/index.js 不存在，请先执行 pnpm run build");
    }
    const pluginDst = path.join(ws, "data", "plugins", PLUGIN_ID);
    fs.mkdirSync(pluginDst, { recursive: true });

    // 拷贝核心产物与 chunk 模块
    fs.cpSync(DIST, pluginDst, { recursive: true });

    // 写入 petals.json 确保冷启动时思源内核与网页端直接加载插件
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST, "plugin.json"), "utf8"));
    const petalsPath = path.join(ws, "data", "storage", "petal", "petals.json");
    fs.mkdirSync(path.dirname(petalsPath), { recursive: true });

    const petals = [
        {
            name: PLUGIN_ID,
            displayName: manifest.displayName?.["zh-CN"] || manifest.displayName?.default || "小驴闪卡（内测版）",
            version: manifest.version || "0.225.0",
            enabled: true,
            incompatible: false,
            disabledInPublish: true,
            userDisabledInPublish: false,
            disallowInstall: false,
            js: "",
            css: "",
            i18n: null,
            kernel: { js: "", existed: false, incompatible: false },
        },
    ];
    fs.writeFileSync(petalsPath, JSON.stringify(petals, null, "\t"), "utf8");

    // 若已有 conf/conf.json 则确保 bazaar.trust = true
    const confPath = path.join(ws, "conf", "conf.json");
    if (fs.existsSync(confPath)) {
        try {
            const conf = JSON.parse(fs.readFileSync(confPath, "utf8"));
            conf.bazaar = { ...conf.bazaar, trust: true, petalDisabled: false };
            fs.writeFileSync(confPath, JSON.stringify(conf, null, "\t"), "utf8");
        } catch { /* ignore */ }
    }

    return manifest.version || "0.225.0";
}

async function waitKernelReady(base) {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${base}/api/system/bootProgress`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
                signal: AbortSignal.timeout(2000),
            });
            if (res.status === 200) {
                const j = await res.json();
                if (j?.code === 0 && Number(j?.data?.progress) >= 100) return true;
            }
        } catch { /* kernel is still booting */ }
        await SLEEP(400);
    }
    throw new Error(`隔离思源内核启动超时: ${base}`);
}

async function fetchRealToken(ws) {
    const confPath = path.join(ws, "conf", "conf.json");
    for (let i = 0; i < 40; i++) {
        await SLEEP(500);
        try {
            if (fs.existsSync(confPath)) {
                const conf = JSON.parse(fs.readFileSync(confPath, "utf8"));
                if (conf?.api?.token) return conf.api.token;
            }
        } catch { /* file write in flight */ }
    }
    return "";
}

async function apiCall(base, token, route, body = {}) {
    for (let i = 0; i < 15; i++) {
        try {
            const res = await fetch(`${base}${route}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Token ${token}`,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(10000),
            });
            const data = await res.json();
            if (data.code === 0) return data.data;
            if (/not ready|Access is denied/i.test(String(data.msg)) && i < 14) {
                await SLEEP(800);
                continue;
            }
            throw new Error(`${route} failed: ${data.msg || JSON.stringify(data)}`);
        } catch (e) {
            if (i >= 14) throw e;
            await SLEEP(800);
        }
    }
}

async function seedTestFixtureData(base, token) {
    console.log("  [数据装载] 检查并装载演练笔记本、演示闪卡与原生动态看板...");
    try {
        const ls = await apiCall(base, token, "/api/notebook/lsNotebooks");
        const notebooks = ls?.notebooks || [];
        let nb = notebooks.find((n) => n.name === "小驴闪卡演练本");
        let nbId = nb?.id;

        if (!nbId) {
            const created = await apiCall(base, token, "/api/notebook/createNotebook", { name: "小驴闪卡演练本" });
            nbId = created?.notebook?.id || created?.id || (typeof created === "string" ? created : "");
        }

        if (!nbId) {
            console.log("  [数据装载] 笔记本 ID 获取跳过，稍后可在界面自行建卡。");
            return;
        }

        // 1. 创建《闪卡动态看板与错题本》活文档
        const boardPath = "/闪卡动态看板与错题本";
        const boardMarkdown = [
            `# ⚡ 小驴闪卡 · 动态看板与错题本`,
            ``,
            `> 💡 **思源原生动态看板**：本文档通过思源笔记原生 SQL 嵌入块动态汇总全库闪卡，无需打开插件面板即可在思源笔记中一览疑难卡、星标卡与近期制卡。`,
            ``,
            `## ⚠️ 疑难错题卡（水蛭卡 · 遗忘 ≥ 4 次）`,
            `{{SELECT * FROM blocks WHERE (ial LIKE '%custom-lv-leech="true"%' OR ial LIKE '%custom-lv-lapses="%') ORDER BY updated DESC LIMIT 50}}`,
            ``,
            `## ⭐ 重点星标卡`,
            `{{SELECT * FROM blocks WHERE ial LIKE '%custom-lv-starred="true"%' ORDER BY updated DESC LIMIT 50}}`,
            ``,
            `## ❌ 认知错因归因卡`,
            `{{SELECT * FROM blocks WHERE ial LIKE '%custom-lv-error-reason="%' ORDER BY updated DESC LIMIT 50}}`,
            ``,
            `## 🆕 近期制作闪卡`,
            `{{SELECT * FROM blocks WHERE (ial LIKE '%custom-riff-decks%' OR ial LIKE '%custom-lv-%') ORDER BY created DESC LIMIT 50}}`,
        ].join("\n");

        await apiCall(base, token, "/api/filetree/createDocWithMd", {
            notebook: nbId,
            path: boardPath,
            markdown: boardMarkdown,
        }).catch(() => { /* 若已存在则忽略 */ });

        // 2. 创建《生物与英语闪卡》
        const sampleDocPath = "/生物与英语闪卡";
        const sampleDoc = await apiCall(base, token, "/api/filetree/createDocWithMd", {
            notebook: nbId,
            path: sampleDocPath,
            markdown: "# 快速体验 · 闪卡原位制卡与复习走查\n\n> 提示：本页包含预先制备的挖空卡、问答卡与错题卡，已关联到小驴闪卡复习系统。",
        }).catch(() => null);

        const sampleDocID = sampleDoc?.id || (typeof sampleDoc === "string" ? sampleDoc : "");

        if (sampleDocID) {
            // 追加测试卡块
            const blocks = [
                { md: "线粒体是细胞进行 ==有氧呼吸== 的主要场所，被誉为细胞的 ==能量工厂==。", attrs: { "custom-lv-starred": "true" } },
                { md: "核糖体是合成 ==蛋白质== 的机器，由 ==rRNA== 和蛋白质组成。", attrs: {} },
                { md: "问：思源笔记与传统双链笔记的核心区别是什么？\n\n答：思源以「块（Block）」为最小粒度组织内容，所有标题、段落、列表均拥有独立 ID 与 IAL 属性。", attrs: { "custom-lv-starred": "true" } },
                { md: "⚠️ 典型水蛭错题：人类基因组中大约包含 ==30 亿== 对碱基，编码蛋白质的基因约有 ==2 万== 个。", attrs: { "custom-lv-leech": "true", "custom-lv-lapses": "5", "custom-lv-error-reason": "concept-confused" } },
                { md: "认知错因示例：FSRS 调度模型中的 S 表示 ==稳定性（Stability）==，D 表示 ==难度（Difficulty）==，R 表示 ==可提取性（Retrievability）==。", attrs: { "custom-lv-error-reason": "unfamiliar-material" } },
            ];

            const createdBlockIds = [];
            for (const b of blocks) {
                const res = await apiCall(base, token, "/api/block/appendBlock", {
                    dataType: "markdown",
                    data: b.md,
                    parentID: sampleDocID,
                });
                const id = res?.[0]?.doOperations?.[0]?.id;
                if (id) {
                    createdBlockIds.push(id);
                    if (Object.keys(b.attrs).length > 0) {
                        await apiCall(base, token, "/api/attr/setBlockAttrs", { id, attrs: b.attrs }).catch(() => {});
                    }
                }
            }

            // 3. 加入 Riff 卡组以便打开复习时立即可复习
            const decks = (await apiCall(base, token, "/api/riff/getRiffDecks")) || [];
            let demoDeck = decks.find((d) => d.name === "小驴闪卡演练组");
            let deckID = demoDeck?.id;
            if (!deckID) {
                const cDeck = await apiCall(base, token, "/api/riff/createRiffDeck", { name: "小驴闪卡演练组" });
                deckID = cDeck?.id || cDeck?.deck?.id;
            }

            if (deckID && createdBlockIds.length > 0) {
                await apiCall(base, token, "/api/riff/addRiffCards", { deckID, blockIDs: createdBlockIds }).catch(() => {});
            }
        }

        // 4. 《闪卡类型全覆盖示例》：把插件支持的每一类卡面形态各造一张演示卡
        await seedAllCardTypesDemo(base, token, nbId);
        console.log("  [数据装载] 演示卡片与动态看板配置完成。");
    } catch (e) {
        console.log(`  [数据装载提示] 预置数据生成跳过或部分完成: ${e.message}`);
    }
}

/**
 * 全卡型示例装载（R57）：问答 / 挖空 / 超级块 / 双向 / 分隔符 / 图片遮挡 /
 * 单选 / 多选 / 判断 / 填空 / 代码 / 公式 / 表格 / 图片 —— 每类至少一张。
 * 只新增不删除：重复运行时按文档存在性跳过。
 */
async function seedAllCardTypesDemo(base, token, nbId) {
    const docPath = "/闪卡类型全覆盖示例";
    const existing = await apiCall(base, token, "/api/filetree/getHPathByPath", {
        notebook: nbId,
        path: docPath,
    }).catch(() => null);
    if (existing?.id) {
        console.log("  [数据装载] 《闪卡类型全覆盖示例》已存在，跳过。");
        return;
    }

    const doc = await apiCall(base, token, "/api/filetree/createDocWithMd", {
        notebook: nbId,
        path: docPath,
        markdown: [
            "# 闪卡类型全覆盖示例",
            "",
            "> 本文档由隔离环境自动生成，把小驴闪卡支持的每一类卡面形态各造一张演示卡，",
            "> 全部收录于卡组「全部卡型示例组」，供走查复习端对不同卡型的渲染与交互。",
            "",
            "## 卡型清单",
            "",
            "1. 标准问答题（题面 + ==答案== 高亮标记）",
            "2. 挖空题（一段话多处 ==关键词== 挖空）",
            "3. 超级块多段问答（一题多问自动拆分）",
            "4. 双向卡（互为问答的两张卡）",
            "5. 分隔符问答（`::` 冒号语法快速制卡）",
            "6. 图片遮挡卡（lv-occlusion 归一化遮挡框）",
            "7. 单选题（custom-exam-type=single）",
            "8. 多选题（custom-exam-type=multiple）",
            "9. 判断题（custom-exam-type=judge）",
            "10. 填空题（custom-exam-type=fill 打字作答）",
            "11. 代码卡（卡面含代码块）",
            "12. 公式卡（KaTeX 数学公式）",
            "13. 表格卡（卡面含 Markdown 表格）",
            "14. 图片卡（普通含图卡面）",
            "",
        ].join("\n"),
    }).catch(() => null);

    const docID = typeof doc === "string" ? doc : doc?.id;
    if (!docID) {
        console.log("  [数据装载] 全卡型示例文档创建失败，跳过。");
        return;
    }

    const blocks = [
        {
            title: "1 · 标准问答题",
            md: "FSRS 调度模型中的 R 代表什么？ ==可提取性（Retrievability）==，即当前记忆的可提取强度。",
            attrs: {},
        },
        {
            title: "2 · 挖空题（多挖空）",
            md: "HTTP 状态码中 ==200== 表示请求成功，==404== 表示资源不存在，==500== 表示服务器内部错误。",
            attrs: {},
        },
        {
            title: "3 · 超级块多段问答",
            md: "{{{col\n细胞呼吸的三个阶段分别是什么？\n\n糖酵解、柠檬酸循环（三羧酸循环）、氧化磷酸化。\n\n糖酵解发生的场所是哪里？\n\n细胞质基质。\n\n氧化磷酸化发生的场所是哪里？\n\n线粒体内膜。\n}}}",
            attrs: {},
        },
        {
            title: "4 · 双向卡（A↔B 互为问答）",
            md: "「小驴闪卡」的英文插件名是什么？ ==siyuan-lv-cards==",
            attrs: {},
        },
        {
            title: "4 · 双向卡（反向）",
            md: "siyuan-lv-cards 对应的中文插件名是什么？ ==小驴闪卡==",
            attrs: {},
        },
        {
            title: "5 · 分隔符问答（:: 语法）",
            md: "TCP 三次握手的第一个报文是什么 :: SYN（同步序列号请求）",
            attrs: {},
        },
        {
            // 注意：思源 appendBlock 遇空行会拆成多个块——选项必须与题干同块（软换行）才能组成一张选择题
            title: "7 · 单选题",
            md: "地球绕太阳公转一周大约需要多长时间？\nA. 1 天\nB. 30 天\nC. 365 天\nD. 10 年",
            attrs: {
                "custom-exam-type": "single",
                "custom-exam-answer": "C",
                "custom-exam-analysis": "地球公转周期约为一年（365.25 天），即我们所说的一岁。",
            },
        },
        {
            title: "8 · 多选题",
            md: "下列哪些属于哺乳动物？（多选）\nA. 蝙蝠\nB. 鲸鱼\nC. 鳄鱼\nD. 鸭嘴兽",
            attrs: {
                "custom-exam-type": "multiple",
                "custom-exam-answer": "ABD",
                "custom-exam-analysis": "蝙蝠和鲸鱼是哺乳动物，鸭嘴兽是卵生哺乳动物；鳄鱼是爬行动物。",
            },
        },
        {
            title: "9 · 判断题",
            md: "【判断题】FSRS 是一个基于现代记忆研究、可自学习参数的调度算法，优于固定间隔的 SM-2。",
            attrs: {
                "custom-exam-type": "judge",
                "custom-exam-answer": "对",
                "custom-exam-analysis": "FSRS 使用可优化的参数拟合记忆模型，间隔安排比固定参数的 SM-2 更贴合个人记忆曲线。",
            },
        },
        {
            title: "10 · 填空题（打字作答）",
            md: "思源笔记本地存储使用的开源数据库是 ____。",
            attrs: {
                "custom-exam-type": "fill",
                "custom-exam-answer": "SQLite",
            },
        },
        {
            title: "11 · 代码卡（行内代码）",
            md: "下面这段 JavaScript 的输出是什么？\n`console.log(typeof null);`\n\n==\"object\"==（历史遗留 bug，null 被判定为 object）。",
            attrs: {},
        },
        {
            title: "12 · 公式卡（行内 KaTeX）",
            md: "正态分布的概率密度函数是 $f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}$，其中 $\\mu$ 是 ==均值==，$\\sigma$ 是 ==标准差==。",
            attrs: {},
        },
        {
            title: "13 · 表格卡（整表即卡面）",
            md: "| 变量 | 全称 | 含义 |\n| --- | --- | --- |\n| D | Difficulty | 难度 |\n| S | Stability | 稳定性 |\n| R | Retrievability | 可提取性 |\n\n上表是 FSRS 的三大核心变量：==D=难度、S=稳定性、R=可提取性==。",
            attrs: {},
        },
    ];

    const createdIds = [];
    for (const b of blocks) {
        const res = await apiCall(base, token, "/api/block/appendBlock", {
            dataType: "markdown",
            data: b.md,
            parentID: docID,
        });
        const id = res?.[0]?.doOperations?.[0]?.id;
        if (id) {
            createdIds.push(id);
            if (Object.keys(b.attrs).length > 0) {
                await apiCall(base, token, "/api/attr/setBlockAttrs", { id, attrs: b.attrs }).catch(() => {});
            }
        }
    }

    // 6 · 图片遮挡卡：上传插件图标并写入两处归一化遮挡框
    try {
        const iconPath = path.resolve(REPO_ROOT, "icon.png");
        if (fs.existsSync(iconPath)) {
            const form = new FormData();
            form.append("assetsDirPath", "/assets/");
            form.append("file[]", new Blob([fs.readFileSync(iconPath)], { type: "image/png" }), "all-card-types-occlusion.png");
            const up = await fetch(base + "/api/asset/upload", {
                method: "POST",
                headers: { Authorization: `Token ${token}` },
                body: form,
            }).then((r) => r.json());
            const assetPath = Object.values(up.data.succMap ?? {})[0];
            if (assetPath) {
                const imgRes = await apiCall(base, token, "/api/block/appendBlock", {
                    dataType: "markdown",
                    data: `![遮挡示例（点击块菜单可编辑遮挡框）](${assetPath})`,
                    parentID: docID,
                });
                const imgId = imgRes?.[0]?.doOperations?.[0]?.id;
                if (imgId) {
                    const occl = JSON.stringify({
                        v: 1,
                        rects: [
                            { x: 0.12, y: 0.18, w: 0.34, h: 0.26 },
                            { x: 0.55, y: 0.55, w: 0.3, h: 0.24 },
                        ],
                    });
                    await apiCall(base, token, "/api/attr/setBlockAttrs", { id: imgId, attrs: { "lv-occlusion": occl } });
                    createdIds.push(imgId);
                }

                // 14 · 普通图片卡（软换行让题面与图片同块，无遮挡属性）
                const picRes = await apiCall(base, token, "/api/block/appendBlock", {
                    dataType: "markdown",
                    data: `下面这张图是哪个插件的图标？ ==小驴闪卡==\n![](${assetPath})`,
                    parentID: docID,
                });
                const picId = picRes?.[0]?.doOperations?.[0]?.id;
                if (picId) createdIds.push(picId);
            }
        }
    } catch { /* 遮挡/图片卡失败不阻塞其余卡型 */ }

    // 收录进独立卡组「全部卡型示例组」
    if (createdIds.length > 0) {
        const decks = (await apiCall(base, token, "/api/riff/getRiffDecks")) || [];
        let deckID = decks.find((d) => d.name === "全部卡型示例组")?.id;
        if (!deckID) {
            const cDeck = await apiCall(base, token, "/api/riff/createRiffDeck", { name: "全部卡型示例组" });
            deckID = cDeck?.id || cDeck?.deck?.id;
        }
        if (deckID) {
            for (let retry = 0; retry < 5; retry++) {
                const added = await apiCall(base, token, "/api/riff/addRiffCards", { deckID, blockIDs: createdIds }).catch(() => null);
                if (added) break;
                await SLEEP(700);
            }
        }
        console.log(`  [数据装载] 全卡型示例：${createdIds.length} 张卡已入组「全部卡型示例组」。`);
    }
}

async function main() {
    console.log("==================================================================");
    console.log("🚀 小驴闪卡 (siyuan-lv-cards) · 隔离环境独立网页启动器");
    console.log("==================================================================");

    // 1. 检查状态
    const aliveCheck = await isKernelAlive(PORT, readToken(WORKSPACE));
    if (STATUS_ONLY) {
        if (aliveCheck.alive) {
            console.log(`✅ 隔离内核正在运行中！`);
            console.log(`   网页体验地址: http://127.0.0.1:${PORT}/stage/build/desktop/`);
            console.log(`   工作区目录:   ${WORKSPACE}`);
            console.log(`   端口:         ${PORT}`);
        } else {
            console.log(`⚪ 隔离内核未在端口 ${PORT} 运行。`);
        }
        return;
    }

    // 2. 停止命令
    if (STOP_ONLY) {
        console.log(`正在停止端口 ${PORT} 上的隔离内核...`);
        const stopped = await stopRunningKernel(WORKSPACE, PORT);
        console.log(stopped ? `✅ 隔离环境已安全停止！` : `⚪ 隔离环境未在运行。`);
        return;
    }

    // 3. 清理重置
    if (CLEAN_BOOT) {
        console.log(`[--clean] 正在停止既有内核并重置工作区: ${WORKSPACE}...`);
        await stopRunningKernel(WORKSPACE, PORT);
        try { fs.rmSync(WORKSPACE, { recursive: true, force: true }); } catch { /* ignore */ }
    }

    // 4. 重载已有运行实例
    if (aliveCheck.alive && RELOAD_ONLY) {
        console.log(`[--reload] 隔离内核已在端口 ${PORT} 运行，正在热更新插件静态文件...`);
        deployPluginPackage(WORKSPACE);
        console.log(`✅ 插件已更新至最新构建！请直接在网页端按 Ctrl+F5 刷新即可：`);
        console.log(`   👉 http://127.0.0.1:${PORT}/stage/build/desktop/`);
        return;
    }

    // 5. 若端口被占但非正常内核，尝试清理
    try {
        await checkPortFree(PORT);
    } catch {
        console.log(`⚠️ 端口 ${PORT} 被占用，尝试关闭既有残留进程...`);
        await stopRunningKernel(WORKSPACE, PORT);
    }

    // 6. 准备工作区与部署插件
    console.log(`[1/4] 初始化 D 盘隔离工作区: ${WORKSPACE}`);
    fs.mkdirSync(WORKSPACE, { recursive: true });
    const version = deployPluginPackage(WORKSPACE);
    console.log(`      已部署插件产物: ${PLUGIN_ID} v${version}`);

    // 7. 解析内核执行文件
    const { kernel, appDir } = resolveKernel();
    console.log(`[2/4] 启动独立思源内核 (端口: ${PORT})`);
    console.log(`      Kernel 路径: ${kernel}`);
    console.log(`      静态资源 wd: ${appDir}`);

    const logFile = path.join(WORKSPACE, "kernel.log");
    const outLog = fs.openSync(logFile, "a");

    const kproc = spawn(kernel, [
        "serve",
        "--workspace", WORKSPACE,
        "--wd", appDir,
        "--port", String(PORT),
        "--lang", "zh-CN",
    ], {
        detached: true,
        stdio: ["ignore", outLog, outLog],
        windowsHide: true,
        env: { ...process.env, SIYUAN_WORKSPACE_PATH: WORKSPACE },
    });
    kproc.unref();

    console.log(`      内核后台启动中，PID: ${kproc.pid}，日志: ${logFile}`);

    // 8. 等待内核准备就绪并读取真实 token
    console.log(`[3/4] 等待内核就绪与集市信任放行...`);
    const base = `http://127.0.0.1:${PORT}`;
    await waitKernelReady(base);

    const token = await fetchRealToken(WORKSPACE);
    console.log(`      内核已成功应答！Token: ${token ? token.slice(0, 6) + "..." : "自动生成"}`);
    console.log(`      内核已成功应答！Token: ${token.slice(0, 6)}...`);

    // 确保集市信任与插件启用生效
    try {
        await apiCall(base, token, "/api/setting/setBazaar", { trust: true, petal: true });
        await apiCall(base, token, "/api/petal/setPetalEnabled", { frontend: "desktop", packageName: PLUGIN_ID, enabled: true });
    } catch { /* ignore */ }

    // 9. 装载测试演练卡与动态看板
    console.log(`[4/4] 灌入走查演练卡与《闪卡动态看板与错题本》...`);
    await seedTestFixtureData(base, token);

    // 10. 保存运行时元数据
    const appUrl = `${base}/stage/build/desktop/`;
    saveInstanceMeta(WORKSPACE, {
        pid: kproc.pid,
        port: PORT,
        workspace: WORKSPACE,
        url: appUrl,
        token,
        version,
        startedAt: new Date().toISOString(),
    });

    console.log("==================================================================");
    console.log("🎉 小驴闪卡隔离环境已成功启动！");
    console.log("==================================================================");
    console.log(`🌐 浏览器访问链接：`);
    console.log(`   👉 \x1b[36m\x1b[4m${appUrl}\x1b[0m`);
    console.log(``);
    console.log(`📌 核心信息备忘：`);
    console.log(`   - 隔离端口：   ${PORT}（区别于小驴管家 43919 与系统日常 6806）`);
    console.log(`   - D 盘工作区： ${WORKSPACE}`);
    console.log(`   - 内核 PID：   ${kproc.pid}`);
    console.log(`   - 插件版本：   v${version}`);
    console.log(``);
    console.log(`💡 测试操作指引：`);
    console.log(`   1. 用 Chrome / Edge 浏览器直接打开上面的链接；`);
    console.log(`   2. 页面加载完成后，顶栏会出现「小驴闪卡」图标；`);
    console.log(`   3. 文档树中已预置《小驴闪卡演练本》，点击《闪卡动态看板与错题本》可查看原生 SQL 嵌入块动态汇总；`);
    console.log(`   4. 点击顶栏小驴闪卡进入复习，卡片已加入《小驴闪卡演练组》可直接开始点击评分与星标/错因走查；`);
    console.log(`   5. 随时告诉我你在网页中看到的具体效果与调整需求！`);
    console.log("==================================================================");
}

main().catch((err) => {
    console.error("\n❌ 隔离环境启动失败:", err?.stack || err);
    process.exitCode = 1;
});
