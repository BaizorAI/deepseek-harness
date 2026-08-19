/**
 * Baizor AI login browser half: a sidebar footer action above Settings whose
 * badge starts the host device flow, opens baizor.com in a new tab, and waits
 * on the host poll. All settings and credential writes happen in the host
 * baizorAuth Remote; this half owns only dialog display state.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { BaizorLogin } from './BaizorLogin.tsx'
import type { BaizorLoginFace, BaizorLoginRun } from './slots.ts'
import { en, NS, zh } from './locales.ts'

export type { BaizorLoginFace, BaizorLoginRun } from './slots.ts'
export type { BaizorLoginKey } from './locales.ts'

/** Required services for the sidebar footer action and the baizorAuth Remote. */
export const inject = ['slots', 'locale', 'remote', 'remote.baizorAuth', 'remote.studioClient']

/** Mount the Baizor login badge above Settings in the sidebar footer. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-baizor-login: dictionaries')

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'baizor-login',
    locale: NS,
    inject: (): BaizorLoginFace => ({
      run: async (): Promise<BaizorLoginRun> => {
        const started = await ctx.remote.baizorAuth.start()
        if (!started.ok) {
          return {
            direction: { ok: false, message: `${started.error.code}: ${started.error.message}` },
            settle: Promise.resolve({ ok: false, message: started.error.message }),
          }
        }
        const direction = started.value
        if (!direction.ok) {
          return {
            direction: { ok: false, message: direction.message },
            settle: Promise.resolve({ ok: false, message: direction.message }),
          }
        }
        window.open(direction.loginUrl, '_blank', 'noopener,noreferrer')
        const answered = ctx.remote.baizorAuth.finish()
        return {
          direction: {
            ok: true,
            loginUrl: direction.loginUrl,
            timeoutMs: direction.loginTimeoutMs,
          },
          settle: answered.then((result) => {
            const outcome = result.ok ? result.value : { ok: false as const, message: result.error.message }
            if (outcome.ok) {
              // Advisory Studio capability probe: warms the workshop surface and
              // surfaces an unavailable Studio early. The login outcome never
              // depends on it, so a refusal or a transport failure stays silent.
              void ctx.remote.studioClient.capabilities().then(
                () => undefined,
                () => undefined,
              )
            }
            return outcome
          }),
        }
      },
    }),
  }, BaizorLogin))
}
