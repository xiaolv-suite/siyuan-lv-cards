import { describe, expect, it, vi } from "vitest";
import {
    revealSingleCloze,
    queryClozeMarks,
    isAllClozeRevealed,
    stepNextCloze,
    advanceClozeStep,
} from "@/core/cloze-stepper";

describe("cloze-stepper 逐空揭晓控制器", () => {
    it("revealSingleCloze 能正确还原文本与标记属性，并具备幂等性", () => {
        const span = document.createElement("span");
        span.setAttribute("data-type", "mark");
        span.setAttribute("data-cloze-idx", "0");
        span.setAttribute("data-real-answer", "真实答案");
        span.setAttribute("aria-hidden", "true");
        span.textContent = "[...]";

        const changed = revealSingleCloze(span);
        expect(changed).toBe(true);
        expect(span.textContent).toBe("真实答案");
        expect(span.hasAttribute("aria-hidden")).toBe(false);
        expect(span.classList.contains("lv-step-revealed")).toBe(true);
        expect(span.getAttribute("title")).toBe("已揭晓");

        // 再次调用返回 false
        expect(revealSingleCloze(span)).toBe(false);
    });

    it("queryClozeMarks 与 isAllClozeRevealed 正确识别并检测全部揭晓状态", () => {
        const div = document.createElement("div");
        div.innerHTML = `
            <p>第一空：<span data-type="mark" data-cloze-idx="0" data-real-answer="A">[...]</span></p>
            <p>第二空：<mark class="lv-masked" data-cloze-idx="1" data-real-answer="B">[...]</mark></p>
        `;

        const marks = queryClozeMarks(div);
        expect(marks.length).toBe(2);
        expect(isAllClozeRevealed(div)).toBe(false);

        revealSingleCloze(marks[0]);
        expect(isAllClozeRevealed(div)).toBe(false);

        revealSingleCloze(marks[1]);
        expect(isAllClozeRevealed(div)).toBe(true);
    });

    it("stepNextCloze 支持多空逐步推进，并在单空或强制全翻时适时返回", () => {
        const div = document.createElement("div");
        div.innerHTML = `
            <p>A：<span data-type="mark" data-cloze-idx="0" data-real-answer="1">[...]</span></p>
            <p>B：<span data-type="mark" data-cloze-idx="1" data-real-answer="2">[...]</span></p>
            <p>C：<span data-type="mark" data-cloze-idx="2" data-real-answer="3">[...]</span></p>
        `;

        // 步进第 1 空
        const step1 = stepNextCloze(div);
        expect(step1.revealed).toBe(true);
        expect(step1.allRevealed).toBe(false);
        expect(step1.nextElement?.textContent).toBe("1");

        // 步进第 2 空
        const step2 = stepNextCloze(div);
        expect(step2.revealed).toBe(true);
        expect(step2.allRevealed).toBe(false);
        expect(step2.nextElement?.textContent).toBe("2");

        // 步进第 3 空（最后一空，allRevealed 变为 true）
        const step3 = stepNextCloze(div);
        expect(step3.revealed).toBe(true);
        expect(step3.allRevealed).toBe(true);
        expect(step3.nextElement?.textContent).toBe("3");

        // 已全部揭晓后继续调用
        const step4 = stepNextCloze(div);
        expect(step4.revealed).toBe(false);
        expect(step4.allRevealed).toBe(true);
    });

    it("单空卡片不启动逐空，直接返回 false 供全卡直接翻面", () => {
        const div = document.createElement("div");
        div.innerHTML = `<p>单空：<span data-type="mark" data-cloze-idx="0">[...]</span></p>`;

        const res = stepNextCloze(div);
        expect(res.revealed).toBe(false);
    });

    describe("advanceClozeStep", () => {
        it("步数递增并在未全部揭晓时不触发回调", () => {
            const onAllRevealed = vi.fn();
            const count = advanceClozeStep(1, false, onAllRevealed);
            expect(count).toBe(2);
            expect(onAllRevealed).not.toHaveBeenCalled();
        });

        it("全部揭晓时执行 onAllRevealed 回调", () => {
            const onAllRevealed = vi.fn();
            const count = advanceClozeStep(2, true, onAllRevealed);
            expect(count).toBe(3);
            expect(onAllRevealed).toHaveBeenCalledTimes(1);
        });
    });
});
