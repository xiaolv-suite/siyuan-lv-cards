# [TASK-20261103-phase3-ai-and-activity] 小驴闪卡 · 第三阶段：AI统一网关与全生态今日活动流工单

- **任务状态**: `completed`
- **完成时间**: 2026-11-03
- **目标插件**: `小驴闪卡 (siyuan-lv-cards)`
- **核心库源**: `src/libs/lv-notice-kit.ts` (已升级至 Protocol v1.2.0)
- **标准协议**: Epoch 7 Phase 3 · AI 网关与今日活动流

---

## 一、 第三阶段核心改造目标

1. **统一 AI 凭据与并发限流网关 (lvAi)**：
   - 彻底告别每个插件重复填 Key；在任一插件配置好的共享 API Key，通过 `lvAi.chat({ source, messages })` 自动继承复用；
   - 全局令牌桶自动限制最大并发（<=2），遇到 429 自动按指数退避重试，调用方零额外容灾代码；
2. **今日全生态活动主干流 (lvActivity)**：
   - 各插件的关键产出（打卡记录、剪藏文章、试卷交卷、卡片复习、人脉互动）通过 `lvActivity.record({ source, category, title })` 统一汇报；
   - 今日打卡/工作台可直接读取 `lvActivity.getTodayRecords()`，并调用 `lvActivity.formatAsMarkdown()` 一键将今日全家桶成果汇编入 Daily Note！

---

## 二、 本插件专属改造重点

1. **接入统一 AI 网关 (lvAi)**：剥离插件内部自建的 OpenAI 兼容 client，AI 智能制卡全面改用 lvAi.chat({ source: "闪卡", messages })，自动复用全生态共享 API Key，自动享受令牌桶限流与 429 退避；
2. **今日活动广播 (lvActivity)**：完成卡包复习时，广播 lvActivity.record({ source: "闪卡", category: "card", title: "完成「英语核心词汇」复习 (30张)", detail: "耗时 12 分钟" })。

---

## 三、 质量门禁与验收标准

1. **类型检查**：运行 `pnpm run check` 或 `tsc --noEmit`，确保 0 报错；
2. **测试门禁**：运行 `pnpm test` 确保全量测试通过；
3. **任务状态回写**：完成后将首行 `- **任务状态**: `pending`` 改为 `completed`；
4. **严格本地提交**：Conventional Commit 规范（如 `feat(synergy): integrate lvAi and lvActivity for phase 3`），**严禁 git push**。
