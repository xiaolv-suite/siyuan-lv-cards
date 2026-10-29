import { describe, expect, it } from "vitest";
import {
    normalizeSessionState,
    emptySessionState,
    withEndReason,
    hasSessionProgress,
    isSessionLive,
    markSessionCompleted,
    createSessionSnapshot,
    restoreSessionProgress,
    recordSessionEndReason,
    createResetSessionProgress,
    END_REASONS,
} from "../src/core/session-state";

const TODAY = "2026-10-02";

describe("session-state（AQ-2：跳过集合落盘与清洗）", () => {
    it("当日状态恢复，含 skippedIDs", () => {
        const s = normalizeSessionState({
            date: TODAY,
            reviewedIDs: ["c1", "c2"],
            skippedIDs: ["s1"],
            counters: { new: 2, review: 0, forget: 0, skip: 1 },
        }, TODAY);
        expect(s.reviewedIDs).toEqual(["c1", "c2"]);
        expect(s.skippedIDs).toEqual(["s1"]);
        expect(s.counters.skip).toBe(1);
    });

    it("跨日状态作废", () => {
        expect(normalizeSessionState({ date: "2026-10-01", reviewedIDs: ["c1"] }, TODAY)).toEqual(emptySessionState());
    });

    it("旧版无 skippedIDs 兼容为空数组", () => {
        const s = normalizeSessionState({ date: TODAY, reviewedIDs: ["c1"], counters: {} }, TODAY);
        expect(s.skippedIDs).toEqual([]);
        expect(s.completed).toBe(false);
    });

    it("仅跳过的现场也视为有进度并可在同日续场", () => {
        const skipped = normalizeSessionState({
            date: TODAY,
            reviewedIDs: [],
            skippedIDs: ["c1"],
            counters: { skip: 1 },
        }, TODAY);
        expect(hasSessionProgress(skipped)).toBe(true);
        expect(isSessionLive(skipped, TODAY)).toBe(true);
    });

    it("ID 列表清洗：非字符串剔除、去重", () => {
        const s = normalizeSessionState({
            date: TODAY,
            reviewedIDs: ["c1", 5, null, "c1", "c2"],
            skippedIDs: "not-an-array",
            counters: { new: NaN, review: "3", forget: undefined, skip: -1 },
        }, TODAY);
        expect(s.reviewedIDs).toEqual(["c1", "c2"]);
        expect(s.skippedIDs).toEqual([]);
        expect(s.counters).toEqual({ new: 0, review: 3, forget: 0, skip: 0 });
    });
});

describe("session-state BI-8：收工原因", () => {
    const live = { date: TODAY, reviewedIDs: ["c1"], skippedIDs: [], counters: { new: 1, review: 0, forget: 0, skip: 0 } };

    it("白名单内原因不可变写入", () => {
        const next = withEndReason(live, "energy")!;
        expect(next.endReason).toBe("energy");
        expect(next).not.toBe(live); // 不可变：原状态不受影响
        expect(live.endReason).toBeUndefined();
        expect(END_REASONS).toContain("goal-done");
        expect(END_REASONS).toHaveLength(5);
    });

    it("跨天/空场拒绝写入（返回 null）", () => {
        expect(withEndReason(emptySessionState(), "manual")).toBeNull();
    });

    it("normalize 白名单清洗：非法原因回空，合法保留", () => {
        const ok = normalizeSessionState({ ...live, endReason: "time-up" }, TODAY);
        expect(ok.endReason).toBe("time-up");
        const bad = normalizeSessionState({ ...live, endReason: "hack" }, TODAY);
        expect(bad.endReason).toBeNull();
        const none = normalizeSessionState(live, TODAY);
        expect(none.endReason).toBeNull();
    });

    it("自然完成标记持久化，完成后不再作为续场；旧快照仍按未完成处理", () => {
        const legacy = normalizeSessionState({
            date: TODAY,
            reviewedIDs: ["c1"],
            counters: { new: 1 },
        }, TODAY);
        expect(legacy.completed).toBe(false);
        expect(isSessionLive(legacy, TODAY)).toBe(true);

        const completed = normalizeSessionState(markSessionCompleted(legacy), TODAY);
        expect(completed.completed).toBe(true);
        expect(isSessionLive(completed, TODAY)).toBe(false);
        expect(isSessionLive({ ...legacy, completed: false }, "2026-10-03")).toBe(false);
    });

    describe("createSessionSnapshot & restoreSessionProgress", () => {
        it("createSessionSnapshot 生成独立浅拷贝快照对象", () => {
            const rev = ["c1"];
            const skip = ["s1"];
            const snap = createSessionSnapshot(TODAY, rev, skip, { new: 1, review: 2, forget: 0, skip: 1 });
            expect(snap.date).toBe(TODAY);
            expect(snap.reviewedIDs).toEqual(["c1"]);
            expect(snap.completed).toBe(false);

            rev.push("c2");
            expect(snap.reviewedIDs.length).toBe(1); // 隔离 mutation
        });

        it("restoreSessionProgress 成功恢复未完成的有进度会话", () => {
            const snap = createSessionSnapshot(TODAY, ["c1"], ["s1"], { new: 1, review: 2, forget: 0, skip: 1 });
            const restored = restoreSessionProgress(snap, TODAY);
            expect(restored).not.toBeNull();
            expect(restored?.reviewedIDs).toEqual(["c1"]);
            expect(restored?.skippedIDs).toEqual(["s1"]);
            expect(restored?.recoverySnap.today).toBe(TODAY);
        });

        it("已完成或空进度会话返回 null", () => {
            const empty = emptySessionState();
            expect(restoreSessionProgress(empty, TODAY)).toBeNull();

            const done = markSessionCompleted(createSessionSnapshot(TODAY, ["c1"], [], { new: 1, review: 0, forget: 0, skip: 0 }));
            expect(restoreSessionProgress(done, TODAY)).toBeNull();
        });
    });

    describe("recordSessionEndReason", () => {
        it("正常持久化收工原因", () => {
            const snap = createSessionSnapshot(TODAY, ["c1"], [], { new: 1, review: 0, forget: 0, skip: 0 });
            let saved: any = null;
            const res = recordSessionEndReason(snap, "time-up", (s) => { saved = s; });

            expect(res?.endReason).toBe("time-up");
            expect(saved?.endReason).toBe("time-up");
        });

        it("无会话状态返回 null", () => {
            expect(recordSessionEndReason(null, "manual", () => {})).toBeNull();
        });
    });

    describe("createResetSessionProgress", () => {
        it("正确生成清空状态的会话进度载荷", () => {
            expect(createResetSessionProgress()).toEqual({
                reviewedIDs: [],
                skippedIDs: [],
                counters: { new: 0, review: 0, forget: 0, skip: 0 },
            });
        });
    });
});
