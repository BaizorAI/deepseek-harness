/**
 * Wire payload vocabulary for the Baizor login remote namespace, kept in a
 * client-safe module: types only, no runtime values.
 * @module @deepseek-ai/dsh-baizor-auth/types
 */

/** One Baizor model fact carried by the login poll. */
export interface BaizorModelInfo {
  /** Context capacity advertised by the server, in tokens. */
  contextWindow?: number
  /** Maximum output tokens advertised by the server. */
  maxTokens?: number
}

/** The server poll response mapped onto the harness vocabulary. */
export interface BaizorLoginReceipt {
  /** The issued API key; never logged and never returned to the browser. */
  apiKey: string
  /** Server-selected default model id, when the server supplied one. */
  defaultModel?: string
  /** Per-model capacity metadata, when the server supplied any. */
  modelInfo: Record<string, BaizorModelInfo>
}

/** One poll timer schedule the login flow may run on. */
export interface LoginTimer {
  /** Milliseconds between two poll attempts. */
  readonly intervalMs: number
  /** Milliseconds until the whole flow fails as timed out. */
  readonly timeoutMs: number
}

/** Accepted start outcome handed to the browser: the URL to open plus the wait schedule. */
export type BaizorLoginStart =
  | {
    ok: true
    /** Browser URL carrying the device token. */
    loginUrl: string
    /** Milliseconds between the host's poll attempts. */
    pollIntervalMs: number
    /** Milliseconds until the whole flow fails as timed out. */
    loginTimeoutMs: number
  }
  | {
    ok: false
    /** Human text naming the refusal. */
    message: string
  }

/** Result of one finished login flow, as answered to the browser. */
export type BaizorLoginResult =
  | { ok: true }
  | {
    ok: false
    /** Human text naming the failure. */
    message: string
  }
