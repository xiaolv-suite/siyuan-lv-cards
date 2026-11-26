/**
 * 移动端全屏弹窗控制器（MobileDialogController）
 *
 * 负责手机端（390×844 视口与安全区）全屏宿主弹窗的加载、挂载、双向流转与销毁：
 * 1. 闪卡中心移动全屏宿主（MobileHubDialog），与桌面端 TAB_DASHBOARD 100% 行为等价；
 * 2. 复习工作台移动全屏宿主（MobileReviewDialog），打通 TAB_REVIEW 移动端路由；
 * 3. 严格单例去重：已打开时复用并派发视图切换事件（lv-switch-tab / lv-switch-scope），杜绝堆叠孤儿 DOM。
 */

import { lvLog } from "@/libs/log";
import { simpleDialog, bindMobileVisualViewport } from "@/libs/dialog";
import { DEFAULT_HUB_HOME_TAB } from "./tab-constants";
import {
    buildHubMountProps,
    buildReviewMountProps,
    type TabDeps,
} from "./tab-registrars";

export interface MobileDialogRecord {
    close: () => void;
    element: HTMLElement;
}

export interface MobileDialogControllerOptions {
    plugin: any;
    getDeps: () => TabDeps;
    getI18n: () => Record<string, any>;
    ensureTier2Loaded: () => Promise<void>;
    reportDialogOpenFailure: (title: string, err: unknown) => void;
}

export class MobileDialogController {
    private readonly options: MobileDialogControllerOptions;

    private _hubDialog: MobileDialogRecord | null = null;
    private _reviewDialog: MobileDialogRecord | null = null;
    private _hubOpening: Promise<void> | null = null;
    private _reviewOpening: Promise<void> | null = null;
    private _pendingHubData: Record<string, unknown> | null = null;
    private _hubSeq = 0;
    private _reviewSeq = 0;

    constructor(options: MobileDialogControllerOptions) {
        this.options = options;
    }

    public get hubDialog(): MobileDialogRecord | null {
        return this._hubDialog;
    }

    public get reviewDialog(): MobileDialogRecord | null {
        return this._reviewDialog;
    }

    public isHubOpen(): boolean {
        return Boolean(this._hubDialog);
    }

    public isReviewOpen(): boolean {
        return Boolean(this._reviewDialog);
    }

    public closeHub(): void {
        this._hubSeq += 1;
        this._pendingHubData = null;
        if (this._hubDialog) {
            try {
                this._hubDialog.close();
            } catch {
                /* 已销毁 */
            }
            this._hubDialog = null;
        }
    }

    public closeReview(): void {
        this._reviewSeq += 1;
        if (this._reviewDialog) {
            try {
                this._reviewDialog.close();
            } catch {
                /* 已销毁 */
            }
            this._reviewDialog = null;
        }
    }

    public closeAll(): void {
        this.closeReview();
        this.closeHub();
    }

    public async openHubMobileDialog(tab?: string | Record<string, unknown>): Promise<void> {
        const data = typeof tab === "string" ? { tab } : tab;
        return this.openHub(data);
    }

    public async openReviewMobileDialog(data?: Record<string, unknown>): Promise<void> {
        return this.openReview(data);
    }

    private dispatchHubTab(data?: Record<string, unknown>): void {
        if (this._hubDialog) {
            const targetTab = (typeof data?.tab === "string" && data.tab) ? data.tab : DEFAULT_HUB_HOME_TAB;
            this._hubDialog.element
                .querySelector(".lv-hub")
                ?.dispatchEvent(
                    new CustomEvent("lv-switch-tab", {
                        detail: { tab: targetTab, focusBlockID: data?.focusBlockID },
                    }),
                );
        }
    }

    private dispatchReviewScope(data?: Record<string, unknown>): void {
        if (this._reviewDialog) {
            const reviewEl = this._reviewDialog.element.querySelector(".lv-review");
            if (reviewEl) {
                const detailPayload = { ...(data ?? {}), cram: Boolean(data?.cram) };
                reviewEl.dispatchEvent(new CustomEvent("lv-switch-scope", { detail: detailPayload }));
                reviewEl.dispatchEvent(new CustomEvent("lv-switch-review", { detail: detailPayload }));
            }
        }
    }

    public async openHub(data?: Record<string, unknown>): Promise<void> {
        void this.options.ensureTier2Loaded().catch((err) => {
            lvLog(
                "warn",
                `[storage] ensureTier2Loaded on openHubMobileDialog failed: ${err instanceof Error ? err.message : String(err)}`,
            );
        });

        this.closeReview();

        const targetTab = (typeof data?.tab === "string" && data.tab) ? data.tab : DEFAULT_HUB_HOME_TAB;
        const normalizedData: Record<string, unknown> = { ...(data ?? {}), tab: targetTab };

        if (this._hubDialog) {
            this.dispatchHubTab(normalizedData);
            return;
        }

        if (this._hubOpening) {
            this._pendingHubData = normalizedData;
            await this._hubOpening;
            if (this._hubDialog) {
                const latest = this._pendingHubData ?? normalizedData;
                this._pendingHubData = null;
                this.dispatchHubTab(latest);
            }
            return;
        }

        const seq = ++this._hubSeq;
        const deps = this.options.getDeps();
        const i18n = this.options.getI18n();
        this._pendingHubData = normalizedData;

        const run = (async () => {
            try {
                const [mnt] = await Promise.all([
                    deps.loadHubMount(),
                    this.options.ensureTier2Loaded().catch(() => {}),
                ]);
                // 异步等待期间若已被 closeHub / closeAll 或被新请求取代，绝不挂载孤儿弹窗
                if (seq !== this._hubSeq) {
                    return;
                }
                const container = document.createElement("div");
                container.className = "lv-cards-root lv-hub-mobile-host";
                container.setAttribute("data-prevent-swipe", "true");

                const mountData = this._pendingHubData ?? normalizedData;
                this._pendingHubData = null;

                let unbindVv: (() => void) | null = null;
                const handle = mnt(
                    container,
                    buildHubMountProps(this.options.plugin, deps, mountData, {
                        onCloseMobile: () => {
                            this.closeHub();
                        },
                    }),
                );

                if (seq !== this._hubSeq) {
                    try { handle.destroy(); } catch {}
                    return;
                }

                const { dialog, close } = simpleDialog({
                    title: i18n.menuDashboard ?? "闪卡中心",
                    ele: container,
                    width: "100vw",
                    height: "100dvh",
                    callback: () => {
                        unbindVv?.();
                        unbindVv = null;
                        this._hubDialog = null;
                        handle.destroy();
                    },
                });

                dialog.element.classList.add("lv-hub-mobile-dialog");
                dialog.element.setAttribute("data-prevent-swipe", "true");
                dialog.element.querySelector(".b3-dialog")?.classList.add("lv-hub-mobile-dialog");
                dialog.element.querySelector(".b3-dialog")?.setAttribute("data-prevent-swipe", "true");
                unbindVv = bindMobileVisualViewport(dialog.element);

                if (seq !== this._hubSeq) {
                    try { close(); } catch {}
                    return;
                }

                this._hubDialog = { close, element: dialog.element };
            } catch (e) {
                if (seq === this._hubSeq) {
                    this._hubDialog = null;
                    this.options.reportDialogOpenFailure(i18n.menuDashboard ?? "闪卡中心", e);
                }
            } finally {
                if (this._hubOpening === run) {
                    this._hubOpening = null;
                }
            }
        })();

        this._hubOpening = run;
        return run;
    }

    public async openReview(data?: Record<string, unknown>): Promise<void> {
        void this.options.ensureTier2Loaded().catch((err) => {
            lvLog(
                "warn",
                `[storage] ensureTier2Loaded on openReviewMobileDialog failed: ${err instanceof Error ? err.message : String(err)}`,
            );
        });

        if (this._reviewDialog) {
            this.dispatchReviewScope(data);
            return;
        }

        if (this._reviewOpening) {
            await this._reviewOpening;
            if (this._reviewDialog) {
                this.dispatchReviewScope(data);
            }
            return;
        }

        const seq = ++this._reviewSeq;
        const deps = this.options.getDeps();
        const i18n = this.options.getI18n();

        const run = (async () => {
            try {
                const [mnt] = await Promise.all([
                    deps.loadReviewMount(),
                    this.options.ensureTier2Loaded().catch(() => {}),
                ]);
                if (seq !== this._reviewSeq) {
                    return;
                }
                const container = document.createElement("div");
                container.className = "lv-cards-root lv-hub-mobile-host lv-review-mobile-host";
                container.setAttribute("data-prevent-swipe", "true");

                let unbindVv: (() => void) | null = null;
                const handle = mnt(
                    container,
                    buildReviewMountProps(this.options.plugin, data, {
                        onOpenDashboard: (tab?: string) => {
                            this.closeReview();
                            void this.openHub(tab ? { tab } : undefined);
                        },
                        onClose: () => {
                            this.closeReview();
                        },
                    }),
                );

                if (seq !== this._reviewSeq) {
                    try { handle.destroy(); } catch {}
                    return;
                }

                const { dialog, close } = simpleDialog({
                    title: i18n.menuReview ?? "闪卡复习",
                    ele: container,
                    width: "100vw",
                    height: "100dvh",
                    callback: () => {
                        unbindVv?.();
                        unbindVv = null;
                        this._reviewDialog = null;
                        handle.destroy();
                    },
                });

                dialog.element.classList.add("lv-hub-mobile-dialog", "lv-review-mobile-dialog");
                dialog.element.setAttribute("data-prevent-swipe", "true");
                dialog.element.querySelector(".b3-dialog")?.classList.add("lv-hub-mobile-dialog", "lv-review-mobile-dialog");
                dialog.element.querySelector(".b3-dialog")?.setAttribute("data-prevent-swipe", "true");
                unbindVv = bindMobileVisualViewport(dialog.element);

                if (seq !== this._reviewSeq) {
                    try { close(); } catch {}
                    return;
                }

                this._reviewDialog = { close, element: dialog.element };
            } catch (e) {
                if (seq === this._reviewSeq) {
                    this._reviewDialog = null;
                    this.options.reportDialogOpenFailure(i18n.menuReview ?? "闪卡复习", e);
                }
            } finally {
                if (this._reviewOpening === run) {
                    this._reviewOpening = null;
                }
            }
        })();

        this._reviewOpening = run;
        return run;
    }
}

export function createMobileDialogController(options: MobileDialogControllerOptions): MobileDialogController {
    return new MobileDialogController(options);
}
