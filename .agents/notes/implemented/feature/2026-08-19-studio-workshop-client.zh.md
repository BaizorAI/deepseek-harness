# Agent Note: 白泽视频工坊客户端占位面板

Status: implemented

[English](2026-08-19-studio-workshop-client.md) | 中文

## 问题

桌面/Web 客户端已经完成白泽设备流登录并持有 API Key，但没有任何进入视频工坊的路径：用户看不到服务端 Studio 能力是否存在、规划运行时报告什么、账号下有哪些项目。计划 `/lucky/baizorai/plans/20260818.md`（小步提交 22–25）要求：基于版本化 Studio Client API 的客户端 SDK、登录后的可选能力探测、占位工作台界面——同时不能把 Web 内部的 Hermes 任务字段泄漏成桌面协议。

## 决策

Host 侧 `@deepseek-ai/dsh-studio-client` 包持有对 `/api/studio/client` 的类型化访问，通过 `studioClient` Typert Remote 暴露：`capabilities`、`projects`、`snapshot`。白泽密钥每次调用时从凭据存储（`BAIZORAI_API_KEY`）解析，从不过线；所有失败折叠成一个带归一化 code 的拒绝联合（`NOT_LOGGED_IN`、`UNAUTHORIZED`、`QUOTA_EXCEEDED`、`NOT_FOUND`、`SERVER_ERROR`、`SCHEMA_ERROR`、`TRANSPORT_ERROR`）。快照只投影占位面板读取的内容——项目、阶段、渲染任务；角色、分镜、artifact 版本和提示词版本留在服务端，等有界面需要时再投影。

浏览器侧 `@deepseek-ai/dsh-client-ui-studio-workshop` 在白泽登录徽标旁注册一个 `sidebar.footer.action` 徽标。面板是只读的：登录状态、服务能力（含 Hermes 降级警示）、第一页项目列表、单个项目的阶段与渲染任务摘要。注入 face 把 Remote 信封和 Studio 拒绝联合压平成每次调用一个结果，组件只持有展示状态。

白泽登录成功后，`ui-baizor-login` 的 settle 路径会发出一次建议性的 `studioClient.capabilities()` 探测。探测从不改变登录结果；拒绝和传输失败保持静默。

## 备选方案

**照搬 Web 工坊 UI** — 否决。Web 前端拼装大量内部 `/api/studio` 和 `/pg/hermes` 调用；移植会把 Web 内部实现泄漏成桌面协议，计划明确禁止。

**放进设置面板** — 否决，与登录决策同理：工坊是产品入口，不是配置界面。

**投影完整快照** — 暂不。占位面板只渲染阶段和渲染任务；解析器保持小，线上协议随真实消费者增长。

## 影响

桌面客户端只凭用户 API Key 就能发现并读取 Studio 能力；永远看不到 Hermes sidecar 的密钥或地址。新的 stage action 或技能栈事实经由 capabilities 浮现，无需客户端改动。代价是多一个 Host Remote 命名空间和一个底部徽标；action/render 调用和轮询仍是延后工作。

## 测试

`packages/extensions/studio-client/tests/client.spec.ts` 锁定 URL、解析器和失败分类（含 snapshot 解析）；`tests/index.spec.ts` 锁定凭据门控和 host 服务的 fetch 接线。`packages/extensions/ui-baizor-login/tests/apply.client.spec.ts` 锁定登录后能力探测（成功时触发一次、失败时静默、登录失败时不触发）。`packages/extensions/ui-studio-workshop/tests/apply.client.spec.ts` 锁定插槽条目、face 压平和词典；`panel.client.spec.tsx` 锁定面板的 jsdom 行为：服务能力和项目列表渲染、未登录提示、降级警示、快照导航和归一化错误文案。
