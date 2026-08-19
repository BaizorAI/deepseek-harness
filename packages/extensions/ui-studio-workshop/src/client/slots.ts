/**
 * The sidebar footer-action injected face: read-only callbacks that flatten
 * the Remote envelope and the Studio refusal union into one outcome per call.
 * The component holds only display state (panel phase, per-section load
 * state, selected project).
 */

import type {
  StudioCapabilities, StudioClientErrorCode, StudioProjectPage, StudioRenderBatch,
  StudioRenderRequest, StudioSnapshot, StudioTaskList, StudioWorkflowActionRequest,
  StudioWorkflowActionResult,
} from '@deepseek-ai/dsh-studio-client/types'

/** Outcome of one flattened Studio read. */
export type StudioWorkshopOutcome<T> =
  | {
    ok: true
    /** The parsed, mapped payload. */
    value: T
  }
  | {
    ok: false
    /** Normalized failure code the panel branches on. */
    code: StudioClientErrorCode | 'REMOTE_ERROR'
    /** Human text naming the failure. */
    message: string
  }

/** Business face injected into the StudioWorkshop trigger/panel. */
export interface StudioWorkshopFace {
  /** Read the Studio server capabilities. */
  readonly loadCapabilities: () => Promise<StudioWorkshopOutcome<StudioCapabilities>>
  /** Read the first page of the caller's Studio projects. */
  readonly loadProjects: () => Promise<StudioWorkshopOutcome<StudioProjectPage>>
  /**
   * Read one project's first-screen snapshot.
   * @param projectRef - numeric project id or public share id.
   */
  readonly loadSnapshot: (projectRef: string) => Promise<StudioWorkshopOutcome<StudioSnapshot>>
  /**
   * Submit one workflow planning action of one project.
   * @param projectRef - numeric project id or public share id.
   * @param action - stage, stage-action, and optional input/options.
   */
  readonly createAction: (
    projectRef: string, action: StudioWorkflowActionRequest,
  ) => Promise<StudioWorkshopOutcome<StudioWorkflowActionResult>>
  /**
   * Read one project's unified task list.
   * @param projectRef - numeric project id or public share id.
   */
  readonly loadTasks: (projectRef: string) => Promise<StudioWorkshopOutcome<StudioTaskList>>
  /**
   * Submit one batch render of one project.
   * @param projectRef - numeric project id or public share id.
   * @param request - shot selection, render kind, and confirmation flags.
   */
  readonly renderShots: (
    projectRef: string, request: StudioRenderRequest,
  ) => Promise<StudioWorkshopOutcome<StudioRenderBatch>>
}
