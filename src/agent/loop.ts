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

/**
 * Single agent loop used by the Edge Function and the Node CLI.
 * Prompt, tools, and dispatch share this one code path.
 */
export async function runAgent(options: AgentRunOptions): Promise<AgentResponse> {
  const maxRounds = options.maxRounds ?? 6
  const toolCalls: ToolCallRecord[] = []
  const knownIds = new Set<string>()

  const messages: ChatMessage[] = [
    { role: 'system', content: options.systemPrompt },
    { role: 'user', content: options.pergunta },
  ]

  for (let round = 0; round < maxRounds; round++) {
    const llmResult = await options.llm.complete(messages, options.toolDefinitions)

    if (llmResult.tool_calls.length > 0) {
      messages.push({
        role: 'assistant',
        content: llmResult.content,
        tool_calls: llmResult.tool_calls,
      })

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

    const resposta =
      (llmResult.content && llmResult.content.trim()) ||
      'não sei: o modelo não retornou uma resposta.'

    return {
      resposta,
      tool_calls: toolCalls,
      ids_citados: idsCitedInText(resposta, knownIds),
    }
  }

  return {
    resposta:
      'não sei: atingi o limite de etapas ao consultar as ferramentas. Reformule a pergunta.',
    tool_calls: toolCalls,
    ids_citados: [],
  }
}
