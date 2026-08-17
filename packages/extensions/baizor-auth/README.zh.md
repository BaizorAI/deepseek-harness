# @deepseek-ai/dsh-baizor-auth

[English](README.md) | 中文

白泽 AI 浏览器登录，Host 侧：同一时间只运行一个设备流登录。`baizorAuth` Typert Remote 生成令牌，把 `baizor.com` 登录页 URL 交给浏览器，轮询 CLI 端点直到收到应答，然后把签发的密钥写入凭据存储、把 `baizorai` 提供商配置写入 `llm-pi-ai` 设置节、并把服务端返回的默认模型写入共享的 Agent 默认模型。

## Model Experience

Indirectly, through the provider settings and default model the completed login writes; request assembly and provider adapters own every model-visible request.

#### KV Cache effect

None: the login writes settings and credentials only, and emits no session event or prompt content.

## Known Limitations and Deferred Work

- **API 密钥按设计不可见** — 密钥只写入凭据存储，绝不返回浏览器，因此对话框能确认成功但无法展示密钥。需要在其他客户端使用密钥的用户可从凭据源（`.dsh/.env`）读取。
- **同一时间只允许一个登录** — 轮询进行中再次启动会被拒绝并提示；多个标签页并发登录时共享同一个正在运行的流程的结算结果。
- **轮询期间关闭标签页不会取消流程** — Host 会继续轮询直到成功或超时，因此重新打开对话框看到的是同一个已结算结果，而不会重新开始。
- **不提供提供商移除** — 已存在的 `baizorai` 节会保留本补丁未命名的字段，但每次登录成功后模型列表会被服务端目录整体替换。
