import { describe, expect, it } from 'vitest'
import { AiError, chatModels, defaultModel, listModels, PROVIDERS, reviewWithAi } from '../../src/lib/ai'

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
    expect(await fails(() => json({}, 503))).toBe('busy')
    expect(await fails(() => json({ choices: [] }))).toBe('other')
    expect(
      await fails(() => {
        throw new TypeError('Load failed')
      }),
    ).toBe('offline')
  })

  it('stops waiting after the time limit', async () => {
    const never = (call: Call) =>
      new Promise<Response>((_, reject) => call.init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    const { fn } = fakeFetch(never)
    await expect(reviewWithAi({ provider: 'groq', key: KEY, model: 'm', instructions: 'i', data: 'd' }, fn, 20)).rejects.toMatchObject({ problem: 'timeout' })
  })
})
