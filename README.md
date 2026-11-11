# Confere Repasse

Demo de portfólio (candidato AI Engineer — iFood GenAI): um assistente que **confere o repasse** de um restaurante parceiro a partir do Relatório de Conciliação.

> **Dados 100% fictícios.** Nada aqui é dado real de iFood, restaurante ou pessoa.

<!-- DEMO:URL -->
**Demo pública:** _URL a publicar (T9/T10)._

<!-- DEMO:GIF -->
**GIF do fluxo:** _placeholder — gravar depois do deploy estável._

## O problema

Parceiros Marketplace veem o repasse semanal e, com frequência, não conseguem responder rápido:

- quanto deixaram de receber por divergências;
- se um cancelamento ainda está no prazo de contestação;
- quais IDs e valores citar no chamado.

O Confere Repasse mostra um painel com os totais do motor de regras e um chat que **só afirma o que as ferramentas devolveram**.

## Como funciona

1. Login com o usuário demo (RLS no Supabase).
2. O **painel** carrega pedidos/lançamentos via `supabase-js` e roda `analyzeRepasse` no browser.
3. O **agente** (Edge Function) usa o mesmo loop e as mesmas tools; o LLM orquestra tools e redige a resposta.
4. Opcional: upload de CSV no formato do relatório (substitui as semanas do arquivo) ou **Restaurar dados demo**.

## Arquitetura

| Camada | O quê |
| --- | --- |
| Frontend | React + Vite + Tailwind (`src/`) |
| Auth / dados | Supabase Auth + Postgres + RLS |
| Motor de regras | TypeScript puro em `src/rules` (`analyzeRepasse`) |
| Agente | Loop compartilhado `src/agent` + Edge Function `agente` |
| LLM | OpenRouter (tools); default Nemotron Ultra free + fallback |
| Eval | 30 perguntas em `eval/` (mock ou live) |

```
Browser (painel + chat)
   │ RLS (anon key + JWT)
   ├─► Supabase tables (pedidos, lançamentos, …)
   └─► Edge Function agente ──► OpenRouter (tool calls)
              │
              └─► mesmo src/agent + src/rules
```

## Motor de regras (e por que o LLM não calcula dinheiro)

Toda cifra em R$ e todo prazo de cancelamento vêm de `analyzeRepasse` (centavos inteiros, `today` injetado). O LLM **não** soma comissão, **não** inventa data limite e **não** estima diferença: a system prompt e as tools exigem citar só o que a ferramenta retornou (`pedido_id_ifood`, `diferenca`, `lancamento_ids`, etc.).

Isso separa “orquestração em linguagem natural” de “verdade contábil da demo”.

## Eval

A tabela abaixo é atualizada pelo harness (`npm run eval`). Não edite à mão o bloco entre os marcadores.

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

Comandos úteis:

```bash
EVAL_MOCK=1 npm run eval
OPENROUTER_API_KEY=… npm run eval
EVAL_ONLY=19-30 OPENROUTER_API_KEY=… npm run eval   # merge em latest.json
npm run eval:c7
```

## Rodar local

```bash
cp .env.example .env   # URL/anon do Supabase + opcional OPENROUTER_API_KEY
npm install
npm run dev
```

Build do front: `npm run build`  
Testes: `npm test`

### Schema / seed (Supabase)

Aplique nesta ordem:

1. `supabase/migrations/20261111000001_init_conciliacao_schema.sql`
2. `supabase/migrations/20261111000002_csv_upload_and_reseed.sql`
3. `supabase/migrations/20261111000003_tighten_reseed_grants.sql`
4. `supabase/seed.sql` (chama `reseed_restaurant_for_user`)

Detalhes das anomalias: `supabase/SEED.md`. Prova local Postgres 17: `npm run verify:t8`.

### Agente local e Edge Function

```bash
npm run agent:ask -- "sua pergunta"   # precisa de OPENROUTER_API_KEY
npm run build:function                # → dist/agente/ (gitignored)
```

**Deploy da função:** publique o conteúdo de `dist/agente/` (`index.ts` + `deno.json`). No Supabase, use **`import_map_path=deno.json`** (o SDK `@supabase/supabase-js` fica externo, mapeado no import map).

Modelo padrão: `LLM_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free`  
Fallback: `LLM_FALLBACK_MODELS` (default Super-VL free), backoff ~2s/~6s, orçamento ~20s.

### CSV (T8)

No painel autenticado: upload do Relatório de Conciliação (`;` / `-12,00`). Cabeçalho em `src/csv/headers.ts`. Amostra: `samples/relatorio-com-anomalia.csv`. “Restaurar dados demo” → RPC `reseed_own_restaurant()` (só o restaurante do caller).

## Credenciais demo

- E-mail: `demo@confererepasse.app`
- Senha: `demo-repasse-2026`

## Limites e avisos

- Demo de portfólio: escopo pequeno, seed determinístico, sem envio real de contestação.
- LLM free-tier (OpenRouter) tem cota diária; use `EVAL_MOCK=1` / `EVAL_ONLY` para poupar requests.
- Upload CSV no projeto hospedado exige as migrações T8/T8-fix acima.
- Não use dados reais de produção nesta base.
