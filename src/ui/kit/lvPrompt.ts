/** Input dialog for values that must be collected before continuing an action. */
export function lvPrompt(title: string, message: string, defaultValue = ""): Promise<string | null> {
    if (typeof document === "undefined") return Promise.resolve(null);

    return new Promise((resolve) => {
        let settled = false;
        const mask = document.createElement("div");
        mask.className = "b3-dialog__container lv-dialog lvx-prompt-dialog";
        mask.style.zIndex = "3000";
        mask.innerHTML = `
            <div class="b3-dialog" role="dialog" aria-modal="true" aria-labelledby="lvxPromptTitle" style="max-width: 440px; width: 90vw;">
                <div class="b3-dialog__header">
                    <div class="b3-dialog__title" id="lvxPromptTitle"></div>
                    <button class="b3-dialog__close" type="button" aria-label="关闭"><svg><use xlink:href="#iconClose"></use></svg></button>
                </div>
                <div class="b3-dialog__content" style="padding: 16px 20px; line-height: 1.5; font-size: 12.5px; color: var(--b3-theme-on-surface);">
                    <div class="lvx-prompt-message" style="margin-bottom: 8px;"></div>
                    <input type="text" class="b3-text-field fn__block" style="width: 100%; box-sizing: border-box; padding: 6px 10px; font-size: 13px;" />
                </div>
                <div class="b3-dialog__action">
                    <button class="b3-button b3-button--cancel" type="button">取消</button>
                    <button class="b3-button b3-button--text" type="button">确定</button>
                </div>
            </div>
        `;
        const input = mask.querySelector<HTMLInputElement>("input");
        const titleEl = mask.querySelector<HTMLElement>(".b3-dialog__title");
        const messageEl = mask.querySelector<HTMLElement>(".lvx-prompt-message");
        if (titleEl) titleEl.textContent = title;
        if (messageEl) messageEl.textContent = message;
        if (input) input.value = defaultValue;
        const close = (value: string | null) => {
            if (settled) return;
            settled = true;
            document.removeEventListener("keydown", onKeyDown, true);
            mask.remove();
            resolve(value);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.isComposing || event.keyCode === 229) return;
            if (event.key === "Escape") {
                event.preventDefault();
                close(null);
            } else if (event.key === "Enter") {
                event.preventDefault();
                close(input?.value.trim() ?? null);
            }
        };
        document.addEventListener("keydown", onKeyDown, true);
        mask.querySelector(".b3-dialog__close")?.addEventListener("click", () => close(null));
        mask.querySelector(".b3-button--cancel")?.addEventListener("click", () => close(null));
        mask.querySelector(".b3-button--text")?.addEventListener("click", () => close(input?.value.trim() ?? null));
        mask.addEventListener("click", (event) => {
            if (event.target === mask) close(null);
        });
        document.body.appendChild(mask);
        window.setTimeout(() => {
            input?.focus();
            input?.select();
        }, 30);
    });
}
