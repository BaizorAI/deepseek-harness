# Agent Note: Studio workshop actions, tasks, and render

Status: implemented

English | [中文](2026-08-19-studio-workshop-actions.zh.md)

## Problem

The Studio workshop placeholder (see `2026-08-19-studio-workshop-client.md`) could only read: capabilities, projects, snapshot. Steps 26–28 of `/lucky/baizorai/plans/20260818.md` ask the desktop client to create workflow planning actions, poll the unified task list, and submit renders through the quote → confirm flow — still without leaking Web-internal Hermes task fields into the desktop protocol.

## Decision

The host `studio-client` package grows four Remote methods on the same `studioClient` namespace:

- `createAction(projectRef, action)` — posts the workflow contract (`studio.workflow.v1`); the client owns `schema_version`, the caller names only stage, stage-action, and optional input/options. The server injects the Hermes execution details.
- `tasks(projectRef)` / `task(projectRef, taskId)` — the unified task view (workflow + image/video render jobs on one status vocabulary: `queued | running | succeeded | failed | canceled`). Unknown statuses are refused as `SCHEMA_ERROR` so a server vocabulary change surfaces loudly.
- `render(projectRef, request)` — batch render with per-shot outcomes; unconfirmed submissions answer quotes (`confirmation_required`), confirmed submissions answer the created jobs' unified task views.

The fetch seam gains `method`/`body` so POSTs share the same envelope handling and failure taxonomy as GETs; nothing new throws across the wire.

The browser panel's project detail view gains three sections: the unified task list (polled every 3 s only while a task is queued/running and the view is open), a workflow-action form (stage select from the snapshot, stage-action select from capabilities, strict-JSON toggle), and a render form (comma-separated shot ids, image/video, quote → confirm). Action/render submissions bump a `tasksVersion` counter that re-enters the polling effect, so a freshly created task is picked up immediately.

`packages/extensions/studio-client/scripts/smoke.ts` is the end-to-end smoke: against a live deployment it reads capabilities, picks a project, creates one workflow action, asserts the task appears in the unified list, and polls it to settlement. It drove the 2026-08-19 production verification (server 1.5.98, task `hermes_51905342e8a6…` succeeded in ~70 s).

## Alternatives considered

**Free-text action input JSON** — deferred. The placeholder form submits stage + stage-action + strict-JSON only; the action `input` bag stays available in the SDK for a future surface.

**Server-push task updates** — rejected for now. The 3 s panel-scoped poll matches the existing Web workshop pattern and needs no new channel.

## Consequences

The desktop client now covers the full plan surface of the Studio Client API except project creation and asset download. The task status vocabulary is pinned client-side; a new server status fails parsing instead of silently misrendering. Polling is bounded to the open detail view, so background sessions generate no traffic.

## Testing

`studio-client/tests/client.spec.ts` pins the new URL builders, request serializers (`workflowActionBody`, `renderRequestBody`), parsers (action result, task, task list, quote, render item/batch), and `studioPost` envelope handling. `tests/index.spec.ts` pins the four new Remote methods' credential gating, wire bodies, and refusal folding. `ui-studio-workshop/tests/panel.client.spec.tsx` pins task listing, action creation (payload + task reload), the render quote → confirm flow, local shot-id validation, and active-task polling under fake timers. `ui-baizor-login/tests/badge.client.spec.tsx` grew the widened namespace stub.
