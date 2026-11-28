/**
 * 挖空（高亮）段选择器（叶子常量模块，无任何上游依赖）：
 * 内核 getBlockDOM 把 ==text== 渲染为 span[data-type=mark]（3.8.x 实测），
 * HTML 导出/其他来源可能是 <mark>；两态都要覆盖，否则问题态遮罩失效、答案明文泄露。
 */
export const MARK_SELECTOR = "mark, span[data-type='mark']";
