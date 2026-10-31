import { describe, expect, it } from "vitest";
import { parsePastedQuestionText } from "../src/core/question-splitter";

describe("question-splitter 试题文本智能拆单解析器", () => {
    it("正确解析标准单选题文本并提取题干、选项、答案与解析", () => {
        const text = `
1. 计算机网络中负责端到端可靠数据传输的协议是？
A. TCP
B. UDP
C. IP
D. ICMP
答案：A
解析：TCP（传输控制协议）提供面向连接的、可靠的字节流传输服务。
`;
        const res = parsePastedQuestionText(text);
        expect(res).not.toBeNull();
        expect(res?.type).toBe("single");
        expect(res?.stem).toBe("计算机网络中负责端到端可靠数据传输的协议是？");
        expect(res?.options).toEqual([
            { key: "A", text: "TCP" },
            { key: "B", text: "UDP" },
            { key: "C", text: "IP" },
            { key: "D", text: "ICMP" },
        ]);
        expect(res?.correctKeys).toEqual(["A"]);
        expect(res?.analysis).toContain("TCP（传输控制协议）提供面向连接的");
    });

    it("正确解析多选题文本并识别多个正确选项", () => {
        const text = `
下列各项中，属于操作系统基本特征的有？
A、并发
B、共享
C、虚拟
D、异步
【答案】ABCD
【解析】操作系统的四大基本特征为并发性、共享性、虚拟性和异步性。
`;
        const res = parsePastedQuestionText(text);
        expect(res).not.toBeNull();
        expect(res?.type).toBe("multiple");
        expect(res?.stem).toBe("下列各项中，属于操作系统基本特征的有？");
        expect(res?.options).toHaveLength(4);
        expect(res?.correctKeys).toEqual(["A", "B", "C", "D"]);
        expect(res?.analysis).toContain("操作系统的四大基本特征");
    });

    it("支持提取题干括号内嵌的答案（如「HTTP 默认端口是（ A ）」）", () => {
        const text = `
计算机网络中，HTTP 默认使用的传输层端口号是（ C ）。
A. 21
B. 22
C. 80
D. 443
`;
        const res = parsePastedQuestionText(text);
        expect(res).not.toBeNull();
        expect(res?.type).toBe("single");
        expect(res?.correctKeys).toEqual(["C"]);
        expect(res?.stem).toContain("（   ）");
    });

    it("正确解析判断题文本", () => {
        const text = `
死锁是指两个或两个以上的进程因争夺系统资源而产生的一种互相等待的现象。
答案：对
解析：死锁产生的四个必要条件：互斥、请求与保持、不剥夺、循环等待。
`;
        const res = parsePastedQuestionText(text);
        expect(res).not.toBeNull();
        expect(res?.type).toBe("judge");
        expect(res?.answer).toBe("对");
        expect(res?.correctKeys).toEqual(["A"]);
        expect(res?.analysis).toContain("死锁产生的四个必要条件");
    });

    it("正确解析填空题并归一化下划线占位符", () => {
        const text = `
在 TCP/IP 参考模型中，网络层主要通过 _______ 协议实现不同网络之间的寻址。
答案：IP
解析：IP 协议是核心协议。
`;
        const res = parsePastedQuestionText(text);
        expect(res).not.toBeNull();
        expect(res?.type).toBe("fill");
        expect(res?.stem).toContain("____");
        expect(res?.answer).toBe("IP");
    });

    it("空文本或过短文本安全返回 null", () => {
        expect(parsePastedQuestionText("")).toBeNull();
        expect(parsePastedQuestionText("ab")).toBeNull();
    });
});
