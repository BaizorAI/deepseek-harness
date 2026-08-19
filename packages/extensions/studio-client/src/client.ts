/**
 * Baizor Studio client primitives: URL building, response parsing, and the
 * injected-fetch request seam the host service drives. Every endpoint call
 * is one pure function taking a {@link StudioFetch}, so tests drive the full
 * failure taxonomy without a network. The API key is passed per call and is
 * never stored on module state.
 * @module @deepseek-ai/dsh-studio-client/client
 */

import { isJsonValue } from '@deepseek-ai/dsh-session'
import type {
  StudioCapabilities, StudioClientErrorCode, StudioJsonValue, StudioProject, StudioProjectPage,
  StudioRenderBatch, StudioRenderItem, StudioRenderJobSummary, StudioRenderQuote,
  StudioRenderRequest, StudioSnapshot, StudioStage, StudioTask, StudioTaskList, StudioTaskStatus,
  StudioWorkflowActionRequest, StudioWorkflowActionResult,
} from './types.ts'

/** The baizor.com origin the Studio API shares with the login flow. */
export const BAIZOR_BASE_URL = 'https://baizor.com'

/** Conventional credential reference the login flow stores the key under. */
export const BAIZOR_KEY_REF = 'BAIZORAI_API_KEY'

/** Studio client API route prefix below the base origin. */
export const STUDIO_API_PREFIX = '/api/studio/client'

/** Workflow request contract id this client submits. */
export const STUDIO_WORKFLOW_SCHEMA_VERSION = 'studio.workflow.v1'

/**
 * One refused Studio call. Host services catch this and answer the browser a
 * `{ ok: false, code, message }` union instead of throwing across the wire.
 */
export class StudioClientFailure extends Error {
  constructor(
    /** Normalized failure code the browser branches on. */
    readonly code: StudioClientErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'StudioClientFailure'
  }
}

/** Minimal request surface the endpoint functions need. */
export interface StudioFetch {
  /** GET one URL with the given headers; rejects on transport failure. */
  (url: string, init: StudioFetchInit): Promise<StudioFetchResponse>
}

/** Request facts the endpoint functions hand the fetch seam. */
export interface StudioFetchInit {
  /** Headers to send; the Authorization header is pre-populated. */
  headers: Record<string, string>
  /** HTTP method; GET while absent. */
  method?: string
  /** JSON request body; serialized by the fetch implementation. */
  body?: StudioJsonValue
}

/** One answered HTTP exchange, body pre-parsed when it was JSON. */
export interface StudioFetchResponse {
  /** HTTP status code. */
  status: number
  /** Parsed JSON body; undefined when the body was not JSON. */
  body?: unknown
}

/** Capabilities endpoint URL. */
export function capabilitiesUrl(baseUrl: string): string {
  return `${baseUrl}${STUDIO_API_PREFIX}/capabilities`
}

/** Project-list endpoint URL for one page. */
export function projectsUrl(baseUrl: string, page: number, pageSize: number): string {
  return `${baseUrl}${STUDIO_API_PREFIX}/projects?p=${page}&page_size=${pageSize}`
}

/** Project snapshot endpoint URL; the ref may be a numeric id or a public id. */
export function snapshotUrl(baseUrl: string, projectRef: string): string {
  return `${baseUrl}${STUDIO_API_PREFIX}/projects/${encodeURIComponent(projectRef)}/snapshot`
}

/** Workflow action endpoint URL; the ref may be a numeric id or a public id. */
export function actionsUrl(baseUrl: string, projectRef: string): string {
  return `${baseUrl}${STUDIO_API_PREFIX}/projects/${encodeURIComponent(projectRef)}/actions`
}

/** Unified task list endpoint URL; a positive limit narrows the answer. */
export function tasksUrl(baseUrl: string, projectRef: string, limit?: number): string {
  const base = `${baseUrl}${STUDIO_API_PREFIX}/projects/${encodeURIComponent(projectRef)}/tasks`
  return limit !== undefined && limit > 0 ? `${base}?limit=${limit}` : base
}

/** Single unified task endpoint URL. */
export function taskUrl(baseUrl: string, projectRef: string, taskId: string): string {
  return `${tasksUrl(baseUrl, projectRef)}/${encodeURIComponent(taskId)}`
}

/** Batch render endpoint URL; the ref may be a numeric id or a public id. */
export function renderUrl(baseUrl: string, projectRef: string): string {
  return `${baseUrl}${STUDIO_API_PREFIX}/projects/${encodeURIComponent(projectRef)}/render`
}

/** Normalize one HTTP status into the failure taxonomy. */
export function failureForStatus(status: number, detail: string): StudioClientFailure {
  if (status === 401 || status === 403) {
    return new StudioClientFailure('UNAUTHORIZED', `studio API refused the stored key (${status})${detail}`)
  }
  if (status === 402 || status === 429) {
    return new StudioClientFailure('QUOTA_EXCEEDED', `studio API reports the account quota is exhausted (${status})${detail}`)
  }
  if (status === 404) {
    return new StudioClientFailure('NOT_FOUND', `studio API object not found (404)${detail}`)
  }
  if (status >= 500) {
    return new StudioClientFailure('SERVER_ERROR', `studio API server error (${status})${detail}`)
  }
  return new StudioClientFailure('SERVER_ERROR', `studio API answered status ${status}${detail}`)
}

/** Run one request against the Studio API and return the envelope's `data`. */
async function studioRequest(
  fetchImpl: StudioFetch, url: string, init: StudioFetchInit,
): Promise<unknown> {
  let response: StudioFetchResponse
  try {
    response = await fetchImpl(url, init)
  } catch (error) {
    throw new StudioClientFailure(
      'TRANSPORT_ERROR',
      `studio API request failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (response.status !== 200) {
    const body = response.body
    const detail = isRecord(body) && typeof body.message === 'string' && body.message !== ''
      ? `: ${body.message}` : ''
    throw failureForStatus(response.status, detail)
  }
  const body = response.body
  if (!isRecord(body)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio API answered a non-JSON body')
  }
  if (body.success !== true) {
    const message = typeof body.message === 'string' && body.message !== ''
      ? body.message : 'studio API answered an unsuccessful envelope'
    throw new StudioClientFailure('SERVER_ERROR', message)
  }
  if (!('data' in body)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio API envelope carries no data field')
  }
  return body.data
}

/** Run one GET against the Studio API and return the envelope's `data`. */
export async function studioGet(fetchImpl: StudioFetch, url: string, apiKey: string): Promise<unknown> {
  return await studioRequest(fetchImpl, url, { headers: { Authorization: `Bearer ${apiKey}` } })
}

/** Run one JSON POST against the Studio API and return the envelope's `data`. */
export async function studioPost(
  fetchImpl: StudioFetch, url: string, apiKey: string, payload: Record<string, StudioJsonValue>,
): Promise<unknown> {
  return await studioRequest(fetchImpl, url, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    method: 'POST',
    body: payload,
  })
}

/** Narrow an unknown to a plain record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read one required string field or refuse the payload. */
function stringField(source: Record<string, unknown>, name: string): string {
  const value = source[name]
  if (typeof value !== 'string') {
    throw new StudioClientFailure('SCHEMA_ERROR', `studio API field "${name}" is not a string`)
  }
  return value
}

/** Read one required finite-number field or refuse the payload. */
function numberField(source: Record<string, unknown>, name: string): number {
  const value = source[name]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new StudioClientFailure('SCHEMA_ERROR', `studio API field "${name}" is not a number`)
  }
  return value
}

/** Read one optional number field; absent and undefined stay absent. */
function optionalNumberField(source: Record<string, unknown>, name: string): number | undefined {
  const value = source[name]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new StudioClientFailure('SCHEMA_ERROR', `studio API field "${name}" is not a number`)
  }
  return value
}

/** Read one optional string field; absent, undefined, and empty stay absent. */
function optionalStringField(source: Record<string, unknown>, name: string): string | undefined {
  const value = source[name]
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string') {
    throw new StudioClientFailure('SCHEMA_ERROR', `studio API field "${name}" is not a string`)
  }
  return value
}

/** Read one required string-array field or refuse the payload. */
function stringArrayField(source: Record<string, unknown>, name: string): string[] {
  const value = source[name]
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    throw new StudioClientFailure('SCHEMA_ERROR', `studio API field "${name}" is not a string array`)
  }
  return value
}

/** Read one required boolean field or refuse the payload. */
function boolField(source: Record<string, unknown>, name: string): boolean {
  const value = source[name]
  if (typeof value !== 'boolean') {
    throw new StudioClientFailure('SCHEMA_ERROR', `studio API field "${name}" is not a boolean`)
  }
  return value
}

/** Read one optional boolean field; absent and undefined stay absent. */
function optionalBoolField(source: Record<string, unknown>, name: string): boolean | undefined {
  const value = source[name]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'boolean') {
    throw new StudioClientFailure('SCHEMA_ERROR', `studio API field "${name}" is not a boolean`)
  }
  return value
}

/**
 * Read one optional free-form object field; absent, undefined, and null stay
 * absent. The value must round-trip through JSON losslessly.
 */
function optionalRecordField(
  source: Record<string, unknown>, name: string,
): Record<string, StudioJsonValue> | undefined {
  const value = source[name]
  if (value === undefined || value === null) return undefined
  if (!isRecord(value) || !isJsonValue(value)) {
    throw new StudioClientFailure('SCHEMA_ERROR', `studio API field "${name}" is not a JSON object`)
  }
  // isRecord keeps arrays out; isJsonValue deep-validates every value, so the
  // record cast is sound.
  return value as Record<string, StudioJsonValue>
}

/** Validate and map the capabilities payload. */
export function parseCapabilities(data: unknown): StudioCapabilities {
  if (!isRecord(data)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio capabilities payload is not an object')
  }
  const hermes = data.hermes
  const capabilities: StudioCapabilities = {
    serverVersion: stringField(data, 'server_version'),
    schemaVersion: stringField(data, 'schema_version'),
    stageActions: stringArrayField(data, 'stage_actions'),
    skillStack: stringArrayField(data, 'skill_stack'),
    defaultChatModel: stringField(data, 'default_chat_model'),
    defaultImageModel: stringField(data, 'default_image_model'),
    defaultVideoModel: stringField(data, 'default_video_model'),
    optionalVideoModels: stringArrayField(data, 'optional_video_models'),
  }
  if (isRecord(hermes) && isJsonValue(hermes)) {
    // isRecord keeps arrays out; isJsonValue deep-validates every value, so
    // the record cast is sound.
    capabilities.hermes = hermes as Record<string, StudioJsonValue>
  }
  return capabilities
}

/** Validate and map one project view. */
export function parseProject(data: unknown): StudioProject {
  if (!isRecord(data)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio project payload is not an object')
  }
  const project: StudioProject = {
    id: numberField(data, 'id'),
    publicId: stringField(data, 'public_id'),
    name: stringField(data, 'name'),
    brief: stringField(data, 'brief'),
    genre: stringField(data, 'genre'),
    status: numberField(data, 'status'),
    styleDna: stringField(data, 'style_dna'),
    coverUrl: stringField(data, 'cover_url'),
    createdAt: numberField(data, 'created_at'),
    updatedAt: numberField(data, 'updated_at'),
  }
  const stageTotal = optionalNumberField(data, 'stage_total')
  if (stageTotal !== undefined) project.stageTotal = stageTotal
  const stageDone = optionalNumberField(data, 'stage_done')
  if (stageDone !== undefined) project.stageDone = stageDone
  return project
}

/** Validate and map one project-list page. */
export function parseProjectPage(data: unknown): StudioProjectPage {
  if (!isRecord(data)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio project page payload is not an object')
  }
  const items = data.items
  if (!Array.isArray(items)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio API field "items" is not an array')
  }
  return {
    page: numberField(data, 'page'),
    pageSize: numberField(data, 'page_size'),
    total: numberField(data, 'total'),
    items: items.map(parseProject),
  }
}

/** Validate and map one stage summary. */
export function parseStage(data: unknown): StudioStage {
  if (!isRecord(data)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio stage payload is not an object')
  }
  return {
    id: numberField(data, 'id'),
    key: stringField(data, 'key'),
    name: stringField(data, 'name'),
    order: numberField(data, 'order'),
    status: numberField(data, 'status'),
    totalItems: numberField(data, 'total_items'),
    doneItems: numberField(data, 'done_items'),
  }
}

/** Validate and map one render job summary. */
export function parseRenderJobSummary(data: unknown): StudioRenderJobSummary {
  if (!isRecord(data)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio render job payload is not an object')
  }
  const job: StudioRenderJobSummary = {
    id: numberField(data, 'id'),
    shotId: numberField(data, 'shot_id'),
    renderType: stringField(data, 'render_type'),
    model: stringField(data, 'model'),
    status: numberField(data, 'status'),
  }
  const error = optionalStringField(data, 'error')
  if (error !== undefined) job.error = error
  const resultUrl = optionalStringField(data, 'result_url')
  if (resultUrl !== undefined) job.resultUrl = resultUrl
  return job
}

/** Validate and map the project snapshot aggregate. */
export function parseSnapshot(data: unknown): StudioSnapshot {
  if (!isRecord(data)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio snapshot payload is not an object')
  }
  const stages = data.stages
  if (!Array.isArray(stages)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio API field "stages" is not an array')
  }
  const renderJobs = data.render_jobs
  if (!Array.isArray(renderJobs)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio API field "render_jobs" is not an array')
  }
  return {
    project: parseProject(data.project),
    stageTotal: numberField(data, 'stage_total'),
    stageDone: numberField(data, 'stage_done'),
    stages: stages.map(parseStage),
    renderJobs: renderJobs.map(parseRenderJobSummary),
  }
}

/** Fetch the Studio capabilities payload. */
export async function fetchCapabilities(
  fetchImpl: StudioFetch, baseUrl: string, apiKey: string,
): Promise<StudioCapabilities> {
  return parseCapabilities(await studioGet(fetchImpl, capabilitiesUrl(baseUrl), apiKey))
}

/** Fetch one page of Studio projects. */
export async function fetchProjects(
  fetchImpl: StudioFetch, baseUrl: string, apiKey: string, page: number, pageSize: number,
): Promise<StudioProjectPage> {
  return parseProjectPage(await studioGet(fetchImpl, projectsUrl(baseUrl, page, pageSize), apiKey))
}

/** Fetch the first-screen snapshot of one project. */
export async function fetchSnapshot(
  fetchImpl: StudioFetch, baseUrl: string, apiKey: string, projectRef: string,
): Promise<StudioSnapshot> {
  return parseSnapshot(await studioGet(fetchImpl, snapshotUrl(baseUrl, projectRef), apiKey))
}

/** Serialize one workflow action submission into its wire body. */
export function workflowActionBody(action: StudioWorkflowActionRequest): Record<string, StudioJsonValue> {
  const body: Record<string, StudioJsonValue> = {
    schema_version: STUDIO_WORKFLOW_SCHEMA_VERSION,
    stage: action.stage,
    stage_action: action.stageAction,
  }
  if (action.language !== undefined) body.language = action.language
  if (action.input !== undefined) body.input = action.input
  if (action.options !== undefined) {
    const options: Record<string, StudioJsonValue> = {}
    if (action.options.model !== undefined) options.model = action.options.model
    if (action.options.strictJson !== undefined) options.strict_json = action.options.strictJson
    body.options = options
  }
  return body
}

/** Validate and map one workflow action result. */
export function parseWorkflowActionResult(data: unknown): StudioWorkflowActionResult {
  if (!isRecord(data)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio workflow action result is not an object')
  }
  const result: StudioWorkflowActionResult = {
    schemaVersion: stringField(data, 'schema_version'),
    stage: stringField(data, 'stage'),
    stageAction: stringField(data, 'stage_action'),
    status: parseTaskStatus(data),
    taskId: stringField(data, 'task_id'),
  }
  const artifactType = optionalStringField(data, 'artifact_type')
  if (artifactType !== undefined) result.artifactType = artifactType
  const artifactId = optionalNumberField(data, 'artifact_id')
  if (artifactId !== undefined) result.artifactId = artifactId
  const resultData = optionalRecordField(data, 'data')
  if (resultData !== undefined) result.data = resultData
  if (data.warnings !== undefined) result.warnings = stringArrayField(data, 'warnings')
  return result
}

/** Read the unified task status field or refuse the payload. */
function parseTaskStatus(source: Record<string, unknown>): StudioTaskStatus {
  const value = source.status
  if (value === 'queued' || value === 'running' || value === 'succeeded'
    || value === 'failed' || value === 'canceled') {
    return value
  }
  throw new StudioClientFailure('SCHEMA_ERROR', 'studio API field "status" is not a known task status')
}

/** Validate and map the backing-record references of one task. */
function parseTaskSource(data: unknown): StudioTask['source'] {
  if (!isRecord(data)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio API field "source" is not an object')
  }
  const source: StudioTask['source'] = {}
  const hermesTaskId = optionalStringField(data, 'hermes_task_id')
  if (hermesTaskId !== undefined) source.hermesTaskId = hermesTaskId
  const renderJobId = optionalNumberField(data, 'render_job_id')
  if (renderJobId !== undefined) source.renderJobId = renderJobId
  const videoHistoryId = optionalNumberField(data, 'video_history_id')
  if (videoHistoryId !== undefined) source.videoHistoryId = videoHistoryId
  return source
}

/** Validate and map the workflow metadata of one task. */
function parseTaskWorkflow(data: unknown): NonNullable<StudioTask['workflow']> {
  if (!isRecord(data)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio API field "workflow" is not an object')
  }
  const workflow: NonNullable<StudioTask['workflow']> = {}
  const schemaVersion = optionalStringField(data, 'schema_version')
  if (schemaVersion !== undefined) workflow.schemaVersion = schemaVersion
  const stage = optionalStringField(data, 'stage')
  if (stage !== undefined) workflow.stage = stage
  const stageAction = optionalStringField(data, 'stage_action')
  if (stageAction !== undefined) workflow.stageAction = stageAction
  const strictJson = optionalBoolField(data, 'strict_json')
  if (strictJson !== undefined) workflow.strictJson = strictJson
  const outputJsonOk = optionalBoolField(data, 'output_json_ok')
  if (outputJsonOk !== undefined) workflow.outputJsonOk = outputJsonOk
  return workflow
}

/** Validate and map one unified task view. */
export function parseTask(data: unknown): StudioTask {
  if (!isRecord(data)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio task payload is not an object')
  }
  const task: StudioTask = {
    taskId: stringField(data, 'task_id'),
    kind: stringField(data, 'kind'),
    status: parseTaskStatus(data),
    projectId: numberField(data, 'project_id'),
    progress: numberField(data, 'progress'),
    title: stringField(data, 'title'),
    source: parseTaskSource(data.source),
    createdAt: numberField(data, 'created_at'),
  }
  const stage = optionalStringField(data, 'stage')
  if (stage !== undefined) task.stage = stage
  if (data.workflow !== undefined && data.workflow !== null) {
    task.workflow = parseTaskWorkflow(data.workflow)
  }
  const result = optionalRecordField(data, 'result')
  if (result !== undefined) task.result = result
  const error = optionalStringField(data, 'error')
  if (error !== undefined) task.error = error
  return task
}

/** Validate and map the unified task list of one project. */
export function parseTaskList(data: unknown): StudioTaskList {
  if (!isRecord(data)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio task list payload is not an object')
  }
  const tasks = data.tasks
  if (!Array.isArray(tasks)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio API field "tasks" is not an array')
  }
  return {
    projectId: numberField(data, 'project_id'),
    total: numberField(data, 'total'),
    tasks: tasks.map(parseTask),
  }
}

/** Serialize one render submission into its wire body. */
export function renderRequestBody(request: StudioRenderRequest): Record<string, StudioJsonValue> {
  const body: Record<string, StudioJsonValue> = { render_type: request.renderType }
  if (request.shotId !== undefined) body.shot_id = request.shotId
  if (request.shotIds !== undefined) body.shots = request.shotIds
  if (request.model !== undefined) body.model = request.model
  if (request.promptVersionId !== undefined) body.prompt_version_id = request.promptVersionId
  if (request.imageUrl !== undefined) body.image_url = request.imageUrl
  if (request.lastImageUrl !== undefined) body.last_image_url = request.lastImageUrl
  if (request.referenceVideoUrl !== undefined) body.reference_video_url = request.referenceVideoUrl
  if (request.inputMode !== undefined) body.input_mode = request.inputMode
  if (request.size !== undefined) body.size = request.size
  if (request.renderPlanJson !== undefined) body.render_plan_json = request.renderPlanJson
  if (request.fallbackPrompt !== undefined) body.fallback_prompt = request.fallbackPrompt
  if (request.riskLevel !== undefined) body.risk_level = request.riskLevel
  if (request.force !== undefined) body.force = request.force
  if (request.quoteOnly !== undefined) body.quote_only = request.quoteOnly
  if (request.confirmed !== undefined) body.confirmed = request.confirmed
  return body
}

/** Validate and map one render quote. */
export function parseRenderQuote(data: unknown): StudioRenderQuote {
  if (!isRecord(data)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio render quote payload is not an object')
  }
  return {
    model: stringField(data, 'model'),
    renderType: stringField(data, 'render_type'),
    inputMode: stringField(data, 'input_mode'),
    group: stringField(data, 'group'),
    groupRatio: numberField(data, 'group_ratio'),
    estimatedQuota: numberField(data, 'estimated_quota'),
    estimatedUsd: numberField(data, 'estimated_usd'),
    priceSource: stringField(data, 'price_source'),
    confirmed: boolField(data, 'confirmed'),
  }
}

/** Validate and map one per-shot render outcome. */
export function parseRenderItem(data: unknown): StudioRenderItem {
  if (!isRecord(data)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio render item payload is not an object')
  }
  const item: StudioRenderItem = {
    shotId: numberField(data, 'shot_id'),
    success: boolField(data, 'success'),
  }
  const error = optionalStringField(data, 'error')
  if (error !== undefined) item.error = error
  const skipped = optionalBoolField(data, 'skipped')
  if (skipped !== undefined) item.skipped = skipped
  const resultUrl = optionalStringField(data, 'result_url')
  if (resultUrl !== undefined) item.resultUrl = resultUrl
  const confirmationRequired = optionalBoolField(data, 'confirmation_required')
  if (confirmationRequired !== undefined) item.confirmationRequired = confirmationRequired
  if (data.quote !== undefined && data.quote !== null) item.quote = parseRenderQuote(data.quote)
  if (data.task !== undefined && data.task !== null) item.task = parseTask(data.task)
  return item
}

/** Validate and map one batch render answer. */
export function parseRenderBatch(data: unknown): StudioRenderBatch {
  if (!isRecord(data)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio render batch payload is not an object')
  }
  const results = data.results
  if (!Array.isArray(results)) {
    throw new StudioClientFailure('SCHEMA_ERROR', 'studio API field "results" is not an array')
  }
  return {
    projectId: numberField(data, 'project_id'),
    renderType: stringField(data, 'render_type'),
    total: numberField(data, 'total'),
    results: results.map(parseRenderItem),
  }
}

/** Submit one workflow planning action of one project. */
export async function fetchCreateAction(
  fetchImpl: StudioFetch, baseUrl: string, apiKey: string, projectRef: string,
  action: StudioWorkflowActionRequest,
): Promise<StudioWorkflowActionResult> {
  return parseWorkflowActionResult(
    await studioPost(fetchImpl, actionsUrl(baseUrl, projectRef), apiKey, workflowActionBody(action)),
  )
}

/** Fetch the unified task list of one project. */
export async function fetchTasks(
  fetchImpl: StudioFetch, baseUrl: string, apiKey: string, projectRef: string, limit?: number,
): Promise<StudioTaskList> {
  return parseTaskList(await studioGet(fetchImpl, tasksUrl(baseUrl, projectRef, limit), apiKey))
}

/** Fetch one unified task of one project. */
export async function fetchTask(
  fetchImpl: StudioFetch, baseUrl: string, apiKey: string, projectRef: string, taskId: string,
): Promise<StudioTask> {
  return parseTask(await studioGet(fetchImpl, taskUrl(baseUrl, projectRef, taskId), apiKey))
}

/** Submit one batch render of one project. */
export async function fetchRender(
  fetchImpl: StudioFetch, baseUrl: string, apiKey: string, projectRef: string,
  request: StudioRenderRequest,
): Promise<StudioRenderBatch> {
  return parseRenderBatch(
    await studioPost(fetchImpl, renderUrl(baseUrl, projectRef), apiKey, renderRequestBody(request)),
  )
}

/**
 * Fold one thrown failure into the browser-facing refusal union member. A
 * {@link StudioClientFailure} keeps its code; anything else is a transport
 * surprise.
 */
export function studioFailureOf(error: unknown): { code: StudioClientErrorCode; message: string } {
  if (error instanceof StudioClientFailure) {
    return { code: error.code, message: error.message }
  }
  return {
    code: 'TRANSPORT_ERROR',
    message: error instanceof Error ? error.message : String(error),
  }
}
