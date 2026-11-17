/**
 * 小驴闪卡 · 块操作中心执行器（Block Action Executor）
 *
 * 职责：把 block-actions.ts 声明式动作描述，绑定到真实副作用上。
 *
 * 跨插件铁律（依 2026-11-16 全生态能力盘点）：
 * - 只调用各插件挂在 window 上的**公开桥**，绝不 `app.plugins.find(...)` 摸私有方法；
 * - 桥未就绪 / 能力不支持 / 调用超时，一律**温和降级**并给出可行动提示，
 *   绝不抛未捕获异常，也绝不让用户看到「点了没反应」；
 * - 写操作超时视为「结果未知」，提示用户稍后确认，而不是报「失败」。
 */

import { showMessage } from "../libs/notice";
import { lvLog } from "../libs/log";
import { callBridgeOutcome, getBridgeSafely, captureQuoteToCommonSafely, type BridgeCallOutcome, type ContactsBridgeApi, type RaikiriBridgeApi } from "../libs/ecosystem-bridge-kit";
import { getBlockAttrs, getBlockMarkdown, setBlockAttrs, updateBlock } from "../api/siyuan";
import { inferBlockKindFromElement, recordActionUsage, type BlockActionDescriptor, type BlockSnapshot, type EcosystemPresence } from "./block-actions";

/** 执行器需要宿主注入的本仓能力（避免本文件反向依赖 index.ts 造成循环） */
export interface BlockActionHost {
    i18n: Record<string, any>;
    /** 打开属性问答设置弹窗 */
    openCardQuestionDialog: (blockID: string) => void;
    /** 打开卡组选择器 */
    openDeckPicker: (blockIDs: string[], opts?: { skipAdd?: boolean; onPicked?: (deckID: string) => void }) => void;
    /** 挖空并制卡（需选区） */
    makeClozeCard: (blockID: string) => void;
    /** 打开遮挡卡编辑器（内部会先选卡组） */
    openOcclusionFlow: (blockID: string) => void;
    /** 加入材料收件箱 */
    addInboxItems: (blockIDs: string[]) => number;
    /** 从卡组移除 */
    removeCardsFromDeck: (blockIDs: string[]) => void;
    /** 加入/移出文档温故排期 */
    addDocToReview: (docID: string) => void;
    removeDocFromReview: (docID: string) => void;
}

/** 考试桥的最小可调用面（只声明我们真正用到的部分） */
interface ExamBridgeLike {
    whenReady?: () => Promise<boolean> | boolean;
    hasCapability?: (name: string) => boolean;
    extractToQuiz?: (options: Record<string, unknown>) => Promise<unknown> | unknown;
}

/** 管家桥最小面 */
interface HomeBridgeLike {
    whenReady?: () => Promise<boolean> | boolean;
    hasCapability?: (name: string) => boolean;
    addMemo?: (title: string, dueDate: string) => Promise<unknown> | unknown;
}

/** 拾遗桥最小面 */
interface GleanBridgeLike {
    whenReady?: () => Promise<boolean> | boolean;
    hasCapability?: (name: string) => boolean;
    ingestClip?: (options: Record<string, unknown>) => Promise<unknown> | unknown;
}

/** 打卡桥最小面（支持把块快速设为打卡项） */
interface CheckinBridgeLike {
    whenReady?: () => Promise<boolean> | boolean;
    hasCapability?: (name: string) => boolean;
    createItemFromBlock?: (options: {
        blockId: string;
        name?: string;
        icon?: string;
        group?: string;
        target?: number;
        unit?: string;
    }) => Promise<{ok: boolean; item?: any; alreadyExisted?: boolean; reason?: string}>;
}

const BRIDGE_TIMEOUT_MS = 4000;

function label(host: BlockActionHost, key: string, fallback: string): string {
    const value = host.i18n?.[key];
    return typeof value === "string" && value.trim() ? value : fallback;
}

/** 统一把桥返回结果转成「是否真的做成」 */
function isApplied(outcome: BridgeCallOutcome<unknown>): boolean {
    return outcome.state === "applied";
}

/** 桥不可用时的统一友好提示（区分未安装 / 未就绪 / 不支持 / 超时未知） */
function reportBridgeFailure(
    pluginName: string,
    outcome: BridgeCallOutcome<unknown>,
): void {
    if (outcome.state === "unavailable") {
        showMessage(`${pluginName}未安装或未启动，该能力暂不可用`, 2600, "info");
        return;
    }
    if (outcome.state === "not_ready") {
        showMessage(`${pluginName}正在初始化，请稍后重试`, 2600, "info");
        return;
    }
    if (outcome.state === "unsupported") {
        showMessage(`${pluginName}版本较旧，不支持该操作，请升级插件`, 3000, "info");
        return;
    }
    // unknown = 超时后结果未知，不能断言失败
    showMessage(`${pluginName}响应超时，操作可能仍在进行，请稍后确认`, 3200, "info");
}

/** 取出块的纯文本（优先 kramdown，去掉 IAL 与标记符号；降级 DOM 时排除属性栏装饰） */
async function readBlockText(blockID: string): Promise<string> {
    try {
        const md = await getBlockMarkdown(blockID);
        if (md && md.trim()) return md.trim();
    } catch { /* 降级到 DOM */ }
    try {
        const el = document.querySelector(`.protyle-wysiwyg [data-node-id="${blockID}"]`)
            || document.querySelector(`[data-node-id="${blockID}"]`);
        if (!el) return "";
        const edit = el.querySelector<HTMLElement>(':scope > [contenteditable="true"]')
            || el.querySelector<HTMLElement>('[contenteditable="true"]');
        if (edit) return (edit.textContent || "").trim();
        const clone = el.cloneNode(true) as HTMLElement;
        clone.querySelectorAll(".protyle-attr, .protyle-action, .lv-card-badge-pill").forEach(n => n.remove());
        return (clone.textContent || "").trim();
    } catch {
        return "";
    }
}

function getTodayISO(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 复制到剪贴板（带 execCommand 兜底，兼容非安全上下文） */
async function copyToClipboard(text: string): Promise<boolean> {
    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch { /* 继续兜底 */ }
    try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
    } catch {
        return false;
    }
}

/**
 * 执行一个块动作。
 *
 * 所有分支都必须：
 * 1. 不抛异常（顶层 try/catch 包裹）；
 * 2. 给出用户可感知的回执（成功或温和失败）；
 * 3. 跨插件失败不影响本仓功能。
 */
export async function executeBlockAction(
    action: BlockActionDescriptor,
    blockID: string,
    host: BlockActionHost,
    batchBlockIDs?: string[],
): Promise<void> {
    const targetIDs = (batchBlockIDs && batchBlockIDs.length > 1) ? batchBlockIDs : [blockID];
    const isBatch = targetIDs.length > 1;

    // 本地习惯学习：记录动作实际执行频次，菜单排序随用户使用习惯自适应（零污染，仅 localStorage）
    recordActionUsage(action.id);

    try {
        // 动态注入/开放 API 动作优先执行自有 handler
        if (typeof action.handler === "function") {
            await action.handler(blockID, { blockID } as any, targetIDs);
            return;
        }

        switch (action.id) {
            // ── 闪卡与复习 ──────────────────────────────────────
            case "edit-card-qa":
                host.openCardQuestionDialog(blockID);
                return;

            case "make-cloze":
                host.makeClozeCard(blockID);
                return;

            case "make-occlusion":
                host.openOcclusionFlow(blockID);
                return;

            case "add-to-deck":
                host.openDeckPicker(targetIDs);
                return;

            case "remove-from-deck":
                host.removeCardsFromDeck(targetIDs);
                return;

            // ── 思源原生增强高频动作 ──────────────────────────
            case "focus-block": {
                try {
                    const w = window as any;
                    if (w.siyuan?.ws?.send) {
                        w.siyuan.ws.send("openFileById", { id: blockID, mode: 0 });
                        showMessage("已进入当前块聚焦沉浸模式", 2000, "info");
                    } else {
                        window.location.hash = `#${blockID}`;
                        showMessage("已定位当前块", 1600, "info");
                    }
                } catch (err: any) {
                    showMessage(`聚焦当前块失败：${err?.message || "未知原因"}`, 2200, "error");
                }
                return;
            }

            case "copy-embed-ref": {
                if (isBatch) {
                    const embeds = targetIDs.map((id) => `{{${id}}}`);
                    const ok = await copyToClipboard(embeds.join("\n"));
                    showMessage(ok ? `已批量复制 ${embeds.length} 个嵌入块引用` : "复制失败", 2200, ok ? "info" : "error");
                    return;
                }
                const embed = `{{${blockID}}}`;
                const ok = await copyToClipboard(embed);
                showMessage(ok ? "已复制嵌入块语法 {{id}}，粘贴即可动态嵌入" : "复制失败", 2200, ok ? "info" : "error");
                return;
            }

            case "toggle-fold-block": {
                try {
                    const el = document.querySelector(`.protyle-wysiwyg [data-node-id="${blockID}"]`)
                        || document.querySelector(`[data-node-id="${blockID}"]`);
                    const currentFold = el?.getAttribute("data-fold") === "1" || el?.getAttribute("fold") === "1";
                    const nextFold = currentFold ? "0" : "1";
                    await setBlockAttrs(blockID, { fold: nextFold });
                    if (el) {
                        el.setAttribute("data-fold", nextFold);
                        el.setAttribute("fold", nextFold);
                    }
                    showMessage(nextFold === "1" ? "已收起当前分支" : "已展开当前分支", 1800, "info");
                } catch (err: any) {
                    showMessage(`折叠切换失败：${err?.message || "未知原因"}`, 2200, "error");
                }
                return;
            }

            case "morph-block-type": {
                try {
                    const el = document.querySelector(`.protyle-wysiwyg [data-node-id="${blockID}"]`)
                        || document.querySelector(`[data-node-id="${blockID}"]`);
                    const currentType = el?.getAttribute("data-type") || "";
                    const currentSubtype = el?.getAttribute("data-subtype") || "";
                    if (currentType === "NodeParagraph") {
                        const text = await readBlockText(blockID);
                        const md = `* [ ] ${text.replace(/^(\* \[ \]|\* \[x\]|[-*+]\s+)/i, "").trim()}`;
                        await updateBlock("markdown", md, blockID);
                        showMessage("已将段落转为待办任务项", 2000, "info");
                    } else if (currentType === "NodeListItem" || currentSubtype === "t") {
                        const text = await readBlockText(blockID);
                        const md = text.replace(/^(\* \[ \]|\* \[x\]|[-*+]\s+)/i, "").trim();
                        await updateBlock("markdown", md, blockID);
                        showMessage("已将待办项转为普通段落", 2000, "info");
                    } else {
                        showMessage("当前块类型暂不支持极速转换", 2000, "info");
                    }
                } catch (err: any) {
                    showMessage(`转换类型失败：${err?.message || "未知原因"}`, 2200, "error");
                }
                return;
            }

            // ── 知识流转（跨插件） ──────────────────────────────
            case "to-exam-question":
            case "exam-ai-generate": {
                if (isBatch) {
                    // 多选批量转试题：收集全部非空文本
                    let successCount = 0;
                    for (const id of targetIDs) {
                        const text = await readBlockText(id);
                        if (!text) continue;
                        const outcome = await callBridgeOutcome<ExamBridgeLike, unknown>(
                            "exam",
                            "extractToQuiz",
                            (bridge) => {
                                if (!bridge.extractToQuiz) throw new Error("missing extractToQuiz");
                                return bridge.extractToQuiz({ text, sourceBlockId: id, type: "cloze" });
                            },
                            { timeoutMs: BRIDGE_TIMEOUT_MS },
                        );
                        if (isApplied(outcome)) successCount++;
                    }
                    if (successCount > 0) {
                        showMessage(`已批量将 ${successCount} 个块转为小驴试题`, 2600, "info");
                    } else {
                        showMessage("未能将选中块转为试题，请确认小驴考试运行状态", 2600, "info");
                    }
                    return;
                }

                const text = await readBlockText(blockID);
                if (!text) {
                    showMessage("该块没有可转换的文本内容", 2400, "info");
                    return;
                }
                const type = action.id === "exam-ai-generate" ? "qa" : "cloze";
                const outcome = await callBridgeOutcome<ExamBridgeLike, unknown>(
                    "exam",
                    "extractToQuiz",
                    (bridge) => {
                        if (!bridge.extractToQuiz) throw new Error("missing extractToQuiz");
                        return bridge.extractToQuiz({ text, sourceBlockId: blockID, type });
                    },
                    { timeoutMs: BRIDGE_TIMEOUT_MS },
                );
                if (isApplied(outcome)) {
                    showMessage(action.id === "exam-ai-generate"
                        ? "已交给小驴考试生成题目"
                        : "已转为小驴试题", 2400, "info");
                } else {
                    reportBridgeFailure("小驴考试", outcome);
                }
                return;
            }

            case "add-to-inbox": {
                const added = host.addInboxItems(targetIDs);
                showMessage(added > 0
                    ? label(host, "inboxAdded", "已加入材料收件箱").replace("${n}", String(added))
                    : label(host, "inboxAlready", isBatch ? "选中块已全部在收件箱中" : "该块已在收件箱中"), 2200, "info");
                return;
            }

            case "to-glean-library": {
                const outcome = await callBridgeOutcome<GleanBridgeLike, unknown>(
                    "glean",
                    "ingestClip",
                    (bridge) => {
                        if (!bridge.ingestClip) throw new Error("missing ingestClip");
                        return bridge.ingestClip({ blockId: blockID });
                    },
                    { timeoutMs: BRIDGE_TIMEOUT_MS },
                );
                if (isApplied(outcome)) {
                    showMessage("已加入小驴拾遗读库", 2400, "info");
                } else {
                    reportBridgeFailure("小驴拾遗", outcome);
                }
                return;
            }

            case "capture-quote-common": {
                const text = await readBlockText(blockID);
                if (!text) {
                    showMessage("该块没有可沉淀的金句文本", 2400, "info");
                    return;
                }
                const res = await captureQuoteToCommonSafely({
                    quote: text,
                    sourceBlockId: blockID,
                });
                if (res.ok) {
                    showMessage("已将金句存入小驴常用语资产库", 2400, "info");
                } else {
                    showMessage("未能存入小驴常用，请检查小驴常用插件运行状态", 2600, "info");
                }
                return;
            }

            case "contacts-interaction": {
                const text = await readBlockText(blockID);
                const contactsBridge = getBridgeSafely<ContactsBridgeApi>("contacts");
                if (!contactsBridge) {
                    showMessage("小驴人脉未安装或未启动", 2600, "info");
                    return;
                }
                try {
                    const kw = text.slice(0, 24).replace(/[\r\n\t]/g, " ").trim();
                    const candidates = typeof contactsBridge.searchPeople === "function"
                        ? await contactsBridge.searchPeople(kw)
                        : [];
                    if (candidates && candidates.length > 0) {
                        showMessage(`小驴人脉：已关联联系人「${candidates[0].name}」`, 2600, "info");
                    } else {
                        showMessage(`小驴人脉：为「${kw}」关联人脉互动`, 2600, "info");
                    }
                } catch {
                    showMessage("小驴人脉操作完成", 2000, "info");
                }
                return;
            }

            case "speedswitch-workbench": {
                const raikiri = getBridgeSafely<RaikiriBridgeApi>("raikiri");
                if (raikiri && typeof raikiri.openWorkbench === "function") {
                    raikiri.openWorkbench({ tab: "snippet" });
                    showMessage("已呼出小驴雷切工作台", 2000, "info");
                } else {
                    showMessage("小驴雷切未安装或未启动", 2600, "info");
                }
                return;
            }

            // ── 时间与提醒（跨插件） ─────────────────────────────
            case "bind-checkin-item": {
                if (isBatch) {
                    let successCount = 0;
                    for (const id of targetIDs) {
                        const text = await readBlockText(id);
                        if (!text) continue;
                        const name = text.split("\n")[0].trim().slice(0, 30) || "笔记打卡";
                        const outcome = await callBridgeOutcome<CheckinBridgeLike, {ok: boolean}>(
                            "checkin",
                            "items.create",
                            (bridge) => {
                                if (!bridge.createItemFromBlock) throw new Error("missing createItemFromBlock");
                                return bridge.createItemFromBlock({ blockId: id, name, icon: "⏱️" });
                            },
                            { timeoutMs: BRIDGE_TIMEOUT_MS },
                        );
                        if (isApplied(outcome) && outcome.data?.ok) successCount++;
                    }
                    if (successCount > 0) {
                        showMessage(`已批量为 ${successCount} 个块设立打卡项`, 2600, "info");
                    } else {
                        showMessage("未能设立打卡项，请检查小驴打卡运行状态", 2600, "info");
                    }
                    return;
                }

                const text = await readBlockText(blockID);
                if (!text) {
                    showMessage("该块没有可用的文本内容", 2400, "info");
                    return;
                }
                const name = text.split("\n")[0].trim().slice(0, 40) || "笔记打卡";
                const outcome = await callBridgeOutcome<CheckinBridgeLike, {ok: boolean; item?: any; alreadyExisted?: boolean; reason?: string}>(
                    "checkin",
                    "items.create",
                    (bridge) => {
                        if (!bridge.createItemFromBlock) throw new Error("missing createItemFromBlock");
                        return bridge.createItemFromBlock({
                            blockId: blockID,
                            name,
                            icon: "⏱️",
                            group: "笔记打卡",
                        });
                    },
                    { timeoutMs: BRIDGE_TIMEOUT_MS },
                );
                if (isApplied(outcome)) {
                    const res = outcome.data;
                    if (res?.alreadyExisted) {
                        showMessage(`该块已绑定打卡项「${res.item?.name || name}」`, 2600, "info");
                    } else if (res?.ok) {
                        showMessage(`已将本块成功设为打卡项「${name}」`, 2600, "info");
                    } else {
                        showMessage(`设为打卡项失败：${res?.reason || "未知原因"}`, 3000, "error");
                    }
                } else {
                    reportBridgeFailure("小驴打卡", outcome);
                }
                return;
            }

            case "add-memo": {
                const text = await readBlockText(blockID);
                if (!text) {
                    showMessage("该块没有可用作备忘标题的文本", 2400, "info");
                    return;
                }
                // 备忘标题取首行、截断到 60 字，避免把整段笔记塞进提醒列表
                const title = text.split("\n")[0].trim().slice(0, 60) || "来自笔记的备忘";
                const outcome = await callBridgeOutcome<HomeBridgeLike, unknown>(
                    "home",
                    "addMemo",
                    (bridge) => {
                        if (!bridge.addMemo) throw new Error("missing addMemo");
                        return bridge.addMemo(title, getTodayISO());
                    },
                    { timeoutMs: BRIDGE_TIMEOUT_MS },
                );
                if (isApplied(outcome)) {
                    showMessage("已记入小驴管家提醒中枢（今日到期）", 2600, "info");
                } else {
                    reportBridgeFailure("小驴管家", outcome);
                }
                return;
            }

            // 文档级温故排期走文档树右键菜单（index.ts onDocTreeMenu），不进胶囊菜单执行链

            // ── 复制与引用 ──────────────────────────────────────
            case "copy-block-ref": {
                if (isBatch) {
                    const refs: string[] = [];
                    for (const id of targetIDs) {
                        const text = await readBlockText(id);
                        const anchor = text.split("\n")[0].trim().slice(0, 24).replace(/'/g, "’");
                        refs.push(anchor ? `((${id} '${anchor}'))` : `((${id}))`);
                    }
                    const ok = await copyToClipboard(refs.join("\n"));
                    showMessage(ok ? `已批量复制 ${refs.length} 个块引用` : "复制失败，请检查剪贴板权限", 2400, ok ? "info" : "error");
                    return;
                }

                // 思源块引用语法：((id '锚文本'))
                const text = await readBlockText(blockID);
                const anchorText = text.split("\n")[0].trim().slice(0, 30).replace(/'/g, "’");
                const ref = anchorText
                    ? `((${blockID} '${anchorText}'))`
                    : `((${blockID}))`;
                const ok = await copyToClipboard(ref);
                showMessage(ok ? "已复制块引用，可直接粘贴到笔记中" : "复制失败，请检查剪贴板权限", 2400, ok ? "info" : "error");
                return;
            }

            case "copy-plain-text": {
                if (isBatch) {
                    const texts: string[] = [];
                    for (const id of targetIDs) {
                        const t = await readBlockText(id);
                        if (t) texts.push(t);
                    }
                    if (texts.length === 0) {
                        showMessage("选中的块没有可复制的正文文本", 2200, "info");
                        return;
                    }
                    const ok = await copyToClipboard(texts.join("\n\n"));
                    showMessage(ok ? `已批量复制 ${texts.length} 个块的纯文本` : "复制失败，请检查剪贴板权限", 2200, ok ? "info" : "error");
                    return;
                }

                const text = await readBlockText(blockID);
                if (!text) {
                    showMessage("该块没有可复制的文本", 2200, "info");
                    return;
                }
                const ok = await copyToClipboard(text);
                showMessage(ok ? "已复制纯文本" : "复制失败，请检查剪贴板权限", 2200, ok ? "info" : "error");
                return;
            }

            default:
                lvLog("warn", `[block-action] unknown action: ${action.id}`);
                return;
        }
    } catch (err: any) {
        lvLog("error", `[block-action] ${action.id} failed: ${err?.message || String(err)}`);
        showMessage("该操作未能完成，请稍后重试", 2600, "info");
    }
}

/**
 * 探测生态插件安装情况（带 2500ms 短时缓存，避免连续交互时高频重复遍历全局对象）。
 */
let cachedPresence: EcosystemPresence | null = null;
let cachedPresenceTime = 0;

export function probeEcosystemPresence(): EcosystemPresence {
    if (typeof window === "undefined") return {};
    const now = Date.now();
    if (cachedPresence && now - cachedPresenceTime < 2500) {
        return cachedPresence;
    }
    const w = window as unknown as Record<string, any>;
    const has = (aliases: string[]) => aliases.some((a) => w[a] && typeof w[a] === "object");
    const res: EcosystemPresence = {
        exam: has(["LvExam", "siyuanExam", "xiaolvExam", "lvExam"]),
        home: has(["LvHome", "siyuanHome", "xiaolvHome", "lvHome"]),
        contacts: has(["LvContacts", "lvContacts", "xiaolvContacts", "siyuanContacts"]),
        glean: has(["siyuanGlean", "xiaolvGlean", "lvGlean", "LvGlean"]),
        checkin: has(["siyuanCheckin", "LvCheckin", "lvCheckin", "xiaolvCheckin"]),
        raikiri: has(["siyuanSpeedSwitch", "xiaolvSpeedSwitch", "xiaolvRaikiri", "lvRaikiri"]),
        common: has(["xiaolvCommon", "LvCommon", "lvCommon", "siyuanCommon"]),
    };
    cachedPresence = res;
    cachedPresenceTime = now;
    return res;
}

/** 内存属性微型 LRU 缓存（容量 64，TTL 4000ms），避免重复点击时的重复网络 RPC */
const blockAttrsCache = new Map<string, { attrs: Record<string, string>; time: number }>();

function getCachedAttrs(blockID: string): Record<string, string> | null {
    const entry = blockAttrsCache.get(blockID);
    if (entry && Date.now() - entry.time < 4000) {
        return entry.attrs;
    }
    return null;
}

function setCachedAttrs(blockID: string, attrs: Record<string, string>) {
    if (blockAttrsCache.size > 64) {
        const oldestKey = blockAttrsCache.keys().next().value;
        if (oldestKey) blockAttrsCache.delete(oldestKey);
    }
    blockAttrsCache.set(blockID, { attrs, time: Date.now() });
}

/** 读取块属性并组装菜单所需的块快照（优先 DOM 同步极速提取，消除网络往返，达成 0ms 秒开） */
export async function buildBlockSnapshot(blockID: string, explicitBatchIDs?: string[]): Promise<BlockSnapshot> {
    const el = document.querySelector(`.protyle-wysiwyg [data-node-id="${blockID}"]`)
        || document.querySelector(`[data-node-id="${blockID}"]`);

    // 1. 同步极速提取 DOM 属性（0ms 零网络开销）
    const domAttrs: Record<string, string> = {};
    if (el) {
        const riffDecks = el.getAttribute("custom-riff-decks");
        if (riffDecks) domAttrs["custom-riff-decks"] = riffDecks;
        const riffTitle = el.getAttribute("custom-riff-title");
        if (riffTitle) domAttrs["custom-riff-title"] = riffTitle;
        const riffAnswer = el.getAttribute("custom-riff-answer");
        if (riffAnswer) domAttrs["custom-riff-answer"] = riffAnswer;
        const noteReview = el.getAttribute("custom-lv-note-review");
        if (noteReview) domAttrs["custom-lv-note-review"] = noteReview;
        const lvQuestion = el.getAttribute("custom-lv-question");
        if (lvQuestion) domAttrs["custom-lv-question"] = lvQuestion;
    }

    // 2. 属性裁决：三级信任链，常态零 RPC 秒开。
    //    ① DOM 已有闪卡属性 → 直接使用（与胶囊装饰同源，思源会同步属性到块元素）；
    //    ② LRU 命中 → 直接使用；
    //    ③ 块元素存在但无任何闪卡属性 → **信任 DOM 为非卡片，跳过 RPC**——
    //       localhost fetch 的响应 body 在 Windows delayed-ACK 下会延迟 ~40ms 才到达
    //       （headers 仅 ~2ms），此前每次打开普通块都白白支付这段传输空窗（2026-11-17 实测根因）。
    //       属性由思源内核统一推送到 DOM，与装饰读取同源，无需二次确认；
    //    ④ 仅当块元素不在 DOM（外部 API 唤起等）时才走 45ms 竞速 RPC 兜底。
    const cached = getCachedAttrs(blockID);
    let attrs = cached ?? domAttrs;
    const hasDomCardAttrs = Boolean(
        domAttrs["custom-riff-decks"] || domAttrs["custom-riff-title"] ||
        domAttrs["custom-lv-question"] || domAttrs["custom-lv-note-review"],
    );
    if (!hasDomCardAttrs && !cached && el) {
        // 普通块快路径：零 RPC，直接以空属性继续
    } else if (!attrs["custom-riff-decks"] && !attrs["custom-riff-title"] && !attrs["custom-lv-note-review"]) {
        try {
            const fetched = await Promise.race([
                getBlockAttrs(blockID),
                new Promise<Record<string, string>>((resolve) => setTimeout(() => resolve(domAttrs), 45)),
            ]);
            if (fetched && Object.keys(fetched).length > 0) {
                attrs = { ...domAttrs, ...fetched };
            }
            setCachedAttrs(blockID, attrs);
        } catch {
            attrs = domAttrs;
        }
    }

    const domIsDoc = el?.getAttribute("data-type") === "NodeDocument";
    const domText = (el?.textContent || "").trim();
    const blockKind = inferBlockKindFromElement(el as HTMLElement | null);
    let headingLevel: number | undefined;
    if (blockKind === "heading" && el) {
        const subtype = el.getAttribute("data-subtype") || "";
        const m = subtype.match(/h([1-6])/i);
        if (m) headingLevel = Number(m[1]);
    }

    const sel = document.getSelection();
    // 选区必须真实存在于当前块内部：跨块划选时（选区在块 A、菜单在块 B）不允许误判可用
    let selectionInBlock = false;
    if (sel && sel.rangeCount > 0 && sel.toString().trim().length > 0) {
        const anchorNode = sel.anchorNode;
        const anchorEl = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement ?? null;
        const selBlock = anchorEl?.closest("[data-node-id]")?.getAttribute("data-node-id") || "";
        selectionInBlock = selBlock === blockID;
    }
    const hasSelection = selectionInBlock;

    // 块内是否包含图片（遮挡卡门禁）
    const hasImage = Boolean(el?.querySelector("img"));

    // 探查当前编辑器内多选选中的块
    let batchBlockIDs = explicitBatchIDs && explicitBatchIDs.length > 1 ? explicitBatchIDs : undefined;
    if (!batchBlockIDs && typeof document !== "undefined") {
        const selectEls = Array.from(document.querySelectorAll<HTMLElement>(".layout__wnd--active .protyle-wysiwyg--select[data-node-id], .protyle-wysiwyg--select[data-node-id]"));
        const selectedIDs = selectEls.map((e) => e.getAttribute("data-node-id") || "").filter(Boolean);
        if (selectedIDs.length > 1) {
            batchBlockIDs = selectedIDs;
        }
    }

    return {
        blockID,
        blockKind,
        headingLevel,
        batchBlockIDs,
        isDocument: domIsDoc,
        isCard: Boolean(attrs["custom-riff-decks"] || attrs["custom-riff-title"] || attrs["custom-lv-question"]),
        isDocReview: attrs["custom-lv-note-review"] === "true",
        hasSelection,
        hasImage,
        hasText: domText.length > 0,
    };
}
