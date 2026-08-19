// @vitest-environment jsdom
/** Studio workshop badge registration: slot entry, injected face flattening, dictionaries. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-studio-workshop/client'
import { StudioWorkshop } from '../src/client/StudioWorkshop.tsx'
import type { StudioWorkshopFace } from '../src/client/slots.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  StudioCapabilities, StudioClientResult, StudioProjectPage, StudioRenderBatch, StudioSnapshot,
  StudioTaskList, StudioWorkflowActionResult,
} from '@deepseek-ai/dsh-studio-client/types'

// The service reads its initial locale from the browser; these specs assert
// the shipped Chinese copy, so they state the browser they assume.
usePinnedBrowserLanguages('zh-CN')

const CAPABILITIES: StudioCapabilities = {
  serverVersion: '1.5.98',
  schemaVersion: 'studio.workflow.v1',
  stageActions: ['generate_script_plan', 'extract_shots'],
  skillStack: ['lingshu-film-studio-pipeline'],
  defaultChatModel: 'huayu-hermes-max',
  defaultImageModel: 'huayu-image4',
  defaultVideoModel: 'minimax-h3-fast',
  optionalVideoModels: [],
  hermes: { status: 'ok' },
}

const PROJECT_PAGE: StudioProjectPage = {
  page: 1,
  pageSize: 20,
  total: 1,
  items: [{
    id: 7,
    publicId: 'pub-7',
    name: '四季有你',
    brief: '',
    genre: 'wedding',
    status: 1,
    styleDna: '',
    coverUrl: '',
    createdAt: 1,
    updatedAt: 2,
    stageTotal: 8,
    stageDone: 3,
  }],
}

const SNAPSHOT: StudioSnapshot = {
  project: PROJECT_PAGE.items[0]!,
  stageTotal: 8,
  stageDone: 3,
  stages: [{ id: 11, key: 'storyboard', name: '分镜', order: 3, status: 1, totalItems: 12, doneItems: 4 }],
  renderJobs: [{ id: 21, shotId: 5, renderType: 'image', model: 'huayu-image4', status: 3, error: 'upstream timeout' }],
}

function ok<T>(value: T): Promise<RemoteResult<StudioClientResult<T>>> {
  return Promise.resolve({ ok: true, value: { ok: true, value } })
}

const ACTION_RESULT: StudioWorkflowActionResult = {
  schemaVersion: 'studio.workflow.result.v1',
  stage: 'storyboard',
  stageAction: 'extract_shots',
  status: 'queued',
  taskId: 'hermes_abc',
}

const TASK_LIST: StudioTaskList = {
  projectId: 7,
  total: 1,
  tasks: [{
    taskId: 'hermes_abc',
    kind: 'workflow',
    status: 'queued',
    projectId: 7,
    progress: 0,
    title: '提取分镜',
    source: { hermesTaskId: 'hermes_abc' },
    createdAt: 1754300000,
  }],
}

const RENDER_BATCH: StudioRenderBatch = {
  projectId: 7,
  renderType: 'image',
  total: 1,
  results: [{ shotId: 5, success: true, confirmationRequired: true }],
}

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const studio = {
    capabilities: vi.fn(() => ok(CAPABILITIES)),
    projects: vi.fn(() => ok(PROJECT_PAGE)),
    snapshot: vi.fn((_projectRef: string) => ok(SNAPSHOT)),
    createAction: vi.fn((_projectRef: string, _action: unknown) => ok(ACTION_RESULT)),
    tasks: vi.fn((_projectRef: string) => ok(TASK_LIST)),
    render: vi.fn((_projectRef: string, _request: unknown) => ok(RENDER_BATCH)),
  }
  ctx.provide('remote', { studioClient: studio, $on: () => () => {} })
  ctx.provide('remote.studioClient', studio)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const slots = ctx.get('slots') as SlotRegistry
  if (declare) {
    slots.register({
      name: 'root',
      children: { 'sidebar.footer.action': { kind: 'list', scope: 'root' } },
    } as never, () => null)
  }
  return { ctx, slots, studio }
}

async function faceOf(b: Awaited<ReturnType<typeof bench>>): Promise<StudioWorkshopFace> {
  await b.ctx.plugin({ inject: [...inject], apply }).await()
  const entry = b.slots.entries('sidebar.footer.action')[0]!
  return (entry.inject as unknown as () => StudioWorkshopFace)()
}

describe('ui-studio-workshop apply', () => {
  it('declares only the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.studioClient'])
  })

  it('registers the badge above Settings as a sidebar footer action', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const entries = b.slots.entries('sidebar.footer.action')
    expect(entries).toHaveLength(1)
    expect(entries[0]!.component).toBe(StudioWorkshop)
    expect(entries[0]!.options).toMatchObject({ id: 'studio-workshop' })
    expect(entries[0]!.locale).toBe('studioWorkshop')
    expect(b.ctx.locale.bind('studioWorkshop')('trigger')).toBe('视频工坊')
  })

  it('waits for a live owner declaration without registering', async () => {
    const b = await bench(false)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries('sidebar.footer.action')).toHaveLength(0)
    b.slots.register({
      name: 'root',
      children: { 'sidebar.footer.action': { kind: 'list', scope: 'root' } },
    } as never, () => null)
    await Promise.resolve()
    expect(b.slots.entries('sidebar.footer.action')).toHaveLength(1)
  })

  it('flattens the remote envelope and the studio refusal union', async () => {
    const b = await bench()
    const face = await faceOf(b)
    await expect(face.loadCapabilities()).resolves.toEqual({ ok: true, value: CAPABILITIES })
    await expect(face.loadProjects()).resolves.toEqual({ ok: true, value: PROJECT_PAGE })
    await expect(face.loadSnapshot('pub-7')).resolves.toEqual({ ok: true, value: SNAPSHOT })
    expect(b.studio.snapshot).toHaveBeenCalledWith('pub-7')
  })

  it('flattens the action, tasks, and render calls', async () => {
    const b = await bench()
    const face = await faceOf(b)
    const action = { stage: 'storyboard', stageAction: 'extract_shots' }
    await expect(face.createAction('pub-7', action)).resolves.toEqual({ ok: true, value: ACTION_RESULT })
    await expect(face.loadTasks('pub-7')).resolves.toEqual({ ok: true, value: TASK_LIST })
    const request = { shotIds: [5], renderType: 'image', quoteOnly: true }
    await expect(face.renderShots('pub-7', request)).resolves.toEqual({ ok: true, value: RENDER_BATCH })
    expect(b.studio.createAction).toHaveBeenCalledWith('pub-7', action)
    expect(b.studio.tasks).toHaveBeenCalledWith('pub-7')
    expect(b.studio.render).toHaveBeenCalledWith('pub-7', request)
  })

  it('passes a studio refusal through with its code', async () => {
    const b = await bench()
    b.studio.capabilities.mockResolvedValue({
      ok: true,
      value: { ok: false, code: 'NOT_LOGGED_IN', message: 'no Baizor API key is stored' },
    })
    const face = await faceOf(b)
    await expect(face.loadCapabilities()).resolves.toEqual({
      ok: false,
      code: 'NOT_LOGGED_IN',
      message: 'no Baizor API key is stored',
    })
  })

  it('folds a remote-layer failure into REMOTE_ERROR', async () => {
    const b = await bench()
    b.studio.projects.mockResolvedValue({
      ok: false,
      error: { code: 'E_GONE', message: 'host is down', details: {} },
    })
    const face = await faceOf(b)
    await expect(face.loadProjects()).resolves.toEqual({
      ok: false,
      code: 'REMOTE_ERROR',
      message: 'E_GONE: host is down',
    })
  })

  it('removes the entry and dictionaries with the fiber', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await fiber.dispose()
    expect(b.slots.entries('sidebar.footer.action')).toHaveLength(0)
    expect(() => b.ctx.locale.register('studioWorkshop', 'zh', {})).not.toThrow()
  })
})
