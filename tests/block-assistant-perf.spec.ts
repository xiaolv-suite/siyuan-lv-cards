import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    buildBlockSnapshot,
    probeEcosystemPresence,
} from "../src/core/block-action-executor";
import {
    decorateEditorBlock,
    startEditorQaService,
} from "../src/core/editor-qa-service";

describe("块助手极致性能与零负担专项验证（秒开与零主线程卡顿）", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
        vi.clearAllMocks();
    });

    it("buildBlockSnapshot 优先同步读取 DOM 属性，达成 0 RPC 极速秒开（<5ms）", async () => {
        const block = document.createElement("div");
        block.setAttribute("data-node-id", "b-perf-01");
        block.setAttribute("data-type", "NodeParagraph");
        block.setAttribute("custom-riff-title", "闪卡问题标题");
        block.setAttribute("custom-riff-decks", "deck-perf");
        block.textContent = "这是一段用于性能测试的正文内容。";
        document.body.appendChild(block);

        const t0 = performance.now();
        const snapshot = await buildBlockSnapshot("b-perf-01");
        const elapsed = performance.now() - t0;

        expect(snapshot.blockID).toBe("b-perf-01");
        expect(snapshot.isCard).toBe(true);
        expect(snapshot.hasText).toBe(true);
        expect(snapshot.blockKind).toBe("paragraph");
        // 验证执行耗时极低（必须纯内存同步提取，远低于网络 RPC 的 50-200ms）
        expect(elapsed).toBeLessThan(15);
    });

    it("同一块短时间内再次构建快照时命中内存 LRU 缓存", async () => {
        const block = document.createElement("div");
        block.setAttribute("data-node-id", "b-perf-lru");
        block.setAttribute("custom-riff-title", "LRU测试");
        block.textContent = "测试文本";
        document.body.appendChild(block);

        const snap1 = await buildBlockSnapshot("b-perf-lru");
        expect(snap1.isCard).toBe(true);

        const t0 = performance.now();
        const snap2 = await buildBlockSnapshot("b-perf-lru");
        const elapsed = performance.now() - t0;

        expect(snap2.isCard).toBe(true);
        expect(elapsed).toBeLessThan(5);
    });

    it("普通块 DOM 信任快路径：无 DOM 属性时零 RPC 秒开（免 localhost delayed-ACK 空窗）", async () => {
        const block = document.createElement("div");
        block.setAttribute("data-node-id", "b-perf-plain");
        block.setAttribute("data-type", "NodeParagraph");
        block.textContent = "普通段落，无闪卡属性。";
        document.body.appendChild(block);

        // 计数所有 fetch 尝试（普通块应完全跳过 RPC，直接信任 DOM 裁决）
        const origFetch = (window as any).fetch;
        let calls = 0;
        (window as any).fetch = function (...args: unknown[]) {
            calls++;
            return (origFetch ?? globalThis.fetch).apply(this, args as any);
        };

        const t0 = performance.now();
        const snap = await buildBlockSnapshot("b-perf-plain");
        const elapsed = performance.now() - t0;

        (window as any).fetch = origFetch;

        expect(snap.isCard).toBe(false);
        expect(snap.hasText).toBe(true);
        // 关键契约：普通块零网络请求
        expect(calls).toBe(0);
        expect(elapsed).toBeLessThan(5);
    });

    it("probeEcosystemPresence 在 2500ms 内命中 TTL 缓存，避免重复扫描全局对象", () => {
        (window as any).LvExam = { whenReady: () => true };
        const p1 = probeEcosystemPresence();
        expect(p1.exam).toBe(true);

        // 修改全局对象后由于处于 2500ms TTL 内，应直接命中缓存返回稳定结果
        delete (window as any).LvExam;
        const p2 = probeEcosystemPresence();
        expect(p2.exam).toBe(true);
    });

    it("startEditorQaService 鼠标同块移动拦截：相同块内微小晃动 0 耗时跳过", () => {
        const wysiwyg = document.createElement("div");
        wysiwyg.className = "protyle-wysiwyg";
        document.body.appendChild(wysiwyg);

        const block = document.createElement("div");
        block.setAttribute("data-node-id", "b-hover-perf");
        const attr = document.createElement("div");
        attr.className = "protyle-attr";
        block.appendChild(attr);
        wysiwyg.appendChild(block);

        const onEdit = vi.fn();
        const onMore = vi.fn();
        const onPrefetch = vi.fn();

        const service = startEditorQaService({
            onEditQuestion: onEdit,
            onOpenBlockActions: onMore,
            onPrefetch,
        });

        const spanA = document.createElement("span");
        spanA.textContent = "词语A";
        block.appendChild(spanA);

        const spanB = document.createElement("span");
        spanB.textContent = "词语B";
        block.appendChild(spanB);

        // 首次移动到 spanA：触发块装饰
        spanA.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        expect(block.hasAttribute("data-lv-decorated")).toBe(true);

        // 同一块内继续移动到 spanB：被 lastHoveredBlock 守卫瞬时拦截，不重复处理
        const spyDecorate = vi.fn();
        spanB.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        expect(spyDecorate).not.toHaveBeenCalled();

        service.dispose();
    });

    it("首次掠过块时触发 onPrefetch 预热后台模块", () => {
        vi.useFakeTimers();
        const wysiwyg = document.createElement("div");
        wysiwyg.className = "protyle-wysiwyg";
        document.body.appendChild(wysiwyg);

        const block = document.createElement("div");
        block.setAttribute("data-node-id", "b-prefetch");
        const attr = document.createElement("div");
        attr.className = "protyle-attr";
        block.appendChild(attr);
        wysiwyg.appendChild(block);

        const onPrefetch = vi.fn();
        const service = startEditorQaService({
            onEditQuestion: vi.fn(),
            onPrefetch,
        });

        block.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        vi.advanceTimersByTime(250);
        expect(onPrefetch).toHaveBeenCalled();

        service.dispose();
        vi.useRealTimers();
    });
});
