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

## Credenciais demo

- E-mail: `demo@confererepasse.app`
- Senha: `demo-repasse-2026`
