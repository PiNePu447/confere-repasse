import { collectIdsFromUnknown, idsCitedInText } from './ids.ts'
import type { AgentResponse, AgentRunOptions, ChatMessage, ToolCallRecord } from './types.ts'

function parseArgs(raw: string): Record<string, unknown> {
  if (!raw || !raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {}
  } catch {
    return { _raw: raw }
  }
}

function trimContent(content: string | null | undefined): string {
  return (content ?? '').trim()
}

/**
 * Single agent loop used by the Edge Function and the Node CLI.
 * Prompt, tools, and dispatch share this one code path.
 */
/** Default tool-loop budget: keep OpenRouter free-tier spend bounded (~4 LLM calls/question). */
export const DEFAULT_MAX_ROUNDS = 4

export const EMPTY_MODEL_REPLY =
  'não sei: o modelo não retornou uma resposta.'

export async function runAgent(options: AgentRunOptions): Promise<AgentResponse> {
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS
  const toolCalls: ToolCallRecord[] = []
  const knownIds = new Set<string>()
  let llmCalls = 0
  const fallbackModels = (options.emptyAnswerFallbackModels ?? []).filter(Boolean)

  const messages: ChatMessage[] = [
    { role: 'system', content: options.systemPrompt },
    { role: 'user', content: options.pergunta },
  ]

  for (let round = 0; round < maxRounds; round++) {
    const llmResult = await options.llm.complete(messages, options.toolDefinitions)
    llmCalls += 1

    if (llmResult.tool_calls.length > 0) {
      messages.push({
        role: 'assistant',
        content: llmResult.content,
        tool_calls: llmResult.tool_calls,
      })

      // Parallel tool calls in one assistant turn (one LLM round).
      for (const call of llmResult.tool_calls) {
        const args = parseArgs(call.function.arguments)
        toolCalls.push({ name: call.function.name, args })
        let result: unknown
        try {
          result = await options.executeTool(call.function.name, args)
        } catch (err) {
          result = {
            erro: err instanceof Error ? err.message : 'erro ao executar ferramenta',
          }
        }
        collectIdsFromUnknown(result, knownIds)
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(result),
        })
      }
      continue
    }

    let content = trimContent(llmResult.content)

    // Empty final message: retry once on the same model (same client / primary).
    if (!content) {
      const retry = await options.llm.complete(messages, options.toolDefinitions)
      llmCalls += 1
      if (retry.tool_calls.length > 0) {
        // Unexpected tools on retry — treat as a normal tool round.
        messages.push({
          role: 'assistant',
          content: retry.content,
          tool_calls: retry.tool_calls,
        })
        for (const call of retry.tool_calls) {
          const args = parseArgs(call.function.arguments)
          toolCalls.push({ name: call.function.name, args })
          let result: unknown
          try {
            result = await options.executeTool(call.function.name, args)
          } catch (err) {
            result = {
              erro: err instanceof Error ? err.message : 'erro ao executar ferramenta',
            }
          }
          collectIdsFromUnknown(result, knownIds)
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.function.name,
            content: JSON.stringify(result),
          })
        }
        continue
      }
      content = trimContent(retry.content)
    }

    // Still empty: one shot on the next model in LLM_FALLBACK_MODELS.
    if (!content && fallbackModels.length > 0) {
      const nextModel = fallbackModels[0]!
      const fb = await options.llm.complete(messages, options.toolDefinitions, {
        forceModel: nextModel,
        maxAttempts: 1,
      })
      llmCalls += 1
      if (fb.tool_calls.length === 0) {
        content = trimContent(fb.content)
      }
    }

    const resposta = content || EMPTY_MODEL_REPLY

    return {
      resposta,
      tool_calls: toolCalls,
      ids_citados: idsCitedInText(resposta, knownIds),
      llm_calls: llmCalls,
    }
  }

  return {
    resposta:
      'não sei: atingi o limite de etapas ao consultar as ferramentas. Reformule a pergunta.',
    tool_calls: toolCalls,
    ids_citados: [],
    llm_calls: llmCalls,
  }
}
