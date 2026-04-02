# Security Tasks — Foot Stock

> Gerado por: `/nextjs:security`  
> Data: 2026-04-02  
> Workspace: `output/workspace/foot-stock`

---

### T001 - Remover credenciais hardcoded de dev-test-users.ts para variável de ambiente ou .env.test

**Severidade:** MÉDIA  
**OWASP:** A08 (Data Integrity Failures)  
**Tipo:** SEQUENTIAL  
**Dependências:** none  
**Arquivos:**
- modificar: `lib/constants/dev-test-users.ts`
- modificar: `app/api/v1/auth/login/route.ts`

**Descrição:**
`DEV_TEST_USERS` contém senhas hardcoded (ex: `Test@1234!SuperAdmin`) commitadas no código-fonte TypeScript. Embora protegidas por `process.env.NODE_ENV !== 'production'`, essas senhas estão versionadas no git e poderiam ser exploradas se a variável de ambiente for configurada incorretamente em produção ou se o repositório for comprometido.

Solução: mover as senhas para variáveis de ambiente (ex: `DEV_TEST_PASSWORD_ADMIN`) ou para um arquivo `.env.test` ignorado pelo git. Manter o mapeamento de emails/roles, mas nunca senhas literais no fonte.

**Critérios de Aceite:**
- [ ] Nenhuma senha literal em `lib/constants/dev-test-users.ts`
- [ ] Senhas lidas de `process.env.*` ou `.env.test` (ignorado no .gitignore)
- [ ] Login de dev continua funcional em `NODE_ENV=development`
- [ ] Teste de login dev não quebrado

**Estimativa:** 1h

---

### T002 - Corrigir interpolação insegura de $queryRaw com INTERVAL em nsm.ts

**Severidade:** MÉDIA  
**OWASP:** A03 (Injection)  
**Tipo:** SEQUENTIAL  
**Dependências:** none  
**Arquivos:**
- modificar: `lib/monitoring/nsm.ts`

**Descrição:**
`lib/monitoring/nsm.ts:131` usa `prisma.$queryRaw` com template literal que interpola `${days}` dentro de uma string SQL `INTERVAL '${days} days'`. Em Prisma, interpolações em `$queryRaw` dentro de strings SQL literais não são parametrizadas corretamente pelo driver PostgreSQL — o valor é concatenado na string antes de envio. Embora `days` seja sempre hardcoded (7, 30), o padrão é incorreto e perigoso se `days` um dia vier de input externo.

Solução: usar `Prisma.sql` com `Prisma.raw` para o INTERVAL ou reescrever como `NOW() - (${days} * INTERVAL '1 day')` para garantir parametrização correta.

**Critérios de Aceite:**
- [ ] Query usa `Prisma.sql` template tag ou parametrização segura para INTERVAL
- [ ] Dados NSM continuam retornando corretamente
- [ ] Nenhum dado de usuário exposto

**Estimativa:** 30min

---

### T003 - Adicionar poweredByHeader: false e corrigir X-Frame-Options em next.config.ts

**Severidade:** BAIXA  
**OWASP:** A05 (Security Misconfiguration)  
**Tipo:** SEQUENTIAL  
**Dependências:** none  
**Arquivos:**
- modificar: `next.config.ts`

**Descrição:**
1. `poweredByHeader` não está definido (padrão: `true`) → header `X-Powered-By: Next.js` expõe a tecnologia para atacantes.
2. `X-Frame-Options: SAMEORIGIN` contradiz `frame-ancestors 'none'` no CSP. CSP `frame-ancestors` tem precedência em browsers modernos, mas `X-Frame-Options` deveria ser consistente. Para máxima proteção, alinhar para `DENY` ou remover `X-Frame-Options` (já coberto pelo CSP).

**Critérios de Aceite:**
- [ ] `poweredByHeader: false` no `nextConfig`
- [ ] `X-Frame-Options` alterado para `DENY` ou removido
- [ ] Headers verificados com `curl -I` ou middleware test

**Estimativa:** 15min

---

### T004 - Substituir Math.random() por crypto.randomBytes em account-deletion.ts

**Severidade:** BAIXA  
**OWASP:** A02 (Cryptographic Failures)  
**Tipo:** SEQUENTIAL  
**Dependências:** none  
**Arquivos:**
- modificar: `lib/services/account-deletion.ts`

**Descrição:**
`lib/services/account-deletion.ts:31` usa `Math.random()` na composição do `anonymousId` para anonimização LGPD. `Math.random()` não é criptograficamente seguro — um atacante com acesso ao estado do gerador poderia potencialmente reconstruir o ID. Para dados de anonimização LGPD, usar `crypto.randomBytes(16).toString('hex')` garante aleatoriedade criptográfica.

**Critérios de Aceite:**
- [ ] `Math.random()` removido de `account-deletion.ts`
- [ ] `crypto.randomBytes` ou `crypto.randomUUID` usado no lugar
- [ ] `anonymousId` continua único e não-reversível

**Estimativa:** 15min

---

### T005 - Atualizar jest-environment-jsdom para corrigir 4 vulnerabilidades low

**Severidade:** BAIXA (dev-only)  
**OWASP:** A06 (Vulnerable Components)  
**Tipo:** PARALLEL-GROUP-1  
**Dependências:** none  
**Arquivos:**
- modificar: `package.json`

**Descrição:**
`npm audit` detectou 4 vulnerabilidades low em `jest-environment-jsdom` (via `@tootallnate/once` e `jsdom`). Impacto apenas em CI/desenvolvimento — não afeta produção. Fix disponível via `npm audit fix --force` (breaking change: atualiza para `jest-environment-jsdom@30.x`). Verificar compatibilidade dos testes antes de aplicar.

**Critérios de Aceite:**
- [ ] `npm audit` sem vulnerabilidades em dev dependencies
- [ ] Todos os testes unitários passando após atualização
- [ ] `jest.config.ts` compatível com nova versão

**Estimativa:** 30min
