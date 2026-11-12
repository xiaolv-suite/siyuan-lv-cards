# [TASK-20261103-launchpad-topbar-integration] 小驴闪卡 · 小驴罗盘顶栏收敛与二级行动极速直达接入工单

- **任务状态**: `completed`
- **完成时间**: 2026-11-03
- **目标插件**: `小驴闪卡 (siyuan-lv-cards)`
- **核心套件源**: `src/libs/lv-notice-kit.ts` (Protocol v1.4.0 Launchpad Standard)
- **标准协议**: Epoch 7 Phase 5 · 顶栏收敛与极速直达

---

## 一、 背景与改造目标

为了解决小驴系列 9 大插件在思源顶栏图标过度拥挤（一排 9 个小图标挤占顶栏）、找插件困难的痛点，全生态推行「小驴罗盘 · 家族极速弹射坞」：
1. **自动出场**：装有 >= 2 个小驴插件时，顶栏自动收拢并升起【🐴 小驴罗盘】主入口，顶栏空间节省 80%；只有 1 个插件时自动退化为普通独立图标；
2. **三态呈现权限**：用户可在罗盘设置中自主决定本插件【📌 置顶在外 / 📥 仅在坞内 / 👁️ 彻底隐藏】；
3. **图标为绝对第一主角**：采用思源原生 1.85px 纯线条矢量 SVG 图标，消灭遮挡；
4. **二级快捷行动常驻**：提供 4~5 项真实业务深度操作，默认展示前 3 项。

---

## 二、 本插件标准接入代码

```typescript
import { lvLaunchpad } from "./libs/lv-notice-kit";

// 在 onload 中注册到小驴罗盘：
this.launchpadCleaner = lvLaunchpad.register({
    id: "siyuan-lv-cards",
    name: "闪卡",
    fullName: "小驴闪卡",
    svgIcon: "icon-lv-cards",
    color: "#f43f5e",
    desc: "间隔复习 · 记忆曲线",
    digit: 6,
    badge: this.getDueCount() > 0 ? `${this.getDueCount()} 待复习` : undefined,
    badgeType: "error",
    actions: ["开始今日复习会话", "从当前文档选区一键抽取制卡", "重新计算卡片遗忘曲线排期", "管理牌组与核心卡包"],
    onClick: () => this.openReviewTab(),
    onAction: (action) => this.handleQuickAction(action),
});
// 在 onunload 中：
this.launchpadCleaner?.();
```

---

## 三、 质量门禁与验收标准

1. **类型检查**：运行 `pnpm run check` 或 `tsc --noEmit`，确保 0 报错；
2. **测试门禁**：运行 `pnpm test` 确保全量测试通过；
3. **任务状态回写**：完成后将首行 `- **任务状态**: `pending`` 改为 `completed`；
4. **严格本地提交**：Conventional Commit 规范（如 `feat(launchpad): integrate lvLaunchpad entry with secondary actions`），**严禁 git push**。
