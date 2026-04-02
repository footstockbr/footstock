# Data Fetching — Task List
_Gerado por /nextjs:data-fetching em 2026-04-02_

---

### T001 - Corrigir cache contraditório em club/page.tsx

**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** COMPLETED
**Arquivos:**
- modificar: `app/(club)/club/page.tsx`

**Descrição:**
`fetchClubMetrics` e `fetchClubAffiliate` combinam `next: { revalidate: 900 }` com `cache: 'no-store'`
simultaneamente. O comentário "// sempre fresh do Redis" indica que a intenção é sempre buscar dados
frescos — portanto `cache: 'no-store'` é correto e `next: { revalidate: 900 }` é inócuo (no-store
tem precedência, ignorando o revalidate). Remover a opção conflitante.

**Evidência:**
- `app/(club)/club/page.tsx:58-59` — fetchClubMetrics
- `app/(club)/club/page.tsx:77-78` — fetchClubAffiliate

**Critérios de Aceite:**
- [ ] Cada fetch tem apenas UMA diretiva de cache (não ambas)
- [ ] `cache: 'no-store'` mantido (dados de usuário/Redis — correto)
- [ ] `next: { revalidate: 900 }` removido (conflitante)

---

### T002 - Remover next.revalidate inócuo do SponsorBanner

**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** COMPLETED
**Arquivos:**
- modificar: `components/banners/SponsorBanner.tsx`

**Descrição:**
`SponsorBanner` é `'use client'`. O fetch dentro de `useEffect` roda no browser. A opção
`next: { revalidate: 300 }` passada ao fetch é ignorada pelo browser — ela só tem efeito
em fetches server-side do Next.js. Remover a opção para evitar confusão semântica.

**Evidência:**
- `components/banners/SponsorBanner.tsx:27` — `next: { revalidate: 300 }` em useEffect

**Critérios de Aceite:**
- [ ] `next: { revalidate: 300 }` removido do fetch do SponsorBanner
- [ ] Comportamento de runtime inalterado (browser não respeitava o revalidate de qualquer forma)

---

### T003 - Adicionar generateStaticParams em /mercado/[ticker]

**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** COMPLETED
**Arquivos:**
- modificar: `app/(app)/mercado/[ticker]/page.tsx`

**Descrição:**
A rota `/mercado/[ticker]` é dinâmica mas tem um universo fixo de 40 tickers ativos.
Cada acesso gera um SSR completo (query Prisma por request). Com `generateStaticParams`,
as 40 páginas são pré-geradas no build e re-validadas via ISR a cada hora. Adicionar
também `export const revalidate = 3600` e `export const dynamicParams = false`.

**Evidência:**
- `app/(app)/mercado/[ticker]/page.tsx` — sem generateStaticParams
- `prisma.asset.findFirst` na linha 50 — executa em todo request

**Critérios de Aceite:**
- [ ] `generateStaticParams` exportado, busca todos os tickers ativos via Prisma
- [ ] `export const revalidate = 3600` declarado
- [ ] `export const dynamicParams = false` declarado

---

### T004 - Adicionar unstable_cache para query Prisma em /mercado/[ticker]

**Tipo:** SEQUENTIAL
**Dependências:** T003
**Status:** COMPLETED
**Arquivos:**
- modificar: `app/(app)/mercado/[ticker]/page.tsx`

**Descrição:**
A query `prisma.asset.findFirst` em `/mercado/[ticker]/page.tsx:50` é executada sem nenhum
cache entre requests. Wrapping com `unstable_cache` garante que requests simultâneos para o
mesmo ticker não batam no DB múltiplas vezes, e que o resultado seja cacheado no Data Cache
do Next.js com tag para revalidação on-demand.

**Evidência:**
- `app/(app)/mercado/[ticker]/page.tsx:50` — prisma sem cache

**Critérios de Aceite:**
- [ ] Query Prisma wrapped em `unstable_cache` com tag `['asset', ticker]`
- [ ] `revalidate: 3600` configurado no cache
- [ ] Revalidação on-demand possível via `revalidateTag('asset')`

---

### T005 - Adicionar unstable_cache para query Prisma em ligas/[id] generateMetadata

**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Status:** COMPLETED
**Arquivos:**
- modificar: `app/(app)/ligas/[id]/page.tsx`

**Descrição:**
A `generateMetadata` de `/ligas/[id]` faz query Prisma (league.findUnique) a cada render
sem cache. Com `unstable_cache`, a query é cacheada com tag para revalidação incremental.

**Evidência:**
- `app/(app)/ligas/[id]/page.tsx:13` — prisma.league.findUnique sem cache

**Critérios de Aceite:**
- [ ] Query Prisma em generateMetadata wrapped em `unstable_cache`
- [ ] Tag `['league', id]` configurada
- [ ] `revalidate: 3600` configurado

---

### T006 - Adicionar route segment config nas páginas principais

**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Status:** COMPLETED
**Arquivos:**
- modificar: `app/(app)/mercado/page.tsx`
- modificar: `app/(app)/noticias/page.tsx`
- modificar: `app/(app)/dashboard/page.tsx`
- modificar: `app/(app)/carteira/page.tsx`

**Descrição:**
Nenhuma página de app declara `dynamic` ou `revalidate`. O comportamento de cache
é implícito, dificultando auditoria e diagnóstico de performance.

- `/mercado` — prefetch SSR com `no-store` → `export const dynamic = 'force-dynamic'`
- `/noticias` — só renderiza cliente, sem dados server-side → `export const dynamic = 'force-dynamic'`
- `/dashboard` — só client component, sem dados server-side → sem config necessária (correto)
- `/carteira` — só client component → sem config necessária (correto)

**Critérios de Aceite:**
- [ ] `/mercado/page.tsx` tem `export const dynamic = 'force-dynamic'`
- [ ] `/noticias/page.tsx` tem `export const dynamic = 'force-dynamic'`
- [ ] Páginas puramente client (dashboard, carteira) sem config desnecessária ✅
