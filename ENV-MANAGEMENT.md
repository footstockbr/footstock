# ENV-MANAGEMENT — FootStock Railway Migration

> Documentação de onde cada variável de ambiente vive após a migração para Railway (2026-05).

---

## DATABASE_URL

| Ambiente | Valor | Arquivo |
|----------|-------|---------|
| Dev local | `postgresql://postgres:postgres@localhost:5433/foot_stock_dev` | `.env.local` |
| Staging | `postgres://USER:PASS@postgres.railway.internal:5432/railway` | `.env.staging` |
| Produção | `postgres://USER:PASS@postgres.railway.internal:5432/railway` | `.env.production` |
| Motor dev | `postgresql://USER:PASS@postgres.railway.internal:5432/railway` | `motor/.env.example` |

> **Nota:** Em produção, o valor real é injetado via Railway env vars (secret manager), não via `.env` commitado.

---

## REDIS_URL

| Ambiente | Valor | Arquivo |
|----------|-------|---------|
| Dev local | `redis://localhost:6379` | `.env.local` |
| Staging | `redis://default:PASS@redis.railway.internal:6379` | `.env.staging` |
| Produção | `redis://default:PASS@redis.railway.internal:6379` | `.env.production` |
| Motor dev | `redis://default:PASS@redis.railway.internal:6379` | `motor/.env.example` |

---

## Diretrizes

1. **Nunca commitar valores reais** de `DATABASE_URL` ou `REDIS_URL` em produção.
2. **Railway env vars** são a fonte da verdade para staging/prod.
3. **`.env.local`** e **`.env`** continuam apontando para localhost (docker-compose).
4. **`.env.deploy`** contém secrets reais — fora do git.
