import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";

describe("选择框与输入控件文字垂直/水平居中规范审查", () => {
    it("index.scss 中 b3-select 与 input 统一配置合规的最小高度、垂直对齐与行高", () => {
        const scss = readFileSync("src/index.scss", "utf8");

        // b3-select 不再强制定死 38px，而是 32px 并包含垂直对齐与控制行高
        expect(scss).toMatch(/\.b3-select\s*\{[\s\S]*?min-height:\s*32px;/);
        expect(scss).toMatch(/\.b3-select\s*\{[\s\S]*?line-height:\s*var\(--lv-lh-control-lg\);/);
        expect(scss).toMatch(/\.b3-select\s*\{[\s\S]*?vertical-align:\s*middle;/);

        // input.b3-text-field 单行文本框统一盒模型与垂直居中
        expect(scss).toMatch(/input\.b3-text-field\s*\{[\s\S]*?min-height:\s*32px;/);
        expect(scss).toMatch(/input\.b3-text-field\s*\{[\s\S]*?line-height:\s*var\(--lv-lh-control-lg\);/);
        expect(scss).toMatch(/input\.b3-text-field\s*\{[\s\S]*?vertical-align:\s*middle;/);
    });

    it("manager.svelte 中 lv-sort 下拉选择框严格居中并与相邻 chipbtn 高度对齐", () => {
        const svelte = readFileSync("src/ui/manager.svelte", "utf8");

        // lv-sort 下拉框必须显式声明 min-height: 30px、行高与文字居中，彻底根除文字偏上
        expect(svelte).toMatch(/\.lv-sort\s*\{[\s\S]*?height:\s*30px;/);
        expect(svelte).toMatch(/\.lv-sort\s*\{[\s\S]*?min-height:\s*30px;/);
        expect(svelte).toMatch(/\.lv-sort\s*\{[\s\S]*?line-height:\s*var\(--lv-lh-control-lg\);/);
        expect(svelte).toMatch(/\.lv-sort\s*\{[\s\S]*?text-align-last:\s*center;/);
        expect(svelte).toMatch(/\.lv-sort\s*\{[\s\S]*?vertical-align:\s*middle;/);

        // 搜索框 lv-filter 必须有匹配的高度与行高，保证单行文本垂直居中
        expect(svelte).toMatch(/\.lv-filter\s*\{[\s\S]*?height:\s*38px;/);
        expect(svelte).toMatch(/\.lv-filter\s*\{[\s\S]*?line-height:\s*var\(--lv-lh-control-lg\);/);
    });

    it("ReviewSessionPrefs / ReviewToolbar 中 lv-scope 下拉框严格设置 min-height、行高与文字居中", () => {
        const path = existsSync("src/ui/review/ReviewSessionPrefs.svelte")
            ? "src/ui/review/ReviewSessionPrefs.svelte"
            : "src/ui/review.svelte";
        const svelte = readFileSync(path, "utf8");

        expect(svelte).toMatch(/\.lv-scope\s*\{[\s\S]*?height:\s*28px;/);
        expect(svelte).toMatch(/\.lv-scope\s*\{[\s\S]*?min-height:\s*28px;/);
        expect(svelte).toMatch(/\.lv-scope\s*\{[\s\S]*?line-height:\s*var\(--lv-lh-control-lg\);/);
        expect(svelte).toMatch(/\.lv-scope\s*\{[\s\S]*?text-align-last:\s*center;/);
    });

    it("kit 基础组件 LvSelect 与 LvInput 自带盒模型与居中对齐声明", () => {
        const selectSvelte = readFileSync("src/ui/kit/LvSelect.svelte", "utf8");
        expect(selectSvelte).toMatch(/select\.b3-select\s*\{[\s\S]*?vertical-align:\s*middle;/);

        const inputSvelte = readFileSync("src/ui/kit/LvInput.svelte", "utf8");
        expect(inputSvelte).toMatch(/input\.b3-text-field\s*\{[\s\S]*?vertical-align:\s*middle;/);
    });
});
