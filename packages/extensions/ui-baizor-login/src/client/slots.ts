/**
 * The sidebar footer-action injected face: one `run` callback that owns the
 * whole browser login conversation with the host baizorAuth Remote. The
 * component holds only display state (dialog phase, countdown, copy feedback).
 */

import type { BaizorLoginResult } from '@deepseek-ai/dsh-baizor-auth/types'

/** The direction and settlement of one started login flow. */
export interface BaizorLoginRun {
  /** Whether a flow started, and the facts the dialog renders while it waits. */
  readonly direction:
    | {
      ok: true
      /** The baizor.com login page the host expects the browser to open. */
      loginUrl: string
      /** Whole-flow timeout in milliseconds, for the countdown display. */
      timeoutMs: number
    }
    | {
      ok: false
      /** Human text naming the refusal. */
      message: string
    }
  /** Settles with the host poll outcome once the flow finishes or fails. */
  readonly settle: Promise<BaizorLoginResult>
}

/** Business face injected into the BaizorLogin trigger/dialog. */
export interface BaizorLoginFace {
  /** Begin one browser login and hand back its direction and settlement. */
  run(): Promise<BaizorLoginRun>
}
