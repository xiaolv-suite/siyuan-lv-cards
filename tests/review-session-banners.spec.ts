import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewSessionBanners from "@/ui/review/ReviewSessionBanners.svelte";

describe("ReviewSessionBanners 复习会话控制与减负横幅组件", () => {
    afterEach(() => {
        cleanup();
    });

    const mockT = {
        review: {
            pauseTitle: "复习已暂停",
            pauseContinue: "继续复习",
            returnTriageTitle: "返场分流建议",
            returnDismiss: "我知道了",
            recoveryTitle: "检测到上次未完成的复习",
            qualityExcluded: "已自动排除 ${n} 张存在格式问题的卡片",
            qualityRecheck: "重新排查",
            openMaintenance: "前往维护中心修复",
        },
        endReason: {
            last: "上次收工：",
            cap_reached: "达到每日目标",
        },
        recovery: {
            resume: "继续上次进度",
            restart: "重新开始",
        },
        returnCheck: {
            bannerTitle: "长期未复习检查",
            dismiss: "忽略提示",
        },
        loadRelief: {
            title: "减负选择",
            narrow: "收窄范围",
            impact: {
                narrow: "建议优先复习近期高优卡组",
            },
        },
    };

    it("会话暂停状态下渲染恢复横幅并响应点击", async () => {
        const onResumeSession = vi.fn();
        const { getByText } = render(ReviewSessionBanners, {
            props: {
                sessionPaused: true,
                t: mockT,
                onResumeSession,
            },
        });

        expect(getByText("复习已暂停")).toBeTruthy();
        const resumeBtn = getByText("继续复习");
        await fireEvent.click(resumeBtn);
        expect(onResumeSession).toHaveBeenCalledTimes(1);
    });

    it("渲染返场分流与中断恢复分支选项", async () => {
        const onRecoveryAct = vi.fn();
        const { getByText } = render(ReviewSessionBanners, {
            props: {
                recovery: [
                    { branch: "resume", enabled: true },
                    { branch: "restart", enabled: true },
                ],
                endPicked: "cap_reached",
                t: mockT,
                onRecoveryAct,
            },
        });

        expect(getByText("检测到上次未完成的复习")).toBeTruthy();
        expect(getByText(/达到每日目标/)).toBeTruthy();

        const resumeBtn = getByText("继续上次进度");
        await fireEvent.click(resumeBtn);
        expect(onRecoveryAct).toHaveBeenCalledWith("resume");
    });

    it("长期未复习与减负选择横幅展示及展开收起", async () => {
        const onReliefPick = vi.fn();
        const onDismissReturnCheck = vi.fn();
        const { getByText } = render(ReviewSessionBanners, {
            props: {
                returnItems: [{ key: "backlog", level: "warn", text: "积压超 100 张" }],
                returnDismissed: false,
                sessionDone: false,
                hasCurrent: true,
                emptyQueue: false,
                reliefChoices: [{ key: "narrow" }],
                reliefOpen: "narrow",
                t: mockT,
                onReliefPick,
                onDismissReturnCheck,
            },
        });

        expect(getByText("长期未复习检查")).toBeTruthy();
        expect(getByText("积压超 100 张")).toBeTruthy();
        expect(getByText("建议优先复习近期高优卡组")).toBeTruthy();

        const dismissBtn = getByText("忽略提示");
        await fireEvent.click(dismissBtn);
        expect(onDismissReturnCheck).toHaveBeenCalledTimes(1);
    });

    it("质量不合规卡片排除提示并响应重新排查与跳转维护", async () => {
        const onRecheckQuality = vi.fn();
        const onOpenMaintenance = vi.fn();
        const { getByText } = render(ReviewSessionBanners, {
            props: {
                qualityExcludedCount: 3,
                emptyQueue: false,
                t: mockT,
                onRecheckQuality,
                onOpenMaintenance,
            },
        });

        expect(getByText("已自动排除 3 张存在格式问题的卡片")).toBeTruthy();

        const recheckBtn = getByText("重新排查");
        await fireEvent.click(recheckBtn);
        expect(onRecheckQuality).toHaveBeenCalledTimes(1);

        const maintBtn = getByText("前往维护中心修复");
        await fireEvent.click(maintBtn);
        expect(onOpenMaintenance).toHaveBeenCalledTimes(1);
    });
});
