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

Eval (T5): `EVAL_MOCK=1 npm run eval` ou `OPENROUTER_API_KEY=… npm run eval`.
Isolamento C7: `npm run eval:c7`.

## Credenciais demo

- E-mail: `demo@confererepasse.app`
- Senha: `demo-repasse-2026`

<!-- EVAL:START -->
## Eval (T5)

| | |
| --- | --- |
| Model | `mock-tool-answerer` |
| Date (UTC) | 2026-11-11T02:48:26.709Z |
| Pass count | **30/30** |
| Value accuracy (answered) | 100.0% |
| ID accuracy (answered) | 100.0% |
| Value accuracy (all 30) | 100.0% |
| ID accuracy (all 30) | 100.0% |
| FAIL / ERROR | 0 / 0 |

_Run with `EVAL_MOCK=1` (tool-based mock LLM). Re-run with `OPENROUTER_API_KEY` for the live model._
<!-- EVAL:END -->
