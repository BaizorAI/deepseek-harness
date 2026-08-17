# Agent Note: Remove first-run onboarding dialogs

Status: implemented

[English](2026-08-17-remove-first-run-onboarding-dialogs.md) | 中文

## Problem

每个全新的 GUI 配置在首次启动时都会出现两个阻塞式首次运行对话框：版本化的内测声明，以及有条件的 DeepSeek 官方 API 密钥提示。对用户而言，第一件事本应是和模型对话，两者都是摩擦。推荐的首次运行密钥路径也已经改变：设置旁的白泽 AI 登录按钮（见 [Baizor browser login](../feature/2026-08-14-baizor-browser-login.md) 笔记）会打开提供方网站、保存密钥并设置 agent 默认模型，因此 DeepSeek 优先的提示已不再符合产品自身的流程。内测声明不适合出现在发布版本，理由与更早移除 beta 声明时相同，且产品中没有任何其他部分需要版本化的确认。

## Decision

**移除两个出厂自带的 `settings.onboarding` 步骤及其专属代码。** `ui-settings-models` 不再注册 `welcome-notice` 与 `deepseek-official`。随之一并删除：欢迎存储与文案持有者、共享弹窗、`ProviderEditor` 的仅凭据模式及其文案覆写、引导就绪投影，以及 `OnboardingSurface` 原语——它的唯一消费者就是这些步骤。`providerUsable`/`needsSetup` 保留，因为 Models 页的首次运行设置卡——一张内嵌卡片而非阻塞式对话框——仍需要它们。

**保留零成本且仍有用的缝隙。** `settings.onboarding` slot 声明与外壳协调器保留，未来由功能持有的步骤无需改外壳即可注册。宿主端保留用户设置 seam 中的 `ui-onboarding` 注册，使更早声明留下的存量文档仍然有效。这两项保留/移除的选择与 [first-run beta notice removal](../simplification/2026-08-13-remove-first-run-beta-notice.md) 的决策一致。

**首次运行的密钥入口改为白泽 AI 登录按钮。** 不再保留任何首次运行对话框；登录按钮持有提供方凭据路径与 agent 默认模型。

## Alternatives considered

**只删内测声明，保留 DeepSeek 密钥提示。** 否决：产品方要求两个对话框都移除，且密钥路径已有专门入口。

**首次启动时自动打开白泽登录流程，而非使用按钮。** 否决：产品方选择设置旁显式按钮，是否配置由用户决定。

**删除 `settings.onboarding` slot 或注销 `ui-onboarding`。** 否决：slot 是未来功能自有步骤的扩展缝隙；注销 namespace 会使更早声明留下的存量文档失效——与 beta 声明移除时记录的同一理由。

**把已删除组件作为休眠代码保留。** 否决：死组件会重新进入覆盖率豁免并与文档脱节，且没有计划中的流程需要它们。

## Consequences

全新配置直接进入应用，不再出现阻塞式对话框。引导相关 web e2e 通道与其快照已删除，scaffold 中镜像的欢迎常量已移除，重新生成的客户端 slot 目录在 `settings.onboarding` 中不记录任何 occupant。Models 页设置卡仍是唯一的首次运行姿态。此决策取代 [shared-modal product onboarding](../feature/2026-08-13-shared-modal-product-onboarding.md)、[versioned GUI welcome onboarding](../feature/2026-07-30-versioned-gui-welcome-onboarding.md)、[official DeepSeek first-run credential setup](../feature/2026-07-30-deepseek-onboarding-credential-setup.md) 与 [onboarding takeover chrome](../bug-fix/2026-08-06-onboarding-step-owned-takeover-chrome.md) 笔记；[onboarding-reads-every-provider](../bug-fix/2026-08-12-onboarding-reads-every-provider.md) 笔记保留 Models 页设置卡那一半。