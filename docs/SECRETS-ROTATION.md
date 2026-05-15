# Secrets Rotation Policy — Foot Stock

## Secrets Gerenciados

| Secret | Plataforma | Periodicidade | Responsável |
|--------|------------|---------------|-------------|
| `RAILWAY_TOKEN` | GitHub Secrets → Actions | Semestral | DevOps |
| `DATABASE_URL_CI` | GitHub Secrets → Actions | Conforme necessário | DevOps |
| `JWT_SECRET` | GitHub Secrets + Railway | Semestral | DevOps |
| `SUPABASE_SERVICE_ROLE_KEY` | GitHub Secrets + Railway | Anual ou rotação de projeto | DevOps |

> Nota: secrets Vercel legacy (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) e `RAILWAY_REGISTRY_URL` foram removidos do GH em 2026-05-10 (TASK-P1-08, item 033 do loop railway-migration-remediate) — projeto migrado para Railway, registry uso default.

## Processo de Rotação

1. **Gerar novo token/secret** na plataforma correspondente
2. **Atualizar em GitHub Settings** → Secrets → Actions
3. **Atualizar em Railway Dashboard** (se aplicável) → Service → Variables
4. **Deletar o token antigo** na plataforma
5. **Verificar que o próximo deploy/CI passa** sem erros
6. **Registrar a rotação** neste documento com a data

## Histórico de Rotações

| Secret | Data | Responsável | Motivo |
|--------|------|-------------|--------|
| — | — | — | Rotação inicial pendente |

## Referências

- Railway Tokens: https://railway.app/account/tokens
- GitHub Secrets: Settings → Secrets and variables → Actions

## Alertas

- Nunca commitar tokens reais em arquivos do repositório
- Usar `${{ secrets.* }}` exclusivamente nos workflows
- SHAs das Actions devem ser atualizados semestralmente para incorporar patches de segurança
