export type ReaisSelector =
  | { engine: 'perdido_total' }
  | { engine: 'perdido_por_tipo'; key: string }
  | { engine: 'semana'; semana: string; field: 'repassado' | 'esperado' | 'diferenca' }
  | {
      divergencia: string
      field: 'diferenca' | 'valor_cobrado' | 'valor_esperado'
    }
  | { pedido: string; field: 'valor_total' }
  | { contrato: 'taxa_repasse_semanal' }

export type GradeSpec =
  | { mode: 'nao_sei' }
  | {
      mode: 'assert'
      expect_reais?: ReaisSelector[]
      expect_ids?: string[]
      expect_texts?: string[]
      /** Each group is OR; all groups must pass (AND). */
      expect_text_groups?: string[][]
      expect_data_limite_of?: string
      expect_lancamento_ids_of?: string
      expect_prazo_aberto?: boolean
      forbid_data_limite?: boolean
    }

export type EvalQuestion = {
  id: string
  categoria: string
  pergunta: string
  grade: GradeSpec
}

export type ResolvedExpected = {
  naoSei: boolean
  reais: string[]
  ids: string[]
  texts: string[]
  textGroups: string[][]
  dataLimite: string | null
  prazoAberto: boolean | null
  forbidDataLimite: boolean
}

export type QuestionResultStatus = 'PASS' | 'FAIL' | 'ERROR'

export type QuestionResult = {
  id: string
  categoria: string
  pergunta: string
  status: QuestionResultStatus
  value_ok: boolean | null
  id_ok: boolean | null
  details: string[]
  resposta?: string
  tool_calls?: Array<{ name: string; args: Record<string, unknown> }>
  expected?: ResolvedExpected
  error?: string
  latency_ms: number
}
