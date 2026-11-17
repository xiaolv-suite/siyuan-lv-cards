import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import QuestionAttrDialog from "../src/ui/question-attr-dialog.svelte";

const mockAiChat = vi.fn();
vi.mock("../src/api/ai", () => ({
    aiChat: (...args: any[]) => mockAiChat(...args),
}));

const mockShowMessage = vi.fn();
vi.mock("../src/libs/notice", () => ({
    showMessage: (...args: any[]) => mockShowMessage(...args),
}));

describe("QuestionAttrDialog 免侵入属性问答卡配置弹窗", () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it("正确渲染笔记正文预览、原问题与字数统计", () => {
        const onSave = vi.fn();
        const onClear = vi.fn();
        const onClose = vi.fn();

        render(QuestionAttrDialog, {
            blockID: "b-001",
            initialQuestion: "什么是哈希表？",
            isAlreadyCard: true,
            previewText: "哈希表是根据键直接访问内存存储位置的数据结构。",
            t: {},
            aiSettings: {},
            onSave,
            onClear,
            onClose,
        });

        expect(screen.getByText("哈希表是根据键直接访问内存存储位置的数据结构。")).toBeTruthy();
        const textarea = screen.getByPlaceholderText(/输入向自己提问的问题/) as HTMLTextAreaElement;
        expect(textarea.value).toBe("什么是哈希表？");
        expect(screen.getByText("7 字")).toBeTruthy();
        expect(screen.getByText("清空问题")).toBeTruthy();
    });

    it("未制卡时展示卡包选择器，保存时传回 targetDeckID 与答案", async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        const onClear = vi.fn();
        const onClose = vi.fn();

        render(QuestionAttrDialog, {
            blockID: "b-002",
            initialQuestion: "",
            isAlreadyCard: false,
            previewText: "这是新卡片笔记正文",
            decks: [
                { id: "d-1", name: "计算机网络", size: 10, created: "", updated: "" },
                { id: "d-2", name: "操作系统", size: 5, created: "", updated: "" },
            ],
            t: {},
            aiSettings: {},
            onSave,
            onClear,
            onClose,
        });

        // 验证卡包选择器可见
        expect(screen.getByText("同步制卡加入卡包")).toBeTruthy();
        const textarea = screen.getByPlaceholderText(/输入向自己提问的问题/);
        await fireEvent.input(textarea, { target: { value: "计算机网络体系结构包括哪几层？" } });

        // 填写自定义答案
        const answerArea = screen.getByPlaceholderText(/可选：输入标准答案要点/);
        await fireEvent.input(answerArea, { target: { value: "物理层、数据链路层、网络层、传输层、会话层、表示层、应用层。" } });

        // 答案模式提示应切换为自定义态
        expect(screen.getByText(/复习背面将优先展示此答案/)).toBeTruthy();
        // 笔记正文预览应降级提示
        expect(screen.getByText(/已自定义答案，原文仍附卡面备查/)).toBeTruthy();

        // 点击保存
        const saveBtn = screen.getByText("保存闪卡问题");
        await fireEvent.click(saveBtn);

        expect(onSave).toHaveBeenCalledWith({
            question: "计算机网络体系结构包括哪几层？",
            answer: "物理层、数据链路层、网络层、传输层、会话层、表示层、应用层。",
            targetDeckID: "d-1",
        });
        expect(onClose).toHaveBeenCalled();
    });

    it("答案留空时保存传回空串，并展示正文回退提示", async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        const onClear = vi.fn();
        const onClose = vi.fn();

        render(QuestionAttrDialog, {
            blockID: "b-002b",
            initialQuestion: "仅有问题",
            isAlreadyCard: true,
            previewText: "笔记正文将作为答案",
            t: {},
            aiSettings: {},
            onSave,
            onClear,
            onClose,
        });

        expect(screen.getByText("复习背面将直接展示笔记正文")).toBeTruthy();
        const saveBtn = screen.getByText("保存闪卡问题");
        await fireEvent.click(saveBtn);

        expect(onSave).toHaveBeenCalledWith({
            question: "仅有问题",
            answer: "",
            targetDeckID: undefined,
        });
    });

    it("initialAnswer 正确回填，恢复正文答案按钮清空输入", async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        const onClear = vi.fn();
        const onClose = vi.fn();

        render(QuestionAttrDialog, {
            blockID: "b-002c",
            initialQuestion: "什么是哈希表？",
            initialAnswer: "根据键直接访问内存存储位置的数据结构",
            isAlreadyCard: true,
            previewText: "哈希表笔记",
            t: {},
            aiSettings: {},
            onSave,
            onClear,
            onClose,
        });

        const answerArea = screen.getByPlaceholderText(/可选：输入标准答案要点/) as HTMLTextAreaElement;
        expect(answerArea.value).toBe("根据键直接访问内存存储位置的数据结构");

        // 点击恢复正文答案
        await fireEvent.click(screen.getByText("恢复正文答案"));
        expect(answerArea.value).toBe("");
        expect(screen.getByText("复习背面将直接展示笔记正文")).toBeTruthy();
    });

    it("点击 AI 拟题能够提取建议并填充到输入框", async () => {
        mockAiChat.mockResolvedValue("什么是 TCP 三次握手？");
        const onSave = vi.fn();
        const onClear = vi.fn();
        const onClose = vi.fn();

        render(QuestionAttrDialog, {
            blockID: "b-003",
            initialQuestion: "",
            isAlreadyCard: true,
            previewText: "TCP 建立连接需要经过三次握手过程以同步双方的初始序列号。",
            t: {},
            aiSettings: {
                aiMode: "custom",
                aiEndpoint: "https://api.example.com",
                aiKey: "key-123",
                aiModel: "gpt-4o",
            },
            onSave,
            onClear,
            onClose,
        });

        const aiBtn = screen.getByText("✨ AI 拟题");
        await fireEvent.click(aiBtn);

        expect(mockAiChat).toHaveBeenCalled();
        const textarea = screen.getByPlaceholderText(/输入向自己提问的问题/) as HTMLTextAreaElement;
        expect(textarea.value).toBe("什么是 TCP 三次握手？");
    });

    it("点击清空问题触发 onClear 回调", async () => {
        const onSave = vi.fn();
        const onClear = vi.fn().mockResolvedValue(undefined);
        const onClose = vi.fn();

        render(QuestionAttrDialog, {
            blockID: "b-004",
            initialQuestion: "旧问题内容",
            isAlreadyCard: true,
            previewText: "正文内容",
            t: {},
            aiSettings: {},
            onSave,
            onClear,
            onClose,
        });

        const clearBtn = screen.getByText("清空问题");
        await fireEvent.click(clearBtn);

        expect(onClear).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
    });

    it("切换到实时预览 Tab 呈现卡面模拟，支持正背面翻转与双轨答案对照", async () => {
        const onSave = vi.fn();
        const onClear = vi.fn();
        const onClose = vi.fn();

        render(QuestionAttrDialog, {
            blockID: "b-005",
            initialQuestion: "操作系统中进程与线程的区别？",
            initialAnswer: "进程是资源分配的基本单位，线程是CPU调度的基本单位。",
            isAlreadyCard: true,
            previewText: "进程拥有独立的地址空间；线程共享进程的堆与全局资源。",
            decks: [{ id: "d-os", name: "操作系统核心", size: 8, created: "", updated: "" }],
            t: {},
            aiSettings: {},
            onSave,
            onClear,
            onClose,
        });

        // 点击导航栏的「实时卡面预览」Tab
        const previewTabBtn = screen.getByText(/实时卡面预览/);
        await fireEvent.click(previewTabBtn);

        // 正面应展示提问内容
        expect(screen.getByText("操作系统中进程与线程的区别？")).toBeTruthy();
        expect(screen.getByText(/复习时正面仅展示此提问/)).toBeTruthy();

        // 点击翻转卡面
        const flipBtn = screen.getByText("翻转卡面 ⤾");
        await fireEvent.click(flipBtn);

        // 背面应展示双轨：自定义要点 + 笔记原文备查
        expect(screen.getByText("进程是资源分配的基本单位，线程是CPU调度的基本单位。")).toBeTruthy();
        expect(screen.getByText("笔记原文备查")).toBeTruthy();
        // 同屏一体化所见即所得：左栏正文与右栏卡面双区同屏呈现，无需切页
        const noteTexts = screen.getAllByText(/进程拥有独立的地址空间/);
        expect(noteTexts.length).toBeGreaterThanOrEqual(2);
    });

    it("双栏一体化所见即所得：左侧输入提问与答案时，右侧卡面模拟器无延迟实时同步响应，无需翻页", async () => {
        const onSave = vi.fn();
        const onClear = vi.fn();
        const onClose = vi.fn();

        render(QuestionAttrDialog, {
            blockID: "b-live",
            initialQuestion: "",
            initialAnswer: "",
            isAlreadyCard: false,
            previewText: "响应式双向绑定测试素材",
            t: {},
            aiSettings: {},
            onSave,
            onClear,
            onClose,
        });

        // 默认未填写提问时，右侧正面展示空状态引导
        expect(screen.getByText(/尚未输入提问内容/)).toBeTruthy();

        // 在左侧输入框敲入新问题
        const qInput = screen.getByPlaceholderText(/输入向自己提问的问题/);
        await fireEvent.input(qInput, { target: { value: "实时所见即所得是如何实现的？" } });

        // 右侧正面卡片无须切换页面，即时渲染新提问
        expect(screen.getByText("实时所见即所得是如何实现的？")).toBeTruthy();

        // 翻转到背面
        await fireEvent.click(screen.getByText("翻转卡面 ⤾"));
        // 留空自定义答案时，背面直接展示笔记正文
        expect(screen.getByText(/参考答案 \(笔记正文\)/)).toBeTruthy();

        // 在左侧填入自定义答案
        const aInput = screen.getByPlaceholderText(/可选：输入标准答案要点/);
        await fireEvent.input(aInput, { target: { value: "Svelte 5 响应式状态双向联动与即时双栏栅格布局。" } });

        // 右侧背面卡片即时刷新出双轨答案徽标与要点内容
        expect(screen.getByText(/参考答案 \(自定义要点\)/)).toBeTruthy();
        expect(screen.getByText("Svelte 5 响应式状态双向联动与即时双栏栅格布局。")).toBeTruthy();
    });

    it("切换到使用指南 Tab 呈现零污染双轨问答完整说明与快捷键指南", async () => {
        const onSave = vi.fn();
        const onClear = vi.fn();
        const onClose = vi.fn();

        render(QuestionAttrDialog, {
            blockID: "b-006",
            initialQuestion: "什么是二叉搜索树？",
            isAlreadyCard: false,
            previewText: "二叉搜索树左子树所有节点值小于根节点，右子树所有节点值大于根节点。",
            t: {},
            aiSettings: {},
            onSave,
            onClear,
            onClose,
        });

        // 点击导航栏的「使用指南」Tab
        const guideTabBtn = screen.getByText(/使用指南/);
        await fireEvent.click(guideTabBtn);

        // 验证指南关键要素均完整呈现
        expect(screen.getByText(/零正文污染，笔记原貌 100% 纯净/)).toBeTruthy();
        expect(screen.getByText(/正面主动提取，激发神经联结/)).toBeTruthy();
        expect(screen.getByText(/双轨答案机制：简便模式 vs 精炼模式/)).toBeTruthy();
        expect(screen.getByText(/极致快捷操作/)).toBeTruthy();
    });
});
