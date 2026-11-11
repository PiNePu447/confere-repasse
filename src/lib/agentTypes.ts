/** Shape returned by the `agente` Edge Function — UI renders this as-is. */

export type AgentToolCall = {
  name: string
  args: Record<string, unknown>
}

export type AgentUiResponse = {
  resposta: string
  tool_calls: AgentToolCall[]
  ids_citados?: string[]
}

export function isContestDraft(response: AgentUiResponse): boolean {
  return response.tool_calls.some((t) => t.name === 'rascunhar_contestacao')
}
