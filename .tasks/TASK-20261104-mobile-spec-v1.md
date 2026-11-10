# [TASK-20261104-mobile-spec-v1] 小驴闪卡 · 手机端完整开发 Mobile Spec v1 工单

- **任务状态**: `completed`
- **完成时间**: 2026-11-04
- **目标插件**: `小驴闪卡 (siyuan-lv-cards)`
- **核心套件源**: `src/libs/lv-notice-kit.ts` (Protocol v1.6.0 Mobile Launchpad Standard)
- **标准协议**: Mobile Spec v1 · 手机端全屏 Dialog 宿主 / 极速直办 / 拇指区与手势交互

---

## 一、 生态统一规范与落地情况

1. **入口统一**：
   - 在 `onload` 中挂载 `lvLaunchpad.ensureMobileEntry()`（顶栏与悬浮球入口），在 `onunload` 中干净清理 `this.mobileEntryCleaner?.()`。
   - 桌面端完全 no-op，无任何孤儿定时器。

2. **宿主形态**：
   - 手机端无页签模型，`openTabOf` 在移动端路由至全屏 Dialog 单例宿主 `openHubMobileDialog`（100vw/100dvh + safe-area 内边距，`.lv-dialog.lv-hub-mobile-dialog`）。
   - 抽取 `buildHubMountProps` 保证页签装配与全屏 Dialog 装配同源，杜绝两套 props 漂移。
   - `onunload` 时收拢关闭移动端全屏 Dialog 宿主，零孤儿 DOM。

3. **页面骨架与底部导航**：
   - 手机端底部导航收敛至 5 项（今日、卡库、集市、制卡、学习），设置项折叠为右上角常驻浮动齿轮入口（≥44px，touch-action: manipulation，active 微缩）。

4. **交互质感与触感反馈**：
   - 复习页左右滑动切卡判定（`resolveMobileCardSwitch`）：左滑换下一张（不评级），右滑撤销并以 `lvLaunchpad.haptic(12)` 触感确认。
   - 评级按钮固定底部拇指区（≥52px、安全区避让、不透明渐变底防透字）。
   - 快速制卡手机流：牌组 chips 水平滑选，正面/反面大输入框，大保存按钮（≥52px），制卡成功停留继续录入并伴随 `lvLaunchpad.haptic(10)` 与原位微动效。

5. **二级行动与穿透搜索**：
   - 罗盘 actions 重写为 4 项手机直办动作：【开始今日复习】、【快速制卡】、【水蛭卡预警】、【管理牌组与卡包】。
   - `handleQuickAction` 补全【水蛭卡预警】直达维护债务页逻辑。
   - 考试错题自动制卡规则（`rule-exam-to-cards`）手机端同源生效。

---

## 二、 手机端第二轮优化 · 真机教训审计与深化

1. **Esc-only 关闭面审计**：
   - 命令面板 (`LvPalette`) 补常驻 `✕` 关闭按钮与触控区（≥44px），解决手机端无 Esc 键且无镶板无法关闭的问题；
   - 修卡演练 (`repair-drill`) 头部补常驻 `✕` 关闭按钮，解决前三步中途无法退出的问题；
   - 快速制卡 (`quick-card`) 引导条补 `✕` 退出按钮，且在移动端即使 `embedded: true` 也保留取消按钮，杜绝录入卡死。

2. **焦点移除卡死审计**：
   - 快速制卡符号与图片插入目标字段改由 `document.activeElement` 实时重算，彻底拔除对 `focusout/blur` 时序的脆弱依赖；
   - 悬浮球抑制逻辑 (`recomputeBallSuppression`) 严格通过 `document.activeElement` 鸭子类型判定与 Dialog DOM 观察联动，不依赖 `focusout`。

3. **svgIcon 符号一致性**：
   - 注入 Sprite 时同时登记 `iconLvCards` 与 `icon-lv-cards` 别名；
   - `lvLaunchpad.register` 中的 `svgIcon` 严格与 `addIcons` 注入的 `#iconLvCards` 逐字对齐。

4. **复习会话进度保护（Android 返回手势拦截与落盘确认）**：
   - 进入复习会话时通过 `history.pushState({ lvCards: true }, "")` 压入占位态并监听 `popstate`；
   - 触发系统返回时弹出确认提示「复习进行中，退出将计入本次已复习卡片」；
   - 确认退出则先 `persistSession()` 落盘再回到闪卡中心；取消退出则重新压入历史守卫；正常完成全部卡片后 `disarmReviewHistory()` 回拨清理。

5. **复习与制卡深化**：
   - 会话小结卡：复习完成面板顶部外显结构化徽章「10 张 · 用时 4 分 32 秒 · 正确率 80%」，挂载触发双震触感反馈（25ms + 25ms），替代直接静默退出；
   - 制卡图片流：快速制卡接入 `<input type="file" accept="image/*">`，通过 HTML5 Canvas 动态有损压缩（≤500KB 预算），自动插入 Markdown 图片链接；
   - FSRS 负载预报：手机端折叠为单行徽记（今日 N · 明日 M · 7日负载），点击展开/收起 7 日柱状图，消除首屏大面积竖向空间侵占。

---

## 三、 验证与质量门禁

1. **静态检查**：`pnpm run check`（`check:types` + `check:svelte` + `check:versions`）0 错误 0 警告。
2. **单元测试**：`pnpm test` 全量 267 个测试文件 / 2182 项单测 100% 全部通过。
3. **隔离 E2E 走查**：`pnpm run e2e:isolated` 54/54 项端到端全要素全绿通过。
4. **纪律遵循**：全程纯本地 commit，绝对零 git push、无远程 tag 或 release。
