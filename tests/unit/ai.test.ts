import { describe, expect, it, vi } from 'vitest'
import { AiError, chatModels, dailyReset, defaultModel, lighterGemini, listModels, PROVIDERS, reviewWithAi } from '../../src/lib/ai'

// Review with AI (v0.12): our own small client for Groq and OpenAI (both speak the OpenAI chat format). The key is
// fake: real keys never go into the repo (the privacy scan refuses them).
const KEY = 'gsk_test_key'

interface Call {
  url: string
  init: RequestInit
}

function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fn = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(url), init }
    calls.push(call)
    return respond(call)
  }) as typeof fetch
  return { fn, calls }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('the services', () => {
  it('are Groq (free) and OpenAI (paid), each at its own address', () => {
    expect(PROVIDERS.groq).toMatchObject({ label: 'Groq', paid: false, baseUrl: 'https://api.groq.com/openai/v1' })
    expect(PROVIDERS.openai).toMatchObject({ label: 'OpenAI', paid: true, baseUrl: 'https://api.openai.com/v1' })
  })
})

describe('listModels and the default model', () => {
  it('lists the chat models your key can use, asking with the key in the header only', async () => {
    const { fn, calls } = fakeFetch(() =>
      json({ data: [{ id: 'whisper-large-v3' }, { id: 'openai/gpt-oss-120b' }, { id: 'llama-3.3-70b-versatile' }, { id: 'playai-tts' }] }),
    )
    expect(await listModels('groq', KEY, fn)).toEqual(['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'])
    expect(calls[0]?.url).toBe('https://api.groq.com/openai/v1/models')
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`)
  })

  it('picks the first preferred model you can use, or the first one listed', () => {
    expect(defaultModel('groq', ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'])).toBe('openai/gpt-oss-120b')
    expect(defaultModel('groq', ['some-new-model'])).toBe('some-new-model')
    expect(defaultModel('groq', [])).toBeNull()
    expect(chatModels(['gpt-4o-mini-transcribe', 'text-embedding-3-small', 'gpt-4.1', 'dall-e-3'])).toEqual(['gpt-4.1'])
  })
})

describe('reviewWithAi', () => {
  it('sends the instructions and your journal as a chat, and returns the answer', async () => {
    const { fn, calls } = fakeFetch(() => json({ choices: [{ message: { content: '  1. What happened: a busy week.  ' } }] }))
    const answer = await reviewWithAi({ provider: 'openai', key: KEY, model: 'gpt-4.1', instructions: 'Read my journal', data: '# My journal' }, fn)
    expect(answer).toBe('1. What happened: a busy week.')
    expect(calls[0]?.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(calls[0]?.init.method).toBe('POST')
    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>
    expect(body).toEqual({
      model: 'gpt-4.1',
      messages: [
        { role: 'system', content: 'Read my journal' },
        { role: 'user', content: '# My journal' },
      ],
    })
    expect(String(calls[0]?.init.body)).not.toContain(KEY)
  })

  const fails = async (respond: () => Response | Promise<Response>, timeoutMs?: number) => {
    const { fn } = fakeFetch(respond)
    try {
      await reviewWithAi({ provider: 'groq', key: KEY, model: 'm', instructions: 'i', data: 'd' }, fn, timeoutMs)
    } catch (error) {
      if (!(error instanceof AiError)) throw error
      expect(error.message).not.toContain(KEY)
      return error.problem
    }
    throw new Error('expected it to fail')
  }

  it('says plainly what went wrong, never repeating the key', async () => {
    expect(await fails(() => json({ error: { message: `Invalid API Key ${KEY}` } }, 401))).toBe('key')
    expect(await fails(() => json({ error: { message: 'Rate limit reached' } }, 429))).toBe('limit')
    expect(await fails(() => json({ error: { message: 'Request too large' } }, 413))).toBe('limit')
    expect(await fails(() => json({ choices: [] }))).toBe('other')
    expect(
      await fails(() => {
        throw new TypeError('Load failed')
      }),
    ).toBe('offline')
  })

  const REQUEST = { provider: 'groq' as const, key: KEY, model: 'm', instructions: 'i', data: 'd' }
  const ANSWER = { choices: [{ message: { content: 'Fine' } }] }
  /** Runs with a fake clock (no variation in the waits), moving it on by `ms` while `run` waits. */
  async function onFakeClock<T>(ms: number, run: () => Promise<T>): Promise<T> {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const result = run().catch((error: unknown) => error as T)
      await vi.advanceTimersByTimeAsync(ms)
      return await result
    } finally {
      vi.useRealTimers()
      vi.restoreAllMocks()
    }
  }

  // Owner, 2026-10-25: "Read with AI again" often said the service was busy (Google's 500 or 503: its own servers).
  it('asks a busy service again, about 2, 4 and 8 seconds apart, before saying it’s busy (Google’s advice)', async () => {
    let n = 0
    const twice = fakeFetch(() => (n++ < 2 ? json({}, 503) : json(ANSWER)))
    expect(await onFakeClock(6_100, () => reviewWithAi(REQUEST, twice.fn))).toBe('Fine')
    expect(twice.calls).toHaveLength(3)
    const always = fakeFetch(() => json({}, 500))
    expect(await onFakeClock(20_000, () => reviewWithAi(REQUEST, always.fn))).toMatchObject({ problem: 'busy', message: 'The service is busy. Try again in a minute.' })
    expect(always.calls).toHaveLength(4)
  })

  it('never asks again after a refused key, a limit or a bad answer, and stops asking at its time limit', async () => {
    for (const status of [401, 429, 400]) {
      const once = fakeFetch(() => json({}, status))
      await onFakeClock(20_000, () => reviewWithAi(REQUEST, once.fn))
      expect(once.calls).toHaveLength(1)
    }
    // With 3 seconds to answer: asked again after 2, and not after the 4 more that would pass the limit.
    const busy = fakeFetch(() => json({}, 503))
    expect(await onFakeClock(20_000, () => reviewWithAi(REQUEST, busy.fn, 3_000))).toMatchObject({ problem: 'busy' })
    expect(busy.calls).toHaveLength(2)
  })

  it('stops waiting after the time limit', async () => {
    const never = (call: Call) =>
      new Promise<Response>((_, reject) => call.init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    const { fn } = fakeFetch(never)
    await expect(reviewWithAi({ provider: 'groq', key: KEY, model: 'm', instructions: 'i', data: 'd' }, fn, 20)).rejects.toMatchObject({ problem: 'timeout' })
  })
})

describe('Gemini’s free daily limit (owner, 2026-10-26: retries kept it used up)', () => {
  // Google's refusal names the quota; read only to tell which problem it is, never shown.
  const perDay = [{ error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } }]
  const perMinute = [{ error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }] } }]
  const problem = async (body: unknown) => {
    const { fn } = fakeFetch(() => json(body, 429))
    try {
      await listModels('gemini', 'AI-test', fn)
    } catch (error) {
      return (error as AiError).problem
    }
  }
  it('tells the daily limit from the per-minute one', async () => {
    expect(await problem(perDay)).toBe('daily')
    expect(await problem(perMinute)).toBe('limit')
  })
  it('resets at midnight Pacific time, which moves with the clocks', () => {
    // 26 Oct 2026, 10:00 UK (GMT): California is still on summer time, so midnight there is 07:00 here on the 27th.
    expect(dailyReset(new Date(Date.UTC(2026, 9, 26, 10))).toISOString()).toBe('2026-10-27T07:00:00.000Z')
    // 10 Nov: both on winter time, 08:00 GMT.
    expect(dailyReset(new Date(Date.UTC(2026, 10, 10, 10))).toISOString()).toBe('2026-11-11T08:00:00.000Z')
  })
  it('reads receipts with the newest flash-lite a key lists, in place of the plain flash picked by default', () => {
    const list = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.1-flash', 'gemini-3.1-flash-lite', 'gemini-3.1-flash-lite-preview', 'gemini-2.5-pro']
    expect(lighterGemini('gemini-3.1-flash', list)).toBe('gemini-3.1-flash-lite')
    expect(lighterGemini('gemini-flash-latest', ['gemini-flash-latest', 'gemini-flash-lite-latest'])).toBe('gemini-flash-lite-latest')
    // One you chose yourself stays; with no lite listed, the one you have.
    expect(lighterGemini('gemini-2.5-pro', list)).toBe('gemini-2.5-pro')
    expect(lighterGemini('gemini-3.1-flash', ['gemini-3.1-flash'])).toBe('gemini-3.1-flash')
  })
})

describe('Gemini (v0.18), through its OpenAI-compatible address', () => {
  const GEMINI_KEY = 'AIza_test_abcd'

  it('is free to start, at its own address', () => {
    expect(PROVIDERS.gemini).toMatchObject({ label: 'Gemini', paid: false, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' })
  })

  it('lists its models by name alone, leaves out what can’t chat, and picks a fast one when none it knows is there', async () => {
    const { fn } = fakeFetch(() => json({ data: [{ id: 'models/gemini-9-pro' }, { id: 'models/gemini-9-flash' }, { id: 'models/text-embedding-005' }, { id: 'models/imagen-4' }] }))
    const models = await listModels('gemini', GEMINI_KEY, fn)
    expect(models).toEqual(['gemini-9-flash', 'gemini-9-pro'])
    expect(defaultModel('gemini', models)).toBe('gemini-9-flash')
    expect(defaultModel('gemini', ['gemini-9-pro', 'gemini-2.5-flash'])).toBe('gemini-2.5-flash')
  })

  it('picks the newest plain flash a key lists, never a -lite or -preview, so the choice keeps up as Google renames them', () => {
    // Google's Flash models in October 2026 (ai.google.dev pricing): the list named in the code had gone stale.
    const october2026 = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-flash-latest']
    expect(defaultModel('gemini', october2026)).toBe('gemini-3.8-flash')
    // Versions compare as numbers: 3.10 is newer than 3.9.
    expect(defaultModel('gemini', ['gemini-3.9-flash', 'gemini-3.10-flash', 'gemini-4-flash-preview', 'gemini-4.1-flash-lite'])).toBe('gemini-3.10-flash')
    // With no plain one, the latest alias, then any flash.
    expect(defaultModel('gemini', ['gemini-flash-latest', 'gemini-9-pro'])).toBe('gemini-flash-latest')
    expect(defaultModel('gemini', ['gemini-3-flash-preview', 'gemini-9-pro'])).toBe('gemini-3-flash-preview')
  })

  it('takes its 400 "pass a valid API key" as a refused key, in the app’s own words; another 400 stays unexpected', async () => {
    const refused = fakeFetch(() => json([{ error: { code: 400, message: 'Please pass a valid API key', status: 'INVALID_ARGUMENT' } }], 400))
    const error = await listModels('gemini', GEMINI_KEY, refused.fn).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AiError)
    expect((error as AiError).problem).toBe('key')
    expect((error as Error).message).not.toContain('valid API key')
    const other = fakeFetch(() => json({ error: { code: 400, message: 'Unknown field tools' } }, 400))
    expect(((await listModels('gemini', GEMINI_KEY, other.fn).catch((e: unknown) => e)) as AiError).problem).toBe('other')
  })
})
