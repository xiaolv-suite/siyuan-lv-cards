/**
 * 挖空逐空揭晓控制器（Cloze Stepper Controller）
 *
 * 管理挖空卡在单张卡内包含多个挖空时的逐步显隐状态：
 * - 逐个将未揭晓挖空节点标为已揭晓并还原真实答案文本
 * - 追踪已揭晓数量并在全部挖空揭晓完毕后触发整体翻面回调
 */

export interface ClozeStepResult {
    revealed: boolean;
    allRevealed: boolean;
    nextElement: HTMLElement | null;
}

/**
 * 揭晓单个挖空元素
 */
export function revealSingleCloze(mark: HTMLElement): boolean {
    if (mark.classList.contains("lv-step-revealed")) return false;
    const answer = mark.getAttribute("data-real-answer");
    if (answer) {
        mark.textContent = answer;
        mark.removeAttribute("aria-hidden");
        mark.classList.add("lv-step-revealed");
        mark.setAttribute("title", "已揭晓");
    } else {
        mark.classList.add("lv-step-revealed");
    }
    return true;
}

/**
 * 查询容器内所有挖空标记元素
 */
export function queryClozeMarks(container: HTMLElement | null): HTMLElement[] {
    if (!container) return [];
    return Array.from(
        container.querySelectorAll("span[data-type='mark'][data-cloze-idx], mark.lv-masked[data-cloze-idx]")
    ) as HTMLElement[];
}

/**
 * 判断是否所有挖空都已经完成揭晓
 */
export function isAllClozeRevealed(container: HTMLElement | null): boolean {
    const marks = queryClozeMarks(container);
    if (marks.length === 0) return true;
    return marks.every(m => m.classList.contains("lv-step-revealed"));
}

/**
 * 处理单个挖空点击揭晓事件
 */
export function handleClozeClick(
    mark: HTMLElement,
    container: HTMLElement | null
): { revealed: boolean; allRevealed: boolean } {
    const revealed = revealSingleCloze(mark);
    const allRevealed = isAllClozeRevealed(container);
    return { revealed, allRevealed };
}

/**
 * 顺序推进并揭晓下一个未揭晓挖空
 * 当仅有 1 个挖空或 forceAll 时返回 false，由调用方直接全卡翻面
 */
export function stepNextCloze(container: HTMLElement | null, forceAll = false): ClozeStepResult {
    if (!container) {
        return { revealed: false, allRevealed: true, nextElement: null };
    }
    const marks = queryClozeMarks(container);
    if (marks.length <= 1 || forceAll) {
        return { revealed: false, allRevealed: isAllClozeRevealed(container), nextElement: null };
    }
    const nextUnrevealed = marks.find(m => !m.classList.contains("lv-step-revealed"));
    if (nextUnrevealed) {
        revealSingleCloze(nextUnrevealed);
        const allDone = isAllClozeRevealed(container);
        return { revealed: true, allRevealed: allDone, nextElement: nextUnrevealed };
    }
    return { revealed: false, allRevealed: true, nextElement: null };
}

/**
 * 推进挖空揭晓步数计数，若全部揭晓则触发完成回调
 */
export function advanceClozeStep(
    currentCount: number,
    allRevealed: boolean,
    onAllRevealed: () => void
): number {
    const nextCount = currentCount + 1;
    if (allRevealed) {
        onAllRevealed();
    }
    return nextCount;
}
