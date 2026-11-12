# TASK-20261105: Cram Mode 算法隔离与小驴拾遗高亮制卡规则消费

## 1. 任务背景与使命
在考前突击快刷场景下，用户需要对全库、本周待复习或顽固水蛭卡进行高密度过筛练习，但此过程绝不能影响 FSRS 算法的长期排期参数。本次任务实现：
1. **算法隔离的突击模式 (Cram Mode)**：交互与正式复习完全一致，但调度参数零污染（零改动 due/stability/difficulty/lapses/reps，零写 revlog）；
2. **小驴拾遗消费规则 (`rule-glean-to-cards`)**：对齐生态联动契约，自动消费拾遗高亮制卡请求并转化为正式新卡入库。

## 2. 核心架构与落地设计

### 2.1 算法隔离红线 (`src/core/cram-mode.ts`)
- **零 FSRS 排期污染校验**：实现 `assertZeroFsrsPollution(before, after)`，严格断言评级前后 `due`, `stability`, `difficulty`, `lapses`, `reps` 字段 100% 恒定；
- **范围三选一纯逻辑** (`filterCramCards`)：
  - `all`：全部卡片全量过筛；
  - `weekDue`：通过 `isCardDueThisWeek` 筛选已逾期及未来 7 天内到期卡片；
  - `leech`：严格筛选遗忘次数 `lapses >= 5` 的顽固水蛭卡；
- **随机乱序**：可选 `randomOrder` 乱序刷题，非乱序时按遗忘次数降序排列；
- **内存计数与小结计算**：`calculateCramSummary` 纯内存统计，生成标准小结文案：`「突击完成！共过题 N 张 · 耗时 X 分钟 · 算法排期未受干扰」`。

### 2.2 复习界面与 UI 契约 (`src/ui/review/*`)
- **入口**：`ReviewToolbar.svelte` 新增「⚡ 考前突击快刷」常驻按钮及更多菜单入口；
- **弹窗**：`ReviewCramModal.svelte` 提供范围三选一、随机乱序勾选与算法保护说明，支持开始突击或退出返回正常复习；
- **会话徽标**：`ReviewProgressHeader.svelte` 渲染顶部金色徽标 `⚡ 突击快刷模式（排期保护中）`；
- **结算卡**：`ReviewDonePanel.svelte` 呈现突击完成金色小结胶囊，收起常规收工原因调查，提供「再刷一组」与「退出快刷」直达操作；
- **活动流保护**：突击会话不触发高频 `lvActivity` 记录，仅在结算时记录单条 `lvActivity.record({ source: "闪卡", category: "card", title: "突击快刷 N 张" })`。

### 2.3 小驴拾遗消费规则 (`rule-glean-to-cards`)
- 在 `src/index.ts` 注册 `lvAutomation` 规则：
  - `id: "rule-glean-to-cards"`
  - `triggerSource: "siyuan-glean"`
  - `triggerType: "create-card-request"`
  - `actionName: "create-card"`
- 严格按照联动契约解构载荷字段：`front`, `back`, `tags`, `sourceBlockId`, `sourceTitle`；
- 格式化问答/挖空 Markdown，通过 `executeQuickCardCreation` 走正常新建管道入库为正式新卡；
- 在 `onunload` 中通过返回的清理函数安全注销。

## 3. 门禁验证与硬断言
- **单元测试**：
  - `tests/cram-mode-isolation.spec.ts`：覆盖评级前后调度字段 100% 恒定、revlog 净增 0、范围筛选与乱序、结算计数与文案契约；
  - `tests/rule-glean-to-cards.spec.ts`：覆盖联动规则注册、契约载荷消费、规则禁用与注销清理；
  - `tests/review-cram-modal.spec.ts` / `tests/review-done-panel.spec.ts` / `tests/review-toolbar.spec.ts`：覆盖界面交互与组件响应；
- **全量测试**：270 个测试套件，2201 个用例 100% 通过；
- **类型检查**：`pnpm run check` 0 errors / 0 warnings；
- **发布包构建**：`pnpm run build` + `smoke:dist` 全绿。
