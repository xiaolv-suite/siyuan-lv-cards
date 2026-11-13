import { describe, expect, it } from "vitest";
import { estimateDataUrlBytes, compressImageFile } from "../src/core/image-compress";

describe("image-compress 快速制卡图片压缩", () => {
    it("estimateDataUrlBytes 正确推算 base64 字节量", () => {
        // 4 字符 base64 对应 3 字节
        const dataUrl = "data:image/jpeg;base64,QUJD";
        expect(estimateDataUrlBytes(dataUrl)).toBe(3);
    });

    it("小于等于阈值的文件直接输出 dataUrl", async () => {
        const smallBlob = new Blob(["hello-world"], { type: "image/jpeg" });
        const res = await compressImageFile(smallBlob, 500 * 1024);
        expect(res).toContain("data:image/jpeg;base64,");
    });
});
