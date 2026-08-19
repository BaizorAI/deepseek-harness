# @deepseek-ai/dsh-studio-client

[English](README.md) | 中文

Baizor Studio 客户端的 host 半侧：对 new-api Studio Client API（`/api/studio/client`）的类型化访问，通过 `studioClient` Typert Remote 命名空间暴露给浏览器。服务在每次调用时从凭据存储解析 Baizor API key（`BAIZORAI_API_KEY`，由 Baizor 登录流程写入），通过注入式 fetch seam 调用端点，并给浏览器回答 `{ ok, value } | { ok: false, code, message }` 联合类型——没有任何异常跨线抛出，key 也永不跨线传给浏览器。

当前面：`capabilities()`（workflow 协议 schema id、stage-action 白名单、lingshu skill 栈、默认模型、逐字透传的 Hermes 健康投影）、`projects(page, pageSize)`（当前用户的 Studio 项目分页列表）、`snapshot(projectRef)`（项目+阶段+渲染任务单负载聚合）、`createAction(projectRef, action)`（workflow 规划动作，Hermes 执行细节由服务端注入）、`tasks(projectRef)` / `task(projectRef, taskId)`（workflow 任务与渲染任务的统一轮询视图）、`render(projectRef, request)`（逐镜头询价 → 确认 → 任务流程）。建项目将在本包的后续轮次落地。

## 模型体验

无直接关系：客户端只读取服务端事实与项目元数据。capabilities 负载*列出*了服务端的默认对话/图像/视频模型供 UI 展示，但本包自身不组装任何模型请求。

#### KV Cache 影响

无：客户端不发出任何会话事件或 prompt 内容，也不持有缓存——每次 Remote 调用都重新解析凭据并向服务端重新拉取。

## 失败归一化

每次拒绝都携带一个归一化 `code` 供浏览器分支：

- `NOT_LOGGED_IN` —— 没有已存的 Baizor key；UI 应重新打开登录对话框。
- `UNAUTHORIZED` —— 服务端拒绝了 key（401/403）。
- `QUOTA_EXCEEDED` —— 账号额度耗尽或被限流（402/429）。
- `NOT_FOUND` —— 所指对象在当前账号下不存在（404）。
- `SERVER_ERROR` —— 信封失败或 5xx。
- `SCHEMA_ERROR` —— 响应体不符合本客户端解析的形状。
- `TRANSPORT_ERROR` —— 完全没有收到响应（断网、DNS、连接重置）。

## 已知限制与暂缓项

- **目前只读** —— 建项目、读 snapshot、workflow action、任务轮询和 render 服务端已具备能力，但此处尚未暴露；它们随工坊入口一同到来。
- **无缓存、无轮询** —— 每次调用都打到服务端；登录后的 capabilities 轮询与任务进行中的轮询由消费此 Remote 的组合层负责，不在服务内。
- **Hermes 健康是透传黑盒** —— `hermes` 投影逐字透传，其形状由 Hermes 拥有；消费方必须容忍新增字段。
