/**
 * Wire payload vocabulary for the Baizor Studio client remote namespace, kept
 * in a client-safe module: types only, no runtime values. Field names are
 * camelCase projections of the `/api/studio/client` wire JSON; the parsers in
 * `client.ts` own the mapping.
 * @module @deepseek-ai/dsh-studio-client/types
 */

/**
 * A value that round-trips losslessly through JSON. Declared locally so this
 * client-safe module carries no dependency on any Host-side package.
 */
export type StudioJsonValue =
  null | boolean | number | string | StudioJsonValue[] | { [key: string]: StudioJsonValue }

/** Studio server capability facts (`GET /api/studio/client/capabilities`). */
export interface StudioCapabilities {
  /** Deployed new-api server version string. */
  serverVersion: string
  /** Workflow protocol schema id the server accepts (e.g. `studio.workflow.v1`). */
  schemaVersion: string
  /** Stage-action names the server accepts for the workflow protocol. */
  stageActions: string[]
  /** Lingshu skill names the server expects the agent runtime to mount. */
  skillStack: string[]
  /** Server-selected default chat model id. */
  defaultChatModel: string
  /** Server-selected default image model id. */
  defaultImageModel: string
  /** Server-selected default video model id. */
  defaultVideoModel: string
  /** Additional video model ids the user may pick. */
  optionalVideoModels: string[]
  /**
   * Hermes detailed-health projection, passed through verbatim; its shape is
   * owned by Hermes and grows without notice, so consumers read it as an
   * arbitrary object. Absent when the server omitted the probe.
   */
  hermes?: Record<string, StudioJsonValue>
}

/** One Studio project summary (`ProjectView` wire shape, mapped). */
export interface StudioProject {
  /** Server numeric project id. */
  id: number
  /** Public share id. */
  publicId: string
  /** Display name. */
  name: string
  /** One-line brief the project was created from. */
  brief: string
  /** Genre tag. */
  genre: string
  /** Server workflow status code. */
  status: number
  /** Style DNA summary text. */
  styleDna: string
  /** Cover image URL; empty while unset. */
  coverUrl: string
  /** Creation time, unix seconds. */
  createdAt: number
  /** Last update time, unix seconds. */
  updatedAt: number
  /** Total stage count; absent while the server reports zero. */
  stageTotal?: number
  /** Completed stage count; absent while the server reports zero. */
  stageDone?: number
}

/** One page of Studio projects (`GET /api/studio/client/projects`). */
export interface StudioProjectPage {
  /** 1-based page number the server answered. */
  page: number
  /** Page size the server applied. */
  pageSize: number
  /** Total project count across pages. */
  total: number
  /** Projects on this page. */
  items: StudioProject[]
}

/** One pipeline stage summary (`StudioStage` wire shape, mapped). */
export interface StudioStage {
  /** Server numeric stage id. */
  id: number
  /** Stable stage key (e.g. `storyboard`). */
  key: string
  /** Display name. */
  name: string
  /** Pipeline order. */
  order: number
  /** Server stage status code. */
  status: number
  /** Work item count inside the stage. */
  totalItems: number
  /** Completed work item count. */
  doneItems: number
}

/** One render job summary (`RenderJobView` wire shape, mapped). */
export interface StudioRenderJobSummary {
  /** Server numeric render job id. */
  id: number
  /** Shot the job renders. */
  shotId: number
  /** Render kind (`image` / `video`). */
  renderType: string
  /** Model id the job renders with. */
  model: string
  /** Server job status code. */
  status: number
  /** Failure text; absent while the job carries none. */
  error?: string
  /** Finished media URL; absent while the job carries none. */
  resultUrl?: string
}

/**
 * First-screen project aggregate (`GET .../projects/:id/snapshot`). Only the
 * fields the desktop workbench reads are projected: the project, its stages,
 * and its render jobs. Characters, shots, artifact versions, and prompt
 * versions stay server-side until a client surface needs them.
 */
export interface StudioSnapshot {
  /** The project itself. */
  project: StudioProject
  /** Total stage count. */
  stageTotal: number
  /** Completed stage count. */
  stageDone: number
  /** Pipeline stages in server order. */
  stages: StudioStage[]
  /** Render jobs in server order. */
  renderJobs: StudioRenderJobSummary[]
}

/**
 * One workflow planning action submission (`POST .../projects/:id/actions`
 * request). The client owns `schema_version` (`studio.workflow.v1`); callers
 * only name the business action.
 */
export interface StudioWorkflowActionOptions {
  /** Chat model override; the server default applies while absent. */
  model?: string
  /** Demand strict JSON output from the agent runtime. */
  strictJson?: boolean
}

/** Business fields of one workflow action submission. */
export interface StudioWorkflowActionRequest {
  /** Stage key the action works on (e.g. `storyboard`). */
  stage: string
  /** Stage-action name from the capabilities allowlist (e.g. `extract_shots`). */
  stageAction: string
  /** Output language tag (e.g. `zh-CN`). */
  language?: string
  /** Action input bag, forwarded verbatim (e.g. `script_artifact_id`). */
  input?: Record<string, StudioJsonValue>
  /** Execution options. */
  options?: StudioWorkflowActionOptions
}

/** Server answer to one workflow action submission. */
export interface StudioWorkflowActionResult {
  /** Result contract id (`studio.workflow.result.v1`). */
  schemaVersion: string
  /** Stage the action ran on. */
  stage: string
  /** Stage-action that ran. */
  stageAction: string
  /** Unified task status of the created task. */
  status: StudioTaskStatus
  /** Landed artifact type; absent in the task-only first version. */
  artifactType?: string
  /** Landed artifact id; absent in the task-only first version. */
  artifactId?: number
  /** Backing task id the client polls through the tasks endpoint. */
  taskId: string
  /** Extra server facts (title, workspace mode, storage scope). */
  data?: Record<string, StudioJsonValue>
  /** Non-fatal warnings. */
  warnings?: string[]
}

/** Unified Studio task status vocabulary. */
export type StudioTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

/** Backing record references of one unified task view. */
export interface StudioTaskSource {
  /** Backing Hermes execution task id; absent for render tasks. */
  hermesTaskId?: string
  /** Backing render job id; absent for workflow tasks. */
  renderJobId?: number
  /** Backing video playground history id; absent unless the render reached it. */
  videoHistoryId?: number
}

/** Workflow metadata recovered from a Hermes task's request payload. */
export interface StudioTaskWorkflow {
  /** Workflow contract id the task declared. */
  schemaVersion?: string
  /** Stage the task works on. */
  stage?: string
  /** Stage-action the task runs. */
  stageAction?: string
  /** The task demanded strict JSON output. */
  strictJson?: boolean
  /**
   * Loose JSON check of the assistant output; only populated for succeeded
   * strict-JSON tasks. Absent means "not checked".
   */
  outputJsonOk?: boolean
}

/** One unified task view (`StudioTaskView` wire shape, mapped). */
export interface StudioTask {
  /** Unified task id (`hermes_...` or `render_<id>`). */
  taskId: string
  /** Task kind (`workflow` / `image_render` / `video_render` / ...). */
  kind: string
  /** Unified status. */
  status: StudioTaskStatus
  /** Owning project id. */
  projectId: number
  /** Stage key; absent for tasks without one. */
  stage?: string
  /** Progress percent (0-100). */
  progress: number
  /** Display title. */
  title: string
  /** Backing record references. */
  source: StudioTaskSource
  /** Workflow metadata; absent for non-workflow tasks. */
  workflow?: StudioTaskWorkflow
  /** Task result payload; absent while the task carries none. */
  result?: Record<string, StudioJsonValue>
  /** Failure text; absent while the task carries none. */
  error?: string
  /** Creation time, unix seconds. */
  createdAt: number
}

/** Unified task list of one project (`GET .../projects/:id/tasks`). */
export interface StudioTaskList {
  /** Owning project id. */
  projectId: number
  /** Task count in this answer. */
  total: number
  /** Unified task views, newest first. */
  tasks: StudioTask[]
}

/**
 * One render submission (`POST .../projects/:id/render` request). Shot
 * selection accepts a single `shotId` or a `shotIds` list; `renderType`
 * names the media kind. Quote flow: submit with `quoteOnly` (or without
 * `confirmed`) to receive per-shot quotes, then re-submit with `confirmed`.
 */
export interface StudioRenderRequest {
  /** Single shot to render. */
  shotId?: number
  /** Multiple shots to render. */
  shotIds?: number[]
  /** Render kind (`image` / `video`). */
  renderType: string
  /** Model override; the stage default applies while absent. */
  model?: string
  /** Prompt version to render from. */
  promptVersionId?: number
  /** First-frame image URL for image-to-video. */
  imageUrl?: string
  /** Last-frame image URL for bracketed video. */
  lastImageUrl?: string
  /** Reference video URL. */
  referenceVideoUrl?: string
  /** Input mode (e.g. `text` / `image`). */
  inputMode?: string
  /** Output size (e.g. `1024x1024`). */
  size?: string
  /** Serialized render plan JSON from the planning layer. */
  renderPlanJson?: string
  /** Fallback prompt when no render plan applies. */
  fallbackPrompt?: string
  /** Risk level override. */
  riskLevel?: string
  /** Force re-render over an existing result. */
  force?: boolean
  /** Only quote; create no job. */
  quoteOnly?: boolean
  /** Confirm the quote and create the job. */
  confirmed?: boolean
}

/** Pre-render price estimate (`RenderQuote` wire shape, mapped). */
export interface StudioRenderQuote {
  /** Model the quote prices. */
  model: string
  /** Render kind the quote prices. */
  renderType: string
  /** Input mode the quote prices. */
  inputMode: string
  /** Billing group. */
  group: string
  /** Group price ratio applied. */
  groupRatio: number
  /** Estimated quota cost. */
  estimatedQuota: number
  /** Estimated USD cost. */
  estimatedUsd: number
  /** Where the price came from. */
  priceSource: string
  /** The quote was already confirmed. */
  confirmed: boolean
}

/** Per-shot outcome of one batch render submission. */
export interface StudioRenderItem {
  /** Shot this outcome belongs to. */
  shotId: number
  /** The shot was accepted (quoted, skipped, or submitted). */
  success: boolean
  /** Per-shot failure text; absent on success. */
  error?: string
  /** The shot already had a result and was skipped. */
  skipped?: boolean
  /** Existing result URL of a skipped shot. */
  resultUrl?: string
  /** The server wants quote confirmation before rendering. */
  confirmationRequired?: boolean
  /** Price quote; present when confirmation is required or quoteOnly was set. */
  quote?: StudioRenderQuote
  /** Unified task view of the created render job; absent before confirmation. */
  task?: StudioTask
}

/** Batch render answer (`POST .../projects/:id/render` response data). */
export interface StudioRenderBatch {
  /** Owning project id. */
  projectId: number
  /** Normalized render kind the server applied. */
  renderType: string
  /** Per-shot outcome count. */
  total: number
  /** Per-shot outcomes; one failing shot does not block the others. */
  results: StudioRenderItem[]
}

/**
 * Normalized failure code carried by every refused Studio call. The browser
 * branches on `code` (e.g. `NOT_LOGGED_IN` re-opens the login dialog) and
 * shows `message` verbatim.
 */
export type StudioClientErrorCode =
  /** No Baizor API key is stored; the user has not completed the login. */
  | 'NOT_LOGGED_IN'
  /** The server refused the presented key (HTTP 401/403). */
  | 'UNAUTHORIZED'
  /** The account quota is exhausted or throttled (HTTP 402/429). */
  | 'QUOTA_EXCEEDED'
  /** The named object does not exist for this account (HTTP 404). */
  | 'NOT_FOUND'
  /** The server answered an envelope failure or a 5xx status. */
  | 'SERVER_ERROR'
  /** The body violated the shape this client was built against. */
  | 'SCHEMA_ERROR'
  /** The request never received a response (offline, DNS, reset). */
  | 'TRANSPORT_ERROR'

/** Outcome of one Studio client call, as answered to the browser. */
export type StudioClientResult<T> =
  | {
    ok: true
    /** The parsed, mapped payload. */
    value: T
  }
  | {
    ok: false
    /** Normalized failure code the browser branches on. */
    code: StudioClientErrorCode
    /** Human text naming the failure. */
    message: string
  }
