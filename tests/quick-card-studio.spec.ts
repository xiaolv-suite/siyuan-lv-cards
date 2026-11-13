import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import QuickCard from "../src/ui/quick-card.svelte";
import StudioWorkbench from "../src/ui/studio-workbench.svelte";

const { getRiffDecks, createRiffDeck } = vi.hoisted(() => ({
    getRiffDecks: vi.fn(),
    createRiffDeck: vi.fn(),
}));

vi.mock("../src/api/riff", () => ({ getRiffDecks, createRiffDeck }));

const i18n = {
    quickCardQ: "问题",
    quickCardA: "答案",
    quickCardCreate: "制卡",
    quickCardNeedDeck: "请选择或新建卡组",
    quickCardDone: "已制卡并加入卡组",
    quickCardFail: "制卡失败，请重试",
    quickCardDeckLoading: "正在读取卡组…",
    quickCardDeckLoadFail: "读取卡组失败：${error}",
    quickCardDeckRetry: "重试读取",
    quickCardDeckFallback: "也可以直接输入新卡组名称继续。",
    quickCardTemplateLabel: "卡面表达",
    quickCardTemplateQA: "问答表达",
    quickCardTemplateCloze: "挖空表达",
    quickCardTemplateSuperBlock: "超级块表达",
    quickCardTemplateQADesc: "先想出答案，再翻开核对",
    quickCardTemplateClozeDesc: "回忆句子里被遮住的关键内容",
    quickCardTemplateSuperBlockDesc: "第 1 块为题面，后续所有块为答案（支持多段）",
    quickCardSuperBlockHint: "答案区支持多段文字，段落之间空行将自动拆分成独立的答案子块",
    cardTypeBadgeSuperBlock: "超级块",
    quickCardClozeHint: "在题面中用 ____ 标记要隐藏的答案位置",
    quickCardPreviewTitle: "卡面预览",
    quickCardPreviewNote: "保存后由思源正式渲染",
    quickCardPreviewFront: "回忆面",
    quickCardPreviewBack: "核对面",
    quickCardEditorLabel: "编辑卡片",
    quickCardOneFactHint: "尽量只问一个可核对的知识点；复习时先回忆，再揭晓答案。",
    quickCardShowAnswer: "查看答案",
    quickCardHideAnswer: "返回题面",
    quickCardHiddenAnswer: "答案（复习时隐藏）",
    quickCardPreviewEmpty: "填写题面或答案后预览",
    deckPickerTitle: "选择卡组",
    deckNewName: "新建卡组名称",
};

describe("R54 manual card workspace", () => {
    beforeEach(() => {
        getRiffDecks.mockReset().mockResolvedValue([{ id: "deck-1", name: "默认卡组", size: 0 }]);
        createRiffDeck.mockReset();
        Object.defineProperty(window, "siyuan", {
            configurable: true,
            value: { languages: { cancel: "取消" } },
        });
    });

    afterEach(cleanup);

    it("previews a Q&A card and submits the native cloze markup", async () => {
        const onCreate = vi.fn(async () => undefined);
        render(QuickCard, { i18n, onCreate, onClose: vi.fn(), embedded: true });

        await fireEvent.input(await screen.findByRole("textbox", { name: "问题" }), { target: { value: "光合作用的主要产物是什么？" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "葡萄糖和氧气" } });
        expect(screen.getByText("答案（复习时隐藏）")).toBeTruthy();
        expect(screen.queryByText("葡萄糖和氧气")).toBeNull();
        await fireEvent.click(screen.getByRole("button", { name: "查看答案" }));
        expect(screen.getByText("葡萄糖和氧气")).toBeTruthy();
        expect(screen.getByText("光合作用的主要产物是什么？")).toBeTruthy();
        await fireEvent.click(screen.getByRole("button", { name: "返回题面" }));

        await fireEvent.click(screen.getByRole("button", { name: /制卡/ }));
        await waitFor(() => expect(onCreate).toHaveBeenCalledWith(
            "光合作用的主要产物是什么？ ==葡萄糖和氧气==",
            "deck-1",
            "默认卡组",
            "光合作用的主要产物是什么？",
            "葡萄糖和氧气",
        ));
        expect(screen.getByRole("status").textContent).toContain("已制卡");
    });

    it("requires a blank marker for cloze and previews the revealed sentence", async () => {
        const onCreate = vi.fn(async () => undefined);
        render(QuickCard, { i18n, onCreate, onClose: vi.fn(), embedded: true });
        await screen.findByRole("button", { name: /挖空表达/ });
        await fireEvent.click(screen.getByRole("button", { name: /挖空表达/ }));

        await fireEvent.input(screen.getByRole("textbox", { name: "问题" }), { target: { value: "光合作用固定的主要糖类是____。" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "葡萄糖" } });
        await fireEvent.click(screen.getByRole("button", { name: "查看答案" }));
        expect(screen.getByText("光合作用固定的主要糖类是葡萄糖。")).toBeTruthy();

        const submit = screen.getByRole("button", { name: /制卡/ }) as HTMLButtonElement;
        expect(submit.disabled).toBe(false);
        await fireEvent.click(submit);
        await waitFor(() => expect(onCreate).toHaveBeenCalledWith(
            "光合作用固定的主要糖类是==葡萄糖==。",
            "deck-1",
            "默认卡组",
            "光合作用固定的主要糖类是____。",
            "葡萄糖",
        ));
    });

    it("keeps cloze submission disabled until the blank marker exists", async () => {
        render(QuickCard, { i18n, onCreate: vi.fn(), onClose: vi.fn(), embedded: true });
        await fireEvent.click(await screen.findByRole("button", { name: /挖空表达/ }));
        await fireEvent.input(screen.getByRole("textbox", { name: "问题" }), { target: { value: "固定的糖类" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "葡萄糖" } });
        expect((screen.getByRole("button", { name: /制卡/ }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("deck loading failure shows a retry action and restores deck choices", async () => {
        getRiffDecks
            .mockRejectedValueOnce(new Error("宿主暂不可用"))
            .mockResolvedValueOnce([{ id: "deck-2", name: "重试卡组", size: 1 }]);
        render(QuickCard, { i18n, onCreate: vi.fn(), onClose: vi.fn(), embedded: true });

        expect((await screen.findByRole("alert")).textContent).toContain("读取卡组失败：宿主暂不可用");
        await fireEvent.click(screen.getByRole("button", { name: "重试读取" }));
        await waitFor(() => expect(getRiffDecks).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.getByRole("combobox", { name: "选择卡组" }).textContent).toContain("重试卡组"));
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("applies the same validation to the keyboard shortcut", async () => {
        const onCreate = vi.fn(async () => undefined);
        render(QuickCard, { i18n, onCreate, onClose: vi.fn(), embedded: true });
        await screen.findByRole("button", { name: /问答表达/ });

        await fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
        expect(onCreate).not.toHaveBeenCalled();

        await fireEvent.input(screen.getByRole("textbox", { name: "问题" }), { target: { value: "水的化学式是什么？" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "H2O" } });
        await fireEvent.keyDown(screen.getByRole("textbox", { name: "答案" }), { key: "Enter", ctrlKey: true });
        await waitFor(() => expect(onCreate).toHaveBeenCalledWith("水的化学式是什么？ ==H2O==", "deck-1", "默认卡组", "水的化学式是什么？", "H2O"));
    });

    it("does not create the same deck twice when card insertion fails and is retried", async () => {
        createRiffDeck.mockResolvedValue({ id: "deck-new", name: "新建卡组", size: 0 });
        const onCreate = vi.fn()
            .mockRejectedValueOnce(new Error("写入失败"))
            .mockResolvedValueOnce(undefined);
        render(QuickCard, { i18n, onCreate, onClose: vi.fn(), embedded: true });

        await fireEvent.input(await screen.findByRole("textbox", { name: "问题" }), { target: { value: "地球绕太阳一周需要多久？" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "一年" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "新建卡组名称" }), { target: { value: "新建卡组" } });
        await fireEvent.click(screen.getByRole("button", { name: /制卡/ }));

        expect((await screen.findByRole("alert")).textContent).toContain("写入失败");
        await fireEvent.click(screen.getByRole("button", { name: /制卡/ }));

        await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));
        expect(createRiffDeck).toHaveBeenCalledOnce();
        expect(onCreate).toHaveBeenLastCalledWith(
            "地球绕太阳一周需要多久？ ==一年==",
            "deck-new",
            "新建卡组",
            "地球绕太阳一周需要多久？",
            "一年",
        );
    });

    it("preserves a manual draft when leaving and reopening the embedded editor", async () => {
        const quickProps = { i18n, onCreate: vi.fn(), onClose: vi.fn() };
        const loadQuickCard = vi.fn(async () => ({ Component: QuickCard, props: quickProps }));
        const loadWizard = vi.fn(async () => ({ Component: QuickCard, props: quickProps }));
        const studioI18n = {
            hubStudioEyebrow: "制卡与学习",
            hubPrimaryStudio: "制卡",
            hubTabAuthoring: "制卡",
            authoringPageSub: "创建卡片",
            aiWizardTitle: "AI 制卡",
            authoringWizardDesc: "根据材料生成候选卡片",
            ...i18n,
        };
        render(StudioWorkbench, {
            i18n: studioI18n,
            isActive: true,
            openOnboarding: vi.fn(),
            loadQuickCard,
            loadWizard,
        });

        const question = await screen.findByRole("textbox", { name: "问题" });
        await fireEvent.input(question, { target: { value: "草稿仍应保留" } });
        await fireEvent.click(screen.getByRole("button", { name: "AI 辅助" }));
        await waitFor(() => expect(loadWizard).toHaveBeenCalledOnce());
        await waitFor(() => expect((screen.getByRole("button", { name: "AI 辅助" }) as HTMLButtonElement).disabled).toBe(false));
        await fireEvent.click(screen.getByRole("button", { name: "手工制卡" }));

        expect((screen.getByRole("textbox", { name: "问题" }) as HTMLTextAreaElement).value).toBe("草稿仍应保留");
        expect(loadQuickCard).toHaveBeenCalledOnce();
    });

    it("keeps the hidden workbench lazy until its tab is opened", async () => {
        const loadQuickCard = vi.fn(async () => ({ Component: QuickCard, props: { i18n, onCreate: vi.fn(), onClose: vi.fn() } }));
        const props = { i18n, openOnboarding: vi.fn(), loadQuickCard, isActive: false };
        const { rerender } = render(StudioWorkbench, props);

        expect(loadQuickCard).not.toHaveBeenCalled();
        await rerender({ ...props, isActive: true });
        await screen.findByRole("textbox", { name: "问题" });
        expect(loadQuickCard).toHaveBeenCalledOnce();
    });

    it("only handles Ctrl+Enter from the visible manual editor", async () => {
        const onCreate = vi.fn().mockResolvedValue(undefined);
        const { container } = render(QuickCard, { i18n, onCreate, onClose: vi.fn(), embedded: true });
        const question = await screen.findByRole("textbox", { name: "问题" });
        await fireEvent.input(question, { target: { value: "草稿问题" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "草稿答案" } });
        await fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
        expect(onCreate).not.toHaveBeenCalled();
        container.hidden = true;
        await fireEvent.keyDown(question, { key: "Enter", ctrlKey: true });
        expect(onCreate).not.toHaveBeenCalled();
        container.hidden = false;
        await fireEvent.keyDown(question, { key: "Enter", ctrlKey: true });
        await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
    });

    it("queues an AI request arriving while the manual chunk is loading", async () => {
        let resolveManual!: (view: any) => void;
        const manual = new Promise<any>(resolve => { resolveManual = resolve; });
        const sharedProps = { i18n, onCreate: vi.fn(), onClose: vi.fn() };
        const loadQuickCard = vi.fn(() => manual);
        const loadWizard = vi.fn(async () => ({ Component: QuickCard, props: sharedProps }));
        const props = { i18n, openOnboarding: vi.fn(), loadQuickCard, loadWizard, isActive: true, aiRequest: 0 };
        const { rerender } = render(StudioWorkbench, props);
        await waitFor(() => expect(loadQuickCard).toHaveBeenCalledOnce());
        await rerender({ ...props, aiRequest: 1 });
        resolveManual({ Component: QuickCard, props: sharedProps });
        await waitFor(() => expect(loadWizard).toHaveBeenCalledOnce());
        expect((screen.getByRole("button", { name: "AI 辅助" }) as HTMLButtonElement).getAttribute("aria-pressed")).toBe("true");
    });

    it("mounts a standalone chunk view through its own mounter", async () => {
        const destroy = vi.fn();
        const mount = vi.fn((_component, target: HTMLElement) => {
            target.textContent = "standalone quick card";
            return { destroy };
        });
        const loadQuickCard = vi.fn(async () => ({
            Component: QuickCard,
            mount,
            props: { i18n, onCreate: vi.fn(), onClose: vi.fn() },
        }));
        const { unmount } = render(StudioWorkbench, {
            i18n,
            isActive: true,
            openOnboarding: vi.fn(),
            loadQuickCard,
        });

        expect(await screen.findByText("standalone quick card")).toBeTruthy();
        expect(mount).toHaveBeenCalledOnce();
        expect(screen.queryByRole("textbox", { name: "问题" })).toBeNull();
        unmount();
        expect(destroy).toHaveBeenCalledOnce();
    });

    it("creates bidirectional QA cards (swapping Q and A) when bidirectional option is checked", async () => {
        const onCreate = vi.fn(async () => undefined);
        render(QuickCard, { i18n, onCreate, onClose: vi.fn(), embedded: true });

        await fireEvent.input(await screen.findByRole("textbox", { name: "问题" }), { target: { value: "Apple" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "苹果" } });

        const bidiCheckbox = screen.getByRole("checkbox");
        expect(bidiCheckbox).toBeTruthy();
        await fireEvent.click(bidiCheckbox);

        await fireEvent.click(screen.getByRole("button", { name: /制卡/ }));
        await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));

        expect(onCreate).toHaveBeenNthCalledWith(1,
            "Apple ==苹果==", "deck-1", "默认卡组", "Apple", "苹果"
        );
        expect(onCreate).toHaveBeenNthCalledWith(2,
            "苹果 ==Apple==", "deck-1", "默认卡组", "苹果", "Apple"
        );
    });

    it("inserts cloze blank via cloze shortcut button or Ctrl+H keydown", async () => {
        render(QuickCard, { i18n, onCreate: vi.fn(), onClose: vi.fn(), embedded: true });
        await fireEvent.click(await screen.findByRole("button", { name: /挖空表达/ }));

        const qInput = screen.getByRole("textbox", { name: "问题" }) as HTMLTextAreaElement;
        await fireEvent.input(qInput, { target: { value: "光合作用产生氧气。" } });

        // 模拟选中文本 "氧气"
        qInput.selectionStart = 6;
        qInput.selectionEnd = 8;

        const clozeBtn = screen.getByRole("button", { name: /插入挖空/ });
        expect(clozeBtn).toBeTruthy();
        await fireEvent.click(clozeBtn);

        expect(qInput.value).toBe("光合作用产生____。");
        const aInput = screen.getByRole("textbox", { name: "答案" }) as HTMLTextAreaElement;
        expect(aInput.value).toBe("氧气");
    });

    it("supports creating a SuperBlock flashcard with multi-paragraph answer", async () => {
        const onCreate = vi.fn(async () => undefined);
        render(QuickCard, { i18n, onCreate, onClose: vi.fn(), embedded: true });

        // 点击切换到超级块模板
        await fireEvent.click(await screen.findByRole("button", { name: /超级块表达/ }));

        await fireEvent.input(screen.getByRole("textbox", { name: "问题" }), { target: { value: "简述牛顿三大运动定律？" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "第一定律：惯性定律。\n\n第二定律：F=ma 加速度定律。\n\n第三定律：作用力与反作用力定律。" } });

        // 验证卡面预览与徽标
        expect(screen.getByText("超级块")).toBeTruthy();
        expect(screen.getByText("简述牛顿三大运动定律？")).toBeTruthy();
        expect(screen.getByText(/超级块答案（3 块内容）/)).toBeTruthy();

        // 提交制卡
        await fireEvent.click(screen.getByRole("button", { name: /制卡/ }));
        await waitFor(() => expect(onCreate).toHaveBeenCalledWith(
            "{{{col\n简述牛顿三大运动定律？\n\n第一定律：惯性定律。\n\n第二定律：F=ma 加速度定律。\n\n第三定律：作用力与反作用力定律。\n}}}",
            "deck-1",
            "默认卡组",
            "简述牛顿三大运动定律？",
            "第一定律：惯性定律。\n\n第二定律：F=ma 加速度定律。\n\n第三定律：作用力与反作用力定律。"
        ));
    });

    it("检测到活动笔记时渲染来源联动条，并支持关联反链与就地追加", async () => {
        const onCreate = vi.fn(async () => undefined);
        render(QuickCard, {
            i18n,
            onCreate,
            onClose: vi.fn(),
            embedded: true,
            activeDoc: { name: "/生物/细胞生物学", docId: "20261031-doc-cell" },
        });

        expect(await screen.findByText(/当前笔记：生物\/细胞生物学/)).toBeTruthy();
        expect(screen.getByText("关联笔记反链")).toBeTruthy();
        expect(screen.getByText("就地追加到本文档")).toBeTruthy();

        await fireEvent.input(screen.getByRole("textbox", { name: "问题" }), { target: { value: "线粒体的功能？" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "产生ATP" } });

        // 默认关联笔记反链 (inPlace 为 false)
        await fireEvent.click(screen.getByRole("button", { name: /制卡/ }));
        await waitFor(() => expect(onCreate).toHaveBeenCalledWith(
            "线粒体的功能？ ==产生ATP==",
            "deck-1",
            "默认卡组",
            "线粒体的功能？",
            "产生ATP",
            undefined,
            { sourceDocID: "20261031-doc-cell", sourceTitle: "/生物/细胞生物学", inPlace: false },
        ));
    });
});

describe("R58 卡组选择与制卡页强化", () => {
    beforeEach(() => {
        getRiffDecks.mockReset().mockResolvedValue([{ id: "deck-1", name: "默认卡组", size: 0 }]);
        createRiffDeck.mockReset();
        Object.defineProperty(window, "siyuan", {
            configurable: true,
            value: { languages: { cancel: "取消" } },
        });
    });

    afterEach(cleanup);

    it("空库时不再渲染死下拉：显示创建引导，仅凭新名称即可制卡", async () => {
        getRiffDecks.mockResolvedValue([]);
        render(QuickCard, { i18n, onCreate: vi.fn(async () => undefined), onClose: vi.fn(), embedded: true });

        // 引导文案出现，且没有（不可用的）卡组下拉
        expect(await screen.findByText(/当前还没有卡组/)).toBeTruthy();
        expect(screen.queryByRole("combobox", { name: "选择卡组" })).toBeNull();
        // 仍然可以仅凭新名称完成制卡
        await fireEvent.input(screen.getByRole("textbox", { name: "新建卡组名称" }), { target: { value: "我的第一个卡组" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "问题" }), { target: { value: "光速是多少？" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "每秒 30 万公里" } });
        await fireEvent.click(screen.getByRole("button", { name: /制卡/ }));
        await waitFor(() => expect(createRiffDeck).toHaveBeenCalledWith("我的第一个卡组"));
    });

    it("初始卡组与成功制卡回传：initialDeckID 预选，onDeckUsed 记录上次卡组", async () => {
        getRiffDecks.mockResolvedValue([
            { id: "deck-a", name: "卡组A", size: 1 },
            { id: "deck-b", name: "卡组B", size: 1 },
        ]);
        const onDeckUsed = vi.fn();
        const onCreate = vi.fn(async () => undefined);
        render(QuickCard, { i18n, onCreate, onClose: vi.fn(), embedded: true, initialDeckID: "deck-b", onDeckUsed });

        const select = (await screen.findByRole("combobox", { name: "选择卡组" })) as HTMLSelectElement;
        await waitFor(() => expect(select.value).toBe("deck-b"));

        await fireEvent.input(screen.getByRole("textbox", { name: "问题" }), { target: { value: "Q" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "A" } });
        await fireEvent.click(screen.getByRole("button", { name: /制卡/ }));
        await waitFor(() => expect(onDeckUsed).toHaveBeenCalledWith("deck-b", "卡组B"));
    });

    it("填入示例仅在内容为空时可用，且随模板切换给出对应示例", async () => {
        const onCreate = vi.fn(async () => undefined);
        render(QuickCard, { i18n, onCreate, onClose: vi.fn(), embedded: true });

        const sampleBtn = await screen.findByRole("button", { name: /填入示例/ });
        await fireEvent.click(sampleBtn);
        const qBox = screen.getByRole("textbox", { name: "问题" }) as HTMLTextAreaElement;
        const aBox = screen.getByRole("textbox", { name: "答案" }) as HTMLTextAreaElement;
        expect(qBox.value).toContain("FSRS");
        expect(aBox.value.length).toBeGreaterThan(0);
        // 已有内容后按钮消失（不可覆盖）
        expect(screen.queryByRole("button", { name: /填入示例/ })).toBeNull();

        // 清空后切到挖空模板，示例应包含 ____ 标记
        await fireEvent.input(qBox, { target: { value: "" } });
        await fireEvent.input(aBox, { target: { value: "" } });
        // 快捷键目标须位于编辑器容器内（与真实焦点路径一致）
        await fireEvent.keyDown(qBox, { key: "2", ctrlKey: true });
        const sample2 = await screen.findByRole("button", { name: /填入示例/ });
        await fireEvent.click(sample2);
        expect((screen.getByRole("textbox", { name: "问题" }) as HTMLTextAreaElement).value).toContain("____");
    });

    it("Ctrl+1/2/3 快捷键切换表达模板且不改动已输入内容", async () => {
        render(QuickCard, { i18n, onCreate: vi.fn(async () => undefined), onClose: vi.fn(), embedded: true });
        const qBox = await screen.findByRole("textbox", { name: "问题" });
        await fireEvent.input(qBox, { target: { value: "保持不变" } });

        await fireEvent.keyDown(qBox, { key: "2", ctrlKey: true });
        expect(screen.getByRole("button", { name: /挖空表达/ }).getAttribute("aria-pressed")).toBe("true");
        expect((screen.getByRole("textbox", { name: "问题" }) as HTMLTextAreaElement).value).toBe("保持不变");

        await fireEvent.keyDown(qBox, { key: "3", ctrlKey: true });
        expect(screen.getByRole("button", { name: /超级块表达/ }).getAttribute("aria-pressed")).toBe("true");

        await fireEvent.keyDown(qBox, { key: "1", ctrlKey: true });
        expect(screen.getByRole("button", { name: /问答表达/ }).getAttribute("aria-pressed")).toBe("true");
    });

    it("预览卡面支持点击翻面查看答案", async () => {
        render(QuickCard, { i18n, onCreate: vi.fn(async () => undefined), onClose: vi.fn(), embedded: true });
        await fireEvent.input(await screen.findByRole("textbox", { name: "问题" }), { target: { value: "题面内容" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "答案内容" } });

        // 预览面有独立 aria-label（与标题栏「查看答案」按钮区分）
        const face = await screen.findByRole("button", { name: /卡面预览/ });
        expect(face.getAttribute("aria-pressed")).toBe("false");
        await fireEvent.click(face);
        expect(face.getAttribute("aria-pressed")).toBe("true");
        expect(screen.getByText("答案内容")).toBeTruthy();
        // 再点一次收起
        await fireEvent.click(face);
        expect(face.getAttribute("aria-pressed")).toBe("false");
    });

    it("制卡必备要素实时核查与硬核阻断", async () => {
        render(QuickCard, { i18n, onCreate: vi.fn(), onClose: vi.fn(), embedded: true });

        // 初始状态：卡组已选默认卡组，题干和答案为空
        expect(await screen.findByText(/卡组已指定/)).toBeTruthy();
        expect(screen.getByText(/必须填写题干/)).toBeTruthy();
        expect(screen.getByText(/必须填写答案内容/)).toBeTruthy();

        const submitBtn = screen.getByRole("button", { name: /制卡/ }) as HTMLButtonElement;
        expect(submitBtn.disabled).toBe(true);

        // 填写题干后
        await fireEvent.input(screen.getByRole("textbox", { name: "问题" }), { target: { value: "何谓操作系统的并发性？" } });
        expect(screen.getByText(/题干已填写/)).toBeTruthy();
        expect(submitBtn.disabled).toBe(true); // 答案仍为空，依然阻断

        // 填写答案后，全部满足
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "指两个或多个事件在同一时间间隔内发生。" } });
        expect(screen.getByText(/答案已就绪/)).toBeTruthy();
        expect(screen.getByText(/要素齐全，可立即制卡/)).toBeTruthy();
        expect(submitBtn.disabled).toBe(false);
    });

    it("智能试题拆单与数理符号快捷输入", async () => {
        render(QuickCard, { i18n, onCreate: vi.fn(), onClose: vi.fn(), embedded: true });

        // 点击智能拆单打开拆单面板
        const splitBtn = await screen.findByRole("button", { name: /智能拆单/ });
        await fireEvent.click(splitBtn);

        const pasteInput = screen.getByPlaceholderText(/直接粘贴整段试题文本/);
        expect(pasteInput).toBeTruthy();

        // 粘贴一道单选题并点击拆分
        await fireEvent.input(pasteInput, {
            target: {
                value: "计算机网络中 HTTP 默认使用的端口是？\nA. 80\nB. 443\nC. 22\nD. 8080\n答案：A\n解析：HTTP 默认 80。",
            },
        });
        await fireEvent.click(screen.getByRole("button", { name: /一键智能拆分填入/ }));

        // 自动识别为单选题，题干与选项已填充
        expect((screen.getByRole("textbox", { name: "问题" }) as HTMLTextAreaElement).value).toBe("计算机网络中 HTTP 默认使用的端口是？");
        expect(screen.getByDisplayValue("80")).toBeTruthy();
        expect(screen.getByDisplayValue("443")).toBeTruthy();

        // 快捷插入数理符号
        const mathTab = screen.getByRole("button", { name: "数理" });
        await fireEvent.click(mathTab);
        const piBtn = screen.getByRole("button", { name: "圆周率 π" });
        await fireEvent.click(piBtn);
        expect((screen.getByRole("textbox", { name: "问题" }) as HTMLTextAreaElement).value).toContain("\\pi");
    });

    it("选择题删除选项时自动平移重排正确答案键", async () => {
        render(QuickCard, { i18n, onCreate: vi.fn(), onClose: vi.fn(), embedded: true });

        // 切换到选择题
        const choiceTplBtn = await screen.findByRole("button", { name: /选择题/ });
        await fireEvent.click(choiceTplBtn);

        // 填写 A, B, C 选项
        const optInputs = screen.getAllByPlaceholderText(/选项 [A-D]/);
        await fireEvent.input(optInputs[0], { target: { value: "选项一" } });
        await fireEvent.input(optInputs[1], { target: { value: "选项二" } });
        await fireEvent.input(optInputs[2], { target: { value: "选项三" } });

        // 标记 C 为正确答案 (key: "C")
        const keyBtns = screen.getAllByTitle(/标记为正确答案/);
        await fireEvent.click(keyBtns[2]); // C

        expect(keyBtns[2].getAttribute("aria-pressed")).toBe("true");

        // 删除选项 B (index 1)
        const removeBtns = screen.getAllByRole("button", { name: /删除选项/ });
        await fireEvent.click(removeBtns[1]); // 删除 B

        // 原来是 C 的「选项三」现在平移为 B，且正确答案键平移为 B
        const updatedKeyBtns = screen.getAllByTitle(/标记为正确答案/);
        expect(updatedKeyBtns[1].getAttribute("aria-pressed")).toBe("true");
    });

    it("公式表达模板对 $$ 块级数学符号自动规范化为行内数学空位 (==$...$==)", async () => {
        const onCreate = vi.fn(async () => undefined);
        render(QuickCard, { i18n, onCreate, onClose: vi.fn(), embedded: true });

        await fireEvent.click(await screen.findByRole("button", { name: /公式推导/ }));
        await fireEvent.input(screen.getByRole("textbox", { name: "问题" }), { target: { value: "勾股定理公式" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "$$a^2 + b^2 = c^2$$" } });

        await fireEvent.click(screen.getByRole("button", { name: /制卡/ }));
        await waitFor(() => expect(onCreate).toHaveBeenCalledWith(
            "勾股定理公式\n==$a^2 + b^2 = c^2$==",
            "deck-1",
            "默认卡组",
            "勾股定理公式",
            "$$a^2 + b^2 = c^2$$"
        ));
    });

    it("挖空表达模板若题干已包含 ==答案== 且提供附加解析，规范化保留助记便签", async () => {
        const onCreate = vi.fn(async () => undefined);
        render(QuickCard, { i18n, onCreate, onClose: vi.fn(), embedded: true });

        await fireEvent.click(await screen.findByRole("button", { name: /挖空表达/ }));
        await fireEvent.input(screen.getByRole("textbox", { name: "问题" }), { target: { value: "中国的首都是==北京==" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "政治经济文化中心" } });

        await fireEvent.click(screen.getByRole("button", { name: /制卡/ }));
        await waitFor(() => expect(onCreate).toHaveBeenCalledWith(
            "中国的首都是==北京==\n> 💡 政治经济文化中心",
            "deck-1",
            "默认卡组",
            "中国的首都是==北京==",
            "政治经济文化中心"
        ));
    });
});
