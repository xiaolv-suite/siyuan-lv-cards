/**
 * 插件快捷命令集中注册模块（CommandRegistry）
 * 统筹思源命令面板、快捷键（如 Ctrl+K 命令面板直达）以及动作入口，
 * 与具体的 Plugin 实例生命周期解耦，便于单测与跨端环境复核。
 */

export interface CommandHost {
    addCommand(options: {
        langKey: string;
        langText: string;
        hotkey: string;
        callback: () => void | Promise<void>;
    }): void;
    i18n: Record<string, any>;
    openDashboard: (tab?: string) => void;
    openReview: (options?: { scope?: string }) => void;
    openManager?: () => void;
    openQuickCard: () => void;
    openAIWizard?: () => void;
    openRepairDrill: () => void;
    openPalette: () => void;
    copyDiagnostics: () => Promise<void>;
    openChallenge: () => Promise<void>;
    openMarkerCards: () => void;
    openPairing: () => Promise<void>;
    openHelpDoc: () => void;
    createSampleWorkspace: () => Promise<void>;
    openDynamicBoard?: () => void;
    togglePresentationPrivacy?: () => void;
}

export const REGISTERED_COMMAND_KEYS = [
    "openDashboard",
    "openManager",
    "startReview",
    "quickCard",
    "openAIWizard",
    "drill",
    "palette",
    "openExam",
    "cramNew",
    "diagnostics",
    "challenge",
    "markerCards",
    "pairing",
    "openHelp",
    "sampleWorkspace",
    "dynamicBoard",
] as const;

export type RegisteredCommandKey = typeof REGISTERED_COMMAND_KEYS[number];

/**
 * 注册小驴闪卡所有命令面板入口与快捷键
 */
export function registerPluginCommands(host: CommandHost): void {
    host.addCommand({
        langKey: "openDashboard",
        langText: host.i18n.cmdOpenDashboard ?? host.i18n.menuDashboard ?? "打开闪卡中心",
        hotkey: "",
        callback: () => host.openDashboard(),
    });
    host.addCommand({
        langKey: "openManager",
        langText: host.i18n.cmdOpenManager ?? host.i18n.menuManager ?? "打开闪卡管理器",
        hotkey: "",
        callback: () => (host.openManager ? host.openManager() : host.openDashboard("manage")),
    });
    host.addCommand({
        langKey: "startReview",
        langText: host.i18n.cmdStartReview ?? host.i18n.menuReview ?? "开始复习",
        hotkey: "",
        callback: () => host.openReview(),
    });
    host.addCommand({
        langKey: "quickCard",
        langText: host.i18n.cmdQuickCard ?? host.i18n.menuQuickCard ?? "快速制卡",
        hotkey: "",
        callback: () => host.openQuickCard(),
    });
    host.addCommand({
        langKey: "openAIWizard",
        langText: host.i18n.cmdOpenAIWizard ?? host.i18n.menuAICard ?? "AI 制卡向导",
        hotkey: "",
        callback: () => (host.openAIWizard ? host.openAIWizard() : host.openDashboard("authoring")),
    });
    // T10 修卡演练（docs/13 §12）：独立样例入口
    host.addCommand({
        langKey: "drill",
        langText: host.i18n.cmdDrill,
        hotkey: "",
        callback: () => host.openRepairDrill(),
    });
    // T13 命令面板：动作+导航键盘直达（默认 Alt+K，规避思源富文本插入超链接冲突）
    host.addCommand({
        langKey: "palette",
        langText: host.i18n.cmdPalette,
        hotkey: "Alt+K",
        callback: () => host.openPalette(),
    });
    host.addCommand({
        langKey: "openExam",
        langText: host.i18n.cmdOpenExam,
        hotkey: "",
        callback: () => host.openDashboard("exam"),
    });
    host.addCommand({
        langKey: "cramNew",
        langText: host.i18n.cmdCramNew,
        hotkey: "",
        callback: () => host.openReview({ scope: "new" }),
    });
    host.addCommand({
        langKey: "diagnostics",
        langText: host.i18n.cmdDiagnostics,
        hotkey: "",
        callback: () => host.copyDiagnostics(),
    });
    host.addCommand({
        langKey: "challenge",
        langText: host.i18n.cmdChallenge,
        hotkey: "",
        callback: () => host.openChallenge(),
    });
    host.addCommand({
        langKey: "markerCards",
        langText: host.i18n.cmdMarkerCards,
        hotkey: "",
        callback: () => host.openMarkerCards(),
    });
    host.addCommand({
        langKey: "pairing",
        langText: host.i18n.cmdPairing,
        hotkey: "",
        callback: () => host.openPairing(),
    });
    host.addCommand({
        langKey: "openHelp",
        langText: host.i18n.cmdOpenHelp,
        hotkey: "",
        callback: () => host.openHelpDoc(),
    });
    host.addCommand({
        langKey: "sampleWorkspace",
        langText: host.i18n.cmdSampleWorkspace,
        hotkey: "",
        callback: () => host.createSampleWorkspace(),
    });
    if (typeof host.openDynamicBoard === "function") {
        host.addCommand({
            langKey: "dynamicBoard",
            langText: host.i18n.cmdDynamicBoard ?? "打开《闪卡动态看板与错题本》",
            hotkey: "",
            callback: () => host.openDynamicBoard!(),
        });
    }

    if (typeof host.togglePresentationPrivacy === "function") {
        host.addCommand({
            langKey: "presentationPrivacy",
            langText: host.i18n.menuPresentationPrivacy ?? "演示私密模式",
            hotkey: "",
            callback: () => host.togglePresentationPrivacy!(),
        });
    }
}
