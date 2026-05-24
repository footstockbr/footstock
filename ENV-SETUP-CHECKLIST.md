# ENV SETUP CHECKLIST — Foot Stock

Gerado por `/env-creation` em **2026-04-01**

---

## STATUS ATUAL

| Item | Status |
|------|--------|
| `.env` gerado | ✅ Completo |
| Valores preservados | ✅ 16 vars |
| Secrets auto-gerados | ✅ 8 secrets |
| Multi-env (.staging + .production) | ✅ Gerado |
| Audit (MISSING/ORPHANED) | ✅ 0/0 |
| **Pendente: Chaves manuais** | ⚠️ 9 vars |

---

## QUICKSTART (5 MINUTOS)

```bash
# 1. Subir banco local
npm run db:up

# 2. Instalar dependências
npm install

# 3. Rodar migrations
npx prisma migrate dev

# 4. Iniciar dev server
npm run dev
```

**Seu `.env` já está 80% pronto!** As 9 variáveis restantes são opcionais para desenvolvimento local.

---

## CHAVES OBRIGATÓRIAS (Complete para F8)

### 1. EMAIL (Resend) — ⏱️ 5 min

- [ ] Criar conta em https://resend.com
- [ ] Copiar API key (`re_xxxxx`)
- [ ] Colar em `.env`:
  ```
  RESEND_API_KEY=re_xxxxx
  ```

### 2. MONITORAMENTO (Sentry) — ⏱️ 5 min

- [ ] Criar conta em https://sentry.io
- [ ] Criar projeto > Next.js
- [ ] Copiar `NEXT_PUBLIC_SENTRY_DSN` (browser)
- [ ] Copiar `SENTRY_DSN` (server)
- [ ] Copiar `SENTRY_ORG` (Settings > Organization)
- [ ] Gerar auth token em Settings > Auth Tokens
- [ ] Colar em `.env`:
  ```
  NEXT_PUBLIC_SENTRY_DSN=https://...
  SENTRY_DSN=https://...
  SENTRY_ORG=seu-org-slug
  SENTRY_PROJECT=foot-stock
  SENTRY_AUTH_TOKEN=sntrys_xxxxx
  ```

### 3. IA (Anthropic) — ⏱️ 2 min

- [ ] Ir para https://console.anthropic.com
- [ ] API Keys > Create Key
- [ ] Copiar a chave (`sk-ant-xxxxx`)
- [ ] Colar em `.env`:
  ```
  ANTHROPIC_API_KEY=sk-ant-xxxxx
  ```

### 4. VERIFICAÇÃO DE IDADE (FlagCheck) — ⏱️ 10 min

- [ ] Contactar https://www.flagcheck.com.br
- [ ] Solicitar API credentials
- [ ] Receber `API_URL` e `API_KEY`
- [ ] Colar em `.env`:
  ```
  FLAGCHECK_API_URL=https://api.flagcheck.com.br/v1
  FLAGCHECK_API_KEY=xxxxx
  ```

### 5. PAGAMENTOS (Mercado Pago) — ⏱️ 10 min

**Para desenvolvimento, use TEST keys!**

- [ ] Ir para https://www.mercadopago.com.br
- [ ] Painel > Configurações > Credenciais
- [ ] Copiar credenciais de **TESTE** (começam com `sk_test_` / `pk_test_`)
- [ ] Criar webhook em Webhooks
- [ ] Colar em `.env`:
  ```
  ACTIVE_GATEWAY="MERCADO_PAGO"
  MP_ACCESS_TOKEN=APP_USR-[test-token]
  NEXT_PUBLIC_MP_PUBLIC_KEY=APP_USR-[test-public]
  MP_WEBHOOK_SECRET=[webhook-secret]
  ```

### 6. TESTES E2E (Credenciais) — ⏱️ 5 min

- [ ] Gerar email de teste: `craque-test@footstock.app`
- [ ] Gerar senha: algo como `TestCraque123!`
- [ ] Gerar segundo usuário: `jogador-test@footstock.app`
- [ ] Colar em `.env`:
  ```
  TEST_CRAQUE_EMAIL=craque-test@footstock.app
  TEST_CRAQUE_PASSWORD=TestCraque123!
  TEST_JOGADOR_EMAIL=jogador-test@footstock.app
  TEST_JOGADOR_PASSWORD=TestJogador123!
  ```

---

## TEMPO TOTAL

- **Desenvolvimento local:** Pronto agora (sem as 6 chaves acima)
- **Com todas as chaves:** ~45 minutos
- **Build + Deploy:** Adicione chaves também ao `.env.production`

---

## VALIDAR (PRÉ-BUILD)

```bash
# Type checking
npm run typecheck

# Lint
npm run lint

# Testes
npm run test

# Coverage
npm run test:coverage
```

---

## PRODUCTION CHECKLIST

Para quando for fazer deploy:

- [ ] Preencher todas as 9 chaves manualmente (acima)
- [ ] Gerar secrets **ÚNICOS** para production (não reutilizar dev/staging):
  ```bash
  openssl rand -base64 32  # NEXTAUTH_SECRET, CRON_SECRET, etc
  openssl rand -hex 32     # ENCRYPTION_KEY, etc
  uuidgen                  # API_KEY_INTERNAL
  ```
- [ ] Usar `.env.production` como referência
- [ ] Armazenar secrets em:
  - **GitHub Secrets** (para CI/CD)
  - **Railway Environment Variables** (para deploy)
- [ ] **NUNCA** commitar `.env` com valores reais no git

---

## REFERÊNCIA RÁPIDA

| Variável | Tempo | Dificuldade |
|----------|-------|-------------|
| RESEND_API_KEY | 5 min | ⭐️ Fácil |
| SENTRY_* | 5 min | ⭐️ Fácil |
| ANTHROPIC_API_KEY | 2 min | ⭐️ Fácil |
| FLAGCHECK_API_* | 10 min | ⭐️⭐️ Médio |
| MP_* (Mercado Pago) | 10 min | ⭐️⭐️ Médio |
| TEST_* (E2E) | 5 min | ⭐️ Fácil |

**Total:** ~45 min para completar tudo

---

## DOCUMENTAÇÃO COMPLETA

Para instruções **super detalhadas** com screenshots e links diretos:

📄 **`output/docs/foot-stock/ENV-CREATION-REPORT.md`**

Este arquivo tem:
- Links clicáveis para cada serviço
- Passo a passo com screenshots
- Informações de custo
- Documentação oficial
- FAQ

---

## PRÓXIMO COMANDO SUGERIDO

Após preencher as variáveis:

```bash
/create-test-user .claude/projects/foot-stock.json
```

Ou inicie direto:

```bash
npm run dev
```

---

**Status:** ✅ Ambiente pronto para desenvolvimento
**Próximo passo:** Preencher as 6 chaves acima (45 min)
