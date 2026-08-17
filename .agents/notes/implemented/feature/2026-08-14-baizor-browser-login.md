# Agent Note: Baizor AI browser login button above Settings

Status: implemented

English | [中文](2026-08-14-baizor-browser-login.zh.md)

## Problem

Users need a first-run path to get a Baizor AI API key and make it their agent default model without leaving the web UI or editing `.dsh` files by hand. The earlier CLI-workflow references suggest a startup dialog, but a dialog that interrupts every launch adds friction for existing users who are already configured, and a settings-panel section hides the one action behind two clicks.

## Decision

The host `@deepseek-ai/dsh-baizor-auth` package owns one device-flow login at a time over the `baizorAuth` Typert Remote: `start` mints a token and returns the baizor.com sign-in URL, the service polls `/api/cli/poll` until it answers done, and the receipt is applied to the credential store (`BAIZORAI_API_KEY`), the `llm-pi-ai` settings section (a `baizorai` provider profile named from the server's model catalog), and the shared Agent default model (`agentDefaultModel.saveSelection` with the server-returned CLI default). The API key never enters the settings document and never returns to the browser.

The browser half `@deepseek-ai/dsh-client-ui-baizor-login` registers a `sidebar.footer.action` badge rendered above Settings in the sidebar footer. Clicking starts the flow, opens the sign-in URL in a new tab, and shows a waiting dialog with a countdown and a copy-link; it settles to a success or failure message with retry. Both rows are registered in the `dsh-web-app` bundle patch, and the `api-remotes` client assembly mounts the generated remote.

## Alternatives considered

**Startup login dialog** — rejected. It interrupts every launch and every already-configured user; the button keeps the flow one click away without owning boot.

**A Settings panel section** — rejected. The action is a single one-shot flow, not a configuration surface, and burying it inside Settings hides it from the first-run moment.

**Write the key into `settings.yaml` directly** — rejected. The harness convention is that API keys live in the credential store referenced by `apiKeyEnv`; settings patches record the provider profile and the credential reference instead.

## Consequences

The badge renders above Settings exactly where the sidebar footer slots it, parallel to Settings and not inside it. The login's writes are all host-owned, so the browser half holds only dialog state and can never read the key. The cost is a dedicated host Remote plus a bundle row for one surface action, and the flow's recovery path is the dialog's copy-link when a pop-up blocker swallows the tab. A second start while a login polls is refused; several tabs joining one flow all receive the same settled outcome.

## Testing

Host behavior is pinned by `packages/extensions/baizor-auth/tests/login.spec.ts` (direction, poll parsing, patch application, timer bounds). The browser half is pinned by `packages/extensions/ui-baizor-login/tests/apply.client.spec.ts` (entry, injected run face, refusal, dictionary disposal) and `badge.client.spec.tsx` (jsdom snapshot of the badge, dialog phases through the slot assembly path).
