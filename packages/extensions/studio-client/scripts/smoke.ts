/**
 * End-to-end smoke for the Baizor Studio client against a live new-api
 * deployment: capabilities → project list → workflow action creation →
 * unified task polling until the task settles.
 *
 * Usage:
 *   BAIZORAI_API_KEY=sk-... pnpm exec tsx packages/extensions/studio-client/scripts/smoke.ts
 *
 * Environment:
 *   BAIZORAI_API_KEY      (required) API key issued by the Baizor login flow.
 *   BAIZOR_BASE_URL       (optional) defaults to https://baizor.com.
 *   STUDIO_PROJECT_REF    (optional) numeric id or public id; defaults to the
 *                         first project of the account.
 *   STUDIO_SMOKE_STAGE    (optional) workflow stage; defaults to `review` when
 *                         the project has one, else the project's first stage.
 *   STUDIO_SMOKE_ACTION   (optional) stage action; default review_render_results.
 *   STUDIO_SMOKE_TIMEOUT_MS (optional) task settle budget; default 480000.
 *
 * The action creates a real Hermes/Codex planning task on the server; the
 * first server version only creates the task and lands no business artifact.
 */
import {
  BAIZOR_BASE_URL, fetchCapabilities, fetchCreateAction, fetchProjects, fetchSnapshot, fetchTask,
  fetchTasks,
} from '../src/client.ts'
import type { StudioFetch } from '../src/client.ts'

const fetchJson: StudioFetch = async (url, init) => {
  const response = await fetch(url, {
    method: init.method ?? 'GET',
    headers: init.headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const body: unknown = await response.json().catch(() => undefined)
  return { status: response.status, body }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') {
    console.error(`smoke: ${name} is required`)
    process.exit(2)
  }
  return value
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const apiKey = requireEnv('BAIZORAI_API_KEY')
const baseUrl = process.env.BAIZOR_BASE_URL ?? BAIZOR_BASE_URL
const timeoutMs = Number(process.env.STUDIO_SMOKE_TIMEOUT_MS ?? 480_000)

console.log(`smoke: base ${baseUrl}`)

const capabilities = await fetchCapabilities(fetchJson, baseUrl, apiKey)
console.log(`smoke: capabilities ok — server ${capabilities.serverVersion}, `
  + `schema ${capabilities.schemaVersion}, ${capabilities.stageActions.length} stage actions, `
  + `hermes ${String(capabilities.hermes?.status ?? 'unknown')}`)
if (!capabilities.stageActions.includes('extract_shots')) {
  throw new Error('smoke: capabilities missing extract_shots')
}

let projectRef = process.env.STUDIO_PROJECT_REF
if (projectRef === undefined) {
  const page = await fetchProjects(fetchJson, baseUrl, apiKey, 1, 1)
  const first = page.items[0]
  if (first === undefined) {
    throw new Error('smoke: account has no Studio project; set STUDIO_PROJECT_REF')
  }
  projectRef = first.publicId
}
console.log(`smoke: project ${projectRef}`)

let stage = process.env.STUDIO_SMOKE_STAGE
if (stage === undefined) {
  const snapshot = await fetchSnapshot(fetchJson, baseUrl, apiKey, projectRef)
  stage = snapshot.stages.some(item => item.key === 'review')
    ? 'review'
    : snapshot.stages[0]?.key ?? 'script'
}
const stageAction = process.env.STUDIO_SMOKE_ACTION ?? 'review_render_results'

const action = await fetchCreateAction(fetchJson, baseUrl, apiKey, projectRef, {
  stage,
  stageAction,
  language: 'zh-CN',
  options: { strictJson: true },
})
console.log(`smoke: action accepted — task ${action.taskId} (${action.status})`)

const listed = await fetchTasks(fetchJson, baseUrl, apiKey, projectRef)
if (!listed.tasks.some(task => task.taskId === action.taskId)) {
  throw new Error(`smoke: task ${action.taskId} missing from the unified task list`)
}
console.log('smoke: task visible in the unified task list')

const deadline = Date.now() + timeoutMs
for (;;) {
  const task = await fetchTask(fetchJson, baseUrl, apiKey, projectRef, action.taskId)
  console.log(`smoke: ${task.taskId} ${task.status} ${task.progress}%`)
  if (task.status === 'succeeded') {
    console.log('smoke: PASS')
    process.exit(0)
  }
  if (task.status === 'failed' || task.status === 'canceled') {
    console.error(`smoke: task settled as ${task.status}: ${task.error ?? ''}`)
    process.exit(1)
  }
  if (Date.now() > deadline) {
    console.error(`smoke: task did not settle within ${timeoutMs}ms`)
    process.exit(1)
  }
  await sleep(5000)
}
