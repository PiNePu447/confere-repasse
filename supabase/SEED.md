# Seed — Confere Repasse (T2)

Dados **100% fictícios** no formato do Relatório de Conciliação (iFood-like).  
Restaurante: **Restaurante Demo** · user auth `05ebcbde-1c83-4768-9b26-c28a7a2a6782`.

## Contrato

| Campo | Valor |
| --- | --- |
| Plano | Marketplace |
| Comissão | 12% |
| Taxa pagamento online | 3,2% |
| Taxa repasse semanal | R$ 1,99 |

## Como aplicar (no projeto Supabase)

1. `supabase/migrations/20261111000001_init_conciliacao_schema.sql`
2. `supabase/seed.sql` (idempotente; pode reexecutar)

Não aplique `supabase/local_auth_stub.sql` no projeto hospedado — ele só existe para o teste local em Postgres 17 (`scripts/verify-t2-local.sh`).

Datas do seed usam `CURRENT_DATE - N`, então a janela “últimos 7 dias” continua válida em qualquer dia em que o seed rodar.

## Anomalias plantadas

| Order ID | Tipo | Esperado impacto R$ | Notas |
| --- | --- | ---: | --- |
| `DEMO-ANOM-001` | Comissão acima do contrato | 16,50 | Cobrado 23% sobre R$ 150 (R$ 34,50) vs 12% (R$ 18,00) |
| `DEMO-ANOM-002` | Cobrança duplicada | 12,00 | Duas linhas “Comissão do iFood” de R$ 12,00 sobre R$ 100 |
| `DEMO-ANOM-003` | Cancelamento debitado no repasse | 80,00 | Status `CANCELADO`; “Débito por cancelamento” −R$ 80 · **dentro dos últimos 7 dias** (`CURRENT_DATE - 3`) |
| `DEMO-ANOM-004` | Cancelamento debitado no repasse | 95,00 | Status `CANCELADO`; “Débito por cancelamento” −R$ 95 · **mais antigo que 7 dias** (`CURRENT_DATE - 24`) |
| `DEMO-ANOM-005` | Taxa online em pago na entrega | 4,00 | `PAGO_NA_ENTREGA` + “Taxa de pagamento online” 3,2% sobre R$ 125 |

Tipos (1)–(4) do ticket: quatro categorias; o tipo (3) tem **duas** ocorrências (recente e antiga) para o corte de 7 dias no T3.
