/** Studio client primitives: URLs, parsers, request seam, and failure taxonomy. */
import { describe, expect, it, vi } from 'vitest'
import {
  actionsUrl, BAIZOR_BASE_URL, BAIZOR_KEY_REF, capabilitiesUrl, failureForStatus, fetchCapabilities,
  fetchCreateAction, fetchProjects, fetchRender, fetchSnapshot, fetchTask, fetchTasks,
  parseCapabilities, parseProject, parseProjectPage, parseRenderBatch, parseRenderItem,
  parseRenderJobSummary, parseRenderQuote, parseSnapshot, parseStage, parseTask, parseTaskList,
  parseWorkflowActionResult, projectsUrl, renderRequestBody, renderUrl, snapshotUrl,
  STUDIO_API_PREFIX, STUDIO_WORKFLOW_SCHEMA_VERSION, StudioClientFailure, studioFailureOf,
  studioGet, studioPost, taskUrl, tasksUrl, workflowActionBody,
} from '../src/client.ts'
import type { StudioFetch, StudioFetchResponse } from '../src/client.ts'
import type { StudioCapabilities } from '../src/types.ts'

/** One capabilities payload in wire shape. */
function capabilitiesBody(): Record<string, unknown> {
  return {
    server_version: '1.5.95',
    schema_version: 'studio.workflow.v1',
    stage_actions: ['generate_script_plan', 'extract_shots'],
    skill_stack: ['lingshu-film-studio-pipeline', 'lingshu-screenwriting-v1'],
    default_chat_model: 'huayu-hermes-max',
    default_image_model: 'huayu-image4',
    default_video_model: 'minimax-h3-fast',
    optional_video_models: ['minimax-h3'],
    hermes: { status: 'ok', health_status: 'healthy', skills: {} },
  }
}

/** One project view in wire shape. */
function projectBody(): Record<string, unknown> {
  return {
    id: 7,
    public_id: 'pub-7',
    name: '四季有你',
    brief: '一支婚礼短片',
    genre: 'wedding',
    status: 1,
    style_dna: 'warm filmic',
    cover_url: '',
    created_at: 1754200000,
    updated_at: 1754300000,
    stage_total: 8,
    stage_done: 3,
  }
}

/** One stage in wire shape. */
function stageBody(): Record<string, unknown> {
  return {
    id: 11,
    project_id: 7,
    key: 'storyboard',
    name: '分镜',
    order: 3,
    status: 1,
    auto_skill: '',
    total_items: 12,
    done_items: 4,
    output_data: '{}',
    created_at: 1754200000000,
    updated_at: 1754300000000,
  }
}

/** One render job view in wire shape. */
function renderJobBody(): Record<string, unknown> {
  return {
    id: 21,
    project_id: 7,
    shot_id: 5,
    model: 'huayu-image4',
    render_type: 'image',
    input_mode: 'text',
    status: 3,
    error: 'upstream timeout',
    result_url: '',
  }
}

/** One snapshot payload in wire shape. */
function snapshotBody(): Record<string, unknown> {
  return {
    project: projectBody(),
    stage_total: 8,
    stage_done: 3,
    stages: [stageBody()],
    characters: [],
    shots: [],
    artifact_versions: [],
    prompt_versions: [],
    render_jobs: [renderJobBody()],
  }
}

/** A fetch seam answering one canned response and recording the call. */
function cannedFetch(response: StudioFetchResponse): StudioFetch & { calls: Array<{ url: string; init: unknown }> } {
  const calls: Array<{ url: string; init: unknown }> = []
  const impl = Object.assign(
    vi.fn(async (url: string, init: unknown) => {
      calls.push({ url, init })
      return response
    }),
    { calls },
  )
  return impl
}

/** Await one call expected to refuse, returning the thrown failure. */
async function refusalOf(promise: Promise<unknown>): Promise<StudioClientFailure> {
  return await promise.then(
    () => { throw new Error('expected the call to be refused') },
    (error: unknown) => error as StudioClientFailure,
  )
}

function okEnvelope(data: unknown): StudioFetchResponse {
  return { status: 200, body: { success: true, message: '', data } }
}

describe('URL builders', () => {
  it('builds the capabilities URL under the studio prefix', () => {
    expect(capabilitiesUrl(BAIZOR_BASE_URL)).toBe(`${BAIZOR_BASE_URL}${STUDIO_API_PREFIX}/capabilities`)
  })

  it('builds the project-list URL with the page query', () => {
    expect(projectsUrl(BAIZOR_BASE_URL, 2, 20))
      .toBe(`${BAIZOR_BASE_URL}${STUDIO_API_PREFIX}/projects?p=2&page_size=20`)
  })

  it('names the credential reference the login flow stores the key under', () => {
    expect(BAIZOR_KEY_REF).toBe('BAIZORAI_API_KEY')
  })

  it('builds the snapshot URL with the encoded project ref', () => {
    expect(snapshotUrl(BAIZOR_BASE_URL, 'pub-7'))
      .toBe(`${BAIZOR_BASE_URL}${STUDIO_API_PREFIX}/projects/pub-7/snapshot`)
    expect(snapshotUrl(BAIZOR_BASE_URL, 'a/b'))
      .toBe(`${BAIZOR_BASE_URL}${STUDIO_API_PREFIX}/projects/a%2Fb/snapshot`)
  })
})

describe('studioGet', () => {
  it('sends the bearer key and unwraps the envelope data', async () => {
    const fetchImpl = cannedFetch(okEnvelope({ server_version: '1.5.95' }))
    const data = await studioGet(fetchImpl, 'https://example.test/x', 'sk-secret')
    expect(data).toEqual({ server_version: '1.5.95' })
    expect(fetchImpl.calls).toEqual([
      { url: 'https://example.test/x', init: { headers: { Authorization: 'Bearer sk-secret' } } },
    ])
  })

  it('refuses a rejected fetch as a transport error', async () => {
    const fetchImpl: StudioFetch = () => Promise.reject(new Error('connection reset'))
    const failure = await refusalOf(studioGet(fetchImpl, 'https://example.test/x', 'k'))
    expect(failure).toBeInstanceOf(StudioClientFailure)
    expect(failure.code).toBe('TRANSPORT_ERROR')
    expect(failure.message).toContain('connection reset')
  })

  it('stringifies a non-error rejection', async () => {
    // Promise consumers must contain unknown rejection values from a
    // transport implementation, including non-Error legacy clients.
    const fetchImpl: StudioFetch = () => Promise.reject('gone')
    const failure = await refusalOf(studioGet(fetchImpl, 'https://example.test/x', 'k'))
    expect(failure.code).toBe('TRANSPORT_ERROR')
    expect(failure.message).toContain('gone')
  })

  it('refuses a non-JSON 200 body as a schema error', async () => {
    const fetchImpl = cannedFetch({ status: 200, body: undefined })
    const failure = await refusalOf(studioGet(fetchImpl, 'https://example.test/x', 'k'))
    expect(failure.code).toBe('SCHEMA_ERROR')
  })

  it('refuses an unsuccessful envelope with the server message', async () => {
    const fetchImpl = cannedFetch({ status: 200, body: { success: false, message: 'quota exhausted' } })
    const failure = await refusalOf(studioGet(fetchImpl, 'https://example.test/x', 'k'))
    expect(failure).toBeInstanceOf(StudioClientFailure)
    expect(failure.code).toBe('SERVER_ERROR')
    expect(failure.message).toBe('quota exhausted')
  })

  it('falls back to a generic message for a message-less envelope failure', async () => {
    const fetchImpl = cannedFetch({ status: 200, body: { success: false, message: '' } })
    const failure = await refusalOf(studioGet(fetchImpl, 'https://example.test/x', 'k'))
    expect(failure.message).toContain('unsuccessful envelope')
  })

  it('refuses an envelope without a data field', async () => {
    const fetchImpl = cannedFetch({ status: 200, body: { success: true, message: '' } })
    const failure = await refusalOf(studioGet(fetchImpl, 'https://example.test/x', 'k'))
    expect(failure.code).toBe('SCHEMA_ERROR')
    expect(failure.message).toContain('data')
  })

  it('appends the server message to non-200 statuses', async () => {
    const fetchImpl = cannedFetch({ status: 401, body: { success: false, message: 'bad token' } })
    const failure = await refusalOf(studioGet(fetchImpl, 'https://example.test/x', 'k'))
    expect(failure.code).toBe('UNAUTHORIZED')
    expect(failure.message).toContain('bad token')
  })
})

describe('failureForStatus', () => {
  it.each([
    [401, 'UNAUTHORIZED'], [403, 'UNAUTHORIZED'],
    [402, 'QUOTA_EXCEEDED'], [429, 'QUOTA_EXCEEDED'],
    [404, 'NOT_FOUND'],
    [500, 'SERVER_ERROR'], [503, 'SERVER_ERROR'],
    [418, 'SERVER_ERROR'],
  ] as const)('maps %d to %s', (status, code) => {
    expect(failureForStatus(status, '').code).toBe(code)
  })
})

describe('parseCapabilities', () => {
  it('maps the wire shape onto camelCase and keeps the hermes projection verbatim', () => {
    const parsed = parseCapabilities(capabilitiesBody())
    expect(parsed).toEqual<StudioCapabilities>({
      serverVersion: '1.5.95',
      schemaVersion: 'studio.workflow.v1',
      stageActions: ['generate_script_plan', 'extract_shots'],
      skillStack: ['lingshu-film-studio-pipeline', 'lingshu-screenwriting-v1'],
      defaultChatModel: 'huayu-hermes-max',
      defaultImageModel: 'huayu-image4',
      defaultVideoModel: 'minimax-h3-fast',
      optionalVideoModels: ['minimax-h3'],
      hermes: { status: 'ok', health_status: 'healthy', skills: {} },
    })
  })

  it('leaves an absent or non-object hermes projection absent', () => {
    const body = capabilitiesBody()
    delete body.hermes
    expect(parseCapabilities(body).hermes).toBeUndefined()
    body.hermes = 'degraded'
    expect(parseCapabilities(body).hermes).toBeUndefined()
  })

  it('refuses a non-object payload', () => {
    expect(() => parseCapabilities([])).toThrow(StudioClientFailure)
  })

  it('refuses a payload whose field has the wrong type', () => {
    const body = capabilitiesBody()
    body.stage_actions = 'nope'
    expect(() => parseCapabilities(body)).toThrow(/stage_actions/)
    body.stage_actions = [1]
    expect(() => parseCapabilities(body)).toThrow(/stage_actions/)
  })

  it('refuses a payload missing a required string', () => {
    const body = capabilitiesBody()
    delete body.schema_version
    expect(() => parseCapabilities(body)).toThrow(/schema_version/)
  })
})

describe('parseProject', () => {
  it('maps the wire shape and keeps optional stage counts', () => {
    expect(parseProject(projectBody())).toEqual({
      id: 7,
      publicId: 'pub-7',
      name: '四季有你',
      brief: '一支婚礼短片',
      genre: 'wedding',
      status: 1,
      styleDna: 'warm filmic',
      coverUrl: '',
      createdAt: 1754200000,
      updatedAt: 1754300000,
      stageTotal: 8,
      stageDone: 3,
    })
  })

  it('leaves zero-omitted stage counts absent', () => {
    const body = projectBody()
    delete body.stage_total
    delete body.stage_done
    const parsed = parseProject(body)
    expect(parsed.stageTotal).toBeUndefined()
    expect(parsed.stageDone).toBeUndefined()
  })

  it('refuses a non-object payload and wrong-typed fields', () => {
    expect(() => parseProject('nope')).toThrow(StudioClientFailure)
    const body = projectBody()
    body.id = '7'
    expect(() => parseProject(body)).toThrow(/"id"/)
    body.id = 7
    body.stage_total = 'many'
    expect(() => parseProject(body)).toThrow(/stage_total/)
  })
})

describe('parseStage', () => {
  it('maps the wire shape onto camelCase', () => {
    expect(parseStage(stageBody())).toEqual({
      id: 11,
      key: 'storyboard',
      name: '分镜',
      order: 3,
      status: 1,
      totalItems: 12,
      doneItems: 4,
    })
  })

  it('refuses a non-object payload and wrong-typed fields', () => {
    expect(() => parseStage(null)).toThrow(StudioClientFailure)
    const body = stageBody()
    body.total_items = 'many'
    expect(() => parseStage(body)).toThrow(/total_items/)
  })
})

describe('parseRenderJobSummary', () => {
  it('maps the wire shape and keeps optional error and result fields', () => {
    expect(parseRenderJobSummary(renderJobBody())).toEqual({
      id: 21,
      shotId: 5,
      renderType: 'image',
      model: 'huayu-image4',
      status: 3,
      error: 'upstream timeout',
    })
  })

  it('maps a finished job result URL', () => {
    const body = renderJobBody()
    delete body.error
    body.result_url = 'https://cdn.example.test/x.mp4'
    const parsed = parseRenderJobSummary(body)
    expect(parsed.error).toBeUndefined()
    expect(parsed.resultUrl).toBe('https://cdn.example.test/x.mp4')
  })

  it('refuses a non-object payload and wrong-typed optional fields', () => {
    expect(() => parseRenderJobSummary([])).toThrow(StudioClientFailure)
    const body = renderJobBody()
    body.error = 42
    expect(() => parseRenderJobSummary(body)).toThrow(/"error"/)
  })
})

describe('parseSnapshot', () => {
  it('maps the aggregate and ignores unprojected collections', () => {
    const parsed = parseSnapshot(snapshotBody())
    expect(parsed.project.publicId).toBe('pub-7')
    expect(parsed.stageTotal).toBe(8)
    expect(parsed.stageDone).toBe(3)
    expect(parsed.stages).toHaveLength(1)
    expect(parsed.stages[0]?.key).toBe('storyboard')
    expect(parsed.renderJobs).toHaveLength(1)
    expect(parsed.renderJobs[0]?.renderType).toBe('image')
  })

  it('refuses a non-object payload', () => {
    expect(() => parseSnapshot('nope')).toThrow(StudioClientFailure)
  })

  it('refuses non-array stages and render_jobs fields', () => {
    const body = snapshotBody()
    body.stages = {}
    expect(() => parseSnapshot(body)).toThrow(/stages/)
    body.stages = []
    body.render_jobs = 'nope'
    expect(() => parseSnapshot(body)).toThrow(/render_jobs/)
  })
})

describe('parseProjectPage', () => {
  it('maps the page envelope and every item', () => {
    const parsed = parseProjectPage({
      page: 1, page_size: 20, total: 2, items: [projectBody(), projectBody()],
    })
    expect(parsed.page).toBe(1)
    expect(parsed.pageSize).toBe(20)
    expect(parsed.total).toBe(2)
    expect(parsed.items).toHaveLength(2)
    expect(parsed.items[0]?.publicId).toBe('pub-7')
  })

  it('refuses a non-object payload or a non-array items field', () => {
    expect(() => parseProjectPage(null)).toThrow(StudioClientFailure)
    expect(() => parseProjectPage({ page: 1, page_size: 20, total: 0, items: {} }))
      .toThrow(/items/)
  })
})

describe('endpoint functions', () => {
  it('fetchCapabilities parses the capabilities endpoint answer', async () => {
    const fetchImpl = cannedFetch(okEnvelope(capabilitiesBody()))
    const value = await fetchCapabilities(fetchImpl, BAIZOR_BASE_URL, 'sk')
    expect(value.schemaVersion).toBe('studio.workflow.v1')
    expect(fetchImpl.calls[0]?.url).toBe(capabilitiesUrl(BAIZOR_BASE_URL))
  })

  it('fetchProjects parses the project page answer', async () => {
    const fetchImpl = cannedFetch(okEnvelope({
      page: 2, page_size: 20, total: 21, items: [projectBody()],
    }))
    const value = await fetchProjects(fetchImpl, BAIZOR_BASE_URL, 'sk', 2, 20)
    expect(value.total).toBe(21)
    expect(fetchImpl.calls[0]?.url).toBe(projectsUrl(BAIZOR_BASE_URL, 2, 20))
  })

  it('fetchSnapshot parses the snapshot answer', async () => {
    const fetchImpl = cannedFetch(okEnvelope(snapshotBody()))
    const value = await fetchSnapshot(fetchImpl, BAIZOR_BASE_URL, 'sk', 'pub-7')
    expect(value.stages[0]?.name).toBe('分镜')
    expect(fetchImpl.calls[0]?.url).toBe(snapshotUrl(BAIZOR_BASE_URL, 'pub-7'))
  })

  it('fetchCreateAction posts the workflow body and parses the result', async () => {
    const fetchImpl = cannedFetch(okEnvelope(actionResultBody()))
    const value = await fetchCreateAction(fetchImpl, BAIZOR_BASE_URL, 'sk', 'pub-7', {
      stage: 'storyboard',
      stageAction: 'extract_shots',
      language: 'zh-CN',
      input: { script_artifact_id: 456 },
      options: { strictJson: true },
    })
    expect(value.taskId).toBe('hermes_abc')
    const init = fetchImpl.calls[0]?.init as { method?: string; body?: unknown; headers: Record<string, string> }
    expect(fetchImpl.calls[0]?.url).toBe(actionsUrl(BAIZOR_BASE_URL, 'pub-7'))
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.body).toEqual({
      schema_version: STUDIO_WORKFLOW_SCHEMA_VERSION,
      stage: 'storyboard',
      stage_action: 'extract_shots',
      language: 'zh-CN',
      input: { script_artifact_id: 456 },
      options: { strict_json: true },
    })
  })

  it('fetchTasks parses the unified task list', async () => {
    const fetchImpl = cannedFetch(okEnvelope(taskListBody()))
    const value = await fetchTasks(fetchImpl, BAIZOR_BASE_URL, 'sk', 'pub-7', 50)
    expect(value.tasks).toHaveLength(2)
    expect(fetchImpl.calls[0]?.url).toBe(tasksUrl(BAIZOR_BASE_URL, 'pub-7', 50))
  })

  it('fetchTask parses one unified task', async () => {
    const fetchImpl = cannedFetch(okEnvelope(workflowTaskBody()))
    const value = await fetchTask(fetchImpl, BAIZOR_BASE_URL, 'sk', 'pub-7', 'hermes_abc')
    expect(value.workflow?.stageAction).toBe('extract_shots')
    expect(fetchImpl.calls[0]?.url).toBe(taskUrl(BAIZOR_BASE_URL, 'pub-7', 'hermes_abc'))
  })

  it('fetchRender posts the render body and parses the batch', async () => {
    const fetchImpl = cannedFetch(okEnvelope(renderBatchBody()))
    const value = await fetchRender(fetchImpl, BAIZOR_BASE_URL, 'sk', 'pub-7', {
      shotIds: [5, 6],
      renderType: 'image',
      quoteOnly: true,
    })
    expect(value.results).toHaveLength(2)
    const init = fetchImpl.calls[0]?.init as { method?: string; body?: unknown }
    expect(fetchImpl.calls[0]?.url).toBe(renderUrl(BAIZOR_BASE_URL, 'pub-7'))
    expect(init.method).toBe('POST')
    expect(init.body).toEqual({ render_type: 'image', shots: [5, 6], quote_only: true })
  })
})

describe('studioFailureOf', () => {
  it('keeps a StudioClientFailure code and message', () => {
    const failure = new StudioClientFailure('NOT_FOUND', 'gone')
    expect(studioFailureOf(failure)).toEqual({ code: 'NOT_FOUND', message: 'gone' })
  })

  it('folds foreign errors into a transport surprise', () => {
    expect(studioFailureOf(new Error('boom')).code).toBe('TRANSPORT_ERROR')
    expect(studioFailureOf('weird')).toEqual({ code: 'TRANSPORT_ERROR', message: 'weird' })
  })
})

/** One workflow action result in wire shape. */
function actionResultBody(): Record<string, unknown> {
  return {
    schema_version: 'studio.workflow.result.v1',
    stage: 'storyboard',
    stage_action: 'extract_shots',
    status: 'queued',
    task_id: 'hermes_abc',
    data: { title: '提取分镜', workspace_mode: 'project', storage_scope: 'studio_project_7_stage_storyboard' },
    warnings: [],
  }
}

/** One workflow task view in wire shape. */
function workflowTaskBody(): Record<string, unknown> {
  return {
    task_id: 'hermes_abc',
    kind: 'workflow',
    status: 'succeeded',
    project_id: 7,
    stage: 'storyboard',
    progress: 100,
    title: '提取分镜',
    source: { hermes_task_id: 'hermes_abc' },
    workflow: {
      schema_version: 'studio.workflow.v1',
      stage: 'storyboard',
      stage_action: 'extract_shots',
      strict_json: true,
      output_json_ok: true,
    },
    result: { choices: [] },
    created_at: 1754300000,
  }
}

/** One render task view in wire shape. */
function renderTaskBody(): Record<string, unknown> {
  return {
    task_id: 'render_21',
    kind: 'image_render',
    status: 'running',
    project_id: 7,
    stage: 'image_gen',
    progress: 0,
    title: '生成第 5 镜图片',
    source: { render_job_id: 21, video_history_id: 34 },
    created_at: 1754300100,
  }
}

/** One unified task list payload in wire shape. */
function taskListBody(): Record<string, unknown> {
  return { project_id: 7, total: 2, tasks: [workflowTaskBody(), renderTaskBody()] }
}

/** One render quote in wire shape. */
function quoteBody(): Record<string, unknown> {
  return {
    model: 'huayu-image4',
    render_type: 'image',
    input_mode: 'text',
    group: 'default',
    group_ratio: 1,
    estimated_quota: 500,
    estimated_usd: 0.01,
    price_source: 'model_ratio',
    confirmed: false,
  }
}

/** One batch render answer in wire shape: one quote, one failure. */
function renderBatchBody(): Record<string, unknown> {
  return {
    project_id: 7,
    render_type: 'image',
    total: 2,
    results: [
      { shot_id: 5, success: true, confirmation_required: true, quote: quoteBody() },
      { shot_id: 6, success: false, error: 'shot not found' },
    ],
  }
}

describe('workflow action URL builders', () => {
  it('builds the actions URL with the encoded project ref', () => {
    expect(actionsUrl(BAIZOR_BASE_URL, 'pub 7')).toBe(
      `${BAIZOR_BASE_URL}${STUDIO_API_PREFIX}/projects/pub%207/actions`,
    )
  })

  it('builds the tasks URL with and without a limit', () => {
    expect(tasksUrl(BAIZOR_BASE_URL, 'pub-7')).toBe(
      `${BAIZOR_BASE_URL}${STUDIO_API_PREFIX}/projects/pub-7/tasks`,
    )
    expect(tasksUrl(BAIZOR_BASE_URL, 'pub-7', 50)).toContain('tasks?limit=50')
    expect(tasksUrl(BAIZOR_BASE_URL, 'pub-7', 0)).not.toContain('limit')
  })

  it('builds the task URL with the encoded task id', () => {
    expect(taskUrl(BAIZOR_BASE_URL, 'pub-7', 'render_21')).toBe(
      `${BAIZOR_BASE_URL}${STUDIO_API_PREFIX}/projects/pub-7/tasks/render_21`,
    )
  })

  it('builds the render URL', () => {
    expect(renderUrl(BAIZOR_BASE_URL, 'pub-7')).toBe(
      `${BAIZOR_BASE_URL}${STUDIO_API_PREFIX}/projects/pub-7/render`,
    )
  })
})

describe('studioPost', () => {
  it('sends the bearer key, JSON content type, method, and body', async () => {
    const fetchImpl = cannedFetch(okEnvelope({ echoed: true }))
    const data = await studioPost(fetchImpl, actionsUrl(BAIZOR_BASE_URL, '7'), 'sk', { a: 1 })
    expect(data).toEqual({ echoed: true })
    const init = fetchImpl.calls[0]?.init as { method?: string; body?: unknown; headers: Record<string, string> }
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer sk')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.body).toEqual({ a: 1 })
  })

  it('refuses an envelope failure with the server message', async () => {
    const failure = await refusalOf(studioPost(
      cannedFetch({ status: 400, body: { success: false, message: 'bad action' } }),
      actionsUrl(BAIZOR_BASE_URL, '7'), 'sk', {},
    ))
    expect(failure.message).toContain('bad action')
  })
})

describe('workflowActionBody', () => {
  it('maps the action onto the wire contract with the owned schema version', () => {
    expect(workflowActionBody({ stage: 'storyboard', stageAction: 'extract_shots' })).toEqual({
      schema_version: STUDIO_WORKFLOW_SCHEMA_VERSION,
      stage: 'storyboard',
      stage_action: 'extract_shots',
    })
  })

  it('keeps optional language, input, and options when present', () => {
    expect(workflowActionBody({
      stage: 'script',
      stageAction: 'rewrite_script',
      language: 'zh-CN',
      input: { mode: 'replace_all' },
      options: { model: 'huayu-hermes', strictJson: false },
    })).toEqual({
      schema_version: STUDIO_WORKFLOW_SCHEMA_VERSION,
      stage: 'script',
      stage_action: 'rewrite_script',
      language: 'zh-CN',
      input: { mode: 'replace_all' },
      options: { model: 'huayu-hermes', strict_json: false },
    })
  })
})

describe('parseWorkflowActionResult', () => {
  it('maps the wire shape onto camelCase and keeps optional fields', () => {
    const value = parseWorkflowActionResult(actionResultBody())
    expect(value).toEqual({
      schemaVersion: 'studio.workflow.result.v1',
      stage: 'storyboard',
      stageAction: 'extract_shots',
      status: 'queued',
      taskId: 'hermes_abc',
      data: {
        title: '提取分镜',
        workspace_mode: 'project',
        storage_scope: 'studio_project_7_stage_storyboard',
      },
      warnings: [],
    })
  })

  it('leaves absent optional fields absent', () => {
    const value = parseWorkflowActionResult({
      schema_version: 'studio.workflow.result.v1',
      stage: 'script',
      stage_action: 'rewrite_script',
      status: 'running',
      task_id: 'hermes_def',
    })
    expect(value.artifactType).toBeUndefined()
    expect(value.artifactId).toBeUndefined()
    expect(value.data).toBeUndefined()
    expect(value.warnings).toBeUndefined()
  })

  it('refuses a non-object payload and an unknown status', async () => {
    await expect(() => parseWorkflowActionResult([])).toThrow(StudioClientFailure)
    await expect(() => parseWorkflowActionResult({ ...actionResultBody(), status: 'mystery' }))
      .toThrow(StudioClientFailure)
  })
})

describe('parseTask', () => {
  it('maps a workflow task with metadata onto camelCase', () => {
    const value = parseTask(workflowTaskBody())
    expect(value).toEqual({
      taskId: 'hermes_abc',
      kind: 'workflow',
      status: 'succeeded',
      projectId: 7,
      stage: 'storyboard',
      progress: 100,
      title: '提取分镜',
      source: { hermesTaskId: 'hermes_abc' },
      workflow: {
        schemaVersion: 'studio.workflow.v1',
        stage: 'storyboard',
        stageAction: 'extract_shots',
        strictJson: true,
        outputJsonOk: true,
      },
      result: { choices: [] },
      createdAt: 1754300000,
    })
  })

  it('maps a render task with backing record references', () => {
    const value = parseTask(renderTaskBody())
    expect(value.source).toEqual({ renderJobId: 21, videoHistoryId: 34 })
    expect(value.workflow).toBeUndefined()
    expect(value.error).toBeUndefined()
  })

  it('keeps a task error and refuses an unknown status', () => {
    expect(parseTask({ ...renderTaskBody(), status: 'failed', error: 'boom' }).error).toBe('boom')
    expect(() => parseTask({ ...renderTaskBody(), status: 'pending' })).toThrow(StudioClientFailure)
  })

  it('refuses a non-object payload and a missing source', () => {
    expect(() => parseTask('nope')).toThrow(StudioClientFailure)
    expect(() => parseTask({ ...renderTaskBody(), source: undefined })).toThrow(StudioClientFailure)
  })
})

describe('parseTaskList', () => {
  it('maps the list envelope and every task', () => {
    const value = parseTaskList(taskListBody())
    expect(value.projectId).toBe(7)
    expect(value.total).toBe(2)
    expect(value.tasks.map(task => task.kind)).toEqual(['workflow', 'image_render'])
  })

  it('refuses a non-object payload or a non-array tasks field', () => {
    expect(() => parseTaskList(null)).toThrow(StudioClientFailure)
    expect(() => parseTaskList({ project_id: 7, total: 0 })).toThrow(StudioClientFailure)
  })
})

describe('renderRequestBody', () => {
  it('maps the minimal render submission', () => {
    expect(renderRequestBody({ shotId: 5, renderType: 'video' })).toEqual({
      render_type: 'video',
      shot_id: 5,
    })
  })

  it('keeps every present field in wire shape', () => {
    expect(renderRequestBody({
      shotIds: [5, 6],
      renderType: 'video',
      model: 'minimax-h3-fast',
      promptVersionId: 9,
      imageUrl: 'https://img/first.png',
      lastImageUrl: 'https://img/last.png',
      referenceVideoUrl: 'https://vid/ref.mp4',
      inputMode: 'image',
      size: '1280x720',
      renderPlanJson: '{}',
      fallbackPrompt: 'fallback',
      riskLevel: 'low',
      force: true,
      quoteOnly: false,
      confirmed: true,
    })).toEqual({
      render_type: 'video',
      shots: [5, 6],
      model: 'minimax-h3-fast',
      prompt_version_id: 9,
      image_url: 'https://img/first.png',
      last_image_url: 'https://img/last.png',
      reference_video_url: 'https://vid/ref.mp4',
      input_mode: 'image',
      size: '1280x720',
      render_plan_json: '{}',
      fallback_prompt: 'fallback',
      risk_level: 'low',
      force: true,
      quote_only: false,
      confirmed: true,
    })
  })
})

describe('parseRenderQuote', () => {
  it('maps the wire shape onto camelCase', () => {
    expect(parseRenderQuote(quoteBody())).toEqual({
      model: 'huayu-image4',
      renderType: 'image',
      inputMode: 'text',
      group: 'default',
      groupRatio: 1,
      estimatedQuota: 500,
      estimatedUsd: 0.01,
      priceSource: 'model_ratio',
      confirmed: false,
    })
  })

  it('refuses a non-object payload and a wrong-typed field', () => {
    expect(() => parseRenderQuote(1)).toThrow(StudioClientFailure)
    expect(() => parseRenderQuote({ ...quoteBody(), confirmed: 'yes' })).toThrow(StudioClientFailure)
  })
})

describe('parseRenderItem', () => {
  it('maps a quoted outcome', () => {
    const value = parseRenderItem({ shot_id: 5, success: true, confirmation_required: true, quote: quoteBody() })
    expect(value.confirmationRequired).toBe(true)
    expect(value.quote?.estimatedQuota).toBe(500)
    expect(value.task).toBeUndefined()
  })

  it('maps a failed outcome and a confirmed outcome with a task', () => {
    expect(parseRenderItem({ shot_id: 6, success: false, error: 'shot not found' })).toEqual({
      shotId: 6,
      success: false,
      error: 'shot not found',
    })
    const confirmed = parseRenderItem({ shot_id: 5, success: true, task: renderTaskBody() })
    expect(confirmed.task?.taskId).toBe('render_21')
  })

  it('maps a skipped outcome with its existing result URL', () => {
    const value = parseRenderItem({
      shot_id: 5, success: true, skipped: true, result_url: 'https://img/done.png',
    })
    expect(value.skipped).toBe(true)
    expect(value.resultUrl).toBe('https://img/done.png')
  })
})

describe('parseRenderBatch', () => {
  it('maps the batch envelope and every per-shot outcome', () => {
    const value = parseRenderBatch(renderBatchBody())
    expect(value.projectId).toBe(7)
    expect(value.renderType).toBe('image')
    expect(value.results).toHaveLength(2)
    expect(value.results[1]?.error).toBe('shot not found')
  })

  it('refuses a non-object payload or a non-array results field', () => {
    expect(() => parseRenderBatch({})).toThrow(StudioClientFailure)
    expect(() => parseRenderBatch({ project_id: 7, render_type: 'image', total: 0 })).toThrow(StudioClientFailure)
  })
})
