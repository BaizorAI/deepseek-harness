/** StudioClientService host behavior: binding, credential gating, fetch wiring. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, CredentialRef, ResolvedCredential } from '@deepseek-ai/dsh-credentials'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import StudioClientService, { DEFAULT_PAGE_SIZE } from '../src/index.ts'
import { BAIZOR_BASE_URL, BAIZOR_KEY_REF, STUDIO_API_PREFIX } from '../src/client.ts'

/** In-memory credentials stub seeded from a plain record. */
class StubCredentials extends CredentialProvider {
  constructor(ctx: Context, private readonly seed: Record<string, string> = {}) {
    super(ctx)
  }

  override resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const value = this.seed[ref]
    return Promise.resolve(value === undefined || value.length === 0
      ? undefined : { value, source: 'stub' })
  }

  override describe(ref: CredentialRef): Promise<CredentialInfo> {
    const configured = this.seed[ref] !== undefined
    return Promise.resolve({ configured, ...configured ? { source: 'stub' } : {}, writable: true })
  }

  override set(): Promise<void> {
    return Promise.reject(new Error('stub credentials are read-only'))
  }

  override unset(): Promise<void> {
    return Promise.reject(new Error('stub credentials are read-only'))
  }
}

const contexts: Context[] = []

async function harness(seed: Record<string, string> = {}, baseUrl?: string): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(StubCredentials, seed)
  await ctx.plugin(StudioClientService, baseUrl === undefined ? {} : { baseUrl })
  return ctx
}

/** Stub the global fetch to answer one canned status/body pair, recording calls. */
function stubFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return { status, json: () => Promise.resolve(body) } as unknown as Response
  }))
  return calls
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

const CAPABILITIES = {
  server_version: '1.5.95',
  schema_version: 'studio.workflow.v1',
  stage_actions: ['generate_script_plan'],
  skill_stack: ['lingshu-film-studio-pipeline'],
  default_chat_model: 'huayu-hermes-max',
  default_image_model: 'huayu-image4',
  default_video_model: 'minimax-h3-fast',
  optional_video_models: [],
  hermes: { status: 'ok' },
}

describe('StudioClientService', () => {
  it('publishes the studioClient namespace with its full method set', async () => {
    const ctx = await harness()
    expect(ctx.studioClient.typertRemote.namespace).toBe('studioClient')
    expect(remoteMethods(ctx.studioClient)).toEqual([
      { method: 'capabilities', invocation: { kind: 'direct' } },
      { method: 'projects', invocation: { kind: 'direct' } },
      { method: 'snapshot', invocation: { kind: 'direct' } },
      { method: 'createAction', invocation: { kind: 'direct' } },
      { method: 'tasks', invocation: { kind: 'direct' } },
      { method: 'task', invocation: { kind: 'direct' } },
      { method: 'render', invocation: { kind: 'direct' } },
    ])
  })

  it('refuses capabilities as NOT_LOGGED_IN without a stored key', async () => {
    const ctx = await harness()
    const result = await ctx.studioClient.capabilities()
    expect(result).toEqual({
      ok: false,
      code: 'NOT_LOGGED_IN',
      message: 'no Baizor API key is stored; complete the Baizor login first',
    })
  })

  it('fetches capabilities with the stored key and answers the parsed value', async () => {
    const ctx = await harness({ [BAIZOR_KEY_REF]: 'sk-live' })
    const calls = stubFetch(200, { success: true, message: '', data: CAPABILITIES })
    const result = await ctx.studioClient.capabilities()
    expect(result).toEqual({
      ok: true,
      value: {
        serverVersion: '1.5.95',
        schemaVersion: 'studio.workflow.v1',
        stageActions: ['generate_script_plan'],
        skillStack: ['lingshu-film-studio-pipeline'],
        defaultChatModel: 'huayu-hermes-max',
        defaultImageModel: 'huayu-image4',
        defaultVideoModel: 'minimax-h3-fast',
        optionalVideoModels: [],
        hermes: { status: 'ok' },
      },
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(`${BAIZOR_BASE_URL}${STUDIO_API_PREFIX}/capabilities`)
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-live')
  })

  it('folds a server refusal into the refusal union instead of throwing', async () => {
    const ctx = await harness({ [BAIZOR_KEY_REF]: 'sk-dead' })
    stubFetch(401, { success: false, message: 'invalid token' })
    const result = await ctx.studioClient.capabilities()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('UNAUTHORIZED')
      expect(result.message).toContain('invalid token')
    }
  })

  it('lists the first project page by default and honors explicit paging', async () => {
    const ctx = await harness({ [BAIZOR_KEY_REF]: 'sk-live' })
    const calls = stubFetch(200, {
      success: true,
      message: '',
      data: { page: 1, page_size: DEFAULT_PAGE_SIZE, total: 0, items: [] },
    })
    const result = await ctx.studioClient.projects()
    expect(result).toEqual({
      ok: true,
      value: { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, items: [] },
    })
    expect(calls[0]?.url).toContain(`p=1&page_size=${DEFAULT_PAGE_SIZE}`)

    await ctx.studioClient.projects(3, 5)
    expect(calls[1]?.url).toContain('p=3&page_size=5')
  })

  it('honors a configured baseUrl override', async () => {
    const ctx = await harness({ [BAIZOR_KEY_REF]: 'sk-live' }, 'http://127.0.0.1:3000')
    const calls = stubFetch(200, { success: true, message: '', data: CAPABILITIES })
    await ctx.studioClient.capabilities()
    expect(calls[0]?.url).toBe(`http://127.0.0.1:3000${STUDIO_API_PREFIX}/capabilities`)
  })

  it('fetches a project snapshot with the stored key', async () => {
    const ctx = await harness({ [BAIZOR_KEY_REF]: 'sk-live' })
    const calls = stubFetch(200, {
      success: true,
      message: '',
      data: {
        project: {
          id: 7, public_id: 'pub-7', name: '四季有你', brief: '', genre: '', status: 1,
          style_dna: '', cover_url: '', created_at: 1, updated_at: 2,
        },
        stage_total: 1,
        stage_done: 0,
        stages: [{ id: 11, key: 'script', name: '剧本', order: 1, status: 0, total_items: 0, done_items: 0 }],
        render_jobs: [],
      },
    })
    const result = await ctx.studioClient.snapshot('pub-7')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.project.name).toBe('四季有你')
      expect(result.value.stages).toHaveLength(1)
    }
    expect(calls[0]?.url).toBe(`${BAIZOR_BASE_URL}${STUDIO_API_PREFIX}/projects/pub-7/snapshot`)
  })

  it('refuses snapshot as NOT_LOGGED_IN without a stored key', async () => {
    const ctx = await harness()
    const result = await ctx.studioClient.snapshot('pub-7')
    expect(result).toEqual({
      ok: false,
      code: 'NOT_LOGGED_IN',
      message: 'no Baizor API key is stored; complete the Baizor login first',
    })
  })

  it('posts a workflow action with the stored key and answers the parsed result', async () => {
    const ctx = await harness({ [BAIZOR_KEY_REF]: 'sk-live' })
    const calls = stubFetch(200, {
      success: true,
      message: '',
      data: {
        schema_version: 'studio.workflow.result.v1',
        stage: 'storyboard',
        stage_action: 'extract_shots',
        status: 'queued',
        task_id: 'hermes_abc',
      },
    })
    const result = await ctx.studioClient.createAction('pub-7', {
      stage: 'storyboard',
      stageAction: 'extract_shots',
      options: { strictJson: true },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.taskId).toBe('hermes_abc')
      expect(result.value.status).toBe('queued')
    }
    expect(calls[0]?.url).toBe(`${BAIZOR_BASE_URL}${STUDIO_API_PREFIX}/projects/pub-7/actions`)
    expect(calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      schema_version: 'studio.workflow.v1',
      stage: 'storyboard',
      stage_action: 'extract_shots',
      options: { strict_json: true },
    })
  })

  it('folds an action validation refusal into the refusal union', async () => {
    const ctx = await harness({ [BAIZOR_KEY_REF]: 'sk-live' })
    stubFetch(400, { success: false, message: 'unsupported stage_action' })
    const result = await ctx.studioClient.createAction('pub-7', { stage: 'x', stageAction: 'y' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('unsupported stage_action')
    }
  })

  it('lists the unified tasks of one project', async () => {
    const ctx = await harness({ [BAIZOR_KEY_REF]: 'sk-live' })
    const calls = stubFetch(200, {
      success: true,
      message: '',
      data: {
        project_id: 7,
        total: 1,
        tasks: [{
          task_id: 'render_21',
          kind: 'image_render',
          status: 'running',
          project_id: 7,
          progress: 0,
          title: '生成第 5 镜图片',
          source: { render_job_id: 21 },
          created_at: 1754300100,
        }],
      },
    })
    const result = await ctx.studioClient.tasks('pub-7')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.tasks[0]?.status).toBe('running')
    }
    expect(calls[0]?.url).toBe(`${BAIZOR_BASE_URL}${STUDIO_API_PREFIX}/projects/pub-7/tasks`)
  })

  it('fetches one unified task by id', async () => {
    const ctx = await harness({ [BAIZOR_KEY_REF]: 'sk-live' })
    const calls = stubFetch(200, {
      success: true,
      message: '',
      data: {
        task_id: 'hermes_abc',
        kind: 'workflow',
        status: 'succeeded',
        project_id: 7,
        progress: 100,
        title: '提取分镜',
        source: { hermes_task_id: 'hermes_abc' },
        created_at: 1754300000,
      },
    })
    const result = await ctx.studioClient.task('pub-7', 'hermes_abc')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.kind).toBe('workflow')
    }
    expect(calls[0]?.url).toBe(`${BAIZOR_BASE_URL}${STUDIO_API_PREFIX}/projects/pub-7/tasks/hermes_abc`)
  })

  it('posts a render batch and answers the per-shot outcomes', async () => {
    const ctx = await harness({ [BAIZOR_KEY_REF]: 'sk-live' })
    const calls = stubFetch(200, {
      success: true,
      message: '',
      data: {
        project_id: 7,
        render_type: 'image',
        total: 1,
        results: [{
          shot_id: 5,
          success: true,
          confirmation_required: true,
          quote: {
            model: 'huayu-image4',
            render_type: 'image',
            input_mode: 'text',
            group: 'default',
            group_ratio: 1,
            estimated_quota: 500,
            estimated_usd: 0.01,
            price_source: 'model_ratio',
            confirmed: false,
          },
        }],
      },
    })
    const result = await ctx.studioClient.render('pub-7', {
      shotId: 5,
      renderType: 'image',
      quoteOnly: true,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.results[0]?.quote?.estimatedQuota).toBe(500)
      expect(result.value.results[0]?.confirmationRequired).toBe(true)
    }
    expect(calls[0]?.url).toBe(`${BAIZOR_BASE_URL}${STUDIO_API_PREFIX}/projects/pub-7/render`)
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      render_type: 'image',
      shot_id: 5,
      quote_only: true,
    })
  })

  it('refuses render as NOT_LOGGED_IN without a stored key', async () => {
    const ctx = await harness()
    const result = await ctx.studioClient.render('pub-7', { shotId: 5, renderType: 'image' })
    expect(result).toEqual({
      ok: false,
      code: 'NOT_LOGGED_IN',
      message: 'no Baizor API key is stored; complete the Baizor login first',
    })
  })
})
