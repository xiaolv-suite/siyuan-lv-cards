import { showMessage } from "@/libs/notice";
import { createDocWithMd } from "@/api/siyuan";
import { assembleWeeklyReportPayload } from "@/core/report-writer";
import type { RevlogData } from "@/core/revlog";
import type { LvCardsSettings } from "@/core/settings";

export interface WeeklyReportServiceContext {
    settings: LvCardsSettings;
    revlog: RevlogData;
    i18n: Record<string, any>;
    targetNotebook: () => Promise<{ id: string; name: string } | null>;
    saveSettingsSoon: () => void;
}

/**
 * 自动把上周复盘写入「小驴闪卡/学习周报」文档
 * 静默写入，不自动打开（区别于手动报告）；写入成功后推进幂等键
 */
export async function maybeWriteWeeklyReport(ctx: WeeklyReportServiceContext): Promise<string | null> {
    const payload = assembleWeeklyReportPayload({
        now: new Date(),
        lastWeekKey: ctx.settings.weeklyReportLast,
        enabled: ctx.settings.weeklyReportEnabled,
        revlog: ctx.revlog,
        i18n: ctx.i18n,
    });

    if (!payload.shouldWrite || !payload.docTitle || !payload.markdown || !payload.weekKey) {
        return null;
    }

    const nb = await ctx.targetNotebook();
    if (!nb) {
        throw new Error(ctx.i18n.onboardingNoNotebook ?? "Target notebook not found");
    }

    const docID = await createDocWithMd(nb.id, payload.docTitle, payload.markdown);
    if (!docID) {
        throw new Error(ctx.i18n.quickCardFail ?? "Failed to create weekly report document");
    }

    // 幂等键推进（仅在写入成功后；失败下周随本周一起补）
    ctx.settings.weeklyReportLast = payload.weekKey;
    ctx.saveSettingsSoon();
    showMessage(ctx.i18n.weeklyReport_written ?? docID, 2500, "info");

    return docID;
}
