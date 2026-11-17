import { describe, expect, it, vi } from "vitest";
import {
    handleCardContentClick,
    handleCardCanvasDblClick,
    togglePeekCard,
    isOverlayTarget,
    shouldRefreshOnPanelPointer,
    resolveEditorNavigationBlockId,
    createZoomedImageState,
    shouldRevealOnContainerClick,
    isEventInsideContainer,
    focusReviewRootOrCard,
} from "@/core/card-interactions";

describe("card-interactions 卡片内容点击、画板编辑与回看切换", () => {
    describe("handleCardContentClick", () => {
        it("点击图片返回放大预览动作", () => {
            const img = document.createElement("img");
            img.src = "https://example.com/test.png";
            img.alt = "测试图";

            const res = handleCardContentClick(img, false, null);
            expect(res).toEqual({
                type: "zoom-image",
                src: "https://example.com/test.png",
                alt: "测试图",
            });
        });

        it("问题态下点击挖空返回逐空揭晓动作", () => {
            const container = document.createElement("div");
            const mark = document.createElement("span");
            mark.setAttribute("data-type", "mark");
            mark.setAttribute("data-cloze-idx", "0");
            mark.setAttribute("data-real-answer", "答案");
            container.appendChild(mark);

            const res = handleCardContentClick(mark, false, container);
            expect(res).not.toBeNull();
            expect(res?.type).toBe("cloze-reveal");
            expect((res as any)?.allRevealed).toBe(true);
        });

        it("答案态下点击挖空不触发逐空揭晓", () => {
            const mark = document.createElement("span");
            mark.setAttribute("data-type", "mark");
            expect(handleCardContentClick(mark, true, null)).toBeNull();
        });

        it("非相关元素返回 null", () => {
            const p = document.createElement("p");
            expect(handleCardContentClick(p, false, null)).toBeNull();
            expect(handleCardContentClick(null, false, null)).toBeNull();
        });
    });

    describe("handleCardCanvasDblClick", () => {
        it("双击画布节点提取父级 data-node-id", () => {
            const wrapper = document.createElement("div");
            wrapper.setAttribute("data-node-id", "block-canvas-123");
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            wrapper.appendChild(svg);

            const id = handleCardCanvasDblClick(svg, "fallback-id");
            expect(id).toBe("block-canvas-123");
        });

        it("无父级 data-node-id 时回退使用 currentBlockID", () => {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            const id = handleCardCanvasDblClick(svg, "fallback-id");
            expect(id).toBe("fallback-id");
        });

        it("普通文本双击返回 null", () => {
            const span = document.createElement("span");
            expect(handleCardCanvasDblClick(span, "fallback-id")).toBeNull();
        });
    });

    describe("togglePeekCard", () => {
        const last = { html: "<p>上张卡</p>", card: { cardID: "c1" } as any, revealed: true };

        it("当前已打开 Peek 时切换为关闭", () => {
            const res = togglePeekCard(last, last);
            expect(res.status).toBe("closed");
            expect(res.nextPeek).toBeNull();
        });

        it("有上一张记录时打开 Peek", () => {
            const res = togglePeekCard(null, last);
            expect(res.status).toBe("opened");
            expect(res.nextPeek?.html).toBe("<p>上张卡</p>");
        });

        it("无上一张记录时返回 none", () => {
            const res = togglePeekCard(null, null);
            expect(res.status).toBe("none");
            expect(res.nextPeek).toBeNull();
        });
    });

    describe("isOverlayTarget", () => {
        it("正确识别模态遮罩与二级工具菜单", () => {
            const backdrop = document.createElement("div");
            backdrop.className = "lv-modal-backdrop";
            const inner = document.createElement("button");
            backdrop.appendChild(inner);

            expect(isOverlayTarget(inner)).toBe(true);
            expect(isOverlayTarget(document.createElement("div"))).toBe(false);
            expect(isOverlayTarget(null)).toBe(false);
        });
    });

    describe("shouldRefreshOnPanelPointer", () => {
        it("离开面板超过 15 秒返回 true", () => {
            expect(shouldRefreshOnPanelPointer(1000, 17000, 15000)).toBe(true);
            expect(shouldRefreshOnPanelPointer(1000, 12000, 15000)).toBe(false);
            expect(shouldRefreshOnPanelPointer(0, 17000, 15000)).toBe(false);
        });
    });

    describe("resolveEditorNavigationBlockId", () => {
        it("优先返回 canvasId", () => {
            expect(resolveEditorNavigationBlockId("canvas-1", "block-1")).toBe("canvas-1");
        });

        it("canvasId 为空时回退到 currentBlockId", () => {
            expect(resolveEditorNavigationBlockId(undefined, "block-1")).toBe("block-1");
            expect(resolveEditorNavigationBlockId("", "block-1")).toBe("block-1");
        });

        it("均为空时返回 null", () => {
            expect(resolveEditorNavigationBlockId(undefined, undefined)).toBeNull();
            expect(resolveEditorNavigationBlockId("", "")).toBeNull();
        });
    });

    describe("createZoomedImageState", () => {
        it("正确生成图片放大预览状态对象", () => {
            expect(createZoomedImageState("https://example.com/img.png", "说明")).toEqual({
                src: "https://example.com/img.png",
                alt: "说明",
            });
            expect(createZoomedImageState("https://example.com/img.png")).toEqual({
                src: "https://example.com/img.png",
                alt: undefined,
            });
        });
    });

    describe("shouldRevealOnContainerClick", () => {
        const base = {
            hasModalsOpen: false,
            target: document.createElement("div"),
            showAnswer: false,
            hasCurrent: true,
            faceReady: true,
        };

        it("普通卡面在问题态且无模态窗时允许点击翻面", () => {
            expect(shouldRevealOnContainerClick(base)).toBe(true);
        });

        it("已翻面或卡面未就绪时不触发", () => {
            expect(shouldRevealOnContainerClick({ ...base, showAnswer: true })).toBe(false);
            expect(shouldRevealOnContainerClick({ ...base, faceReady: false })).toBe(false);
            expect(shouldRevealOnContainerClick({ ...base, hasCurrent: false })).toBe(false);
        });

        it("模态窗开启或点击按钮/输入控件时阻止翻面", () => {
            expect(shouldRevealOnContainerClick({ ...base, hasModalsOpen: true })).toBe(false);

            const btn = document.createElement("button");
            expect(shouldRevealOnContainerClick({ ...base, target: btn })).toBe(false);
        });
    });

    describe("isEventInsideContainer", () => {
        it("目标为容器子节点时返回 true", () => {
            const container = document.createElement("div");
            const child = document.createElement("span");
            container.appendChild(child);

            expect(isEventInsideContainer(container, child)).toBe(true);
            expect(isEventInsideContainer(container, container)).toBe(true);
        });

        it("目标为外部节点、空或非 Node 时返回 false", () => {
            const container = document.createElement("div");
            const external = document.createElement("span");

            expect(isEventInsideContainer(container, external)).toBe(false);
            expect(isEventInsideContainer(container, null)).toBe(false);
            expect(isEventInsideContainer(null, external)).toBe(false);
        });
    });

    describe("focusReviewRootOrCard", () => {
        it("优先对 rootEl 聚焦，rootEl 为空时回退到 cardEl", () => {
            const root = { focus: vi.fn() };
            const card = { focus: vi.fn() };

            focusReviewRootOrCard(root as any, card as any);
            expect(root.focus).toHaveBeenCalledTimes(1);
            expect(card.focus).not.toHaveBeenCalled();

            focusReviewRootOrCard(null, card as any);
            expect(card.focus).toHaveBeenCalledTimes(1);

            expect(() => focusReviewRootOrCard(null, null)).not.toThrow();
        });
    });
});
