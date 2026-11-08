<script lang="ts">
    import { onMount, tick } from "svelte";
    import { openTab } from "siyuan";
    import { showMessage } from "@/libs/notice";
    import { getRiffCards, getRiffCardsByBlockIDs, getRiffDecks, createRiffDeck, removeRiffCards, resetRiffCards, type SearchBlock, type RiffDeck } from "@/api/riff";
    import { addRiffCards, invalidateDueCache } from "@/api/due-shared";
    import { friendlyError } from "@/api/errors";
    import { confirmDialog } from "@/libs/dialog";
    import { trapFocus } from "@/libs/focus-trap";
    import { parseManagerView } from "@/core/settings";
    import { srExportLine, composeSrExport } from "@/core/obsidian-import";
    import CardDetail from "./card-detail.svelte";
    import LvPage from "./kit/LvPage.svelte";
    import LvEmpty from "./kit/LvEmpty.svelte";
    import LvError from "./kit/LvError.svelte";
    import LvSkeleton from "./kit/LvSkeleton.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import LvIcon from "./kit/LvIcon.svelte";

    export interface ManagerCtx {
        i18n: any;
        /** BI-14：界面模式（simple=隐藏高级批量操作；显示性控制，不删配置） */
        uiMode?: "simple" | "advanced";
        /** BI-17：管理器视图状态持久化（可选——旧宿主不传则不恢复筛选） */
        view?: { initial: string | null; save: (v: string) => void };
        app: any;
        openOnboarding?: () => void;
        savedFilters: () => { name: string; filter: string }[];
        saveFilter: (name: string, filter: string) => void;
        /** T05 分面（docs/40）：块学习记录与关联疑问（可选——旧宿主不传则分面显示空态） */
        getBlockHistory?: (blockID: string) => { rating: number; ts: number; dur: number | null }[];
        getBlockIssues?: (blockID: string) => { addedAt: number; status: string }[];
        /** T05 内容版本快照（最新在前；可选——旧宿主不传则不显示版本） */
        contentVersionsOf?: (blockID: string) => { md: string; at: number; via: "editor" | "ai"; accepted?: boolean }[];
        /** T05：用户核对确认某版本 */
        acceptContentAt?: (blockID: string, at: number) => void | Promise<void>;
        deleteFilter: (name: string) => void;
        getLeechCards: () => { blockID: string; lapses: number }[];
        /** 星标收藏卡片 ID 集合（对标 Quizlet Starred / Anki Flagged） */
        getStarredCardIDs?: () => string[];
        toggleStarCard?: (blockID: string) => Promise<boolean>;
        /** 状态过滤（M6·FR2）：新卡=本地 revlog 无记录 */
        isNewBlock: (blockID: string) => boolean;
        /** 遗忘次数映射（272）：lapses 排序用 */
        getLapsesMap: () => Record<string, number>;
        /** 今日到期块 ID 清单（内核到期卡片，含 blockID） */
        getDueBlockIDs: () => Promise<string[]>;
        /** 订阅跨前端存储重载事件，自动刷新当前分页与到期筛选 */
        onStoresChanged?: (cb: () => void) => () => void;
        /** 订阅评分事件，保持卡片状态/到期筛选与总览同一时点 */
        onReviewed?: (cb: () => void) => () => void;
        /** BK-2：关系视图/增删（v0.123.0；可选——旧宿主不传则详情不显示关系区） */
        relationsOfBlock?: (blockID: string) => { relation: { from: string; to: string; type: string; createdAt: number }; direction: "outgoing" | "incoming" }[];
        addRelation?: (from: string, to: string, type: string) => void;
        removeRelation?: (from: string, to: string, type: string) => void;
        detachCards?: (blockIDs: string[]) => Promise<void> | void;
        /** BK-1：知识对象快照与操作（可选——旧宿主不传则详情不显示知识对象区） */
        ko?: {
            snapshot: (blockID: string) => { registered: boolean; fact: string; instances: { cardID: string; cardType: string; capability: string | null; disabled: boolean }[] };
            register: (blockID: string, fact: string) => void | Promise<void>;
            toggle: (blockID: string, cardID: string, disabled: boolean) => void | Promise<void>;
            remove: (blockID: string, cardID: string) => void | Promise<void>;
            derive: (blockID: string, cardType: string) => Promise<void>;
        };
        /** BI-5/6/7：内容状态生命周期（可选——旧宿主不传则详情不显示内容状态区） */
        lc?: {
            snapshot: (blockID: string) => import("@/core/content-lifecycle").ContentLifecycle | null;
            open: (blockID: string) => void | Promise<void>;
            transition: (blockID: string, to: import("@/core/content-lifecycle").ContentState, reason: string) => boolean | Promise<boolean>;
            /** cram=false 正式复习 / true 练习（突击）模式；blockID 传入时记 BI-3 卡片入口 */
            openReview: (cram: boolean, blockID?: string) => void;
            makeCards: (blockID: string, content: string) => void;
        };
        /** BX-2 W2：卡片内容读写（可选——旧宿主不传则详情不显示编辑入口） */
        blockContent?: (blockID: string) => Promise<string | null>;
        saveBlockContent?: (blockID: string, md: string) => Promise<boolean | string>;
        /** 内容保存并回读预览后通知宿主（维护页可借此返回并重新扫描）。 */
        onCardContentSaved?: (blockID: string) => void | Promise<void>;
        deckScope?: { id: string; name: string } | null;
        clearDeckScope?: () => void;
        openDecksTab?: () => void;
        openReviewScope?: (scope: string, cram?: boolean) => void;
        /** 维护页定点打开的卡片；只读导航参数，不改变筛选或调度。 */
        initialBlockID?: string;
        onInitialBlockConsumed?: () => void;
    }

    let { ctx }: { ctx: ManagerCtx } = $props();
    const t = $derived(ctx.i18n);
    // 详情面板 i18n 视图矫正（v0.206.12）：relations 实际在 review.relations（v0.11x 起的组路径漂移），
    // 面板内 34 处 t.relations/t.lc/t.editor 直读不改——在此构造兼容视图，缺组回落顶层
    const detailT = $derived.by(() => {
        const i = ctx.i18n as any;
        return new Proxy(i, {
            get(target, key: string) {
                if (key === "relations" && !target.relations) return target.review?.relations;
                return target[key];
            },
        });
    });

    const PAGE_SIZE = 20;
    let loading = $state(true);
    let page = $state(1);
    let viewReady = $state(false);
    let disposed = false;
    let restorePositionOnLoad = false;
    let restoreScrollTop = 0;
    let restoreFocusId = "";
    let liveScrollTop = 0;
    let focusedControlId = "";
    let viewSaveTimer: ReturnType<typeof setTimeout> | null = null;
    const lapsesMap = $derived(ctx.getLapsesMap ? ctx.getLapsesMap() : {});
    let total = $state(0);
    let pageCount = $state(1);
    let blocks: SearchBlock[] = $state([]);
    let errorMsg = $state("");
    let filterText = $state("");
    /** 防抖后的过滤词（548）：输入停顿 200ms 才触发过滤重算 */
    let deferredFilter = $state("");
    let filterDirty = $state(false);
    let filterTimer: ReturnType<typeof setTimeout> | null = null;
    let starTogglingSet = $state<Set<string>>(new Set());
    $effect(() => {
        const dirty = filterDirty;
        const nextFilter = filterText;
        if (filterTimer) { clearTimeout(filterTimer); }
        if (!dirty) return;
        filterTimer = setTimeout(() => {
            deferredFilter = nextFilter;
            // 搜索仅作用于内核返回的当前分页；切词后回到第 1 页并重新取数。
            page = 1;
            resetScrollPosition();
            filterDirty = false;
            void load();
        }, 200);
        return () => { if (filterTimer) { clearTimeout(filterTimer); } };
    });
    let sortMode = $state<"default" | "path" | "content" | "lapses">("default");
    let leechOnly = $state(false);
    let starredOnly = $state(false);
    let statusFilter = $state<"all" | "new" | "review" | "due">("all");
    let cardTypeFilter = $state<"all" | "outline-cloze" | "superblock">("all");
    let dueSet = $state(new Set<string>());
    let loadSeq = 0;  // AR-6：分页/刷新请求序号
    let dueSeq = 0;   // AR-6：到期清单请求序号
    let dueLoading = $state(false);
    let dueError = $state("");
    let savedList = $state<{ name: string; filter: string }[]>([]);
    let pickedSaved = $state("");
    let selected: string[] = $state([]);
    let batchBusy = $state<"remove" | "reset" | null>(null);
    let batchError = $state("");
    let detail: SearchBlock | null = $state(null);
    let detailRelations: { relation: { from: string; to: string; type: string; createdAt: number }; direction: "outgoing" | "incoming" }[] = $state([]);
    let detailKo: { registered: boolean; fact: string; instances: { cardID: string; cardType: string; capability: string | null; disabled: boolean }[] } | null = $state(null);
    let detailVersions: { md: string; at: number; via: "editor" | "ai"; accepted?: boolean }[] = $state([]);
    let detailLc: import("@/core/content-lifecycle").ContentLifecycle | null = $state(null);
    let initialDetailOpened = "";
    let detailRequestSeq = 0;
    let storesChangedTimer: ReturnType<typeof setTimeout> | null = null;
    // svelte-ignore state_referenced_locally -- Hub creates a fresh Manager for each deck route.
    let deckScope = $state(ctx.deckScope ?? null);

    function stripHtml(html: string): string {
        if (!html) return "";
        return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    }

    const plainTextCache = new Map<string, string>();
    function getPlainText(id: string, html: string): string {
        let cached = plainTextCache.get(id);
        if (cached === undefined) {
            cached = stripHtml(html);
            plainTextCache.set(id, cached);
        }
        return cached;
    }

    let leechBlockIDSet = $derived.by(() => {
        if (!leechOnly) return null;
        return new Set(ctx.getLeechCards().map(l => l.blockID));
    });

    let starredIDSet = $derived.by(() => {
        if (!starredOnly) return null;
        return new Set(ctx.getStarredCardIDs?.() ?? []);
    });

    const hasActiveFilters = $derived(
        Boolean(filterText.trim() || statusFilter !== "all" || cardTypeFilter !== "all" || leechOnly || starredOnly || sortMode !== "default" || pickedSaved)
    );

    let mobileFiltersOpen = $state(false);
    const activeSecondaryFilterCount = $derived(
        (deckScope ? 1 : 0)
        + (sortMode !== "default" ? 1 : 0)
        + (statusFilter !== "all" ? 1 : 0)
        + (cardTypeFilter !== "all" ? 1 : 0)
        + (leechOnly ? 1 : 0)
        + (starredOnly ? 1 : 0)
    );

    let filteredBlocks = $derived(
        (() => {
            const lowerFilter = deferredFilter ? deferredFilter.toLowerCase() : "";
            let arr = blocks.filter(b => !lowerFilter || getPlainText(b.id, b.content).toLowerCase().includes(lowerFilter));
            if (leechOnly && leechBlockIDSet) {
                arr = arr.filter(b => leechBlockIDSet.has(b.id));
            }
            if (starredOnly && starredIDSet) {
                arr = arr.filter(b => starredIDSet.has(b.id));
            }
            if (statusFilter === "new") {
                arr = arr.filter(b => ctx.isNewBlock(b.id));
            } else if (statusFilter === "review") {
                arr = arr.filter(b => !ctx.isNewBlock(b.id));
            } else if (statusFilter === "due") {
                arr = arr.filter(b => dueSet.has(b.id));
            }
            if (cardTypeFilter === "outline-cloze") {
                arr = arr.filter(b => (b.content?.includes("NodeList") || b.content?.includes("<ul") || b.content?.includes("<ol") || b.content?.includes("NodeListItem")) && (b.content?.includes("lv-masked") || b.content?.includes("data-type=\"mark\"")));
            } else if (cardTypeFilter === "superblock") {
                arr = arr.filter(b => b.content?.includes("NodeSuperBlock") || b.content?.includes("data-type=\"NodeSuperBlock\"") || b.content?.includes("{{{col") || b.content?.includes("{{{row"));
            }
            if (sortMode === "path") {
                return [...arr].sort((a, b) => ((a.hPath as string) ?? "").localeCompare((b.hPath as string) ?? ""));
            }
            if (sortMode === "content") {
                return [...arr].sort((a, b) => getPlainText(a.id, a.content).localeCompare(getPlainText(b.id, b.content)));
            }
            if (sortMode === "lapses") {
                // 遗忘次数降序（272）：烂卡优先（使用响应式派生表，避免每次比较重复扫表）
                return [...arr].sort((a, b) => (lapsesMap[b.id] ?? 0) - (lapsesMap[a.id] ?? 0));
            }
            return arr;
        })()
    );

    async function load() {
        // AR-6：快速分页/刷新并发时只接受最后一次响应
        const seq = ++loadSeq;
        loading = true;
        errorMsg = "";
        // 新请求对应新结果，旧页面的选择不能作用于新分页或筛选结果。
        selected = [];
        try {
            if (availableDecks.length === 0 && getRiffDecks) {
                try {
                    const dl = await getRiffDecks();
                    availableDecks = dl ?? [];
                } catch { /* 旁路 */ }
            }
            const cards = await getRiffCards(deckScope?.id ?? "", page, PAGE_SIZE);
            if (seq !== loadSeq) {
                return; // 旧页响应不覆盖筛选、页码与选择
            }
            const nextPageCount = Math.max(1, cards.pageCount);
            if (page > nextPageCount) {
                page = nextPageCount;
                void load();
                return;
            }
            // 同一块可同时属于内置卡组与自定义卡组（Svelte each 键不可重复）——按块 ID 去重，一行一内容
            const seen = new Set<string>();
            blocks = (cards.blocks ?? []).filter(b => {
                if (!b.id || seen.has(b.id)) return false;
                seen.add(b.id);
                plainTextCache.set(b.id, stripHtml(b.content));
                return true;
            });
            selected = [];
            total = cards.total;
            pageCount = nextPageCount;
        } catch (e: any) {
            if (disposed) return;
            if (seq === loadSeq) {
                errorMsg = friendlyError(e, t);
            }
        } finally {
            if (disposed) return;
            if (seq === loadSeq) {
                loading = false;
                await restoreViewPosition();
            }
        }
    }

    async function restoreViewPosition() {
        if (disposed || !restorePositionOnLoad || loading || dueLoading || errorMsg || dueError) return;
        // 列表替换加载骨架后再恢复；到期筛选还需等其独立查询完成。
        await tick();
        if (disposed || !restorePositionOnLoad || loading || dueLoading) return;
        const pageEl = document.getElementById("lv-manager-page");
        if (pageEl) pageEl.scrollTop = restoreScrollTop;
        const focusEl = restoreFocusId ? document.getElementById(restoreFocusId) : null;
        if (focusEl instanceof HTMLElement && focusEl.isConnected) focusEl.focus({ preventScroll: true });
        restorePositionOnLoad = false;
    }

    function goto(p: number) {
        page = Math.min(Math.max(1, p), pageCount);
        resetScrollPosition();
        void load();
    }

    function resetScrollPosition() {
        restorePositionOnLoad = false;
        liveScrollTop = 0;
        const pageEl = document.getElementById("lv-manager-page");
        if (pageEl) pageEl.scrollTop = 0;
    }

    function serializeView(): string {
        return JSON.stringify({
            filter: filterText,
            sort: sortMode,
            leechOnly,
            starredOnly,
            status: statusFilter,
            page,
            scrollTop: liveScrollTop,
            focusId: focusedControlId,
        });
    }

    function scheduleViewSave() {
        if (disposed) return;
        if (viewSaveTimer) clearTimeout(viewSaveTimer);
        viewSaveTimer = setTimeout(() => {
            viewSaveTimer = null;
            if (!disposed && viewReady) {
                ctx.view?.save(serializeView());
            }
        }, 180);
    }

    function capturePageScroll(event: Event) {
        liveScrollTop = (event.currentTarget as HTMLElement).scrollTop;
        scheduleViewSave();
    }

    function capturePageFocus(event: FocusEvent) {
        const target = event.target instanceof HTMLElement ? event.target : null;
        const row = target?.closest<HTMLElement>("[data-manager-card-id]");
        focusedControlId = target?.id || row?.id || "";
        scheduleViewSave();
    }

    function clearDeckScope() {
        deckScope = null;
        ctx.clearDeckScope?.();
        page = 1;
        resetScrollPosition();
        void load();
    }

    function onDeckFilterChange(e: Event) {
        const val = (e.currentTarget as HTMLSelectElement).value;
        if (!val) {
            clearDeckScope();
        } else {
            const found = availableDecks.find(d => d.id === val);
            if (found) {
                deckScope = { id: found.id, name: found.name };
                page = 1;
                selected = [];
                resetScrollPosition();
                void load();
            }
        }
    }

    function toggleSelect(id: string) {
        selected = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id];
    }

    const isAllSelected = $derived(filteredBlocks.length > 0 && filteredBlocks.every(b => selected.includes(b.id)));

    function toggleSelectAll() {
        if (isAllSelected) {
            selected = [];
        } else {
            selected = filteredBlocks.map(b => b.id);
        }
    }

    /** 「今日到期」切换过滤项时拉取内核到期清单（AR-6：每次切入都重拉，评分后 due 集不陈旧） */
    async function onStatusChange() {
        const seq = ++dueSeq;
        dueError = "";
        dueSet = new Set();
        if (statusFilter !== "due") {
            dueLoading = false;
            void load();
            return;
        }
        dueLoading = true;
        try {
            const ids = await ctx.getDueBlockIDs();
            if (seq === dueSeq && statusFilter === "due") {
                dueSet = new Set(ids);
                await load();
            }
        } catch (e: any) {
            if (disposed) return;
            if (seq === dueSeq && statusFilter === "due") {
                dueError = friendlyError(e, t) || t.manager.dueLoadFailed;
            }
        } finally {
            if (disposed) return;
            if (seq === dueSeq) {
                dueLoading = false;
                await restoreViewPosition();
            }
        }
    }

    function applyStatusFilter(event: Event) {
        // Svelte 的自定义 change 处理先于 bind:value，显式读取本次选择。
        statusFilter = (event.currentTarget as HTMLSelectElement).value as typeof statusFilter;
        page = 1;
        resetScrollPosition();
        selected = [];
        void onStatusChange();
    }

    function applyCardTypeFilter(event: Event) {
        cardTypeFilter = (event.currentTarget as HTMLSelectElement).value as typeof cardTypeFilter;
        selected = [];
        resetScrollPosition();
    }

    function toggleLeechFilter() {
        leechOnly = !leechOnly;
        selected = [];
        page = 1;
        resetScrollPosition();
        void load();
    }

    function toggleStarredFilter() {
        starredOnly = !starredOnly;
        selected = [];
        page = 1;
        resetScrollPosition();
        void load();
    }

    function clearFilters() {
        if (filterTimer) {
            clearTimeout(filterTimer);
            filterTimer = null;
        }
        filterDirty = false;
        filterText = "";
        deferredFilter = "";
        statusFilter = "all";
        cardTypeFilter = "all";
        sortMode = "default";
        pickedSaved = "";
        leechOnly = false;
        starredOnly = false;
        selected = [];
        page = 1;
        resetScrollPosition();
        // 使尚未完成的到期查询失效，避免旧结果重新打开到期过滤。
        dueSeq += 1;
        dueLoading = false;
        dueError = "";
        dueSet = new Set();
        void load();
    }

    /** 选中卡导出 CSV（274）：blockID,路径,内容（引号转义，BOM 便于 Excel） */
    function exportSelected() {
        if (selected.length === 0) { return; }
        const picked = blocks.filter(b => selected.includes(b.id));
        const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
        const rows = ["blockID,path,content"];
        for (const b of picked) {
            rows.push(`${b.id},${esc((b.hPath as string) ?? "")},${esc(stripHtml(b.content))}`);
        }
        const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lv-cards-selected-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /** W3：选中卡导出 Obsidian SR markdown（qa→「问 :: 答 #flashcards」；多挖空/无标记→cloze 原样） */
    function exportObsidianSr() {
        if (selected.length === 0) { return; }
        const picked = blocks.filter(b => selected.includes(b.id));
        const lines = picked.map(b => srExportLine(stripHtml(b.content)));
        const md = composeSrExport(lines);
        const blob = new Blob([md], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lv-cards-obsidian-${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showMessage(t.manager.obExportDone.replace("${n}", String(lines.filter(l => l.kind === "qa").length)).replace("${c}", String(lines.filter(l => l.kind === "cloze").length)), 2500, "info");
    }

    function batchRemove() {
        if (selected.length === 0 || batchBusy) return;
        const blockIDs = [...selected];
        confirmDialog({
            title: t.manager.batchRemove,
            content: `<div class="b3-typography">${t.manager.batchConfirm.replace("${n}", String(selected.length))}</div>`,
            confirm: async () => {
                if (batchBusy) return;
                const count = blockIDs.length;
                batchBusy = "remove";
                batchError = "";
                try {
                    const targetDeckID = deckScope?.id ?? "";
                    await removeRiffCards(targetDeckID, blockIDs);
                    if (ctx.detachCards) {
                        await ctx.detachCards(blockIDs);
                    }
                    invalidateDueCache(); // AT-4：删卡改变到期数
                    selected = [];
                    showMessage(t.manager.batchDone.replace("${n}", String(count)), 2000, "info");
                    await load();
                } catch (e: any) {
                    batchError = friendlyError(e, t);
                    showMessage(batchError, 3500, "error");
                } finally {
                    batchBusy = null;
                }
            },
        });
    }

    function batchReset() {
        if (selected.length === 0 || batchBusy) return;
        const blockIDs = [...selected];
        confirmDialog({
            title: t.manager.batchReset,
            content: `<div class="b3-typography">${t.manager.batchConfirm.replace("${n}", String(selected.length))}</div>`,
            confirm: async () => {
                if (batchBusy) return;
                const count = blockIDs.length;
                batchBusy = "reset";
                batchError = "";
                try {
                    // 🧪 type="0" + blockIDs 的块级重置语义待 docs/18 实测
                    await resetRiffCards("0", "", "", blockIDs);
                    invalidateDueCache(); // AT-4：重置调度数据改变到期数
                    selected = [];
                    showMessage(t.manager.batchResetDone.replace("${n}", String(count)), 2000, "info");
                    await load();
                } catch (e: any) {
                    batchError = friendlyError(e, t);
                    showMessage(batchError, 3500, "error");
                } finally {
                    batchBusy = null;
                }
            },
        });
    }

    let showDeckModal = $state(false);
    let modalMode = $state<"add" | "move">("add");
    let availableDecks = $state<RiffDeck[]>([]);
    let selectedDeckId = $state("");
    let newDeckNameInput = $state("");
    let deckActionBusy = $state(false);

    async function openBatchDeckModal(mode: "add" | "move") {
        if (selected.length === 0 || batchBusy !== null) return;
        modalMode = mode;
        selectedDeckId = "";
        newDeckNameInput = "";
        try {
            availableDecks = (await getRiffDecks?.()) ?? [];
            if (availableDecks.length > 0) {
                const firstOther = availableDecks.find(d => d.id !== deckScope?.id) ?? availableDecks[0];
                selectedDeckId = firstOther.id;
            }
            showDeckModal = true;
        } catch (e: any) {
            showMessage(friendlyError(e, t), 3000, "error");
        }
    }

    async function submitBatchDeckAction() {
        if (deckActionBusy || selected.length === 0) return;
        let targetDeckId = selectedDeckId;
        let targetDeckName = "";

        if (newDeckNameInput.trim()) {
            try {
                deckActionBusy = true;
                const created = (await createRiffDeck?.(newDeckNameInput.trim())) as any;
                targetDeckId = created?.id ?? created?.deck?.id ?? "";
                targetDeckName = newDeckNameInput.trim();
            } catch (e: any) {
                deckActionBusy = false;
                showMessage(friendlyError(e, t), 3500, "error");
                return;
            }
        } else {
            const found = availableDecks.find(d => d.id === targetDeckId);
            targetDeckName = found?.name ?? targetDeckId;
        }

        if (!targetDeckId) {
            showMessage(t.deckPickerNeedDeck ?? "请选择或新建目标卡组", 2500, "info");
            return;
        }

        deckActionBusy = true;
        batchError = "";
        const blockIDs = [...selected];
        try {
            await addRiffCards(targetDeckId, blockIDs);
            if (modalMode === "move" && deckScope?.id && deckScope.id !== targetDeckId) {
                await removeRiffCards(deckScope.id, blockIDs);
            }
            invalidateDueCache();
            const doneMsg = modalMode === "move"
                ? (t.manager.batchMoveDone ?? "已将 ${n} 张卡片移动至卡组「${deck}」").replace("${n}", String(blockIDs.length)).replace("${deck}", targetDeckName)
                : (t.manager.batchAddDone ?? "已将 ${n} 张卡片加入卡组「${deck}」").replace("${n}", String(blockIDs.length)).replace("${deck}", targetDeckName);
            showMessage(doneMsg, 2500, "info");
            selected = [];
            showDeckModal = false;
            await load();
        } catch (e: any) {
            batchError = friendlyError(e, t);
            showMessage(batchError, 3500, "error");
        } finally {
            deckActionBusy = false;
        }
    }

    /** 键盘快捷删除当前焦点卡片；删除后把焦点留在相邻卡片，避免回到页面顶部。 */
    function removeOne(b: SearchBlock, rowIndex: number) {
        if (batchBusy) return;
        confirmDialog({
            title: t.manager.deleteCard,
            content: `<div class="b3-typography">${t.manager.deleteConfirm}</div>`,
            confirm: async () => {
                if (batchBusy) return;
                batchBusy = "remove";
                batchError = "";
                try {
                    await removeRiffCards("", [b.id]);
                    if (ctx.detachCards) {
                        await ctx.detachCards([b.id]);
                    }
                    invalidateDueCache();
                    showMessage(t.manager.deleteDone, 2000, "info");
                    await load();
                    if (page > pageCount) {
                        page = pageCount;
                        await load();
                    }
                    await tick();
                    focusRowAt(Math.min(rowIndex, filteredBlocks.length - 1));
                } catch (e: any) {
                    batchError = friendlyError(e, t);
                    showMessage(batchError, 3500, "error");
                } finally {
                    batchBusy = null;
                }
            },
        });
    }

    function focusRowAt(index: number) {
        if (index < 0) return;
        const rows = Array.from(document.querySelectorAll<HTMLElement>(".lv-list .lv-row-main"));
        rows[index]?.focus({ preventScroll: true });
    }

    function onRowKeydown(event: KeyboardEvent, b: SearchBlock, rowIndex: number) {
        // 仅处理无修饰键的列表导航，避免抢占浏览器/宿主的组合快捷键。
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            focusRowAt(rowIndex + (event.key === "ArrowUp" ? -1 : 1));
        } else if (event.key === "Enter") {
            event.preventDefault();
            openDetail(b);
        } else if (event.key === "Delete") {
            event.preventDefault();
            removeOne(b, rowIndex);
        }
    }

    function escapeHtmlText(str: string): string {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function highlightSearchHit(text: string, query: string): string {
        const clean = text || "";
        const q = query.trim();
        if (!q) return escapeHtmlText(clean);
        const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const parts = clean.split(new RegExp(`(${escapedQuery})`, "gi"));
        return parts.map(part => {
            if (part.toLowerCase() === q.toLowerCase()) {
                return `<mark class="lv-search-hit">${escapeHtmlText(part)}</mark>`;
            }
            return escapeHtmlText(part);
        }).join("");
    }

    function openDetail(b: SearchBlock) {
        detailRequestSeq += 1;
        detail = b;
        // BK-2：详情打开时载入该块的关系视图（本地镜像，增删后经 ctx 刷新）
        detailRelations = ctx.relationsOfBlock?.(b.id) ?? [];
        detailKo = ctx.ko ? ctx.ko.snapshot(b.id) : null;
        detailVersions = ctx.contentVersionsOf?.(b.id) ?? [];
        // BI-5：详情打开时载入内容状态快照（null=未开档）
        detailLc = ctx.lc ? ctx.lc.snapshot(b.id) : null;
    }

    // 维护页可以在管理器已挂载时再次请求定点打开；监听上下文变化，避免只在首次加载时处理。
    $effect(() => {
        const targetID = ctx.initialBlockID?.trim();
        if (!targetID) {
            initialDetailOpened = "";
            return;
        }
        if (targetID === initialDetailOpened) return;
        initialDetailOpened = targetID;
        const seq = ++detailRequestSeq;
        let cancelled = false;
        void (async () => {
            try {
                let target = (await getRiffCardsByBlockIDs([targetID])).blocks?.find(b => b.id === targetID)
                    ?? blocks.find(b => b.id === targetID);
                if (!target && ctx.blockContent) {
                    const md = await ctx.blockContent(targetID);
                    if (md !== null) {
                        target = { id: targetID, content: md } as SearchBlock;
                    }
                }
                if (!cancelled && seq === detailRequestSeq) {
                    if (target) {
                        openDetail(target);
                    } else {
                        showMessage(t.manager?.cardNotFound ?? "未找到对应卡片，可能已被移出卡组", 2500, "info");
                    }
                }
            } catch {
                // 定点详情失败不影响管理器列表；列表错误仍由本次 load 负责呈现。
            } finally {
                if (!cancelled) ctx.onInitialBlockConsumed?.();
            }
        })();
        return () => { cancelled = true; };
    });

    async function handleCardDetailSaved(blockID: string) {
        if (!blockID) return;
        // 详情编辑成功后：即时更新本地 detail 与 blocks 列表项，杜绝关抽屉后看到旧内容的感知脱节
        if (ctx.blockContent) {
            try {
                const latestMd = await ctx.blockContent(blockID);
                if (latestMd !== null) {
                    if (detail && detail.id === blockID) {
                        detail = { ...detail, content: latestMd };
                    }
                    const targetIdx = blocks.findIndex(b => b.id === blockID);
                    if (targetIdx >= 0) {
                        blocks[targetIdx] = { ...blocks[targetIdx], content: latestMd };
                    }
                }
            } catch {
                // 非致命刷新
            }
        }
        await ctx.onCardContentSaved?.(blockID);
        if (detail?.id === blockID) {
            detailVersions = ctx.contentVersionsOf?.(blockID) ?? [];
        }
    }

    function openDoc(block: SearchBlock) {
        try {
            openTab({ app: ctx.app, doc: { id: block.id, zoomIn: false } });
        } catch (e: unknown) {
            showMessage(friendlyError(e, t), 2500, "error");
        }
    }

    onMount(() => {
        savedList = ctx.savedFilters();
        // BI-17：返回卡库时恢复筛选、排序、页码、滚动位置和最后焦点。
        const v = parseManagerView(ctx.view?.initial ?? undefined);
        if (v) {
            filterText = v.filter;
            deferredFilter = v.filter;
            sortMode = v.sort as typeof sortMode;
            leechOnly = v.leechOnly;
            starredOnly = v.starredOnly === true;
            statusFilter = v.status as typeof statusFilter;
            page = v.page;
            restoreScrollTop = v.scrollTop;
            restoreFocusId = v.focusId;
            liveScrollTop = v.scrollTop;
            focusedControlId = v.focusId;
            restorePositionOnLoad = true;
        }
        viewReady = true;
        if (statusFilter === "due") void onStatusChange();
        else void load();
        // 同步/其他窗口写入后，当前管理器保持筛选和页签位置但重读卡片快照。
        const offStores = ctx.onStoresChanged?.(() => {
            if (storesChangedTimer) clearTimeout(storesChangedTimer);
            storesChangedTimer = setTimeout(() => {
                storesChangedTimer = null;
                void load();
                if (statusFilter === "due") void onStatusChange();
            }, 180);
        });
        const offReviewed = ctx.onReviewed?.(() => {
            if (storesChangedTimer) clearTimeout(storesChangedTimer);
            storesChangedTimer = setTimeout(() => {
                storesChangedTimer = null;
                void load();
                if (statusFilter === "due") void onStatusChange();
            }, 180);
        });
        return () => {
            disposed = true;
            offStores?.();
            offReviewed?.();
            if (viewSaveTimer) {
                clearTimeout(viewSaveTimer);
                viewSaveTimer = null;
            }
            if (viewReady) ctx.view?.save(serializeView());
            if (storesChangedTimer) {
                clearTimeout(storesChangedTimer);
                storesChangedTimer = null;
            }
            if (filterTimer) {
                clearTimeout(filterTimer);
                filterTimer = null;
            }
        };
    });

    // BI-17：视图变化即持久化（经 scheduleViewSave 防抖排队，避免高频输入与滚动瞬时写盘）
    $effect(() => {
        void [filterText, sortMode, leechOnly, statusFilter, page];
        if (viewReady) scheduleViewSave();
    });

    function saveCurrent() {
        if (!filterText.trim()) {
            return;
        }
        ctx.saveFilter(filterText.trim(), filterText.trim());
        savedList = ctx.savedFilters();
        pickedSaved = filterText.trim();
        showMessage(t.manager.filterSaved, 1500, "info");
    }

    function applySaved() {
        const f = savedList.find(x => x.name === pickedSaved);
        if (f) {
            filterText = f.filter;
            selected = [];
            filterDirty = true;
        }
    }

    function deleteSaved() {
        if (!pickedSaved) return;
        const name = pickedSaved;
        confirmDialog({
            title: t.manager.deleteSaved,
            content: `<div class="b3-typography">${t.manager.deleteSavedConfirm ?? "确定删除已保存的筛选？此操作不可撤销。"}</div>`,
            confirm: () => {
                ctx.deleteFilter(name);
                savedList = ctx.savedFilters();
                if (pickedSaved === name) pickedSaved = "";
            },
        });
    }

    function onWindowKeydown(e: KeyboardEvent) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
        if (e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f")) {
            e.preventDefault();
            const input = document.getElementById("lv-manager-filter") as HTMLInputElement | null;
            input?.focus();
            input?.select();
        } else if (e.key === "r" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (!loading && batchBusy === null) {
                e.preventDefault();
                void load();
            }
        }
    }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<LvPage
    pageId="lv-manager-page"
    onscroll={capturePageScroll}
    onfocusin={capturePageFocus}
    eyebrow="OBJECT / MAINTAIN"
    title={t.manager.title}
    subtitle={t.manager.scopeNote}
>
    {#snippet actions()}
        <div class="lv-filter-wrap">
            <input
                id="lv-manager-filter"
                class="b3-text-field lv-filter"
                type="text"
                aria-label={t.manager.filterLabel}
                title={`${t.manager.filterPlaceholder} (/)`}
                aria-keyshortcuts="/"
                placeholder={t.manager.filterPlaceholder}
                spellcheck="false"
                autocomplete="off"
                bind:value={filterText}
                oninput={() => { selected = []; filterDirty = true; }}
                onkeydown={(e) => { if (e.key === "Escape" && filterText) { e.stopPropagation(); filterText = ""; selected = []; filterDirty = true; } }}
            />
            {#if filterText}
                <button
                    type="button"
                    class="lv-filter-clear"
                    aria-label={t.manager.clearSearch ?? "清空搜索"}
                    onclick={() => { filterText = ""; selected = []; filterDirty = true; }}
                ><LvIcon name="close" size={12} /></button>
            {/if}
        </div>
        <button
            type="button"
            class="b3-button b3-button--small b3-button--outline lv-btn-tool lv-mgr-filter-toggle"
            class:lv-mgr-filter-toggle--active={mobileFiltersOpen || activeSecondaryFilterCount > 0}
            aria-expanded={mobileFiltersOpen}
            aria-controls="lv-mgr-filters-panel"
            onclick={() => (mobileFiltersOpen = !mobileFiltersOpen)}
        >
            <span>筛选{activeSecondaryFilterCount > 0 ? ` (${activeSecondaryFilterCount})` : ""}</span>
            <span aria-hidden="true">{mobileFiltersOpen ? "▴" : "▾"}</span>
        </button>
        <button
            class="b3-button b3-button--small b3-button--outline lv-btn-tool lv-mgr-refresh-btn"
            disabled={loading || batchBusy !== null}
            title={`${loading ? t.dashboard.loading : t.dashboard.refresh} (r)`}
            aria-keyshortcuts="r"
            onclick={load}
        >
            <LvIcon name="refresh" size={13} />
            <span class="lv-mgr-refresh-label">{loading ? t.dashboard.loading : t.dashboard.refresh}</span>
        </button>
    {/snippet}

    <!-- T-管理器 R53 工具行：排序/筛选/保存独立于页头搜索；窄屏默认折叠进面板 -->
    <div class="lv-mgr-toolbar">
        <div id="lv-mgr-filters-panel" class="lv-mgr-filters-panel" class:is-open={mobileFiltersOpen}>
        {#if filterText}
            <button class="b3-button b3-button--small lv-btn-ghost" title={t.manager.saveFilter} disabled={!filterText.trim()} onclick={saveCurrent}><LvIcon name="star" size={15} /> {t.manager.saveFilter}</button>
        {/if}
        {#if savedList.length > 0 || filterText}
            <select class="b3-select lv-sort" bind:value={pickedSaved} onchange={applySaved} aria-label={t.manager.savedFilters}>
                <option value="" disabled>{t.manager.savedFilters}</option>
                {#each savedList as f (f.name)}<option value={f.name}>{f.name}</option>{/each}
            </select>
            {#if pickedSaved}
                <button class="b3-button b3-button--small lv-btn-ghost" title={t.manager.deleteSaved} aria-label={t.manager.deleteSaved} onclick={deleteSaved}><LvIcon name="ban" size={15} /></button>
            {/if}
        {/if}
        <select
            class="b3-select lv-sort lv-deck-selector"
            value={deckScope?.id ?? ""}
            onchange={onDeckFilterChange}
            title="选择当前卡包范围"
            aria-label="卡包范围"
        >
            <option value="">全部卡包</option>
            {#each availableDecks as d (d.id)}
                <option value={d.id}>{d.name} ({d.size ?? 0})</option>
            {/each}
        </select>
        <select class="b3-select lv-sort" bind:value={sortMode} onchange={() => (selected = [])} title={t.manager.sortLabel} aria-label={t.manager.sortLabel}>
            <option value="default">{t.manager.sortDefault}</option>
            <option value="path">{t.manager.sortPath}</option>
            <option value="content">{t.manager.sortContent}</option>
            <option value="lapses">{t.manager.sortLapses}</option>
        </select>
        <select class="b3-select lv-sort" bind:value={statusFilter} disabled={loading || dueLoading} onchange={applyStatusFilter} title={t.manager.statusLabel} aria-label={t.manager.statusLabel}>
            <option value="all">{t.manager.statusAll}</option>
            <option value="new">{t.manager.statusNew}</option>
            <option value="review">{t.manager.statusReview}</option>
            <option value="due">{t.manager.statusDue}</option>
        </select>
        <select class="b3-select lv-sort" bind:value={cardTypeFilter} onchange={applyCardTypeFilter} title={t.manager.cardTypeFilter ?? "卡型"} aria-label={t.manager.cardTypeFilter ?? "卡型"}>
            <option value="all">{t.manager.cardTypeAll ?? "卡型：全部"}</option>
            <option value="outline-cloze">{t.manager.cardTypeOutlineCloze ?? "卡型：大纲挖空"}</option>
            <option value="superblock">{t.manager.cardTypeSuperBlock ?? "卡型：超级块"}</option>
        </select>
        {#if ctx.uiMode !== "simple"}
            <button
                class="lv-chipbtn"
                class:lv-chipbtn-active={leechOnly}
                title={t.manager.leechFilter}
                onclick={toggleLeechFilter}
            >{t.manager.leechFilter}</button>
            <button
                class="lv-chipbtn"
                class:lv-chipbtn-active={starredOnly}
                title={t.manager.starredFilter ?? "只看星标收藏卡片"}
                onclick={toggleStarredFilter}
            ><LvIcon name="star" size={12} /> {t.manager.starredFilter ?? "星标卡"}</button>
        {/if}
        {#if hasActiveFilters}
            <button
                type="button"
                class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                title="重置全部筛选"
                aria-label="重置全部筛选"
                onclick={clearFilters}
            >
                <LvIcon name="close" size={12} />
                <span>重置</span>
            </button>
        {/if}
        </div>
        <div class="lv-toolbar-right">
            <span class="lv-toolbar-caption">{t.manager.total}: {total}</span>
            {#if filteredBlocks.length > 0}
                <button
                    type="button"
                    class="b3-button b3-button--small b3-button--outline lv-btn-tool lv-select-all-btn"
                    onclick={toggleSelectAll}
                    title={isAllSelected ? (t.manager.unselectAll ?? "取消全选") : (t.manager.selectAll ?? "全选本页")}
                >
                    <LvIcon name="check" size={12} />
                    <span>{isAllSelected ? (t.manager.unselectAll ?? "取消全选") : (t.manager.selectAll ?? "全选本页")}</span>
                </button>
            {/if}
        </div>
    </div>
    {#if deckScope}
        <div class="lv-mgr-deck-scope" role="region" aria-label="当前卡包管理">
            <div class="lv-deck-scope-left">
                {#if ctx.openDecksTab}
                    <button
                        type="button"
                        class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                        onclick={() => ctx.openDecksTab?.()}
                        title="返回卡包管理列表"
                    >
                        <LvIcon name="chevron-left" size={13} />
                        <span>返回卡包列表</span>
                    </button>
                {/if}
                <div class="lv-deck-scope-info" role="status">
                    <span class="lv-deck-scope-icon"><LvIcon name="book" size={15} /></span>
                    <span>{t.manager.deckScopeLabel ?? "当前卡组"}：<strong class="lv-deck-scope-name">{deckScope.name}</strong></span>
                    <span class="ft__smaller ft__on-surface">({total} 张闪卡)</span>
                </div>
            </div>
            <div class="lv-deck-scope-actions">
                {#if ctx.openReviewScope}
                    <button
                        type="button"
                        class="b3-button b3-button--small lv-btn-primary"
                        disabled={total === 0}
                        onclick={() => ctx.openReviewScope?.(`deck:${deckScope.id}`)}
                        title="开始复习本卡包"
                    >
                        <LvIcon name="learn" size={13} />
                        <span>复习本包</span>
                    </button>
                    <button
                        type="button"
                        class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                        disabled={total === 0}
                        onclick={() => ctx.openReviewScope?.(`deck:${deckScope.id}`, true)}
                        title="突击练习本卡包（不计入遗忘）"
                    >
                        <LvIcon name="zap" size={13} />
                        <span>突击</span>
                    </button>
                {/if}
                <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" onclick={clearDeckScope} title="清除卡包限制，查看全库闪卡">
                    <LvIcon name="close" size={12} />
                    <span>{t.manager.deckScopeClear ?? "查看全部卡组"}</span>
                </button>
            </div>
        </div>
    {/if}

    {#if selected.length > 0}
        <div class="lv-glass lv-batchbar">
            <LvChip tone="primary">{t.manager.batchSelected.replace("${n}", String(selected.length))}</LvChip>
            {#if batchError}<span class="lv-batch-error" role="alert" aria-live="assertive">{batchError}</span>{/if}
            <div class="fn__flex-1"></div>
            {#if ctx.uiMode !== "simple"}
                <button class="b3-button b3-button--outline lv-btn-tool" disabled={batchBusy !== null} onclick={() => openBatchDeckModal("add")}>
                    <LvIcon name="plus" size={14} /> <span>{t.manager.batchAddDeck ?? "加入卡组"}</span>
                </button>
                {#if deckScope}
                    <button class="b3-button b3-button--outline lv-btn-tool" disabled={batchBusy !== null} onclick={() => openBatchDeckModal("move")}>
                        <LvIcon name="book" size={14} /> <span>{t.manager.batchMoveDeck ?? "移动到卡组"}</span>
                    </button>
                {/if}
                <button class="b3-button b3-button--outline lv-btn-tool" disabled={batchBusy !== null} onclick={exportSelected}><LvIcon name="book" size={14} /> <span>{t.manager.exportCsv}</span></button>
                <!-- W3：导出 Obsidian SR markdown（qa/挖空自动分型；可用我们的导入器回导） -->
                <button class="b3-button b3-button--outline lv-btn-tool" disabled={batchBusy !== null} title={t.manager.obExportHint} onclick={exportObsidianSr}><LvIcon name="cards" size={14} /> <span>{t.manager.obExport}</span></button>
                <button class="b3-button b3-button--outline lv-btn-tool" disabled={batchBusy !== null} onclick={batchReset}><LvIcon name="refresh" size={14} /> <span>{batchBusy === "reset" ? t.dashboard.loading : t.manager.batchReset}</span></button>
            {/if}
            <button class="b3-button b3-button--outline lv-btn-tool lv-menu-danger" disabled={batchBusy !== null} onclick={batchRemove}><LvIcon name="trash" size={14} /> <span>{batchBusy === "remove" ? t.dashboard.loading : t.manager.batchRemove}</span></button>
            <button class="b3-button b3-button--small b3-button--outline lv-btn-tool" disabled={batchBusy !== null} onclick={() => (selected = [])}><span>{t.manager.batchCancel}</span></button>
        </div>
    {/if}

    {#if showDeckModal}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="lv-modal-backdrop" onclick={(e) => { if (e.target === e.currentTarget) showDeckModal = false; }} role="presentation">
            <div class="lv-deck-modal lv-card2 b3-typography" role="dialog" aria-modal="true" aria-labelledby="lv-deck-modal-title" use:trapFocus={{ onEscape: () => { showDeckModal = false; } }}>
                <div class="lv-deck-modal-head">
                <span id="lv-deck-modal-title" style="font-weight: var(--lv-fw-bold); font-size: var(--lv-type-label-size)">
                    {modalMode === "move" ? (t.manager.batchMoveDeck ?? "移动卡片至目标卡组") : (t.manager.batchAddDeck ?? "添加卡片至目标卡组")}
                </span>
                <button type="button" class="b3-button b3-button--small b3-button--outline lv-btn-tool" aria-label={t.common?.close ?? "关闭"} onclick={() => (showDeckModal = false)}><LvIcon name="close" size={13} /></button>
            </div>
            <p class="ft__smaller ft__on-surface" style="margin: var(--lv-sp-2) 0">
                {modalMode === "move"
                    ? (t.manager.batchMovePrompt ?? `将已选的 ${selected.length} 张卡片从当前卡组移出，并加入新卡组：`)
                    : (t.manager.batchAddPrompt ?? `将已选的 ${selected.length} 张卡片加入目标卡组：`)}
            </p>
            <div style="margin-bottom: var(--lv-sp-2)">
                <div class="ft__smaller" style="margin-bottom: calc(var(--lv-space-unit) * 2); color: var(--lv-color-text-muted)">{t.deckPickerTitle ?? "选择已有卡组"}</div>
                <select class="b3-select fn__block" bind:value={selectedDeckId} disabled={deckActionBusy || availableDecks.length === 0}>
                    {#each availableDecks as d (d.id)}
                        <option value={d.id}>{d.name}</option>
                    {/each}
                </select>
            </div>
            <div style="margin-bottom: var(--lv-sp-4)">
                <div class="ft__smaller" style="margin-bottom: calc(var(--lv-space-unit) * 2); color: var(--lv-color-text-muted)">{t.deckNewName ?? "或新建卡组"}</div>
                <input
                    class="b3-text-field fn__block"
                    placeholder={t.deckNewName ?? "输入新卡组名称"}
                    bind:value={newDeckNameInput}
                    disabled={deckActionBusy}
                    onkeydown={(e) => {
                        if (e.key === "Enter" && !deckActionBusy && newDeckNameInput.trim()) {
                            e.preventDefault();
                            submitBatchDeckAction();
                        }
                    }}
                />
            </div>
            <div class="fn__flex" style="justify-content: flex-end; gap: var(--lv-sp-2)">
                <button class="b3-button b3-button--cancel" disabled={deckActionBusy} onclick={() => (showDeckModal = false)}>{window.siyuan.languages.cancel}</button>
                <button class="b3-button lv-btn-primary" disabled={deckActionBusy} onclick={submitBatchDeckAction}>
                    {deckActionBusy ? "…" : (window.siyuan.languages.confirm ?? "确认")}
                </button>
            </div>
        </div>
        </div>
    {/if}

    {#if loading}
        <div class="lv-card2 lv-loading">
            <LvSkeleton shape="row" count={4} height={44} />
        </div>
    {:else if errorMsg}
        <LvError message={errorMsg} onretry={load} retryLabel={t.dashboard.refresh} />
    {:else if dueError}
        <LvError message={dueError} onretry={() => { void onStatusChange(); }} retryLabel={t.dashboard.refresh} />
    {:else if filteredBlocks.length === 0}
        {#if filterText || statusFilter !== "all" || leechOnly}
            <LvEmpty
                text={t.manager.filterEmptyCurrentPage ?? "当前页无匹配项，筛选仅作用于已加载页。 / No matches on this page; filters apply only to the loaded page."}
                actionLabel={t.manager.filterClear}
                onaction={clearFilters}
            />
        {:else}
            <!-- 宿主未提供上手入口时不渲染看似可点但无动作的按钮。 -->
            <LvEmpty
                text={t.manager.empty}
                actionLabel={ctx.openOnboarding ? t.dashboard.onboardingStart : ""}
                onaction={ctx.openOnboarding ? () => ctx.openOnboarding!() : undefined}
            />
        {/if}
        {#if pageCount > 1}
            <div class="lv-mgr-pager">
                <button class="b3-button b3-button--outline b3-button--small lv-btn-tool" disabled={page <= 1} onclick={() => goto(page - 1)}><LvIcon name="chevron-left" size={12} /> <span>{t.manager.prev}</span></button>
                <span class="lv-pager">{page} / {pageCount}</span>
                <button class="b3-button b3-button--outline b3-button--small lv-btn-tool" disabled={page >= pageCount} onclick={() => goto(page + 1)}><span>{t.manager.next}</span> <LvIcon name="chevron-right" size={12} /></button>
            </div>
        {/if}
    {:else}
        <div class="lv-list" role="list" aria-label={t.manager.title}>
            {#each filteredBlocks as b, rowIndex (b.id)}
                <div
                    class="lv-row"
                    class:lv-row--selected={selected.includes(b.id)}
                    role="listitem"
                >
                    <input
                        type="checkbox"
                        class="lv-check"
                        aria-label={(t.manager.selectCard ?? "Select card ${id}").replace("${id}", b.id)}
                        checked={selected.includes(b.id)}
                        onclick={(e: Event) => { e.stopPropagation(); toggleSelect(b.id); }}
                    />
                    <button
                        type="button"
                        class="lv-row-main"
                        id={`lv-manager-card-${encodeURIComponent(b.id)}`}
                        data-manager-card-id
                        aria-label={stripHtml(b.content) || t.manager.emptyContentFallback}
                        aria-keyshortcuts="ArrowUp ArrowDown Delete Enter"
                        disabled={batchBusy !== null}
                        onclick={() => openDetail(b)}
                        onkeydown={(event) => onRowKeydown(event, b, rowIndex)}
                    >
                        <span class="lv-content">
                            <span class="lv-text" title={stripHtml(b.content) || t.manager.emptyContentFallback}>{@html highlightSearchHit(stripHtml(b.content) || t.manager.emptyContentFallback, deferredFilter)}</span>
                            <span class="lv-meta ft__smaller ft__on-surface">
                                {#if (ctx.getStarredCardIDs?.() ?? []).includes(b.id)}
                                    <span class="lv-chip2 lv-chip2--warn" title="星标重点卡"><LvIcon name="star" size={11} /> 星标</span>
                                {/if}
                                {#if !stripHtml(b.content)}
                                    <span class="lv-chip2 lv-chip2--error" title="原笔记块内容为空或已丢失"><LvIcon name="warning" size={11} /> 内容缺失</span>
                                {/if}
                                {#if ctx.isNewBlock(b.id)}
                                    <span class="lv-chip2 lv-chip2--primary">{t.manager.statusNew ?? "新"}</span>
                                {:else if dueSet.has(b.id)}
                                    <span class="lv-chip2 lv-chip2--default">{t.manager.statusDue ?? "到期"}</span>
                                {/if}
                                {#if (lapsesMap[b.id] ?? 0) >= 4}
                                    <span class="lv-chip2 lv-chip2--warn" title={`已遗忘 ${lapsesMap[b.id]} 次`}><LvIcon name="warning" size={14} /> {lapsesMap[b.id]}</span>
                                {/if}
                                <span>{b.hPath ?? ""} {b.name ? "· " + b.name : ""}</span>
                            </span>
                        </span>
                        <span class="lv-arrow" aria-hidden="true"><LvIcon name="chevron-right" size={12} /></span>
                    </button>
                    {#if ctx.toggleStarCard}
                        <button
                            type="button"
                            class="b3-button b3-button--small lv-btn-ghost lv-mgr-star-btn"
                            class:lv-btn-starred={(ctx.getStarredCardIDs?.() ?? []).includes(b.id)}
                            title={(ctx.getStarredCardIDs?.() ?? []).includes(b.id) ? "取消星标" : "加入星标重点"}
                            aria-label={(ctx.getStarredCardIDs?.() ?? []).includes(b.id) ? "取消星标" : "加入星标重点"}
                            aria-pressed={(ctx.getStarredCardIDs?.() ?? []).includes(b.id)}
                            disabled={starTogglingSet.has(b.id)}
                            onclick={async (e) => {
                                e.stopPropagation();
                                if (starTogglingSet.has(b.id)) return;
                                if (ctx.toggleStarCard) {
                                    starTogglingSet.add(b.id);
                                    try {
                                        await ctx.toggleStarCard(b.id);
                                    } finally {
                                        starTogglingSet.delete(b.id);
                                    }
                                }
                            }}
                        >
                            <LvIcon name="star" size={13} />
                        </button>
                    {/if}
                    <button
                        type="button"
                        class="b3-button b3-button--small b3-button--outline lv-btn-tool"
                        title={t.manager.copyRef ?? "复制块引用 ((id '内容'))"}
                        onclick={async (e: Event) => {
                            e.stopPropagation();
                            const cleanText = (stripHtml(b.content) || "闪卡").slice(0, 30);
                            const text = `(( ${b.id} "${cleanText}" ))`;
                            try {
                                await navigator.clipboard.writeText(text);
                                showMessage(t.manager.copyRefSuccess ?? "已复制块引用到剪贴板", 2000, "info");
                            } catch {
                                showMessage("复制失败", 2000, "error");
                            }
                        }}
                    >
                        <LvIcon name="book" size={12} />
                        <span>{t.manager.copyRef ?? "复制块引"}</span>
                    </button>
                    <button class="b3-button b3-button--small" onclick={(e: Event) => { e.stopPropagation(); openDoc(b); }}><LvIcon name="target" size={12} /> {t.manager.openDoc}</button>
                </div>
            {/each}
        </div>
        <!-- T-管理器 R53：分页在列表底部 -->
        {#if pageCount > 1}
            <div class="lv-mgr-pager">
                <button class="b3-button b3-button--outline b3-button--small lv-btn-tool" disabled={page <= 1} onclick={() => goto(page - 1)}><LvIcon name="chevron-left" size={12} /> <span>{t.manager.prev}</span></button>
                <span class="lv-pager">{page} / {pageCount}</span>
                <button class="b3-button b3-button--outline b3-button--small lv-btn-tool" disabled={page >= pageCount} onclick={() => goto(page + 1)}><span>{t.manager.next}</span> <LvIcon name="chevron-right" size={12} /></button>
            </div>
        {/if}
    {/if}
</LvPage>

{#if detail}
    {#key detail.id}
    <CardDetail
        block={detail}
        t={detailT}
        onOpenDoc={() => openDoc(detail!)}
        onClose={() => { detailRequestSeq += 1; detail = null; }}
        historyEntries={ctx.getBlockHistory?.(detail!.id) ?? []}
        issues={ctx.getBlockIssues?.(detail!.id) ?? []}
        versions={detailVersions}
        acceptVersion={ctx.acceptContentAt ? async (at) => {
            const blockID = detail?.id;
            if (!blockID) return;
            await ctx.acceptContentAt!(blockID, at);
            if (detail?.id === blockID) detailVersions = ctx.contentVersionsOf?.(blockID) ?? [];
        } : undefined}
        lcCtx={ctx.lc ? {
            snapshot: detailLc,
            onopen: async () => {
                const blockID = detail?.id;
                if (!blockID) return;
                await ctx.lc!.open(blockID);
                if (detail?.id === blockID) detailLc = ctx.lc!.snapshot(blockID);
            },
            ontransition: async (to, reason) => {
                const blockID = detail?.id;
                if (!blockID) return false;
                const ok = await ctx.lc!.transition(blockID, to, reason);
                if (detail?.id === blockID) detailLc = ctx.lc!.snapshot(blockID);
                return ok;
            },
            // BI-6：建议动作 → 经理页真实入口（建议可跳过，点击才执行；无隐式写入）
            onaction: (action) => {
                const b = detail;
                if (!b) return;
                if (action === "openSource" || action === "explain" || action === "revise") {
                    // 经理页无独立解释/修订入口，统一回落原文（阅读理解与修订都在编辑器完成）
                    openDoc(b);
                } else if (action === "makeCards") {
                    ctx.lc!.makeCards(b.id, b.content ?? "");
                } else if (action === "formalReview") {
                    ctx.lc!.openReview(false, b.id);
                } else if (action === "practice") {
                    ctx.lc!.openReview(true, b.id);
                } else if (action === "wrapUp") {
                    detail = null;
                }
            },
        } : undefined}
        relationsCtx={ctx.relationsOfBlock ? {
            relations: detailRelations,
            onadd: async (f, to, ty) => {
                await ctx.addRelation?.(f, to, ty);
                const blockID = detail?.id;
                if (blockID) detailRelations = ctx.relationsOfBlock?.(blockID) ?? [];
            },
            onremove: async (f, to, ty) => {
                const blockID = detail?.id;
                if (!blockID) return;
                await ctx.removeRelation?.(f, to, ty);
                if (detail?.id === blockID) detailRelations = ctx.relationsOfBlock?.(blockID) ?? [];
            },
        } : undefined}
        koCtx={ctx.ko ? {
            snapshot: detailKo ?? { registered: false, fact: "", instances: [] },
            deriving: false,
            onregister: async () => {
                const blockID = detail?.id;
                if (!blockID) return;
                await ctx.ko?.register(blockID, detail?.content ?? "");
                if (detail?.id === blockID) detailKo = ctx.ko!.snapshot(blockID);
            },
            ontoggle: async (cardID, disabled) => {
                const blockID = detail?.id;
                if (!blockID) return;
                await ctx.ko?.toggle(blockID, cardID, disabled);
                if (detail?.id === blockID) detailKo = ctx.ko!.snapshot(blockID);
            },
            onremove: async (cardID) => {
                const blockID = detail?.id;
                if (!blockID) return;
                await ctx.ko?.remove(blockID, cardID);
                if (detail?.id === blockID) detailKo = ctx.ko!.snapshot(blockID);
            },
        } : undefined}
        editorCtx={ctx.blockContent && ctx.saveBlockContent ? {
            load: () => ctx.blockContent!(detail!.id),
            save: (md) => ctx.saveBlockContent!(detail!.id, md),
        } : undefined}
        onSaved={handleCardDetailSaved}
    />
    {/key}
{/if}

<style lang="scss">
    .b3-button {
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;

        &:focus-visible {
            outline: none;
            box-shadow: var(--lv-focus-ring);
        }
    }
    .lv-toolbar-right {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: var(--lv-sp-2);
        flex-shrink: 0;
    }
    .lv-select-all-btn {
        border-radius: var(--lv-r-pill);
        padding: calc(var(--lv-space-unit) * 1) calc(var(--lv-space-unit) * 5);
        font-size: var(--lv-type-meta-size);
        font-weight: var(--lv-fw-semibold);
        color: var(--lv-color-brand);
        border-color: var(--lv-primary-border);
        white-space: nowrap;
        &:hover {
            background: var(--lv-primary-soft);
        }
    }
    .lv-filter-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;

        .lv-filter {
            padding-right: calc(var(--lv-space-unit) * 7);
        }
    }
    .lv-filter-clear {
        position: absolute;
        right: calc(var(--lv-space-unit) * 3);
        width: 18px;
        height: 18px;
        border: 0;
        border-radius: var(--lv-r-circle);
        background: color-mix(in srgb, var(--lv-color-text) 12%, transparent);
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-caption-size);
        display: grid;
        place-items: center;
        cursor: pointer;
        transition: background var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease);

        &:hover {
            background: color-mix(in srgb, var(--lv-color-text) 22%, transparent);
            color: var(--lv-color-text);
        }
    }
    .lv-filter {
        width: min(100%, 280px);
        height: 38px;
        min-height: 38px;
        line-height: var(--lv-lh-control-lg);
        border-radius: var(--lv-r-pill);
        padding: calc(var(--lv-space-unit) * 4) var(--lv-sp-4) calc(var(--lv-space-unit) * 4) calc(var(--lv-space-unit) * 7);
        border: 1px solid var(--lv-border);
        background: var(--lv-color-surface);
        box-sizing: border-box;
        box-shadow: var(--lv-shadow-1);
        transition: border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-2) var(--lv-ease);
        &:focus-visible,
        &:focus {
            outline: none;
            border-color: var(--lv-color-brand);
            box-shadow: var(--lv-focus-ring);
        }
    }
    .lv-pager { font-size: var(--lv-type-control-size); color: var(--lv-color-text-muted); font-variant-numeric: tabular-nums; }
    .lv-loading {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);
    }

    .lv-deck-modal {
        position: relative;
        z-index: var(--lv-z-modal-card);
        width: min(440px, 92vw);
        padding: var(--lv-sp-4);
        border-radius: var(--lv-r-dialog);
        box-shadow: var(--lv-shadow-3), var(--lv-inset-shine);
        background: var(--lv-color-surface);
        border: 1px solid var(--lv-border);
        animation: lv-modal-pop var(--lv-dur-2) var(--lv-ease);

        #lv-deck-modal-title {
            text-wrap: balance;
        }

        p {
            max-width: 48em;
            text-wrap: pretty;
            line-height: var(--lv-lh-reading, 1.65);
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
    .lv-deck-modal-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-2);
        padding-bottom: var(--lv-sp-2);
        border-bottom: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent);
    }

    .lv-batchbar {
        position: sticky;
        top: var(--lv-sp-2);
        z-index: var(--lv-z-review-peek);
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--lv-sp-2);
        border: 1px solid var(--lv-primary-border);
        border-radius: var(--lv-r-m);
        background: var(--lv-primary-soft);
        box-shadow: var(--lv-shadow-2), var(--lv-inset-shine);
        padding: calc(var(--lv-space-unit) * 3) var(--lv-sp-3);
        margin-bottom: var(--lv-sp-2);
        animation: lv-modal-pop var(--lv-dur-1) var(--lv-ease);

        @supports (backdrop-filter: blur(10px)) or (-webkit-backdrop-filter: blur(10px)) {
            background: color-mix(in srgb, var(--lv-primary-soft) 85%, var(--lv-color-surface));
            backdrop-filter: blur(10px) saturate(1.15);
            -webkit-backdrop-filter: blur(10px) saturate(1.15);
        }
    }
    .lv-batch-error {
        color: var(--lv-color-danger);
        font-size: var(--lv-type-control-size);
        max-width: min(42vw, 420px);
        overflow-wrap: anywhere;
    }
    .lv-check {
        cursor: pointer;
        width: 17px;
        height: 17px;
        accent-color: var(--lv-color-brand);
        flex-shrink: 0;
    }

    /* T-管理器 R53 工具行：排序/筛选独立于页头（与 .lv-list 同级） */
    .lv-mgr-toolbar {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        flex-wrap: wrap;
        margin-bottom: var(--lv-sp-3);

        .lv-sort {
            height: 30px;
            min-height: 30px;
            max-width: 140px;
            font-size: var(--lv-type-control-size);
            border-radius: var(--lv-r-pill);
            border: 1px solid var(--lv-border);
            background-color: var(--lv-color-surface);
            line-height: var(--lv-lh-control-lg);
            padding: calc(var(--lv-space-unit) * 2) calc(var(--lv-space-unit) * 4);
            box-sizing: border-box;
            text-align: center;
            text-align-last: center;
            vertical-align: middle;
            box-shadow: var(--lv-shadow-1);
            cursor: pointer;
            transition: border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-2) var(--lv-ease);

            &:focus-visible,
            &:focus {
                outline: none;
                border-color: var(--lv-color-brand);
                box-shadow: var(--lv-focus-ring);
            }

            option {
                text-align: left;
                line-height: normal;
            }
        }
        .lv-toolbar-caption { margin-left: auto; font-size: 12px; color: var(--lv-color-text-muted); font-variant-numeric: tabular-nums; }
    }
    .lv-mgr-deck-scope {
        display: flex;
        min-width: 0;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-3);
        margin: 0 0 var(--lv-sp-3);
        padding: 8px 14px;
        border-radius: var(--lv-r-m);
        border: 1px solid var(--lv-primary-border);
        background: var(--lv-primary-soft);
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-control-size);
        box-shadow: var(--lv-shadow-1), var(--lv-inset-shine);
        flex-wrap: wrap;

        .lv-deck-scope-left {
            display: flex;
            align-items: center;
            gap: var(--lv-sp-3);
            min-width: 0;
            flex-wrap: wrap;
        }
        .lv-deck-scope-info {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            color: var(--lv-color-text);
        }
        .lv-deck-scope-icon {
            color: var(--lv-color-brand);
            display: inline-flex;
            align-items: center;
        }
        .lv-deck-scope-name {
            font-size: var(--lv-type-body-size);
            font-weight: var(--lv-fw-bold);
            color: var(--lv-color-brand);
        }
        .lv-deck-scope-actions {
            display: inline-flex;
            align-items: center;
            gap: var(--lv-sp-2);
            flex-wrap: wrap;
            margin-left: auto;
        }
    }
    .lv-deck-selector {
        max-width: 170px !important;
        font-weight: 500;
        border-color: color-mix(in srgb, var(--lv-color-brand) 40%, var(--lv-border)) !important;
    }
    .lv-mgr-deck-scope strong { color: var(--lv-color-text); overflow-wrap: anywhere; }

    /* T-管理器 R53 分页：列表底部居中（与 .lv-list 同级） */
    .lv-mgr-pager {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--lv-sp-3);
        margin-top: var(--lv-sp-4);
        padding-top: var(--lv-sp-3);
        border-top: 1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent);
        .lv-pager { font-size: var(--lv-type-control-size); color: var(--lv-color-text-muted); font-variant-numeric: tabular-nums; }
        .b3-button {
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;
            &:focus-visible {
                outline: none;
                box-shadow: var(--lv-focus-ring);
            }
        }
    }

    .lv-list {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);

        .lv-row {
            display: flex; align-items: center; gap: var(--lv-sp-3);
            padding: var(--lv-sp-3) var(--lv-sp-4);
            background: var(--lv-color-surface);
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-l);
            box-shadow: var(--lv-shadow-1);
            content-visibility: auto;
            contain-intrinsic-size: 0 52px;
            transition: transform var(--lv-dur-2) var(--lv-ease),
                border-color var(--lv-dur-2) var(--lv-ease),
                background-color var(--lv-dur-2) var(--lv-ease),
                box-shadow var(--lv-dur-2) var(--lv-ease);
            position: relative;

            &::before {
                content: "";
                position: absolute;
                left: 0; top: 20%; bottom: 20%;
                width: 3px;
                border-radius: var(--lv-r-track);
                background: var(--lv-color-brand);
                opacity: 0;
                transition: opacity var(--lv-dur-2) var(--lv-ease);
            }

            &.lv-row--selected {
                background: color-mix(in srgb, var(--lv-primary-soft) 55%, var(--lv-color-surface));
                border-color: var(--lv-primary-border);
                &::before { opacity: 1; }
            }

            &:hover {
                transform: translateY(-1px);
                border-color: var(--lv-border-strong);
                background: color-mix(in srgb, var(--lv-primary-softer) 40%, var(--lv-color-surface));
                box-shadow: var(--lv-shadow-2);
                &::before { opacity: 1; }
                .lv-arrow { opacity: 1; transform: translateX(0); }
            }

            :global(.lv-search-hit) {
                background: color-mix(in srgb, var(--lv-color-warning) 28%, transparent);
                color: var(--lv-color-text);
                font-weight: var(--lv-fw-semibold);
                border-radius: var(--lv-r-track);
                padding: 0 calc(var(--lv-space-unit) * 1);
            }

            .lv-row-main {
                display: flex;
                align-items: center;
                gap: var(--lv-sp-3);
                flex: 1;
                min-width: 0;
                margin: calc(var(--lv-sp-3) * -1) 0;
                padding: var(--lv-sp-3) 0;
                border: 0;
                background: transparent;
                color: inherit;
                text-align: left;
                cursor: pointer;
                touch-action: manipulation;
                user-select: none;
                -webkit-user-select: none;

                &:focus-visible {
                    outline: none;
                    box-shadow: var(--lv-focus-ring);
                    border-radius: var(--lv-r-s);
                }
            }

            /* span 需块化，否则 overflow:hidden 不生效——窄屏文字会压到行内按钮上 */
            .lv-content { flex: 1; min-width: 0; }
            .lv-text, .lv-meta { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

            .lv-arrow {
                color: var(--lv-color-brand);
                font-size: var(--lv-type-title-size);
                opacity: 0;
                transform: translateX(-4px);
                transition: opacity var(--lv-dur-2) var(--lv-ease), transform var(--lv-dur-2) var(--lv-ease);
            }
        }
    }

    .lv-mgr-filter-toggle {
        display: none;
    }
    .lv-mgr-filters-panel {
        display: contents;
    }

    /* 窄屏工具栏：搜索、筛选和批量动作分行，避免中文按钮互相挤压。 */
    @container lv-hub (max-width: 740px) {
        .lv-filter {
            width: min(100%, 320px);
            flex: 1 1 180px;
        }
        .lv-mgr-toolbar {
            align-items: stretch;
            .lv-sort { flex: 1 1 135px; max-width: none; }
            .lv-chipbtn { flex: 0 1 auto; }
            .lv-toolbar-caption { width: auto; margin-left: 0; }
        }
        .lv-batchbar {
            flex-wrap: nowrap;
            overflow-x: auto;
            max-width: 100%;
            box-sizing: border-box;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
            &::-webkit-scrollbar { display: none; }
            .fn__flex-1 { display: none; }
            > * { flex: 0 0 auto; white-space: nowrap; }
        }
        .lv-row { flex-wrap: wrap; }
    }

    /* Mobile Spec v2：≤560px 默认仅展示单行「搜索框 + [筛选 ▾]」，折叠 4 个 select 与次级筛选，保障卡片列表占屏 ≥ 65% */
    @container lv-hub (max-width: 560px) {
        :global(#lv-manager-page .lv-pagehead-main) {
            display: none;
        }
        :global(#lv-manager-page .lv-pagehead) {
            margin-bottom: var(--lv-sp-2);
        }
        :global(#lv-manager-page .lv-pagehead-actions) {
            display: flex;
            flex-wrap: nowrap;
            width: 100%;
            gap: var(--lv-sp-2);
            align-items: center;
        }
        .lv-filter-wrap {
            flex: 1 1 0;
            min-width: 0;
        }
        .lv-filter {
            width: 100%;
            min-width: 0;
            height: 36px;
        }
        .lv-mgr-filter-toggle {
            display: inline-flex;
            align-items: center;
            gap: var(--lv-sp-1);
            min-height: 36px;
            padding: 0 var(--lv-sp-3);
            flex-shrink: 0;
            white-space: nowrap;

            &.lv-mgr-filter-toggle--active {
                border-color: var(--lv-color-brand);
                color: var(--lv-color-brand);
                background: var(--lv-primary-soft);
            }
        }
        .lv-mgr-refresh-btn {
            min-height: 36px;
            min-width: 36px;
            padding: 0 var(--lv-sp-2);
            flex-shrink: 0;
            justify-content: center;
            .lv-mgr-refresh-label {
                display: none;
            }
        }
        .lv-mgr-toolbar {
            margin-bottom: var(--lv-sp-2);
            gap: var(--lv-sp-2);
        }
        .lv-mgr-filters-panel {
            display: none;

            &.is-open {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: var(--lv-sp-2);
                width: 100%;
                padding: var(--lv-sp-2);
                background: var(--lv-color-surface);
                border: 1px solid var(--lv-border);
                border-radius: var(--lv-r-m);

                .lv-deck-selector {
                    max-width: none !important;
                    grid-column: 1 / -1;
                }
                .lv-sort {
                    width: 100%;
                    max-width: none;
                }
                .lv-chipbtn {
                    justify-content: center;
                    width: 100%;
                }
            }
        }
        .lv-toolbar-right {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            gap: var(--lv-sp-2);
        }
        .lv-mgr-deck-scope {
            padding: var(--lv-sp-2) var(--lv-sp-3);
            margin-bottom: var(--lv-sp-2);
            gap: var(--lv-sp-2);
        }
    }

    @media (max-width: 560px) {
        :global(#lv-manager-page .lv-pagehead-main) {
            display: none;
        }
        :global(#lv-manager-page .lv-pagehead) {
            margin-bottom: var(--lv-sp-2);
        }
        :global(#lv-manager-page .lv-pagehead-actions) {
            display: flex;
            flex-wrap: nowrap;
            width: 100%;
            gap: var(--lv-sp-2);
            align-items: center;
        }
        .lv-filter-wrap {
            flex: 1 1 0;
            min-width: 0;
        }
        .lv-filter {
            width: 100%;
            min-width: 0;
            height: 36px;
        }
        .lv-mgr-filter-toggle {
            display: inline-flex;
            align-items: center;
            gap: var(--lv-sp-1);
            min-height: 36px;
            padding: 0 var(--lv-sp-3);
            flex-shrink: 0;
            white-space: nowrap;

            &.lv-mgr-filter-toggle--active {
                border-color: var(--lv-color-brand);
                color: var(--lv-color-brand);
                background: var(--lv-primary-soft);
            }
        }
        .lv-mgr-refresh-btn {
            min-height: 36px;
            min-width: 36px;
            padding: 0 var(--lv-sp-2);
            flex-shrink: 0;
            justify-content: center;
            .lv-mgr-refresh-label {
                display: none;
            }
        }
        .lv-mgr-toolbar {
            margin-bottom: var(--lv-sp-2);
            gap: var(--lv-sp-2);
        }
        .lv-mgr-filters-panel {
            display: none;

            &.is-open {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: var(--lv-sp-2);
                width: 100%;
                padding: var(--lv-sp-2);
                background: var(--lv-color-surface);
                border: 1px solid var(--lv-border);
                border-radius: var(--lv-r-m);

                .lv-deck-selector {
                    max-width: none !important;
                    grid-column: 1 / -1;
                }
                .lv-sort {
                    width: 100%;
                    max-width: none;
                }
                .lv-chipbtn {
                    justify-content: center;
                    width: 100%;
                }
            }
        }
        .lv-toolbar-right {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            gap: var(--lv-sp-2);
        }
        .lv-mgr-deck-scope {
            padding: var(--lv-sp-2) var(--lv-sp-3);
            margin-bottom: var(--lv-sp-2);
            gap: var(--lv-sp-2);
        }
        .lv-batchbar {
            flex-wrap: nowrap;
            overflow-x: auto;
            max-width: 100%;
            box-sizing: border-box;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
            &::-webkit-scrollbar { display: none; }
            .fn__flex-1 { display: none; }
            > * { flex: 0 0 auto; white-space: nowrap; }
        }
        .lv-list .lv-row {
            flex-wrap: nowrap;
            padding: var(--lv-sp-2) var(--lv-sp-3);
            gap: var(--lv-sp-2);
            .lv-row-main { flex: 1 1 0; min-width: 0; }
            > .b3-button { flex: none; width: auto; margin-left: 0; padding: 0 var(--lv-sp-2); }
            > .lv-btn-tool span { display: none; }
        }
    }

    @container lv-hub (max-width: 420px) {
        .lv-list .lv-row {
            flex-wrap: nowrap;
            padding: var(--lv-sp-2) var(--lv-sp-3);
            gap: var(--lv-sp-2);
            .lv-row-main { flex: 1 1 0; min-width: 0; }
            > .b3-button { flex: none; width: auto; margin-left: 0; padding: 0 var(--lv-sp-2); }
            > .lv-btn-tool span { display: none; }
        }
    }
</style>
