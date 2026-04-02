# Performance Tasks — Foot Stock
> Gerado por `/nextjs:performance` em 2026-04-02
> Config: `.claude/projects/foot-stock.json`
> Workspace: `output/workspace/foot-stock`

---

## T001 – Web Vitals não configurados
**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** TODO
**Arquivos:**
- criar: `app/vitals.ts`
- modificar: `app/layout.tsx`

**Descrição:**
Nenhum arquivo do projeto usa `web-vitals` (`onLCP`, `onCLS`, `onINP`, `onFCP`, `onTTFB`). Para um app financeiro com preços em tempo real, a ausência de medição de Web Vitals impede identificar regressões de performance em produção. LCP e INP são especialmente críticos na rota `/mercado` (lista de 40 ativos atualizada via SSE).

**Critérios de Aceite:**
- [ ] `web-vitals` importado e configurado em `app/vitals.ts`
- [ ] `onCLS`, `onLCP`, `onINP`, `onFCP`, `onTTFB` reportados via `navigator.sendBeacon` ou `fetch keepalive`
- [ ] Integração com Sentry (já configurado) via `Sentry.captureMessage` ou endpoint `/api/v1/metrics`
- [ ] `reportWebVitals` exportado de `app/layout.tsx`

**Estimativa:** 2h

---

## T002 – SSR Prefetch quebrado em `/mercado`
**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** TODO
**Arquivos:**
- modificar: `app/(app)/mercado/page.tsx`

**Descrição:**
Em `app/(app)/mercado/page.tsx`, `prefetchMarketData` (importado de `@/hooks/useMarketData`) existe e está pronto para uso, mas **nunca é chamado**. O `QueryClient` é criado vazio e dehydratado vazio, causando flash de loading na rota mais crítica do app. O cliente recebe HTML sem dados e faz fetch adicional ao montar — impacto direto no LCP.

```typescript
// ATUAL (quebrado) — QueryClient vazio, sem prefetch
const queryClient = new QueryClient()
// prefetchMarketData(queryClient) nunca chamado

// ESPERADO
const queryClient = new QueryClient()
await prefetchMarketData(queryClient)
```

**Critérios de Aceite:**
- [ ] `prefetchMarketData(queryClient)` chamado antes de `dehydrate(queryClient)`
- [ ] Build sem erro de tipo
- [ ] Navegação para `/mercado` não exibe skeleton de carregamento no SSR (dados disponíveis no HTML inicial)

**Estimativa:** 1h

---

## T003 – React.memo ausente em AssetCard (hot path SSE)
**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** TODO
**Arquivos:**
- modificar: `components/market/AssetCard.tsx`
- modificar: `components/market/MarketList.tsx`

**Descrição:**
`AssetCard` é o componente mais renderizado do app: até 40 instâncias ativas na virtualizer. A cada tick SSE, `useMarketTick` atualiza o `Map<string, TickData>`, causando re-render de `MarketPage` → `MarketList` → todos os `AssetCard` visíveis. Sem `React.memo`, cards cujo ticker **não mudou** re-renderizam igualmente, incluindo `usePriceFlash` (useState + useEffect + setTimeout) desnecessariamente.

O comparator deve checar `asset.ticker`, `tick?.price`, `tick?.changePercent`, `isStreamConnected` e `isFavorite`.

**Critérios de Aceite:**
- [ ] `AssetCard` envolto em `React.memo` com comparator custom
- [ ] React Profiler confirma que cards sem tick atualizado não re-renderizam
- [ ] Comportamento de flash e navegação preservados

**Estimativa:** 2h

---

## T004 – Inline callbacks em MarketPage
**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** TODO
**Arquivos:**
- modificar: `components/market/MarketPage.tsx`

**Descrição:**
`MarketPage` é re-renderizada a cada tick SSE (recebe `ticks` e `isStreamConnected` do hook). Três lambdas inline criam novas referências a cada render:
- `onLoadMore={() => fetchNextPage()}` — L114
- `onClear={() => setSearchValue('')}` — L74
- `() => refetch()` no botão de retry — L99

Além disso, `clearFilters` (L57) é declarado como `function` regular sem `useCallback`, e `activeFilters` (L31) é um objeto literal criado a cada render.

**Critérios de Aceite:**
- [ ] `clearFilters` envolto em `useCallback`
- [ ] `onLoadMore`, `onClear` e retry estabilizados com `useCallback`
- [ ] `activeFilters` calculado com `useMemo` (deps: `filters`, `searchValue`)
- [ ] Build e lint sem warnings

**Estimativa:** 1h

---

## T005 – sort/filter sem useMemo em PositionsList
**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** TODO
**Arquivos:**
- modificar: `components/portfolio/PositionsList.tsx`
- modificar: `components/portfolio/PositionCard.tsx`

**Descrição:**
Em `PositionsList` (L43-45), `.filter((p) => !p.isShort).sort(...)` executa a cada render sem memoização. O sort usa multiplicação de floats — barato isolado, mas acumulado com rerenders causa trabalho desnecessário.

Em `PositionCard`, `onBuyMore` e `onSell` são passados como `() => router.push(...)` diretamente do map em `PositionsList` (L68-70), criando novas referências a cada render.

**Critérios de Aceite:**
- [ ] `regular` calculado com `useMemo` (deps: `positions`)
- [ ] Handlers `onBuyMore` e `onSell` estabilizados com `useCallback` no nível do map ou via `PositionCard` memoizado
- [ ] `PositionCard` envolto em `React.memo` (comparator padrão suficiente)

**Estimativa:** 1.5h

---

## T006 – ForumClient handlers sem useCallback
**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** TODO
**Arquivos:**
- modificar: `components/forum/ForumClient.tsx`

**Descrição:**
`handlePostSuccess` (L31) é definido como função regular dentro do componente. É passado como prop para `CreatePost` e `PostList`, criando nova referência a cada render do `ForumClient`. Como `ForumClient` re-renderiza ao mudar `ticker`, `sort` ou `isCreatePostOpen`, isso força re-renders desnecessários nos filhos.

**Critérios de Aceite:**
- [ ] `handlePostSuccess` envolto em `useCallback` (deps: `isMobile`)
- [ ] Build sem erros

**Estimativa:** 30min

---

## T007 – PositionsList sem React.memo + ariaLabel recomputado
**Tipo:** PARALLEL-GROUP-1
**Dependências:** T005
**Status:** TODO
**Arquivos:**
- modificar: `components/portfolio/PositionCard.tsx`

**Descrição:**
Em `PositionCard` (L51-53), `ariaLabel` é construído com `.filter(Boolean).join(', ')` a cada render. É um array de strings com condicionais computadas na hora. Dado que `PositionCard` pode re-renderizar por ticks de preço via `currentPrice`, este cálculo é repetido sem necessidade.

**Critérios de Aceite:**
- [ ] `ariaLabel` calculado com `useMemo` (deps: `position.ticker`, `position.pnLPercent`, `position.pnL`)
- [ ] `pnlColor` e `pnlArrow` movidos para `useMemo` se `PositionCard` for memoizado (T005)

**Estimativa:** 30min

---

## Resumo de Prioridade

| Task | Severidade | Impacto | Estimativa |
|------|-----------|---------|-----------|
| T001 | CRÍTICA | Sem visibilidade de Web Vitals em produção | 2h |
| T002 | CRÍTICA | Flash de loading desnecessário em `/mercado` (LCP) | 1h |
| T003 | ALTA | 40 rerenders desnecessários por tick SSE | 2h |
| T004 | ALTA | Nova função reference a cada render SSE em MarketPage | 1h |
| T005 | MÉDIA | Sort/filter sem memoização + inline handlers em PositionsList | 1.5h |
| T006 | MÉDIA | ForumClient handlers instáveis | 30min |
| T007 | BAIXA | ariaLabel recomputado em PositionCard | 30min |

**Total estimado:** ~8.5h

---

## Checklist Final

- [ ] React.memo/useMemo/useCallback aplicados em AssetCard, PositionCard, MarketPage, PositionsList, ForumClient
- [ ] SSR prefetch corrigido em `/mercado`
- [ ] Web Vitals configurados e reportados
- [ ] Inline lambdas removidas em componentes de hot path (SSE)
- [ ] Leaks de memory/effects: sem novos leaks introduzidos
- [ ] `npm run lint` limpo após cada task
- [ ] `npm run build` bem-sucedido após todas as tasks
- [ ] Bundle analyzer: `npm run analyze` executado para confirmar sem regressão de bundle
