# @deepseek-ai/dsh-studio-client

English | [中文](README.zh.md)

Baizor Studio client, host half: typed access to the new-api Studio Client API (`/api/studio/client`), exposed to the browser as the `studioClient` Typert Remote namespace. The service resolves the Baizor API key from the credential store (`BAIZORAI_API_KEY`, written by the Baizor login flow) once per call, calls the endpoint with an injected fetch seam, and answers the browser a `{ ok, value } | { ok: false, code, message }` union — nothing throws across the wire, and the key never crosses it.

Current surface: `capabilities()` (workflow schema id, stage-action allowlist, lingshu skill stack, default models, verbatim Hermes health projection), `projects(page, pageSize)` (one page of the caller's Studio projects), `snapshot(projectRef)` (project + stages + render jobs in one payload), `createAction(projectRef, action)` (workflow planning action; the server injects the Hermes execution details), `tasks(projectRef)` / `task(projectRef, taskId)` (unified task polling over workflow tasks and render jobs), and `render(projectRef, request)` (per-shot quote → confirm → task flow). Project creation lands in a later round of the same package.

## Model Experience

None directly: the client reads server facts and project metadata only. The capabilities payload *names* the server's default chat/image/video models so a UI can present them, but this package assembles no model request itself.

#### KV Cache effect

None: the client emits no session event or prompt content and keeps no cache — every Remote call re-resolves the credential and re-fetches from the server.

## Failure taxonomy

Every refusal carries one normalized `code` the browser branches on:

- `NOT_LOGGED_IN` — no stored Baizor key; the UI re-opens the login dialog.
- `UNAUTHORIZED` — the server refused the key (401/403).
- `QUOTA_EXCEEDED` — the account is out of quota or throttled (402/429).
- `NOT_FOUND` — the named object does not exist for this account (404).
- `SERVER_ERROR` — envelope failure or 5xx.
- `SCHEMA_ERROR` — the body violated the shape this client parses.
- `TRANSPORT_ERROR` — no response at all (offline, DNS, reset).

## Known Limitations and Deferred Work

- **Read-only for now** — project creation, snapshot reads, workflow actions, task polling, and render are server-capable but not yet exposed here; they arrive with the workshop entry point.
- **No caching or polling** — each call hits the server; capability polling after login and task polling while tasks are active are owned by the compositions that consume this Remote, not by the service.
- **Hermes health is opaque** — the `hermes` projection is passed through verbatim and its shape is owned by Hermes; consumers must tolerate added fields.
