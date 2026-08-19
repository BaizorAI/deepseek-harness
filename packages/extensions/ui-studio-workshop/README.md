# @deepseek-ai/dsh-client-ui-studio-workshop

English | [中文](README.zh.md)

Baizor Studio workshop placeholder, browser half: a `sidebar.footer.action` badge rendered above Settings in the sidebar footer. Clicking it opens a panel that calls the host `studioClient` Remote: the Baizor login state, the Studio server capabilities (workflow schema, stage actions, skill stack, default models, Hermes health), the caller's project list, and one project's stage/render-job snapshot. The project detail view adds the unified task list (auto-polled while any task is queued or running), a workflow-action form (stage + stage-action + strict-JSON), and a render form (shot ids, image/video, quote → confirm).

## Model Experience

None, as this browser-side panel only reads the host Studio client; it registers no prompt content, tool, or session event.

#### KV Cache effect

None: nothing model-visible originates in this package.

## Known Limitations and Deferred Work

- **The panel is a minimal workbench** — project creation, asset download, and per-stage editors stay server-side or in the Web workshop until the Studio client SDK grows those endpoints.
- **The snapshot projects stages and render jobs only** — characters, shots, artifact versions, and prompt versions stay server-side until a client surface needs them.
- **The badge is a surface switch** — a deployment without the host `studio-client` row still renders the button, whose first click reports the missing Remote.
- **Task polling is panel-scoped** — the unified task list polls every 3 s only while the detail view is open and a task is queued or running; stage and render-job status refreshes when the panel reopens or the project is re-selected.
