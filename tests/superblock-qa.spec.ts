import { describe, expect, it } from "vitest";
import {
    isSuperBlockHtml,
    splitSuperBlockElements,
    maskSuperBlockForQuestion,
    renderSuperBlockAnswerFace,
    extractSuperBlockTexts,
} from "@/core/superblock-qa";

describe("超级块闪卡（SuperBlock Flashcard）问答识别与分割引擎", () => {
    // 仿真思源内核 getBlockDOM 返回的标准超级块结构
    const sampleSuperBlockHtml = `
<div data-node-id="20261027-sb-1" data-type="NodeSuperBlock" class="sb" data-sb-layout="col">
    <div data-node-id="20261027-sub-1" data-type="NodeParagraph" class="p">这是超级块的问题（正面题干）</div>
    <div data-node-id="20261027-sub-2" data-type="NodeParagraph" class="p">这是超级块的答案第一段</div>
    <div data-node-id="20261027-sub-3" data-type="NodeList" class="list">
        <div data-node-id="20261027-sub-4" data-type="NodeListItem" class="li">这是答案中的列表项1</div>
        <div data-node-id="20261027-sub-5" data-type="NodeListItem" class="li">这是答案中的列表项2</div>
    </div>
</div>
`.trim();

    const sampleSingleBlockHtml = `
<div data-node-id="20261027-p-1" data-type="NodeParagraph" class="p">普通的段落卡片 ==普通答案==</div>
`.trim();

    describe("isSuperBlockHtml 判定", () => {
        it("能准确识别超级块 HTML", () => {
            expect(isSuperBlockHtml(sampleSuperBlockHtml)).toBe(true);
            expect(isSuperBlockHtml(sampleSingleBlockHtml)).toBe(false);
            expect(isSuperBlockHtml("")).toBe(false);
        });
    });

    describe("splitSuperBlockElements 子块提取", () => {
        it("将第1个子块作为问题，第2个及后续所有子块作为答案", () => {
            const result = splitSuperBlockElements(sampleSuperBlockHtml);
            expect(result).not.toBeNull();
            if (!result) return;

            expect(result.questionHtml).toContain("这是超级块的问题（正面题干）");
            expect(result.questionHtml).not.toContain("这是超级块的答案第一段");

            expect(result.answerHtml).toContain("这是超级块的答案第一段");
            expect(result.answerHtml).toContain("这是答案中的列表项1");
            expect(result.answerSubBlockCount).toBe(2);
        });
    });

    describe("maskSuperBlockForQuestion 问题态遮罩", () => {
        it("问题态只渲染第1个子块，遮蔽/隐藏后续所有答案子块，杜绝提前剧透", () => {
            const qHtml = maskSuperBlockForQuestion(sampleSuperBlockHtml);
            expect(qHtml).toContain("这是超级块的问题（正面题干）");
            expect(qHtml).not.toContain("这是超级块的答案第一段");
            expect(qHtml).not.toContain("这是答案中的列表项1");
            expect(qHtml).toContain("lv-sb-answer-placeholder");
        });

        it("若第1个子块本身带 ==挖空==，问题态对该挖空也执行遮罩", () => {
            const htmlWithCloze = `
<div data-node-id="20261027-sb-2" data-type="NodeSuperBlock" class="sb">
    <div data-node-id="sub-1" data-type="NodeParagraph" class="p">DNA 的全称是 ==脱氧核糖核酸==</div>
    <div data-node-id="sub-2" data-type="NodeParagraph" class="p">补充信息：它是生物体的遗传物质</div>
</div>`;
            const qHtml = maskSuperBlockForQuestion(htmlWithCloze);
            expect(qHtml).toContain("DNA 的全称是");
            expect(qHtml).not.toContain("脱氧核糖核酸");
            expect(qHtml).not.toContain("补充信息：它是生物体的遗传物质");
        });
    });

    describe("renderSuperBlockAnswerFace 答案态揭晓渲染", () => {
        it("答案态清晰分隔正面问题与背面答案区域", () => {
            const aHtml = renderSuperBlockAnswerFace(sampleSuperBlockHtml);
            expect(aHtml).toContain("这是超级块的问题（正面题干）");
            expect(aHtml).toContain("这是超级块的答案第一段");
            expect(aHtml).toContain("这是答案中的列表项1");
            expect(aHtml).toContain("lv-sb-answer-section");
        });
    });

    describe("extractSuperBlockTexts 文本提取", () => {
        it("打字题与答案抽取精准分离题干与答案", () => {
            const texts = extractSuperBlockTexts(sampleSuperBlockHtml);
            expect(texts).not.toBeNull();
            if (!texts) return;

            expect(texts.questionText).toBe("这是超级块的问题（正面题干）");
            expect(texts.answerText).toContain("这是超级块的答案第一段");
            expect(texts.answerText).toContain("这是答案中的列表项1");
            expect(texts.answerText).not.toContain("这是超级块的问题（正面题干）");
        });
    });
});
