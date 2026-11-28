/**
 * 统一确认弹窗（Kit·344）：confirmDialog 的 Promise 化封装——
 * await lvConfirm({...}) 得到布尔值，替代回调嵌套。
 */
import { confirmDialog } from "@/libs/dialog";

export interface LvConfirmArgs {
    title: string;
    /** Plain text; rendered with textContent so user-provided labels cannot inject HTML. */
    content: string;
    width?: string;
}

export function lvConfirm(args: LvConfirmArgs): Promise<boolean> {
    const content = document.createElement("div");
    content.textContent = args.content;
    content.style.whiteSpace = "pre-wrap";
    return new Promise((resolve) => {
        confirmDialog({
            title: args.title,
            content,
            width: args.width,
            confirm: () => resolve(true),
            cancel: () => resolve(false),
        });
    });
}
