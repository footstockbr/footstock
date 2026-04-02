# Configuration — Task List
Gerado em: 2026-04-02

| Task | Status |
|------|--------|
| T001 – `.stryker-tmp/` no `.gitignore` | COMPLETED |
| T002 – Mismatch nomes gateways de pagamento | COMPLETED |
| T003 – Vars ausentes em `lib/env.ts` | COMPLETED |
| T004 – `RAILWAY_URL` no `.env.example` | COMPLETED |
| T005 – Migrar `process.env` diretos para `env.*` | PENDENTE (manual) |
| T006 – `postinstall` para Prisma generate | COMPLETED |
| T007 – `prebuild` antes do build | COMPLETED |

---

### T001 – Adicionar `.stryker-tmp/` ao `.gitignore`
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `.gitignore`

**Descrição:** O diretório `.stryker-tmp/` criado pelo Stryker contém cópias completas de todos os arquivos `.env` — incluindo credenciais reais (JWT_SECRET, DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.). Esse diretório não está no `.gitignore`. Um `git add .` acidental exporia todas as credenciais.

**Critérios de Aceite:**
- `.stryker-tmp/` presente no `.gitignore`
- `git status` não lista o diretório como untracked

---

### T002 – Corrigir mismatch de nomes de env vars dos gateways de pagamento
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `lib/env.ts`
- modificar: `.env.example`

**Descrição:** `.env.example` define `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET`, mas `lib/env.ts` valida `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_WEBHOOK_SECRET`. As variáveis nunca serão encontradas pelo Zod — validação silenciosamente inútil para o gateway principal.

**Critérios de Aceite:**
- `lib/env.ts` e `.env.example` usam os mesmos nomes (`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`)
- `env.MP_ACCESS_TOKEN` disponível via schema Zod

---

### T003 – Adicionar vars ausentes ao `lib/env.ts`
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `lib/env.ts`

**Descrição:** Diversas variáveis usadas em runtime via `process.env` direto não passam pela validação centralizada do Zod. Lista:
- `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGIN` — usados em `lib/auth/webauthn.ts`
- `ANTHROPIC_API_KEY` — usado em `lib/services/AIAdvisorService.ts`
- `PAGSEGURO_SANDBOX` — usado em `lib/gateways/pagseguro.ts`
- `PAYPAL_SANDBOX` — usado em `lib/gateways/paypal.ts`
- `INVITE_TOKEN_SECRET` — declarado em `.env.example`, não validado
- `REVALIDATE_SECRET`, `ENCRYPTION_KEY`, `INTERNAL_JOBS_SECRET` — em `.env.example`, não validados

**Critérios de Aceite:**
- Todas as vars acima presentes no schema Zod com validação adequada (`.min(1)` ou `.url()`)
- `npm run typecheck` sem erros

---

### T004 – Documentar `RAILWAY_URL` no `.env.example`
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `.env.example`

**Descrição:** `RAILWAY_URL` é usada em `lib/env.ts` e no `vercel.json` como destino de rewrite para o motor. Está ausente do `.env.example`, deixando desenvolvedores sem instrução de como preencher.

**Critérios de Aceite:**
- `RAILWAY_URL` adicionada ao `.env.example` com comentário `# URL do serviço motor no Railway`

---

### T005 – Migrar `process.env` diretos para `env.*` nos arquivos core
**Tipo:** SEQUENTIAL
**Dependências:** T003
**Arquivos:**
- modificar: `lib/redis.ts`
- modificar: `lib/prisma.ts`
- modificar: `lib/auth/webauthn.ts`
- modificar: `lib/services/AIAdvisorService.ts`
- modificar: `lib/services/DataExportService.ts`

**Descrição:** Os arquivos acima acessam `process.env.*` diretamente em vez de usar `env.*` de `lib/env.ts`. Isso contorna a validação Zod e perde a tipagem centralizada. Exemplo: `lib/prisma.ts:10` usa `process.env.DATABASE_URL` sem fallback tipado; `lib/auth/webauthn.ts:16-17` usa `process.env.WEBAUTHN_RP_ID ?? 'localhost'`.

**Critérios de Aceite:**
- Arquivos listados importam `env` de `lib/env.ts`
- Nenhum `process.env.DATABASE_URL`, `process.env.REDIS_URL`, `process.env.WEBAUTHN_RP_ID` direto nos arquivos listados
- `npm run lint && npm run typecheck` sem erros

---

### T006 – Adicionar `postinstall` script para `prisma generate`
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `package.json`

**Descrição:** Prisma requer `prisma generate` após `npm install` para gerar o cliente tipado. Sem `postinstall`, ambientes frescos de CI/CD ou novos desenvolvedores têm erros de importação do `@prisma/client`. O campo `prisma.seed` já está configurado mas `postinstall` está ausente.

**Critérios de Aceite:**
- `"postinstall": "prisma generate"` adicionado ao `scripts` do `package.json`
- `npm install` em ambiente limpo gera o cliente Prisma automaticamente

---

### T007 – Adicionar `prebuild` para forçar validação antes do build
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `package.json`

**Descrição:** O script `build` executa diretamente `next build` sem passar pelo `validate` (lint + typecheck + test). Isso permite que um build de produção seja gerado com erros de tipo ou lint. O script `validate` existe mas não é chamado automaticamente.

**Critérios de Aceite:**
- `"prebuild": "npm run validate"` adicionado ao `scripts`
- `npm run build` executa lint + typecheck + test antes do `next build`
