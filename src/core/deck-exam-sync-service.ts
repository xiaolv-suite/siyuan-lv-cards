/**
 * 考试计划与牌组协同同步服务（DeckExamSyncService）
 * 统管 Kernel RPC 广播监听（EXAM_PLANS_CHANGED_EVENT）、内核状态监听与备考数据重新对齐。
 */

import {
    EXAM_PLANS_CHANGED_EVENT,
    isKernelPluginRunning,
    shouldReloadExamPlans,
} from "./exam-plan-sync";
import { EXAM_PLANS_DATA } from "@/bootstrap/storage-keys";

export interface DeckExamSyncOptions {
    getKernel: () => any;
    getEventBus: () => any;
    getSourceID: () => string;
    reloadExamPlans: (files: string[]) => Promise<void> | void;
}

export class DeckExamSyncService {
    private readonly options: DeckExamSyncOptions;
    private examKernelWasRunning = false;

    constructor(options: DeckExamSyncOptions) {
        this.options = options;
    }

    public get isKernelRunning(): boolean {
        return this.examKernelWasRunning;
    }

    public onExamPlansChanged = (notice: unknown): void => {
        if (shouldReloadExamPlans(notice, this.options.getSourceID())) {
            void this.options.reloadExamPlans([EXAM_PLANS_DATA]);
        }
    };

    public onKernelPluginStateChange = (): void => {
        try {
            const kernel = this.options.getKernel();
            if (!kernel?.state) return;
            const running = isKernelPluginRunning(kernel.state.code);
            const becameReady = running && !this.examKernelWasRunning;
            this.examKernelWasRunning = running;
            if (becameReady) {
                void this.options.reloadExamPlans([EXAM_PLANS_DATA]);
            }
        } catch {
            // 保护移动端或无内核环境
        }
    };

    public bind(): () => void {
        try {
            const kernel = this.options.getKernel();
            const eventBus = this.options.getEventBus();

            if (kernel?.rpc) {
                kernel.rpc.bind(EXAM_PLANS_CHANGED_EVENT, this.onExamPlansChanged);
            }
            if (eventBus && typeof eventBus.on === "function") {
                eventBus.on("kernel-plugin-state-change", this.onKernelPluginStateChange);
            }

            this.examKernelWasRunning = isKernelPluginRunning(kernel?.state?.code);
            if (this.examKernelWasRunning) {
                void this.options.reloadExamPlans([EXAM_PLANS_DATA]);
            }
        } catch {
            // ignore
        }

        return () => this.unbind();
    }

    public unbind(): void {
        try {
            const kernel = this.options.getKernel();
            const eventBus = this.options.getEventBus();

            if (kernel?.rpc) {
                kernel.rpc.unbind(EXAM_PLANS_CHANGED_EVENT, this.onExamPlansChanged);
            }
            if (eventBus && typeof eventBus.off === "function") {
                eventBus.off("kernel-plugin-state-change", this.onKernelPluginStateChange);
            }
            this.examKernelWasRunning = false;
        } catch {
            // ignore
        }
    }
}

export function createDeckExamSyncService(options: DeckExamSyncOptions): DeckExamSyncService {
    return new DeckExamSyncService(options);
}
