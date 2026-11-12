/**
 * 小驴闪卡 独立模态对话框参数装配与生命周期解耦器
 */

const noop = () => {};

export interface DialogArgs {
    title: string;
    component: any;
    width?: string;
    height?: string;
    panel?: boolean;
    props: Record<string, any>;
}

export function buildRepairDrillDialogArgs(i18n: Record<string, any>, component: any): DialogArgs {
    return {
        title: i18n.drillTitle,
        component,
        width: "min(720px, 94vw)",
        props: { i18n, onClose: noop },
    };
}

export function buildChallengeDialogArgs(i18n: Record<string, any>, component: any): DialogArgs {
    return {
        title: (i18n as any).challenge?.title ?? "限时挑战",
        component,
        width: "min(560px, 94vw)",
        props: { i18n, onExit: noop },
    };
}

export function buildPairingDialogArgs(i18n: Record<string, any>, component: any): DialogArgs {
    return {
        title: (i18n as any).pairing?.title ?? "概念配对",
        component,
        width: "min(720px, 94vw)",
        props: { i18n, onExit: noop },
    };
}

export function buildOcclusionEditorDialogArgs(
    i18n: Record<string, any>,
    component: any,
    blockID: string,
    onSave: () => Promise<void> | void,
): DialogArgs {
    return {
        title: (i18n as any).occlusion?.title ?? "图片遮挡制卡",
        component,
        width: "min(760px, 94vw)",
        props: {
            i18n,
            blockID,
            onSave,
            onClose: noop,
        },
    };
}
