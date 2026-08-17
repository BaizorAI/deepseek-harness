// @vitest-environment jsdom
/** Baizor login badge registration: slot entry, injected run face, and dictionaries. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-baizor-login/client'
import { BaizorLogin } from '../src/client/BaizorLogin.tsx'
import type { BaizorLoginFace } from '../src/client/slots.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { BaizorLoginResult, BaizorLoginStart } from '@deepseek-ai/dsh-baizor-auth/types'

// The service reads its initial locale from the browser; these specs assert
// the shipped Chinese copy, so they state the browser they assume.
usePinnedBrowserLanguages('zh-CN')

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const namespace = {
    start: vi.fn<() => Promise<RemoteResult<BaizorLoginStart>>>(async () => ({ ok: true, value: { ok: true, loginUrl: 'https://baizor.com/code/token?token=t', pollIntervalMs: 2000, loginTimeoutMs: 300_000 } })),
    finish: vi.fn<() => Promise<RemoteResult<BaizorLoginResult>>>(async () => ({ ok: true, value: { ok: true } })),
  }
  ctx.provide('remote', { baizorAuth: namespace, $on: () => () => {} })
  ctx.provide('remote.baizorAuth', namespace)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const slots = ctx.get('slots') as SlotRegistry
  if (declare) {
    slots.register({
      name: 'root',
      children: { 'sidebar.footer.action': { kind: 'list', scope: 'root' } },
    } as never, () => null)
  }
  const open = vi.fn(() => null)
  Object.defineProperty(window, 'open', { configurable: true, value: open })
  return { ctx, slots, namespace, open }
}

describe('ui-baizor-login apply', () => {
  it('declares only the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.baizorAuth'])
  })

  it('registers the badge above Settings as a sidebar footer action', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const entries = b.slots.entries('sidebar.footer.action')
    expect(entries).toHaveLength(1)
    expect(entries[0]!.component).toBe(BaizorLogin)
    expect(entries[0]!.options).toMatchObject({ id: 'baizor-login' })
    expect(entries[0]!.locale).toBe('baizorLogin')
    expect(b.ctx.locale.bind('baizorLogin')('trigger')).toBe('白泽AI登录')
    expect(b.ctx.locale.bind('baizorLogin')('panel.waiting', { seconds: 7 })).toBe('等待浏览器授权……剩余 7 秒')
  })

  it('waits for a live owner declaration without registering', async () => {
    const b = await bench(false)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries('sidebar.footer.action')).toHaveLength(0)
    b.slots.register({
      name: 'root',
      children: { 'sidebar.footer.action': { kind: 'list', scope: 'root' } },
    } as never, () => null)
    await Promise.resolve()
    expect(b.slots.entries('sidebar.footer.action')).toHaveLength(1)
  })

  it('run opens the host login page in a new tab and settles with the poll result', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const face = (b.slots.entries('sidebar.footer.action')[0]!.inject as unknown as () => BaizorLoginFace)()
    const flow = await face.run()
    expect(b.namespace.start).toHaveBeenCalledOnce()
    expect(b.namespace.finish).toHaveBeenCalledOnce()
    expect(b.open).toHaveBeenCalledWith('https://baizor.com/code/token?token=t', '_blank', 'noopener,noreferrer')
    expect(flow.direction).toEqual({
      ok: true,
      loginUrl: 'https://baizor.com/code/token?token=t',
      timeoutMs: 300_000,
    })
    await expect(flow.settle).resolves.toEqual({ ok: true })
  })

  it('run reports a refused start without opening a tab or polling', async () => {
    const b = await bench()
    b.namespace.start.mockResolvedValue({ ok: false, error: { code: 'E_BUSY', message: 'a Baizor login is already running', details: {} } })
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const face = (b.slots.entries('sidebar.footer.action')[0]!.inject as unknown as () => BaizorLoginFace)()
    const flow = await face.run()
    expect(flow.direction).toEqual({ ok: false, message: 'E_BUSY: a Baizor login is already running' })
    expect(b.open).not.toHaveBeenCalled()
    expect(b.namespace.finish).not.toHaveBeenCalled()
    await expect(flow.settle).resolves.toEqual({ ok: false, message: 'a Baizor login is already running' })
  })

  it('removes the entry and dictionaries with the fiber', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await fiber.dispose()
    expect(b.slots.entries('sidebar.footer.action')).toHaveLength(0)
    expect(() => b.ctx.locale.register('baizorLogin', 'zh', {})).not.toThrow()
  })
})
