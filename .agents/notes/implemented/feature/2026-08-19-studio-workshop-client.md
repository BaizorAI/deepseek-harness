# Agent Note: Baizor Studio workshop client placeholder

Status: implemented

English | [中文](2026-08-19-studio-workshop-client.zh.md)

## Problem

The desktop/web client completes the Baizor device-flow login and holds an API key, but it has no path into the video workshop: the user cannot see whether the server-side Studio capability exists, what the planning runtime reports, or which projects the account owns. The plan `/lucky/baizorai/plans/20260818.md` (steps 22–25) asks for a client SDK over the versioned Studio Client API, an optional capability probe after login, and a placeholder workbench surface — without leaking Web-internal Hermes task fields into the desktop protocol.

## Decision

The host `@deepseek-ai/dsh-studio-client` package owns typed access to `/api/studio/client` over the `studioClient` Typert Remote: `capabilities`, `projects`, and `snapshot`. The Baizor key is resolved from the credential store (`BAIZORAI_API_KEY`) per call and never crosses the wire; every failure folds into one refusal union with a normalized code (`NOT_LOGGED_IN`, `UNAUTHORIZED`, `QUOTA_EXCEEDED`, `NOT_FOUND`, `SERVER_ERROR`, `SCHEMA_ERROR`, `TRANSPORT_ERROR`). The snapshot projects only what the placeholder reads — project, stages, render jobs; characters, shots, artifact versions, and prompt versions stay server-side until a surface needs them.

The browser half `@deepseek-ai/dsh-client-ui-studio-workshop` registers a `sidebar.footer.action` badge next to the Baizor login badge. Its panel is read-only: login state, capabilities (including the Hermes degraded warning), the first project page, and one project's stages plus render-job summaries. The injected face flattens the Remote envelope and the Studio refusal union into a single outcome per call, so the component holds only display state.

A successful Baizor login now fires one advisory `studioClient.capabilities()` probe from `ui-baizor-login`'s settle path. The probe never changes the login outcome; refusals and transport failures stay silent.

## Alternatives considered

**Copy the Web workshop UI** — rejected. The Web frontend assembles many internal `/api/studio` and `/pg/hermes` calls; porting it would leak Web internals into the desktop protocol, which the plan forbids.

**A Settings panel section** — rejected, mirroring the login decision: the workshop is a product entry, not a configuration surface.

**Project the full snapshot** — rejected for now. The placeholder renders stages and render jobs only; the parser stays small and the wire contract grows with real consumers.

## Consequences

The desktop client can discover and read the Studio capability with only the user API key; it never sees the Hermes sidecar key or address. New stage-action or skill-stack facts surface in capabilities without client changes. The cost is one more host Remote namespace and one more footer badge; action/render calls and polling remain deferred work.

## Testing

`packages/extensions/studio-client/tests/client.spec.ts` pins URLs, parsers, and the failure taxonomy including snapshot parsing; `tests/index.spec.ts` pins credential gating and fetch wiring through the host service. `packages/extensions/ui-baizor-login/tests/apply.client.spec.ts` pins the post-login capability probe (fires once on success, silent on failure, skipped on login failure). `packages/extensions/ui-studio-workshop/tests/apply.client.spec.ts` pins the slot entry, face flattening, and dictionaries; `panel.client.spec.tsx` pins the panel's jsdom behavior: capabilities and project list rendering, the not-logged-in hint, the degraded warning, snapshot navigation, and normalized error copy.
