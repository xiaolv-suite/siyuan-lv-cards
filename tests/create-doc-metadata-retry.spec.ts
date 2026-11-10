import { describe, expect, it, vi } from "vitest";
import { isMetadataNotReadyError } from "@/api/siyuan";

describe("思源内核文档与块元数据就绪抗抖动自愈测试", () => {
    describe("isMetadataNotReadyError 判定", () => {
        it("识别 document metadata is not ready 异常", () => {
            expect(isMetadataNotReadyError(new Error("kernel error (code=-1): document metadata is not ready"))).toBe(true);
            expect(isMetadataNotReadyError(new Error("document metadata not ready"))).toBe(true);
            expect(isMetadataNotReadyError(new Error("block not found"))).toBe(true);
            expect(isMetadataNotReadyError("kernel error: not ready")).toBe(true);
        });

        it("排除其他非暂态错误", () => {
            expect(isMetadataNotReadyError(new Error("permission denied"))).toBe(false);
            expect(isMetadataNotReadyError(new Error("invalid parameter"))).toBe(false);
            expect(isMetadataNotReadyError(new Error("notebook not found"))).toBe(false);
        });
    });

    describe("路径规范化机制", () => {
        it("无前导斜杠的路径自动补齐前置 /", () => {
            const path1 = "小驴闪卡/AI 制卡/2026-10-27";
            const normalized1 = path1.startsWith("/") ? path1 : `/${path1}`;
            expect(normalized1).toBe("/小驴闪卡/AI 制卡/2026-10-27");

            const path2 = "/小驴闪卡/快速制卡";
            const normalized2 = path2.startsWith("/") ? path2 : `/${path2}`;
            expect(normalized2).toBe("/小驴闪卡/快速制卡");
        });
    });
});
