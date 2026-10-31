// 版本事实源校验（AN 组）：plugin.json / package.json / README.md / 代码常量 PLUGIN_VERSION 必须一致，
// CHANGELOG 顶部小节必须包含该版本号。不一致即退出码 1（CI 门禁用）。
import { readFileSync } from "node:fs";

const plugin = JSON.parse(readFileSync("plugin.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const changelog = readFileSync("CHANGELOG.md", "utf8");
const readme = readFileSync("README.md", "utf8");
const lvcardsPkgSrc = readFileSync("src/core/lvcards-package.ts", "utf8");

const errors = [];
if (plugin.version !== pkg.version) {
    errors.push(`plugin.json (${plugin.version}) 与 package.json (${pkg.version}) 版本不一致`);
}
if (!readme.includes(`v${plugin.version}`)) {
    errors.push(`README.md 未包含当前版本 v${plugin.version}`);
}
const codeVerMatch = lvcardsPkgSrc.match(/export const PLUGIN_VERSION\s*=\s*["']([^"']+)["']/);
if (!codeVerMatch || codeVerMatch[1] !== plugin.version) {
    errors.push(`src/core/lvcards-package.ts PLUGIN_VERSION (${codeVerMatch?.[1] ?? "缺失"}) 与 plugin.json (${plugin.version}) 版本不一致`);
}
const head = changelog.split("\n").findIndex(l => l.startsWith("## v"));
const headLine = head < 0 ? "" : changelog.split("\n")[head].trim();
if (!headLine.startsWith(`## v${plugin.version}`)) {
    errors.push(`CHANGELOG.md 顶部小节必须是 v${plugin.version}（当前顶部：${headLine || "无"}）`);
}
const section = changelog.slice(changelog.indexOf(`## v${plugin.version}`));
if (plugin.version !== "0.0.0" && section.length < 40) {
    errors.push(`CHANGELOG v${plugin.version} 小节内容为空`);
}

if (errors.length) {
    console.error("版本事实源校验失败：\n  " + errors.join("\n  "));
    process.exit(1);
}
console.log(`versions OK: ${plugin.version}（plugin/package/README/PLUGIN_VERSION/CHANGELOG 一致）`);
