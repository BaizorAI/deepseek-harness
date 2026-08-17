# @deepseek-ai/dsh-client-ui-baizor-login

[English](README.md) | 中文

白泽 AI 登录按钮，浏览器侧：渲染在侧边栏底部、设置上方的 `sidebar.footer.action` 徽标。点击后启动 Host 的 `baizorAuth` 设备流，在新标签页打开 baizor.com 登录页，并用轮询结果结算等待对话框；所有设置与凭据写入都由 Host 负责。

## Model Experience

None, as this browser-side button only starts and settles the host login; it registers no prompt content, tool, or session event.

#### KV Cache effect

None: nothing model-visible originates in this package.

## Known Limitations and Deferred Work

- **对话框只汇报 Host 结果** — 进度是倒计时加复制链接，没有内嵌登录表单；用户在打开的标签页里完成授权。
- **徽标是纯界面开关** — 未挂载 Host `baizor-auth` 行的部署仍会渲染按钮，首次点击会报告缺失或只读的设置接缝。
- **弹窗拦截可能吞掉标签页** — 流程依赖 `window.open`；被拦截时对话框里的复制链接是恢复路径。
- **关闭对话框不会取消登录** — Host 会继续轮询；重新打开看到的是同一个已结算结果。
