# Demo Milestone 7 — Foot Stock

> **Nota infra (2026-05-06):** O sistema foi migrado de Vercel + Supabase para Railway consolidado.
> Os comandos abaixo continuam válidos; o banco de dados local (Docker) é usado para demo.
> Para produção, ver runbooks em `runbooks/RUNBOOK-016-db-cutover-supabase-to-railway.md`.

## Como executar o seed

```bash
# Aplicar migrations pendentes
npx prisma migrate deploy

# Executar seed de demonstração
npx ts-node prisma/seed-milestone-7.ts

# Ou via script unificado
bash scripts/demo-milestone-7.sh
```

## Credenciais dos usuários de demo

| Perfil | Email | Senha | Badge esperado |
|--------|-------|-------|----------------|
| Jogador | demo@jogador.footstock | Demo@123 | 1 (LEAGUE_RESULT) |
| Craque | demo@craque.footstock | Demo@123 | 1 (LEAGUE_RESULT) |
| Lenda | demo@lenda.footstock | Demo@123 | 2 (LEAGUE_RESULT + NEWS_FAVORITE_CLUB) |

## O que verificar

### Forum (/forum)
- 5 posts com conteudo diverso (tickers FLM, PAL, URU3 e posts sem ticker)
- Post do Jogador sobre FLM com 3 likes
- Post do Jogador sobre URU3 com 2 likes

### Ligas (/ligas)
- "Liga Demo — Semana 5" ativa com status ACTIVE
- Ranking: Lenda (71 pts) > Craque (45 pts) > Jogador (12 pts)

### Notificacoes (sino no header)
- Badge numerico visivel ao fazer login
- Drawer abre com lista de notificacoes
- ORDER_EXECUTED (lida, fundo claro) + LEAGUE_RESULT (nao-lida, fundo escuro com ponto dourado)
- Icones corretos: CheckCircle/emerald para ORDER_EXECUTED, Trophy/azul para LEAGUE_RESULT
- Lenda tem notificacao extra NEWS_FAVORITE_CLUB com icone Newspaper

## Como resetar dados de demo

```bash
# Limpar dados de demo (cuidado: remove TODOS os dados)
npx prisma migrate reset --force

# Re-executar seed
npx ts-node prisma/seed-milestone-7.ts
```

## Notas

- O seed e idempotente: executar 2x nao duplica dados
- GlossaryInteraction seed omitido (modelo nao disponivel no schema atual — dependencia do module-18)
- Notificacoes sao criadas via Prisma direto (nao via NotificationService) para evitar dependencia de Supabase Realtime no seed
