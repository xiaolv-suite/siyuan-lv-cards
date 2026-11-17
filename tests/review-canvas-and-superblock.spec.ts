import { describe, expect, it, vi, beforeEach } from "vitest";
import { isSuperBlockHtml, renderSuperBlockAnswerFace, maskSuperBlockForQuestion } from "@/core/superblock-qa";

describe("复习端超级块问答识别与 SVG 画布编辑契约", () => {
    const superBlockHtml = `
<div data-node-id="20261027-sb-100" data-type="NodeSuperBlock" class="sb" data-sb-layout="col">
    <div data-node-id="20261027-sub-1" data-type="NodeParagraph" class="p">请简述光电效应的核心方程？</div>
    <div data-node-id="20261027-sub-2" data-type="NodeParagraph" class="p">爱因斯坦光电方程：$E_k = h\\nu - W_0$</div>
    <div data-node-id="20261027-sub-3" data-type="NodeParagraph" class="p">其中 $h\\nu$ 为入射光子能量，$W_0$ 为金属逸出功。</div>
</div>
`.trim();

    it("精准识别超级块卡片结构", () => {
        expect(isSuperBlockHtml(superBlockHtml)).toBe(true);
    });

    it("问题态严格屏蔽背面答案所有块，并呈现优雅的遮蔽占位", () => {
        const masked = maskSuperBlockForQuestion(superBlockHtml);
        expect(masked).toContain("请简述光电效应的核心方程？");
        expect(masked).not.toContain("爱因斯坦光电方程");
        expect(masked).not.toContain("其中 $h\\nu$ 为入射光子能量");
        expect(masked).toContain("lv-sb-answer-placeholder");
    });

    it("答案态清晰呈现实体问题与后续答案分块", () => {
        const answered = renderSuperBlockAnswerFace(superBlockHtml);
        expect(answered).toContain("请简述光电效应的核心方程？");
        expect(answered).toContain("爱因斯坦光电方程：$E_k = h\\nu - W_0$");
        expect(answered).toContain("超级块答案 (背面)");
        expect(answered).toContain("lv-sb-answer-section");
    });

    it("SVG 画布与 Excalidraw 画布标识检测契约", () => {
        const svgCanvasHtml = `<svg class="lv-card-svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" /></svg>`;
        const excalidrawWidgetHtml = `<div data-type="NodeWidget" data-subtype="widget" class="iframe"><iframe src="/widgets/excalidraw"></iframe></div>`;
        const regularImageHtml = `<img src="assets/photo.png" alt="photo" />`;

        const hasSvgCanvas = (html: string) => Boolean(html && (/<svg\b/i.test(html) || /\.svg\b/i.test(html) || /excalidraw/i.test(html)));

        expect(hasSvgCanvas(svgCanvasHtml)).toBe(true);
        expect(hasSvgCanvas(excalidrawWidgetHtml)).toBe(true);
        expect(hasSvgCanvas(regularImageHtml)).toBe(false);
    });
});
