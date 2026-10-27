import { computeBadgeDescriptor } from "@/core/badge-reminder";
import { cachedDueCount } from "@/api/due-shared";
import { lvLog } from "@/libs/log";
import type { ExamPlan } from "@/core/exam";

export interface TopbarHost {
    i18n: Record<string, any>;
    settings: {
        topbarDirectReview: boolean;
        modules: { review?: boolean };
        dailyReviewTarget: number;
    };
    revlog: { days: Record<string, { review?: number }> };
    examPlans: { plans: any[] };
    addIcons: (svg: string) => void;
    addTopBar: (options: {
        id: string;
        icon: string;
        title: string;
        position: "right" | "left";
        callback: () => void;
    }) => HTMLElement;
    removeTopBar: (id: string) => void;
    openTabOf: (tab: string) => void;
    showTopbarMenu: (evt: MouseEvent) => void;
    showMessage?: (msg: string, timeout?: number, type?: "info" | "error") => void;
}

export class TopbarController {
    public static readonly TOPBAR_ICON_ID = "topbar-lv-cards";

    private host: TopbarHost;
    private topBarElement: HTMLElement | null = null;
    private topBarContextMenuHandler: ((evt: MouseEvent) => void) | null = null;
    private badgeTimer: ReturnType<typeof setInterval> | null = null;
    private badgeSeq = 0;
    private lastDue = 0;
    private iconSvg: string;

    constructor(host: TopbarHost, iconSvg: string) {
        this.host = host;
        this.iconSvg = iconSvg;
    }

    public getLastDue(): number {
        return this.lastDue;
    }

    public getElement(): HTMLElement | null {
        return this.topBarElement;
    }

    public startBadgeTimer(intervalMs = 60000) {
        if (this.badgeTimer) {
            clearInterval(this.badgeTimer);
        }
        this.badgeTimer = setInterval(() => {
            this.refreshDueBadge();
        }, intervalMs);
    }

    public destroy() {
        if (this.badgeTimer) {
            clearInterval(this.badgeTimer);
            this.badgeTimer = null;
        }
        if (this.topBarElement) {
            if (this.topBarContextMenuHandler) {
                try {
                    this.topBarElement.removeEventListener("contextmenu", this.topBarContextMenuHandler);
                } catch {}
                this.topBarContextMenuHandler = null;
            }
            try {
                this.host.removeTopBar(TopbarController.TOPBAR_ICON_ID);
            } catch {}
            this.topBarElement = null;
        }
    }

    public ensureTopBarElement(): HTMLElement | null {
        if (!document.getElementById("iconLvCards")) {
            this.host.addIcons(this.iconSvg);
        }
        if (this.topBarElement && this.topBarElement.isConnected && document.contains(this.topBarElement)) {
            return this.topBarElement;
        }
        try {
            if (this.topBarElement && this.topBarContextMenuHandler) {
                try {
                    this.topBarElement.removeEventListener("contextmenu", this.topBarContextMenuHandler);
                } catch {}
                this.topBarContextMenuHandler = null;
            }
            this.topBarElement = this.host.addTopBar({
                id: TopbarController.TOPBAR_ICON_ID,
                icon: "iconLvCards",
                title: this.host.i18n.topbarTitle || "小驴闪卡",
                position: "right",
                callback: () => {
                    if (this.host.settings.topbarDirectReview && this.host.settings.modules.review && this.lastDue > 0) {
                        this.host.openTabOf("lv-cards-review");
                    } else {
                        this.host.openTabOf("lv-cards-dashboard");
                    }
                },
            });
            if (this.topBarElement) {
                this.topBarElement.style.position = "relative";
                this.topBarContextMenuHandler = (evt: MouseEvent) => {
                    evt.preventDefault();
                    this.host.showTopbarMenu(evt);
                };
                this.topBarElement.addEventListener("contextmenu", this.topBarContextMenuHandler);
            }
        } catch (e) {
            lvLog("warn", "ensureTopBarElement failed: " + (e instanceof Error ? e.message : String(e)));
        }
        return this.topBarElement;
    }

    public refreshDueBadge(todayDateStr?: string) {
        const topBar = this.ensureTopBarElement();
        if (!topBar) return;
        const seq = ++this.badgeSeq;
        cachedDueCount().then(count => {
            if (seq !== this.badgeSeq) return;
            this.lastDue = count;
            const activePlan = this.host.examPlans.plans.find(p => p.enabled && p.examDate);
            const today = todayDateStr ?? new Date().toISOString().slice(0, 10);
            const todayStat = this.host.revlog.days[today];
            const descriptor = computeBadgeDescriptor({
                reviewEnabled: !!this.host.settings.modules.review,
                count,
                activeExamPlan: activePlan,
                dailyReviewTarget: this.host.settings.dailyReviewTarget,
                doneToday: todayStat?.review ?? 0,
                i18n: this.host.i18n,
            });
            this.renderBadge(descriptor, activePlan, topBar);
        }).catch((e) => {
            lvLog("warn", "refreshDueBadge failed: " + (e instanceof Error ? e.message : String(e)));
        });
    }

    private milestonesSeen = new Set<string>();

    public renderBadge(desc: ReturnType<typeof computeBadgeDescriptor>, plan?: ExamPlan, topBar?: HTMLElement | null) {
        const bar = topBar ?? this.ensureTopBarElement();
        if (!bar) return;
        // 去除顶栏刺眼的红底数字小球，保持顶栏清爽干净
        const badge = bar.querySelector<HTMLElement>(".lv-badge");
        if (badge) {
            badge.remove();
        }

        // 将到期卡数与状态优雅呈现在顶栏图标原生悬浮提示中
        const baseTitle = this.host.i18n.topbarTitle || "小驴闪卡";
        if (desc.visible && desc.title) {
            bar.setAttribute("title", `${baseTitle} (${desc.title})`);
            bar.setAttribute("aria-label", `${baseTitle}，${desc.title}`);
        } else {
            bar.setAttribute("title", baseTitle);
            bar.setAttribute("aria-label", baseTitle);
        }

        // 里程碑提醒（30/7/1 天，每天每档一次，内存态）
        if (desc.milestoneDays && plan) {
            const today = new Date().toISOString().slice(0, 10);
            const key = `${plan.id}:${desc.milestoneDays}:${today}`;
            if (!this.milestonesSeen.has(key)) {
                this.milestonesSeen.add(key);
                const tpl = this.host.i18n.examMilestone || "${name} 还有 ${n} 天";
                this.host.showMessage?.(tpl.replace("${name}", plan.name ?? "").replace("${n}", String(desc.milestoneDays)), 4000, "info");
            }
        }
    }
}
