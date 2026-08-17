# @deepseek-ai/dsh-client-ui-baizor-login

English | [中文](README.zh.md)

Baizor AI login button, browser half: a `sidebar.footer.action` badge rendered above Settings in the sidebar footer. Clicking it starts the host `baizorAuth` device flow, opens the baizor.com sign-in page in a new tab, and settles a waiting dialog with the poll outcome; the host owns every settings and credential write.

## Model Experience

None, as this browser-side button only starts and settles the host login; it registers no prompt content, tool, or session event.

#### KV Cache effect

None: nothing model-visible originates in this package.

## Known Limitations and Deferred Work

- **The dialog only reports the host outcome** — progress is a countdown plus copy-link, with no inline sign-in form; the user completes authorization in the opened tab.
- **The badge is a surface switch** — a deployment without the host `baizor-auth` row still renders the button, whose first click reports the missing or read-only settings seam.
- **Pop-up blockers can swallow the tab** — the flow relies on `window.open`; the dialog keeps a copy-link as the recovery path when the browser blocks it.
- **A closed dialog does not cancel the login** — the host keeps polling; reopening reports the same settled result.
