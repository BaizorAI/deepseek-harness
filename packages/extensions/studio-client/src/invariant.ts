/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-studio-client`.
 * @module @deepseek-ai/dsh-studio-client/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-studio-client'

/** Cordis companion plugin name. */
export const name = 'studio-client-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the client owns no durable event sequence or mutable
 * data relation — it re-resolves the credential per call, keeps no cache, and
 * the project and capability facts it answers are server-owned reads.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
