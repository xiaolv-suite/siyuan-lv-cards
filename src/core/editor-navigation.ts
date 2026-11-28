/**
 * 编辑器目标块定位与居中调度（20261117-01 视口双跳修复）。
 *
 * 背景：openTab 打开文档时，思源内核先渲染文档顶端再硬滚到目标块（第一次跳闪），
 * 且默认定位常把目标块顶在视口边缘，阅读编辑视野逼仄。
 * 策略：改用 cb-get-hl 上下文定位后，在目标 protyle 块渲染完成时追加平滑居中
 * （scrollIntoView block:center），并做两次延迟补居中，覆盖内核稍晚的原生定位，
 * 使最终视口稳定以目标块为中心、全程只有平滑滚动。
 */

/** 复习视图内嵌的文档画布 protyle——属于闪卡复习界面自身，绝不误滚 */
const REVIEW_CANVAS_EXCLUDE = ".lv-doc-canvas-wrapper";

/** 在 scope 内查找目标块在「已打开编辑器 protyle」中的全部渲染元素（排除复习画布内嵌 protyle） */
export function queryEditorTargetBlockElements(scope: ParentNode, blockId: string): HTMLElement[] {
    if (!scope || !blockId) return [];
    const out: HTMLElement[] = [];
    try {
        const nodes = scope.querySelectorAll<HTMLElement>(`.protyle [data-node-id="${blockId}"]`);
        nodes.forEach((el) => {
            if (!el.closest(REVIEW_CANVAS_EXCLUDE)) out.push(el);
        });
    } catch {
        return [];
    }
    return out;
}

/** 默认居中动作：平滑滚动、块居中（阅读视野最舒适位置） */
export function defaultCenterScroll(el: HTMLElement): void {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
}

/**
 * 立即居中 scope 内命中的所有目标块（分屏时每栏各居中一次）。
 * @returns 是否至少命中一个元素
 */
export function centerEditorTargetBlock(
    scope: ParentNode,
    blockId: string,
    scroll: (el: HTMLElement) => void = defaultCenterScroll
): boolean {
    const els = queryEditorTargetBlockElements(scope, blockId);
    if (els.length === 0) return false;
    for (const el of els) {
        try {
            scroll(el);
        } catch {
            // 单栏滚动失败不影响其他栏
        }
    }
    return true;
}

export interface EditorCenterScheduleOptions {
    /** openTab 返回后的起步等待（毫秒），给页签创建留出时间 */
    delayMs?: number;
    /** 轮询间隔（毫秒） */
    intervalMs?: number;
    /** 放弃总时长：元素始终未渲染（如折叠隐藏）则交由内核原生定位兜底 */
    timeoutMs?: number;
    /** 命中后的补居中间隔（覆盖内核稍晚到达的原生定位） */
    settleMs?: number;
    /** 补居中次数（首命中后） */
    settlePasses?: number;
    /** DOM 根获取器（测试可注入；生产传 () => document） */
    getScope: () => ParentNode | null;
    /** 居中动作（测试可注入） */
    scroll?: (el: HTMLElement) => void;
}

/**
 * 调度延迟居中：轮询等待目标块在新打开的编辑器中渲染完成，命中后平滑居中，
 * 并按 settlePasses 次数补居中，保证最终视口稳定以目标块为中心。
 */
export function scheduleEditorCenterScroll(blockId: string, options: EditorCenterScheduleOptions): void {
    const {
        delayMs = 160,
        intervalMs = 120,
        timeoutMs = 3500,
        settleMs = 450,
        settlePasses = 2,
        getScope,
        scroll = defaultCenterScroll,
    } = options;
    if (!blockId) return;
    const startedAt = Date.now();
    let hitCount = 0;

    const tick = () => {
        const scope = getScope();
        if (scope && centerEditorTargetBlock(scope, blockId, scroll)) {
            hitCount += 1;
            if (hitCount <= settlePasses) {
                // 内核的原生定位可能晚于首次命中到达，用补居中覆盖，确保最终以目标块为中心
                window.setTimeout(tick, settleMs);
            }
            return;
        }
        if (Date.now() - startedAt < timeoutMs) {
            window.setTimeout(tick, intervalMs);
        }
    };

    window.setTimeout(tick, delayMs);
}
