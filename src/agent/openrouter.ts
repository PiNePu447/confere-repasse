import type { ChatMessage, LlmClient, LlmResult, LlmToolCall } from './types.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

/** Primary free tool-calling model (Nemotron Ultra — Gemma :free was 429-limited). */
export const DEFAULT_LLM_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free'

/** Tried after the primary exhausts 429/5xx retries. Override with LLM_FALLBACK_MODELS. */
export const DEFAULT_LLM_FALLBACK_MODELS = ['nvidia/nemotron-3.5-super-vl:free'] as const

/** Per-model retry waits after a 429/5xx (attempt 1 → 2s, attempt 2 → 6s). */
const RETRY_BACKOFFS_MS = [2_000, 6_000] as const

/** Bound total wait+request time across primary + fallbacks (~Edge Function safe). */
const TOTAL_BUDGET_MS = 20_000

export const LLM_USER_ERROR =
  'Falha ao consultar o modelo de linguagem. Tente novamente em instantes.'

export type OpenRouterOptions = {
  apiKey: string
  model?: string
  /** Comma-separated override, or an array. Defaults to DEFAULT_LLM_FALLBACK_MODELS. */
  fallbackModels?: string[] | string
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  log?: (message: string) => void
}

function sleepDefault(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class OpenRouterError extends Error {
  readonly status: number | null
  constructor(message: string = LLM_USER_ERROR, status: number | null = null) {
    super(message)
    this.name = 'OpenRouterError'
    this.status = status
  }
}

export function parseFallbackModels(raw?: string | string[] | null): string[] {
  if (Array.isArray(raw)) {
    return raw.map((s) => s.trim()).filter(Boolean)
  }
  if (raw == null || String(raw).trim() === '') {
    return [...DEFAULT_LLM_FALLBACK_MODELS]
  }
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function modelChain(primary: string, fallbacks: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of [primary, ...fallbacks]) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

export function createOpenRouterClient(options: OpenRouterOptions): LlmClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? sleepDefault
  const now = options.now ?? Date.now
  const log = options.log ?? ((message: string) => console.error(message))
  const primary = options.model?.trim() || DEFAULT_LLM_MODEL
  const fallbacks = parseFallbackModels(options.fallbackModels)
  const models = modelChain(primary, fallbacks)

  return {
    async complete(messages: ChatMessage[], tools: unknown[]): Promise<LlmResult> {
      const started = now()
      const deadline = started + TOTAL_BUDGET_MS
      let lastStatus: number | null = null

      for (const model of models) {
        for (let attempt = 0; attempt <= RETRY_BACKOFFS_MS.length; attempt++) {
          const remaining = deadline - now()
          if (remaining <= 0) break

          const body = {
            model,
            messages,
            tools,
            tool_choice: 'auto',
          }

          let response: Response
          try {
            response = await fetchImpl(OPENROUTER_URL, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${options.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://confererepasse.app',
                'X-Title': 'Confere Repasse',
              },
              body: JSON.stringify(body),
            })
          } catch (err) {
            log(
              `[openrouter] network error model=${model} attempt=${attempt + 1}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            )
            lastStatus = null
            if (attempt < RETRY_BACKOFFS_MS.length) {
              const wait = Math.min(RETRY_BACKOFFS_MS[attempt]!, Math.max(0, deadline - now()))
              if (wait <= 0) break
              await sleep(wait)
              continue
            }
            break
          }

          if (response.ok) {
            const json = (await response.json()) as {
              choices?: Array<{
                message?: {
                  content?: string | null
                  tool_calls?: LlmToolCall[]
                }
              }>
              error?: { message?: string }
            }

            if (json.error?.message) {
              log(
                `[openrouter] provider error object model=${model}: ${JSON.stringify(json.error)}`,
              )
              lastStatus = response.status
              break
            }

            const message = json.choices?.[0]?.message
            if (!message) {
              log(`[openrouter] empty choices model=${model} body=${JSON.stringify(json).slice(0, 500)}`)
              lastStatus = response.status
              break
            }

            return {
              content: message.content ?? null,
              tool_calls: message.tool_calls ?? [],
            }
          }

          lastStatus = response.status
          let raw = ''
          try {
            raw = await response.text()
          } catch {
            raw = ''
          }
          log(
            `[openrouter] HTTP ${response.status} model=${model} attempt=${attempt + 1}: ${raw.slice(0, 800)}`,
          )

          if (!isRetryableStatus(response.status)) {
            throw new OpenRouterError(LLM_USER_ERROR, response.status)
          }

          if (attempt < RETRY_BACKOFFS_MS.length) {
            const wait = Math.min(RETRY_BACKOFFS_MS[attempt]!, Math.max(0, deadline - now()))
            if (wait <= 0) break
            await sleep(wait)
            continue
          }
          // Exhausted retries for this model → try fallback
          break
        }
      }

      throw new OpenRouterError(LLM_USER_ERROR, lastStatus)
    },
  }
}

export function isLlmFailureResposta(resposta: string): boolean {
  return resposta.trim().startsWith('Falha ao consultar o modelo de linguagem')
}
