/** BJ-4：遗忘卡错误原因标注常量与类型 */
export const ERROR_REASON_IDS = [
    "memory-blank",
    "concept-confusion",
    "condition-missed",
    "step-error",
    "question-unclear",
    "source-outdated",
    "attention-lapse",
] as const;

export type ErrorReasonId = typeof ERROR_REASON_IDS[number];
