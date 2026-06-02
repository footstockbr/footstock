# Error Handling & Loading States — FootStock
> Gerado por `/nextjs:error-handling` em 2026-04-01

---

### T001 – Melhorar UI do root error.tsx
**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** COMPLETED
**Arquivos:**
- modificar: `app/error.tsx`

**Descrição:** O `error.tsx` raiz usa `style={{ }}` inline sem Tailwind e sem design tokens do app. Não exibe `error.digest`, não oferece navegação e não segue o dark theme da aplicação.
**Critérios de Aceite:**
- UI com dark theme (bg-bg-primary, text-text-primary, tokens do app)
- Exibe `error.digest` quando disponível
- Botão "Tentar novamente" + link para home
- Logging via Sentry mantido
**Estimativa:** 30min

---

### T002 – Substituir console.error por Sentry em mercado/[ticker]/error.tsx
**Tipo:** SEQUENTIAL
**Dependências:** T001
**Status:** COMPLETED
**Arquivos:**
- modificar: `app/(app)/mercado/[ticker]/error.tsx`

**Descrição:** O `useEffect` no error boundary usa `console.error` em vez de `Sentry.captureException`. Em produção, `console.error` não envia contexto (digest, rota) ao Sentry.
**Critérios de Aceite:**
- Importa `* as Sentry from '@sentry/nextjs'`
- `useEffect` chama `Sentry.captureException(error)` com contexto
- Remove `console.error`
**Estimativa:** 15min

---

### T003 – Adicionar error.tsx ao grupo (admin)
**Tipo:** SEQUENTIAL
**Dependências:** T001
**Status:** COMPLETED
**Arquivos:**
- criar: `app/(admin)/error.tsx`

**Descrição:** Nenhuma rota admin (dashboard, usuarios, financeiro, motor, lgpd, noticias, engajamento) possui error boundary. Todos são client components, mas erros de render não capturados caem no root error.tsx sem contexto admin.
**Critérios de Aceite:**
- error.tsx com dark theme zinc-950 (padrão admin)
- Link de volta ao /admin
- Sentry.captureException com useEffect
- Exibe error.digest
**Estimativa:** 30min

---

### T004 – Adicionar error.tsx ao mercado (list)
**Tipo:** PARALLEL-GROUP-1
**Dependências:** T001
**Status:** COMPLETED
**Arquivos:**
- criar: `app/(app)/mercado/error.tsx`

**Descrição:** A rota `/mercado` usa HydrationBoundary + React Query mas não tem error boundary. Falhas de prefetch/dehydrate caem no root.
**Critérios de Aceite:**
- Usa AppLayout
- Botão reset + link para /mercado
- Sentry.captureException
**Estimativa:** 20min

---

### T005 – Adicionar error.tsx + loading.tsx às ligas
**Tipo:** PARALLEL-GROUP-1
**Dependências:** T001
**Status:** COMPLETED
**Arquivos:**
- criar: `app/(app)/ligas/error.tsx`
- criar: `app/(app)/ligas/[id]/error.tsx`
- criar: `app/(app)/ligas/[id]/loading.tsx`

**Descrição:** `/ligas` e `/ligas/[id]` não têm error boundary nem loading skeleton. A rota dinâmica também faz query Prisma em `generateMetadata` sem notFound().
**Critérios de Aceite:**
- error.tsx com AppLayout, reset + voltar
- loading.tsx com skeleton de card e layout
- Sentry em ambos os error.tsx
**Estimativa:** 45min

---

### T006 – Adicionar notFound() em ligas/[id]/page.tsx
**Tipo:** SEQUENTIAL
**Dependências:** T005
**Status:** COMPLETED
**Arquivos:**
- modificar: `app/(app)/ligas/[id]/page.tsx`

**Descrição:** O `generateMetadata` faz `prisma.league.findUnique` mas ignora resultado null. Se a liga não existir, o metadata retorna string genérica e a página não chama `notFound()`.
**Critérios de Aceite:**
- Import `notFound` de `next/navigation` no page.tsx
- `generateMetadata` chama `notFound()` se `league` for null
- Sem alteração na renderização do componente `LeagueDetail`
**Estimativa:** 15min

---

### T007 – Adicionar error.tsx ao portal do afiliado
**Tipo:** PARALLEL-GROUP-1
**Dependências:** T001
**Status:** COMPLETED
**Arquivos:**
- criar: `app/(affiliate)/affiliate/error.tsx`

**Descrição:** `/affiliate` faz fetchAffiliateMetrics e fetchBankData sem boundary. Falhas expõem tela em branco.
**Critérios de Aceite:**
- Design compatível com affiliate layout (bg-[#080808])
- Botão reset
- Sentry.captureException
**Estimativa:** 20min

---

### T008 – Adicionar error.tsx ao portal do clube
**Tipo:** PARALLEL-GROUP-1
**Dependências:** T001
**Status:** COMPLETED
**Arquivos:**
- criar: `app/(club)/club/error.tsx`

**Descrição:** `/club` usa Suspense para fetchClubMetrics mas não tem error boundary para erros fora dos Suspense (render errors, erros de layout).
**Critérios de Aceite:**
- Design compatível com club layout (bg-[#080808])
- Botão reset + link para /club/login
- Sentry.captureException
**Estimativa:** 20min

---

### T009 – Adicionar error.tsx ao assessor IA
**Tipo:** PARALLEL-GROUP-1
**Dependências:** T001
**Status:** COMPLETED
**Arquivos:**
- criar: `app/(app)/assessor/error.tsx`

**Descrição:** `/assessor` usa Suspense mas não tem error boundary. Falhas do streaming do assessor IA não são tratadas.
**Critérios de Aceite:**
- Usa AppLayout
- Mensagem contextual sobre indisponibilidade da IA
- Botão reset + link para /mercado
- Sentry.captureException
**Estimativa:** 20min

---

### T010 – Adicionar loading.tsx ao grupo (admin)
**Tipo:** PARALLEL-GROUP-2
**Dependências:** T003
**Status:** COMPLETED
**Arquivos:**
- criar: `app/(admin)/loading.tsx`

**Descrição:** Nenhuma rota admin tem loading.tsx. Durante navegação SSR entre rotas admin, não há feedback visual.
**Critérios de Aceite:**
- Skeleton com layout de admin (sidebar + main)
- bg-zinc-950, skeletons zinc-800
- aria-hidden nos skeletons
**Estimativa:** 30min

---

### T011 – Adicionar loading.tsx ao portal do afiliado
**Tipo:** PARALLEL-GROUP-2
**Dependências:** T007
**Status:** COMPLETED
**Arquivos:**
- criar: `app/(affiliate)/affiliate/loading.tsx`

**Descrição:** `/affiliate` faz fetches de métricas no servidor (data fetching nas funções async) e não tem loading skeleton.
**Critérios de Aceite:**
- Skeleton com cards de métricas (4 KPIs + tabela)
- bg-[#080808], skeleton zinc-800
- aria-hidden
**Estimativa:** 25min

---
