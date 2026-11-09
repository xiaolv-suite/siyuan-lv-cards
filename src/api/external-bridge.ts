/**
 * 小驴闪卡对外服务桥 v1（window.xiaolvCards / window.lvCards）
 * 遵循小驴生态跨插件契约：
 * - 协议版本：CARDS_BRIDGE_PROTOCOL = 1
 * - 能力协商：["whenReady", "stats", "due", "openHub", "openReview"]
 * - 结果包装：ActionResult<T> 信封（ok: true/false）
 * - 只读安全边界：外部桥仅暴露只读统计与导航方法，不提供破坏性删卡/删组方法
 * - 生态事件总线：通过 window.dispatchEvent 派发 lv-cards:reviewed 自定义事件（带幂等键），供快门、打卡等消费
 */

import type { IntakeReceipt, IntakeInput } from "@/core/external-card-intake";
import type { ExtractEnvelope } from "@/core/incremental-learning";

export const CARDS_BRIDGE_PROTOCOL = 1;
export const CARDS_BRIDGE_NAME = "xiaolv-cards" as const;
export const CARDS_BRIDGE_CAPABILITIES = [
    "whenReady",
    "stats",
    "due",
    "openHub",
    "openReview",
    "hasCapability",
    "getOverview",
    "receiveExtract",
    "createCard",
    "daily-task-export",
    "today-summary",
] as const;

export const CARDS_BRIDGE_ALIASES = [
    "xiaolvCards",
    "lvCards",
    "LvCards",
    "siyuanCards",
] as const;

export interface ActionSuccess<T> {
    ok: true;
    data: T;
}

export interface ActionFailure {
    ok: false;
    code: string;
    message: string;
    details?: unknown;
}

export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

export interface FlashcardStats {
    todayReviews: number;
    todayNew: number;
    todayForget: number;
    streak: number;
    dueCount: number;
    historyDays: number;
}

export interface FlashcardDueSummary {
    unreviewedCount: number;
    unreviewedNewCardCount: number;
    unreviewedOldCardCount: number;
    todayReviewedCount?: number;
    updatedAt: string;
}

export interface ReviewOpenOptions {
    scope?: string;
    cram?: boolean;
    entry?: string;
}

export interface CardsBridgeApi {
    readonly protocol: number;
    readonly protocolName: string;
    readonly capabilities: readonly string[];
    whenReady(): Promise<boolean>;
    hasCapability(name: string): boolean;
    getOverview(): unknown;
    getStats(): Promise<ActionResult<FlashcardStats>>;
    getDueSummary(): Promise<ActionResult<FlashcardDueSummary>>;
    openHub(tab?: string): Promise<ActionResult<boolean>>;
    openReview(options?: ReviewOpenOptions): Promise<ActionResult<boolean>>;
    receiveExtract(envelope: ExtractEnvelope): Promise<ActionResult<IntakeReceipt>>;
    createCard?(options: {
        front: string;
        back?: string;
        tags?: string[];
        deckName?: string;
        sourceDocId?: string;
        sourceBlockId?: string;
        requestId?: string;
    }): Promise<ActionResult<IntakeReceipt>>;
    generateDailyTaskMarkdown(options?: { customPrefix?: string }): Promise<ActionResult<{ markdown: string; dueCount: number }>>;
    getTodaySummaryText(options?: { customPrefix?: string }): Promise<ActionResult<{ text: string; dueCount: number }>>;
}

export interface CardsBridgeHost {
    getStats(): Promise<FlashcardStats> | FlashcardStats;
    getDueSummary(): Promise<FlashcardDueSummary>;
    openHub(tab?: string): void;
    openReview(options?: ReviewOpenOptions): void;
    receiveExtract?(envelope: ExtractEnvelope): Promise<ActionResult<IntakeReceipt>>;
    createCard?(input: IntakeInput): Promise<ActionResult<IntakeReceipt>>;
}

export interface CardReviewedEventDetail {
    plugin: "lv-cards";
    v: 1;
    ts: number;
    cardID: string;
    deckID: string;
    blockID: string;
    rating: number;
    source: "plugin" | "native";
    occurredAt: string;
    idempotencyKey: string;
}

export function dispatchCardReviewedEvent(detail: {
    cardID: string;
    deckID: string;
    blockID: string;
    rating: number;
    source: "plugin" | "native";
    ts?: number;
}): void {
    if (typeof window === "undefined" || !window.dispatchEvent) return;
    try {
        const ts = detail.ts ?? Date.now();
        window.dispatchEvent(new CustomEvent("lv-cards:reviewed", {
            detail: {
                ...detail,
                plugin: "lv-cards",
                v: 1,
                ts,
                occurredAt: new Date(ts).toISOString(),
                idempotencyKey: `${detail.cardID}:${ts}`,
            },
        }));
    } catch {}
}

const wrap = async <T>(code: string, fn: () => Promise<T> | T): Promise<ActionResult<T>> => {
    try {
        return { ok: true, data: await fn() };
    } catch (e: any) {
        return { ok: false, code, message: e?.message ?? String(e) };
    }
};

export function buildCardsBridge(host: CardsBridgeHost): CardsBridgeApi {
    const capabilities = CARDS_BRIDGE_CAPABILITIES;
    return {
        protocol: CARDS_BRIDGE_PROTOCOL,
        protocolName: CARDS_BRIDGE_NAME,
        capabilities,
        whenReady: async () => true,
        hasCapability: (name: string) => capabilities.includes(name as any) || name === "cards" || name === "siyuan-lv-cards",
        getOverview: () => ({
            name: "siyuan-lv-cards",
            title: "小驴闪卡",
            maturity: "stable",
            protocol: CARDS_BRIDGE_PROTOCOL,
            protocolName: CARDS_BRIDGE_NAME,
            capabilities,
        }),
        getStats: () => wrap("stats-error", () => host.getStats()),
        getDueSummary: () => wrap("due-error", () => host.getDueSummary()),
        openHub: (tab?: string) => wrap("open-hub-failed", () => (host.openHub(tab), true)),
        openReview: (opts?: ReviewOpenOptions) => wrap("open-review-failed", () => (host.openReview(opts), true)),
        receiveExtract: async (envelope: ExtractEnvelope) => {
            if (!host.receiveExtract) return { ok: false, code: "not-supported", message: "receiveExtract is not supported" };
            try {
                const receipt = await host.receiveExtract(envelope);
                if (!receipt?.ok) return receipt?.ok === false ? receipt : { ok: false, code: "extract-failed", message: "Extract was not accepted" };
                if (!receipt.data.createdBlockID || receipt.data.kind !== "extract" || receipt.data.enrolled !== false) return { ok: false, code: "write-unknown", message: "Extract receipt is not verifiable", details: receipt.data };
                return receipt;
            } catch (error) { return { ok: false, code: "write-unknown", message: String(error) }; }
        },
        createCard: async (options) => {
            if (!host.createCard) return { ok: false, code: "not-supported", message: "Atomic card creation is not supported" };
            try {
                const content = options.back?.trim() ? `${options.front.trim()} ==${options.back.trim()}==` : options.front.trim();
                const receipt = await host.createCard({ content, sourceDocId: options.sourceDocId, sourceBlockId: options.sourceBlockId, sourceTitle: options.deckName, tags: options.tags, requestId: options.requestId });
                if (!receipt?.ok) return receipt?.ok === false ? receipt : { ok: false, code: "create-card-failed", message: "Atomic card was not created" };
                if (!receipt.data.createdBlockID || receipt.data.kind !== "atomic" || !receipt.data.enrolled) return { ok: false, code: "write-unknown", message: "Atomic card receipt is not verifiable", details: receipt.data };
                return receipt;
            } catch (error) { return { ok: false, code: "write-unknown", message: String(error) }; }
        },
        generateDailyTaskMarkdown: (opts?: { customPrefix?: string }) => {
            return wrap("daily-task-failed", async () => {
                const dueSummary = await host.getDueSummary();
                const totalDue = dueSummary.unreviewedCount;
                const prefix = opts?.customPrefix ?? "记忆复习";
                const isComplete = totalDue === 0;
                const markdown = isComplete
                    ? `- [x] ${prefix}：今日已无待复习闪卡`
                    : `- [ ] ${prefix}：今日待复习 ${totalDue} 张闪卡`;
                return {
                    markdown,
                    dueCount: totalDue,
                };
            });
        },
        getTodaySummaryText: (opts?: { customPrefix?: string }) => {
            return wrap("summary-failed", async () => {
                const dueSummary = await host.getDueSummary();
                const totalDue = dueSummary.unreviewedCount;
                const prefix = opts?.customPrefix ?? "闪卡复习";
                const text = totalDue === 0
                    ? `【${prefix}】今日已无待复习闪卡（全部完成 🎉）`
                    : `【${prefix}】今日待复习 ${totalDue} 张闪卡`;
                return {
                    text,
                    dueCount: totalDue,
                };
            });
        },
    };
}

export function mountCardsBridge(
    host: CardsBridgeHost,
    win: Record<string, unknown> = typeof window !== "undefined" ? (window as any) : undefined
): () => void {
    if (!win) return () => undefined;
    const bridge = buildCardsBridge(host);

    for (const alias of CARDS_BRIDGE_ALIASES) {
        if (!win[alias]) {
            win[alias] = bridge;
        }
    }

    return () => {
        for (const alias of CARDS_BRIDGE_ALIASES) {
            if (win[alias] === bridge) {
                delete win[alias];
            }
        }
    };
}
