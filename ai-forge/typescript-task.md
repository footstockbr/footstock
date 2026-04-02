# TypeScript — Task List (nextjs:typescript)
Gerado em: 2026-04-02
Workspace: output/workspace/foot-stock

---

### T001 – Corrigir TS2345: AssetFilters → queryKeys.assets.list
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `lib/constants/query-keys.ts`

**Descrição:** `queryKeys.assets.list(filters?: Record<string, unknown>)` não aceita `AssetFilters` porque a interface não possui index signature. Erro `TS2345` em `hooks/useMarketData.ts:22`.
**Critérios de Aceite:** Parâmetro tipado como `AssetFilters | Record<string, unknown> | undefined`; `tsc --noEmit` sem TS2345.
**Estimativa:** 0.25h
**Status:** COMPLETED

---

### T002 – Remover `as any` em ShortService (Prisma include inference)
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `lib/services/ShortService.ts`

**Descrição:** `position` é carregado com `include: { asset: { select: { ticker, currentPrice } } }` mas acessado via `(position as any).asset.ticker`. O tipo correto é `Prisma.PositionGetPayload<{ include: { asset: { select: { ticker: true, currentPrice: true } } } }>`.
**Critérios de Aceite:** `as any` removidos das linhas 191–196; acesso `position.asset.ticker` e `position.asset.currentPrice` tipados sem asserção.
**Estimativa:** 0.5h
**Status:** COMPLETED

---

### T003 – Corrigir mismatch de tipo em NewsInjectionService.impact
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `lib/services/NewsInjectionService.ts`

**Descrição:** `sentimentToImpact()` retorna `'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'` mas `NewsInjectEvent.impact` exige `ImpactCategory`. O `as any` ocultava que o DTO já carregava `dto.impactCategory` (ImpactCategory correto). Fix: usar `dto.impactCategory` diretamente e remover import de `sentimentToImpact`.
**Critérios de Aceite:** `as any` removido; `impact` recebe `dto.impactCategory` (ImpactCategory válida).
**Estimativa:** 0.25h
**Status:** COMPLETED

---

### T004 – Tipar anthropic.beta.messages e textBlock em AIAdvisorService
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `lib/services/AIAdvisorService.ts`

**Descrição:** `(anthropic.beta.messages as any).create(...)` e `(textBlock as any)?.text` suprimem erros de tipos da SDK Anthropic. Usar `BetaMessages` type local para o beta e `import type { TextBlock }` do SDK para o path normal.
**Critérios de Aceite:** Sem `as any`; `tsc --noEmit` limpo.
**Estimativa:** 0.5h
**Status:** COMPLETED

---

### T005 – Tipar SponsorLeague no route admin/sponsors
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `app/api/v1/admin/sponsors/[id]/leagues/route.ts`

**Descrição:** `(prisma as any).sponsorLeague` — model `SponsorLeague` não existe no schema Prisma. Fix: `PrismaWithSponsorLeague` type local com `// TODO: adicionar model ao schema` e `as PrismaWithSponsorLeague` narrowed cast.
**Critérios de Aceite:** `as any` removido; `l: any` substituído por `SponsorLeagueRecord`; compila sem erros.
**Estimativa:** 0.5h
**Status:** COMPLETED

---

### T006 – Catch blocks de produção (N/A — já coberto por strict)
**Tipo:** N/A
**Descrição:** Com `strict: true` e `useUnknownInCatchVariables: true` (habilitado automaticamente), todos os catch variables já são `unknown`. Os blocks existentes já usam `instanceof Error` corretamente. Sem ação necessária.
**Status:** NOT_NEEDED
