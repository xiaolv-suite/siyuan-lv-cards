/**
 * 闪卡动态看板与错题本（Dynamic Flashcard & Leech Dashboard Doc）
 * 生成利用思源原生 SQL 嵌入块（{{SELECT * FROM blocks WHERE ...}}）动态聚合的活文档。
 *
 * 核心价值：
 * 1. 实时性：基于思源内核 SQLite 索引，复习、改卡、打星、错因标记后文档内实时更新；
 * 2. 零侵入：无需打开插件面板，直接在思源笔记正文中查看、跳转与编辑；
 * 3. 错题集：水蛭卡（≥ 4 次遗忘）自动聚合，专治知识盲区。
 */

export const DYNAMIC_BOARD_DOC_PATH = "小驴闪卡/闪卡动态看板与错题本";

export function buildDynamicBoardMarkdown(i18n?: Record<string, any>): string {
    const dict = i18n?.dynamicBoard ?? {};
    const title = dict.title ?? "小驴闪卡 · 动态看板与错题本";
    const note = dict.note ?? "本文档通过思源笔记原生 SQL 嵌入块动态汇总全库闪卡。无需打开插件面板，在思源笔记正文中实时查看、检索与编辑，随复习与制卡自动更新。";

    return [
        `# ⚡ ${title}`,
        ``,
        `> 💡 **思源原生动态看板**：${note}`,
        ``,
        `## ⚠️ 疑难错题卡（水蛭卡 · 遗忘 ≥ 4 次）`,
        `> 提示：复习中多次遗忘的卡片会自动打上水蛭标记，集中在此处攻克或拆解。`,
        ``,
        `{{SELECT * FROM blocks WHERE (ial LIKE '%custom-lv-leech="true"%' OR ial LIKE '%custom-lv-lapses="%') ORDER BY updated DESC LIMIT 50}}`,
        ``,
        `## ⭐ 重点星标卡`,
        `> 提示：在复习工作台或卡库中点亮星标的重点卡片。`,
        ``,
        `{{SELECT * FROM blocks WHERE ial LIKE '%custom-lv-starred="true"%' ORDER BY updated DESC LIMIT 50}}`,
        ``,
        `## ❌ 认知错因归因卡`,
        `> 提示：复习遗忘时标注了错误原因（概念混淆/审题失误等）的卡片。`,
        ``,
        `{{SELECT * FROM blocks WHERE ial LIKE '%custom-lv-error-reason="%' ORDER BY updated DESC LIMIT 50}}`,
        ``,
        `## 🆕 近期制作闪卡`,
        `> 提示：最新录入或提炼的闪卡。`,
        ``,
        `{{SELECT * FROM blocks WHERE (ial LIKE '%custom-riff-decks%' OR ial LIKE '%custom-lv-%') ORDER BY created DESC LIMIT 50}}`,
        ``,
        `---`,
        `> 由小驴闪卡（siyuan-lv-cards）生成 · 纯本地原生文档`,
    ].join("\n");
}
