/**
 * 标记符制卡扫描解析器（Marker Card Extraction）
 * 支持单行 `::`/`:::`、多行 `?`/`??` 问答与 `？` / `==挖空==` 结尾块提取。
 */

import { validateFlashcardMarkdown } from "./flashcard-quality";
import { parseSrLine, parseSrMultiline, stripSrMarkers } from "./obsidian-sr";

export interface MarkerCardItem {
    blockID: string;
    kind: "qa" | "whole";
    front: string;
    back: string;
}

/**
 * 扫描 Markdown 内容提取标记符制卡项（支持单行 ::、多行 ?/?? 问答与 ？ 结尾块）
 */
export function extractMarkerCardItems(rows: Array<{ id?: string; markdown?: string }>): {
    items: MarkerCardItem[];
    wholeIds: string[];
} {
    const items: MarkerCardItem[] = [];
    const wholeIds: string[] = [];

    for (const r of rows) {
        const md = String(r.markdown ?? "").trim();
        if (!md || !r.id) {
            continue;
        }
        const blockID = String(r.id);

        // AQ-11：Obsidian SR 语法识别——单行 `::`/`:::`
        if (!md.includes("\n")) {
            const sr = parseSrLine(md);
            if (sr) {
                const front = stripSrMarkers(sr.front.replace(/#flashcards\S*/g, ""));
                const back = stripSrMarkers(sr.back.replace(/#flashcards\S*/g, ""));
                if (front && back) {
                    items.push({ blockID, kind: "qa", front, back });
                    continue;
                }
            }
        } else {
            // 多行 `?` / `??` 问答块
            const multi = parseSrMultiline(md.split(/\r?\n/));
            if (multi) {
                const front = stripSrMarkers(multi.front.replace(/#flashcards\S*/g, ""));
                const back = stripSrMarkers(multi.back.replace(/#flashcards\S*/g, ""));
                if (front && back) {
                    items.push({ blockID, kind: "qa", front, back });
                    continue;
                }
            }
        }

        // 以「？」结尾的块或包含挖空的块：整块直接入组
        if ((md.endsWith("？") || /(?<!=)==(?!=)/.test(md)) && !validateFlashcardMarkdown(md)) {
            items.push({ blockID, kind: "whole", front: md.replace(/[*`#]/g, ""), back: "" });
            wholeIds.push(blockID);
        }
    }

    return { items, wholeIds };
}
