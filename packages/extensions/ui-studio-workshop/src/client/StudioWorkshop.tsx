/**
 * The sidebar footer badge and its workshop panel. Opening the panel reads
 * the Studio capabilities and the project list; picking one project reads its
 * snapshot. All data arrives through the injected face; the component holds
 * only display state.
 */

import { useEffect, useState } from 'react'
import { IconQueueOutline14, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {
  StudioCapabilities, StudioClientErrorCode, StudioProjectPage, StudioRenderBatch, StudioSnapshot,
  StudioTaskList, StudioTaskStatus,
} from '@deepseek-ai/dsh-studio-client/types'
import type { StudioWorkshopFace } from './slots.ts'
import type { StudioWorkshopKey } from './locales.ts'
import css from './StudioWorkshop.module.css'

/** Full badge props composed by the sidebar footer-action slot. */
export type StudioWorkshopProps =
  PropsRuntime<'sidebar.footer.action'> & InjectFace<StudioWorkshopFace> & PropsLocale<'studioWorkshop'>

type LoadState<T> =
  | { name: 'loading' }
  | { name: 'failed'; code: StudioClientErrorCode | 'REMOTE_ERROR'; message: string }
  | { name: 'ready'; value: T }

const LOADING: LoadState<never> = { name: 'loading' }

/** Polling cadence of the unified task list while any task is active. */
const TASK_POLL_MS = 3000

/** Translation key for one stage status code. */
function stageStatusKey(status: number): StudioWorkshopKey {
  switch (status) {
    case 0: return 'snapshot.stageStatus.0'
    case 1: return 'snapshot.stageStatus.1'
    case 2: return 'snapshot.stageStatus.2'
    case 3: return 'snapshot.stageStatus.3'
    default: return 'snapshot.stageStatus.0'
  }
}

/** Translation key for one render job status code. */
function jobStatusKey(status: number): StudioWorkshopKey {
  switch (status) {
    case 1: return 'snapshot.jobStatus.1'
    case 2: return 'snapshot.jobStatus.2'
    case 3: return 'snapshot.jobStatus.3'
    default: return 'snapshot.jobStatus.1'
  }
}

/** Translation key for one unified task status. */
function taskStatusKey(status: StudioTaskStatus): StudioWorkshopKey {
  switch (status) {
    case 'queued': return 'tasks.status.queued'
    case 'running': return 'tasks.status.running'
    case 'succeeded': return 'tasks.status.succeeded'
    case 'failed': return 'tasks.status.failed'
    case 'canceled': return 'tasks.status.canceled'
  }
}

/** Translation key for one task kind; unknown kinds render verbatim. */
function taskKindKey(kind: string): StudioWorkshopKey | undefined {
  switch (kind) {
    case 'workflow': return 'tasks.kind.workflow'
    case 'image_render': return 'tasks.kind.image_render'
    case 'video_render': return 'tasks.kind.video_render'
    default: return undefined
  }
}

/** Outcome of one action or render submission. */
type SubmitState =
  | { name: 'idle' }
  | { name: 'working' }
  | { name: 'failed'; code: StudioClientErrorCode | 'REMOTE_ERROR'; message: string }

/** Action submission outcome. */
type ActionState = SubmitState | { name: 'done'; taskId: string; status: StudioTaskStatus }

/** Render submission outcome; `quoted` carries the batch awaiting confirmation. */
type RenderState =
  | SubmitState
  | { name: 'invalid' }
  | { name: 'quoted'; batch: StudioRenderBatch }
  | { name: 'done'; batch: StudioRenderBatch }

/** Parse a comma-separated shot id list; empty or non-positive entries fail. */
function parseShotIds(text: string): number[] | undefined {
  const ids = text.split(',').map(part => part.trim()).filter(part => part !== '')
    .map(part => Number(part))
  if (ids.length === 0 || ids.some(id => !Number.isInteger(id) || id <= 0)) return undefined
  return [...new Set(ids)]
}

/** Render the Studio workshop badge and its placeholder panel. */
export function StudioWorkshop({
  wide, loadCapabilities, loadProjects, loadSnapshot, createAction, loadTasks, renderShots, t,
}: StudioWorkshopProps) {
  const [open, setOpen] = useState(false)
  const [capabilities, setCapabilities] = useState<LoadState<StudioCapabilities>>(LOADING)
  const [projects, setProjects] = useState<LoadState<StudioProjectPage>>(LOADING)
  const [selectedRef, setSelectedRef] = useState<string | undefined>(undefined)
  const [snapshot, setSnapshot] = useState<LoadState<StudioSnapshot>>(LOADING)
  const [tasks, setTasks] = useState<LoadState<StudioTaskList>>(LOADING)
  const [tasksVersion, setTasksVersion] = useState(0)
  const [actionStage, setActionStage] = useState('')
  const [actionName, setActionName] = useState('')
  const [actionStrict, setActionStrict] = useState(true)
  const [actionState, setActionState] = useState<ActionState>({ name: 'idle' })
  const [renderShotIds, setRenderShotIds] = useState('')
  const [renderType, setRenderType] = useState<'image' | 'video'>('image')
  const [renderState, setRenderState] = useState<RenderState>({ name: 'idle' })

  useEffect(() => {
    if (!open) return
    let live = true
    setCapabilities(LOADING)
    setProjects(LOADING)
    void loadCapabilities().then((outcome) => {
      if (!live) return
      setCapabilities(outcome.ok
        ? { name: 'ready', value: outcome.value }
        : { name: 'failed', code: outcome.code, message: outcome.message })
    })
    void loadProjects().then((outcome) => {
      if (!live) return
      setProjects(outcome.ok
        ? { name: 'ready', value: outcome.value }
        : { name: 'failed', code: outcome.code, message: outcome.message })
    })

    return () => { live = false }
  }, [open, loadCapabilities, loadProjects])

  useEffect(() => {
    if (selectedRef === undefined) return
    let live = true
    setSnapshot(LOADING)
    void loadSnapshot(selectedRef).then((outcome) => {
      if (!live) return
      setSnapshot(outcome.ok
        ? { name: 'ready', value: outcome.value }
        : { name: 'failed', code: outcome.code, message: outcome.message })
      if (outcome.ok) setActionStage(current => current || outcome.value.stages[0]?.key || '')
    })
    return () => { live = false }
  }, [selectedRef, loadSnapshot])

  // Seed the action picker with the first advertised stage-action once the
  // capabilities answer arrives.
  useEffect(() => {
    if (capabilities.name === 'ready') {
      setActionName(current => current || capabilities.value.stageActions[0] || '')
    }
  }, [capabilities])

  // Poll the unified task list while any task is queued or running; any
  // action/render submission bumps tasksVersion to re-enter this effect.
  useEffect(() => {
    if (selectedRef === undefined) return
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async (): Promise<void> => {
      const outcome = await loadTasks(selectedRef)
      if (!live) return
      if (!outcome.ok) {
        setTasks({ name: 'failed', code: outcome.code, message: outcome.message })
        return
      }
      setTasks({ name: 'ready', value: outcome.value })
      const active = outcome.value.tasks.some(task => task.status === 'queued' || task.status === 'running')
      if (active) timer = setTimeout(() => { void poll() }, TASK_POLL_MS)
    }
    setTasks(LOADING)
    void poll()
    return () => { live = false; if (timer !== undefined) clearTimeout(timer) }
  }, [selectedRef, loadTasks, tasksVersion])

  const submitAction = async (): Promise<void> => {
    if (selectedRef === undefined || actionStage === '' || actionName === '') return
    setActionState({ name: 'working' })
    const outcome = await createAction(selectedRef, {
      stage: actionStage,
      stageAction: actionName,
      language: 'zh-CN',
      options: { strictJson: actionStrict },
    })
    if (outcome.ok) {
      setActionState({ name: 'done', taskId: outcome.value.taskId, status: outcome.value.status })
      setTasksVersion(version => version + 1)
    } else {
      setActionState({ name: 'failed', code: outcome.code, message: outcome.message })
    }
  }

  const submitRender = async (confirmed: boolean): Promise<void> => {
    if (selectedRef === undefined) return
    const shotIds = parseShotIds(renderShotIds)
    if (shotIds === undefined) {
      setRenderState({ name: 'invalid' })
      return
    }
    setRenderState({ name: 'working' })
    const outcome = await renderShots(selectedRef, confirmed
      ? { shotIds, renderType, confirmed: true }
      : { shotIds, renderType, quoteOnly: true })
    if (!outcome.ok) {
      setRenderState({ name: 'failed', code: outcome.code, message: outcome.message })
      return
    }
    if (!confirmed && outcome.value.results.some(item => item.confirmationRequired)) {
      setRenderState({ name: 'quoted', batch: outcome.value })
      return
    }
    setRenderState({ name: 'done', batch: outcome.value })
    setTasksVersion(version => version + 1)
  }

  const failureText = (code: StudioClientErrorCode | 'REMOTE_ERROR', message: string): string =>
    t(`error.${code}`, { message })

  const renderCapabilities = () => {
    if (capabilities.name === 'loading') return <p className={css.hint}>{t('panel.loading')}</p>
    if (capabilities.name === 'failed') {
      if (capabilities.code === 'NOT_LOGGED_IN') {
        return <p className={css.hint} role="status">{t('panel.notLoggedIn')}</p>
      }
      return <p className={css.failed} role="alert">{failureText(capabilities.code, capabilities.message)}</p>
    }
    const value = capabilities.value
    const degraded = value.hermes?.status === 'degraded'
    return (
      <div className={css.facts}>
        <p>{t('capabilities.serverVersion')}: {value.serverVersion}</p>
        <p>{t('capabilities.schemaVersion')}: {value.schemaVersion}</p>
        <p>{t('capabilities.stageActions', { count: value.stageActions.length })}</p>
        <p>{t('capabilities.skillStack')}: {value.skillStack.join(', ')}</p>
        <p>{t('capabilities.defaultModels', {
          chat: value.defaultChatModel,
          image: value.defaultImageModel,
          video: value.defaultVideoModel,
        })}</p>
        {degraded && <p className={css.degraded} role="alert">{t('panel.degraded')}</p>}
      </div>
    )
  }

  const renderProjects = () => {
    if (projects.name === 'loading') return <p className={css.hint}>{t('panel.loading')}</p>
    if (projects.name === 'failed') {
      if (projects.code === 'NOT_LOGGED_IN') return null
      return <p className={css.failed} role="alert">{failureText(projects.code, projects.message)}</p>
    }
    if (projects.value.items.length === 0) return <p className={css.hint}>{t('projects.empty')}</p>
    return (
      <ul className={css.projectList}>
        {projects.value.items.map(project => (
          <li key={project.id}>
            <button
              type="button"
              className={css.projectRow}
              onClick={() => {
                setSelectedRef(project.publicId)
                setActionState({ name: 'idle' })
                setRenderState({ name: 'idle' })
              }}
            >
              <span className={css.projectName}>{project.name}</span>
              <span className={css.projectMeta}>
                {project.genre}
                {project.stageTotal !== undefined && project.stageDone !== undefined
                  ? ` · ${t('projects.stageProgress', { done: project.stageDone, total: project.stageTotal })}`
                  : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  const renderSnapshot = () => {
    if (snapshot.name === 'loading') return <p className={css.hint}>{t('panel.loading')}</p>
    if (snapshot.name === 'failed') {
      return <p className={css.failed} role="alert">{failureText(snapshot.code, snapshot.message)}</p>
    }
    const value = snapshot.value
    return (
      <div>
        <h3 className={css.sectionTitle}>{t('snapshot.stages.heading')}</h3>
        <ul className={css.stageList}>
          {value.stages.map(stage => (
            <li key={stage.id} className={css.stageRow}>
              <span className={css.projectName}>{stage.name}</span>
              <span className={css.projectMeta}>
                {t(stageStatusKey(stage.status))} · {stage.doneItems}/{stage.totalItems}
              </span>
            </li>
          ))}
        </ul>
        <h3 className={css.sectionTitle}>{t('snapshot.jobs.heading')}</h3>
        {value.renderJobs.length === 0
          ? <p className={css.hint}>{t('snapshot.jobs.empty')}</p>
          : (
            <ul className={css.stageList}>
              {value.renderJobs.map(job => (
                <li key={job.id} className={css.stageRow}>
                  <span className={css.projectName}>#{job.id} {job.renderType} · {job.model}</span>
                  <span className={css.projectMeta}>
                    {t(jobStatusKey(job.status))}{job.error === undefined ? '' : ` · ${job.error}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
      </div>
    )
  }

  const renderTasks = () => {
    if (tasks.name === 'loading') return <p className={css.hint}>{t('panel.loading')}</p>
    if (tasks.name === 'failed') {
      return <p className={css.failed} role="alert">{failureText(tasks.code, tasks.message)}</p>
    }
    if (tasks.value.tasks.length === 0) return <p className={css.hint}>{t('tasks.empty')}</p>
    return (
      <ul className={css.stageList}>
        {tasks.value.tasks.map(task => (
          <li key={task.taskId} className={css.stageRow}>
            <span className={css.projectName}>{task.title}</span>
            <span className={css.projectMeta}>
              {taskKindKey(task.kind) !== undefined ? t(taskKindKey(task.kind) as StudioWorkshopKey) : task.kind}
              {' · '}{t(taskStatusKey(task.status))}
              {task.progress > 0 ? ` · ${task.progress}%` : ''}
              {task.error === undefined ? '' : ` · ${task.error}`}
            </span>
          </li>
        ))}
      </ul>
    )
  }

  const renderActionForm = () => {
    if (capabilities.name !== 'ready' || snapshot.name !== 'ready') return null
    return (
      <div className={css.form}>
        <label className={css.field}>
          <span>{t('action.stage')}</span>
          <select value={actionStage} onChange={(event) => { setActionStage(event.target.value) }}>
            {snapshot.value.stages.map(stage => (
              <option key={stage.key} value={stage.key}>{stage.name}</option>
            ))}
          </select>
        </label>
        <label className={css.field}>
          <span>{t('action.stageAction')}</span>
          <select value={actionName} onChange={(event) => { setActionName(event.target.value) }}>
            {capabilities.value.stageActions.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className={css.fieldInline}>
          <input
            type="checkbox"
            checked={actionStrict}
            onChange={(event) => { setActionStrict(event.target.checked) }}
          />
          <span>{t('action.strictJson')}</span>
        </label>
        <button
          type="button"
          className={css.submit}
          disabled={actionState.name === 'working' || actionStage === '' || actionName === ''}
          onClick={() => { void submitAction() }}
        >
          {actionState.name === 'working' ? t('action.submitting') : t('action.submit')}
        </button>
        {actionState.name === 'done' && (
          <p className={css.hint} role="status">
            {t('action.created', { taskId: actionState.taskId, status: t(taskStatusKey(actionState.status)) })}
          </p>
        )}
        {actionState.name === 'failed' && (
          <p className={css.failed} role="alert">{failureText(actionState.code, actionState.message)}</p>
        )}
      </div>
    )
  }

  const renderRenderForm = () => {
    const batch = renderState.name === 'quoted' || renderState.name === 'done' ? renderState.batch : undefined
    return (
      <div className={css.form}>
        <label className={css.field}>
          <span>{t('render.shotIds')}</span>
          <input
            type="text"
            value={renderShotIds}
            onChange={(event) => { setRenderShotIds(event.target.value) }}
            placeholder="5, 6"
          />
        </label>
        <label className={css.field}>
          <span>{t('render.heading')}</span>
          <select
            value={renderType}
            onChange={(event) => { setRenderType(event.target.value === 'video' ? 'video' : 'image') }}
          >
            <option value="image">{t('render.type.image')}</option>
            <option value="video">{t('render.type.video')}</option>
          </select>
        </label>
        <div className={css.buttonRow}>
          <button
            type="button"
            className={css.submit}
            disabled={renderState.name === 'working'}
            onClick={() => { void submitRender(false) }}
          >
            {renderState.name === 'working' ? t('render.working') : t('render.quote')}
          </button>
          {renderState.name === 'quoted' && (
            <button
              type="button"
              className={css.submit}
              onClick={() => { void submitRender(true) }}
            >
              {t('render.confirm')}
            </button>
          )}
        </div>
        {renderState.name === 'invalid' && (
          <p className={css.failed} role="alert">{t('render.invalidShots')}</p>
        )}
        {renderState.name === 'failed' && (
          <p className={css.failed} role="alert">{failureText(renderState.code, renderState.message)}</p>
        )}
        {batch !== undefined && (
          <ul className={css.stageList}>
            {batch.results.map(item => (
              <li key={item.shotId} className={css.stageRow}>
                <span className={item.error === undefined ? css.projectMeta : css.failed}>
                  {item.error !== undefined
                    ? `#${item.shotId} ${item.error}`
                    : item.skipped === true
                      ? t('render.skipped', { shotId: item.shotId })
                      : item.task !== undefined
                        ? t('render.submitted', { shotId: item.shotId, taskId: item.task.taskId })
                        : item.quote !== undefined
                          ? t('render.quoteLine', {
                            shotId: item.shotId,
                            quota: item.quote.estimatedQuota,
                            usd: item.quote.estimatedUsd,
                          })
                          : `#${item.shotId}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className={wide ? css.layer : `${css.layer} ${css.rail}`}>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false)
          setSelectedRef(undefined)
          setActionState({ name: 'idle' })
          setRenderState({ name: 'idle' })
        }}
        title={t('panel.title')}
        closeLabel={t('panel.close')}
      >
        {selectedRef === undefined
          ? (
            <div>
              <h3 className={css.sectionTitle}>{t('capabilities.heading')}</h3>
              {renderCapabilities()}
              <h3 className={css.sectionTitle}>{t('projects.heading')}</h3>
              {renderProjects()}
            </div>
          )
          : (
            <div>
              <button type="button" className={css.back} onClick={() => { setSelectedRef(undefined) }}>
                {t('snapshot.back')}
              </button>
              {renderSnapshot()}
              <h3 className={css.sectionTitle}>{t('tasks.heading')}</h3>
              {renderTasks()}
              <h3 className={css.sectionTitle}>{t('action.heading')}</h3>
              {renderActionForm()}
              <h3 className={css.sectionTitle}>{t('render.heading')}</h3>
              {renderRenderForm()}
            </div>
          )}
      </Modal>
      <div className={css.footerButtons}>
        <button
          type="button"
          className={css.badge}
          data-studio-workshop
          aria-label={t('trigger.aria')}
          onClick={() => { setOpen(true) }}
        >
          <IconQueueOutline14 />
          {wide && <span className={css.badgeLabel}>{t('trigger')}</span>}
        </button>
      </div>
    </div>
  )
}
