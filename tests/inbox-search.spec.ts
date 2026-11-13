import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import InboxPage from "../src/ui/inbox-page.svelte";

vi.mock("siyuan", () => ({ showMessage: vi.fn() }));

afterEach(cleanup);

const items = [
    { blockID: "block-1", status: "inbox" as const, addedAt: 1000, updatedAt: 1000 },
    { blockID: "block-2", status: "inbox" as const, addedAt: 2000, updatedAt: 2000 },
];
const i18n = {
    inbox: {
        tabInbox: "待筛选", tabStaged: "暂存", tabSelected: "已选中", tabDismissed: "已淘汰",
        title: "材料收件箱", empty: "收件箱为空", filterGroupLabel: "状态筛选",
        selectAll: "全选", unselectAll: "全不选", refresh: "刷新", refreshedNotice: "已刷新",
        selectItem: "选择材料", openSource: "打开来源", opening: "打开中…",
        openFailed: "打开来源失败：${error}，请重试。", retry: "重试",
        stage: "暂存", select: "挑选", dismiss: "淘汰", selectedCount: "已选 ${n} 项",
    },
    settings: {
        searchPlaceholder: "搜索材料…",
    },
};

function makeProps() {
    return {
        i18n,
        inbox: {
            get: () => ({ version: 1 as const, items }),
            subscribe: () => () => {},
            setStatus: vi.fn(), undoSelection: vi.fn(), remove: vi.fn(), add: vi.fn(), makeCards: vi.fn(),
            openSource: vi.fn(async () => {}),
            titles: async () => new Map([
                ["block-1", "神经元动作电位机制"],
                ["block-2", "光合作用光反应过程"],
            ]),
        },
    };
}

describe("收件箱实时搜索过滤与交互", () => {
    it("支持通过关键词实时过滤材料列表", async () => {
        render(InboxPage, makeProps());

        expect(await screen.findByText("神经元动作电位机制")).toBeTruthy();
        expect(await screen.findByText("光合作用光反应过程")).toBeTruthy();

        const search = screen.getByRole("searchbox", { name: "搜索材料" }) as HTMLInputElement;
        await fireEvent.input(search, { target: { value: "动作电位" } });

        expect(screen.queryByText("神经元动作电位机制")).toBeTruthy();
        expect(screen.queryByText("光合作用光反应过程")).toBeNull();

        await fireEvent.input(search, { target: { value: "" } });
        expect(screen.queryByText("光合作用光反应过程")).toBeTruthy();
    });
});
