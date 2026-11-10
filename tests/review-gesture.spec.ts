import { describe, expect, it, vi } from "vitest";
import {
    reviewSwipeAction,
    resolveMobileCardSwitch,
    shouldIgnoreSwipeTarget,
    resolveTouchSwipe,
    mapSwipeActionToOutcome,
    extractSingleTouchCoords,
    extractChangedTouchCoords,
} from "../src/core/review-gesture";

describe("review swipe semantics", () => {
    describe("resolveMobileCardSwitch 手机端横滑切卡判定 (Mobile Spec v1)", () => {
        it("横向位移显著超过 60px 阈值且大于纵向位移 1.2 倍时判定为切卡", () => {
            expect(resolveMobileCardSwitch(75, 10)).toBe("next");
            expect(resolveMobileCardSwitch(-80, 20)).toBe("next");
            expect(resolveMobileCardSwitch(120, 0)).toBe("next");
        });

        it("未达 60px 阈值或纵向位移过大时返回 null", () => {
            expect(resolveMobileCardSwitch(50, 0)).toBeNull();
            expect(resolveMobileCardSwitch(70, 65)).toBeNull();
            expect(resolveMobileCardSwitch(0, 90)).toBeNull();
        });
    });

    it("question side reveals only on an upward swipe and never rates horizontally", () => {
        expect(reviewSwipeAction(false, 90, 0)).toBeNull();
        expect(reviewSwipeAction(false, -90, 0)).toBeNull();
        expect(reviewSwipeAction(false, 0, -90)).toBe("reveal");
        expect(reviewSwipeAction(false, 0, 90)).toBeNull();
    });

    it("answer side maps 4-direction swipes to the matching visible ratings", () => {
        expect(reviewSwipeAction(true, 90, 0)).toBe("good");
        expect(reviewSwipeAction(true, -90, 0)).toBe("again");
        expect(reviewSwipeAction(true, 0, 90)).toBe("hard");
        expect(reviewSwipeAction(true, 0, -90)).toBe("easy");
    });

    it("ignores short and diagonal gestures", () => {
        expect(reviewSwipeAction(false, 59, 0)).toBeNull();
        expect(reviewSwipeAction(true, -90, 60)).toBeNull();
        expect(reviewSwipeAction(true, 60, 0)).toBeNull();
    });

    describe("shouldIgnoreSwipeTarget 触控误触隔离", () => {
        it("普通非滚动容器返回 false", () => {
            const div = document.createElement("div");
            expect(shouldIgnoreSwipeTarget(div)).toBe(false);
            expect(shouldIgnoreSwipeTarget(null)).toBe(false);
        });

        it("交互控件（按钮/输入/链接/徽章）返回 true", () => {
            const btn = document.createElement("button");
            const input = document.createElement("input");
            const link = document.createElement("a");
            const kbd = document.createElement("kbd");
            const editable = document.createElement("div");
            editable.setAttribute("contenteditable", "true");

            expect(shouldIgnoreSwipeTarget(btn)).toBe(true);
            expect(shouldIgnoreSwipeTarget(input)).toBe(true);
            expect(shouldIgnoreSwipeTarget(link)).toBe(true);
            expect(shouldIgnoreSwipeTarget(kbd)).toBe(true);
            expect(shouldIgnoreSwipeTarget(editable)).toBe(true);
        });

        it("代码块、表格、SVG 矢量返回 true，防止横滑查阅时长代码误切题", () => {
            const pre = document.createElement("pre");
            const code = document.createElement("code");
            pre.appendChild(code);
            const table = document.createElement("table");
            const td = document.createElement("td");
            table.appendChild(td);
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

            expect(shouldIgnoreSwipeTarget(code)).toBe(true);
            expect(shouldIgnoreSwipeTarget(td)).toBe(true);
            expect(shouldIgnoreSwipeTarget(svg)).toBe(true);
        });

        it("祖先节点存在横向滚动（scrollWidth > clientWidth 且 overflowX 开启）时返回 true", () => {
            const parent = document.createElement("div");
            const child = document.createElement("span");
            parent.appendChild(child);

            // 模拟横向超宽容器
            Object.defineProperty(parent, "scrollWidth", { value: 500, configurable: true });
            Object.defineProperty(parent, "clientWidth", { value: 300, configurable: true });
            vi.spyOn(window, "getComputedStyle").mockReturnValue({
                overflowX: "auto",
            } as any);

            expect(shouldIgnoreSwipeTarget(child)).toBe(true);
        });
    });

    describe("resolveTouchSwipe 触控动作整体调度", () => {
        const start = { x: 100, y: 100 };
        const plainDiv = document.createElement("div");

        it("遮罩或弹窗开启时一律忽略滑动", () => {
            const end = { x: 200, y: 100 }; // 良好滑动
            expect(resolveTouchSwipe(true, start, end, plainDiv, true)).toBeNull();
        });

        it("普通卡面区域正常解析滑动动作", () => {
            const rightEnd = { x: 200, y: 100 };
            expect(resolveTouchSwipe(true, start, rightEnd, plainDiv, false)).toBe("good");

            const upEnd = { x: 100, y: 10 };
            expect(resolveTouchSwipe(false, start, upEnd, plainDiv, false)).toBe("reveal");
        });
    });

    describe("mapSwipeActionToOutcome", () => {
        it("将四向手势动作正确映射为 1-4 级评分动作", () => {
            expect(mapSwipeActionToOutcome("again")).toEqual({ type: "rate", rating: 1 });
            expect(mapSwipeActionToOutcome("hard")).toEqual({ type: "rate", rating: 2 });
            expect(mapSwipeActionToOutcome("good")).toEqual({ type: "rate", rating: 3 });
            expect(mapSwipeActionToOutcome("easy")).toEqual({ type: "rate", rating: 4 });
        });

        it("将 reveal 动作映射为翻面动作", () => {
            expect(mapSwipeActionToOutcome("reveal")).toEqual({ type: "reveal" });
        });

        it("null 动作返回 null", () => {
            expect(mapSwipeActionToOutcome(null)).toBeNull();
        });
    });

    describe("extractSingleTouchCoords & extractChangedTouchCoords", () => {
        it("单指触控返回坐标对象", () => {
            const e = { touches: [{ clientX: 120, clientY: 250 }] };
            expect(extractSingleTouchCoords(e)).toEqual({ x: 120, y: 250 });
        });

        it("多指触控或无触控点返回 null", () => {
            expect(extractSingleTouchCoords({ touches: [{ clientX: 1, clientY: 2 }, { clientX: 3, clientY: 4 }] })).toBeNull();
            expect(extractSingleTouchCoords({ touches: [] })).toBeNull();
            expect(extractSingleTouchCoords({})).toBeNull();
        });

        it("extractChangedTouchCoords 提取首个变更点坐标", () => {
            expect(extractChangedTouchCoords({ changedTouches: [{ clientX: 80, clientY: 90 }] })).toEqual({ x: 80, y: 90 });
            expect(extractChangedTouchCoords({ changedTouches: [] })).toBeNull();
            expect(extractChangedTouchCoords({})).toBeNull();
        });
    });
});


