/**
 * Baizor Studio client, host half: typed access to the new-api Studio Client
 * API (`/api/studio/client`), exposed to the browser through the Typert
 * Remote namespace `studioClient`. The Baizor API key is resolved from the
 * credential store per call and never crosses the wire to the browser.
 * @module @deepseek-ai/dsh-studio-client
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  BAIZOR_BASE_URL, BAIZOR_KEY_REF, fetchCapabilities, fetchCreateAction, fetchProjects, fetchRender,
  fetchSnapshot, fetchTask, fetchTasks, studioFailureOf,
} from './client.ts'
import type { StudioFetch, StudioFetchResponse } from './client.ts'
import type {
  StudioCapabilities, StudioClientResult, StudioProjectPage, StudioRenderBatch, StudioRenderRequest,
  StudioSnapshot, StudioTask, StudioTaskList, StudioWorkflowActionRequest, StudioWorkflowActionResult,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Typed Baizor Studio client over the credential-store key. */
    studioClient: StudioClientService
  }
}

/** Plugin config; the schema also drives the configuration catalog. */
export interface Config {
  /** Studio API origin (default `https://baizor.com`). */
  baseUrl?: string
}

/** Config validator. */
export const Config: z<Config> = z.object({
  baseUrl: z.string().min(1).default(BAIZOR_BASE_URL),
})

/** Default page size for the project list. */
export const DEFAULT_PAGE_SIZE = 20

/** Browser-facing Studio client lifecycle. */
export class StudioClientService extends TypertRemoteService {
  static inject = ['credentials']

  static Config = Config

  private readonly credentials: CredentialProvider | undefined
  private readonly baseUrl: string

  constructor(ctx: Context, config: Config) {
    super(ctx, 'studioClient')
    this.credentials = ctx.get('credentials')
    this.baseUrl = config.baseUrl ?? BAIZOR_BASE_URL
  }

  /**
   * Fetch the Studio server capabilities: workflow schema id, stage-action
   * allowlist, lingshu skill stack, default models, and the verbatim Hermes
   * health projection.
   * @returns the parsed capabilities, or a refusal naming the failure.
   */
  @Remote('capabilities')
  async capabilities(): Promise<StudioClientResult<StudioCapabilities>> {
    return await this.call(apiKey => fetchCapabilities(this.fetchJson, this.baseUrl, apiKey))
  }

  /**
   * Fetch one page of the caller's Studio projects.
   * @param page - 1-based page number (default 1).
   * @param pageSize - projects per page (default {@link DEFAULT_PAGE_SIZE}).
   * @returns the parsed page, or a refusal naming the failure.
   */
  @Remote('projects')
  async projects(page?: number, pageSize?: number): Promise<StudioClientResult<StudioProjectPage>> {
    const resolvedPage = page ?? 1
    const resolvedPageSize = pageSize ?? DEFAULT_PAGE_SIZE
    return await this.call(
      apiKey => fetchProjects(this.fetchJson, this.baseUrl, apiKey, resolvedPage, resolvedPageSize),
    )
  }

  /**
   * Fetch the first-screen snapshot of one project: the project, its stages,
   * and its render jobs in a single payload.
   * @param projectRef - numeric project id or public share id.
   * @returns the parsed snapshot, or a refusal naming the failure.
   */
  @Remote('snapshot')
  async snapshot(projectRef: string): Promise<StudioClientResult<StudioSnapshot>> {
    return await this.call(apiKey => fetchSnapshot(this.fetchJson, this.baseUrl, apiKey, projectRef))
  }

  /**
   * Submit one workflow planning action of one project. The server injects
   * the Hermes execution details (active skill, skill stack, storage scope);
   * the caller only names the business action.
   * @param projectRef - numeric project id or public share id.
   * @param action - stage, stage-action, and optional input/options.
   * @returns the action result carrying the created task id, or a refusal.
   */
  @Remote('createAction')
  async createAction(
    projectRef: string, action: StudioWorkflowActionRequest,
  ): Promise<StudioClientResult<StudioWorkflowActionResult>> {
    return await this.call(
      apiKey => fetchCreateAction(this.fetchJson, this.baseUrl, apiKey, projectRef, action),
    )
  }

  /**
   * Fetch the unified task list of one project, aggregating workflow tasks
   * and render jobs onto one status vocabulary.
   * @param projectRef - numeric project id or public share id.
   * @param limit - maximum task count; the server default applies while absent.
   * @returns the parsed task list, or a refusal naming the failure.
   */
  @Remote('tasks')
  async tasks(projectRef: string, limit?: number): Promise<StudioClientResult<StudioTaskList>> {
    return await this.call(apiKey => fetchTasks(this.fetchJson, this.baseUrl, apiKey, projectRef, limit))
  }

  /**
   * Fetch one unified task of one project.
   * @param projectRef - numeric project id or public share id.
   * @param taskId - unified task id (`hermes_...` or `render_<id>`).
   * @returns the parsed task, or a refusal naming the failure.
   */
  @Remote('task')
  async task(projectRef: string, taskId: string): Promise<StudioClientResult<StudioTask>> {
    return await this.call(apiKey => fetchTask(this.fetchJson, this.baseUrl, apiKey, projectRef, taskId))
  }

  /**
   * Submit one batch render of one project. Unconfirmed submissions answer
   * per-shot quotes; confirmed submissions create render jobs and answer
   * their unified task views.
   * @param projectRef - numeric project id or public share id.
   * @param request - shot selection, render kind, and confirmation flags.
   * @returns the parsed per-shot outcomes, or a refusal naming the failure.
   */
  @Remote('render')
  async render(
    projectRef: string, request: StudioRenderRequest,
  ): Promise<StudioClientResult<StudioRenderBatch>> {
    return await this.call(
      apiKey => fetchRender(this.fetchJson, this.baseUrl, apiKey, projectRef, request),
    )
  }

  /**
   * Resolve the stored Baizor key and run one endpoint call, folding every
   * failure into the refusal union so nothing throws across the wire.
   */
  private async call<T>(run: (apiKey: string) => Promise<T>): Promise<StudioClientResult<T>> {
    if (this.credentials === undefined) {
      return { ok: false, code: 'NOT_LOGGED_IN', message: 'studio client needs a credentials provider' }
    }
    const resolved = await this.credentials.resolve(credentialRef(BAIZOR_KEY_REF))
    if (resolved === undefined) {
      return {
        ok: false,
        code: 'NOT_LOGGED_IN',
        message: 'no Baizor API key is stored; complete the Baizor login first',
      }
    }
    try {
      return { ok: true, value: await run(resolved.value) }
    } catch (error) {
      return { ok: false, ...studioFailureOf(error) }
    }
  }

  /** Production fetch seam over the global fetch; reads it per call so tests may stub it. */
  private readonly fetchJson: StudioFetch = async (url, init): Promise<StudioFetchResponse> => {
    const requestInit: RequestInit = { method: init.method ?? 'GET', headers: init.headers }
    if (init.body !== undefined) requestInit.body = JSON.stringify(init.body)
    const response = await fetch(url, requestInit)
    const body: unknown = await response.json().catch(() => undefined)
    return { status: response.status, body }
  }
}

export default StudioClientService
