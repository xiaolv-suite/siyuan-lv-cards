import { describe, expect, it } from "vitest";
import { extractDroppedBlockText } from "../src/core/drag-drop";
import { clusterDecksBySlash } from "../src/core/deck-management";

describe("Batch 5: CF-01 拖拽数据解析与 CF-02 斜杠分级卡包聚类", () => {
    describe("CF-01: extractDroppedBlockText", () => {
        it("空数据安全返回 null", () => {
            expect(extractDroppedBlockText(null)).toBeNull();
            expect(extractDroppedBlockText(undefined)).toBeNull();
            const emptyTransfer = {
                getData: () => "",
            } as any;
            expect(extractDroppedBlockText(emptyTransfer)).toBeNull();
        });

        it("解析普通文本并识别挖空标记", () => {
            const transfer = {
                getData: (type: string) => type === "text/plain" ? "TCP 建立连接通过 ==三次握手== 完成" : "",
            } as any;
            const res = extractDroppedBlockText(transfer);
            expect(res).toEqual({
                text: "TCP 建立连接通过 ==三次握手== 完成",
                blockID: undefined,
                hasCloze: true,
            });
        });

        it("解析思源块引用格式 ((id 'content')) 并提取纯正文与 ID", () => {
            const transfer = {
                getData: (type: string) => type === "text/plain" ? '((20261101123456-abcdefg "DNS 协议端口是 ==53=="))' : "",
            } as any;
            const res = extractDroppedBlockText(transfer);
            expect(res).toEqual({
                text: "DNS 协议端口是 ==53==",
                blockID: "20261101123456-abcdefg",
                hasCloze: true,
            });
        });

        it("剥离尾部思源原生 IAL 块属性标记", () => {
            const transfer = {
                getData: (type: string) => type === "text/plain" ? '操作系统核心特征是并发与共享 {: id="20261101123456-abcdefg" custom-riff-decks="cs"}' : "",
            } as any;
            const res = extractDroppedBlockText(transfer);
            expect(res?.text).toBe("操作系统核心特征是并发与共享");
            expect(res?.hasCloze).toBe(false);
        });

        it("text/plain 为空时平滑从 text/html 回退提取纯文本", () => {
            const transfer = {
                getData: (type: string) => type === "text/html" ? "<p>来自富文本编辑器的<strong>重要概念</strong></p>" : "",
            } as any;
            const res = extractDroppedBlockText(transfer);
            expect(res?.text).toBe("来自富文本编辑器的 重要概念");
        });
    });

    describe("CF-02: clusterDecksBySlash 斜杠分级树状聚类", () => {
        it("正确将多层级卡包按一级前缀聚类折叠", () => {
            const decks = [
                { id: "d1", name: "考研/数学/高数", size: 15 },
                { id: "d2", name: "考研/数学/线代", size: 10 },
                { id: "d3", name: "考研/英语/核心词", size: 25 },
                { id: "d4", name: "通用备考卡包", size: 8 },
            ];

            const clusters = clusterDecksBySlash(decks);
            expect(clusters).toHaveLength(2);

            // 考研聚类组
            const grp = clusters[0];
            expect(grp.prefix).toBe("考研");
            expect(grp.isGroup).toBe(true);
            expect(grp.totalSize).toBe(50); // 15 + 10 + 25
            expect(grp.decks.map(d => d.id)).toEqual(["d1", "d2", "d3"]);

            // 单个独立卡包
            const single = clusters[1];
            expect(single.prefix).toBe("通用备考卡包");
            expect(single.isGroup).toBe(false);
            expect(single.totalSize).toBe(8);
            expect(single.decks.map(d => d.id)).toEqual(["d4"]);
        });

        it("若斜杠前缀下仅有 1 个卡包，保持平铺不强制分组", () => {
            const decks = [
                { id: "d1", name: "单学科/仅此一个", size: 12 },
            ];
            const clusters = clusterDecksBySlash(decks);
            expect(clusters[0].isGroup).toBe(false);
            expect(clusters[0].decks).toHaveLength(1);
        });

        it("当卡包聚类数超过 8 个时，支持切片展示与全部展开逻辑", () => {
            const decks = Array.from({ length: 12 }, (_, i) => ({
                id: `d-${i}`,
                name: `学科-${i}`,
                size: 5,
            }));
            const clusters = clusterDecksBySlash(decks);
            expect(clusters).toHaveLength(12);
            const sliced = clusters.slice(0, 8);
            expect(sliced).toHaveLength(8);
            expect(clusters.length - sliced.length).toBe(4);
        });
    });
});
