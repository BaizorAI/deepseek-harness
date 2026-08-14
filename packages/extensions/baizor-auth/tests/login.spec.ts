/** Device-flow primitives: URL/token minting, poll parsing, and settings application. */
import { describe, expect, it, vi } from 'vitest'
import {
  applyLogin, BAIZOR_BASE_URL, BAIZOR_INFERENCE_BASE_URL, BAIZOR_KEY_REF,
  BAIZOR_PROVIDER_ROUTE, DEFAULT_LOGIN_TIMER, loginDirection, parsePoll,
  pollForLogin, providerPatch, settingsWritable, timerSourceOf,
} from '../src/login.ts'
import type { BaizorLoginReceipt } from '../src/types.ts'

/** A timer source whose interval and deadline never advance in real time. */
function instantTimer(intervalMs = 10, timeoutMs = 100): ReturnType<typeof timerSourceOf> {
  return {
    interval: () => intervalMs,
    deadline: () => timeoutMs,
    sleep: () => Promise.resolve(),
  }
}

describe('loginDirection', () => {
  it('mints an opaque token and embeds it in the baizor code URL', () => {
    const direction = loginDirection(DEFAULT_LOGIN_TIMER)
    expect(direction.loginUrl).toBe(`${BAIZOR_BASE_URL}/code/token?token=${direction.token}`)
    expect(direction.token).not.toMatch(/-/)
    expect(direction.token.length).toBe(32)
    expect(direction.timer).toEqual(DEFAULT_LOGIN_TIMER)
  })
})

describe('parsePoll', () => {
  it('reads the done answer with its capacities', () => {
    const receipt = parsePoll({
      success: true,
      data: {
        status: 'done',
        key: 'sk-test',
        model: 'baizor-flash',
        model_info: {
          'baizor-flash': { context_window: 131072, max_output_tokens: 8192 },
        },
      },
    })
    expect(receipt).toEqual({
      apiKey: 'sk-test',
      defaultModel: 'baizor-flash',
      modelInfo: { 'baizor-flash': { contextWindow: 131072, maxTokens: 8192 } },
    })
  })

  it('keeps an absent default model absent', () => {
    expect(parsePoll({ success: true, data: { status: 'done', key: 'sk-x' } }))
      .toEqual({ apiKey: 'sk-x', modelInfo: {} })
  })

  it('drops capacity entries that are not positive integers', () => {
    const receipt = parsePoll({
      success: true,
      data: {
        status: 'done',
        key: 'sk-x',
        model_info: {
          good: { context_window: 1000, max_output_tokens: 10 },
          zero: { context_window: 0 },
          broken: { max_output_tokens: -1 },
        },
      },
    })
    expect(receipt?.modelInfo).toEqual({ good: { contextWindow: 1000, maxTokens: 10 } })
  })

  it('is not done for pending, missing-key, or failure bodies', () => {
    expect(parsePoll({ success: true, data: { status: 'pending' } })).toBeUndefined()
    expect(parsePoll({ success: true, data: { status: 'done' } })).toBeUndefined()
    expect(parsePoll({ success: false })).toBeUndefined()
    expect(parsePoll('not-an-object')).toBeUndefined()
  })
})

describe('pollForLogin', () => {
  it('answers on the first attempt when the server is already done', async () => {
    const fetch = vi.fn(async (_url: string, _signal: AbortSignal) => ({ success: true, data: { status: 'done', key: 'sk-1' } }))
    const receipt = await pollForLogin('token', instantTimer(), fetch)
    expect(receipt.apiKey).toBe('sk-1')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String(fetch.mock.calls[0]?.[0])).toBe(`${BAIZOR_BASE_URL}/api/cli/poll?token=token`)
  })

  it('keeps polling until the server answers done', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ success: true, data: { status: 'pending' } })
      .mockResolvedValueOnce({ success: true, data: { status: 'pending' } })
      .mockResolvedValueOnce({ success: true, data: { status: 'done', key: 'sk-2' } })
    const receipt = await pollForLogin('token', instantTimer(), fetch)
    expect(receipt.apiKey).toBe('sk-2')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('fails once the schedule deadline passes', async () => {
    const fetch = vi.fn(async () => ({ success: true, data: { status: 'pending' } }))
    await expect(pollForLogin('token', instantTimer(10, 20), fetch))
      .rejects.toThrow('baizor login timed out')
  })
})

describe('providerPatch', () => {
  it('declares the hand-built baizor route with the server catalog', () => {
    const receipt: BaizorLoginReceipt = {
      apiKey: 'sk-3',
      defaultModel: 'baizor-flash',
      modelInfo: { 'baizor-flash': { contextWindow: 1000, maxTokens: 10 } },
    }
    expect(providerPatch(receipt)).toEqual({
      providers: {
        [BAIZOR_PROVIDER_ROUTE]: {
          displayName: 'Baizor AI',
          apiKeyEnv: BAIZOR_KEY_REF,
          api: 'openai-completions',
          baseURL: BAIZOR_INFERENCE_BASE_URL,
          models: [{ id: 'baizor-flash', contextWindow: 1000, maxTokens: 10 }],
        },
      },
    })
  })

  it('emits models without capacity facts undecorated', () => {
    const receipt: BaizorLoginReceipt = { apiKey: 'sk-4', modelInfo: { bare: {} } }
    expect(providerPatch(receipt)).toMatchObject({
      providers: { [BAIZOR_PROVIDER_ROUTE]: { models: [{ id: 'bare' }] } },
    })
  })
})

describe('settingsWritable', () => {
  it('accepts a mounted writable provider and refuses the rest', () => {
    expect(settingsWritable(undefined)).toBe(false)
    expect(settingsWritable({ writable: false } as never)).toBe(false)
    expect(settingsWritable({ writable: true } as never)).toBe(true)
  })
})

describe('applyLogin', () => {
  it('writes the key to the credential store and never into settings', async () => {
    const settings = {
      writable: true,
      update: vi.fn(async (_ns: unknown, _patch: unknown) => {}),
    }
    const credentials = { set: vi.fn(async (_ref: unknown, _value: unknown) => {}) }
    const receipt: BaizorLoginReceipt = {
      apiKey: 'sk-5',
      defaultModel: 'baizor-flash',
      modelInfo: {},
    }
    await applyLogin({ settings, credentials }, receipt)
    expect(credentials.set).toHaveBeenCalledWith(BAIZOR_KEY_REF, 'sk-5')
    expect(settings.update).toHaveBeenCalledOnce()
    expect(JSON.stringify(settings.update.mock.calls[0]![1])).not.toContain('sk-5')
  })

  it('switches the shared Agent default to the server-selected model', async () => {
    const settings = { writable: true, update: vi.fn(async () => {}) }
    const credentials = { set: vi.fn(async () => {}) }
    const saveSelection = vi.fn(async () => {})
    const receipt: BaizorLoginReceipt = {
      apiKey: 'sk-6',
      defaultModel: 'baizor-flash',
      modelInfo: {},
    }
    await applyLogin({
      settings, credentials, agentDefaultModel: { saveSelection } as never,
    }, receipt)
    expect(saveSelection).toHaveBeenCalledWith({ provider: BAIZOR_PROVIDER_ROUTE, model: 'baizor-flash' })
  })

  it('leaves the default untouched when the server named none', async () => {
    const settings = { writable: true, update: vi.fn(async () => {}) }
    const credentials = { set: vi.fn(async () => {}) }
    const saveSelection = vi.fn(async () => {})
    await applyLogin({
      settings, credentials, agentDefaultModel: { saveSelection } as never,
    }, { apiKey: 'sk-7', modelInfo: {} })
    expect(saveSelection).not.toHaveBeenCalled()
  })

  it('refuses a read-only settings provider before any write', async () => {
    const settings = { writable: false, update: vi.fn(async () => {}) }
    const credentials = { set: vi.fn(async () => {}) }
    await expect(applyLogin({ settings, credentials }, { apiKey: 'sk-8', modelInfo: {} }))
      .rejects.toThrow('writable settings provider')
    expect(settings.update).not.toHaveBeenCalled()
    expect(credentials.set).not.toHaveBeenCalled()
  })
})
