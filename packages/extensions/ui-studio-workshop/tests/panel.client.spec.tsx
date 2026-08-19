// @vitest-environment jsdom
/**
 * DOM behavior of the Studio workshop panel through the real slot assembly
 * path: SlotTestRuntime mounts the package apply, the auto frame supplies the
 * footer owner share, and the specs drive the badge and panel interactions.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { SlotTestRuntime, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-studio-workshop/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  StudioCapabilities, StudioClientResult, StudioProjectPage, StudioRenderBatch, StudioSnapshot,
  StudioTask, StudioTaskList, StudioWorkflowActionRequest, StudioWorkflowActionResult,
  StudioRenderRequest,
} from '@deepseek-ai/dsh-studio-client/types'

usePinnedBrowserLanguages('zh-CN')

afterEach(cleanup)

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
  renderJobs: [{ id: 21, shotId: 5, renderType: 'image', model: 'huayu-image4', status: 2, resultUrl: 'https://cdn.example.test/x.png' }],
}

const TASK_LIST: StudioTaskList = {
  projectId: 7,
  total: 1,
  tasks: [{
    taskId: 'hermes_abc',
    kind: 'workflow',
    status: 'succeeded',
    projectId: 7,
    stage: 'storyboard',
    progress: 100,
    title: '提取分镜',
    source: { hermesTaskId: 'hermes_abc' },
    createdAt: 1754300000,
  }],
}

const ACTION_RESULT: StudioWorkflowActionResult = {
  schemaVersion: 'studio.workflow.result.v1',
  stage: 'storyboard',
  stageAction: 'extract_shots',
  status: 'queued',
  taskId: 'hermes_new',
}

const RENDER_BATCH: StudioRenderBatch = {
  projectId: 7,
  renderType: 'image',
  total: 1,
  results: [{
    shotId: 5,
    success: true,
    confirmationRequired: true,
    quote: {
      model: 'huayu-image4',
      renderType: 'image',
      inputMode: 'text',
      group: 'default',
      groupRatio: 1,
      estimatedQuota: 500,
      estimatedUsd: 0.01,
      priceSource: 'model_ratio',
      confirmed: false,
    },
  }],
}

function ok<T>(value: T): Promise<RemoteResult<StudioClientResult<T>>> {
  return Promise.resolve({ ok: true, value: { ok: true, value } })
}

interface StudioStub {
  capabilities: Mock<() => Promise<RemoteResult<StudioClientResult<StudioCapabilities>>>>
  projects: Mock<() => Promise<RemoteResult<StudioClientResult<StudioProjectPage>>>>
  snapshot: Mock<(projectRef: string) => Promise<RemoteResult<StudioClientResult<StudioSnapshot>>>>
  createAction: Mock<(
    projectRef: string, action: StudioWorkflowActionRequest,
  ) => Promise<RemoteResult<StudioClientResult<StudioWorkflowActionResult>>>>
  tasks: Mock<(projectRef: string) => Promise<RemoteResult<StudioClientResult<StudioTaskList>>>>
  task: Mock<(
    projectRef: string, taskId: string,
  ) => Promise<RemoteResult<StudioClientResult<StudioTask>>>>
  render: Mock<(
    projectRef: string, request: StudioRenderRequest,
  ) => Promise<RemoteResult<StudioClientResult<StudioRenderBatch>>>>
}

async function bench(studio?: Partial<StudioStub>) {
  const runtime = await SlotTestRuntime.create()
  const namespace: StudioStub = {
    capabilities: vi.fn<() => Promise<RemoteResult<StudioClientResult<StudioCapabilities>>>>(() => ok(CAPABILITIES)),
    projects: vi.fn<() => Promise<RemoteResult<StudioClientResult<StudioProjectPage>>>>(() => ok(PROJECT_PAGE)),
    snapshot: vi.fn<(projectRef: string) => Promise<RemoteResult<StudioClientResult<StudioSnapshot>>>>(() => ok(SNAPSHOT)),
    createAction: vi.fn<(
      projectRef: string, action: StudioWorkflowActionRequest,
    ) => Promise<RemoteResult<StudioClientResult<StudioWorkflowActionResult>>>>(() => ok(ACTION_RESULT)),
    tasks: vi.fn<(projectRef: string) => Promise<RemoteResult<StudioClientResult<StudioTaskList>>>>(() => ok(TASK_LIST)),
    task: vi.fn<(
      projectRef: string, taskId: string,
    ) => Promise<RemoteResult<StudioClientResult<StudioTask>>>>(() => ok(TASK_LIST.tasks[0]!)),
    render: vi.fn<(
      projectRef: string, request: StudioRenderRequest,
    ) => Promise<RemoteResult<StudioClientResult<StudioRenderBatch>>>>(() => ok(RENDER_BATCH)),
    ...studio,
  }
  runtime.provide('remote', { studioClient: namespace, $on: () => () => {} })
  runtime.provide('remote.studioClient', namespace)
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.provide('locale', locale)
  runtime.slots.installLocale(locale)
  await runtime.declare({ 'sidebar.footer.action': { kind: 'list', scope: 'root' } })
  await runtime.mount({ inject: [...inject], apply })
  return { runtime, namespace }
}

async function openPanel(runtime: Awaited<ReturnType<typeof bench>>['runtime']) {
  const slot = runtime.renderSlot('sidebar.footer.action', { wide: true })
  await act(async () => {
    slot.view.getByRole('button', { name: '视频工坊（Baizor Studio Workshop）' }).click()
  })
  return slot
}

describe('Studio workshop panel', () => {
  it('renders capabilities and the project list after opening', async () => {
    const { runtime } = await bench()
    await openPanel(runtime)
    await waitFor(() => { expect(screen.getByText(/1\.5\.98/)).toBeTruthy() })
    expect(screen.getByText(/2 个工作流动作/)).toBeTruthy()
    expect(screen.getByText(/lingshu-film-studio-pipeline/)).toBeTruthy()
    expect(screen.getByText('四季有你')).toBeTruthy()
    expect(screen.getByText(/阶段 3\/8/)).toBeTruthy()
    await runtime.dispose()
  })

  it('shows the not-logged-in hint when the reads refuse with NOT_LOGGED_IN', async () => {
    const { runtime } = await bench({
      capabilities: vi.fn<() => Promise<RemoteResult<StudioClientResult<StudioCapabilities>>>>(async () => ({
        ok: true,
        value: { ok: false, code: 'NOT_LOGGED_IN', message: 'no Baizor API key is stored' },
      })),
      projects: vi.fn<() => Promise<RemoteResult<StudioClientResult<StudioProjectPage>>>>(async () => ({
        ok: true,
        value: { ok: false, code: 'NOT_LOGGED_IN', message: 'no Baizor API key is stored' },
      })),
    })
    await openPanel(runtime)
    await waitFor(() => { expect(screen.getByText(/尚未登录白泽/)).toBeTruthy() })
    await runtime.dispose()
  })

  it('warns when the hermes projection reports degraded', async () => {
    const { runtime } = await bench({
      capabilities: vi.fn<() => Promise<RemoteResult<StudioClientResult<StudioCapabilities>>>>(() =>
        ok({ ...CAPABILITIES, hermes: { status: 'degraded' } })),
    })
    await openPanel(runtime)
    await waitFor(() => { expect(screen.getByText(/已降级/)).toBeTruthy() })
    await runtime.dispose()
  })

  it('opens a project snapshot with stages and render jobs, then returns', async () => {
    const { runtime, namespace } = await bench()
    await openPanel(runtime)
    await waitFor(() => { expect(screen.getByText('四季有你')).toBeTruthy() })
    await act(async () => {
      screen.getByText('四季有你').click()
    })
    await waitFor(() => { expect(screen.getAllByText('分镜').length).toBeGreaterThan(0) })
    expect(namespace.snapshot).toHaveBeenCalledWith('pub-7')
    expect(screen.getByText(/进行中 · 4\/12/)).toBeTruthy()
    expect(screen.getByText(/huayu-image4/)).toBeTruthy()
    expect(screen.getByText(/已完成/)).toBeTruthy()
    await act(async () => {
      screen.getByText('返回项目列表').click()
    })
    await waitFor(() => { expect(screen.getByText('四季有你')).toBeTruthy() })
    await runtime.dispose()
  })

  it('reports a snapshot failure with the normalized error copy', async () => {
    const { runtime } = await bench({
      snapshot: vi.fn<(projectRef: string) => Promise<RemoteResult<StudioClientResult<StudioSnapshot>>>>(async () => ({
        ok: true,
        value: { ok: false, code: 'SERVER_ERROR', message: 'boom' },
      })),
    })
    await openPanel(runtime)
    await waitFor(() => { expect(screen.getByText('四季有你')).toBeTruthy() })
    await act(async () => {
      screen.getByText('四季有你').click()
    })
    await waitFor(() => { expect(screen.getByText(/服务端错误：boom/)).toBeTruthy() })
    await runtime.dispose()
  })

  it('lists unified tasks in the project detail view', async () => {
    const { runtime, namespace } = await bench()
    await openPanel(runtime)
    await waitFor(() => { expect(screen.getByText('四季有你')).toBeTruthy() })
    await act(async () => {
      screen.getByText('四季有你').click()
    })
    await waitFor(() => { expect(screen.getByText('提取分镜')).toBeTruthy() })
    expect(namespace.tasks).toHaveBeenCalledWith('pub-7')
    expect(screen.getByText(/规划 · 成功/)).toBeTruthy()
    await runtime.dispose()
  })

  it('creates a workflow action from the detail view and reloads the tasks', async () => {
    const { runtime, namespace } = await bench()
    await openPanel(runtime)
    await waitFor(() => { expect(screen.getByText('四季有你')).toBeTruthy() })
    await act(async () => {
      screen.getByText('四季有你').click()
    })
    await waitFor(() => { expect(screen.getByText('创建规划任务')).toBeTruthy() })
    await act(async () => {
      screen.getByText('创建规划任务').click()
    })
    await waitFor(() => { expect(screen.getByText(/已创建任务 hermes_new/)).toBeTruthy() })
    expect(namespace.createAction).toHaveBeenCalledWith('pub-7', {
      stage: 'storyboard',
      stageAction: 'generate_script_plan',
      language: 'zh-CN',
      options: { strictJson: true },
    })
    expect(namespace.tasks.mock.calls.length).toBeGreaterThanOrEqual(2)
    await runtime.dispose()
  })

  it('quotes a render, then confirms it', async () => {
    const { runtime, namespace } = await bench()
    await openPanel(runtime)
    await waitFor(() => { expect(screen.getByText('四季有你')).toBeTruthy() })
    await act(async () => {
      screen.getByText('四季有你').click()
    })
    await waitFor(() => { expect(screen.getByText('询价')).toBeTruthy() })
    fireEvent.change(screen.getByPlaceholderText('5, 6'), { target: { value: '5' } })
    await act(async () => {
      screen.getByText('询价').click()
    })
    await waitFor(() => { expect(screen.getByText(/约 500 额度/)).toBeTruthy() })
    expect(namespace.render).toHaveBeenCalledWith('pub-7', {
      shotIds: [5],
      renderType: 'image',
      quoteOnly: true,
    })
    await act(async () => {
      screen.getByText('确认渲染').click()
    })
    await waitFor(() => {
      expect(namespace.render).toHaveBeenCalledWith('pub-7', {
        shotIds: [5],
        renderType: 'image',
        confirmed: true,
      })
    })
    await runtime.dispose()
  })

  it('rejects invalid shot ids without calling the server', async () => {
    const { runtime, namespace } = await bench()
    await openPanel(runtime)
    await waitFor(() => { expect(screen.getByText('四季有你')).toBeTruthy() })
    await act(async () => {
      screen.getByText('四季有你').click()
    })
    await waitFor(() => { expect(screen.getByText('询价')).toBeTruthy() })
    fireEvent.change(screen.getByPlaceholderText('5, 6'), { target: { value: 'abc' } })
    await act(async () => {
      screen.getByText('询价').click()
    })
    await waitFor(() => { expect(screen.getByText('请输入有效的镜头 ID。')).toBeTruthy() })
    expect(namespace.render).not.toHaveBeenCalled()
    await runtime.dispose()
  })

  it('polls the task list while any task is active', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const tasks = vi.fn(async () => ok({
        ...TASK_LIST,
        tasks: [{ ...TASK_LIST.tasks[0]!, status: 'running' as const, progress: 42 }],
      }))
      const { runtime } = await bench({ tasks: tasks as StudioStub['tasks'] })
      await openPanel(runtime)
      await waitFor(() => { expect(screen.getByText('四季有你')).toBeTruthy() })
      await act(async () => {
        screen.getByText('四季有你').click()
      })
      await waitFor(() => { expect(screen.getByText('提取分镜')).toBeTruthy() })
      expect(tasks).toHaveBeenCalledTimes(1)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3100)
      })
      expect(tasks.mock.calls.length).toBeGreaterThanOrEqual(2)
      await runtime.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
})
