/**
 * 资源释放注册表中枢（DisposerRegistry）
 *
 * 核心契约：
 * 1. 统一纳管 EventListener、定时器、外部 Bridge/插件 Cleaner、Svelte/Dialog 实例与 DOM 清理；
 * 2. 100% 幂等性：dispose() 多次调用绝对幂等无副作用，二次调用直接返回；
 * 3. 异常严格隔离：单个清理项抛错时捕获隔离，杜绝阻断其余清理流程；
 * 4. 逆序释放（LIFO）：后注册的依赖先释放，保障树状生命周期安全；
 * 5. 树状级联支持：createChild() 创建子注册表，父级销毁自动级联销毁全部子项。
 */

export interface IDisposable {
    dispose(): void;
}

export type DisposerFunction = () => void;

export type DisposerLike =
    | DisposerFunction
    | { dispose: () => void }
    | { destroy: () => void }
    | { close: () => void }
    | null
    | undefined;

export class DisposerRegistry implements IDisposable {
    private _isDisposed = false;
    private readonly disposers: DisposerFunction[] = [];
    private readonly children: Set<DisposerRegistry> = new Set();
    private parent?: DisposerRegistry;

    constructor(parent?: DisposerRegistry) {
        this.parent = parent;
        if (parent) {
            parent.addChild(this);
        }
    }

    public get isDisposed(): boolean {
        return this._isDisposed;
    }

    public get size(): number {
        return this.disposers.length;
    }

    private addChild(child: DisposerRegistry): void {
        if (this._isDisposed) {
            child.dispose();
            return;
        }
        this.children.add(child);
    }

    private removeChild(child: DisposerRegistry): void {
        this.children.delete(child);
    }

    public createChild(): DisposerRegistry {
        return new DisposerRegistry(this);
    }

    private safeExecute(disposer: DisposerLike): void {
        if (!disposer) return;
        try {
            if (typeof disposer === "function") {
                disposer();
            } else if ("dispose" in disposer && typeof disposer.dispose === "function") {
                disposer.dispose();
            } else if ("destroy" in disposer && typeof disposer.destroy === "function") {
                disposer.destroy();
            } else if ("close" in disposer && typeof disposer.close === "function") {
                disposer.close();
            }
        } catch {
            // 异常隔离，确保整树清理不被阻断
        }
    }

    /**
     * 注册任意清理器（函数、IDisposable、destroy、close），返回主动取消注册的无损函数
     */
    public register(disposer: DisposerLike): () => void {
        if (!disposer) return () => {};
        if (this._isDisposed) {
            this.safeExecute(disposer);
            return () => {};
        }

        const fn: DisposerFunction = () => {
            this.safeExecute(disposer);
        };

        this.disposers.push(fn);
        return () => {
            const idx = this.disposers.indexOf(fn);
            if (idx >= 0) {
                this.disposers.splice(idx, 1);
            }
        };
    }

    /**
     * 别名，兼容 add 语义
     */
    public add(disposer: DisposerLike): () => void {
        return this.register(disposer);
    }

    /**
     * 注册 setTimeout 定时器
     */
    public addTimeout(timerId: ReturnType<typeof setTimeout> | null | undefined): () => void {
        if (timerId == null) return () => {};
        if (this._isDisposed) {
            clearTimeout(timerId);
            return () => {};
        }
        return this.register(() => clearTimeout(timerId));
    }

    /**
     * 注册 setInterval 定时器
     */
    public addInterval(intervalId: ReturnType<typeof setInterval> | null | undefined): () => void {
        if (intervalId == null) return () => {};
        if (this._isDisposed) {
            clearInterval(intervalId);
            return () => {};
        }
        return this.register(() => clearInterval(intervalId));
    }

    /**
     * 注册标准 DOM / EventTarget 事件监听
     */
    public addEventListener(
        target: EventTarget | null | undefined,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ): () => void {
        if (!target || typeof target.addEventListener !== "function") return () => {};
        if (this._isDisposed) return () => {};

        target.addEventListener(type, listener, options);
        return this.register(() => {
            try {
                target.removeEventListener(type, listener, options);
            } catch {
                /* ignore */
            }
        });
    }

    /**
     * 注册思源 Plugin EventBus 事件监听（off）
     */
    public addEventBusListener(
        eventBus: any,
        event: string,
        listener: (...args: any[]) => void,
    ): () => void {
        if (!eventBus || typeof eventBus.on !== "function" || typeof eventBus.off !== "function") {
            return () => {};
        }
        if (this._isDisposed) return () => {};

        eventBus.on(event, listener);
        return this.register(() => {
            try {
                eventBus.off(event, listener);
            } catch {
                /* ignore */
            }
        });
    }

    /**
     * 级联逆序（LIFO）执行全部清理
     */
    public dispose(): void {
        if (this._isDisposed) return;
        this._isDisposed = true;

        // 1. 递归优先清理子注册表
        for (const child of Array.from(this.children)) {
            try {
                child.dispose();
            } catch {
                /* ignore */
            }
        }
        this.children.clear();

        if (this.parent) {
            this.parent.removeChild(this);
            this.parent = undefined;
        }

        // 2. 逆序清理自身持有的所有 disposers (LIFO)
        while (this.disposers.length > 0) {
            const fn = this.disposers.pop();
            try {
                fn?.();
            } catch {
                /* 异常隔离，确保所有清理项目全部执行完毕 */
            }
        }
    }
}

export function createDisposerRegistry(parent?: DisposerRegistry): DisposerRegistry {
    return new DisposerRegistry(parent);
}
