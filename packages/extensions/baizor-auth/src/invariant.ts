/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-baizor-auth`.
 * @module @deepseek-ai/dsh-baizor-auth/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-baizor-auth'

/** Cordis companion plugin name. */
export const name = 'baizor-auth-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the login flow owns no durable event sequence or
 * mutable data relation —the settings and credential writes are committed
 * by the owning seams, whose events this package neither re-emits nor
 * stores, and the one-flight state is process-local by design.
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
