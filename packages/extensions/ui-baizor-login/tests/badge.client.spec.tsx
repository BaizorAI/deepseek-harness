// @vitest-environment jsdom
/**
 * Local DOM snapshot of the Baizor login badge through the real slot assembly
 * path: SlotTestRuntime mounts the package apply, the auto frame supplies the
 * footer owner share, and the snapshot captures the badge plus the modal
 * phases the host poll drives.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, waitFor } from '@testing-library/react'
import { SlotTestRuntime, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-baizor-login/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { BaizorLoginResult, BaizorLoginStart } from '@deepseek-ai/dsh-baizor-auth/types'

usePinnedBrowserLanguages('zh-CN')

afterEach(cleanup)

async function bench() {
  const runtime = await SlotTestRuntime.create()
  const settle = new Promise<{ ok: true }>(() => {})
  const namespace = {
    start: vi.fn<() => Promise<RemoteResult<BaizorLoginStart>>>(async () => ({
      ok: true,
      value: { ok: true, loginUrl: 'https://baizor.com/code/token?token=t', pollIntervalMs: 2000, loginTimeoutMs: 300_000 },
    })),
    finish: vi.fn<() => Promise<RemoteResult<BaizorLoginResult>>>(async () => ({ ok: true, value: await settle })),
  }
  runtime.provide('remote', { baizorAuth: namespace, $on: () => () => {} })
  runtime.provide('remote.baizorAuth', namespace)
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.provide('locale', locale)
  runtime.slots.installLocale(locale)
  await runtime.declare({ 'sidebar.footer.action': { kind: 'list', scope: 'root' } })
  await runtime.mount({ inject: [...inject], apply })
  return { runtime, namespace }
}

describe('Baizor login badge', () => {
  it('renders the wide badge above Settings in the default zh locale', async () => {
    const { runtime } = await bench()
    const slot = runtime.renderSlot('sidebar.footer.action', { wide: true })
    expect(slot.view.getByRole('button', { name: '白泽AI登录（Baizor AI Login）' })).toBeTruthy()
    expect(slot.container).toMatchSnapshot()
    await runtime.dispose()
  })

  it('opens the browser page, shows the countdown dialog, and settles to done', async () => {
    const { runtime, namespace } = await bench()
    const open = vi.fn(() => null)
    Object.defineProperty(window, 'open', { configurable: true, value: open })
    const slot = runtime.renderSlot('sidebar.footer.action', { wide: true })
    await act(async () => {
      slot.view.getByRole('button', { name: '白泽AI登录（Baizor AI Login）' }).click()
    })
    expect(namespace.start).toHaveBeenCalledOnce()
    await waitFor(() => expect(namespace.finish).toHaveBeenCalledOnce())
    expect(open).toHaveBeenCalledWith('https://baizor.com/code/token?token=t', '_blank', 'noopener,noreferrer')
    expect(screen.getByRole('dialog', { name: '白泽 AI 登录' })).toBeTruthy()
    expect(screen.getByText(/等待浏览器授权/)).toBeTruthy()
    await runtime.dispose()
  })
})
