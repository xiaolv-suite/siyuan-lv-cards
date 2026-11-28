/**
 * 角标刷新与周期提醒调度器（Badge & Reminder Service）
 * 统管每分钟心跳驱动的角标对齐、每日复习提醒、积压预警与备考节点提醒。
 */

import { lvTicker, notifyDailyReviewReminder, lvNotify } from "@/libs/notice";
import { localDate } from "@/core/revlog";
import { cachedDueCount } from "@/api/due-shared";
import {
    isWithinQuietHours,
    decideBacklogWarning,
    decideExamMilestoneReminder,
    shouldTriggerDailyReminder,
} from "@/core/badge-reminder";
import { TAB_DASHBOARD, TAB_REVIEW } from "@/bootstrap/tab-registrars";

const todayDate = () => localDate(Date.now());

export class BadgeReminderService {
    private readonly plugin: any;
    private _reminderShownFor = "";
    private backlogWarnedFor = "";
    private examNotifiedFor = "";

    constructor(plugin: any) {
        this.plugin = plugin;
    }

    public get reminderShownFor(): string {
        try {
            return (typeof localStorage !== "undefined" ? localStorage.getItem("lv_cards_reminder_shown_date") : null) || this._reminderShownFor;
        } catch {
            return this._reminderShownFor;
        }
    }

    public set reminderShownFor(val: string) {
        this._reminderShownFor = val;
        try {
            if (typeof localStorage !== "undefined") {
                if (val) localStorage.setItem("lv_cards_reminder_shown_date", val);
                else localStorage.removeItem("lv_cards_reminder_shown_date");
            }
        } catch {}
    }

    public inQuietHours(): boolean {
        return isWithinQuietHours(this.plugin.settings.quietStart, this.plugin.settings.quietEnd);
    }

    public setupBadgeTimer(): void {
        if (this.plugin.badgeTimerUnsub) {
            this.plugin.badgeTimerUnsub();
            this.plugin.badgeTimerUnsub = null;
        }
        if (this.plugin.badgeTimer) {
            clearInterval(this.plugin.badgeTimer);
            this.plugin.badgeTimer = null;
        }
        const sec = this.plugin.settings.badgeRefreshSec;
        if (!sec || sec < 5) return;

        this.plugin.badgeTimerUnsub = lvTicker.onMinute("siyuan-lv-cards", () => {
            this.plugin.refreshDueBadge();
            this.checkDailyReminder();
            this.checkBacklogWarn();
            this.checkExamMilestones();
        });
    }

    public checkBacklogWarn(): void {
        const entries = this.plugin.revlog?.entries;
        if (!Array.isArray(entries) || entries.length === 0) return;
        let lastValidTs = 0;
        for (let i = entries.length - 1; i >= 0; i--) {
            const ts = Number(entries[i]?.ts);
            if (Number.isFinite(ts) && ts > 0) {
                lastValidTs = ts;
                break;
            }
        }
        if (lastValidTs <= 0) return;

        const decision = decideBacklogWarning({
            reminderEnabled: this.plugin.settings.reminderEnabled,
            lastDue: this.plugin.lastDue,
            inQuiet: this.inQuietHours(),
            lastRevlogTs: lastValidTs,
            today: todayDate(),
            alreadyWarnedToday: this.backlogWarnedFor === todayDate(),
        });
        if (decision.shouldWarn) {
            this.backlogWarnedFor = todayDate();
            this.plugin.showNotice(this.plugin.i18n.backlogWarn.replace("${n}", String(decision.days)), 4000, "info");
        }
    }

    public checkExamMilestones(): void {
        const decision = decideExamMilestoneReminder({
            examEnabled: Boolean(this.plugin.settings.modules.exam && (this.plugin.settings.examEnabled || this.plugin.examPlans.plans.some((p: any) => p.enabled))),
            reminderEnabled: this.plugin.settings.reminderEnabled,
            inQuiet: this.inQuietHours(),
            plans: this.plugin.examPlans.plans,
            today: todayDate(),
            lastNotifiedKey: this.examNotifiedFor,
        });
        if (decision.shouldNotify && decision.plan && decision.daysLeft !== undefined && decision.key) {
            this.examNotifiedFor = decision.key;
            lvNotify.card({
                source: "小驴闪卡",
                category: "exam-milestone",
                title: this.plugin.i18n.examNotifTitle || "备考倒计时提醒",
                message: this.plugin.i18n.examNotifBody.replace("${name}", decision.plan.name).replace("${n}", String(decision.daysLeft)),
                level: "warn",
                duration: 10000,
                actions: [
                    {
                        label: "查看看板",
                        primary: true,
                        onClick: () => this.plugin.openTabOf(TAB_DASHBOARD),
                    },
                ],
            });
        }
    }

    public checkDailyReminder(): void {
        const today = todayDate();
        if (!shouldTriggerDailyReminder({
            reminderEnabled: this.plugin.settings.reminderEnabled,
            reminderTime: this.plugin.settings.reminderTime,
            alreadyShownToday: this.reminderShownFor === today,
        })) return;

        cachedDueCount().then(count => {
            if (count <= 0) {
                this.reminderShownFor = today;
                return;
            }
            notifyDailyReviewReminder({
                count,
                title: this.plugin.i18n.topbarTitle || "今日复习提醒",
                message: this.plugin.i18n.badgeDue.replace("${n}", String(count)),
                onStartReview: () => this.plugin.openTabOf(TAB_REVIEW),
            });
            this.reminderShownFor = today;
        }).catch(() => {});
    }
}

export function createBadgeReminderService(plugin: any): BadgeReminderService {
    return new BadgeReminderService(plugin);
}
