/**
 * 复习日志 CSV 导入解析（M10·FR1）：与 revlogToCsv 导出格式对齐。
 * 列：date,ts,cardID,deckID,blockID,rating,source[,duration,review_state]
 * （v0.66 起新增 duration/review_state 两列；旧 7 列文件照常解析；
 * review_state 本地显式缺失，导入时忽略该列不猜测——AQ-9）
 */

export interface CsvRow {
    ts: number;
    cardID: string;
    deckID: string;
    blockID: string;
    rating: number;
    source: "native" | "plugin";
    /** 作答耗时秒（可选列；非有限正数忽略） */
    dur?: number;
}

/** RFC-4180 状态机 CSV 解析：支持跨行引号字段与转义双引号 */
function parseCsvRecords(raw: string): string[][] {
    const clean = raw.replace(/^\ufeff/, "");
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < clean.length; i++) {
        const ch = clean[i];
        if (inQuotes) {
            if (ch === '"') {
                if (clean[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
            continue;
        }
        if (ch === '"' && field === "") {
            inQuotes = true;
        } else if (ch === ",") {
            row.push(field);
            field = "";
        } else if (ch === "\r" || ch === "\n") {
            if (ch === "\r" && clean[i + 1] === "\n") {
                i++;
            }
            row.push(field);
            field = "";
            if (row.some(cell => cell.trim() !== "")) {
                rows.push(row);
            }
            row = [];
        } else {
            field += ch;
        }
    }

    if (field !== "" || row.length > 0) {
        row.push(field);
        if (row.some(cell => cell.trim() !== "")) {
            rows.push(row);
        }
    }
    return rows;
}

export function parseRevlogCsv(text: string): { entries: CsvRow[] } {
    const rows = parseCsvRecords(String(text ?? ""));
    if (rows.length === 0) {
        throw new Error("empty csv");
    }
    const header = rows[0].map(h => h.trim());
    const idx = (name: string) => header.indexOf(name);
    const iTs = idx("ts"), iCard = idx("cardID"), iDeck = idx("deckID"), iBlock = idx("blockID"), iRating = idx("rating"), iSource = idx("source"), iDur = idx("duration");
    if (iTs < 0 || iCard < 0 || iRating < 0) {
        throw new Error("csv missing ts/cardID/rating columns");
    }
    const entries: CsvRow[] = [];
    for (let i = 1; i < rows.length; i++) {
        const cols = rows[i];
        const ts = Number(cols[iTs]);
        const cardID = (cols[iCard] ?? "").trim();
        const rating = Number(cols[iRating]);
        if (!Number.isFinite(ts) || !cardID || !Number.isInteger(rating) || rating < 0 || rating > 4) {
            continue;
        }
        const rawDurStr = iDur >= 0 ? (cols[iDur] ?? "").trim() : "";
        entries.push({
            ts,
            cardID,
            deckID: iDeck >= 0 ? (cols[iDeck] ?? "").trim() : "",
            blockID: iBlock >= 0 ? (cols[iBlock] ?? "").trim() : "",
            rating,
            source: iSource >= 0 && cols[iSource] === "native" ? "native" : "plugin",
            // 空串/越界/脏值一律缺失（不补 0）；Number("") 是 0，必须先判空串
            ...(rawDurStr !== "" && Number.isFinite(Number(rawDurStr)) && Number(rawDurStr) >= 0 && Number(rawDurStr) <= 3600
                ? { dur: Math.round(Number(rawDurStr)) } : {}),
        });
    }
    return { entries };
}
