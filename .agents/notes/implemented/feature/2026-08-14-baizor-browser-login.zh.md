# Agent Note: 设置上方的白泽 AI 浏览器登录按钮

Status: implemented

[English](2026-08-14-baizor-browser-login.md) | 中文

## Problem

用户需要一个首次运行路径来获取白泽 AI API 密钥并把它设为 Agent 默认模型，而不必离开 Web UI 或手工编辑 `.dsh` 文件。更早的 CLI 工作流参考曾提出启动对话框，但每次启动都打断的对话框给已配置好的现有用户增加摩擦，而设置面板里的区块则把这一操作藏到了两次点击之后。

## Decision

Host 侧 `@deepseek-ai/dsh-baizor-auth` 包通过 `baizorAuth` Typert Remote 同一时间只管理一个设备流登录：`start` 生成令牌并返回 baizor.com 登录 URL，服务轮询 `/api/cli/poll` 直到应答 done，然后把收据应用到凭据存储（`BAIZORAI_API_KEY`）、`llm-pi-ai` 设置节（按服务端模型目录命名 `baizorai` 提供商配置）以及共享的 Agent 默认模型（用服务端返回的 CLI 默认模型调用 `agentDefaultModel.saveSelection`）。API 密钥绝不进入设置文档，也绝不返回浏览器。

浏览器侧 `@deepseek-ai/dsh-client-ui-baizor-login` 注册一个 `sidebar.footer.action` 徽标，渲染在侧边栏底部、设置上方。点击后启动流程，在新标签页打开登录 URL，并显示带倒计时和复制链接的等待对话框；最终结算为成功或失败消息并可重试。两行都注册在 `dsh-web-app` bundle patch 中，`api-remotes` 客户端装配挂载生成的 remote。

## Alternatives considered

**启动登录对话框** — 已否决。它打断每次启动和每个已配置用户；按钮让流程保持一键之遥，而不占用启动。

**设置面板区块** — 已否决。该操作是一次性流程而非配置界面，藏进 Settings 会让首次运行时刻看不到它。

**把密钥直接写入 `settings.yaml`** — 已否决。Harness 约定是 API 密钥存放在由 `apiKeyEnv` 引用的凭据存储中；设置补丁只记录提供商配置和凭据引用。

## Consequences

徽标按侧边栏底部插槽的定义渲染在设置上方，与设置并列而非在其内部。登录的所有写入都由 Host 拥有，因此浏览器侧只保存对话框状态，永远读不到密钥。代价是为一个界面动作新增了一个专用 Host Remote 和一个 bundle 行，而且当弹窗拦截吞掉标签页时，流程的恢复路径是对话框里的复制链接。轮询进行中再次启动会被拒绝；多个标签页加入同一流程都会收到同一个结算结果。

## Testing

Host 行为由 `packages/extensions/baizor-auth/tests/login.spec.ts` 固定（方向、轮询解析、补丁应用、计时器边界）。浏览器侧由 `packages/extensions/ui-baizor-login/tests/apply.client.spec.ts`（入口、注入的 run 面、拒绝、字典清理）和 `badge.client.spec.tsx`（通过插槽装配路径的 jsdom 快照与对话框阶段）固定。
