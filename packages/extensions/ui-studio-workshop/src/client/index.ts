/**
 * Baizor Studio workshop browser half: a sidebar footer action that opens a
 * placeholder panel reading the studioClient host Remote — login state,
 * server capabilities, the project list, and one project's stage/render-job
 * snapshot. Every call flattens the Remote envelope and the Studio refusal
 * union into a single outcome the component renders.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { StudioClientResult } from '@deepseek-ai/dsh-studio-client/types'
import { StudioWorkshop } from './StudioWorkshop.tsx'
import type { StudioWorkshopFace, StudioWorkshopOutcome } from './slots.ts'
import { en, NS, zh } from './locales.ts'

export type { StudioWorkshopFace, StudioWorkshopOutcome } from './slots.ts'
export type { StudioWorkshopKey } from './locales.ts'

/** Required services for the sidebar footer action and the studioClient Remote. */
export const inject = ['slots', 'locale', 'remote', 'remote.studioClient']

/** Flatten the Remote envelope and the Studio refusal union into one outcome. */
async function flatten<T>(
  call: Promise<RemoteResult<StudioClientResult<T>>>,
): Promise<StudioWorkshopOutcome<T>> {
  const answered = await call
  if (!answered.ok) {
    return { ok: false, code: 'REMOTE_ERROR', message: `${answered.error.code}: ${answered.error.message}` }
  }
  return answered.value
}

/** Mount the Studio workshop badge above Settings in the sidebar footer. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-studio-workshop: dictionaries')

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'studio-workshop',
    locale: NS,
    inject: (): StudioWorkshopFace => ({
      loadCapabilities: () => flatten(ctx.remote.studioClient.capabilities()),
      loadProjects: () => flatten(ctx.remote.studioClient.projects()),
      loadSnapshot: projectRef => flatten(ctx.remote.studioClient.snapshot(projectRef)),
      createAction: (projectRef, action) => flatten(ctx.remote.studioClient.createAction(projectRef, action)),
      loadTasks: projectRef => flatten(ctx.remote.studioClient.tasks(projectRef)),
      renderShots: (projectRef, request) => flatten(ctx.remote.studioClient.render(projectRef, request)),
    }),
  }, StudioWorkshop))
}
