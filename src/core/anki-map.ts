/**
 * Anki M2：模型 → 字段映射计划（docs/39 §3 M2）。
 * 纯模块：给定 Anki 模型，推导问面/答面/附带字段映射；字段不足如实标记不映射。
 * 用户级覆盖（按模型改映射）属 M3 导入执行时的交互，不在本模块。
 */
import type { AnkiModel } from "./anki-package";

export interface MapPlan {
    modelId: string;
    modelName: string;
    /** 问面字段索引（约定：第一字段为问面，与 Anki 导出惯例一致） */
    questionField: number;
    /** 主答面字段索引 */
    answerField: number;
    /** 其余字段索引（按序并入答案备注） */
    extraFields: number[];
    /** 单字段模型标识（仅 1 个字段时为 true，问答同源） */
    singleField?: boolean;
    /** false = 无法映射（进损失报告） */
    ok: boolean;
    issue?: string;
}

export function planForModel(model: AnkiModel): MapPlan {
    const base = { modelId: model.id, modelName: model.name };
    const n = model.fieldNames.length;
    if (n === 0) {
        return { ...base, questionField: -1, answerField: -1, extraFields: [], ok: false, issue: `模型「${model.name}」没有字段定义` };
    }
    if (n === 1) {
        // 单字段模型（典型：填空/完形）：问答同源，标注 singleField 防止预览/导入翻倍重复
        return { ...base, questionField: 0, answerField: 0, extraFields: [], singleField: true, ok: true, issue: `模型「${model.name}」仅一个字段：问答同源` };
    }
    return { ...base, questionField: 0, answerField: 1, extraFields: model.fieldNames.map((_, i) => i).slice(2), ok: true };
}
