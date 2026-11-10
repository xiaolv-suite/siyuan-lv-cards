import { afterEach, describe, expect, it, vi } from "vitest";
import { mathTokensPresent, ensureKatex, renderMathIn } from "../src/libs/math-render";

describe("math-render (R57 卡面公式补渲染)", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete (window as any).katex;
        document.head.innerHTML = "";
    });

    it("mathTokensPresent detects kernel hollow tokens and rendered katex", () => {
        expect(mathTokensPresent('<span data-type="inline-math" data-content="E=mc^2" class="render-node"></span>')).toBe(true);
        expect(mathTokensPresent('<div data-type="NodeMathBlock" class="language-math">…</div>')).toBe(true);
        expect(mathTokensPresent('<span class="katex">…</span>')).toBe(true);
        expect(mathTokensPresent("<p>plain text</p>")).toBe(false);
        expect(mathTokensPresent("")).toBe(false);
    });

    it("renderMathIn renders hollow nodes with host katex and skips already-rendered", async () => {
        const container = document.createElement("div");
        container.innerHTML = `
            <span data-type="inline-math" data-content="E=mc^2" class="render-node"></span>
            <span data-type="inline-math" data-content="\\alpha" class="render-node"><span class="katex">done</span></span>
            <span class="plain">no math</span>`;
        document.body.appendChild(container);

        const calls: { src: string; display: boolean }[] = [];
        (window as any).katex = {
            render: (src: string, el: HTMLElement, opts: { displayMode: boolean }) => {
                calls.push({ src, display: opts.displayMode });
                el.textContent = `R:${src}`;
            },
        };

        const count = await renderMathIn(container);
        expect(count).toBe(1);
        expect(calls).toEqual([{ src: "E=mc^2", display: false }]);
        expect(container.querySelectorAll(".render-node")[0].textContent).toBe("R:E=mc^2");
    });

    it("renderMathIn returns 0 without katex and does not throw", async () => {
        const container = document.createElement("div");
        container.innerHTML = '<span data-type="inline-math" data-content="x" class="render-node"></span>';
        document.body.appendChild(container);
        const count = await renderMathIn(container);
        expect(count).toBe(0);
    });

    it("renderMathIn handles block math with displayMode and null container", async () => {
        expect(await renderMathIn(null)).toBe(0);

        const container = document.createElement("div");
        container.innerHTML = '<div data-type="NodeMathBlock"><span data-type="math" data-content="a+b" class="render-node"></span></div>';
        document.body.appendChild(container);
        (window as any).katex = { render: vi.fn() };
        await renderMathIn(container);
        expect((window as any).katex.render).toHaveBeenCalledWith("a+b", expect.any(HTMLElement), expect.objectContaining({ displayMode: true }));
    });

    it("ensureKatex resolves true when global already present", async () => {
        (window as any).katex = { render: vi.fn() };
        expect(await ensureKatex()).toBe(true);
    });
});
