# 代理走查基线报告 · 2026-10-31 · v0.219.0

> 方案见 [docs/54 §5](../../docs/54-优化路线与开发方向-2026-10-31.md)。环境：`node scripts/e2e-isolated.mjs --keep` 起隔离内核（思源 3.8.9，与本机日常思源同版本），`node scripts/walkthrough-fixture.mjs` 灌入夹具（挖空 70、超级块问答 30、图片遮挡 2、坏卡 10，共 112 张），浏览器版界面，1440×900，中文。

## 结论

走查 15 分钟发现 3 个阻断级问题，此前十余轮检查表排查与 2338 项单测均未发现。它们都出在“组件之间 + 真实宿主时序”上：

| 编号 | 任务 | 问题 | 根因（已在源码确认） |
|---|---|---|---|
| W-01 | T1 首用 | 引导第 2 步“创建示例卡”失败，红框显示英文 `Flashcard entry blocked: … (empty-card)` ×5 | `src/api/due-shared.ts` 入组门禁在块刚写入时用 SQL 读 markdown；思源索引提交有延迟（实测写入后立即查询 0 行），重试总共只等约 300ms；兜底分支用 `getBlockAttrs` 取 `attrs.markdown`（该字段不存在）得到空串，判为 empty-card。实测 `/api/sqlite/flushTransaction` 后立即可查到 |
| W-02 | T3 制卡 | 手工制卡第一次就失败：`kernel error: document path is ambiguous; use a document ID or resolveDocPath`，错误提示常驻 | `src/api/siyuan.ts` 的 `ensureParentDocsExist` 对每一级父路径**无条件**调用 `createDocWithMd`，父文档已存在时思源会再建一个同名文档；工作区随即出现两个 `/小驴闪卡`，3.8.9 内核拒绝按路径建子文档。结果：每个笔记本里插件只能成功建一次文档，之后快速制卡、标记制卡、AI 制卡、学习报告、考试复盘全部失败，且每次失败再多留一个空的同名文档 |
| W-03 | T2 复习 | 图片遮挡卡在问题态完整露出图片，没有任何遮挡框，且直接显示评分栏 | `src/core/occlusion.ts` 的 `calculateOcclusionBox` 用 `querySelector("img, svg…, canvas")` 取第一个匹配元素，卡面顶部新增的来源面包屑图标（16×16 svg）排在图片前面，遮挡层被贴到这个小图标上（实测 overlay `width:16px;height:16px`） |

本机日常工作区已只读核查：没有重复的 `/小驴闪卡` 文档（此前只建过示例卡），W-02 尚未造成数据层面的残留。

## 体验观察（不阻断，进入阶段 B 排序）

- T1：引导第 1 步把唯一需要做的决定（选画像）夹在两大段说明之间；卡面类型说明的小图标与标题错位；“问答卡：当前版本按挖空标记保存答案”读不懂。
- T1→Hub：跳过引导后点顶栏图标，有 20 张到期却落在“制卡”页而不是今日或复习。
- T2：复习工具栏是一整行 12 个胶囊按钮，右侧还要横向滚动；卡面区大面积空白。挖空卡默认出现打字框（画像为“卡片笔记”）。
- T2：撤销后约 1 秒卡面题干空白再出现。
- 全局：内核原始英文错误直接显示给用户（W-01、W-02 都是），错误提示不随问题解决而消失。
- 环境备注（非插件问题）：内置浏览器的 UA 含 Electron，思源把根路径重定向到桌面端构建导致白屏，需直接打开 `/stage/build/desktop/`；新工作区需要在集市设置里信任第三方插件后插件才加载。

## 本次未执行

T4 修卡、T5 迁移未执行：W-01～W-03 已足以决定本轮优先级，修复后复走查时补跑。

## 截图

`t1-onboarding-step1.png`、`t1-sample-cards-blocked.png`、`t3-quickcard-ambiguous-path.png`、`t2-today.png`、`t2-review-occlusion-first.png`、`t2-occlusion-unmasked.png`、`t2-review-cloze.png`

## 修复后复走查（v0.220.0，同日）

在新建的隔离工作区（同一夹具）和保留了 3 个重复 `/小驴闪卡` 文档的旧工作区里各跑一遍：

| 编号 | 复走查结果 | 截图 |
|---|---|---|
| W-01 | 引导第 2 步一次创建成功，进入第 3 步“准备完成” | `after-t1-sample-cards-created.png` |
| W-02 | 旧工作区（已有 3 个同名父文档）连续手工制卡两次都提示“已制卡并加入卡组”；接口核对两张卡都在同一个 `/小驴闪卡/快速制卡` 文档里且已入组 | `after-t3-quickcard-twice-ok.png` |
| W-03 | 遮挡卡问题态显示“显示答案”，两个遮挡框贴在图片上的正确位置 | `after-t2-occlusion-masked.png` |

复走查新发现并已修复：

- **W-04**：示例卡卡面开头显示 `<!-- lv-cards-sample:cloze -->`（标记以 HTML 注释写在正文，思源 3.8 原样显示）。改为块属性 `custom-lv-sample`。截图 `w04-sample-comment-visible.png`；新写法已在隔离内核上验证属性写入且正文干净。
- **W-05**：遮挡框透明度 0.55，框下图案透出。改为未揭晓时完全不透明，`after-t2-occlusion-masked.png` 为修复后效果。

仍未执行：T4 修卡、T5 迁移、限时挑战的宿主内走查（挑战模式的修复只有单测覆盖）。

走查环境备注：插件分包地址按版本号缓存（`chunks/*.js?v=<版本>`），同一版本号内重新部署时浏览器会继续用旧分包；走查时需升版本号或强制刷新缓存。正式发版每次都升版本号，用户侧不受影响。
