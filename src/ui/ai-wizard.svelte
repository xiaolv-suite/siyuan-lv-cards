<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { showMessage } from "@/libs/notice";
    import { getRiffDecks, createRiffDeck, type RiffDeck } from "@/api/riff";
    import { classifyAiFailure, isAICanceled } from "@/api/ai";
    import { lintAICards } from "@/core/ai-lint";
    import { maskSensitive, scanSensitive, type SensitiveHit } from "@/core/ai-sensitive";
    import { scoreBatch, type Scorecard } from "@/core/ai-quality-scorecard";
    import { proposeCardSplits, validateQaDraft } from "@/core/flashcard-quality";
    import { renderUnifiedCardFace } from "@/core/card-face";
    import { inspectAiCandidates, selectImportableAiCandidates, type AiCardGateIssue } from "@/core/ai-card-gate";
    import { planReview, type ReviewPlan } from "@/core/ai-review-strategy";
    import { appendVersion, type CardProvenance, type ProvenanceVersion } from "@/core/ai-provenance";
    import { getMotionDuration } from "./kit/motion";
    import LvIcon from "./kit/LvIcon.svelte";
    import { extractDroppedBlockText } from "@/core/drag-drop";

    /** BU-36 分层预算报告（宿主 assembleGeneratePrompt 纯函数产出） */
    interface BudgetPreview {
        budgetTokens: number;
        budgetSource: "model-registry" | "task-default";
        modelId: string | null;
        totalTokens: number;
        sourceTokens: number;
        needsBatching: boolean;
        layers: { key: string; tokens: number; originalTokens?: number; truncated?: boolean; dropped?: boolean }[];
    }
    import LvChip from "./kit/LvChip.svelte";
    import LvSteps from "./kit/LvSteps.svelte";
    import { getBridgeSafely, getCommonSnippetsSafely, type CommonSnippet } from "@/libs/ecosystem-bridge-kit";

    const hasCommonBridge = $derived(Boolean(getBridgeSafely("common")));
    let commonSnippets = $state<CommonSnippet[]>([]);
    let commonLoading = $state(false);

    async function loadCommonSnippets() {
        if (commonLoading) return;
        commonLoading = true;
        try {
            commonSnippets = await getCommonSnippetsSafely();
            if (commonSnippets.length === 0) {
                showMessage("小驴常用语中暂无可用收藏或最近素材", 2000, "info");
            }
        } finally {
            commonLoading = false;
        }
    }

    function appendCommonSnippet(snip: CommonSnippet) {
        const title = snip.title || "常用语素材";
        addSource(title, snip.content);
        showMessage(`已引入素材「${title}」`, 2000, "info");
    }

    let { i18n, initialSource = "", initialSources = [], loadCurrentDoc, loadNotebookMaterial, loadNotebooks, generate, onCreate, onClose, closeLabel, embedded = false, onImportComplete, getUnfinishedJob, openDocById, isSourceDenied, onDenySource, sensitiveTerms = "", modelTrustKnown, previewBudget, recoveryJob = null }: {
        i18n: any;
        /** 预填材料（leech 改写联动） */
        initialSource?: string;
        /** 带有来源身份的预填材料（收件箱联动）；正文仍由用户在本次发送前核对 */
        initialSources?: { label: string; content: string; docId?: string; nbId?: string; inboxId?: string }[];
        /** 调用方实现：构造 prompt → 调 AI → 解析卡片（ADR-7：返回 cards + jobId 供断点续传）；第三参为取消信号（AQ-14）+ 来源 provenance（BW-9 禁止外发判定）；gen 为生成环境快照（BU-15） */
        generate: (source: string, cfg: { count: number; language: string; type: "qa" | "cloze" }, opts?: { signal?: AbortSignal; provenance?: { notebookIds?: string[]; docIds?: string[] } }) => Promise<{ cards: { q: string; a: string; d?: number }[]; jobId: string; gen?: { mode: "siyuan" | "custom"; modelId: string | null; templateHash: string } }>;
        /** ADR-7：逐卡提交——卡片携带 origIndex 指向作业 candidates 原位（✕ 移除后仍正确），第五参为来源文档元数据 */
        onCreate: (cards: { q: string; a: string; origIndex: number }[], deckID: string, deckName: string, jobId: string, sourceMeta?: { docId?: string; label?: string }) => Promise<void>;
        onClose: () => void;
        closeLabel?: string;
        embedded?: boolean;
        /** 正式入库完成后才回传仍保留在来源清单中的收件箱材料 ID */
        onImportComplete?: (inboxIDs: string[]) => void;
        /** 载入当前打开文档（M2·FR6 输入源扩展；不可用时返回 null）；docId 供回源（T02） */
        loadCurrentDoc?: () => Promise<{ name: string; content: string; docId?: string } | null>;
        /** 载入笔记本范围材料（M2·FR6 扩展） */
        loadNotebookMaterial?: (nbId: string) => Promise<string>;
        /** 可选的已打开笔记本列表（用于笔记本范围材料入口） */
        loadNotebooks?: () => Promise<{ id: string; name: string }[]>;
        /** T02 来源清单：按文档 ID 回源跳转（可选——旧宿主不传则不显示回源按钮） */
        openDocById?: (docId: string) => void;
        /** BW-9：来源是否已登记禁止外发（可选——旧宿主不传则不做载入前拦截，generate 侧仍硬阻断） */
        isSourceDenied?: (kind: "doc" | "notebook", id: string) => boolean;
        /** BW-9：登记禁止外发规则（宿主落盘 + 提示；向导侧移除该来源条目） */
        onDenySource?: (kind: "doc" | "notebook", id: string) => void;
        /** BU-8：自定义敏感词（逗号分隔；空=只用内置模式） */
        sensitiveTerms?: string;
        /** BU-14：模型是否可信（登记 active 或内核网关）；不传=按未登记从严 */
        modelTrustKnown?: () => boolean;
        /** BU-36：上下文包分层预算预览（宿主纯函数，零网络；不传=不显示该区） */
        previewBudget?: (source: string, cfg: { count: number; language: string; type: "qa" | "cloze" }) => BudgetPreview | null;
        /** 未完成的 AI 导入（ADR-7 恢复入口）；null=无；failed=失败明细供导出 */
        getUnfinishedJob?: () => { id: string; done: number; total: number; failed: { index: number; q: string; error: string }[] } | null;
        recoveryJob?: { id: string; sourceLabel: string; candidates: { q: string; a: string; d?: number; origIndex: number }[] } | null;
    } = $props();
    const t = $derived(i18n);

    /** T02 来源清单（docs/13 §4）：分条记账——标签/字数/单条移除/文档来源可回源 */
    interface WizardSource {
        id: string;
        label: string;
        content: string;
        docId?: string;
        nbId?: string;
        inboxId?: string;
        /** 剪贴板/粘贴来源=未验证（BU-14 审阅计划因子） */
        unverified?: boolean;
    }
    // svelte-ignore state_referenced_locally -- embedded loads create a fresh component for each source request.
    let sourceSeq = initialSources.length;
    // svelte-ignore state_referenced_locally -- initial inbox provenance is seeded once per wizard instance.
    let sources = $state<WizardSource[]>(initialSources.map((src, i) => ({ ...src, id: `src-${i + 1}` })));
    // BW-9：来源被登记禁止外发后，审核页仍可能保留已生成候选；重生成时给出明确原因。
    let deniedSourceKind = $state<"doc" | "notebook" | null>(null);

    // CF-01: 编辑器块拖拽落入 AI 分析材料
    let isDraggingOver = $state(false);

    function onDragOver(e: DragEvent) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        isDraggingOver = true;
    }
    function onDragLeave() {
        isDraggingOver = false;
    }
    function onDrop(e: DragEvent) {
        e.preventDefault();
        isDraggingOver = false;
        const dropped = extractDroppedBlockText(e.dataTransfer);
        if (dropped && dropped.text) {
            source = source ? `${source}\n\n${dropped.text}` : dropped.text;
            showMessage("已成功从编辑器拖入分析材料", 1800, "info");
        }
    }

    function addSource(label: string, content: string, docId?: string, nbId?: string): void {
        // BW-9：已登记禁止外发的来源在载入前拦截（generate 侧另有硬阻断兜底）
        if (docId && isSourceDenied?.("doc", docId)) {
            errorMsg = t.aiWizard.srcDenied;
            return;
        }
        if (nbId && isSourceDenied?.("notebook", nbId)) {
            errorMsg = t.aiWizard.srcDeniedNb;
            return;
        }
        deniedSourceKind = null;
        sources = [...sources, { id: `src-${++sourceSeq}`, label, content, docId, nbId }];
        source = source ? `${source}\n\n${content}` : content;
    }

    /** 移除来源条目：正文尽力删首次出现（用户已手动编辑则只移条目） */
    function removeSource(id: string): void {
        const entry = sources.find((s) => s.id === id);
        if (entry && source.includes(entry.content)) {
            const idx = source.indexOf(entry.content);
            source = (source.slice(0, idx) + source.slice(idx + entry.content.length)).replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n").trim();
        }
        sources = sources.filter((s) => s.id !== id);
    }

    /** BW-9：登记禁止外发（宿主落盘）并移除该来源条目——本会话不再载入（addSource 有拦截） */
    function denySource(src: WizardSource) {
        if (src.docId) {
            deniedSourceKind = "doc";
            onDenySource?.("doc", src.docId);
        } else if (src.nbId) {
            deniedSourceKind = "notebook";
            onDenySource?.("notebook", src.nbId);
        }
        removeSource(src.id);
    }

    /** BW-9：本次发送的来源 provenance（载入清单去重；生成侧据此判 deny 规则） */
    function provenance(): { notebookIds: string[]; docIds: string[] } {
        const nb = [...new Set(sources.map(s => s.nbId).filter(Boolean))] as string[];
        const doc = [...new Set(sources.map(s => s.docId).filter(Boolean))] as string[];
        return { notebookIds: nb, docIds: doc };
    }

    /** ADR-7 恢复入口：打开时检查未完成导入 */
    let resume = $state<{ id: string; done: number; total: number; failed: { index: number; q: string; error: string }[] } | null>(null);

    let step = $state(1);
    // 初值语义：leech 改写预填只在打开时注入一次
    // svelte-ignore state_referenced_locally
    let source = $state(initialSource || initialSources.map(src => src.content).join("\n\n"));
    let count = $state(10);
    let language = $state("中文");
    let cardType = $state<"qa" | "cloze">("qa");
    let decks: RiffDeck[] = $state([]);
    let selected = $state("");
    let newName = $state("");

    type PromptFocus = "core" | "compare" | "cause" | "exam" | "practice";
    let promptFocus = $state<PromptFocus>("core");

    const FOCUS_OPTIONS = [
        { id: "core" as const, label: "🎯 核心概念与定义", desc: "围绕核心专有名词与精准定义设问，确保单空唯一指向性", instruction: "优先围绕材料中的核心概念、专有名词与精确定义提问，确保单空唯一指向性。" },
        { id: "compare" as const, label: "🔍 易错对比与辨析", desc: "重点针对容易混淆的概念、属性异同点设问，强化概念辨析", instruction: "重点针对材料中容易混淆的概念、容易混淆的属性进行对比设问，强化概念辨析。" },
        { id: "cause" as const, label: "🧩 原理机制与因果", desc: "重点考察底层原理、发生条件、因果逻辑与逐步演进过程", instruction: "重点考察知识点的底层原理、发生条件、因果逻辑与逐步演进过程。" },
        { id: "exam" as const, label: "💡 考试高频考点速记", desc: "以考试常考重点风格为主，题干明确紧凑，答案精炼，适合快速自测", instruction: "以考试高频出题风格为主，题干明确紧凑，答案精炼，适合快速自测。" },
        { id: "practice" as const, label: "📝 实战应用与案例分析", desc: "结合具体应用场景或案例分析提问，考察知识点在实际场景中的运用", instruction: "结合具体场景或应用案例设问，考察知识点在实际场景中的具体运用。" },
    ];

    const DEMO_PRESETS = [
        {
            label: "网络协议 (TCP握手)",
            text: `TCP 是面向连接的、可靠的传输层协议。
TCP 建立连接需要进行三次握手：
1. 客户端发送 SYN 报文（同步序列号 seq=x），进入 SYN_SENT 状态；
2. 服务端收到后回复 SYN + ACK 报文（seq=y, ack=x+1），进入 SYN_RCVD 状态；
3. 客户端收到后发送 ACK 报文（ack=y+1），双方进入 ESTABLISHED 状态。
三次握手的主要目的是确认双方的发送与接收能力均正常，并同步双方的初始序列号（ISN）。`,
        },
        {
            label: "记忆科学 (FSRS模型)",
            text: `FSRS（Free Spaced Repetition Scheduler）是现代先进的间隔重复调度算法。
其核心基于记忆稳定性（Stability, S）与可提取性（Retrievability, R）模型：
1. 稳定性 S：指在未复习状态下，记忆保留率从 100% 衰减至 90% 所经过的时间（天数）。
2. 可提取性 R：指某一时间点能成功回忆起知识点的概率，随时间推移按负幂函数衰减。
3. 评分级别：Again (1, 遗忘), Hard (2, 困难), Good (3, 良好), Easy (4, 简单)。每次评分后根据当前难度与稳定性动态计算下一轮最佳复习间隔。`,
        },
    ];

    function fillDemoPreset(idx: number) {
        const item = DEMO_PRESETS[idx];
        if (item) {
            source = item.text;
            showMessage(`已填入示例：「${item.label}」`, 1800, "info");
        }
    }

    function cleanSourceText() {
        if (!source.trim()) return;
        source = source.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
        showMessage("已规整多余换行与空格", 1500, "info");
    }

    let candidateFilter = $state("");
    const visibleCandidates = $derived.by(() => {
        if (!candidateFilter.trim()) return candidates;
        const q = candidateFilter.trim().toLowerCase();
        return candidates.filter(c => c.q.toLowerCase().includes(q) || c.a.toLowerCase().includes(q));
    });

    function toggleAllKeep() {
        const allKept = candidates.every(c => c.keep);
        candidates = candidates.map(c => ({ ...c, keep: !allKept }));
    }

    /** T03 片二：审阅状态——已选(keep)≠已审(review)；入库只取 已选+已接受 */
    let candidates: { q: string; a: string; d?: number; keep: boolean; origIndex: number; review: "pending" | "accepted" | "verified" | "needsCheck"; edited?: boolean }[] = $state([]);
    let draftIssues = $derived(candidates.map(c => validateQaDraft(c.q, c.a)));
    let gateIssues: AiCardGateIssue[][] = $derived(inspectAiCandidates(candidates));
    let acceptedCount = $derived(selectImportableAiCandidates(candidates).length);
    const canImport = $derived(acceptedCount > 0 && (decks.some(d => d.id === selected) || !!newName.trim()));
    /** 编辑已接受卡 → 退回未审（修改后需重新核对，docs/13 §5；标记已编辑需重新接受，对齐 R54 规范） */
    function touchCandidate(i: number) {
        if (creating || regenBusy !== null) return;
        if (candidates[i]) {
            candidates[i] = { ...candidates[i], review: "pending", edited: true };
            candidates = [...candidates];
        }
    }
    function setReview(i: number, review: "accepted" | "verified" | "needsCheck" | "pending") {
        if (creating || regenBusy !== null) return;
        if (review === "accepted" && draftIssues[i]?.length) {
            errorMsg = t.aiWizard.invalidDraft;
            return;
        }
        if (review === "accepted" && gateIssues[i]?.length) {
            errorMsg = t.aiWizard.qualityBlocked;
            return;
        }
        if (review === "accepted") {
            recordUserVersion(i); // BU-15：接受即留痕用户当前文本（编辑后接受=用户版本）
        }
        candidates[i] = { ...candidates[i], review, edited: false };
        candidates = [...candidates];
    }
    function acceptAll() {
        if (creating || regenBusy !== null) return;
        const hasBlockedCard = candidates.some((c, i) => c.keep && gateIssues[i].length > 0);
        candidates = candidates.map((c, i) => (c.keep && c.review !== "verified" && draftIssues[i].length === 0 && gateIssues[i].length === 0 ? { ...c, review: "accepted", edited: false } : c));
        errorMsg = hasBlockedCard ? t.aiWizard.qualityBlocked : "";
    }
    /** AQ-16 预览 lint：随 candidates（含编辑）响应式重算（批内重复/过长/过短） */
    let lintWarnings: string[][] = $derived.by(() => lintAICards(candidates.map(c => ({ q: c.q, a: c.a }))));
    /** BU-13 质量评分卡：随候选（含编辑）响应式重算；综合分仅审阅提示 */
    let scorecards: Scorecard[] = $derived(scoreBatch(candidates.map(c => ({ q: c.q, a: c.a, source }))));
    let candidateSplits = $derived(candidates.map(c => proposeCardSplits({ question: c.q, answer: c.a, template: cardType })));

    function splitCandidate(i: number) {
        if (creating || regenBusy !== null || !candidates[i]) return;
        const splits = candidateSplits[i];
        if (!splits || splits.length < 2) return;
        recordUserVersion(i);
        const base = candidates[i];
        let nextOrig = candidates.reduce((m, item) => Math.max(m, item.origIndex), 0);
        const expanded = splits.map((draft, idx) => ({
            q: draft.q,
            a: draft.a,
            d: base.d,
            keep: base.keep,
            origIndex: idx === 0 ? base.origIndex : ++nextOrig,
            review: "pending" as const,
            edited: true,
        }));
        const baseProv = provOf(i);
        const expandedProv: CardProvenance[] = expanded.map((item, idx) =>
            idx === 0 ? baseProv : { index: item.origIndex, versions: [{ at: Date.now(), via: "user", q: item.q, a: item.a }] },
        );
        candidates = [...candidates.slice(0, i), ...expanded, ...candidates.slice(i + 1)];
        prov = [...candidates.slice(0, i).map((_, idx) => provOf(idx)), ...expandedProv, ...candidates.slice(i + 1).map((_, idx) => provOf(i + 1 + idx))];
        errorMsg = "";
    }
    /** BU-14 审阅计划：按因子就高不就低（模型登记/来源可信/批量均分/问题卡占比） */
    let reviewPlan: ReviewPlan | null = $derived.by(() => {
        if (candidates.length === 0) {
            return null;
        }
        const comps = scorecards.map(s => s.composite);
        const avg = comps.reduce((a, b) => a + b, 0) / comps.length;
        const problemRatio = comps.filter(c => c < 70).length / comps.length;
        return planReview({
            taskRisk: "low", // 当前在册任务仅制卡（低风险）；扩展任务登记时随任务声明
            modelTrust: modelTrustKnown?.() === true ? "known" : "unknown",
            sourceTrust: sources.some(s => s.unverified) ? "unverified" : "trusted",
            avgComposite: avg,
            problemRatio,
            totalCards: candidates.length,
        });
    });
    /** BU-15 版本链（会话内）：生成记 ai 版（带 gen 快照）、接受/重生前记 user 版 */
    let prov: CardProvenance[] = $state([]);

    function provOf(i: number): CardProvenance {
        return prov[i] ?? { index: candidates[i]?.origIndex ?? i, versions: [] };
    }
    /** 记 user 版本（与链尾同文则跳过——防重复留痕） */
    function recordUserVersion(i: number) {
        const c = candidates[i];
        if (!c) {
            return;
        }
        const last = provOf(i).versions[provOf(i).versions.length - 1];
        if (last && last.q === c.q && last.a === c.a) {
            return;
        }
        prov[i] = appendVersion(provOf(i), { at: Date.now(), via: "user", q: c.q, a: c.a });
        prov = [...prov];
    }
    /** 记 ai 版本（生成快照必带——gen 缺失时 appendVersion 会整条剔除，此处兜底不发） */
    function recordAIVersion(i: number, card: { q: string; a: string }, gen: { mode: "siyuan" | "custom"; modelId: string | null; templateHash: string }) {
        prov[i] = appendVersion(provOf(i), { at: Date.now(), via: "ai", q: card.q, a: card.a, gen });
        prov = [...prov];
    }
    /** BU-15：回到某历史版本（置回待审——内容变更须重新核对） */
    function restoreVersion(i: number, v: ProvenanceVersion) {
        if (creating || regenBusy !== null || !candidates[i]) return;
        recordUserVersion(i);
        candidates[i] = { ...candidates[i], q: v.q, a: v.a, review: "pending", edited: true };
        candidates = [...candidates];
    }
    function removeCandidate(i: number) {
        if (creating || regenBusy !== null) return;
        const remainingVersions = candidates.map((_, index) => provOf(index)).filter((_, index) => index !== i);
        candidates = candidates.filter((_, index) => index !== i);
        prov = remainingVersions;
        previewIdx = previewIdx === i ? null : previewIdx !== null && previewIdx > i ? previewIdx - 1 : previewIdx;
        previewAnswerMap = Object.fromEntries(Object.entries(previewAnswerMap)
            .filter(([index]) => Number(index) !== i)
            .map(([index, shown]) => [Number(index) > i ? Number(index) - 1 : Number(index), shown]));
    }
    /** ADR-7：当前预览对应的作业 ID（导入按 candidates 下标断点记账；重生替换内容不换绑定） */
    let currentJobId = $state("");
    let restoredCandidates = $state(false);
    let busy = $state(false);
    let creating = $state(false);
    let errorMsg = $state("");

    /** 将网络/服务端错误转换为稳定、可操作的提示；不把响应正文或 URL 原样展示。 */
    function aiErrorText(err: unknown): string {
        const v = classifyAiFailure(err);
        const dict = (t as any).aiError ?? {};
        const raw = err instanceof Error ? err.message : String(err ?? "");
        // 思源网关未配置时，部分版本只返回 "Field [msg] is required"；
        // 不把宿主内部校验细节直接展示给用户，改成可操作的配置/手工制卡提示。
        if (/Field \[msg\] is required/i.test(raw)) {
            const eligibility = (t as any).aiElig ?? {};
            return [eligibility["not-configured"], eligibility.alt?.["not-configured"]].filter(Boolean).join(" ")
                || (dict.unknown ?? raw.slice(0, 300));
        }
        if (/HTTP 404/i.test(raw)) {
            return dict.endpoint ?? "AI 基础地址（Base URL）或模型不存在 (HTTP 404)。请核对设置中的 API 地址是否缺少 /v1，或模型名称是否拼写正确。";
        }
        const key = v.cls === "rate-limit" ? "rateLimit"
            : v.cls === "server" ? "server"
            : v.cls === "auth" ? "auth"
            : v.cls === "quota" ? "quota"
            : v.cls === "privacy" ? "privacy"
            : v.cls === "parse" ? "parse"
            : v.cls === "network" ? "network"
            : v.cls === "canceled" ? "canceled" : "unknown";
        // 前置 eligibility、停用开关和格式拒答会用本地化的可操作说明，
        // 它们不属于网络错误分类；保留原文，避免把“未配置/预算超限”抹成笼统失败。
        const text = v.cls === "unknown"
            ? raw.slice(0, 300)
            : (dict[key] ?? raw);
        if (v.cls === "rate-limit" && v.retryAfterMs && dict.retryAfter) {
            return `${text} ${dict.retryAfter.replace("${n}", String(Math.ceil(v.retryAfterMs / 1000)))}`;
        }
        return text;
    }

    function errorMessage(err: unknown): string {
        return err instanceof Error ? err.message : String(err ?? "");
    }

    let loadDocBusy = $state(false);
    // 异步来源/牌组请求在宿主销毁后可能迟到；生命周期标记阻断状态写回。
    let disposed = false;
    // T02：生成前预览确认（docs/13 §4）——确认后才真正外发
    let previewOpen = $state(false);
    let preflightConsent = $state(false);
    /** BU-36：打开预览时的分层预算报告（随打开时点计算一次；关闭即清） */
    let budgetPv = $state<BudgetPreview | null>(null);
    $effect(() => {
        const material = source;
        const cfg = { count, language, type: cardType };
        if (previewOpen) {
            preflightConsent = false;
            sensOverride = false;
            budgetPv = previewBudget?.(material.trim(), cfg) ?? null;
        }
    });
    function openPreview() {
        previewOpen = true;
        preflightConsent = false;
        budgetPv = previewBudget?.(source.trim(), { count, language, type: cardType }) ?? null;
    }
    // T02：来源分条查看原文（单开）
    let viewSrc = $state<string | null>(null);
    // T03：候选审核——来源依据折叠 + 逐卡卡面预览（单开）
    let sourceOpen = $state(false);
    let previewIdx = $state<number | null>(null);
    let previewAnswerMap = $state<Record<number, boolean>>({});

    /** BU-8：发送前敏感扫描（预览打开时随材料响应式重算；命中只显示打码样本，处置权在用户） */
    let sensOverride = $state(false);
    let sensHits: SensitiveHit[] = $derived(previewOpen ? scanSensitive(source, parseTerms(sensitiveTerms)) : []);
    function parseTerms(raw: string): string[] {
        return (raw ?? "").split(/[,，;；]/).map(s => s.trim()).filter(Boolean);
    }
    function sensLabel(id: string): string {
        const dict = (t as any).aiSens as Record<string, string> | undefined;
        if (id.startsWith("custom:")) {
            return `${t.aiWizard.sensCustom}:${id.slice("custom:".length)}`;
        }
        return dict?.[id] ?? id;
    }
    /** 脱敏后继续：材料原地替换为脱敏文本（用户可在编辑区再核对），命中随之清零 */
    function maskAndContinue() {
        const r = maskSensitive(source, parseTerms(sensitiveTerms));
        source = r.masked;
        sensOverride = false;
    }

    /** BU-13/14 标签映射：维度/层级/说明/建议 i18n（缺键回退机器键，不阻塞显示） */
    function dimLabel(key: string): string {
        return (t.aiScore?.dim as any)?.[key] ?? key;
    }
    function levelLabel(level: string): string {
        return (t.aiScore?.level as any)?.[level] ?? level;
    }
    function noteText(noteKey?: string): string {
        if (!noteKey) { return ""; }
        return (t.aiScore?.note as any)?.[noteKey.replace("aiScore.note.", "")] ?? "";
    }
    function fixText(fixKey?: string): string {
        if (!fixKey) { return ""; }
        return (t.aiScore?.fix as any)?.[fixKey.replace("aiScore.fix.", "")] ?? "";
    }
    /** BU-14 因子标签（planReview factors 形如 "modelTrust:unknown"） */
    function factorLabel(factor: string): string {
        const key = factor.split(":")[0];
        return (t.aiReview?.factor as any)?.[key] ?? factor;
    }
    function planText(plan: ReviewPlan): string {
        const dict = t.aiReview?.plan as any;
        if (!dict) { return plan.decision; }
        if (plan.decision === "sample" && plan.sampleSize && dict.sample) {
            return typeof dict.sample === "string" ? dict.sample.replace("${n}", String(plan.sampleSize)) : String(dict.sample);
        }
        return dict[plan.decision] ?? plan.decision;
    }

    // 笔记本范围源（M2·FR6 扩展）
    let nbOptions = $state<{ id: string; name: string }[]>([]);
    let nbId = $state("");
    let nbLoading = $state(false);
    let nbError = $state("");

    async function loadNotebookOptions() {
        if (!loadNotebooks || nbLoading) {
            return;
        }
        nbLoading = true;
        nbError = "";
        try {
            nbOptions = await loadNotebooks();
            if (!disposed && nbOptions.length > 0 && !nbId) {
                nbId = nbOptions[0].id;
            }
        } catch (e: unknown) {
            if (!disposed) {
                nbError = errorMessage(e);
            }
        } finally {
            if (!disposed) {
                nbLoading = false;
            }
        }
    }

    async function loadNotebookContent() {
        if (loadDocBusy || !loadNotebookMaterial || !nbId) {
            errorMsg = t.aiWizard.noNotebook;
            return;
        }
        const requestNbId = nbId;
        loadDocBusy = true;
        try {
            const material = await loadNotebookMaterial(requestNbId);
            if (disposed || requestNbId !== nbId) {
                return;
            }
            if (material) {
                addSource(nbOptions.find((n) => n.id === requestNbId)?.name ?? t.aiWizard.loadNotebook, material, undefined, requestNbId);
                errorMsg = "";
            } else {
                errorMsg = t.aiWizard.noDoc;
            }
        } catch (e: unknown) {
            if (disposed) {
                return;
            }
            errorMsg = errorMessage(e);
        } finally {
            if (!disposed) {
                loadDocBusy = false;
            }
        }
    }

    async function loadActiveDoc() {
        if (loadDocBusy || !loadCurrentDoc) {
            return;
        }
        loadDocBusy = true;
        try {
            const doc = await loadCurrentDoc();
            if (disposed) {
                return;
            }
            if (doc?.content) {
                addSource(doc.name || t.aiWizard.loadDoc, doc.content, doc.docId);
            } else {
                errorMsg = t.aiWizard.noDoc;
            }
        } catch (e: unknown) {
            if (disposed) {
                return;
            }
            errorMsg = errorMessage(e);
        } finally {
            if (!disposed) {
                loadDocBusy = false;
            }
        }
    }

    /** 载入选中文字（防御式：选区在思源主文档同 window，通常可取到；🧪 真机确认） */
    function loadSelection() {
        try {
            const sel = window.getSelection()?.toString().trim();
            if (sel) {
                addSource(t.aiWizard.srcSelection, sel);
                errorMsg = "";
            } else {
                errorMsg = t.aiWizard.noSelection;
            }
        } catch {
            errorMsg = t.aiWizard.noSelection;
        }
    }

    /** 剪贴板导入（298）：粘贴字幕/讲义直通向导（权限拒绝时降级提示）；剪贴板来源=未验证（BU-14 审阅强度因子） */
    async function loadClipboard() {
        if (busy || loadDocBusy) return;
        loadDocBusy = true;
        try {
            const text = (await navigator.clipboard.readText()).trim();
            if (disposed) {
                return;
            }
            if (text) {
                addSource(t.aiWizard.srcClipboard, text);
                sources[sources.length - 1] = { ...sources[sources.length - 1], unverified: true };
                sources = [...sources];
                errorMsg = "";
            } else {
                errorMsg = t.aiWizard.noClipboard;
            }
        } catch {
            if (disposed) {
                return;
            }
            errorMsg = t.aiWizard.noClipboardPerm;
        } finally {
            if (!disposed) loadDocBusy = false;
        }
    }

    onMount(async () => {
        // Unknown write outcomes are shown as a warning only; they are never replayed here.
        resume = getUnfinishedJob?.() ?? null;
        if (recoveryJob) {
            candidates = recoveryJob.candidates.map(candidate => ({ ...candidate, keep: true, review: "pending" as const }));
            currentJobId = recoveryJob.id;
            restoredCandidates = true;
            step = 2;
        }
        // T02：预填材料（leech 改写联动）记入来源清单
        if (initialSource.trim()) {
            sources = [...sources, { id: `src-${++sourceSeq}`, label: t.aiWizard.srcInitial, content: initialSource }];
        }
        try {
            const loadedDecks = await getRiffDecks();
            if (disposed) {
                return;
            }
            decks = [...loadedDecks, ...decks.filter(deck => !loadedDecks.some(loaded => loaded.id === deck.id))];
            if (decks.length > 0 && !decks.some(deck => deck.id === selected)) {
                selected = decks[0].id;
            }
        } catch (e: unknown) {
            if (disposed) {
                return;
            }
            errorMsg = errorMessage(e);
        }
        await loadNotebookOptions();
    });

    // 生成请求守卫（AQ-14）：换源/重生/关闭向导即取消旧请求；晚到响应只接受最后一次
    let genSeq = 0;
    let genCtrl: AbortController | null = null;

    function cancelGeneration() {
        genSeq += 1; // 使在途响应失效
        genCtrl?.abort();
        genCtrl = null;
        busy = false;
        regenBusy = null;
    }

    onDestroy(() => {
        disposed = true;
        // 外部销毁（宿主关闭对话框/插件卸载）也必须取消在途 AI 请求。
        genSeq += 1;
        genCtrl?.abort();
        genCtrl = null;
    });

    /** 关闭向导：先取消在途请求再回调宿主（取消不触发 fallback、不写回已关闭向导） */
    function closeWizard() {
        if (creating) return;
        cancelGeneration();
        onClose();
    }

    async function run() {
        if (!source.trim() || busy || creating || loadDocBusy || regenBusy !== null) {
            return;
        }
        const seq = ++genSeq;
        genCtrl = new AbortController();
        const myCtrl = genCtrl;
        busy = true;
        errorMsg = "";
        try {
            const focusInstruction = FOCUS_OPTIONS.find(f => f.id === promptFocus)?.instruction;
            const payloadSource = (promptFocus !== "core" && focusInstruction)
                ? `${source.trim()}\n\n【出题要求与侧重点】：${focusInstruction}`
                : source.trim();
            // BW-9：随请求携带来源 provenance（generate 侧判 deny 规则——UI 拦截不可绕过的硬门）
            const { cards, jobId, gen } = await generate(payloadSource, { count, language, type: cardType }, { signal: myCtrl.signal, provenance: provenance() });
            if (seq !== genSeq) {
                return; // 旧请求：候选与步骤不写回
            }
            if (cards.length === 0) {
                throw new Error(t.aiWizard.emptyResult);
            }
            prov = []; // 仅生成成功后替换旧草稿的版本链，失败/取消仍可返回旧候选。
            previewIdx = null;
            previewAnswerMap = {};
            restoredCandidates = false;
            candidates = cards.map((c, i) => ({ ...c, keep: true, origIndex: i, review: "pending" }));
            // BU-15：生成候选记 ai 版本（gen 缺失=旧宿主，不留痕不阻塞）
            if (gen) {
                cards.forEach((c, i) => recordAIVersion(i, c, gen));
            }
            // ADR-7：绑定本次作业，导入时按候选下标断点记账
            currentJobId = jobId;
            step = 2;
        } catch (e: unknown) {
            if (seq !== genSeq || isAICanceled(e)) {
                return; // 取消/被新请求取代：静默，草稿保留可重试
            }
            errorMsg = aiErrorText(e);
        } finally {
            if (seq === genSeq) {
                busy = false;
                genCtrl = null;
            }
        }
    }

    /** 单卡重新生成（296）：同源同参 count=1，替换该张、保留勾选态 */
    let regenBusy = $state<number | null>(null);
    async function regenerateCard(i: number) {
        if (regenBusy !== null || busy || creating) {
            return;
        }
        if (!source.trim()) {
            errorMsg = deniedSourceKind === "notebook" ? t.aiWizard.srcDeniedNb : deniedSourceKind === "doc" ? t.aiWizard.srcDenied : t.aiWizard.sourceEmptyHint;
            return;
        }
        const targetOrigIndex = candidates[i]?.origIndex;
        if (targetOrigIndex === undefined) {
            return;
        }
        const seq = ++genSeq;
        genCtrl = new AbortController();
        const myCtrl = genCtrl;
        regenBusy = i;
        errorMsg = "";
        recordUserVersion(i); // BU-15：重生前留痕当前文本（用户改过未接受也不丢）
        try {
            const focusInstruction = FOCUS_OPTIONS.find(f => f.id === promptFocus)?.instruction;
            const payloadSource = (promptFocus !== "core" && focusInstruction)
                ? `${source.trim()}\n\n【出题要求与侧重点】：${focusInstruction}`
                : source.trim();
            // 重生成仅替换候选内容：currentJobId 保持原绑定（下标对位不变；作业记录中该卡为旧文本，已知边界）
            const { cards, gen } = await generate(payloadSource, { count: 1, language, type: cardType }, { signal: myCtrl.signal, provenance: provenance() });
            if (seq !== genSeq) {
                return;
            }
            if (cards.length > 0) {
                // 列表允许在请求期间删除/重排其他卡；用稳定 origIndex 找回目标，避免迟到响应覆盖错卡。
                const targetIndex = candidates.findIndex((c) => c.origIndex === targetOrigIndex);
                if (targetIndex < 0) {
                    return;
                }
                const keep = candidates[targetIndex].keep;
                // 重生成仅替换内容：保持 origIndex 与作业 candidates 对位（内容为新生成，已知边界）
                candidates[targetIndex] = { ...cards[0], keep, origIndex: targetOrigIndex, review: "pending" };
                candidates = [...candidates];
                if (gen) {
                    recordAIVersion(targetIndex, cards[0], gen); // BU-15：重生成记新 ai 版（链上可对比新旧）
                }
                errorMsg = "";
            } else {
                errorMsg = t.aiWizard.emptyResult;
            }
        } catch (e: unknown) {
            if (seq !== genSeq || isAICanceled(e)) {
                return;
            }
            errorMsg = aiErrorText(e);
        } finally {
            if (seq === genSeq) {
                genCtrl = null;
            }
            if (!disposed) {
                regenBusy = null;
            }
        }
    }

    async function importCards() {
        // ADR-7：origIndex 随候选对象存续（✕ 移除后仍指向作业 candidates 原位）
        // T03：入库口径 = 已选 + 已接受（待核实/未审不入库）
        const picked = selectImportableAiCandidates(candidates).map(c => ({ q: c.q, a: c.a, origIndex: c.origIndex }));
        if (picked.length === 0 || creating || busy || regenBusy !== null) {
            return;
        }
        if ((!selected || !decks.some(d => d.id === selected)) && !newName.trim()) {
            errorMsg = t.quickCardNeedDeck;
            return;
        }
        creating = true;
        errorMsg = "";
        try {
            let deckID = selected;
            let deckName = decks.find(d => d.id === deckID)?.name ?? "";
            if (newName.trim()) {
                const deck = await createRiffDeck(newName.trim());
                deckID = deck.id;
                deckName = deck.name;
                decks = [...decks, deck];
                selected = deckID;
                newName = "";
            }
            if (!deckID) {
                errorMsg = t.quickCardNeedDeck;
                return;
            }
            const primaryDocSource = sources.find(s => s.docId);
            const sourceMeta = primaryDocSource ? { docId: primaryDocSource.docId, label: primaryDocSource.label } : undefined;
            await onCreate(picked, deckID, deckName, currentJobId, sourceMeta);
            if (disposed) {
                return;
            }
            const inboxIDs = sources.map(src => src.inboxId).filter((id): id is string => Boolean(id));
            if (inboxIDs.length > 0) {
                onImportComplete?.(inboxIDs);
            }
            cancelGeneration();
            if (embedded) {
                candidates = [];
                prov = [];
                currentJobId = "";
                restoredCandidates = false;
                previewIdx = null;
                previewAnswerMap = {};
                step = 1;
            }
            onClose();
        } catch (e: unknown) {
            if (disposed) {
                return;
            }
            errorMsg = aiErrorText(e);
        } finally {
            if (!disposed) {
                creating = false;
            }
        }
    }

    function onKeydown(e: KeyboardEvent) {
        if (creating) return;
        if (e.key === "Escape") {
            if (previewOpen) {
                e.preventDefault();
                previewOpen = false;
                sensOverride = false;
                preflightConsent = false;
            } else if (step === 2) {
                e.preventDefault();
                step = 1;
            } else {
                e.preventDefault();
                closeWizard();
            }
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            if (step === 1) {
                if (previewOpen && preflightConsent && !busy && (sensHits.length === 0 || sensOverride)) {
                    e.preventDefault();
                    previewOpen = false;
                    sensOverride = false;
                    preflightConsent = false;
                    void run();
                } else if (!previewOpen && source.trim() && !busy && !loadDocBusy) {
                    e.preventDefault();
                    openPreview();
                }
            } else if (step === 2) {
                if (canImport && !creating && !busy && regenBusy === null) {
                    e.preventDefault();
                    void importCards();
                }
            }
        }
    }
</script>

<svelte:window on:keydown={onKeydown} />

<div class:lv-aiwiz-embedded={embedded} class="lv-aiwiz b3-typography">
    {#if resume}
        <!-- A write outcome may be unknown, so recovery requires inspection rather than replay. -->
        <div class="lv-aiwiz-resume" role="status">
            <span class="fn__flex-1">{t.aiWizard.resumeHint.replace("${done}", String(resume.done)).replace("${total}", String(resume.total))}</span>
            <span class="lv-aiwiz-resume-note">{t.aiWizard.resumeUnknown}</span>
            {#if resume.failed.length > 0}
                <button
                    class="b3-button b3-button--small"
                    title={t.aiWizard.resumeCopyFailed}
                    onclick={() => {
                        const lines = resume.failed.map(f => `#${f.index + 1} [${f.error}] ${f.q}`);
                        navigator.clipboard.writeText(lines.join("\n")).then(
                            () => showMessage(t.aiWizard.resumeCopied, 1500, "info"),
                            () => { /* 剪贴板不可用静默 */ },
                        );
                    }}
                >{t.aiWizard.resumeCopyFailed}({resume.failed.length})</button>
            {/if}
        </div>
    {/if}
    <div class="lv-ob-head">
        <LvSteps steps={[t.aiWizard.stepCfg, t.aiWizard.stepPreview]} current={step - 1} />
        <!-- 关闭走对话框头部的 × 与 Esc（svelteDialog 自带），不再重复内嵌关闭钮 -->
    </div>

    {#if step === 1}
        <div class="lv-aiwiz-step" transition:fade={{ duration: getMotionDuration("normal") }}>
            <!-- T02 完整工作面（docs/13 §4）：左=来源清单与载入，右=材料编辑与参数 -->
            <div class="lv-wb">
                <div class="lv-wb-side">
                    <!-- 来源载入卡片 -->
                    <div class="lv-side-card">
                        <div class="lv-side-head">
                            <LvIcon name="inbox" size={13} />
                            <span>{t.aiWizard.source}</span>
                        </div>
                        <div class="lv-side-actions">
                            {#if loadCurrentDoc}
                                <button class="b3-button b3-button--small lv-wb-load" disabled={busy || loadDocBusy} onclick={loadActiveDoc}>
                                    <LvIcon name="book" size={13} /> <span>{t.aiWizard.loadDoc}</span>
                                </button>
                            {/if}
                            <button class="b3-button b3-button--small lv-wb-load" disabled={busy || loadDocBusy} onclick={loadSelection}>
                                <LvIcon name="edit" size={13} /> <span>{t.aiWizard.loadSelection}</span>
                            </button>
                            <button class="b3-button b3-button--small lv-wb-load" disabled={busy || loadDocBusy} onclick={loadClipboard}>
                                <LvIcon name="inbox" size={13} /> <span>{t.aiWizard.loadClipboard}</span>
                            </button>
                            {#if loadNotebookMaterial}
                                <div class="lv-wb-nb-card">
                                    <span class="lv-side-sublabel">指定笔记本载入：</span>
                                    <div class="lv-wb-nb-row">
                                        <select class="b3-select lv-wb-nb-select" bind:value={nbId} disabled={loadDocBusy || nbLoading || nbOptions.length === 0} aria-label={t.aiWizard.loadNotebook}>
                                            {#if nbOptions.length === 0}<option value="">{nbLoading ? t.aiWizard.loadingNotebooks : t.aiWizard.noNotebookAvailable}</option>{/if}
                                            {#each nbOptions as n (n.id)}<option value={n.id}>{n.name}</option>{/each}
                                        </select>
                                        <button class="b3-button b3-button--small lv-btn-primary lv-wb-nb-btn" disabled={busy || loadDocBusy || nbLoading || nbOptions.length === 0 || !nbId} onclick={loadNotebookContent} title="载入笔记本全部内容">
                                            <LvIcon name="cards" size={12} /> <span>{nbLoading ? "…" : "载入"}</span>
                                        </button>
                                    </div>
                                    {#if nbError}
                                        <span class="ft__smaller" style="color: var(--lv-color-danger); line-height: 1.4;" role="alert" aria-live="assertive">{nbError}</span>
                                        <button class="b3-button b3-button--small" disabled={nbLoading} onclick={loadNotebookOptions}>{t.dashboard.refresh}</button>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    </div>

                    <!-- 示例材料快速试用卡片 -->
                    <div class="lv-side-card">
                        <div class="lv-side-head">
                            <LvIcon name="lightbulb" size={13} />
                            <span>快速填入示例</span>
                        </div>
                        <div class="lv-side-demo-grid">
                            {#each DEMO_PRESETS as p, idx (p.label)}
                                <button
                                    type="button"
                                    class="b3-button b3-button--small b3-button--outline lv-wb-demo-btn"
                                    onclick={() => fillDemoPreset(idx)}
                                    title={`填入「${p.label}」示例文本`}
                                >
                                    <span>{p.label}</span>
                                </button>
                            {/each}
                        </div>
                    </div>

                    {#if hasCommonBridge}
                        <div class="lv-side-card">
                            <div class="lv-side-head">
                                <LvIcon name="book" size={13} />
                                <span>小驴常用素材</span>
                            </div>
                            <div class="lv-side-actions">
                                {#if commonSnippets.length === 0}
                                    <button
                                        type="button"
                                        class="b3-button b3-button--small lv-wb-load"
                                        disabled={commonLoading}
                                        onclick={loadCommonSnippets}
                                        title="从小驴常用语中拉取收藏或最近素材"
                                    >
                                        <LvIcon name="refresh" size={12} />
                                        <span>{commonLoading ? "正在拉取…" : "获取常用语与收藏"}</span>
                                    </button>
                                {:else}
                                    <div class="lv-side-demo-grid">
                                        {#each commonSnippets.slice(0, 4) as snip (snip.id)}
                                            <button
                                                type="button"
                                                class="b3-button b3-button--small b3-button--outline lv-wb-demo-btn"
                                                onclick={() => appendCommonSnippet(snip)}
                                                title={snip.content}
                                            >
                                                <LvIcon name="flag" size={11} />
                                                <span>{snip.title || snip.content.slice(0, 10)}</span>
                                            </button>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {/if}

                    {#if sources.length > 0}
                        <div class="lv-side-card">
                            <div class="lv-side-head">
                                <LvIcon name="list" size={13} />
                                <span>{t.aiWizard.srcLedger} ({sources.length})</span>
                            </div>
                            <div class="lv-wb-chips">
                                {#each sources as src (src.id)}
                                    <div class="lv-wb-chip">
                                        <!-- T02：点标签查看该条原文（只读展开，不影响合并编辑） -->
                                        <button class="lv-wb-view" title={t.aiWizard.viewSource} onclick={() => (viewSrc = viewSrc === src.id ? null : src.id)}>{src.label} · {src.content.length}</button>
                                        {#if src.docId && openDocById}
                                            <button class="lv-wb-icon" title={t.aiWizard.openSource} aria-label={t.aiWizard.openSource} onclick={() => openDocById?.(src.docId!)}>↗</button>
                                        {/if}
                                        {#if (src.docId || src.nbId) && onDenySource}
                                            <!-- BW-9：一键登记禁止外发（落盘规则 + 移除该来源） -->
                                            <button class="lv-wb-icon" disabled={busy} title={t.aiWizard.denySource} aria-label={t.aiWizard.denySource} onclick={() => denySource(src)}><LvIcon name="ban" size={13} /></button>
                                        {/if}
                                        <button class="lv-wb-icon" disabled={busy} title={t.aiWizard.srcRemove} aria-label={t.aiWizard.srcRemove} onclick={() => removeSource(src.id)}><LvIcon name="close" size={13} /></button>
                                    </div>
                                    {#if viewSrc === src.id}
                                        <div class="ft__smaller lv-wb-srcview">{src.content}</div>
                                    {/if}
                                {/each}
                            </div>
                        </div>
                    {/if}
                </div>
                <div class="lv-wb-main">
                    <div class="lv-wb-header">
                        <span class="lv-wb-title">
                            <LvIcon name="edit" size={13} />
                            <strong>待分析笔记材料</strong>
                        </span>
                        <div class="fn__flex-1"></div>
                        {#if source.trim()}
                            <button
                                type="button"
                                class="b3-button b3-button--small lv-btn-ghost lv-btn-tool"
                                onclick={cleanSourceText}
                                title="一键清理连续多余空行与空格"
                            >
                                <LvIcon name="refresh" size={12} /> <span>规整格式</span>
                            </button>
                            <button
                                type="button"
                                class="b3-button b3-button--small lv-btn-ghost lv-btn-tool"
                                onclick={() => (source = "")}
                                aria-label={t.aiWizard.sourceClear}
                                title={t.aiWizard.sourceClear}
                            >
                                <LvIcon name="trash" size={12} /> <span>{t.aiWizard.sourceClear}</span>
                            </button>
                        {/if}
                    </div>
                    <textarea
                        class="b3-text-field fn__block lv-wb-textarea"
                        class:lv-drag-over={isDraggingOver}
                        rows="9"
                        bind:value={source}
                        disabled={busy}
                        spellcheck="false"
                        placeholder={t.aiWizard.sourceEditHint}
                        aria-label={t.aiWizard.sourceEditHint}
                        ondragover={onDragOver}
                        ondragleave={onDragLeave}
                        ondrop={onDrop}
                    ></textarea>
                    {#if source}
                        <!-- 材料可读可改：裁剪即编辑，生成以此处内容为准 -->
                        <div class="ft__smaller ft__on-surface lv-wb-meter-row">
                            <span class="lv-wb-meter-pill">
                                <LvIcon name="code" size={12} />
                                <span>{source.length} 字符 · ≈ {Math.ceil(source.length / 4)} tokens</span>
                            </span>
                            <div class="fn__flex-1"></div>
                            <span class="lv-wb-meter-note">支持从编辑器拖拽块直接追加</span>
                        </div>
                    {:else}
                        <!-- R53 §3.9 空态：图标圈 + 一句话 + 指引 + 示例按钮 -->
                        <div class="lv-wb-empty">
                            <div class="lv-wb-empty-icon" aria-hidden="true"><LvIcon name="zap" size={24} /></div>
                            <div class="lv-wb-empty-text">{t.aiWizard.sourceEmptyHint}</div>
                            <div class="lv-wb-empty-actions">
                                <button type="button" class="b3-button b3-button--small lv-btn-primary" onclick={() => fillDemoPreset(0)}>
                                    <LvIcon name="lightbulb" size={12} /> <span>填入示例材料快速试用</span>
                                </button>
                            </div>
                        </div>
                    {/if}
                    <div class="lv-aiwiz-params-card">
                        <!-- 第一行：三大核心维度（出题侧重 / 题型 / 目标卡包） -->
                        <div class="lv-params-major-row">
                            <div class="lv-param-item lv-param-item--focus">
                                <span class="lv-param-label">出题侧重</span>
                                <select class="b3-select fn__block lv-param-select" bind:value={promptFocus} disabled={busy} aria-label="出题侧重">
                                    {#each FOCUS_OPTIONS as opt (opt.id)}
                                        <option value={opt.id}>{opt.label}</option>
                                    {/each}
                                </select>
                            </div>
                            <div class="lv-param-item lv-param-item--type">
                                <span class="lv-param-label">{t.aiWizard.cardType}</span>
                                <select class="b3-select fn__block lv-param-select" bind:value={cardType} disabled={busy} aria-label={t.aiWizard.cardType}>
                                    <option value="qa">问答卡 (QA)</option>
                                    <option value="cloze">挖空卡 (Cloze)</option>
                                </select>
                            </div>
                            {#if decks.length > 0}
                                <div class="lv-param-item lv-param-item--deck">
                                    <span class="lv-param-label">入库卡包</span>
                                    <select class="b3-select fn__block lv-param-select" bind:value={selected} disabled={busy} aria-label="目标卡包" title={decks.find(d => d.id === selected)?.name ?? "目标卡包"}>
                                        {#each decks as d (d.id)}
                                            <option value={d.id}>{d.name}</option>
                                        {/each}
                                    </select>
                                </div>
                            {/if}
                        </div>
                        <!-- 第二行：辅助规格参数与侧重说明 -->
                        <div class="lv-params-minor-row">
                            <div class="lv-param-item lv-param-item--count">
                                <span class="lv-param-label">{t.aiWizard.count}</span>
                                <select class="b3-select lv-param-select-sm" bind:value={count} disabled={busy} aria-label={t.aiWizard.count}>
                                    {#each [5, 10, 15, 20] as n (n)}<option value={n}>{n} 张</option>{/each}
                                </select>
                            </div>
                            <div class="lv-param-item lv-param-item--lang">
                                <span class="lv-param-label">{t.aiWizard.language}</span>
                                <select class="b3-select lv-param-select-sm" bind:value={language} disabled={busy} aria-label={t.aiWizard.language}>
                                    <option value="中文">中文</option>
                                    <option value="English">English</option>
                                </select>
                            </div>
                            <div class="lv-param-desc fn__flex-1">
                                <LvIcon name="lightbulb" size={13} />
                                <span>{FOCUS_OPTIONS.find(f => f.id === promptFocus)?.desc}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {#if errorMsg}
                <div class="ft__smaller" style="color: var(--lv-color-danger); margin-bottom: var(--lv-sp-2); max-width: 48em; text-wrap: pretty; line-height: var(--lv-lh-reading, 1.65);" role="alert" aria-live="assertive">{errorMsg}</div>
            {/if}
            {#if previewOpen}
                <!-- T02 AI 请求预检确认（docs/13 §4 & R54 原型规范）：实际片段/参数/估算/知情同意 → 确认后才发送 -->
                <div class="lv-notice" style="display: flex; flex-direction: column; gap: calc(var(--lv-space-unit) * 3)">
                    <div class="lv-eyebrow">{t.aiWizard.preflightTitle}</div>
                    <div class="ft__smaller" style="line-height: var(--lv-lh-meta); color: var(--lv-color-text-muted)">{t.aiWizard.preflightNotice}</div>
                    <div style="background: var(--lv-color-surface-subtle); border-radius: 6px; padding: var(--lv-sp-2); max-height: 120px; overflow: auto; white-space: pre-wrap; font-size: var(--lv-type-control-size)">{source.trim().slice(0, 600)}{source.trim().length > 600 ? "…" : ""}</div>
                    <div class="ft__smaller ft__on-surface" style="font-variant-numeric: tabular-nums; max-width: 48em; text-wrap: pretty; line-height: var(--lv-lh-reading, 1.65);">
                        {t.aiWizard.previewParams.replace("${n}", String(count)).replace("${lang}", language).replace("${type}", cardType === "qa" ? t.aiWizard.typeQa : t.aiWizard.typeCloze)}
                        · {t.aiWizard.preflightScopeDetail.replace("${chars}", String(source.trim().length))}
                        · ≈ {Math.ceil(source.trim().length / 4)} tokens {t.aiWizard.previewTokens}
                    </div>
                    <div class="ft__smaller ft__on-surface">{t.aiWizard.previewEndpoint}</div>
                    {#if budgetPv}
                        <!-- BU-36：上下文包分层预览（发送前可见截断与预算来源，不静默裁剪） -->
                        <div style="border: 1px solid var(--lv-border); border-radius: 6px; padding: calc(var(--lv-space-unit) * 4); display: flex; flex-direction: column; gap: 4px">
                            <div class="lv-eyebrow">{t.aiWizard.budgetTitle} · {budgetPv.totalTokens}/{budgetPv.budgetTokens}</div>
                            {#each budgetPv.layers as layer (layer.key)}
                                <div class="fn__flex ft__smaller" style="gap: calc(var(--lv-space-unit) * 4); align-items: baseline">
                                    <span style="min-width: 72px">{layer.key === "system" ? t.aiWizard.budgetSystem : t.aiWizard.budgetMaterial}</span>
                                    <span class="ft__on-surface">{layer.tokens}</span>
                                    {#if layer.truncated || layer.dropped}
                                        <span style="color: var(--lv-color-warning)">{layer.dropped ? t.aiWizard.budgetDropped : t.aiWizard.budgetTruncated}</span>
                                    {/if}
                                </div>
                            {/each}
                            <div class="ft__smaller ft__on-surface">
                                {budgetPv.budgetSource === "model-registry"
                                    ? t.aiWizard.budgetFromRegistry.replace("${m}", budgetPv.modelId ?? "")
                                    : t.aiWizard.budgetFromDefault}
                            </div>
                            {#if budgetPv.needsBatching}
                                <div class="ft__smaller" style="color: var(--lv-color-danger)">{t.aiTooLong}</div>
                            {/if}
                        </div>
                    {/if}
                    {#if sensHits.length > 0 && !sensOverride}
                        <!-- BU-8：发送前敏感扫描——命中打码样本展示，处置权在用户 -->
                        <div style="border: 1px solid var(--lv-color-warning); border-radius: 6px; padding: calc(var(--lv-space-unit) * 4); display: flex; flex-direction: column; gap: 6px">
                            <div class="ft__smaller" style="font-weight: var(--lv-fw-semibold)">{t.aiWizard.sensTitle}</div>
                            <div class="fn__flex fn__flex-wrap" style="gap: calc(var(--lv-space-unit) * 3)">
                                {#each sensHits as h (h.id)}
                                    <span class="ft__smaller" style="border: 1px solid var(--lv-border); border-radius: 4px; padding: var(--lv-space-hairline) calc(var(--lv-space-unit) * 3)">{sensLabel(h.id)} ×{h.count}（{h.sample}）</span>
                                {/each}
                            </div>
                            <div class="ft__smaller ft__on-surface">{t.aiWizard.sensNote}</div>
                            <div class="fn__flex" style="gap: var(--lv-sp-2); justify-content: flex-end">
                                <button class="b3-button b3-button--small" onclick={maskAndContinue}>{t.aiWizard.sensMask}</button>
                                <button class="b3-button b3-button--small" onclick={() => (sensOverride = true)}>{t.aiWizard.sensOverride}</button>
                            </div>
                        </div>
                    {/if}
                    <label class="fn__flex ft__smaller ft__on-surface" style="gap: var(--lv-sp-2); align-items: center; margin: var(--lv-sp-1) 0; cursor: pointer">
                        <input type="checkbox" bind:checked={preflightConsent} />
                        <span><strong>{t.aiWizard.preflightConsent}</strong></span>
                    </label>
                    <div class="fn__flex" style="justify-content: flex-end; gap: var(--lv-sp-2)">
                        <button class="b3-button b3-button--small" onclick={() => { previewOpen = false; sensOverride = false; preflightConsent = false; }}>{t.aiWizard.preflightCancel}</button>
                        <button class="b3-button lv-btn-primary" disabled={busy || loadDocBusy || !preflightConsent || (sensHits.length > 0 && !sensOverride)} onclick={() => { previewOpen = false; sensOverride = false; preflightConsent = false; run(); }}>
                            {busy ? t.aiWizard.generating : t.aiWizard.preflightConfirm}
                        </button>
                    </div>
                </div>
            {/if}
            <div class="fn__flex lv-aiwiz-actions" style="justify-content: flex-end; gap: var(--lv-sp-2)">
                <button
                    class="b3-button b3-button--cancel"
                    aria-keyshortcuts="Escape"
                    title={`${closeLabel ?? window.siyuan.languages.cancel} (Esc)`}
                    onclick={closeWizard}
                >{closeLabel ?? window.siyuan.languages.cancel}</button>
                <button
                    class="b3-button lv-btn-primary"
                    disabled={busy || loadDocBusy || !source.trim()}
                    aria-busy={busy}
                    aria-keyshortcuts="Control+Enter Meta+Enter"
                    title={`${busy ? t.aiWizard.generating : t.aiWizard.generate} (Ctrl+Enter)`}
                    onclick={openPreview}
                >
                    {busy ? t.aiWizard.generating : `${t.aiWizard.generate} →`}
                </button>
            </div>
        </div>
    {:else}
        <div class="lv-aiwiz-step" transition:fade={{ duration: getMotionDuration("normal") }}>
            {#if restoredCandidates}
                <div class="lv-aiwiz-resume" role="status">
                    {t.aiWizard.recoveredCandidates.replace("${source}", recoveryJob?.sourceLabel ?? "")}
                </div>
            {/if}
            <div class="fn__flex" style="align-items: center; gap: var(--lv-sp-2); margin-bottom: var(--lv-sp-2)">
                <button
                    class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                    disabled={creating}
                    aria-keyshortcuts="Escape"
                    title={`${t.aiWizard.back} (Esc)`}
                    onclick={() => { cancelGeneration(); step = 1; }}
                >← {t.aiWizard.back}</button>
                <!-- T03：已选≠已审——选中决定集合，接受决定入库资格 -->
                <LvChip tone="default">{t.aiWizard.selCount.replace("${n}", String(candidates.filter(c => c.keep).length))}</LvChip>
                <LvChip tone="primary">{t.aiWizard.accCount.replace("${n}", String(acceptedCount))}</LvChip>
                <div class="fn__flex-1"></div>
                <button
                    type="button"
                    class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                    disabled={creating || regenBusy !== null}
                    onclick={toggleAllKeep}
                    title="切换全部卡片的勾选状态"
                >
                    <LvIcon name="check" size={12} />
                    <span>{candidates.every(c => c.keep) ? "全不选" : "全选"}</span>
                </button>
                <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" disabled={creating || regenBusy !== null} onclick={acceptAll}><LvIcon name="check" size={12} /> <span>{t.aiWizard.acceptAll}</span></button>
                <!-- T03：来源依据折叠（审核时可对照，不离开本屏） -->
                <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" onclick={() => (sourceOpen = !sourceOpen)}><span>{t.aiWizard.sourceFold}</span> <LvIcon name={sourceOpen ? "chevron-up" : "chevron-down"} size={13} /></button>
            </div>
            {#if candidates.length > 3}
                <div class="lv-candidate-search-row">
                    <input
                        class="b3-text-field fn__block lv-candidate-search-input"
                        placeholder="在已生成的卡片中过滤关键字..."
                        bind:value={candidateFilter}
                        aria-label="搜索候选卡片"
                    />
                </div>
            {/if}
            {#if reviewPlan}
                <!-- BU-14 审阅计划：按因子就高不就低；建议性横幅，不代审不阻断（block 档在制卡任务不会出现） -->
                <div class="lv-notice" style="display: flex; align-items: center; gap: calc(var(--lv-space-unit) * 3); flex-wrap: wrap; margin-bottom: var(--lv-sp-2); padding: 6px 10px">
                    <span class="ft__smaller" style="font-weight: var(--lv-fw-semibold)">{planText(reviewPlan)}</span>
                    {#each reviewPlan.factors as f (f)}
                        <span class="ft__smaller" style="border: 1px solid var(--lv-border); border-radius: 4px; padding: 0 calc(var(--lv-space-unit) * 3)">{factorLabel(f)}</span>
                    {/each}
                    {#if reviewPlan.decision === "sample" && reviewPlan.sampleSize}
                        <span class="ft__smaller ft__on-surface">{t.aiReview?.sampleHint ?? ""}</span>
                    {/if}
                </div>
            {/if}
            {#if sourceOpen}
                <div class="lv-card2" style="margin-bottom: var(--lv-sp-2)">
                    <div class="lv-eyebrow">{t.aiWizard.sourceFold}</div>
                    <div class="ft__smaller" style="max-height: 160px; overflow: auto; white-space: pre-wrap; margin-top: 6px">{source}</div>
                </div>
            {/if}
            <div class="lv-aiwiz-list">
                {#each visibleCandidates as c, i (c.origIndex)}
                    <div class="lv-card2 lv-aiwiz-card">
                        <label class="fn__flex" style="gap: var(--lv-sp-2); align-items: center">
                            <input type="checkbox" bind:checked={c.keep} disabled={creating || regenBusy !== null} />
                            <b class="ft__smaller">#{i + 1}</b>
                            {#if c.d}
                                <LvChip tone={c.d === 3 ? "error" : c.d === 2 ? "warn" : "default"}>{c.d === 3 ? t.aiWizard.diffHard : c.d === 2 ? t.aiWizard.diffMid : t.aiWizard.diffEasy}</LvChip>
                            {/if}
                            {#each lintWarnings[i] ?? [] as warn (warn)}
                                <LvChip tone="warn">{warn === "duplicate" ? t.aiWizard.lintDup : warn === "overlong" ? t.aiWizard.lintLong : warn === "tooshort" ? t.aiWizard.lintShort : warn}</LvChip>
                            {/each}
                            {#each draftIssues[i] ?? [] as issue (issue)}
                                <LvChip tone="error">{issue === "empty-question" ? t.aiWizard.missingQuestion : issue === "empty-answer" ? t.aiWizard.missingAnswer : t.aiWizard.invalidMarkup}</LvChip>
                            {/each}
                            {#each gateIssues[i] ?? [] as issue (issue)}
                                <LvChip tone="error">{issue === "duplicate-question" ? t.aiWizard.qualityDuplicate : issue === "answer-in-question" ? t.aiWizard.qualityLeak : issue === "multiple-questions" ? t.aiWizard.qualityMultiple : t.aiWizard.qualityTemplate}</LvChip>
                            {/each}
                            {#each scorecards[i]?.dimensions ?? [] as dim (dim.key)}
                                {#if dim.score >= 1 && dim.key !== "cognitive" && dim.key !== "difficulty"}
                                    <!-- BU-13：问题维度 chip（1=提示 warn / 2=问题 error），点「卡面预览」看说明与建议 -->
                                    <LvChip tone={dim.score >= 2 ? "error" : "warn"}>{dimLabel(dim.key)} · {dim.score}</LvChip>
                                {/if}
                            {/each}
                            <div class="fn__flex-1"></div>
                            {#if scorecards[i]?.assertionReport && scorecards[i].assertionReport.unsupportedCount > 0}
                                <LvChip tone="warn">{t.aiWizard.assertionUnsupportedCount.replace("${n}", String(scorecards[i].assertionReport.unsupportedCount))}</LvChip>
                            {/if}
                            {#if gateIssues[i].length > 0}<LvChip tone="error">{t.aiWizard.qualityBlockStatus}</LvChip>{:else if c.review === "accepted"}<LvChip tone="primary">{t.aiWizard.reviewAccepted}</LvChip>{:else if c.review === "verified"}<LvChip tone="primary">{t.aiWizard.reviewVerified}</LvChip>{:else if c.review === "needsCheck"}<LvChip tone="warn">{t.aiWizard.reviewNeedsCheck}</LvChip>{:else if c.edited}<LvChip tone="warn">{t.aiWizard.editedReaccept}</LvChip>{/if}
                            <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" title={t.aiWizard.cardPreview} onclick={() => (previewIdx = previewIdx === i ? null : i)}><LvIcon name="eye" size={12} /> <span>{t.aiWizard.cardPreview}</span></button>
                            <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" title={restoredCandidates ? t.aiWizard.recoveredRegenHint : t.aiWizard.regenerate} aria-label={restoredCandidates ? t.aiWizard.recoveredRegenHint : t.aiWizard.regenerate} disabled={creating || regenBusy !== null || restoredCandidates} onclick={() => regenerateCard(i)}><LvIcon name="refresh" size={13} /></button>
                            <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" title={t.aiWizard.removeCandidate} aria-label={t.aiWizard.removeCandidate} disabled={creating || regenBusy !== null} onclick={() => removeCandidate(i)}><LvIcon name="close" size={13} /></button>
                        </label>
                        <textarea class="b3-text-field fn__block" rows="2" bind:value={c.q} oninput={() => touchCandidate(i)} disabled={creating || regenBusy !== null} placeholder={t.quickCardQ} aria-label={t.quickCardQ} spellcheck="false"></textarea>
                        <textarea class="b3-text-field fn__block" rows="2" bind:value={c.a} oninput={() => touchCandidate(i)} disabled={creating || regenBusy !== null} placeholder={t.quickCardA} aria-label={t.quickCardA} spellcheck="false"></textarea>
                        {#if scorecards[i]?.assertionReport && scorecards[i].assertionReport.unsupportedCount > 0}
                            {@const unsupportedList = scorecards[i].assertionReport.assertions.filter(a => a.status === "unsupported").map(a => a.text)}
                            <div class="ft__smaller" style="margin-top: 4px; padding: 4px 8px; border-radius: 4px; background: var(--lv-warn-soft); color: var(--lv-color-on-warning-soft); line-height: 1.5;" role="status">
                                ⚠️ 答案中有 {scorecards[i].assertionReport.unsupportedCount} 处表述在来源材料中未找到直接依据{#if unsupportedList.length > 0}：「{unsupportedList.slice(0, 2).join("；")}」{/if}，建议对照来源核实或修改。
                            </div>
                        {/if}
                        <div class="fn__flex" style="gap: calc(var(--lv-space-unit) * 3); margin-top: 6px; flex-wrap: wrap;">
                            <button class="b3-button b3-button--small {c.review === 'accepted' ? 'lv-btn-primary' : ''}" disabled={creating || regenBusy !== null || draftIssues[i].length > 0 || gateIssues[i].length > 0} onclick={() => setReview(i, "accepted")}>{c.review === "accepted" ? t.aiWizard.reviewAccepted : t.aiWizard.acceptVer}</button>
                            <button class="b3-button b3-button--small {c.review === 'verified' ? 'lv-btn-primary' : ''}" disabled={creating || regenBusy !== null} onclick={() => setReview(i, "verified")}>{t.aiWizard.markVerified}</button>
                            <button class="b3-button b3-button--small {c.review === 'needsCheck' ? 'lv-btn-primary' : ''}" disabled={creating || regenBusy !== null} onclick={() => setReview(i, "needsCheck")}>{t.aiWizard.markNeedsCheck}</button>
                            {#if (candidateSplits[i]?.length ?? 0) >= 2}
                                <button
                                    type="button"
                                    class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                                    disabled={creating || regenBusy !== null}
                                    title="将复合问答一键拆分为多张独立原子候选卡"
                                    onclick={() => splitCandidate(i)}
                                >
                                    <LvIcon name="zap" size={12} />
                                    <span>拆成 {candidateSplits[i].length} 张</span>
                                </button>
                            {/if}
                            <div class="fn__flex-1"></div>
                            <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" title={t.aiWizard.cardPreview} onclick={() => (previewIdx = previewIdx === i ? null : i)}><LvIcon name="eye" size={12} /> <span>{t.aiWizard.cardPreview}</span></button>
                        </div>
                        {#if previewIdx === i}
                            {@const rendered = renderUnifiedCardFace({ question: c.q, answer: c.a, template: cardType, answerLabel: t.cardDetail?.answer ?? t.quickCardPreviewBack ?? "参考答案" })}
                            <!-- T03：实际卡面预览（接入统一卡面渲染管线，与复习端渲染一致） -->
                            <div class="lv-card2" style="padding: calc(var(--lv-space-unit) * 9) calc(var(--lv-space-unit) * 10); margin-top: 8px">
                                <div class="fn__flex between" style="align-items: center; margin-bottom: 8px">
                                    <div class="lv-eyebrow">{previewAnswerMap[i] ? t.quickCardPreviewBack : t.quickCardPreviewFront}</div>
                                    <button class="b3-button b3-button--small lv-btn-ghost" onclick={() => (previewAnswerMap[i] = !previewAnswerMap[i])}>
                                        {previewAnswerMap[i] ? t.quickCardHideAnswer : t.quickCardShowAnswer}
                                    </button>
                                </div>
                                <div class="lv-unified-face b3-typography" style="padding: var(--lv-sp-2) 0">
                                    {@html previewAnswerMap[i] ? rendered.answerHtml : rendered.questionHtml}
                                </div>
                                {#if scorecards[i]}
                                        <!-- BU-13：八维度评分卡（可解释问题 + 修复建议；综合分仅审阅提示，不入库资格由「已接受」决定） -->
                                        <div style="border-top: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent); padding-top: 12px; margin-top: calc(var(--lv-space-unit) * 6)">
                                            <div class="lv-eyebrow">{t.aiScore.title} · {scorecards[i].composite}</div>
                                            <div style="margin-top: calc(var(--lv-space-unit) * 3); display: flex; flex-direction: column; gap: 4px">
                                                {#each scorecards[i].dimensions as dim (dim.key)}
                                                    <div class="fn__flex" style="gap: calc(var(--lv-space-unit) * 4); align-items: baseline">
                                                        <span class="ft__smaller" style="min-width: 88px">{dimLabel(dim.key)}</span>
                                                        {#if dim.level}
                                                            <LvChip tone="default">{levelLabel(dim.level)}</LvChip>
                                                        {/if}
                                                        {#if dim.score > 0}
                                                            <span class="ft__smaller" style="color: var(--lv-color-warning)">{noteText(dim.noteKey)}</span>
                                                        {/if}
                                                        {#if dim.suggestKey}
                                                            <span class="ft__smaller ft__on-surface">{fixText(dim.suggestKey)}</span>
                                                        {/if}
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>
                                    {/if}
                                    {#if scorecards[i]?.assertionReport}
                                        {@const rep = scorecards[i].assertionReport}
                                        <!-- BU-10 & docs/48：逐断言来源依据核验 -->
                                        <div style="border-top: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent); padding-top: 12px; margin-top: calc(var(--lv-space-unit) * 6)">
                                        <div class="fn__flex between" style="align-items: center; margin-bottom: 8px">
                                            <div class="lv-eyebrow">{t.aiWizard.assertionTitle}</div>
                                            <span class="ft__smaller ft__on-surface">{t.aiWizard.sourceTrustScore}: <strong>{rep.sourceTrustScore}%</strong></span>
                                        </div>
                                        <div style="display: flex; flex-direction: column; gap: calc(var(--lv-space-unit) * 3)">
                                            {#each rep.assertions as ass, assertionIndex (assertionIndex)}
                                                <div class="lv-card2" style="padding: calc(var(--lv-space-unit) * 4) calc(var(--lv-space-unit) * 6); font-size: 12px; display: flex; flex-direction: column; gap: calc(var(--lv-space-unit) * 2); border: 1px solid var(--lv-border); border-left: 3px solid {ass.status === 'supported' ? 'var(--lv-color-success)' : ass.status === 'partial' ? 'var(--lv-color-brand)' : 'var(--lv-color-warning)'}">
                                                    <div class="fn__flex between" style="align-items: baseline; gap: var(--lv-sp-2)">
                                                        <span style="font-weight: var(--lv-fw-medium); flex: 1">{ass.text}</span>
                                                        <LvChip tone={ass.status === "supported" ? "default" : ass.status === "partial" ? "primary" : "warn"}>
                                                            {ass.status === "supported" ? t.aiWizard.assertionSupported : ass.status === "partial" ? t.aiWizard.assertionPartial : t.aiWizard.assertionUnsupported}
                                                        </LvChip>
                                                    </div>
                                                    {#if ass.matchedSourceExcerpt}
                                                        <div class="ft__smaller ft__on-surface" style="padding: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 4); border-radius: 4px; background: var(--lv-surface-hover); opacity: 0.9; font-style: italic">
                                                            “{ass.matchedSourceExcerpt}”
                                                        </div>
                                                    {/if}
                                                </div>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                                {#if (prov[i]?.versions.length ?? 0) > 0}
                                    <!-- BU-15：版本链（ai 生成/user 编辑双轨；回到任意历史版本） -->
                                    <div style="border-top: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent); padding-top: 12px; margin-top: calc(var(--lv-space-unit) * 6)">
                                        <div class="lv-eyebrow">{t.aiScore.versions} · {prov[i].versions.length}</div>
                                        <div style="margin-top: calc(var(--lv-space-unit) * 3); display: flex; flex-direction: column; gap: 4px">
                                            {#each [...prov[i].versions].reverse() as v, vi (prov[i].versions.length - 1 - vi)}
                                                <div class="fn__flex" style="gap: calc(var(--lv-space-unit) * 4); align-items: center">
                                                    <LvChip tone={v.via === "ai" ? "default" : "primary"}>{v.via === "ai" ? t.aiScore.viaAI : t.aiScore.viaUser}</LvChip>
                                                    <span class="ft__smaller" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{v.q.slice(0, 40)}</span>
                                                    {#if v.q !== c.q || v.a !== c.a}
                                                        <button class="b3-button b3-button--small" disabled={creating || regenBusy !== null} onclick={() => restoreVersion(i, v)}>{t.aiScore.restore}</button>
                                                    {/if}
                                                </div>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
            {#if errorMsg}
                <div class="ft__smaller" style="color: var(--lv-color-danger); margin-bottom: var(--lv-sp-2); max-width: 48em; text-wrap: pretty; line-height: var(--lv-lh-reading, 1.65);" role="alert" aria-live="assertive">{errorMsg}</div>
            {/if}
            <div class="fn__flex lv-aiwiz-actions lv-aiwiz-actions--step2" style="justify-content: flex-end; gap: var(--lv-sp-2); margin-top: var(--lv-sp-2)">
                <button
                    class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                    disabled={creating}
                    aria-keyshortcuts="Escape"
                    title={`${t.aiWizard.back} (Esc)`}
                    onclick={() => { cancelGeneration(); step = 1; }}
                >
                    <LvIcon name="chevron-left" size={12} /> <span>{t.aiWizard.back}</span>
                </button>
                <input
                    class="b3-text-field"
                    style="width: 180px"
                    placeholder={t.deckNewName}
                    aria-label={t.deckNewName}
                    bind:value={newName}
                    disabled={creating}
                    spellcheck="false"
                    autocomplete="off"
                    onkeydown={(e) => {
                        if (e.key === "Enter" && canImport && !creating && regenBusy === null) {
                            e.preventDefault();
                            importCards();
                        }
                    }}
                />
                <select class="b3-select" style="max-width: 180px" bind:value={selected} disabled={creating || decks.length === 0} aria-label={t.deckPickerTitle}>
                    {#each decks as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
                </select>
                {#if decks.length === 0}
                    <span class="ft__smaller ft__on-surface">{t.quickCardNeedDeck}</span>
                {/if}
                <button
                    class="b3-button lv-btn-primary"
                    disabled={creating || regenBusy !== null || !canImport}
                    aria-busy={creating}
                    aria-keyshortcuts="Control+Enter Meta+Enter"
                    title={`${t.aiWizard.importReviewed} (Ctrl+Enter)`}
                    onclick={importCards}
                >
                    <LvIcon name="check" size={13} />
                    <span>{creating ? "…" : t.aiWizard.createAcceptedN.replace("${n}", String(acceptedCount))}</span>
                </button>
            </div>
        </div>
    {/if}
</div>

<style>
    .lv-aiwiz {
        padding: var(--lv-sp-4);
        /* 宽度交给对话框（860px 三栏工作台），不再自限 680 —— T02 来源/编辑/参数需要横向空间 */
        height: 100%;
        overflow: auto;
        box-sizing: border-box;

        :global(.lv-drag-over) {
            border-color: var(--b3-theme-primary) !important;
            background: color-mix(in srgb, var(--b3-theme-primary) 8%, transparent) !important;
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 30%, transparent) !important;
        }

        .b3-button {
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }
        }

        .b3-text-field,
        .b3-select {
            touch-action: manipulation;
            transition: border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease);

            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
                border-color: var(--lv-color-brand);
            }
        }
    }
    .lv-aiwiz.lv-aiwiz-embedded {
        height: auto;
        overflow: visible;
        padding: 0;
        container: lv-aiwiz / inline-size;
    }
    @container lv-aiwiz (max-width: 740px) {
        .lv-wb { grid-template-columns: 1fr; }
    }
    .lv-aiwiz .lv-ob-head {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-3);
    }
    .lv-aiwiz-resume {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--lv-sp-2);
        padding: var(--lv-sp-2) var(--lv-sp-3);
        margin-bottom: var(--lv-sp-3);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        background: var(--lv-primary-softer, transparent);
        font-size: var(--lv-type-control-size);
    }
    .lv-aiwiz-resume-note {
        flex: 1 1 100%;
        min-width: 0;
        color: var(--lv-color-text-muted);
        max-width: 48em;
        text-wrap: pretty;
        line-height: var(--lv-lh-reading, 1.65);
    }
    .lv-aiwiz-list {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);
        max-height: 46vh;
        overflow: auto;
        margin-bottom: var(--lv-sp-2);
    }
    .lv-aiwiz-card {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);
        background: var(--lv-color-surface);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-l);
        padding: var(--lv-sp-4);
        box-shadow: var(--lv-shadow-1), var(--lv-inset-shine);
        content-visibility: auto;
        contain-intrinsic-size: 0 160px;
        transition: transform var(--lv-dur-2) var(--lv-ease),
            border-color var(--lv-dur-1) var(--lv-ease),
            box-shadow var(--lv-dur-2) var(--lv-ease);

        &:hover {
            transform: translateY(-1.5px);
            border-color: var(--lv-border-strong);
            box-shadow: var(--lv-shadow-2), var(--lv-inset-shine);
        }
    }

    /* T02 完整工作面（docs/13 §4）：左=来源清单与载入，右=材料编辑与参数 */
    .lv-wb {
        display: grid;
        grid-template-columns: 240px minmax(0, 1fr);
        gap: var(--lv-sp-4);
        margin-bottom: var(--lv-sp-3);
        @media (max-width: 760px) { grid-template-columns: 1fr; }
    }
    .lv-wb-side { display: flex; flex-direction: column; gap: calc(var(--lv-space-unit) * 2); align-items: stretch; }
    .lv-wb-side .lv-wb-load {
        width: 100%;
        text-align: left;
        /* 宿主 .b3-button 是 inline-flex 居中——覆盖对齐，文字靠左（text-align 对 flex 不生效） */
        justify-content: flex-start;
    }
    /* 笔记本载入组：卡片式堆叠，下拉与按钮各自拥有充足宽度 */
    .lv-wb-nb-card {
        display: flex;
        flex-direction: column;
        gap: 4px;
        width: 100%;
    }
    .lv-wb-nb-row {
        display: flex;
        gap: 4px;
        align-items: center;
    }
    .lv-wb-nb-select {
        flex: 1;
        min-width: 0;
        height: 28px;
        line-height: 26px;
        font-size: var(--lv-type-control-size);
        padding: 0 6px;
        box-sizing: border-box;
    }
    .lv-wb-nb-btn {
        flex: none;
        height: 28px;
        padding: 0 8px;
    }
    .lv-wb-chips { display: flex; flex-direction: column; gap: calc(var(--lv-space-unit) * 2); margin-top: var(--lv-sp-1); }
    .lv-wb-chip {
        display: flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 2);
        font-size: var(--lv-type-meta-size);
        padding: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 3);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-compact);
        background: var(--lv-surface-hover);
    }
    /* 来源条目动作（回源/禁止外发/移除）：统一 ghost 图形钮，muted→hover 强调 */
    .lv-wb-icon {
        flex: none;
        width: 22px;
        height: 22px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        border-radius: var(--lv-r-tag);
        color: var(--lv-color-text-muted);
        opacity: 0.7;
        font-size: var(--lv-type-control-size);
        cursor: pointer;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        transition: opacity var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease);
        &:hover { opacity: 1; background: var(--lv-primary-soft); color: var(--lv-color-brand); }
        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
    .lv-wb-srcview {
        white-space: pre-wrap;
        max-height: 140px;
        overflow: auto;
        padding: calc(var(--lv-space-unit) * 4);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-compact);
        margin: calc((calc(var(--lv-space-unit) * 1)) * -1) 0 calc(var(--lv-space-unit) * 2);
    }
    /* 材料空态（R53 §3.9）：图标圈 + 指引 */
    .lv-wb-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--lv-sp-2);
        padding: calc(var(--lv-space-unit) * 17) calc(var(--lv-space-unit) * 10);
        text-align: center;
    }
    .lv-wb-empty-icon {
        width: 48px;
        height: 48px;
        border-radius: var(--lv-r-circle);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
        font-size: var(--lv-type-title-size);
        box-shadow: 0 0 0 4px color-mix(in srgb, var(--lv-color-brand) 6%, transparent);
        border: 1px solid var(--lv-primary-border);
    }
    .lv-wb-empty-text {
        font-size: var(--lv-type-control-size);
        color: var(--lv-color-text-muted);
        max-width: 48em;
        text-wrap: pretty;
        line-height: var(--lv-lh-reading, 1.65);
    }
    /* T02：来源条目标签 = 查看原文按钮 */
    .lv-wb-view {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-align: left;
        border: none;
        background: transparent;
        color: inherit;
        font: inherit;
        padding: 0;
        cursor: pointer;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        &:hover { color: var(--lv-color-brand); }
        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }

    /* ① 左侧栏分组卡片化与排版对齐 */
    .lv-side-card {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px 12px;
        background: color-mix(in srgb, var(--lv-color-text) 3%, var(--lv-color-surface));
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
    }
    .lv-side-head {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: var(--lv-type-smaller-size);
        font-weight: 600;
        color: var(--lv-color-text-muted);
        letter-spacing: 0.3px;
    }
    .lv-side-actions {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .lv-side-sublabel {
        font-size: 11px;
        color: var(--lv-color-text-muted);
    }
    .lv-side-demo-grid {
        display: flex;
        gap: 6px;
    }
    .lv-wb-demo-btn {
        flex: 1 1 50%;
        text-align: center;
        justify-content: center;
        font-size: 11px;
        padding: 4px 6px;
        white-space: nowrap;
    }

    .lv-wb-header {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        margin-bottom: 6px;
    }
    .lv-wb-title {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: var(--lv-type-control-size);
        color: var(--lv-color-text);
    }
    .lv-wb-textarea {
        font-size: var(--lv-type-control-size);
        line-height: 1.6;
        min-height: 200px;
        max-height: 400px;
        resize: vertical;
    }
    .lv-wb-meter-row {
        margin-top: 6px;
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        flex-wrap: wrap;
    }
    .lv-wb-meter-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 2px 8px;
        background: color-mix(in srgb, var(--lv-color-text) 6%, transparent);
        border-radius: var(--lv-r-pill);
    }
    .lv-wb-meter-note {
        color: var(--lv-color-text-muted);
    }
    .lv-wb-empty-actions {
        margin-top: 10px;
    }

    /* ② 参数区两行结构化布局 */
    .lv-aiwiz-params-card {
        margin-top: var(--lv-sp-3);
        padding: 12px 14px;
        background: color-mix(in srgb, var(--lv-color-text) 3%, var(--lv-color-surface));
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-l);
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    .lv-params-major-row {
        display: grid;
        grid-template-columns: minmax(180px, 1.4fr) minmax(130px, 1fr) minmax(180px, 1.5fr);
        gap: var(--lv-sp-3);
        align-items: start;
        width: 100%;

        @media (max-width: 800px) {
            grid-template-columns: 1fr;
        }
    }
    .lv-params-minor-row {
        display: flex;
        align-items: flex-end;
        gap: var(--lv-sp-3);
        flex-wrap: wrap;
        width: 100%;
    }
    .lv-param-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
    }
    .lv-param-item--count,
    .lv-param-item--lang {
        flex: none;
    }
    .lv-param-label {
        font-size: 11px;
        color: var(--lv-color-text-muted);
        font-weight: 500;
        white-space: nowrap;
    }
    .lv-param-select {
        height: 30px;
        line-height: 28px;
        padding: 0 8px;
        font-size: var(--lv-type-control-size);
        width: 100%;
        box-sizing: border-box;
    }
    .lv-param-select-sm {
        height: 30px;
        line-height: 28px;
        padding: 0 8px;
        font-size: var(--lv-type-control-size);
        min-width: 90px;
        box-sizing: border-box;
    }
    .lv-param-desc {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--b3-theme-primary);
        font-size: var(--lv-type-smaller-size);
        line-height: 1.4;
        padding: 5px 10px;
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, transparent);
        border-radius: var(--b3-border-radius);
        min-height: 30px;
        box-sizing: border-box;
    }
    .lv-candidate-search-row {
        margin-bottom: var(--lv-sp-2);
    }
    .lv-candidate-search-input {
        height: 28px;
        font-size: var(--lv-type-smaller-size);
    }

    @media (max-width: 640px) {
        .lv-aiwiz:not(.lv-aiwiz-embedded) {
            padding: var(--lv-sp-3) var(--lv-sp-3) 0;
            display: flex;
            flex-direction: column;
            min-height: 0;

            .lv-aiwiz-step {
                flex: 1 1 auto;
                display: flex;
                flex-direction: column;
                min-height: 0;
            }
        }
        .lv-wb-textarea {
            min-height: 132px;
            font-size: 16px;
        }
        .lv-aiwiz-list {
            max-height: none;
            overflow: visible;
        }
        .lv-aiwiz-actions {
            position: sticky;
            bottom: 0;
            z-index: var(--lv-z-card-control);
            flex-wrap: wrap;
            background: var(--lv-color-surface);
            border-top: 1px solid var(--lv-border);
            padding: var(--lv-sp-2) 0 max(var(--lv-sp-2), env(safe-area-inset-bottom, 0px));
            margin-top: var(--lv-sp-2);

            .b3-button {
                min-height: 44px;
            }
            .lv-btn-primary {
                flex: 1 1 auto;
            }
        }
        .lv-aiwiz-actions--step2 {
            input.b3-text-field,
            select.b3-select {
                flex: 1 1 130px;
                min-width: 0;
                width: auto !important;
                max-width: none !important;
            }
        }
    }
</style>
