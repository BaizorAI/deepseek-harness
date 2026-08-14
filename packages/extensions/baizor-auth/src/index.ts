/**
 * Baizor login service: one browser-login flow at a time over the baizor.com
 * device flow, exposed to the browser through the Typert Remote namespace
 * `baizorAuth`.
 * @module @deepseek-ai/dsh-baizor-auth
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: the agent-default-model Context merge behind `agentDefaultModel`.
import type {} from '@deepseek-ai/dsh-agent-default-model'
import z from '@deepseek-ai/schemastery'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { SettingsProvider } from '@deepseek-ai/dsh-settings'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { applyLogin, loginDirection, pollForLogin, timerSourceOf } from './login.ts'
import type { LoginFetch } from './login.ts'
import type { BaizorLoginReceipt, BaizorLoginResult, BaizorLoginStart, LoginTimer } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** One-flight Baizor browser-login service over the device flow. */
    baizorAuth: BaizorAuthService
  }
}

/** Default poll cadence behind the configurable schedule. */
const DEFAULT_TIMER: LoginTimer = { intervalMs: 2000, timeoutMs: 300_000 }

/** Plugin config; both bounds are validated by the same-named schema. */
export interface Config {
  /** Milliseconds between poll attempts (default 2000). */
  pollIntervalMs?: number
  /** Whole-flow timeout in milliseconds (default 300000). */
  loginTimeoutMs?: number
}

/** Config validator; the schema also drives the configuration catalog. */
export const Config: z<Config> = z.object({
  pollIntervalMs: z.number().step(1).min(1).default(DEFAULT_TIMER.intervalMs),
  loginTimeoutMs: z.number().step(1).min(1).default(DEFAULT_TIMER.timeoutMs),
})


/** Browser-facing login lifecycle. */
export class BaizorAuthService extends TypertRemoteService {
  static inject = ['settings', 'credentials', 'agentDefaultModel']

  static Config = Config

  private readonly settings: SettingsProvider | undefined
  private readonly credentials: CredentialProvider | undefined
  private readonly agentDefaultModel: Context['agentDefaultModel'] | undefined
  private readonly timer: LoginTimer
  private flight: Promise<BaizorLoginResult> | undefined
  private settled = false

  constructor(ctx: Context, config: Config) {
    super(ctx, 'baizorAuth')
    this.settings = ctx.get('settings')
    this.credentials = ctx.get('credentials')
    this.agentDefaultModel = ctx.get('agentDefaultModel')
    this.timer = {
      intervalMs: config.pollIntervalMs ?? DEFAULT_TIMER.intervalMs,
      timeoutMs: config.loginTimeoutMs ?? DEFAULT_TIMER.timeoutMs,
    }
  }

  /**
   * Begin one browser login. Opening the returned URL in a browser lets
   * baizor.com link this process to the user's account; the service then
   * polls until the server issues the key and writes it to the credential
   * store plus the `llm-pi-ai` and `agent-default-model` settings sections.
   * The API key is never returned to the browser. A second start while a
   * login is running is refused; a start after one settled replaces it.
   * @returns the URL to open and the cadence facts the dialog renders, or a
   * refusal naming the seam that is missing or busy.
   */
  @Remote('start')
  start(): BaizorLoginStart {
    if (this.flight !== undefined && !this.settled) {
      return { ok: false, message: 'a Baizor login is already running' }
    }
    if (this.settings === undefined || !this.settings.writable) {
      return { ok: false, message: 'baizor login needs a writable settings provider' }
    }
    this.settled = false
    const direction = loginDirection(this.timer)
    this.flight = this.run(direction.token, this.timer).then(
      () => {
        this.settled = true
        return { ok: true }
      },
      (error: unknown) => {
        this.settled = true
        return { ok: false, message: error instanceof Error ? error.message : String(error) }
      },
    )
    return {
      ok: true,
      loginUrl: direction.loginUrl,
      pollIntervalMs: this.timer.intervalMs,
      loginTimeoutMs: this.timer.timeoutMs,
    }
  }

  /**
   * Join the running login and answer once it settles. The settled outcome
   * stays answerable until the next start, so concurrent finishers from
   * several tabs all receive the one result.
   * @returns success, or a refusal naming a missing flow or the failure.
   */
  @Remote('finish')
  async finish(): Promise<BaizorLoginResult> {
    const flight = this.flight
    if (flight === undefined) return { ok: false, message: 'no Baizor login is running' }
    return await flight
  }

  /** Run one flow: poll in the background, then apply the receipt. */
  private async run(token: string, timer: LoginTimer): Promise<void> {
    const fetchJson: LoginFetch = async (url, signal) => {
      const response = await fetch(url, { signal })
      return await response.json()
    }
    const receipt = await pollForLogin(token, timerSourceOf(timer), fetchJson)
    await this.apply(receipt)
  }

  /** Write the receipt through the mounted seams. */
  private async apply(receipt: BaizorLoginReceipt): Promise<void> {
    if (this.settings === undefined || !this.settings.writable) {
      throw new Error('baizor login needs a writable settings provider')
    }
    if (this.credentials === undefined) {
      throw new Error('baizor login needs a credentials provider')
    }
    await applyLogin({
      settings: this.settings,
      credentials: this.credentials,
      ...this.agentDefaultModel === undefined ? {} : { agentDefaultModel: this.agentDefaultModel },
    }, receipt)
  }
}

export default BaizorAuthService
