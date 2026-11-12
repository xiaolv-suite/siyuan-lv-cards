/**
 * 全类型示例卡内容（R59 · 476 扩容）。
 * 答案段一律用 ==挖空==（问题态由 lv-masked 遮罩）——块内换行没有问答切分语义，
 * 裸"问题\n答案"式示例会在问题态泄露答案（审计 D-1）。
 *
 * 覆盖小驴闪卡支持的全部 13 类卡面形态（图片遮挡需按图定框，由遮挡编辑器现场创建，不入固定示例）：
 * 每条 = { kind 幂等标记, md 内容, attrs 额外块属性 }，kind 写入 custom-lv-sample 供断点恢复。
 */
export interface SampleCardItem {
    kind: string;
    md: string;
    attrs?: Record<string, string>;
}

export function allTypeSampleCards(): SampleCardItem[] {
    return [
        {
            kind: "qa",
            md: "示例 · 标准问答题：FSRS 调度模型中的 R 代表什么？\n==可提取性（Retrievability），即当前记忆的可提取强度。==",
        },
        {
            kind: "cloze",
            md: "示例 · 挖空题：HTTP 状态码中 ==200== 表示请求成功，==404== 表示资源不存在，==500== 表示服务器内部错误。",
        },
        {
            kind: "superblock",
            md: "示例 · 超级块多段问答：\n{{{col\n细胞呼吸分为哪三个阶段？\n\n糖酵解、柠檬酸循环、氧化磷酸化。\n\n糖酵解的场所是哪里？\n\n细胞质基质。\n}}}",
        },
        {
            kind: "bidi-a",
            md: "示例 · 双向卡（正向）：「小驴闪卡」的英文插件名是什么？\n==siyuan-lv-cards==",
        },
        {
            kind: "bidi-b",
            md: "示例 · 双向卡（反向）：siyuan-lv-cards 对应的中文插件名是什么？\n==小驴闪卡==",
        },
        {
            kind: "delimited",
            md: "示例 · 分隔符问答（:: 语法）：TCP 三次握手的第一个报文是什么 ::\n==SYN（同步序列号请求）==",
        },
        {
            kind: "choice-single",
            md: "示例 · 单选题：地球绕太阳公转一周大约需要多长时间？\nA. 1 天\nB. 30 天\nC. 365 天\nD. 10 年\n==正确答案：C==\n{: custom-exam-type=\"single\" custom-exam-answer=\"C\" custom-exam-analysis=\"地球公转周期约为一年（365.25 天）\"}",
            attrs: { "custom-exam-type": "single", "custom-exam-answer": "C", "custom-exam-analysis": "地球公转周期约为一年（365.25 天）" },
        },
        {
            kind: "choice-multi",
            md: "示例 · 多选题：下列哪些属于哺乳动物？（多选）\nA. 蝙蝠\nB. 鲸鱼\nC. 鳄鱼\nD. 鸭嘴兽\n==正确答案：ABD==\n{: custom-exam-type=\"multiple\" custom-exam-answer=\"ABD\" custom-exam-analysis=\"蝙蝠和鲸鱼是哺乳动物，鸭嘴兽是卵生哺乳动物；鳄鱼是爬行动物\"}",
            attrs: { "custom-exam-type": "multiple", "custom-exam-answer": "ABD", "custom-exam-analysis": "蝙蝠和鲸鱼是哺乳动物，鸭嘴兽是卵生哺乳动物；鳄鱼是爬行动物" },
        },
        {
            kind: "judge",
            md: "示例 · 判断题：FSRS 的参数可以按个人复习数据自动拟合优化。\n==正确答案：对==\n{: custom-exam-type=\"judge\" custom-exam-answer=\"对\" custom-exam-analysis=\"FSRS 用可优化参数拟合记忆模型，比固定参数的 SM-2 更贴合个人曲线\"}",
            attrs: { "custom-exam-type": "judge", "custom-exam-answer": "对", "custom-exam-analysis": "FSRS 用可优化参数拟合记忆模型，比固定参数的 SM-2 更贴合个人曲线" },
        },
        {
            kind: "fill",
            md: "示例 · 填空题（打字作答）：思源笔记本地存储使用的开源数据库是 ____。\n==SQLite==\n{: custom-exam-type=\"fill\" custom-exam-answer=\"SQLite\"}",
            attrs: { "custom-exam-type": "fill", "custom-exam-answer": "SQLite" },
        },
        {
            kind: "code",
            md: "示例 · 代码卡：下面这段 JavaScript 的输出是什么？\n`console.log(typeof null);`\n==\"object\"（历史遗留行为）==",
        },
        {
            kind: "formula",
            md: "示例 · 公式卡：写出正态分布的概率密度函数：\n$f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}$\n==$\\mu$ 是均值，$\\sigma$ 是标准差==",
        },
        {
            kind: "table",
            md: "示例 · 表格卡：FSRS 的三大核心变量分别是什么？\n| 变量 | 全称 | 含义 |\n| --- | --- | --- |\n| D | Difficulty | ==难度== |\n| S | Stability | ==稳定性== |\n| R | Retrievability | ==可提取性== |",
        },
    ];
}

/**
 * 旧版 5 张引导示例（保留内容兼容既有幂等标记，onboardingSample1–5 i18n 驱动）。
 */
export function sampleCards(): string[] {
    return [
        "示例 1 · 普通卡：思源内核的 ==FSRS 调度负责计算间隔==，小驴闪卡（内测版）负责体验增强。",
        "示例 2 · 公式卡：质能方程 $E = mc^2$ 中 $c$ 代表什么？\n==光速（约 3×10⁸ m/s）。==",
        "示例 3 · 挖空卡：FSRS 的四个核心状态是 ==未学习、学习、复习、悬置==。",
        "示例 4 · 列表卡：FSRS 评分四档是 ==遗忘（Again）、困难（Hard）、良好（Good）、简单（Easy）==。",
        "示例 5 · 问答卡：什么是真实保持率（True Retention）？\n==按卡片成熟度分层统计的记忆保持比例，比整体正确率更能反映记忆效果。==",
    ];
}
