<metadata>
source: /nextjs:architecture code review
repo: output/workspace/foot-stock
date: 2026-04-01
estimated-hours: 14
complexity: medium
config: .claude/projects/foot-stock.json
</metadata>

<overview>
O projeto Foot Stock tem arquitetura layer-based sólida com lib/services, lib/repositories, hooks/ e types/ bem estruturados.
Os problemas centrais são: (1) duplicação de componentes UI entre components/feedback/ e components/ui/ — a maioria usa ui/ mas feedback/ tem versões canônicas mais completas; (2) utilitário fsCurrency redefinido localmente em 2 componentes quando formatFS já existe em lib/utils/formatCurrency; (3) PLAN_LABELS redefinido em 4 arquivos quando já centralizado em lib/constants/labels; (4) God Component em usuarios/page.tsx (1123 linhas, 26 useState).
</overview>

<task-list>

### T001 — Consolidar EmptyState: feedback/ → ui/

**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `components/ui/EmptyState.tsx`
- modificar: `components/news/NewsFeed.tsx` (único que importa de feedback/)
- deletar: `components/feedback/EmptyState.tsx`
- modificar: `components/feedback/index.ts`

**Descrição:**
`components/feedback/EmptyState.tsx` é a versão canônica completa (usa `action?: ReactNode`, tokens de design, `text-text-muted`).
`components/ui/EmptyState.tsx` tem TODO de substituição, usa `children?: ReactNode` em vez de `action`.
Mesclar as duas interfaces em `components/ui/EmptyState.tsx`: suportar tanto `action?: ReactNode` quanto `children?: ReactNode`, manter `aria-label`, usar tokens de design (`text-text-muted`/`text-text-secondary`).
Atualizar o único import de `feedback/` em `NewsFeed.tsx`.
Remover o arquivo de `feedback/` e sua re-export em `feedback/index.ts`.

**Evidência:** `grep -rn "from.*EmptyState" components app --include="*.tsx"` — 18 usos em ui/, 1 em feedback/ (NewsFeed.tsx:12)

**Critérios de Aceite:**
- [ ] Interface unificada aceita `action` e `children`
- [ ] Tokens dark theme aplicados (`text-text-muted`, `text-text-secondary`)
- [ ] `NewsFeed.tsx` importa de `@/components/ui/EmptyState`
- [ ] `components/feedback/EmptyState.tsx` removido
- [ ] Build sem erros

**Estimativa:** 1h

---

### T002 — Consolidar ErrorState: feedback/ → ui/

**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `components/ui/ErrorState.tsx`
- deletar: `components/feedback/ErrorState.tsx`
- modificar: `components/feedback/index.ts`

**Descrição:**
`components/feedback/ErrorState.tsx` é a versão canônica: tem `title` prop, usa `Btn` do design system, usa `text-error` token, SVG de alerta.
`components/ui/ErrorState.tsx` tem TODO, usa `<button>` nativo com cor hardcoded `text-[#F0B90B]`.
Substituir o conteúdo de `components/ui/ErrorState.tsx` pela implementação de `feedback/`, adicionando `compact` prop e `role="alert"` da versão ui.
Nenhum componente importa diretamente de `feedback/ErrorState` — apenas a re-export de `feedback/index.ts`.

**Evidência:** `grep -rn "from.*ErrorState" components app --include="*.tsx"` — todos usam `components/ui/ErrorState`

**Critérios de Aceite:**
- [ ] Interface unificada: `title?`, `message`, `onRetry?`, `compact?`, `className?`
- [ ] Usa `Btn` e `text-error` token
- [ ] `components/feedback/ErrorState.tsx` removido
- [ ] Build sem erros

**Estimativa:** 45min

---

### T003 — Consolidar Skeleton: feedback/ → ui/ e criar SkeletonText

**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `components/ui/Skeleton.tsx`
- deletar: `components/feedback/Skeleton.tsx`
- modificar: `components/feedback/index.ts`

**Descrição:**
`components/feedback/Skeleton.tsx` tem `SkeletonText` (múltiplas linhas) e usa classe CSS `skeleton` (provavelmente definida em globals.css).
`components/ui/Skeleton.tsx` tem TODO, usa `animate-pulse bg-[#1e2a3a]` inline.
Verificar em `globals.css` se existe a classe `.skeleton` com o shimmer correto. Se sim, usar a classe. Se não, usar `animate-pulse` com token de design.
Adicionar `SkeletonText` ao `components/ui/Skeleton.tsx` e exportar pelo `components/ui/index.ts`.
Remover `feedback/Skeleton.tsx`.

**Evidência:**
- `grep -rn "from.*Skeleton" components app --include="*.tsx"` — 20+ usos em ui/Skeleton, nenhum em feedback/Skeleton diretamente

**Critérios de Aceite:**
- [ ] `SkeletonText` disponível em `components/ui/Skeleton`
- [ ] Shimmer consistente com globals.css ou animate-pulse token
- [ ] `components/ui/index.ts` exporta `SkeletonText`
- [ ] `components/feedback/Skeleton.tsx` removido
- [ ] Build sem erros

**Estimativa:** 45min

---

### T004 — Remover feedback/ após consolidação das 3 tasks anteriores

**Tipo:** SEQUENTIAL
**Dependências:** T001, T002, T003
**Arquivos:**
- verificar: `components/feedback/index.ts` (confirmar sem exports órfãos)
- deletar: `components/feedback/LoadingSpinner.tsx`
- deletar: `components/feedback/` (pasta inteira se vazia)

**Descrição:**
Após T001-T003, `components/feedback/` conterá apenas `LoadingSpinner.tsx` e `index.ts`.
`LoadingSpinner.tsx` não tem uso direto além de feedback/index.ts — verificar se algum arquivo importa dele. Se não, remover. Se sim, mover para `components/ui/`.
Verificar `ai/LoadingSkeleton.tsx` — já importa de `components/ui/Skeleton`, não de `feedback/`.
Remover a pasta `feedback/` completamente.
Atualizar imports se necessário.

**Critérios de Aceite:**
- [ ] `grep -r "feedback/" components app` retorna 0 resultados
- [ ] Build sem erros

**Estimativa:** 30min

---

### T005 — Substituir fsCurrency local por formatFS de lib/utils/formatCurrency

**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `components/market/AssetDetailPage.tsx` (linha 66: remove função local)
- modificar: `components/market/AssetStats.tsx` (linha 32: remove função local)

**Descrição:**
Ambos os arquivos definem localmente:
```typescript
function fsCurrency(value: number): string {
  return `FS$${value.toFixed(2)}`  // simplificado
}
```
Já existe `formatFS(value: number)` em `lib/utils/formatCurrency.ts` com suporte a compact, separadores pt-BR e proteção contra NaN.
Remover a função local e substituir chamadas por `formatFS` de `@/lib/utils/formatCurrency`.

**Evidência:**
- `components/market/AssetDetailPage.tsx:66` e `components/market/AssetStats.tsx:32` — funções idênticas
- `lib/utils/formatCurrency.ts` — `formatFS` já exportado e re-exportado por `lib/index.ts`

**Critérios de Aceite:**
- [ ] `function fsCurrency` removido de ambos os arquivos
- [ ] `import { formatFS } from '@/lib/utils/formatCurrency'` adicionado
- [ ] Todos os usos de `fsCurrency(x)` substituídos por `formatFS(x)`
- [ ] Build e testes de AssetCard passando

**Estimativa:** 30min

---

### T006 — Centralizar PLAN_LABELS: remover redefinições locais

**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `app/(admin)/admin/usuarios/page.tsx` (linha 50)
- modificar: `components/affiliate/AffiliateHistory.tsx` (linha 44)
- modificar: `components/onboarding/plan-cards.tsx` (linha 7)
- modificar: `app/(app)/planos/historico/page.tsx` (linha 7)

**Descrição:**
`PLAN_LABELS` já está centralizado em `lib/constants/labels.ts`. Quatro arquivos redefinem localmente com os mesmos valores.
Substituir definições locais por import de `@/lib/constants/labels` ou `@/lib` (via barrel).

Atenção para `AffiliateHistory.tsx` — tem STATUS_LABELS local específico para `AffiliateConversion['status']` que NÃO existe em labels.ts. Manter esse STATUS_LABELS local ou criar entrada em labels.ts se fizer sentido.

Para `planos/historico/page.tsx` — tem STATUS_LABELS e PAYMENT_STATUS_LABELS com estrutura `{ label, color }` específica do componente. Manter locais.

**Evidência:**
```bash
grep -rn "^const PLAN_LABELS" components app --include="*.tsx"
# 3 ocorrências além do arquivo fonte
```

**Critérios de Aceite:**
- [ ] Nenhuma redefinição local de `PLAN_LABELS: Record<PlanType, string>` fora de `lib/constants/labels.ts`
- [ ] `import { PLAN_LABELS } from '@/lib/constants/labels'` (ou `@/lib`)
- [ ] Build sem erros

**Estimativa:** 45min

---

### T007 — Centralizar ADMIN_ROLE_LABELS

**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Arquivos:**
- modificar: `lib/constants/labels.ts` (adicionar `ADMIN_ROLE_LABELS`)
- modificar: `components/profile/ProfilePageClient.tsx` (linha 22)
- modificar: `components/layout/AppHeader.tsx` (linha 16: useMemo inline)

**Descrição:**
`ADMIN_ROLE_LABELS` é definido como constante em `ProfilePageClient.tsx` e mapeado inline via `useMemo` em `AppHeader.tsx`.
Adicionar `ADMIN_ROLE_LABELS: Record<AdminRole, string>` em `lib/constants/labels.ts`.
`ProfilePageClient.tsx`: remover definição local, importar de `@/lib/constants/labels`.
`AppHeader.tsx`: substituir `useMemo` com map manual por import direto de `ADMIN_ROLE_LABELS[user.adminRole]`.

**Critérios de Aceite:**
- [ ] `ADMIN_ROLE_LABELS` em `lib/constants/labels.ts`
- [ ] Nenhuma redefinição local
- [ ] Build sem erros

**Estimativa:** 30min

---

### T008 — Decompor usuarios/page.tsx (1123 linhas, 26 useState)

**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- criar: `components/admin/usuarios/SuspendDialog.tsx`
- criar: `components/admin/usuarios/ResetBalanceDialog.tsx`
- criar: `components/admin/usuarios/UserDetailRow.tsx`
- criar: `components/admin/usuarios/JogadoresTab.tsx`
- criar: `components/admin/usuarios/AdminsTab.tsx`
- modificar: `app/(admin)/admin/usuarios/page.tsx`

**Descrição:**
O arquivo tem 1123 linhas com funções-componente claramente delimitadas por comentários. Já existe uma estrutura natural:
- `SuspendDialog` (linhas 76-155) — mover para arquivo próprio
- `ResetBalanceDialog` (linhas 167-222) — mover para arquivo próprio
- `UserDetailRow` (linhas 224-412) — mover para arquivo próprio
- `JogadoresTab` (linhas 421-714) — mover para arquivo próprio
- `AdminsTab` (linhas 724-1039) — mover para arquivo próprio
- `AdminUsuariosPage` (linhas 1040+) — fica no page.tsx, orquestra

Criar `components/admin/usuarios/` para colocar os subcomponentes.
Aplicar T006 (PLAN_LABELS) durante este refactor.
Tipos locais (`AdminUser`, `RegularUser`, `PaginationMeta`) devem ser movidos para arquivo de types da feature ou mantidos em arquivo `components/admin/usuarios/types.ts`.

**Critérios de Aceite:**
- [ ] `usuarios/page.tsx` com < 100 linhas (apenas orquestração)
- [ ] 5 subcomponentes criados em `components/admin/usuarios/`
- [ ] Sem duplicação de lógica
- [ ] Build sem erros
- [ ] Funcionalidade de busca, paginação, suspensão e ban preservadas

**Estimativa:** 4h

---

### T009 — Decompor PlansPageClient.tsx (382 linhas, 13 useState)

**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- criar: `hooks/usePlansCheckout.ts`
- criar: `hooks/useSubscriptionData.ts`
- modificar: `app/(app)/planos/PlansPageClient.tsx`

**Descrição:**
`PlansPageClient.tsx` tem 13 useState misturando lógica de fetch de subscription, lógica de checkout, lógica de countdown de retry e estado de UI.
Extrair hooks:
- `useSubscriptionData()` — encapsula `fetchSubscription`, `subscription`, `isLoadingSubscription`, `networkError`, `welcomePlan`
- `usePlansCheckout({ selectedPlan, selectedGateway, selectedPeriod, onSuccess })` — encapsula `isCheckingOut`, `isCancelling`, `error`, `retryAfterCountdown`, `handleCheckout`, `handleCancelConfirm`, `handleLiquidate`

O componente principal mantém apenas: seleção de plano/período/gateway (UX state) e a renderização.

**Critérios de Aceite:**
- [ ] `PlansPageClient.tsx` com ≤ 5 useState
- [ ] `useSubscriptionData` e `usePlansCheckout` criados em `hooks/`
- [ ] `hooks/index.ts` atualizado com exports
- [ ] Build sem erros

**Estimativa:** 2h

---

### T010 — Decompor admin/noticias/page.tsx (511 linhas, 13 useState)

**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- criar: `components/admin/news/NewsListSection.tsx`
- criar: `components/admin/news/NewsEditorPanel.tsx`
- criar: `components/admin/news/NewsInjectorPanel.tsx`
- modificar: `app/(admin)/admin/noticias/page.tsx`

**Descrição:**
Analisar as seções lógicas de `noticias/page.tsx` e extrair subcomponentes mantendo o estado compartilhado no componente pai ou via context local.
A lógica de lista, editor e injeção são responsabilidades distintas.

**Critérios de Aceite:**
- [ ] `noticias/page.tsx` com < 150 linhas
- [ ] 3 subcomponentes em `components/admin/news/`
- [ ] Build sem erros

**Estimativa:** 2h

---

### T011 — Validar e limpar feedback/index.ts após T001-T004

**Tipo:** SEQUENTIAL
**Dependências:** T001, T002, T003, T004
**Arquivos:**
- deletar: `components/feedback/` (se vazia ou só com index.ts vazio)

**Descrição:**
Após as tarefas de consolidação, verificar se ainda existem imports de `@/components/feedback` em qualquer arquivo. Remover a pasta se não houver mais usos.

**Critérios de Aceite:**
- [ ] `grep -r "@/components/feedback" .` retorna 0 resultados
- [ ] `components/feedback/` removida ou vazia
- [ ] Build sem erros, testes passando

**Estimativa:** 15min

</task-list>

<validation-strategy>
- `npm run build` após cada task para garantir zero erros de compilação
- `npm run test` para verificar que testes existentes passam (especialmente AssetCard.test.tsx e portfolio/)
- Verificar que `grep -rn "function fsCurrency" components app` retorna 0 após T005
- Verificar que `grep -rn "^const PLAN_LABELS" components app` retorna 0 após T006
- Verificar que `grep -rn "from.*feedback/" components app` retorna 0 após T004
</validation-strategy>

<acceptance-criteria>
- [ ] Pasta `components/feedback/` removida ou vazia — componentes consolidados em `components/ui/`
- [ ] `fsCurrency` local eliminado — usa `formatFS` de `lib/utils/formatCurrency`
- [ ] `PLAN_LABELS` centralizado — sem redefinições locais em componentes
- [ ] `ADMIN_ROLE_LABELS` centralizado em `lib/constants/labels`
- [ ] `usuarios/page.tsx` < 100 linhas de orquestração
- [ ] `PlansPageClient.tsx` ≤ 5 useState
- [ ] Build passando
- [ ] Testes passando
</acceptance-criteria>
