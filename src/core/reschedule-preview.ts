/**
 * 快速改期时间格式化与预览引擎（Reschedule Preview Engine）
 *
 * 针对快速改期弹窗（ReviewRescheduleModal），提供跨平台、本地化友好的
 * 紧凑时间戳解析（YYYYMMDDHHmmss）、相对天数到期时间推算与界面预览文本生成。
 */

/**
 * 格式化改期时间戳供用户界面友好预览（如：10月29日 14:00）
 */
export function formatRescheduleTimestamp(d: Date, lang?: string): string {
    if (!Number.isFinite(d.getTime())) return "";
    const options: Intl.DateTimeFormatOptions = {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    };
    try {
        return new Intl.DateTimeFormat(String(lang || "").replace(/_/g, "-") || undefined, options).format(d);
    } catch {
        return new Intl.DateTimeFormat(undefined, options).format(d);
    }
}

/**
 * 解析思源 14 位紧凑日期时间戳（YYYYMMDDHHmmss）为 Date 对象
 */
export function parseDueStringToDate(dueStr: string): Date | null {
    if (!dueStr || dueStr.length < 14) return null;
    const y = parseInt(dueStr.slice(0, 4), 10);
    const m = parseInt(dueStr.slice(4, 6), 10) - 1;
    const d = parseInt(dueStr.slice(6, 8), 10);
    const h = parseInt(dueStr.slice(8, 10), 10);
    const min = parseInt(dueStr.slice(10, 12), 10);
    const s = parseInt(dueStr.slice(12, 14), 10);
    const date = new Date(y, m, d, h, min, s);
    return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * 计算改期目标时间预览文本
 */
export function computeReschedulePreview(
    rescheduleDays: number,
    retryDue?: string | null,
    lang?: string,
    now = Date.now()
): string {
    if (retryDue) {
        const d = parseDueStringToDate(retryDue);
        if (d) return formatRescheduleTimestamp(d, lang);
    }
    const days = Number(rescheduleDays);
    if (!Number.isSafeInteger(days) || days < 1 || days > 36500) return "";
    return formatRescheduleTimestamp(new Date(now + days * 86400000), lang);
}

/**
 * 将本地 Date 对象格式化为思源 14 位日期时间戳（YYYYMMDDHHmmss）
 */
export function formatLocalDateToDueString(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const date = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    return `${y}${m}${date}${h}${min}${s}`;
}

/**
 * 计算改期 14 位目标时间戳（若 retryDue 存在且匹配则优先使用，否则推算当前时间 + days 天）
 */
export function calculateTargetDueTimestamp(
    days: number,
    retryDue?: string | null,
    now = Date.now()
): string {
    if (retryDue) {
        return retryDue;
    }
    const targetDate = new Date(now + days * 86400000);
    return formatLocalDateToDueString(targetDate);
}

export interface RescheduleRequest {
    cardID: string;
    days: number;
    due: string;
}

/**
 * 校验并构建改期请求（复用当前匹配的重试请求或计算生成全新时间戳）
 */
export function buildRescheduleRequest(
    cardID: string | undefined,
    rescheduleDays: number,
    retryRequest?: RescheduleRequest | null,
    now = Date.now()
): RescheduleRequest | null {
    if (!cardID) return null;
    const days = Number(rescheduleDays);
    if (!Number.isSafeInteger(days) || days < 1 || days > 36500) return null;

    if (retryRequest && retryRequest.cardID === cardID && retryRequest.days === days) {
        return retryRequest;
    }

    const due = calculateTargetDueTimestamp(days, null, now);
    return { cardID, days, due };
}

