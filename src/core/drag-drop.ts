/**
 * 拖拽交互引擎（Drag & Drop Block Extraction Engine · CF-01）
 *
 * 支持从思源笔记主编辑器或大纲中拖拽段落块、标题块、列表项直接落入制卡工坊与向导输入框：
 * 1. 宽容解析 text/plain 与 text/html，提取核心正文文本；
 * 2. 识别思源块引用格式 `((id 'content'))` 与纯块 ID；
 * 3. 自动剔除尾部思源原生 IAL 块属性标记（`{: id="..." ...}`）；
 * 4. 检测是否包含 `==挖空==` 标记，便于调用方自动推导卡片模板。
 */

export interface DroppedBlockInfo {
    text: string;
    blockID?: string;
    hasCloze: boolean;
}

/**
 * 从 DragEvent 的 DataTransfer 中解析出清晰的文本与块标识
 */
export function extractDroppedBlockText(dataTransfer: DataTransfer | null | undefined): DroppedBlockInfo | null {
    if (!dataTransfer) return null;
    let raw = dataTransfer.getData("text/plain");
    if (!raw) {
        const html = dataTransfer.getData("text/html");
        if (html) {
            raw = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        }
    }
    if (!raw || !raw.trim()) return null;

    let text = raw.trim();
    let blockID: string | undefined;

    // 1. 识别 ((id "content")) 或 ((id 'content')) 块引用格式
    const refMatch = text.match(/^\(\(\s*([0-9]{14}-[0-9a-z]{7})\s+["'](.*)["']\s*\)\)$/s);
    if (refMatch) {
        blockID = refMatch[1];
        text = refMatch[2].trim();
    } else {
        // 2. 识别纯块 ID: 20261101123456-abcdefg
        const idMatch = text.match(/^([0-9]{14}-[0-9a-z]{7})$/);
        if (idMatch) {
            blockID = idMatch[1];
        }
    }

    // 3. 剥离尾部思源 IAL 块属性标记 {: id="..." custom-riff-decks="..."}
    text = text.replace(/\{:[^}]+\}$/g, "").trim();

    // 4. 判断是否包含思源挖空标记
    const hasCloze = /==([^=]+)==/.test(text);

    return {
        text,
        blockID,
        hasCloze,
    };
}
