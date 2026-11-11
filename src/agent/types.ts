/** Shared agent types (Deno Edge Function + Node CLI). */

export type ToolCallRecord = {
  name: string
  args: Record<string, unknown>
}

export type AgentResponse = {
  resposta: string
  tool_calls: ToolCallRecord[]
  ids_citados?: string[]
  /** Number of LLM complete() calls used for this answer (tool rounds + final). */
  llm_calls?: number
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

export type LlmToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type LlmResult = {
  content: string | null
  tool_calls: LlmToolCall[]
}

export type LlmClient = {
  complete(messages: ChatMessage[], tools: unknown[]): Promise<LlmResult>
}

export type AgentRunOptions = {
  pergunta: string
  today: string
  llm: LlmClient
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
  toolDefinitions: unknown[]
  systemPrompt: string
  maxRounds?: number
}
