import { describe, expect, it, vi } from "vitest";
import {
    resolveReviewKeyAction,
    isInputOrEditable,
    isInteractiveControl,
    shouldIgnoreReviewKeydown,
    resolveModalKeydownAction,
    isAnyReviewModalOpen,
    resolveRatingFromShortcutAction,
    type ReviewShortcutContext,
} from "../src/core/review-shortcuts";

function baseContext(overrides: Partial<ReviewShortcutContext> = {}): ReviewShortcutContext {
    return {
        peekOpen: false,
        helpOpen: false,
        showAnswer: false,
        faceReady: true,
        hasCurrent: true,
        hasLastAnswered: false,
        ratingStyle: "four",
        isTargetInsideRoot: true,
        ...overrides,
    };
}

describe("review-shortcuts 键盘调度解析器", () => {
    describe("元素类型辅助检测", () => {
        it("isInputOrEditable 检测输入框与可编辑区域", () => {
            const input = document.createElement("input");
            const textarea = document.createElement("textarea");
            const editable = document.createElement("div");
            editable.setAttribute("contenteditable", "true");
            const span = document.createElement("span");

            expect(isInputOrEditable(input)).toBe(true);
            expect(isInputOrEditable(textarea)).toBe(true);
            expect(isInputOrEditable(editable)).toBe(true);
            expect(isInputOrEditable(span)).toBe(false);
            expect(isInputOrEditable(null)).toBe(false);
        });

        it("isInteractiveControl 检测按钮、下拉与链接", () => {
            const button = document.createElement("button");
            const select = document.createElement("select");
            const a = document.createElement("a");
            const div = document.createElement("div");

            expect(isInteractiveControl(button)).toBe(true);
            expect(isInteractiveControl(select)).toBe(true);
            expect(isInteractiveControl(a)).toBe(true);
            expect(isInteractiveControl(div)).toBe(false);
            expect(isInteractiveControl(null)).toBe(false);
        });
    });

    describe("模态与浮层拦截优先级", () => {
        it("peekOpen=true 时只响应 Escape 与 [，并调用 preventDefault", () => {
            const prevent = vi.fn();
            const ctx = baseContext({ peekOpen: true });

            expect(resolveReviewKeyAction({ key: "Escape", preventDefault: prevent }, ctx)).toBe("close-peek");
            expect(prevent).toHaveBeenCalled();

            expect(resolveReviewKeyAction({ key: "[", preventDefault: prevent }, ctx)).toBe("close-peek");
            expect(resolveReviewKeyAction({ key: " ", code: "Space" }, ctx)).toBeNull();
            expect(resolveReviewKeyAction({ key: "1" }, ctx)).toBeNull();
        });

        it("? 切换帮助，helpOpen=true 时只响应 Escape 关闭帮助", () => {
            const ctx = baseContext({ helpOpen: true });
            expect(resolveReviewKeyAction({ key: "Escape" }, ctx)).toBe("close-help");
            expect(resolveReviewKeyAction({ key: "1" }, ctx)).toBeNull();

            const closedCtx = baseContext({ helpOpen: false });
            expect(resolveReviewKeyAction({ key: "?" }, closedCtx)).toBe("toggle-help");
        });
    });

    describe("交互控件与输入区防抢占", () => {
        it("焦点在输入框或富文本元素内时不触发快捷键", () => {
            const input = document.createElement("input");
            const ctx = baseContext();

            expect(resolveReviewKeyAction({ key: " ", code: "Space", target: input }, ctx)).toBeNull();
            expect(resolveReviewKeyAction({ key: "h", target: input }, ctx)).toBeNull();
            expect(resolveReviewKeyAction({ key: "x", target: input }, ctx)).toBeNull();
        });

        it("焦点在面板外交互控件上时，不抢占 Space/Enter", () => {
            const extButton = document.createElement("button");
            const ctx = baseContext({ isTargetInsideRoot: false });

            expect(resolveReviewKeyAction({ key: " ", code: "Space", target: extButton }, ctx)).toBeNull();
        });
    });

    describe("核心复习流转（Space / Enter / h）", () => {
        it("问题态且面已就绪：Space/Enter 触发 reveal", () => {
            const prevent = vi.fn();
            const ctx = baseContext({ showAnswer: false, faceReady: true });
            expect(resolveReviewKeyAction({ key: " ", code: "Space", preventDefault: prevent }, ctx)).toBe("reveal");
            expect(prevent).toHaveBeenCalled();
        });

        it("问题态但面未就绪：Space/Enter 不触发翻面", () => {
            const ctx = baseContext({ showAnswer: false, faceReady: false });
            expect(resolveReviewKeyAction({ key: " ", code: "Space" }, ctx)).toBeNull();
        });

        it("答案态：Space/Enter 触发 rate-default（良好 3）", () => {
            const ctx = baseContext({ showAnswer: true });
            expect(resolveReviewKeyAction({ key: "Enter", code: "Enter" }, ctx)).toBe("rate-default");
        });

        it("h 推进提示：仅在问题态且有卡片时生效", () => {
            const ctx = baseContext({ showAnswer: false, hasCurrent: true });
            expect(resolveReviewKeyAction({ key: "h" }, ctx)).toBe("advance-hint");

            const ansCtx = baseContext({ showAnswer: true, hasCurrent: true });
            expect(resolveReviewKeyAction({ key: "h" }, ansCtx)).toBeNull();
        });
    });

    describe("辅助控制键（x / 0 / f / s / [）", () => {
        it("x 或 0 触发 skip，问题态与答案态均可用", () => {
            expect(resolveReviewKeyAction({ key: "x" }, baseContext({ showAnswer: false }))).toBe("skip");
            expect(resolveReviewKeyAction({ key: "0" }, baseContext({ showAnswer: true }))).toBe("skip");
        });

        it("f 切换改期面板，s 暂停复习，m 切换助记便签", () => {
            expect(resolveReviewKeyAction({ key: "f" }, baseContext())).toBe("toggle-reschedule");
            expect(resolveReviewKeyAction({ key: "s" }, baseContext())).toBe("suspend");
            expect(resolveReviewKeyAction({ key: "m" }, baseContext({ hasCurrent: true }))).toBe("toggle-memo");
            expect(resolveReviewKeyAction({ key: "m" }, baseContext({ hasCurrent: false }))).toBeNull();
        });

        it("[ 仅在有上一张卡片（hasLastAnswered）时切换 peek", () => {
            expect(resolveReviewKeyAction({ key: "[" }, baseContext({ hasLastAnswered: true }))).toBe("toggle-peek");
            expect(resolveReviewKeyAction({ key: "[" }, baseContext({ hasLastAnswered: false }))).toBeNull();
        });

        it("e/E 或 o/O 触发 open-editor 原生编辑，对齐思源原生操作体验与 O 键记忆", () => {
            expect(resolveReviewKeyAction({ key: "e" }, baseContext({ hasCurrent: true }))).toBe("open-editor");
            expect(resolveReviewKeyAction({ key: "E" }, baseContext({ hasCurrent: true }))).toBe("open-editor");
            expect(resolveReviewKeyAction({ key: "o" }, baseContext({ hasCurrent: true }))).toBe("open-editor");
            expect(resolveReviewKeyAction({ key: "O" }, baseContext({ hasCurrent: true }))).toBe("open-editor");
            expect(resolveReviewKeyAction({ key: "e" }, baseContext({ hasCurrent: false }))).toBeNull();
            expect(resolveReviewKeyAction({ key: "o" }, baseContext({ hasCurrent: false }))).toBeNull();
        });
    });

    describe("四档与三档评分（1~4）与撤销（p / q）", () => {
        it("问题态下数字键与撤销键一律忽略", () => {
            const ctx = baseContext({ showAnswer: false });
            expect(resolveReviewKeyAction({ key: "1" }, ctx)).toBeNull();
            expect(resolveReviewKeyAction({ key: "p" }, ctx)).toBeNull();
        });

        it("四档模式：1~4 与方向键映射对应评分", () => {
            const ctx = baseContext({ showAnswer: true, ratingStyle: "four" });
            expect(resolveReviewKeyAction({ key: "1" }, ctx)).toBe("rate-1");
            expect(resolveReviewKeyAction({ key: "ArrowLeft" }, ctx)).toBe("rate-1");
            expect(resolveReviewKeyAction({ key: "2" }, ctx)).toBe("rate-2");
            expect(resolveReviewKeyAction({ key: "ArrowDown" }, ctx)).toBe("rate-2");
            expect(resolveReviewKeyAction({ key: "3" }, ctx)).toBe("rate-3");
            expect(resolveReviewKeyAction({ key: "ArrowRight" }, ctx)).toBe("rate-3");
            expect(resolveReviewKeyAction({ key: "4" }, ctx)).toBe("rate-4");
            expect(resolveReviewKeyAction({ key: "ArrowUp" }, ctx)).toBe("rate-4");
            expect(resolveReviewKeyAction({ key: "5" }, ctx)).toBeNull();
        });

        it("CF-18：四档与三档支持主键区人体工学按键 (J/K/L/;) 及双键位方案", () => {
            const ctxBoth = baseContext({ showAnswer: true, ratingStyle: "four", ratingKeyScheme: "both" });
            expect(resolveReviewKeyAction({ key: "j" }, ctxBoth)).toBe("rate-1");
            expect(resolveReviewKeyAction({ key: "J" }, ctxBoth)).toBe("rate-1");
            expect(resolveReviewKeyAction({ key: "k" }, ctxBoth)).toBe("rate-2");
            expect(resolveReviewKeyAction({ key: "l" }, ctxBoth)).toBe("rate-3");
            expect(resolveReviewKeyAction({ key: ";" }, ctxBoth)).toBe("rate-4");
            expect(resolveReviewKeyAction({ key: "；" }, ctxBoth)).toBe("rate-4");
            // 数字键依然有效
            expect(resolveReviewKeyAction({ key: "1" }, ctxBoth)).toBe("rate-1");
            expect(resolveReviewKeyAction({ key: "4" }, ctxBoth)).toBe("rate-4");

            // 仅人体工学方案
            const ctxJkl = baseContext({ showAnswer: true, ratingStyle: "four", ratingKeyScheme: "jkl" });
            expect(resolveReviewKeyAction({ key: "j" }, ctxJkl)).toBe("rate-1");
            expect(resolveReviewKeyAction({ key: ";" }, ctxJkl)).toBe("rate-4");
            expect(resolveReviewKeyAction({ key: "1" }, ctxJkl)).toBeNull();

            // 仅数字键方案
            const ctxNum = baseContext({ showAnswer: true, ratingStyle: "four", ratingKeyScheme: "number" });
            expect(resolveReviewKeyAction({ key: "1" }, ctxNum)).toBe("rate-1");
            expect(resolveReviewKeyAction({ key: "j" }, ctxNum)).toBeNull();

            // 三档模式人体工学映射
            const ctxThree = baseContext({ showAnswer: true, ratingStyle: "three", ratingKeyScheme: "both" });
            expect(resolveReviewKeyAction({ key: "j" }, ctxThree)).toBe("rate-1");
            expect(resolveReviewKeyAction({ key: "k" }, ctxThree)).toBe("rate-2");
            expect(resolveReviewKeyAction({ key: "l" }, ctxThree)).toBe("rate-3");
            expect(resolveReviewKeyAction({ key: ";" }, ctxThree)).toBeNull();
        });

        it("三档模式：1~3 映射评分，4 被忽略", () => {
            const ctx = baseContext({ showAnswer: true, ratingStyle: "three" });
            expect(resolveReviewKeyAction({ key: "1" }, ctx)).toBe("rate-1");
            expect(resolveReviewKeyAction({ key: "2" }, ctx)).toBe("rate-2");
            expect(resolveReviewKeyAction({ key: "3" }, ctx)).toBe("rate-3");
            expect(resolveReviewKeyAction({ key: "4" }, ctx)).toBeNull();
        });

        it("p 或 q 在有上一张作答记录时触发撤销操作（问题态与答案态均可）", () => {
            const ctxAnswer = baseContext({ showAnswer: true, hasLastAnswered: true });
            expect(resolveReviewKeyAction({ key: "p" }, ctxAnswer)).toBe("undo");
            expect(resolveReviewKeyAction({ key: "q" }, ctxAnswer)).toBe("undo");

            const ctxQuestion = baseContext({ showAnswer: false, hasLastAnswered: true });
            expect(resolveReviewKeyAction({ key: "p" }, ctxQuestion)).toBe("undo");
            expect(resolveReviewKeyAction({ key: "q" }, ctxQuestion)).toBe("undo");
        });

        it("r/z/* 快捷键触发翻转回忆、专注模式与星标切换", () => {
            expect(resolveReviewKeyAction({ key: "r" }, baseContext({ showAnswer: false, hasCurrent: true }))).toBe("toggle-reversed");
            expect(resolveReviewKeyAction({ key: "R" }, baseContext({ showAnswer: false, hasCurrent: true }))).toBe("toggle-reversed");
            expect(resolveReviewKeyAction({ key: "r" }, baseContext({ showAnswer: true, hasCurrent: true }))).toBeNull();

            expect(resolveReviewKeyAction({ key: "z" }, baseContext())).toBe("toggle-zen");
            expect(resolveReviewKeyAction({ key: "Z" }, baseContext())).toBe("toggle-zen");
            expect(resolveReviewKeyAction({ key: "z", ctrlKey: true }, baseContext())).toBeNull();

            expect(resolveReviewKeyAction({ key: "*" }, baseContext({ hasCurrent: true }))).toBe("toggle-star");
            expect(resolveReviewKeyAction({ key: "*" }, baseContext({ hasCurrent: false }))).toBeNull();
        });
    });

    describe("shouldIgnoreReviewKeydown", () => {
        it("除 Ctrl/Cmd+D 归档快捷键外，常规修饰键、合成中、重复按键或已阻止事件均被忽略", () => {
            expect(shouldIgnoreReviewKeydown({ defaultPrevented: true })).toBe(true);
            expect(shouldIgnoreReviewKeydown({ isComposing: true })).toBe(true);
            expect(shouldIgnoreReviewKeydown({ ctrlKey: true, key: "c" })).toBe(true);
            expect(shouldIgnoreReviewKeydown({ metaKey: true, key: "v" })).toBe(true);
            expect(shouldIgnoreReviewKeydown({ altKey: true })).toBe(true);
            expect(shouldIgnoreReviewKeydown({ repeat: true })).toBe(true);

            // Ctrl+D / Cmd+D 作为一键解散归档卡片的快捷键，必须放行进入调度
            expect(shouldIgnoreReviewKeydown({ ctrlKey: true, key: "d" })).toBe(false);
            expect(shouldIgnoreReviewKeydown({ ctrlKey: true, key: "D" })).toBe(false);
            expect(shouldIgnoreReviewKeydown({ metaKey: true, key: "d" })).toBe(false);
            expect(shouldIgnoreReviewKeydown({ metaKey: true, key: "D" })).toBe(false);
        });

        it("点击按钮或链接元素上的空格与回车不被全局抢占", () => {
            const btn = document.createElement("button");
            expect(shouldIgnoreReviewKeydown({ key: "Enter", target: btn })).toBe(true);
            expect(shouldIgnoreReviewKeydown({ key: " ", target: btn })).toBe(true);
        });

        it("普通卡面区域内的合法按键不被忽略", () => {
            const div = document.createElement("div");
            expect(shouldIgnoreReviewKeydown({ key: "1", target: div })).toBe(false);
            expect(shouldIgnoreReviewKeydown({ key: " ", target: div })).toBe(false);
        });
    });

    describe("resolveModalKeydownAction", () => {
        it("模态窗打开且按 Esc 时允许拦截并关闭", () => {
            const res = resolveModalKeydownAction({ key: "Escape" }, true, false);
            expect(res).toEqual({ shouldIntercept: true, shouldClose: true, isBusy: false });
        });

        it("模态窗忙碌（保存中/退休中）时拦截但不允许关闭", () => {
            const res = resolveModalKeydownAction({ key: "Escape" }, true, true);
            expect(res).toEqual({ shouldIntercept: true, shouldClose: false, isBusy: true });
        });

        it("模态窗打开时按下其他任意键（如 Space/Enter/x）一律拦截且不关闭", () => {
            expect(resolveModalKeydownAction({ key: "Enter" }, true, false)).toEqual({ shouldIntercept: true, shouldClose: false, isBusy: false });
            expect(resolveModalKeydownAction({ key: " " }, true, false)).toEqual({ shouldIntercept: true, shouldClose: false, isBusy: false });
            expect(resolveModalKeydownAction({ key: "x" }, true, false)).toEqual({ shouldIntercept: true, shouldClose: false, isBusy: false });
        });

        it("无模态窗打开时返回 null", () => {
            expect(resolveModalKeydownAction({ key: "Escape" }, false, false)).toBeNull();
            expect(resolveModalKeydownAction({ key: "Enter" }, false, false)).toBeNull();
        });
    });

    describe("isAnyReviewModalOpen", () => {
        it("四种弹窗任一开启时返回 true", () => {
            expect(isAnyReviewModalOpen({ showPauseModal: true, showSessionOptionsModal: false, showMemoEditor: false, showRetireModal: false })).toBe(true);
            expect(isAnyReviewModalOpen({ showPauseModal: false, showSessionOptionsModal: true, showMemoEditor: false, showRetireModal: false })).toBe(true);
            expect(isAnyReviewModalOpen({ showPauseModal: false, showSessionOptionsModal: false, showMemoEditor: true, showRetireModal: false })).toBe(true);
            expect(isAnyReviewModalOpen({ showPauseModal: false, showSessionOptionsModal: false, showMemoEditor: false, showRetireModal: true })).toBe(true);
        });

        it("全部关闭时返回 false", () => {
            expect(isAnyReviewModalOpen({ showPauseModal: false, showSessionOptionsModal: false, showMemoEditor: false, showRetireModal: false })).toBe(false);
        });
    });

    describe("resolveRatingFromShortcutAction", () => {
        it("正确将 rate-1 到 rate-4 动作映射为 1-4 评级数值", () => {
            expect(resolveRatingFromShortcutAction("rate-1")).toBe(1);
            expect(resolveRatingFromShortcutAction("rate-2")).toBe(2);
            expect(resolveRatingFromShortcutAction("rate-3")).toBe(3);
            expect(resolveRatingFromShortcutAction("rate-4")).toBe(4);
        });

        it("其他动作或 null 返回 null", () => {
            expect(resolveRatingFromShortcutAction("reveal")).toBeNull();
            expect(resolveRatingFromShortcutAction("undo")).toBeNull();
            expect(resolveRatingFromShortcutAction(null)).toBeNull();
        });
    });
});
