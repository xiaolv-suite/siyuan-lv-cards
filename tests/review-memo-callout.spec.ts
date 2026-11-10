import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewMemoCallout from "@/ui/review/ReviewMemoCallout.svelte";

describe("ReviewMemoCallout 助记便签与原生回忆引导组件", () => {
    afterEach(() => {
        cleanup();
    });

    const mockT = {
        review: {
            customAnswerTitle: "参考答案（来自生态插件）",
            memoAnswerTitle: "参考答案（来自思源块备注）",
            memoTitle: "助记线索",
            memoEdit: "修改助记线索",
            nativeRecallTitle: "思源原生自由回忆",
            nativeRecallDesc: "该卡为原生笔记闪卡；原笔记未做任何修改。请对照上方内容，在下方直接自评打分。",
            memoModalTitle: "给未来的自己留助记线索",
            tbMemo: "助记便签",
        },
    };

    it("showAnswer 为 false 时不渲染任何助记提示或引导", () => {
        const { container } = render(ReviewMemoCallout, {
            props: {
                showAnswer: false,
                cardMemo: "记忆口诀：天王盖地虎",
                t: mockT,
            },
        });

        expect(container.querySelector(".lv-card-memo-callout")).toBeNull();
        expect(container.querySelector(".lv-native-recall-guidance")).toBeNull();
        expect(container.querySelector(".lv-memo-prompt")).toBeNull();
    });

    it("有 cardMemo 且为生态插件答案时，正确展示生态插件专属标题与内容，并响应修改", async () => {
        const onEditMemo = vi.fn();
        const { getByTestId, getByText } = render(ReviewMemoCallout, {
            props: {
                showAnswer: true,
                cardMemo: "这是由某生态插件生成的结构化参考答案",
                isCustomPluginAnswer: true,
                t: mockT,
                onEditMemo,
            },
        });

        const memoEl = getByTestId("review-card-memo");
        expect(memoEl).toBeTruthy();
        expect(getByText("参考答案（来自生态插件）")).toBeTruthy();
        expect(getByText("这是由某生态插件生成的结构化参考答案")).toBeTruthy();

        const editBtn = getByTestId("review-memo-edit-btn");
        await fireEvent.click(editBtn);
        expect(onEditMemo).toHaveBeenCalledTimes(1);
    });

    it("有 cardMemo 且非挖空时，标题回退为思源块备注参考答案", () => {
        const { getByText } = render(ReviewMemoCallout, {
            props: {
                showAnswer: true,
                cardMemo: "块备注答案",
                isCustomPluginAnswer: false,
                cardHtml: "<div>普通块内容无挖空</div>",
                t: mockT,
            },
        });

        expect(getByText("参考答案（来自思源块备注）")).toBeTruthy();
        expect(getByText("块备注答案")).toBeTruthy();
    });

    it("有 cardMemo 且为挖空卡时，标题展示为助记线索", () => {
        const { getByText } = render(ReviewMemoCallout, {
            props: {
                showAnswer: true,
                cardMemo: "口诀ABC",
                isCustomPluginAnswer: false,
                cardHtml: '<div>这是<span data-type="mark">挖空</span>卡</div>',
                t: mockT,
            },
        });

        expect(getByText("助记线索")).toBeTruthy();
        expect(getByText("口诀ABC")).toBeTruthy();
    });

    it("无 memo、无遮挡、非挖空且非问答时，展示思源原生自由回忆自评引导", () => {
        const { getByTestId, getByText } = render(ReviewMemoCallout, {
            props: {
                showAnswer: true,
                cardMemo: "",
                cardHtml: "<p>这是一段纯笔记正文内容</p>",
                occl: null,
                t: mockT,
            },
        });

        expect(getByTestId("review-native-recall")).toBeTruthy();
        expect(getByText("思源原生自由回忆")).toBeTruthy();
        expect(getByText("该卡为原生笔记闪卡；原笔记未做任何修改。请对照上方内容，在下方直接自评打分。")).toBeTruthy();
    });

    it("无 memo 但为挖空卡时，展示便签添加按钮并响应点击", async () => {
        const onEditMemo = vi.fn();
        const { getByTestId, getByText } = render(ReviewMemoCallout, {
            props: {
                showAnswer: true,
                cardMemo: "",
                cardHtml: '<p>记忆点：<span data-type="mark">核心术语</span></p>',
                occl: null,
                faceError: false,
                t: mockT,
                onEditMemo,
            },
        });

        expect(getByTestId("review-memo-prompt")).toBeTruthy();
        const addBtn = getByTestId("review-memo-add-btn");
        expect(getByText("助记便签")).toBeTruthy();
        await fireEvent.click(addBtn);
        expect(onEditMemo).toHaveBeenCalledTimes(1);
    });

    it("faceError 为 true 时不展示助记便签添加按钮", () => {
        const { queryByTestId } = render(ReviewMemoCallout, {
            props: {
                showAnswer: true,
                cardMemo: "",
                cardHtml: '<p>记忆点：<span data-type="mark">核心术语</span></p>',
                faceError: true,
                t: mockT,
            },
        });

        expect(queryByTestId("review-memo-prompt")).toBeNull();
    });
});
