import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getDeckEcosystemBadge } from "../src/core/deck-management";
import {
    findMatchingCheckinItemId,
    getExamOverviewSafely,
    openExamModuleSafely,
    getCommonSnippetsSafely,
} from "../src/libs/ecosystem-bridge-kit";
import { buildCardsBridge } from "../src/api/external-bridge";

describe("小驴全生态深度联动 (Ecosystem Federation Deep Linkage)", () => {
    let originalWindow: any;

    beforeEach(() => {
        originalWindow = globalThis.window;
    });

    afterEach(() => {
        globalThis.window = originalWindow;
        vi.restoreAllMocks();
    });

    it("getDeckEcosystemBadge 准确识别各兄弟插件卡包并赋予专属徽章", () => {
        // 小驴考试
        const exam1 = getDeckEcosystemBadge("小驴考试/高等数学");
        expect(exam1).not.toBeNull();
        expect(exam1?.origin).toBe("exam");
        expect(exam1?.label).toBe("小驴考试");
        expect(exam1?.icon).toBe("graduation");
        expect(exam1?.actionLabel).toBe("考试台");

        const exam2 = getDeckEcosystemBadge("小驴考试");
        expect(exam2?.origin).toBe("exam");

        // 小驴拾遗
        const glean1 = getDeckEcosystemBadge("拾遗卡片");
        expect(glean1).not.toBeNull();
        expect(glean1?.origin).toBe("glean");
        expect(glean1?.label).toBe("小驴拾遗");
        expect(glean1?.icon).toBe("book");

        const glean2 = getDeckEcosystemBadge("小驴拾遗/精读摘录");
        expect(glean2?.origin).toBe("glean");

        // 小驴管家
        const home = getDeckEcosystemBadge("小驴管家/急救闪卡");
        expect(home?.origin).toBe("home");
        expect(home?.label).toBe("小驴管家");
        expect(home?.icon).toBe("home");

        // 小驴打卡
        const checkin = getDeckEcosystemBadge("小驴打卡/每日习惯");
        expect(checkin?.origin).toBe("checkin");
        expect(checkin?.label).toBe("小驴打卡");
        expect(checkin?.icon).toBe("check");

        // 思源原生或普通用户卡包
        expect(getDeckEcosystemBadge("考研政治英语")).toBeNull();
        expect(getDeckEcosystemBadge("日常词汇")).toBeNull();
        expect(getDeckEcosystemBadge("")).toBeNull();
    });

    it("findMatchingCheckinItemId 支持配置优先与智能零配置匹配", async () => {
        // 1. 已配置项优先返回
        const configured = await findMatchingCheckinItemId("chk-user-123");
        expect(configured).toBe("chk-user-123");

        // 2. 模拟小驴打卡公开桥
        const mockCheckinBridge = {
            protocol: "siyuan-checkin",
            queryItems: vi.fn().mockReturnValue([
                { id: "chk-reading", name: "每日阅读", kind: "count", archived: false },
                { id: "chk-flashcard", name: "闪卡复习", kind: "count", archived: false },
                { id: "chk-workout", name: "健身运动", kind: "count", archived: false },
            ]),
        };

        (globalThis as any).window = {
            siyuanCheckin: mockCheckinBridge,
        };

        const matched = await findMatchingCheckinItemId();
        expect(matched).toBe("chk-flashcard");
        expect(mockCheckinBridge.queryItems).toHaveBeenCalled();

        // 3. 匹配包含「复习」的次优项
        mockCheckinBridge.queryItems.mockReturnValueOnce([
            { id: "chk-review-words", name: "单词背诵与复习", kind: "count", archived: false },
        ]);
        const matchedReview = await findMatchingCheckinItemId();
        expect(matchedReview).toBe("chk-review-words");

        // 4. 未找到返回 null
        mockCheckinBridge.queryItems.mockReturnValueOnce([
            { id: "chk-other", name: "早睡早起", kind: "count", archived: false },
        ]);
        expect(await findMatchingCheckinItemId()).toBeNull();
    });

    it("getExamOverviewSafely 与 openExamModuleSafely 顺畅调用小驴考试", async () => {
        const mockExamBridge = {
            protocol: 1,
            capabilities: ["practice", "wrongbook", "stats"],
            getOverview: vi.fn().mockReturnValue({
                examTitle: "2026年下半年软考架构师",
                examDate: "2026-11-15",
                activeWrongCount: 42,
            }),
            practice: vi.fn(),
            wrongbook: vi.fn(),
            mock: vi.fn(),
        };

        (globalThis as any).window = {
            LvExam: mockExamBridge,
        };

        const overview = await getExamOverviewSafely();
        expect(overview).not.toBeNull();
        expect(overview?.name).toBe("2026年下半年软考架构师");
        expect(typeof overview?.days).toBe("number");
        expect(overview?.activeWrongCount).toBe(42);

        expect(openExamModuleSafely("practice")).toBe(true);
        expect(mockExamBridge.practice).toHaveBeenCalled();

        expect(openExamModuleSafely("wrongbook")).toBe(true);
        expect(mockExamBridge.wrongbook).toHaveBeenCalled();

        expect(openExamModuleSafely("mock")).toBe(true);
        expect(mockExamBridge.mock).toHaveBeenCalled();
    });

    it("getCommonSnippetsSafely 提取小驴常用素材", async () => {
        const mockCommonBridge = {
            protocol: 1,
            capabilities: ["favorites", "recent"],
            favorites: vi.fn().mockResolvedValue({
                ok: true,
                data: [
                    { id: "s-1", title: "计算机网络速记", content: "TCP三次握手与四次挥手过程..." },
                ],
            }),
            recent: vi.fn().mockResolvedValue({
                ok: true,
                data: [],
            }),
        };

        (globalThis as any).window = {
            xiaolvCommon: mockCommonBridge,
        };

        const snippets = await getCommonSnippetsSafely();
        expect(snippets).toHaveLength(1);
        expect(snippets[0].title).toBe("计算机网络速记");
    });

    it("CardsBridgeApi getTodaySummaryText 输出规范跨插件宏摘要", async () => {
        const mockHost = {
            getStats: vi.fn().mockResolvedValue({
                todayReviews: 25,
                todayNew: 10,
                todayForget: 2,
                streak: 7,
                dueCount: 15,
                historyDays: 30,
            }),
            getDueSummary: vi.fn().mockResolvedValue({
                unreviewedCount: 15,
                unreviewedNewCardCount: 5,
                unreviewedOldCardCount: 10,
                todayReviewedCount: 25,
                updatedAt: "2026-11-01T12:00:00Z",
            }),
            openHub: vi.fn(),
            openReview: vi.fn(),
        };

        const bridge = buildCardsBridge(mockHost);

        const summaryRes = await bridge.getTodaySummaryText();
        expect(summaryRes.ok).toBe(true);
        if (summaryRes.ok) {
            expect(summaryRes.data.text).toBe("【闪卡复习】今日待复习 15 张闪卡");
            expect(summaryRes.data.dueCount).toBe(15);
        }

        mockHost.getDueSummary.mockResolvedValueOnce({
            unreviewedCount: 0,
            unreviewedNewCardCount: 0,
            unreviewedOldCardCount: 0,
            todayReviewedCount: 30,
            updatedAt: "2026-11-01T12:00:00Z",
        });

        const completeRes = await bridge.getTodaySummaryText();
        expect(completeRes.ok).toBe(true);
        if (completeRes.ok) {
            expect(completeRes.data.text).toBe("【闪卡复习】今日已无待复习闪卡（全部完成 🎉）");
            expect(completeRes.data.dueCount).toBe(0);
        }
    });
});
