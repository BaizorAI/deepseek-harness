# @deepseek-ai/dsh-client-ui-studio-workshop

[English](README.md) | 中文

白泽视频工坊占位面板，浏览器侧：渲染在侧边栏底部、设置上方的 `sidebar.footer.action` 徽标。点击后打开面板，调用 Host 的 `studioClient` Remote：白泽登录状态、Studio 服务能力（工作流协议、stage action、技能栈、默认模型、Hermes 健康）、当前用户的项目列表，以及单个项目的阶段/渲染任务快照。项目详情页还提供统一任务列表（有排队/运行中任务时每 3 秒自动轮询）、工作流动作表单（阶段 + stage action + 严格 JSON）和渲染表单（镜头 ID、图片/视频、询价 → 确认）。

## Model Experience

None, as this browser-side panel only reads the host Studio client; it registers no prompt content, tool, or session event.

#### KV Cache effect

None: nothing model-visible originates in this package.

## Known Limitations and Deferred Work

- **面板是最小工作台** — 建项目、素材下载和各阶段编辑器留在服务端或 Web 工坊，等 Studio 客户端 SDK 补上对应端点。
- **快照只投影阶段和渲染任务** — 角色、分镜、artifact 版本和提示词版本留在服务端，等有客户端界面需要时再投影。
- **徽标是纯界面开关** — 未挂载 Host `studio-client` 行的部署仍会渲染按钮，首次点击会报告缺失的 Remote。
- **任务轮询仅限面板范围** — 统一任务列表只在详情页打开且有任务排队/运行中时每 3 秒轮询；阶段和渲染任务状态在重新打开面板或重新选择项目时刷新。
