/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-baizor-login`.
 * @module @deepseek-ai/dsh-client-ui-baizor-login/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-baizor-login'

/** Cordis companion plugin name. */
export const name = 'client-ui-baizor-login-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: one sidebar footer-action registration whose disposal
 * is owned by the slot registry, and a browser-local dialog state machine that
 * stores no durable relation. The host baizorAuth service owns every settings
 * and credential write this button drives.
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
