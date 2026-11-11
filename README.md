# Confere Repasse

Demo de portfólio (iFood GenAI — AI Engineer): agente que confere o repasse de um restaurante parceiro. Dados fictícios.

## Rodar local

```bash
cp .env.example .env   # já contém as chaves públicas do Supabase
npm install
npm run dev
```

Build: `npm run build`

Schema/seed (T2): aplique no Supabase, nesta ordem,
`supabase/migrations/20261111000001_init_conciliacao_schema.sql` e depois `supabase/seed.sql`.
Detalhes das anomalias plantadas: `supabase/SEED.md`.

Rules engine (T3): `src/rules` — TypeScript puro (`analyzeRepasse`). Testes: `npm test`.

Agent (T4): Edge Function `supabase/functions/agente` + loop compartilhado em `src/agent`.
Pergunta local (precisa de `OPENROUTER_API_KEY`): `npm run agent:ask -- "sua pergunta"`.
Modelo padrão: `LLM_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free`.
Fallback em 429/5xx: `LLM_FALLBACK_MODELS` (default `nvidia/nemotron-3.5-super-vl:free`),
com backoff ~2s e ~6s por modelo (orçamento total ~20s).

Eval (T5): `EVAL_MOCK=1 npm run eval` ou `OPENROUTER_API_KEY=… npm run eval`.
Fatia sem gastar o cap diário: `EVAL_ONLY=19-30` (ou `q05,q12`) — faz merge em
`eval/results/latest.json` e o resumo do README usa o conjunto completo mesclado.
Isolamento C7: `npm run eval:c7`.

Edge Function bundle: `npm run build:function` → `dist/agente/index.ts` + `deno.json`
(`@supabase/supabase-js` externo). Redeploy a partir dessa pasta.

Chat (T6): na área autenticada. Em DEV, mock da função com `VITE_AGENT_MOCK=1`
ou `/?agentMock=answer|draft|error` (não entra no build de produção).

Dashboard (T7): no shell autenticado, ao lado do chat. Totais por semana
(vendas brutas / repassado líquido / esperado líquido), perdas por tipo e prazos
abertos — tudo via `analyzeRepasse` no browser sobre as linhas RLS do usuário.

CSV upload (T8): no painel, envie um Relatório de Conciliação (`;` / números BR).
Cabeçalho e regras em `src/csv/headers.ts`; amostra com anomalia extra em
`samples/relatorio-com-anomalia.csv`. Migração de escrita/reseed:
`supabase/migrations/20261111000002_csv_upload_and_reseed.sql`
(prova local: `npm run verify:t8`). "Restaurar dados demo" chama
`reseed_own_restaurant()`.

## Credenciais demo

- E-mail: `demo@confererepasse.app`
- Senha: `demo-repasse-2026`

<!-- EVAL:START -->
## Eval (T5)

| | |
| --- | --- |
| Model | `mock-tool-answerer` |
| Date (UTC) | 2026-11-11T03:21:37.825Z |
| Run dates (merged) | 2026-11-11T03:21:37.825Z |
| Pass count | **30/30** |
| Value accuracy (answered) | 100.0% |
| ID accuracy (answered) | 100.0% |
| Value accuracy (all 30) | 100.0% |
| ID accuracy (all 30) | 100.0% |
| FAIL / ERROR | 0 / 0 |
| Avg LLM calls / question | 2 |

_Run with `EVAL_MOCK=1` (tool-based mock LLM). Re-run with `OPENROUTER_API_KEY` for the live model. Partial: `EVAL_ONLY=19-30`._
<!-- EVAL:END -->
