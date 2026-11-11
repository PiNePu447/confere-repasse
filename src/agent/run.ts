import type { AgentSupabase } from './db.ts'
import { loadRestaurantData } from './db.ts'
import { todayInSaoPaulo } from './dates.ts'
import { runAgent } from './loop.ts'
import {
  createOpenRouterClient,
  DEFAULT_LLM_MODEL,
  LLM_USER_ERROR,
  OpenRouterError,
  parseFallbackModels,
} from './openrouter.ts'
import { buildSystemPrompt } from './prompt.ts'
import { TOOL_DEFINITIONS, createToolExecutor } from './tools.ts'
import type { AgentResponse, LlmClient } from './types.ts'

export type RunAgentSessionOptions = {
  supabase: AgentSupabase
  pergunta: string
  /** Injected today (YYYY-MM-DD). Defaults to America/Sao_Paulo calendar day. */
  today?: string
  llm?: LlmClient
  openRouterApiKey?: string
  llmModel?: string
  /** Comma list or array; defaults to DEFAULT_LLM_FALLBACK_MODELS. */
  llmFallbackModels?: string | string[]
}

/**
 * One code path for Edge Function and Node: load RLS-scoped data, run tools + LLM loop.
 */
export async function runAgentSession(
  options: RunAgentSessionOptions,
): Promise<AgentResponse> {
  const today = options.today ?? todayInSaoPaulo()
  const data = await loadRestaurantData(options.supabase, today)
  const executeTool = createToolExecutor(data)

  const llm =
    options.llm ??
    createOpenRouterClient({
      apiKey: options.openRouterApiKey ?? '',
      model: options.llmModel ?? DEFAULT_LLM_MODEL,
      fallbackModels: parseFallbackModels(options.llmFallbackModels),
    })

  if (!options.llm && !options.openRouterApiKey) {
    return {
      resposta:
        'não sei: a chave OPENROUTER_API_KEY não está configurada neste ambiente.',
      tool_calls: [],
      ids_citados: [],
      llm_calls: 0,
    }
  }

  try {
    return await runAgent({
      pergunta: options.pergunta,
      today,
      llm,
      executeTool,
      toolDefinitions: [...TOOL_DEFINITIONS],
      systemPrompt: buildSystemPrompt(today),
    })
  } catch (err) {
    if (err instanceof OpenRouterError) {
      return {
        resposta: LLM_USER_ERROR,
        tool_calls: [],
        ids_citados: [],
        llm_calls: 0,
      }
    }
    throw err
  }
}
