# Secrets Rotation Policy — Foot Stock

## Secrets Gerenciados

| Secret | Plataforma | Periodicidade | Responsável |
|--------|------------|---------------|-------------|
| `VERCEL_TOKEN` | GitHub Secrets → Actions | Semestral | DevOps |
| `VERCEL_ORG_ID` | GitHub Secrets → Actions | Conforme necessário | DevOps |
| `VERCEL_PROJECT_ID` | GitHub Secrets → Actions | Conforme necessário | DevOps |
| `RAILWAY_TOKEN` | GitHub Secrets → Actions | Semestral | DevOps |
| `RAILWAY_REGISTRY_URL` | GitHub Secrets → Actions | Semestral | DevOps |
| `DATABASE_URL_CI` | GitHub Secrets → Actions | Conforme necessário | DevOps |
| `JWT_SECRET` | GitHub Secrets + Vercel | Semestral | DevOps |
| `SUPABASE_SERVICE_ROLE_KEY` | GitHub Secrets + Vercel | Anual ou rotação de projeto | DevOps |

## Processo de Rotação

1. **Gerar novo token/secret** na plataforma correspondente
2. **Atualizar em GitHub Settings** → Secrets → Actions
3. **Atualizar em Vercel Dashboard** (se aplicável) → Project → Environment Variables
4. **Deletar o token antigo** na plataforma
5. **Verificar que o próximo deploy/CI passa** sem erros
6. **Registrar a rotação** neste documento com a data

## Histórico de Rotações

| Secret | Data | Responsável | Motivo |
|--------|------|-------------|--------|
| — | — | — | Rotação inicial pendente |

## Referências

- Vercel Tokens: https://vercel.com/account/tokens
- Railway Tokens: https://railway.app/account/tokens
- GitHub Secrets: Settings → Secrets and variables → Actions

## Alertas

- Nunca commitar tokens reais em arquivos do repositório
- Usar `${{ secrets.* }}` exclusivamente nos workflows
- SHAs das Actions devem ser atualizados semestralmente para incorporar patches de segurança
