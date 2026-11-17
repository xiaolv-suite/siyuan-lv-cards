import { describe, expect, it, vi } from "vitest";
import {
    buildRepairDrillDialogArgs,
    buildChallengeDialogArgs,
    buildPairingDialogArgs,
    buildOcclusionEditorDialogArgs,
} from "@/bootstrap/dialog-openers";

describe("dialog-openers 对话框参数装配引擎", () => {
    const i18n = {
        drillTitle: "修卡演练",
        challenge: { title: "限时挑战" },
        pairing: { title: "概念配对" },
        occlusion: { title: "图片遮挡制卡" },
    };

    it("正确装配修卡演练对话框参数", () => {
        const dummyComponent = {} as any;
        const args = buildRepairDrillDialogArgs(i18n, dummyComponent);

        expect(args.title).toBe("修卡演练");
        expect(args.component).toBe(dummyComponent);
        expect(args.width).toContain("720px");
        expect(args.props.i18n).toBe(i18n);
    });

    it("正确装配限时挑战对话框参数", () => {
        const dummyComponent = {} as any;
        const args = buildChallengeDialogArgs(i18n, dummyComponent);

        expect(args.title).toBe("限时挑战");
        expect(args.component).toBe(dummyComponent);
        expect(args.width).toContain("560px");
    });

    it("正确装配概念配对游戏对话框参数", () => {
        const dummyComponent = {} as any;
        const args = buildPairingDialogArgs(i18n, dummyComponent);

        expect(args.title).toBe("概念配对");
        expect(args.component).toBe(dummyComponent);
        expect(args.width).toContain("720px");
    });

    it("正确装配图片遮挡编辑器对话框参数", () => {
        const dummyComponent = {} as any;
        const onSave = vi.fn();
        const args = buildOcclusionEditorDialogArgs(i18n, dummyComponent, "blk-123", onSave);

        expect(args.title).toBe("图片遮挡制卡");
        expect(args.component).toBe(dummyComponent);
        expect(args.props.blockID).toBe("blk-123");
        expect(args.props.onSave).toBe(onSave);
    });
});
