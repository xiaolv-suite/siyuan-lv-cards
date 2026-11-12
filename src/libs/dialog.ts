/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-23 21:37:33
 * @FilePath     : /src/libs/dialog.ts
 * @LastEditTime : 2025-08-16 15:39:48
 * @Description  : Kits about dialogs
 */
import { Dialog } from "siyuan";
import type { Component } from "svelte";
import { trapFocus, type FocusTrap } from "./focus-trap";
import { lvSurfaceStack } from "./lv-notice-kit";

/**
 * AT-17（v0.174.0）：对话框组件挂载器注入点。
 * dialogs chunk 自带 svelte（组件与挂载同实例，避免与 shell 双份内部状态 split-brain）；
 * chunk 加载后由 shell 安装 mounter，svelteDialog 经其挂载 chunk 编译的组件。
 * 未安装时回退 shell 自有 svelte（dev 模式进程内组件）。
 */
export type DialogMounter = (
    comp: Component<Record<string, unknown>>,
    target: HTMLElement,
    props: Record<string, unknown>
) => { destroy: () => void };
let dialogMounter: DialogMounter | null = null;
export function setDialogMounter(m: DialogMounter): void {
    dialogMounter = m;
}
function mountDialog(comp: Component<Record<string, unknown>>, target: HTMLElement, props: Record<string, unknown>): { destroy: () => void } {
    if (dialogMounter) {
        return dialogMounter(comp, target, props);
    }
    // Production always installs the standalone dialogs chunk mounter before
    // opening a Svelte dialog. The local mount is retained for dev mode only;
    // Vite's DEV_MODE define removes this branch (and the Svelte runtime) from
    // the production shell bundle.
    if (process.env.DEV_MODE) {
        type SvelteRuntime = { mount: (comp: unknown, options: { target: HTMLElement; props: Record<string, unknown> }) => unknown; unmount: (app: unknown) => void };
        const s = ((globalThis as unknown as { svelte?: SvelteRuntime }).svelte ?? (typeof window !== "undefined" ? (window as unknown as { svelte?: SvelteRuntime }).svelte : undefined));
        if (typeof s?.mount === "function") {
            const app = s.mount(comp, { target, props });
            return { destroy: () => { void s.unmount(app); } };
        }
    }
    throw new Error("dialogs chunk mounter is unavailable");
}

interface IConfirmDialogArgs {
    title: string;
    content: string | HTMLElement;
    confirm?: (ele?: HTMLElement) => void;
    cancel?: (ele?: HTMLElement) => void;
    width?: string;
    height?: string;
}

export const confirmDialog = (args: IConfirmDialogArgs) => {
    const { title, content, confirm, cancel, width, height } = args;

    let settled = false;
    let trap: FocusTrap | null = null;

    const dialog = new Dialog({
        title,
        content: `<div class="b3-dialog__content">
    <div class="ft__breakword">
    </div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.siyuan?.languages?.cancel ?? "取消"}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text" id="confirmDialogConfirmBtn">${window.siyuan?.languages?.confirm ?? "确定"}</button>
</div>`,
        width: width,
        height: height,
        destroyCallback: () => {
            trap?.release();
            if (!settled) {
                settled = true;
                cancel?.(target);
            }
        }
    });
    dialog.element.classList.add("lv-dialog");
    // 点击遮罩背景快速关闭
    dialog.element.addEventListener("click", (e) => {
        if (e.target === dialog.element || (e.target as HTMLElement).classList?.contains("b3-dialog__scrim")) {
            dialog.destroy();
        }
    });

    const target: HTMLElement = dialog.element.querySelector(".b3-dialog__content>div.ft__breakword");
    if (typeof content === "string") {
        target.innerHTML = content;
    } else {
        target.appendChild(content);
    }

    // AS-1：确认框捕获焦点（Tab 循环 + Esc 关闭 + 关闭后归还宿主焦点）
    trap = trapFocus(dialog.element, { onEscape: () => dialog.destroy() });

    const btnsElement = dialog.element.querySelectorAll(".b3-button");
    btnsElement[0].addEventListener("click", () => {
        if (!settled) {
            settled = true;
            trap?.release();
            if (cancel) {
                cancel(target);
            }
        }
        dialog.destroy();
    });
    btnsElement[1].addEventListener("click", () => {
        if (!settled) {
            settled = true;
            trap?.release();
            if (confirm) {
                confirm(target);
            }
        }
        dialog.destroy();
    });
};


/** 布尔化确认框：true=确认，false=取消（重复提示等需要分支的流程用） */
export const confirmDialogBool = (args: Omit<IConfirmDialogArgs, "confirm" | "cancel">) =>
    new Promise<boolean>((resolve) => {
        confirmDialog({ ...args, confirm: () => resolve(true), cancel: () => resolve(false) });
    });


/**
 * Mobile Spec v2：绑定 visualViewport 高度同步与软键盘弹起态标记。
 * 软键盘弹起时实时更新 `--lv-vv-h` 并切换 `.lv-vv-keyboard-open`，销毁时完整解绑。
 */
export function bindMobileVisualViewport(targetEl: HTMLElement | null | undefined): () => void {
    if (!targetEl || typeof window === "undefined") {
        return () => {};
    }
    const vv = window.visualViewport;
    let baselineHeight = Math.max(window.innerHeight || 0, Math.round(vv?.height ?? 0));

    const sync = () => {
        const currentInner = window.innerHeight || 0;
        const rawVvH = vv ? vv.height : currentInner;
        const vvH = Math.max(180, Math.round(rawVvH || currentInner));
        if (vvH > baselineHeight) {
            baselineHeight = vvH;
        }
        targetEl.style.setProperty("--lv-vv-h", `${vvH}px`);
        const referenceHeight = Math.max(baselineHeight, currentInner);
        const kbOpen = referenceHeight > 0 && referenceHeight - vvH > 110;
        targetEl.classList.toggle("lv-vv-keyboard-open", kbOpen);
    };

    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);

    return () => {
        vv?.removeEventListener("resize", sync);
        vv?.removeEventListener("scroll", sync);
        window.removeEventListener("resize", sync);
    };
}

export const simpleDialog = (args: {
    title: string, ele: HTMLElement | DocumentFragment,
    width?: string, height?: string,
    callback?: () => void;
}) => {
    let closed = false;
    const surfaceId = `dialog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const dismissOnce = () => {
        if (closed) return false;
        closed = true;
        popSurface();
        dialog.destroy();
        return true;
    };
    const popSurface = lvSurfaceStack.push({
        id: surfaceId,
        type: "dialog",
        dismiss: dismissOnce,
    });

    const dialog = new Dialog({
        title: `<div class="lv-dialog-title-wrap">${args.title}</div>`,
        content: `<div class="lv-cards-dialog-content dialog-content" style="display: flex; flex-direction: column; align-items: stretch; width: 100%; height: 100%; min-width: 0; min-height: 0; box-sizing: border-box;"></div>`,
        width: args.width,
        height: args.height,
        destroyCallback: () => {
            if (!closed) {
                closed = true;
                popSurface();
            }
            args.callback?.();
        }
    });
    const contentEl = dialog.element.querySelector(".lv-cards-dialog-content") || dialog.element.querySelector(".dialog-content");
    if (contentEl) {
        contentEl.appendChild(args.ele);
    }
    dialog.element.classList.add("lv-dialog");
    dialog.element.querySelector(".b3-dialog")?.classList.add("lv-dialog");

    const outerClose = dialog.element.querySelector<HTMLElement | SVGElement>(".b3-dialog__container > .b3-dialog__close");
    if (outerClose && outerClose.style) {
        outerClose.style.setProperty("display", "none", "important");
    }

    // 在 header 内注入关闭入口（桌面端 28x28px，移动端 44x44px 触控关闭入口）
    const headerEl = dialog.element.querySelector(".b3-dialog__header");
    if (headerEl && !headerEl.querySelector(".b3-dialog__close") && !headerEl.querySelector(".lv-mobile-dialog-close")) {
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "b3-dialog__close lv-mobile-dialog-close";
        closeBtn.setAttribute("aria-label", window.siyuan?.languages?.close ?? "关闭");
        closeBtn.title = window.siyuan?.languages?.close ?? "关闭";
        closeBtn.textContent = "✕";
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            dismissOnce();
        });
        headerEl.appendChild(closeBtn);
    }

    // 点击遮罩背景快速关闭
    dialog.element.addEventListener("click", (e) => {
        if (e.target === dialog.element || (e.target as HTMLElement).classList?.contains("b3-dialog__scrim")) {
            dismissOnce();
        }
    });
    return {
        dialog,
        close: () => {
            dismissOnce();
        }
    };
}


export const svelteDialog = (args: {
    title: string,
    component: Component<Record<string, unknown>>, // Svelte 5 component constructor
    props?: Record<string, unknown>,
    width?: string,
    height?: string,
    callback?: () => void;
    /** R53 §3.10：无镶板形态——隐藏宿主标题栏与内容内边距，容器即面板（命令面板用） */
    panel?: boolean,
}) => {
    // AR-2：打开前记焦点宿主，关闭（任意路径）后归还——键盘流不因弹窗丢焦
    let prevFocus: HTMLElement | null = null;
    try {
        prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    } catch { /* 旁路 */ }
    const restoreFocus = () => {
        try {
            // Another dialog or command destination may already own focus when
            // the host's delayed destroyCallback arrives. Do not reclaim it.
            const active = document.activeElement;
            if (active && active !== document.body && !dialogHandle?.element.contains(active)) {
                return;
            }
            if (prevFocus && document.contains(prevFocus)) {
                prevFocus.focus();
            }
        } catch { /* 焦点归还旁路 */ }
    };

    // AR-2：关闭一次性——宿主 X / Esc / 内嵌组件回调并发时只销毁一次
    let destroyed = false;
    let unmounted = false;
    let dialogHandle: { destroy: () => void; element: HTMLElement } | null = null;
    let componentInstance: ReturnType<typeof mountDialog> | null = null;
    /** AS-1：对话框焦点陷阱（Tab 循环/Esc）；释放归 dialog.ts 既有 restoreFocus（防双重归还传 false） */
    let focusTrap: FocusTrap | null = null;

    // 组件销毁统一出口：chunk mounter 句柄（.destroy）或 shell svelte 实例（unmount）
    const destroyComponent = () => {
        if (unmounted || !componentInstance) {
            return;
        }
        unmounted = true;
        try {
            componentInstance.destroy();
        } catch { /* 已卸载 */ }
    };

    const closeOnce = () => {
        if (destroyed) {
            return;
        }
        destroyed = true;
        focusTrap?.release();
        if (dialogHandle) {
            try {
                dialogHandle.destroy(); // destroyCallback 内完成 unmount + 业务 callback
            } catch {
                destroyComponent();
            }
        } else {
            destroyComponent();
        }
        restoreFocus();
    };

    // AR-2：把可用的关闭动作注入内嵌组件的 onClose/onExit（mount 前包装）——
    // 此前调用方传的是空 stub，组件内部「取消/完成/导入成功」根本关不掉对话框；
    // 先执行调用方回调（持久化等语义），再关闭一次
    const props = { ...(args.props || {}) };
    for (const key of ["onClose", "onExit"]) {
        const userFn = props[key];
        if (typeof userFn === "function") {
            props[key] = (...fnArgs: unknown[]) => {
                try {
                    userFn(...fnArgs);
                } finally {
                    closeOnce();
                }
            };
        }
    }

    let container = document.createElement('div')
    container.style.display = 'contents';

    // 内部处理 mount（chunk mounter 已安装时用 chunk 的 svelte 实例挂载）
    componentInstance = mountDialog(args.component, container, props);

    let dialog: Dialog;
    try {
        ({ dialog } = simpleDialog({
            title: args.title,
            ele: container,
            width: args.width,
            height: args.height,
            callback: () => {
                destroyed = true;
                focusTrap?.release();
                destroyComponent();
                restoreFocus();
                if (args.callback) args.callback();
            }
        }));
    } catch (error) {
        destroyed = true;
        destroyComponent();
        restoreFocus();
        throw error;
    }
    dialogHandle = dialog;
    // 样式作用域（R52）：插件对话框挂 lv-dialog，供 index.scss 做按钮语义中性化与滚动条
    dialog.element.classList.add("lv-dialog");
    dialog.element.querySelector(".b3-dialog")?.classList.add("lv-dialog");
    if (args.panel) {
        dialog.element.classList.add("lv-dialog--panel");
        dialog.element.querySelector(".b3-dialog")?.classList.add("lv-dialog--panel");
    }
    // AS-1：焦点捕获（Esc→closeOnce 一次性；归还走既有 restoreFocus）
    focusTrap = trapFocus(dialog.element, { onEscape: closeOnce, restoreOnRelease: false });

    return {
        component: componentInstance,
        dialog,
        close: closeOnce
    }
}
