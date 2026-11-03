/**
 * 小驴闪卡 · 全生态统一通知适配层
 * 基于 Epoch 7 标准核心库 (src/libs/lv-notice-kit.ts)
 */
import { showMessage as siyuanShowMessage } from "siyuan";
import {
    lvNotify,
    lvTicker,
    withDocLock,
    lvSurfaceStack,
    lvAi,
    lvActivity,
    lvBackup,
    lvEcosystem,
    type CardNoticeOptions,
    type CapsuleNoticeOptions,
    type SilentNoticeOptions,
    type LvNoticeLevel,
    type LvNoticeAction,
    type LvNoticeSnoozeOption,
    type LvNoticePacket,
    type LvAiConfig,
    type LvAiRequestOptions,
    type LvAiResponse,
    type LvActivityRecord,
    type LvEcosystemFullBackup,
    type LvEcosystemDiagnostics,
} from "./lv-notice-kit";

export {
    lvNotify,
    lvTicker,
    withDocLock,
    lvSurfaceStack,
    lvAi,
    lvActivity,
    lvBackup,
    lvEcosystem,
    type CardNoticeOptions,
    type CapsuleNoticeOptions,
    type SilentNoticeOptions,
    type LvNoticeLevel,
    type LvNoticeAction,
    type LvNoticeSnoozeOption,
    type LvNoticePacket,
    type LvAiConfig,
    type LvAiRequestOptions,
    type LvAiResponse,
    type LvActivityRecord,
    type LvEcosystemFullBackup,
    type LvEcosystemDiagnostics,
};

const CARD_CREATE_PATTERN = /(卡片|制卡|卡组|卡包|闪卡|收纳至材料收件箱|已创建|生成|入库|抽取|进度)/i;

/**
 * 全局统一通知包装器（完全兼容旧版 showMessage 签名）
 * - 错误信息 -> 提升为交互卡片 (lvNotify.card)，延长驻留，支持明确关闭
 * - 批量/高频制卡 -> 自动赋予 "card-create" 类别，3秒内同类消息自动计数折叠 (×2, ×3) 严禁连弹
 * - 常规轻量提示 -> 瞬时微胶囊 (lvNotify.capsule)，自然淡出
 */
export function showMessage(message: string, timeout = 3000, type: "info" | "error" = "info"): void {
    if (process.env.NODE_ENV === "test" || (typeof process !== "undefined" && process.env?.VITEST)) {
        try {
            siyuanShowMessage(message, timeout, type);
        } catch { /* test mock bypass */ }
    }
    if (type === "error") {
        lvNotify.card({
            source: "小驴闪卡",
            title: "小驴闪卡提示",
            message,
            level: "error",
            duration: Math.max(timeout, 6000),
        });
    } else {
        const isCardCreation = CARD_CREATE_PATTERN.test(message);
        lvNotify.capsule({
            source: "小驴闪卡",
            category: isCardCreation ? "card-create" : undefined,
            message,
            duration: timeout,
        });
    }
}

/**
 * 批量抽取闪卡/制卡时的显式合流通知
 * 强制指定 category: "card-create"，保证批量或连点操作下绝对合流计数
 */
export function notifyBatchCardCreation(message: string, duration = 2500): string {
    return lvNotify.capsule({
        source: "小驴闪卡",
        category: "card-create",
        message,
        duration,
    });
}

/**
 * 每日待复习卡片提醒卡片
 * 搭载【开始复习】直达动作与【稍后提醒 / 今日免打扰】延期能力
 */
export function notifyDailyReviewReminder(options: {
    count: number;
    message: string;
    onStartReview: () => void;
    title?: string;
}): string | null {
    if (lvNotify.isMutedToday("daily-review-reminder")) {
        return null;
    }

    return lvNotify.card({
        source: "小驴闪卡",
        category: "daily-review-reminder",
        title: options.title || "今日复习提醒",
        message: options.message,
        level: "info",
        duration: 15000,
        actions: [
            {
                label: "开始复习",
                primary: true,
                onClick: () => {
                    options.onStartReview();
                },
            },
        ],
        snooze: {
            options: [
                { label: "稍后提醒 (15分钟)", durationMs: 15 * 60 * 1000 },
                { label: "稍后提醒 (1小时)", durationMs: 60 * 60 * 1000 },
                { label: "今日免打扰", muteToday: true },
            ],
        },
    });
}

/**
 * 原位微动效（复制、标星收藏、复习评级等前台交互原位反馈，坚决不弹窗）
 */
export function notifyInline(target: HTMLElement | null | undefined, tipText?: string, isSuccess = true): void {
    lvNotify.inline(target, tipText, isSuccess);
}
