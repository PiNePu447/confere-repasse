import type { ChatMessage, LlmClient, LlmResult, LlmToolCall } from './types.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

export const DEFAULT_LLM_MODEL = 'google/gemma-4-31b-it:free'

export type OpenRouterOptions = {
  apiKey: string
  model?: string
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

function sleepDefault(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class OpenRouterError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'OpenRouterError'
    this.status = status
  }
}

export function createOpenRouterClient(options: OpenRouterOptions): LlmClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? sleepDefault
  const model = options.model?.trim() || DEFAULT_LLM_MODEL

  return {
    async complete(messages: ChatMessage[], tools: unknown[]): Promise<LlmResult> {
      const body = {
        model,
        messages,
        tools,
        tool_choice: 'auto',
      }

      const doRequest = async () =>
        fetchImpl(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://confererepasse.app',
            'X-Title': 'Confere Repasse',
          },
          body: JSON.stringify(body),
        })

      let response = await doRequest()
      if (response.status === 429 || response.status >= 500) {
        await sleep(800)
        response = await doRequest()
      }

      if (!response.ok) {
        let detail = ''
        try {
          detail = (await response.text()).slice(0, 300)
        } catch {
          detail = ''
        }
        throw new OpenRouterError(
          `Falha ao consultar o modelo de linguagem (HTTP ${response.status}). Tente novamente em instantes.${detail ? ` Detalhe: ${detail}` : ''}`,
          response.status,
        )
      }

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
        throw new OpenRouterError(
          `Falha ao consultar o modelo de linguagem: ${json.error.message}`,
          null,
        )
      }

      const message = json.choices?.[0]?.message
      if (!message) {
        throw new OpenRouterError(
          'Falha ao consultar o modelo de linguagem: resposta vazia do provedor.',
          null,
        )
      }

      return {
        content: message.content ?? null,
        tool_calls: message.tool_calls ?? [],
      }
    },
  }
}
