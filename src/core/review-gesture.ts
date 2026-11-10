/** Review-card swipe semantics shared by the touch handler and unit tests. */
export type ReviewSwipeAction = "good" | "again" | "hard" | "easy" | "reveal" | null;

const SWIPE_THRESHOLD = 60;

/**
 * 手机端横滑切卡判定（Mobile Spec v1）：左右滑动＝换下一张（不评级）。
 * 横向位移超过阈值且显著大于纵向位移时成立；竖直手势（上滑翻面/上下评分）不受影响，
 * 桌面端触屏仍走 reviewSwipeAction 的既有评分语义。
 */
export function resolveMobileCardSwitch(dx: number, dy: number): "next" | null {
    if (Math.abs(dx) < SWIPE_THRESHOLD) return null;
    if (Math.abs(dx) <= Math.abs(dy) * 1.2) return null;
    return "next";
}

export function reviewSwipeAction(showAnswer: boolean, dx: number, dy: number): ReviewSwipeAction {
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return null;

    // Question-side horizontal swipes never create a formal rating.
    // Revealing is a question-side action; vertical upward swipe reveals answer.
    if (!showAnswer) {
        if (dy < -SWIPE_THRESHOLD && Math.abs(dx) < SWIPE_THRESHOLD) return "reveal";
        return null;
    }

    // Answer side maps gestures to the matching 4 ratings (aligned with arrow keys):
    // Left = Again (1), Down = Hard (2), Right = Good (3), Up = Easy (4)
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dy) < SWIPE_THRESHOLD) {
        if (dx > SWIPE_THRESHOLD) return "good";
        if (dx < -SWIPE_THRESHOLD) return "again";
    } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dx) < SWIPE_THRESHOLD) {
        if (dy > SWIPE_THRESHOLD) return "hard";
        if (dy < -SWIPE_THRESHOLD) return "easy";
    }

    return null;
}

/**
 * 校验触控目标是否应被手势判定忽略（移动端手势防冲突与触控冒泡保护，docs/34 W-5/W-8）
 * 1. 忽略表单输入、按钮、链接、可编辑元素、键位徽章；
 * 2. 忽略代码块（pre/code）、表格（table/th/td）、矢量遮罩与图表；
 * 3. 忽略父级存在横向 overflow 滚动区域的元素，避免横滑查表/看长代码时误触卡片切题/评分。
 */
export function shouldIgnoreSwipeTarget(target: EventTarget | null): boolean {
    if (!target || typeof (target as Element).closest !== "function") return false;
    const el = target as HTMLElement;

    // 交互控件与可输入区域
    if (el.closest("input,textarea,select,button,a,[contenteditable],kbd,[role='button'],[role='tab']")) {
        return true;
    }

    // 代码块、表格、公式、SVG 矢量
    if (el.closest("pre,code,table,thead,tbody,tr,td,th,svg")) {
        return true;
    }

    // 检测祖先节点中是否存在实际处于可横向滚动状态的容器
    if (typeof window !== "undefined") {
        let cur: HTMLElement | null = el;
        while (cur && cur !== document.body) {
            if (cur.scrollWidth > cur.clientWidth + 4) {
                const style = window.getComputedStyle(cur);
                if (style.overflowX === "auto" || style.overflowX === "scroll") {
                    return true;
                }
            }
            cur = cur.parentElement;
        }
    }

    return false;
}

/**
 * 触控手势动作解析器：综合判断弹窗屏蔽、交互元素防触碰、横向滚动避让与滑动方向距离
 */
export function resolveTouchSwipe(
    showAnswer: boolean,
    touchStart: { x: number; y: number },
    touchEnd: { x: number; y: number },
    target: EventTarget | null,
    isOverlayOrModalOpen: boolean
): ReviewSwipeAction {
    if (isOverlayOrModalOpen || shouldIgnoreSwipeTarget(target)) return null;
    const dx = touchEnd.x - touchStart.x;
    const dy = touchEnd.y - touchStart.y;
    return reviewSwipeAction(showAnswer, dx, dy);
}

export type SwipeOutcome =
    | { type: "rate"; rating: 1 | 2 | 3 | 4 }
    | { type: "reveal" }
    | null;

/**
 * 将手势动作映射为对应的评级数值或翻面动作
 */
export function mapSwipeActionToOutcome(action: ReviewSwipeAction): SwipeOutcome {
    if (!action) return null;
    if (action === "again") return { type: "rate", rating: 1 };
    if (action === "hard") return { type: "rate", rating: 2 };
    if (action === "good") return { type: "rate", rating: 3 };
    if (action === "easy") return { type: "rate", rating: 4 };
    if (action === "reveal") return { type: "reveal" };
    return null;
}

export interface TouchCoordinates {
    x: number;
    y: number;
}

/**
 * 提取单指触控起始坐标（多指操作返回 null 防误触）
 */
export function extractSingleTouchCoords(e: { touches?: ArrayLike<{ clientX: number; clientY: number }> }): TouchCoordinates | null {
    if (e.touches && e.touches.length === 1) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return null;
}

/**
 * 提取触控结束位置坐标
 */
export function extractChangedTouchCoords(e: { changedTouches?: ArrayLike<{ clientX: number; clientY: number }> }): TouchCoordinates | null {
    if (e.changedTouches && e.changedTouches.length > 0) {
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return null;
}


