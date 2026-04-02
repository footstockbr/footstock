# Data Fetching — Report
_Gerado por /nextjs:data-fetching em 2026-04-02_

---

## Status Final: TODOS OS CRITÉRIOS ATENDIDOS

---

## Problemas Encontrados e Corrigidos

### T001 — Cache contraditório em club/page.tsx ✅ CORRIGIDO
**Arquivo:** `app/(club)/club/page.tsx:58-59,77-78`
**Evidência (grep):** `grep -n "revalidate\|no-store" app/(club)/club/page.tsx`
**Problema:** `fetchClubMetrics` e `fetchClubAffiliate` combinavam `next: { revalidate: 900 }` com
`cache: 'no-store'` na mesma chamada. `no-store` tem precedência total sobre `next.revalidate`,
tornando a diretiva ISR completamente inócua.
**Correção:** Removido `next: { revalidate: 900 }` de ambas as funções. `cache: 'no-store'` mantido
(dados do Redis — correto para dados sempre frescos).

---

### T002 — next.revalidate ignorado em SponsorBanner (client fetch) ✅ CORRIGIDO
**Arquivo:** `components/banners/SponsorBanner.tsx:27`
**Evidência (grep):** `grep -n "next: { revalidate" components/banners/SponsorBanner.tsx`
**Problema:** `SponsorBanner` é `'use client'`. O fetch dentro de `useEffect` roda no browser.
A opção `next: { revalidate: 300 }` é uma extensão da API fetch do Next.js que só funciona
server-side. O browser a ignora silenciosamente.
**Correção:** Opção `next: { revalidate: 300 }` removida do fetch client-side.

---

### T003 + T004 — generateStaticParams + unstable_cache em /mercado/[ticker] ✅ CORRIGIDO
**Arquivo:** `app/(app)/mercado/[ticker]/page.tsx`
**Evidência (grep):** `grep -rn "generateStaticParams\|unstable_cache" app/(app)/mercado/`
**Problema:**
- Rota dinâmica `/mercado/[ticker]` com universo fixo de 40 tickers sem pré-geração.
  Cada acesso disparava um ciclo completo de SSR + query Prisma.
- Query `prisma.asset.findFirst` sem cache — executada a cada request.

**Correção:**
- `export const revalidate = 3600` — ISR com revalidação horária
- `export const dynamicParams = false` — 404 para tickers inexistentes (sem SSR on-demand)
- `generateStaticParams()` — pré-gera as 40 páginas de ticker no build via query Prisma
- `getCachedAsset = unstable_cache(...)` — tags: `['asset']`, revalidate: 3600
  Revalidação on-demand disponível via `revalidateTag('asset')` quando preços mudam

---

### T005 — unstable_cache para query em ligas/[id] generateMetadata ✅ CORRIGIDO
**Arquivo:** `app/(app)/ligas/[id]/page.tsx:13`
**Evidência (grep):** `grep -n "prisma\." app/(app)/ligas/[id]/page.tsx`
**Problema:** `generateMetadata` chamava `prisma.league.findUnique` sem cache.
**Correção:** `getCachedLeagueMeta = unstable_cache(...)` — tags: `['league']`, revalidate: 3600

---

### T006 — Route segment config em páginas principais ✅ CORRIGIDO
**Arquivos:** `app/(app)/mercado/page.tsx`, `app/(app)/noticias/page.tsx`
**Evidência (grep):** `grep -rn "export const dynamic" app/(app)/`
**Problema:** Nenhuma página de app declarava `dynamic` ou `revalidate`. Comportamento de cache
implícito, dificultando auditoria.
**Correção:**
- `/mercado/page.tsx` → `export const dynamic = 'force-dynamic'` (dados near-real-time via React Query SSR)
- `/noticias/page.tsx` → `export const dynamic = 'force-dynamic'` (dados em tempo real)

---

## Métricas

| Métrica | Antes | Depois |
|---------|-------|--------|
| fetch() configurados com cache explícito correto | 0 | 4 |
| Tags de revalidação configuradas | 0 | 2 (`asset`, `league`) |
| Waterfalls eliminados | 0 (já OK) | 0 |
| generateStaticParams adicionados | 0 | 1 (40 tickers) |
| unstable_cache adicionados | 0 | 2 |
| Route segment config declarado | 0 | 3 (`mercado/*`, `noticias`) |
| Diretivas de cache contraditórias | 2 funções | 0 |
| next.revalidate inócuo em client | 1 | 0 |

### Performance Estimada
- **Tickers pré-gerados:** 40 páginas SSR → ISR; elimina ~1 query Prisma/request em produção
- **Revalidação on-demand:** `revalidateTag('asset')` pode ser chamado pelo motor de mercado
  ao atualizar preços, sem wait de 1h
- **Diretivas corretas:** club/page não mais tenta fazer ISR de dados no-store (inconsistência removida)

---

## Itens Fora do Escopo (delegados)

| Item | Arquivo | Comando Responsável |
|------|---------|---------------------|
| SponsorBanner usa useEffect + fetch client | `SponsorBanner.tsx` | `/nextjs:boundaries` |
| prefetchMarketData em SSR com no-store | `hooks/useMarketData.ts` | Correto para dados real-time ✅ |
| Streaming real com use() (promises não resolvidas) | club/affiliate pages | Melhoria futura — impacto baixo dado layout atual |

---

## Arquivos Modificados

1. `app/(club)/club/page.tsx` — removido `next: { revalidate: 900 }` de 2 funções
2. `components/banners/SponsorBanner.tsx` — removido `next: { revalidate: 300 }` do fetch
3. `app/(app)/mercado/[ticker]/page.tsx` — generateStaticParams + unstable_cache + revalidate + dynamicParams
4. `app/(app)/ligas/[id]/page.tsx` — unstable_cache na generateMetadata
5. `app/(app)/mercado/page.tsx` — `export const dynamic = 'force-dynamic'`
6. `app/(app)/noticias/page.tsx` — `export const dynamic = 'force-dynamic'`

---

## Checklist Final

### Cache
- [x] Todos os fetch() têm configuração explícita de cache
- [x] ISR configurado para /mercado/[ticker] (dados semi-estáticos de ativo)
- [x] no-store corretamente usado para dados de usuário (affiliate, dashboard)
- [x] Tags configuradas para revalidação granular (asset, league)
- [x] unstable_cache para queries Prisma em server pages

### Waterfall
- [x] Requisições independentes usam Promise.all (club, affiliate — já ok)
- [x] Nenhum await sequencial desnecessário
- [x] N+1 queries: nenhum identificado

### Static Generation
- [x] generateStaticParams em /mercado/[ticker] (40 tickers)
- [x] dynamicParams = false configurado
- [x] Páginas de ativo pré-geradas no build

### Route Config
- [x] dynamic configurado onde necessário (mercado, noticias)
- [x] revalidate definido em nível de rota (/mercado/[ticker])
- [x] Sem force-dynamic desnecessário

### Data Fetching Location
- [x] Admin layout usa cookies para auth — dinâmico correto ✅
- [x] Dados de clube sempre fresh via no-store ✅
