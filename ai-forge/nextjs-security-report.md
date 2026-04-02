# PRD: Correções de Segurança — Foot Stock

> Gerado por: `/nextjs:security`  
> Data: 2026-04-02

---

## Vulnerabilidades Encontradas

### CRÍTICAS (Corrigir Imediatamente)
_Nenhuma encontrada._

### ALTAS (Corrigir em 24h)
_Nenhuma encontrada._

### MÉDIAS (Corrigir em 1 semana)

| Arquivo | Linha | OWASP | Descrição |
|---------|-------|-------|-----------|
| `lib/constants/dev-test-users.ts` | 1-80 | A08 | Senhas de dev hardcoded no código-fonte versionado |
| `lib/monitoring/nsm.ts` | 131 | A03 | `$queryRaw` com interpolação de INTERVAL sem parametrização segura |

### BAIXAS (Corrigir no próximo sprint)

| Arquivo | Linha | OWASP | Descrição |
|---------|-------|-------|-----------|
| `next.config.ts` | 38 | A05 | `poweredByHeader` não desativado (expõe tecnologia) |
| `next.config.ts` | 18 | A05 | `X-Frame-Options: SAMEORIGIN` conflita com CSP `frame-ancestors 'none'` |
| `lib/services/account-deletion.ts` | 31 | A02 | `Math.random()` usado em geração de anonymousId LGPD |
| `package.json` | — | A06 | 4 vulnerabilidades low em jest-environment-jsdom (dev-only) |

---

## Dependências Vulneráveis

| Pacote | Versão | Severidade | Descrição |
|--------|--------|------------|-----------|
| `jest-environment-jsdom` | 27.0.1–30.0.0-rc.1 | Low | via `@tootallnate/once` / `jsdom` — dev-only |

---

## Headers de Segurança

| Header | Status | Recomendação |
|--------|--------|--------------|
| Content-Security-Policy | OK | Implementado com `script-src`, `frame-ancestors 'none'`, etc. |
| Strict-Transport-Security | OK | `max-age=63072000; includeSubDomains; preload` |
| X-Frame-Options | CONFLITO | `SAMEORIGIN` — alinhar com CSP (`DENY`) |
| X-Content-Type-Options | OK | `nosniff` |
| Referrer-Policy | OK | `origin-when-cross-origin` |
| Permissions-Policy | OK | `camera=(), microphone=(), geolocation=()` |
| X-DNS-Prefetch-Control | OK | `on` |
| X-Powered-By | Exposto | Adicionar `poweredByHeader: false` |

---

## OWASP Top 10 Coverage

| ID | Categoria | Status | Evidência |
|----|-----------|--------|-----------|
| A01 | Broken Access Control | OK | `withAuth/withAdmin` lê roles do DB; middleware protege todas as rotas; cron via CRON_SECRET |
| A02 | Cryptographic Failures | BAIXO | `Math.random()` em account-deletion.ts para anonimização |
| A03 | Injection | MÉDIO | `$queryRaw` com INTERVAL interpolado em nsm.ts (hardcoded, mas padrão inseguro) |
| A04 | Insecure Design | OK | Rate limiting em auth/webhook/reset-password; HMAC em webhooks |
| A05 | Security Misconfiguration | BAIXO | poweredByHeader exposto; X-Frame-Options conflita com CSP |
| A06 | Vulnerable Components | BAIXO | 4 low CVEs em jest-environment-jsdom (dev-only) |
| A07 | Auth Failures | OK | Supabase session + DB role verification; httpOnly cookies; rate limiting; sem localStorage |
| A08 | Data Integrity Failures | MÉDIO | Senhas de dev hardcoded em `lib/constants/dev-test-users.ts` |
| A09 | Logging Failures | OK (observação) | 167 console.log/error em src — sem PII ou tokens detectados em chamadas críticas |
| A10 | SSRF | OK | Fetches externos via URLs hardcoded de gateways (Mercado Pago, PagSeguro, PayPal) |

---

## Risco Geral: BAIXO

O projeto apresenta boas práticas de segurança implementadas: autenticação server-side com Supabase, roles sempre lidas do banco (não dos claims JWT), CRON_SECRET em todos os cron jobs, HMAC em webhooks, rate limiting em endpoints críticos, CSP configurado, HSTS ativo, CORS sem wildcard. As vulnerabilidades encontradas são de severidade média-baixa.

---

## Próximos Passos Recomendados

1. Executar T001-T004 antes do deploy de produção
2. Implementar Gitleaks pre-commit hook (já documentado em SECURITY-AUDIT-2026-04-01.md)
3. Configurar Dependabot para atualização automática de dependências
4. Adicionar scanning de secrets no CI/CD (TruffleHog)
