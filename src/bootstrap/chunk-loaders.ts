/**
 * AT-17 / v0.185.1: 独立 IIFE Chunks 动态装配器（Chunk Loaders）
 * 统管 hub / review / dialogs 三大 chunk 的动态 script 注入、组件加载与失败兜底。
 */

import { loadChunk, invalidateChunk, type ChunkMount, type BlockActionRuntime } from "@/libs/chunk-loader";
import { setDialogMounter } from "@/libs/dialog";
import type { HubServices } from "@/core/hub-services";
import * as siyuanNamespace from "siyuan";

if (typeof window !== "undefined") {
    (window as any).__lvSiyuan = siyuanNamespace;
    (globalThis as any).__lvSiyuan = siyuanNamespace;
}

const mountComp = process.env.DEV_MODE
    ? (loader: () => Promise<{ default: any }>) => async (): Promise<ChunkMount["mount"]> => {
        const { mount, unmount } = await import("svelte");
        const Comp = (await loader()).default;
        return (target: HTMLElement, props: Record<string, unknown>) => {
            const app = mount(Comp, { target, props });
            return { destroy: () => { void unmount(app); } };
        };
    }
    : (_loader: () => Promise<{ default: any }>) => async (): Promise<ChunkMount["mount"]> => {
        throw new Error("Svelte dev mount is unavailable in production");
    };

export const loadHubMount: () => Promise<ChunkMount["mount"]> = process.env.DEV_MODE
    ? mountComp(() => import("@/ui/hub.svelte"))
    : () => loadChunk("hub").then(m => m.mount);

export const loadHubServices: () => Promise<HubServices> = (process.env.DEV_MODE || process.env.NODE_ENV === "test")
    ? () => import("@/core/hub-services").then(m => m.hubServices)
    : async () => {
        const { services } = await loadChunk("hub");
        if (!services || !["previewBatchRepair", "confirmBatchRepair", "applyBatchRepair", "createMaintenanceRepairStorage",
            "findApproximateDuplicateCandidates", "helpMarkdown", "renderExamReportMarkdown", "buildDiagnosticsText"]
            .every(key => typeof services[key] === "function")) {
            invalidateChunk("hub");
            throw new Error("lv hub chunk missing services");
        }
        return services;
    };

export const loadReviewMount: () => Promise<ChunkMount["mount"]> = process.env.DEV_MODE
    ? mountComp(() => import("@/ui/review.svelte"))
    : () => loadChunk("review").then(m => m.mount);

let dialogsChunkReady: Promise<void> | null = null;

export async function loadDialogsModule(): Promise<Record<string, any>> {
    dialogsChunkReady ??= loadChunk("dialogs")
        .then(m => {
            setDialogMounter(m.mountDialogComponent);
        })
        .catch(e => {
            dialogsChunkReady = null;
            throw e;
        });
    await dialogsChunkReady;
    return loadChunk("dialogs");
}

export function loadDialogsComp(compName: string): () => Promise<any> {
    return async () => {
        const m = await loadDialogsModule();
        let Comp = m.components?.[compName];
        if (!Comp) {
            invalidateChunk("dialogs");
            dialogsChunkReady = null;
            const reloaded = await loadDialogsModule();
            Comp = reloaded.components?.[compName];
        }
        if (!Comp) throw new Error(`lv dialogs chunk missing component: ${compName}`);
        return Comp;
    };
}

export function loadDialogsEmbeddedView(compName: string): () => Promise<{ Component: any; mount: any }> {
    return async () => {
        const m = await loadDialogsModule();
        const Component = m.components?.[compName];
        if (!Component || typeof m.mountDialogComponent !== "function") {
            throw new Error(`lv dialogs chunk missing embedded component: ${compName}`);
        }
        return { Component, mount: m.mountDialogComponent };
    };
}

export const loadAIWizard = loadDialogsComp("AIWizard");
export const loadOcclusionEditor = loadDialogsComp("OcclusionEditor");
export const loadOnboarding = loadDialogsComp("Onboarding");
export const loadChallengeMode = loadDialogsComp("ChallengeMode");
export const loadMarkerCards = loadDialogsComp("MarkerCards");
export const loadPairingGame = loadDialogsComp("PairingGame");
export const loadSettingsPanel = loadDialogsComp("SettingsPanel");
export const loadDeckPicker = loadDialogsComp("DeckPicker");
export const loadQuickCard = loadDialogsComp("QuickCard");
export const loadRepairDrill = loadDialogsComp("Drill");
export const loadQuestionAttrDialog = loadDialogsComp("QuestionAttrDialog");

export const loadPaletteView: () => Promise<typeof import("@/ui/palette-view").createPaletteView> = async () => {
    const module = await loadDialogsModule();
    if (typeof module.createPaletteView !== "function") {
        dialogsChunkReady = null;
        invalidateChunk("dialogs");
        throw new Error("lv dialogs chunk missing palette view");
    }
    return module.createPaletteView;
};

export const loadBlockActionRuntime: () => Promise<BlockActionRuntime> = (process.env.DEV_MODE || process.env.NODE_ENV === "test")
    ? async () => {
        const [menu, exec] = await Promise.all([
            import("@/ui/block-action-menu"),
            import("@/core/block-action-executor"),
        ]);
        return {
            openBlockActionMenu: menu.openBlockActionMenu,
            closeBlockActionMenu: menu.closeBlockActionMenu,
            buildBlockSnapshot: exec.buildBlockSnapshot,
            probeEcosystemPresence: exec.probeEcosystemPresence,
            executeBlockAction: exec.executeBlockAction,
        };
    }
    : async () => {
        let module = await loadDialogsModule();
        if (!module.blockActionRuntime) {
            dialogsChunkReady = null;
            invalidateChunk("dialogs");
            module = await loadDialogsModule();
        }
        if (!module.blockActionRuntime) {
            throw new Error("lv dialogs chunk missing blockActionRuntime");
        }
        return module.blockActionRuntime as BlockActionRuntime;
    };

export const loadAiChat: () => Promise<typeof import("@/api/ai").aiChat> = (process.env.DEV_MODE || process.env.NODE_ENV === "test")
    ? () => import("@/api/ai").then(m => m.aiChat)
    : async () => {
        let module = await loadDialogsModule();
        if (typeof module.aiChat !== "function") {
            dialogsChunkReady = null;
            invalidateChunk("dialogs");
            module = await loadDialogsModule();
        }
        if (typeof module.aiChat !== "function") {
            throw new Error("lv dialogs chunk missing aiChat");
        }
        return module.aiChat;
    };

export const loadAIWizardEmbedded = loadDialogsEmbeddedView("AIWizard");
export const loadQuickCardEmbedded = loadDialogsEmbeddedView("QuickCard");

export function mountChunkFallback(el: HTMLElement, i18n: Record<string, any>, err: unknown): void {
    el.textContent = "";
    const box = document.createElement("div");
    box.style.cssText = "height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px;text-align:center;color:var(--lv-color-text, currentColor);";
    const title = document.createElement("div");
    title.textContent = `⚠️ ${i18n.chunkLoadFailedTitle}`;
    const detail = document.createElement("div");
    detail.style.cssText = "font-size:12px;opacity:.65;word-break:break-all;white-space:pre-line;";
    detail.textContent = `${i18n.chunkLoadFailedDetail}\n${err instanceof Error ? err.message : String(err)}`;
    box.append(title, detail);
    el.appendChild(box);
}
