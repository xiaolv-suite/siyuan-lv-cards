import { describe, expect, it } from "vitest";
import { parseOcclusion, serializeOcclusion, emptyOcclusion, calculateOcclusionBox, findOcclusionTarget } from "../src/core/occlusion";

describe("occlusion 数据契约（M4·FR4）", () => {
    const valid = { v: 1 as const, rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }] };

    it("serialize→parse 往返一致", () => {
        const attrs = serializeOcclusion(valid);
        expect(attrs["lv-occlusion"]).toBeTruthy();
        expect(parseOcclusion(attrs)).toEqual(valid);
    });

    it("缺属性/空串/坏 JSON/错版本/rects 非数组 → null（宽容不抛错）", () => {
        expect(parseOcclusion({})).toBeNull();
        expect(parseOcclusion({ "lv-occlusion": "" })).toBeNull();
        expect(parseOcclusion({ "lv-occlusion": "{not json" })).toBeNull();
        expect(parseOcclusion({ "lv-occlusion": JSON.stringify({ v: 2, rects: [] }) })).toBeNull();
        expect(parseOcclusion({ "lv-occlusion": JSON.stringify({ v: 1, rects: "x" }) })).toBeNull();
        expect(parseOcclusion({ "lv-occlusion": JSON.stringify({ v: 1, rects: [{ x: -1, y: 0, w: 0.5, h: 0.5 }] }) })).toBeNull();
        expect(parseOcclusion({ "lv-occlusion": JSON.stringify({ v: 1, rects: [{ x: 0, y: 0, w: 2, h: 0.5 }] }) })).toBeNull();
        expect(parseOcclusion({ "lv-occlusion": "null" })).toBeNull();
    });

    it("emptyOcclusion 序列化后可解析回空 rects", () => {
        const back = parseOcclusion(serializeOcclusion(emptyOcclusion()));
        expect(back).toEqual({ v: 1, rects: [] });
    });

    it("多框数据保留顺序与坐标", () => {
        const data = { v: 1 as const, rects: [{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.25, h: 0.25 }] };
        expect(parseOcclusion(serializeOcclusion(data))).toEqual(data);
    });

    describe("calculateOcclusionBox 几何包围盒计算", () => {
        it("容器或遮挡标记为空时返回 null", () => {
            expect(calculateOcclusionBox(null, true)).toBeNull();
            const div = document.createElement("div");
            expect(calculateOcclusionBox(div, false)).toBeNull();
        });

        it("容器内无图片元素时返回 null", () => {
            const div = document.createElement("div");
            div.innerHTML = "<p>无图内容</p>";
            expect(calculateOcclusionBox(div, true)).toBeNull();
        });

        it("卡面外层的界面图标（来源面包屑 svg）排在图片前面时，仍定位到卡面内容区里的图片", () => {
            // 回归：v0.219.0 走查发现遮挡层被贴到 16×16 的面包屑图标上，图片在问题态完整露出
            const card = document.createElement("div");
            card.innerHTML = `<div class="crumb"><svg class="icon"></svg></div><div class="lv-card-content"><p><img src="a.png"></p></div>`;
            const img = card.querySelector("img")!;
            expect(findOcclusionTarget(card)).toBe(img);
            card.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => {} });
            img.getBoundingClientRect = () => ({ left: 40, top: 90, width: 256, height: 256, right: 296, bottom: 346, x: 40, y: 90, toJSON: () => {} });
            expect(calculateOcclusionBox(card, true)).toEqual({ l: 40, t: 90, w: 256, h: 256 });
        });

        it("内容区里没有图片时才退回画布或绘图 svg", () => {
            const card = document.createElement("div");
            card.innerHTML = `<svg class="icon"></svg><div class="lv-card-content"><svg class="drawing"></svg></div>`;
            expect(findOcclusionTarget(card)?.getAttribute("class")).toBe("drawing");
        });

        it("正确计算相对坐标与尺寸", () => {
            const div = document.createElement("div");
            const img = document.createElement("img");
            div.appendChild(img);

            div.getBoundingClientRect = () => ({
                left: 100,
                top: 50,
                width: 800,
                height: 600,
                right: 900,
                bottom: 650,
                x: 100,
                y: 50,
                toJSON: () => {},
            });

            img.getBoundingClientRect = () => ({
                left: 150,
                top: 90,
                width: 400,
                height: 300,
                right: 550,
                bottom: 390,
                x: 150,
                y: 90,
                toJSON: () => {},
            });

            div.scrollLeft = 10;
            div.scrollTop = 20;

            const box = calculateOcclusionBox(div, true);
            expect(box).toEqual({
                l: 150 - 100 + 10, // 60
                t: 90 - 50 + 20,   // 60
                w: 400,
                h: 300,
            });
        });
    });
});

