# Privacy / 隐私说明

小驴闪卡默认将卡片、复习记录和插件设置保存在当前思源工作区。插件不会主动上传这些数据，也不包含遥测或广告。

## AI 功能

只有在用户主动启用并配置 AI 功能时，插件才会向用户选择的思源内置 AI 或 OpenAI-compatible endpoint 发送生成所需的文本。请求地址、发送字段和保留策略由用户配置的服务决定；请不要向不可信端点发送敏感内容。

API key 保存在思源工作区的插件设置中。导出工作区、启用同步或使用第三方 AI 服务时，用户应同时遵守对应服务的隐私政策。

## 数据导出与删除

删除插件设置或工作区中的插件数据后，插件本地不会保留额外副本。已发送给第三方 AI 服务的数据、系统备份或思源同步副本需要在对应服务中单独删除。

## English

Lv Cards stores cards, review records, and plugin settings in the active SiYuan workspace by default. It does not include telemetry or advertising and does not upload data unless a user enables a configured AI endpoint or SiYuan sync.

When AI is enabled, only the text required for generation is sent to the endpoint selected by the user. The endpoint's privacy policy and retention rules apply. API keys are stored in the plugin settings in the workspace.

## 外部制卡与摘录交接（2026-11-09，未发布）
external-card-intake-v1.json 保存请求/内容指纹、目标笔记本与路径、确切文档/卡块/牌组ID和阶段，不保存正文、来源标题或密钥。摘录正文与来源属性保存在思源“渐进摘录”文档，材料筛选状态复用 inbox.json；它们不进入 FSRS。原子卡经公开 createCard 显式写入并入组。结果未知时只核对原目标，不自动重放创建；删除侧车会失去跨重启的请求去重凭据，应随工作区备份。

二轮整改：交接日志与材料收件箱使用内核文件API独立读回。只有明确文件不存在响应才视为空；权限、损坏与传输异常不回退插件缓存。写入确认检查HTTP与code=0，并通过no-store getFile核对同一工作区的内容；这不代表跨客户端分布式事务或存储介质断电持久性保证。
