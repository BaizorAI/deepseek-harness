/**
 * Baizor login device flow and settings application, host half.
 *
 * The flow mirrors the baizor.com CLI contract: mint a random device token,
 * hand the browser a `/code/token` URL carrying it, then poll
 * `/api/cli/poll` until the server answers `done` with the issued key. The
 * module carries no secrets in its own state; the poll result lives in the
 * caller's one-flight registry for the width of the login.
 * @module @deepseek-ai/dsh-baizor-auth/login
 */

import { randomUUID } from 'node:crypto'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { AgentDefaultModelConfig } from '@deepseek-ai/dsh-agent-default-model'
import type { BaizorLoginReceipt, BaizorModelInfo, LoginTimer } from './types.ts'

/** The baizor.com device-flow origin the browser URL and poll target share. */
export const BAIZOR_BASE_URL = 'https://baizor.com'

/** Base of the OpenAI-compatible inference endpoint the provider profile names. */
export const BAIZOR_INFERENCE_BASE_URL = `${BAIZOR_BASE_URL}/v1`

/** Conventional credential reference the profile records; the key never enters the settings document. */
export const BAIZOR_KEY_REF = 'BAIZORAI_API_KEY'

/** Provider route id the login flow owns. */
export const BAIZOR_PROVIDER_ROUTE = 'baizorai'

/** Default poll cadence: every two seconds, five minutes total. */
export const DEFAULT_LOGIN_TIMER: LoginTimer = { intervalMs: 2000, timeoutMs: 300_000 }

/** Minimal request surface the poll loop needs. */
export interface LoginFetch {
  /** GET one URL; rejects on transport failure. */
  (url: string, signal: AbortSignal): Promise<unknown>
}


/** Direction the service hands the browser: the URL to open plus the token the
 * background poll loop pairs with it. */
export interface LoginDirection {
  /** Browser URL carrying the device token. */
  loginUrl: string
  /** Device token the poll URL carries back. */
  token: string
  /** Schedule the flow runs on. */
  timer: LoginTimer
}

export interface LoginTimerSource {
  interval(): number
  deadline(): number
  sleep(ms: number): Promise<void>
}

/** The production timer source over the login schedule. */
export function timerSourceOf(timer: LoginTimer): LoginTimerSource {
  return {
    interval: () => timer.intervalMs,
    deadline: () => timer.timeoutMs,
    sleep: ms => new Promise<void>(resolve => setTimeout(resolve, ms)),
  }
}

/** Poll-response envelope the server answers with. */
interface PollResponse {
  success?: boolean
  data?: {
    status?: string
    key?: string
    model?: string
    model_info?: Record<string, { context_window?: number; max_output_tokens?: number }>
  }
}

/**
 * Mint the opaque device token and the browser URL naming it.
 * @param timer - poll schedule embedded in the returned direction.
 * @returns the login URL plus the schedule the poll loop must run on.
 */
export function loginDirection(timer: LoginTimer = DEFAULT_LOGIN_TIMER): LoginDirection {
  const token = randomUUID().replaceAll('-', '')
  return {
    loginUrl: `${BAIZOR_BASE_URL}/code/token?token=${token}`,
    token,
    timer: { intervalMs: timer.intervalMs, timeoutMs: timer.timeoutMs },
  }
}

/**
 * Whether a poll body is the completed login the flow waits for.
 * @param body - decoded JSON answer.
 * @returns the receipt when the server answered done with a key.
 */
export function parsePoll(body: unknown): BaizorLoginReceipt | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const response = body as PollResponse
  if (response.success !== true) return undefined
  const data = response.data
  if (data === undefined || data.status !== 'done') return undefined
  const apiKey = data.key
  if (apiKey === undefined || apiKey === '') return undefined
  const validCapacity = (value: unknown): value is number => typeof value === 'number'
    && Number.isInteger(value) && value > 0
  const modelInfo: Record<string, BaizorModelInfo> = {}
  for (const [name, info] of Object.entries(data.model_info ?? {})) {
    const entry: BaizorModelInfo = {}
    if (validCapacity(info?.context_window)) entry.contextWindow = info.context_window
    if (validCapacity(info?.max_output_tokens)) entry.maxTokens = info.max_output_tokens
    if (Object.keys(entry).length > 0) modelInfo[name] = entry
  }
  return {
    apiKey,
    ...(data.model === undefined || data.model === '' ? {} : { defaultModel: data.model }),
    modelInfo,
  }
}

/**
 * Poll the baizor.com device-flow endpoint until it answers or the schedule
 * expires. Attempts run back-to-back paced by the interval; one attempt's
 * abort timer is the remaining whole-flow budget, so a hung transport cannot
 * outlive the login window.
 * @param token - device token minted by {@link loginDirection}; carried on the poll URL.
 * @param timer - interval, deadline, and sleep source naming the same token.
 * @param fetchJson - transport seam; resolves the decoded JSON answer.
 * @returns the completed login receipt.
 * @throws on timeout or transport failure after the deadline.
 */
export async function pollForLogin(
  token: string,
  timer: LoginTimerSource,
  fetchJson: LoginFetch,
): Promise<BaizorLoginReceipt> {
  const pollUrl = `${BAIZOR_BASE_URL}/api/cli/poll?token=${token}`
  const deadlineMs = timer.deadline()
  let elapsed = 0
  for (;;) {
    if (elapsed >= deadlineMs) {
      throw new Error(`baizor login timed out after ${Math.floor(deadlineMs / 1000)} seconds`)
    }
    const remaining = deadlineMs - elapsed
    const controller = new AbortController()
    const timerHandle = setTimeout(() => { controller.abort() }, remaining)
    try {
      const body = await fetchJson(pollUrl, controller.signal)
      const receipt = parsePoll(body)
      if (receipt !== undefined) return receipt
    } finally {
      clearTimeout(timerHandle)
    }
    const step = timer.interval()
    elapsed += step
    await timer.sleep(step)
  }
}

/**
 * The settings namespace section the login flow writes: a hand-declared
 * OpenAI-compatible route with the server's model catalog. A pre-existing
 * `baizorai` user section keeps fields this patch does not name, while the
 * model list below replaces the stored one.
 * @param receipt - the completed login.
 * @returns the merge patch for the `llm-pi-ai` namespace.
 */
export function providerPatch(receipt: BaizorLoginReceipt): object {
  return {
    providers: {
      [BAIZOR_PROVIDER_ROUTE]: {
        displayName: 'Baizor AI',
        apiKeyEnv: BAIZOR_KEY_REF,
        api: 'openai-completions',
        baseURL: BAIZOR_INFERENCE_BASE_URL,
        models: Object.entries(receipt.modelInfo).map(([id, info]) => ({
          id,
          ...info.contextWindow === undefined ? {} : { contextWindow: info.contextWindow },
          ...info.maxTokens === undefined ? {} : { maxTokens: info.maxTokens },
        })),
      },
    },
  }
}

/** The settings face the login flow writes through: the writable flag plus the namespace update. */
export interface SettingsWriter {
  /** Whether the provider accepts user-layer writes. */
  readonly writable: boolean
  /** Merge one patch into the named namespace's user section. */
  update(ns: ReturnType<typeof settingsNamespace>, patch: object): Promise<void>
}

/**
 * Whether one settings provider can receive the login writes; a login on a
 * read-only deployment fails here instead of halfway through.
 * @param settings - the mounted settings service.
 * @returns true when the service accepts writes.
 */
export function settingsWritable(settings: SettingsWriter | undefined): settings is SettingsWriter {
  return settings !== undefined && settings.writable
}

/**
 * Apply a completed login to the harness seams: the key to the credential
 * store, the baizor route to the `llm-pi-ai` settings section, and the
 * server-selected default model to the shared Agent default. The key never
 * enters the settings document.
 * @param services - settings, credentials, and optional default-model services.
 * @param receipt - the completed login.
 */
export async function applyLogin(
  services: {
    settings: SettingsWriter
    credentials: { set(ref: ReturnType<typeof credentialRef>, value: string): Promise<void> }
    agentDefaultModel?: AgentDefaultModelConfig
  },
  receipt: BaizorLoginReceipt,
): Promise<void> {
  if (!settingsWritable(services.settings)) {
    throw new Error('baizor login needs a writable settings provider')
  }
  await services.settings.update(settingsNamespace('llm-pi-ai'), providerPatch(receipt))
  await services.credentials.set(credentialRef(BAIZOR_KEY_REF), receipt.apiKey)
  if (receipt.defaultModel !== undefined && services.agentDefaultModel !== undefined) {
    await services.agentDefaultModel.saveSelection({
      provider: BAIZOR_PROVIDER_ROUTE,
      model: receipt.defaultModel,
    })
  }
}
