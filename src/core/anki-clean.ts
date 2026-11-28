/**
 * Anki M2：字段 HTML → 思源块友好文本清洗（docs/39 §3 M2）。
 * 纯模块：保守转换，宁多记损失不可静默篡改——
 *   块级标签换行、b/strong→粗体、i/em→斜体、img/[sound:]→媒体引用、
 *   Anki 完形 {{cN::答案::提示}} 剥壳（提示丢弃记损失）、LaTeX 定界符归一为 $/$$、
 *   实体解码、其余标签剥离、空白收敛。所有不可逆处记入 losses。
 */

export interface CleanResult {
    text: string;
    /** 引用到的媒体文件名（图片 src / [sound:] 目标） */
    mediaRefs: string[];
    /** 不可逆转换清单（损失报告素材） */
    losses: string[];
    /** 是否含完形填空语法 */
    cloze: boolean;
    /** Anki 完形删除序号，用于提示多卡型合并损失 */
    clozeOrdinals: number[];
}

const ENTITIES: Record<string, string> = {
    "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'",
};

function safeFromCodePoint(n: number, raw: string): string {
    if (!Number.isInteger(n) || n < 0 || n > 0x10ffff) return raw;
    if (n >= 0xd800 && n <= 0xdfff) return raw;
    return String.fromCodePoint(n);
}

function decodeEntities(s: string): string {
    return s
        .replace(/&#(\d+);/g, (raw, n) => safeFromCodePoint(Number(n), raw))
        .replace(/&#x([0-9a-f]+);/gi, (raw, hex) => safeFromCodePoint(parseInt(hex, 16), raw))
        .replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

export interface AnkiClozeTokenMatch {
    start: number;
    end: number;
    ordinal: number;
    answer: string;
    hint: string;
}

/**
 * 平衡花括号扫描 Anki 完形填空 `{{cN::答案(::提示)?}}`，兼容答案内部嵌套 `{}`（如 LaTeX 公式/代码）。
 */
export function findNextAnkiCloze(input: string, fromIndex = 0): AnkiClozeTokenMatch | null {
    const startRe = /\{\{c(\d+)::/g;
    startRe.lastIndex = fromIndex;
    let m: RegExpExecArray | null;
    while ((m = startRe.exec(input)) !== null) {
        const start = m.index;
        const ordinal = Number(m[1]);
        let cursor = start + m[0].length;
        let depth = 0;
        let splitAt = -1;
        let closedAt = -1;
        while (cursor < input.length) {
            const ch = input[cursor];
            if (ch === "{" ) {
                depth++;
                cursor++;
                continue;
            }
            if (ch === "}") {
                if (depth === 0 && input[cursor + 1] === "}") {
                    closedAt = cursor + 2;
                    break;
                }
                if (depth > 0) depth--;
                cursor++;
                continue;
            }
            if (depth === 0 && splitAt === -1 && ch === ":" && input[cursor + 1] === ":") {
                splitAt = cursor;
                cursor += 2;
                continue;
            }
            cursor++;
        }
        if (closedAt !== -1) {
            const bodyStart = start + m[0].length;
            const bodyEnd = closedAt - 2;
            const answer = splitAt === -1 ? input.slice(bodyStart, bodyEnd) : input.slice(bodyStart, splitAt);
            const hint = splitAt === -1 ? "" : input.slice(splitAt + 2, bodyEnd);
            return { start, end: closedAt, ordinal, answer, hint };
        }
    }
    return null;
}

export function replaceAnkiClozes(
    input: string,
    replacer: (token: AnkiClozeTokenMatch) => string,
): { text: string; matches: AnkiClozeTokenMatch[] } {
    const matches: AnkiClozeTokenMatch[] = [];
    let out = "";
    let pos = 0;
    while (pos < input.length) {
        const token = findNextAnkiCloze(input, pos);
        if (!token) {
            out += input.slice(pos);
            break;
        }
        matches.push(token);
        out += input.slice(pos, token.start) + replacer(token);
        pos = token.end;
    }
    return { text: out, matches };
}

/** 完形填空：{{cN::答案(::提示)?}} → ==答案==；提示丢弃记损失（允许答案内含单冒号如 09:30 与嵌套 {} 公式） */
function stripCloze(html: string, losses: string[]): { text: string; cloze: boolean; ordinals: number[] } {
    let cloze = false;
    const ordinals = new Set<number>();
    const { text } = replaceAnkiClozes(html, (token) => {
        cloze = true;
        ordinals.add(token.ordinal);
        if (token.hint) losses.push(`完形提示「${token.hint}」无法迁入普通问答，已丢弃`);
        return `==${token.answer}==`;
    });
    return { text, cloze, ordinals: [...ordinals].sort((a, b) => a - b) };
}

export function cleanAnkiField(html: string): CleanResult {
    const losses: string[] = [];
    const mediaRefs: string[] = [];
    let s = String(html ?? "");

    // 1) 完形填空
    const clozeR = stripCloze(s, losses);
    s = clozeR.text;

    // 2) Anki 音频/媒体标记：[sound:xxx]
    s = s.replace(/\[sound:([^\]]+)\]/g, (_m, name) => {
        mediaRefs.push(String(name).trim());
        return `\n[音频: ${String(name).trim()}]\n`;
    });

    // 3) 图片：<img ... src="xxx" ...> → 媒体引用（src 引号单双都认）
    s = s.replace(/<img\b[^>]*?src\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi, (_m, _q, dq, sq) => {
        const name = String(dq ?? sq ?? "").trim();
        if (name) mediaRefs.push(name);
        return `\n[图片: ${name}]\n`;
    });

    // 4) LaTeX 定界符归一（思源公式语法）
    s = s.replace(/\[\$\$\]([\s\S]*?)\[\/\$\$\]/gi, (_m, body) => `$$${body}$$`);
    s = s.replace(/\[\$\]([\s\S]*?)\[\/\$\]/gi, (_m, body) => `$${body}$`);
    s = s.replace(/\[latex\]([\s\S]*?)\[\/latex\]/gi, (_m, body) => `$$${body}$$`);
    s = s.replace(/\\\((.+?)\\\)/gs, (_m, body) => `$${body}$`);
    s = s.replace(/\\\[(.+?)\\\]/gs, (_m, body) => `$$${body}$$`);

    // 5) 块级标签 → 换行
    s = s.replace(/<br\s*\/?>/gi, "\n");
    s = s.replace(/<\/(div|p|li|tr|h[1-6]|table|ul|ol|blockquote)>/gi, "\n");
    s = s.replace(/<li\b[^>]*>/gi, "- ");

    // 6) 行内样式标签 → markdown 标记
    s = s.replace(/<(b|strong)>([\s\S]*?)<\/\1>/gi, (_m, _t, body) => `**${body}**`);
    s = s.replace(/<(i|em)>([\s\S]*?)<\/\1>/gi, (_m, _t, body) => `*${body}*`);

    // 7) 先安全解码实体再剥离剩余 HTML 标签，防止 &lt;script&gt; 绕过标签剥离逃逸为明文标签
    s = decodeEntities(s);

    // 8) 其余标签剥离（style/script 整段丢弃并记损失）
    if (/<(style|script)\b/i.test(s)) {
        losses.push("内嵌 style/script 已丢弃");
        s = s.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, "");
    }
    const leftoverTags = s.match(/<[a-z!/][^>]*>/gi);
    if (leftoverTags?.length) {
        losses.push(`${leftoverTags.length} 个 HTML 标签被剥离（如 ${leftoverTags[0].slice(0, 30)}）`);
    }
    s = s.replace(/<[a-z!/][^>]*>/gi, "");

    // 9) 空白收敛
    s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

    return { text: s, mediaRefs, losses, cloze: clozeR.cloze, clozeOrdinals: clozeR.ordinals };
}
