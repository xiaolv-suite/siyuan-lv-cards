/**
 * 复习/预览卡面数学公式渲染（R57）。
 *
 * 背景：内核 getBlockDOM 对 $...$ / $$...$$ 返回空壳
 * `<span data-type="inline-math|math" data-content="…" class="render-node">`，
 * 旧宿主 `window.siyuan.initKaTeX` 在 3.8.x 网页端并不存在，卡面公式渲染为空白。
 * 思源本体自带独立 KaTeX 资产（/stage/protyle/js/katex/），此处按需加载并渲染，
 * 零插件包体成本；宿主资产缺失时静默降级（保留空壳，不影响其余卡面）。
 */

const KATEX_JS_PATH = "/stage/protyle/js/katex/katex.min.js";
const KATEX_CSS_PATH = "/stage/protyle/js/katex/katex.min.css";
const MATH_NODE_SELECTOR = `.render-node[data-type="inline-math"], .render-node[data-type="math"], span[data-type="inline-math"], div[data-type="NodeMathBlock"] .render-node`;

/** 卡面 HTML 是否携带数学节点（含内核空壳令牌与已渲染 KaTeX 产物） */
export function mathTokensPresent(html: string): boolean {
    if (!html) return false;
    return /class="katex"|class="MathJax"|language-math|data-type="inline-math"|data-type="math"|data-subtype="math"/i.test(html);
}

let katexPromise: Promise<boolean> | null = null;

function loadStylesheet(href: string, id: string): void {
    if (typeof document === "undefined" || !document.head) return;
    if (document.getElementById(id)) return;
    try {
        const link = document.createElement("link");
        link.id = id;
        link.rel = "stylesheet";
        link.href = href;
        document.head.appendChild(link);
    } catch {
        // 环境不支持加载外部样式表（如 HappyDOM 测试环境）时静默忽略
    }
}

function loadKatexScript(src: string): Promise<boolean> {
    if (typeof document === "undefined" || !document.head) return Promise.resolve(false);
    return new Promise((resolve) => {
        try {
            const script = document.createElement("script");
            script.src = src;
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        } catch {
            // 环境不支持加载外部脚本（如 HappyDOM 测试环境）时返回 false
            resolve(false);
        }
    });
}

/** 幂等加载宿主 KaTeX；返回是否可用（已加载 / 加载成功 / 失败） */
export function ensureKatex(): Promise<boolean> {
    if ((window as any).katex) return Promise.resolve(true);
    // 单元测试（Vitest/HappyDOM）无真实宿主静态服务，直接根据 window.katex 返回而不向 DOM 挂载外链触发拦截
    if (typeof process !== "undefined" && (process.env?.VITEST || process.env?.NODE_ENV === "test")) {
        return Promise.resolve(false);
    }
    if (!katexPromise) {
        loadStylesheet(KATEX_CSS_PATH, "lv-katex-css");
        katexPromise = loadKatexScript(KATEX_JS_PATH).then((ok) => {
            if (!ok || !(window as any).katex) {
                katexPromise = null; // 允许下次重试
                return false;
            }
            return true;
        });
    }
    return katexPromise;
}

/**
 * 渲染容器内全部内核数学空壳节点；返回渲染节点数。
 * 已带 katex 产物的节点跳过；宿主 KaTeX 不可用时返回 0（不抛错）。
 */
export async function renderMathIn(container: HTMLElement | null | undefined): Promise<number> {
    if (!container) return 0;
    const nodes = Array.from(container.querySelectorAll<HTMLElement>(MATH_NODE_SELECTOR))
        .filter((el) => el.dataset.content && !el.querySelector(".katex"));
    if (nodes.length === 0) return 0;
    const ok = await ensureKatex();
    if (!ok) return 0;
    const katex = (window as any).katex;
    if (!katex || typeof katex.render !== "function") return 0;

    let rendered = 0;
    for (const el of nodes) {
        const source = el.dataset.content ?? "";
        const displayMode = el.dataset.type === "math";
        try {
            el.textContent = "";
            katex.render(source, el, { displayMode, throwOnError: false, output: "html" });
            rendered += 1;
        } catch {
            // 单节点失败不影响其余公式
        }
    }
    return rendered;
}
