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

## 二、 验证与质量门禁

1. **静态检查**：`pnpm run check`（`check:types` + `check:svelte` + `check:versions`）0 错误 0 警告。
2. **单元测试**：`pnpm test` 全量 265 个测试文件 / 2178 项单测 100% 全部通过。
3. **隔离 E2E 走查**：`pnpm run e2e:isolated` 54/54 项端到端全要素全绿通过。
4. **纪律遵循**：全程纯本地 commit，绝对零 git push、无远程 tag 或 release。
