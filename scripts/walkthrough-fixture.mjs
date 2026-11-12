// 代理走查夹具（docs/54 §5）：向隔离工作区灌入一套固定的混合卡组，供 T1–T5 任务走查。
// 只允许对隔离内核运行：拒绝 6806 端口（本机日常思源），且要求工作区内没有夹具以外的笔记本。
// 用法：node scripts/walkthrough-fixture.mjs --base http://127.0.0.1:<port> --ws <工作区目录>
//   内容：挖空 70 张、超级块问答 30 张、图片遮挡 2 张、坏卡 10 张（无答案 / 超长 / 重复 / 来源已删）。

import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const base = arg("--base");
const ws = arg("--ws");
if (!base || !ws) {
    console.error("用法：--base http://127.0.0.1:<port> --ws <隔离工作区目录>");
    process.exit(1);
}
if (/:6806\b/.test(base)) {
    console.error("拒绝运行：6806 是本机日常思源端口，夹具只能灌入隔离工作区");
    process.exit(1);
}
const token = JSON.parse(fs.readFileSync(path.join(ws, "conf", "conf.json"), "utf8")).api.token;
const NB_NAME = "走查夹具";

async function api(ep, body) {
    // 新建笔记本后内核需要几秒准备元数据，期间返回 “not ready”；Windows 杀毒软件偶尔短暂锁住内核临时文件，返回 “Access is denied”。两者都按需重试
    for (let attempt = 0; ; attempt++) {
        const r = await fetch(base + ep, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Token ${token}` },
            body: JSON.stringify(body ?? {}),
        });
        const j = await r.json();
        if (j.code === 0) return j.data;
        if (/not ready|Access is denied/i.test(String(j.msg)) && attempt < 30) {
            await new Promise((res) => setTimeout(res, 1000));
            continue;
        }
        throw new Error(`${ep} → ${j.msg}`);
    }
}

const notebooks = (await api("/api/notebook/lsNotebooks")).notebooks ?? [];
const foreign = notebooks.filter((n) => n.name !== NB_NAME);
if (foreign.length > 0) {
    console.error(`拒绝运行：工作区里有夹具以外的笔记本（${foreign.map((n) => n.name).join("、")}），不像隔离工作区`);
    process.exit(1);
}
const decks = await api("/api/riff/getRiffDecks");
if (decks.some((d) => d.name === "走查卡组" && d.size > 0)) {
    console.log("夹具已存在，跳过");
    process.exit(0);
}

const nb = notebooks.find((n) => n.name === NB_NAME)?.id
    ?? (await api("/api/notebook/createNotebook", { name: NB_NAME })).notebook.id;
const deckID = decks.find((d) => d.name === "走查卡组")?.id
    ?? (await api("/api/riff/createRiffDeck", { name: "走查卡组" })).id;

async function doc(title, blocksMd) {
    const docID = await api("/api/filetree/createDocWithMd", { notebook: nb, path: `/${title}`, markdown: "" });
    const ids = [];
    for (const md of blocksMd) {
        const ops = await api("/api/block/appendBlock", { dataType: "markdown", data: md, parentID: docID });
        ids.push(ops[0].doOperations[0].id);
    }
    return { docID, ids };
}

const bio = Array.from({ length: 40 }, (_, i) => `细胞知识 ${i + 1}：线粒体第 ${i + 1} 项功能是 ==产生能量的第 ${i + 1} 种途径==。`);
const eng = Array.from({ length: 30 }, (_, i) => `单词 ${i + 1}：word${i + 1} 的意思是 ==释义${i + 1}==。`);
const his = Array.from({ length: 30 }, (_, i) => `{{{row\n近代史问题 ${i + 1}：第 ${i + 1} 次改革发生在哪一年？\n\n答案：${1840 + i} 年，主要内容是第 ${i + 1} 项措施。\n}}}`);
const longText = "这是一张故意写得过长的卡片，用来检查卡面是否会把评分栏挤出可视区。".repeat(25);
const bad = [
    "坏卡 1：这张卡没有任何挖空标记，也没有答案。",
    "坏卡 2：同样没有答案，只有一句陈述。",
    "坏卡 3：问题是什么？",
    `坏卡 4：${longText}==答案在最后==`,
    `坏卡 5：${longText}==另一个答案==`,
    `坏卡 6：${longText}==第三个答案==`,
    "坏卡 7（重复）：线粒体第 1 项功能是 ==产生能量的第 1 种途径==。",
    "坏卡 8（重复）：word1 的意思是 ==释义1==。",
    "坏卡 9：来源稍后会被删除 ==答案九==",
    "坏卡 10：来源稍后会被删除 ==答案十==",
];

const d1 = await doc("生物·细胞", bio);
const d2 = await doc("英语·词汇", eng);
const d3 = await doc("历史·近代", his);
const d4 = await doc("坏卡", bad);

// 图片遮挡：上传插件图标作为图片，写入两个已有遮挡框
const iconPath = path.resolve("icon.png");
const form = new FormData();
form.append("assetsDirPath", "/assets/");
form.append("file[]", new Blob([fs.readFileSync(iconPath)], { type: "image/png" }), "walkthrough-occlusion.png");
const up = await fetch(base + "/api/asset/upload", { method: "POST", headers: { Authorization: `Token ${token}` }, body: form }).then((r) => r.json());
const assetPath = Object.values(up.data.succMap)[0];
const d5 = await doc("遮挡", [`![遮挡示例 1](${assetPath})`, `![遮挡示例 2](${assetPath})`]);
const occl = JSON.stringify({ v: 1, rects: [{ x: 0.1, y: 0.1, w: 0.3, h: 0.2 }, { x: 0.5, y: 0.6, w: 0.3, h: 0.2 }] });
for (const id of d5.ids) await api("/api/attr/setBlockAttrs", { id, attrs: { "lv-occlusion": occl } });
const occlBack = await api("/api/attr/getBlockAttrs", { id: d5.ids[0] });

const all = [...d1.ids, ...d2.ids, ...d3.ids, ...d4.ids, ...d5.ids];
await api("/api/riff/addRiffCards", { deckID, blockIDs: all });

// 坏卡 9、10：入组后删除来源块
for (const id of d4.ids.slice(8)) await api("/api/block/deleteBlock", { id });

const due = await api("/api/riff/getRiffDueCards", { deckID });
console.log(JSON.stringify({
    notebook: nb,
    deckID,
    cards: all.length,
    due: due.cards?.length ?? 0,
    occlusionAttrPersisted: Boolean(occlBack["lv-occlusion"]),
    occlusionBlocks: d5.ids,
}, null, 2));
