import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_LLM_FALLBACK_MODELS,
  DEFAULT_LLM_MODEL,
  LLM_USER_ERROR,
  OpenRouterError,
  createOpenRouterClient,
  isLlmFailureResposta,
  parseFallbackModels,
} from './openrouter.ts'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('openrouter client', () => {
  it('defaults to Nemotron Ultra with Super-VL fallback', () => {
    assert.equal(DEFAULT_LLM_MODEL, 'nvidia/nemotron-3-ultra-550b-a55b:free')
    assert.deepEqual([...DEFAULT_LLM_FALLBACK_MODELS], [
      'nvidia/nemotron-3.5-super-vl:free',
    ])
    assert.deepEqual(parseFallbackModels(undefined), [
      'nvidia/nemotron-3.5-super-vl:free',
    ])
    assert.deepEqual(parseFallbackModels('a:free, b:free'), ['a:free', 'b:free'])
  })

  it('retries 429 with ~2s then ~6s before falling back to the next model', async () => {
    const sleeps: number[] = []
    const models: string[] = []
    let calls = 0
    let clock = 0

    const fetchImpl: typeof fetch = async (_url, init) => {
      calls += 1
      const body = JSON.parse(String(init?.body ?? '{}')) as { model: string }
      models.push(body.model)
      if (body.model === DEFAULT_LLM_MODEL) {
        return jsonResponse(429, { error: { message: 'temporarily rate-limited upstream' } })
      }
      return jsonResponse(200, {
        choices: [
          {
            message: {
              content: 'ok from fallback',
              tool_calls: [],
            },
          },
        ],
      })
    }

    const llm = createOpenRouterClient({
      apiKey: 'test',
      fetchImpl,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms)
        clock += ms
      },
      log: () => {},
    })

    const result = await llm.complete([{ role: 'user', content: 'oi' }], [])
    assert.equal(result.content, 'ok from fallback')
    // primary: attempt + retry after 2s + retry after 6s = 3 calls, then fallback once
    assert.equal(calls, 4)
    assert.deepEqual(sleeps, [2000, 6000])
    assert.equal(models[0], DEFAULT_LLM_MODEL)
    assert.equal(models[3], DEFAULT_LLM_FALLBACK_MODELS[0])
  })

  it('exposes a clean Portuguese error without provider JSON', async () => {
    const logs: string[] = []
    const llm = createOpenRouterClient({
      apiKey: 'test',
      model: 'only/model:free',
      fallbackModels: [],
      fetchImpl: async () =>
        jsonResponse(429, { error: { message: 'raw provider blob {"code":429}' } }),
      now: () => 0,
      sleep: async () => {},
      log: (m) => logs.push(m),
    })

    await assert.rejects(
      () => llm.complete([{ role: 'user', content: 'x' }], []),
      (err: unknown) => {
        assert.ok(err instanceof OpenRouterError)
        assert.equal(err.message, LLM_USER_ERROR)
        assert.equal(err.status, 429)
        assert.doesNotMatch(err.message, /raw provider|\{/)
        return true
      },
    )
    assert.ok(logs.some((l) => l.includes('raw provider blob')))
    assert.equal(isLlmFailureResposta(LLM_USER_ERROR), true)
  })

  it('respects the ~20s total budget', async () => {
    let clock = 0
    let calls = 0
    const llm = createOpenRouterClient({
      apiKey: 'test',
      model: 'a:free',
      fallbackModels: ['b:free'],
      fetchImpl: async () => {
        calls += 1
        return jsonResponse(503, { error: 'upstream' })
      },
      now: () => clock,
      sleep: async (ms) => {
        clock += ms
      },
      log: () => {},
    })

    await assert.rejects(() => llm.complete([{ role: 'user', content: 'x' }], []))
    // Budget prevents spinning forever; a few attempts then stop
    assert.ok(calls >= 2)
    assert.ok(calls <= 6)
    assert.ok(clock <= 20_000)
  })
})
