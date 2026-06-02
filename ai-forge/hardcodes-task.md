# Hardcodes Task List — FootStock

**Gerado em:** 2026-04-01  
**REPO_PATH:** `output/workspace/foot-stock`  
**Total de hardcodes:** ~65 ocorrências  
**Prioridade:** HIGH → MEDIUM → LOW

---

## Grupo 1 — Criar/Estender Arquivos de Enums e Constantes (PARALLEL-GROUP-1)

### T001 — Adicionar USER_STATUS, NEWS_STATUS, LEAGUE_STATUS e HEALTH_STATUS a `lib/enums/index.ts`
**Tipo:** SEQUENTIAL  
**Dependências:** none  
**Arquivos:**
- modificar: `lib/enums/index.ts`

**Descrição:**  
Adicionar enums ausentes que estão sendo usados como strings hardcoded:
- `USER_STATUS` → `ACTIVE | SUSPENDED | BANNED | FREE`
- `NEWS_STATUS` → `DRAFT | PUBLISHED | ARCHIVED`
- `LEAGUE_STATUS` → `ACTIVE | FINISHED | CANCELLED`
- `HEALTH_STATUS` → `ok | error | degraded`
- `MOTOR_STATUS` → `ONLINE | OFFLINE | DEGRADED`

**Evidências:**
- `app/api/v1/admin/users/[id]/ban/route.ts:72` → `target.status === 'BANNED'`
- `app/api/v1/admin/news/editorial/route.ts:38-48` → `status === 'PUBLISHED'|'DRAFT'|'ARCHIVED'`
- `app/api/v1/leagues/[id]/join/route.ts:25` → `league.status === 'FINISHED'`
- `components/admin/SystemStatus.tsx:146,276,277,283` → `status === 'error'|'degraded'|'ok'`
- `components/admin/MotorStateCard.tsx:101` → `status === 'OFFLINE'`
- `components/plans/SubscriptionStatus.tsx:184` → `status === 'FREE'`

**Critérios de Aceite:**
- [ ] `USER_STATUS` exportado com os 4 valores + type `UserStatusType`
- [ ] `NEWS_STATUS` exportado com os 3 valores + type `NewsStatus`
- [ ] `LEAGUE_STATUS` exportado com os 3 valores + type `LeagueStatus`
- [ ] `HEALTH_STATUS` exportado com os 3 valores + type `HealthStatus`
- [ ] `MOTOR_STATUS` exportado + type `MotorStatus`
- [ ] Build passando

---

### T002 — Adicionar rotas ausentes a `lib/constants/routes.ts`
**Tipo:** SEQUENTIAL  
**Dependências:** none  
**Arquivos:**
- modificar: `lib/constants/routes.ts`

**Descrição:**  
Adicionar ao objeto `ROUTES` as rotas usadas no código mas não declaradas:
- `ADMIN_LOGIN: '/admin/login'`
- `ADMIN_ENGAJAMENTO: '/admin/engajamento'`
- `ADMIN_MOTOR: '/admin/motor'`
- `ADMIN_FINANCEIRO: '/admin/financeiro'`
- `ADMIN_MODERACAO: '/admin/moderacao'`
- `ADMIN_PATROCINADORES: '/admin/patrocinadores'`
- `CLUB: '/club'`
- `CLUB_LOGIN: '/club/login'`
- `AFFILIATE: '/affiliate'`
- `PLANOS_HISTORICO: '/planos/historico'`
- `TERMOS: '/termos'`
- `GLOSSARIO: '/glossario'`

**Evidências:**
- `app/(admin)/layout.tsx:67` → `redirect('/admin/login')`
- `app/(admin)/AdminLayoutClient.tsx:51` → `router.push('/admin/login?reason=timeout')`
- `app/(club)/club/error.tsx:43` → `href="/club/login"`
- `app/(club)/club/login/page.tsx:95` → `router.push('/club')`
- `app/(affiliate)/affiliate/error.tsx:43` → `href="/affiliate"`
- `app/(app)/planos/PlansPageClient.tsx:190` → `href="/planos/historico"`
- `components/plans/PlanComparison.tsx:75` → `href="/termos"`

**Critérios de Aceite:**
- [ ] 12 rotas adicionadas ao objeto ROUTES
- [ ] Função auxiliar `ADMIN_LOGIN_WITH_REASON: (reason: string) => \`/admin/login?reason=\${reason}\`` adicionada
- [ ] Build passando

---

### T003 — Adicionar timings ausentes a `lib/constants/timing.ts`
**Tipo:** SEQUENTIAL  
**Dependências:** none  
**Arquivos:**
- modificar: `lib/constants/timing.ts`

**Descrição:**  
Adicionar constantes de timing que estão sendo usadas inline:
- `COPY_FEEDBACK_MS = 2_000` — reset do estado "copiado" (3 usos idênticos)
- `PIX_SUCCESS_DELAY_MS = 1_500` — delay após confirmação PIX
- `ADMIN_POLL_FAST_MS = 15_000` — polling rápido de admin/motor
- `ADMIN_POLL_SLOW_MS = 5 * 60_000` — polling lento de dashboard admin (300_000)
- `SYSTEM_COOLDOWN_MS = 5_000` — cooldown de botão no SystemStatus
- `REDIRECT_DELAY_MS = 1_000` — delay antes de redirect pós-ação

**Evidências:**
- `components/affiliate/AffiliateMetrics.tsx:29` → `setTimeout(() => setCopied(false), 2000)`
- `components/club/AffiliatePanel.tsx:36` → `setTimeout(() => setCopied(false), 2000)`
- `components/leagues/InviteLink.tsx:21` → `setTimeout(() => setCopied(false), 2000)`
- `components/payments/PixQRModal.tsx:66` → `setTimeout(onSuccess, 1500)`
- `components/layout/AppHeader.tsx:56` → `setInterval(update, 15_000)`
- `components/admin/MotorStateCard.tsx:64` → `setInterval(fetchStatus, 15_000)`
- `app/(admin)/admin/page.tsx:69` → `setInterval(fetchData, 5 * 60 * 1000)`
- `app/(admin)/admin/engajamento/page.tsx:83` → `setInterval(fetchData, 5 * 60 * 1000)`
- `components/admin/SystemStatus.tsx:142` → `setTimeout(() => setCooldown(false), 5000)`
- `components/auth/register/Step4Terms.tsx:57` → `setTimeout(() => router.push(ROUTES.ONBOARDING), 1000)`

**Nota:** `InboxIcon.tsx:23` usa `30_000` que já existe como `NOTIFICATION_POLL_MS` — corrigir para usar a constante.  
**Nota:** `SubscriptionStatus.tsx:49` usa `1000` para tick de countdown — deixar inline (específico de domínio).

**Critérios de Aceite:**
- [ ] 6 constantes adicionadas ao `timing.ts`
- [ ] Build passando

---

### T004 — Criar `lib/constants/query-keys.ts` com Query Key Factory
**Tipo:** SEQUENTIAL  
**Dependências:** none  
**Arquivos:**
- criar: `lib/constants/query-keys.ts`
- modificar: `lib/constants/index.ts`

**Descrição:**  
Criar Query Key Factory centralizada para todas as entidades.

**Keys identificadas nos hooks:**
- `['forum']` — ForumClient.tsx, PostList.tsx
- `['news', ticker]` — NewsFeed.tsx
- `['leagues', type]`, `['my-leagues']`, `['league', id]`, `['league-ranking', id]` — useLeagues.ts
- `['dividends']` — DividendHistory.tsx
- `['price-history', ticker, period]` — usePriceHistory.ts
- `['transactions', filter, page]` — useTransactions.ts
- `['current-user']` — useCurrentUser.ts
- `['assets', filters]` — useMarketData.ts

**Critérios de Aceite:**
- [ ] Arquivo criado com `queryKeys` factory para 8 entidades
- [ ] Exportado no barrel `lib/constants/index.ts`
- [ ] Build passando

---

### T005 — Adicionar MESSAGES ausentes a `lib/constants/messages.ts` e criar STORAGE_KEYS
**Tipo:** SEQUENTIAL  
**Dependências:** none  
**Arquivos:**
- modificar: `lib/constants/messages.ts`
- criar: `lib/constants/storage-keys.ts`
- modificar: `lib/constants/index.ts`

**Descrição:**  
Adicionar ao `MESSAGES` as mensagens usadas inline em toasts:
- `MESSAGES.FORUM.POST_LIKED_ERROR`, `MESSAGES.FORUM.POST_DELETE_ERROR`, `MESSAGES.FORUM.POST_PUBLISHED`, `MESSAGES.FORUM.LIMIT_REACHED`, `MESSAGES.FORUM.POST_PUBLISH_ERROR`
- `MESSAGES.AFFILIATE.BANK_SAVED`, `MESSAGES.AFFILIATE.BANK_SAVE_ERROR`
- `MESSAGES.PROFILE.AVATAR_SIZE_ERROR`, `MESSAGES.PROFILE.AVATAR_UPLOAD_ERROR`, `MESSAGES.PROFILE.BIO_UPDATED`, `MESSAGES.PROFILE.ACCOUNT_DELETE_SUBSCRIPTION_ERROR`, `MESSAGES.PROFILE.ACCOUNT_DELETE_ERROR`
- `MESSAGES.AUTH.REGISTER_WELCOME`
- `MESSAGES.SUBSCRIPTION.DIVIDEND_REINVESTED`

Criar `lib/constants/storage-keys.ts` com:
- `STORAGE_KEYS.WEBAUTHN_ENABLED: (email: string) => \`webauthn_enabled:\${email}\``

**Evidências:**
- `components/forum/PostList.tsx:88,100`
- `components/forum/CreatePost.tsx:85,97,100`
- `components/affiliate/AffiliateBankConfig.tsx:76,80,82`
- `components/profile/ProfilePageClient.tsx:79,81,92,96,106,115,118,121,134`
- `components/auth/register/Step4Terms.tsx:52,56,60`
- `components/portfolio/DividendHistory.tsx:175`
- `components/auth/WebAuthnButton.tsx:24`

**Critérios de Aceite:**
- [ ] 15+ mensagens adicionadas ao `messages.ts`
- [ ] `storage-keys.ts` criado e exportado
- [ ] Build passando

---

## Grupo 2 — Substituir Hardcodes nos Arquivos (SEQUENTIAL pós Grupo 1)

### T006 — Substituir status strings por enums em rotas de API
**Tipo:** SEQUENTIAL  
**Dependências:** T001  
**Arquivos:**
- modificar: `app/api/v1/affiliate/me/route.ts`
- modificar: `app/api/v1/admin/users/[id]/ban/route.ts`
- modificar: `app/api/v1/admin/news/editorial/[id]/route.ts`
- modificar: `app/api/v1/admin/news/editorial/route.ts`
- modificar: `app/api/v1/admin/lgpd/dashboard/route.ts`
- modificar: `app/api/v1/club/affiliate/route.ts`
- modificar: `app/api/v1/leagues/[id]/join/route.ts`
- modificar: `app/api/v1/leagues/invite/[token]/route.ts`

**Descrição:**  
Substituir comparações com strings literais pelos enums:
- `'PAID'` → `PAYMENT_STATUS.PAID`
- `'BANNED'` → `USER_STATUS.BANNED`
- `'SUSPENDED'` → `USER_STATUS.SUSPENDED`
- `'PUBLISHED'` → `NEWS_STATUS.PUBLISHED`
- `'DRAFT'` → `NEWS_STATUS.DRAFT`
- `'ARCHIVED'` → `NEWS_STATUS.ARCHIVED`
- `'FINISHED'` → `LEAGUE_STATUS.FINISHED`

**Critérios de Aceite:**
- [ ] Nenhuma string literal de status nas rotas afetadas
- [ ] Imports dos enums adicionados
- [ ] Build passando

---

### T007 — Substituir status strings em components admin/planos
**Tipo:** SEQUENTIAL  
**Dependências:** T001  
**Arquivos:**
- modificar: `components/plans/SubscriptionStatus.tsx`
- modificar: `components/payments/PixQRModal.tsx`
- modificar: `components/admin/usuarios/UserDetailRow.tsx`
- modificar: `components/admin/usuarios/SuspendDialog.tsx`
- modificar: `components/admin/usuarios/AdminsTab.tsx`
- modificar: `components/admin/usuarios/JogadoresTab.tsx`
- modificar: `components/admin/MotorStateCard.tsx`
- modificar: `components/admin/ModerationPageClient.tsx`
- modificar: `components/admin/SystemStatus.tsx`
- modificar: `components/admin/news/NewsEditorPanel.tsx`
- modificar: `components/admin/news/NewsListSection.tsx`
- modificar: `app/(app)/planos/PlansPageClient.tsx`
- modificar: `app/(admin)/admin/financeiro/page.tsx`
- modificar: `app/api/v1/admin/admins/route.ts`

**Critérios de Aceite:**
- [ ] `USER_STATUS.*` substituindo strings literais em todos os components
- [ ] `NEWS_STATUS.*` substituindo strings literais
- [ ] `ADMIN_ROLE.*` substituindo `'SUPER_ADMIN'`
- [ ] `SUBSCRIPTION_STATUS.*` já existia — confirmar que os usos em `SubscriptionStatus.tsx` estão corretos
- [ ] Build passando

---

### T008 — Substituir rotas hardcoded por constantes `ROUTES`
**Tipo:** SEQUENTIAL  
**Dependências:** T002  
**Arquivos:**
- modificar: `app/(admin)/layout.tsx`
- modificar: `app/(admin)/AdminLayoutClient.tsx`
- modificar: `app/(club)/club/error.tsx`
- modificar: `app/(club)/club/login/page.tsx`
- modificar: `app/(affiliate)/affiliate/sem-permissao/page.tsx`
- modificar: `app/(affiliate)/affiliate/error.tsx`
- modificar: `app/(app)/planos/PlansPageClient.tsx`
- modificar: `app/(admin)/admin/login/page.tsx`
- modificar: `components/plans/PlanComparison.tsx`
- modificar: `components/admin/AdminBreadcrumb.tsx`
- modificar: `components/leagues/LeagueDetail.tsx`
- modificar: `components/market/DelayBadge.tsx`
- modificar: `components/portfolio/DividendHistory.tsx`

**Exceção:** Os arquivos `app/(app)/*/page.tsx` que contêm apenas um `redirect()` são aliases de rota EN→PT — manter assim, são intencionais (não são hardcodes de lógica).

**Critérios de Aceite:**
- [ ] `ROUTES.ADMIN_LOGIN`, `ROUTES.CLUB_LOGIN`, etc. usados nos arquivos afetados
- [ ] Nenhum path literal de navegação fora dos alias pages
- [ ] Build passando

---

### T009 — Substituir fetch inline por `API_ROUTES`
**Tipo:** SEQUENTIAL  
**Dependências:** none  
**Arquivos:**
- modificar: `app/(auth)/onboarding/page.tsx`

**Descrição:**  
Substituir `fetch("/api/v1/users/me")` por `fetch(API_ROUTES.USERS.ME)`.

**Evidências:**
- `app/(auth)/onboarding/page.tsx:29` → `fetch("/api/v1/users/me")`
- `app/(auth)/onboarding/page.tsx:50` → `fetch("/api/v1/users/me", {...})`

**Critérios de Aceite:**
- [ ] `API_ROUTES` importado e usado
- [ ] Build passando

---

### T010 — Substituir timings inline por constantes de `timing.ts`
**Tipo:** SEQUENTIAL  
**Dependências:** T003  
**Arquivos:**
- modificar: `components/affiliate/AffiliateMetrics.tsx`
- modificar: `components/club/AffiliatePanel.tsx`
- modificar: `components/leagues/InviteLink.tsx`
- modificar: `components/payments/PixQRModal.tsx` (linha 66 apenas — linha 105 já usa `COPY_RESET_MS`)
- modificar: `components/layout/AppHeader.tsx`
- modificar: `components/admin/MotorStateCard.tsx`
- modificar: `components/admin/SystemStatus.tsx`
- modificar: `components/inbox/InboxIcon.tsx`
- modificar: `app/(admin)/admin/page.tsx`
- modificar: `app/(admin)/admin/engajamento/page.tsx`
- modificar: `app/(admin)/admin/motor/page.tsx`
- modificar: `components/auth/register/Step4Terms.tsx`

**Critérios de Aceite:**
- [ ] Todos os `setTimeout`/`setInterval` inline substituídos por constantes nomeadas
- [ ] `InboxIcon.tsx` importando e usando `NOTIFICATION_POLL_MS` existente
- [ ] Build passando

---

### T011 — Substituir toast messages inline por `MESSAGES`
**Tipo:** SEQUENTIAL  
**Dependências:** T005  
**Arquivos:**
- modificar: `components/forum/PostList.tsx`
- modificar: `components/forum/CreatePost.tsx`
- modificar: `components/affiliate/AffiliateBankConfig.tsx`
- modificar: `components/club/AffiliateConfig.tsx`
- modificar: `components/profile/ProfilePageClient.tsx`
- modificar: `components/auth/register/Step4Terms.tsx`
- modificar: `components/portfolio/DividendHistory.tsx`

**Critérios de Aceite:**
- [ ] Strings inline de toast substituídas por `MESSAGES.*`
- [ ] `MESSAGES` importado corretamente em cada arquivo
- [ ] Build passando

---

### T012 — Centralizar query keys nos hooks
**Tipo:** SEQUENTIAL  
**Dependências:** T004  
**Arquivos:**
- modificar: `hooks/useLeagues.ts`
- modificar: `hooks/usePriceHistory.ts`
- modificar: `hooks/useTransactions.ts`
- modificar: `hooks/useCurrentUser.ts`
- modificar: `hooks/useMarketData.ts`
- modificar: `components/forum/PostList.tsx`
- modificar: `components/forum/ForumClient.tsx`
- modificar: `components/news/NewsFeed.tsx`
- modificar: `components/leagues/CreateLeagueForm.tsx`
- modificar: `components/portfolio/DividendHistory.tsx`

**Critérios de Aceite:**
- [ ] Todos os hooks usando `queryKeys.*` factory
- [ ] `invalidateQueries` usando factory keys (type-safe)
- [ ] Build passando

---

### T013 — Centralizar localStorage key do WebAuthn
**Tipo:** SEQUENTIAL  
**Dependências:** T005  
**Arquivos:**
- modificar: `components/auth/WebAuthnButton.tsx`

**Descrição:**  
Substituir `` `webauthn_enabled:${email}` `` por `STORAGE_KEYS.WEBAUTHN_ENABLED(email)`.

**Critérios de Aceite:**
- [ ] `STORAGE_KEYS` importado e usado
- [ ] Build passando

---

## Verificação Final

```bash
# Status strings restantes (deve ser 0 fora de enums e constantes):
grep -rn "status === ['\"]" app/ components/ lib/ --include="*.ts" --include="*.tsx"

# Rotas hardcoded restantes:
grep -rn 'href="/' components/ app/ --include="*.tsx" | grep -v "redirect\|alias\|enum"

# Query keys não centralizadas:
grep -rn "queryKey: \['" hooks/ components/ --include="*.ts" --include="*.tsx"

# Toast inline:
grep -rn "toast\.(success|error)\(['\"]" components/ app/ --include="*.tsx"
```
