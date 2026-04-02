# nextjs:architecture — Report
**Repo:** output/workspace/foot-stock
**Data:** 2026-04-01
**Config:** .claude/projects/foot-stock.json

---

## Status Geral: ATENÇÃO — 6 categorias com achados acionáveis

---

## 1. Duplicação de Código

### 1.1 Componentes duplicados: `components/feedback/` vs `components/ui/`

| Componente | feedback/ (canônico) | ui/ (placeholder/TODO) | Impacto |
|---|---|---|---|
| EmptyState | ✅ completo, tokens design, `action` prop | ⚠️ TODO, hardcoded colors, `children` prop | 1 arquivo usa feedback/, 18 usam ui/ |
| ErrorState | ✅ completo, usa `Btn`, `text-error` token, SVG alerta | ⚠️ TODO, `text-[#F0B90B]` hardcoded, `<button>` nativo | todos usam ui/ |
| Skeleton | ✅ tem `SkeletonText`, usa classe `.skeleton` | ⚠️ TODO, `bg-[#1e2a3a]` hardcoded | 20+ usam ui/, nenhum usa feedback/ diretamente |

**Evidência:**
```bash
grep -rn "from.*EmptyState" components app --include="*.tsx"
# components/news/NewsFeed.tsx:12: from '@/components/feedback/EmptyState'  ← único
# 18 outros arquivos: from '@/components/ui/EmptyState'
```

**Ação:** Tasks T001-T004 — consolidar feedback/ → ui/ e remover pasta feedback/.

---

### 1.2 `fsCurrency` definida localmente em vez de usar `formatFS`

**Evidência:**
```bash
grep -rn "function fsCurrency" components app --include="*.tsx"
# components/market/AssetDetailPage.tsx:66  ← definida localmente
# components/market/AssetStats.tsx:32       ← definida localmente
```

Já existe `formatFS(value: number, options?)` em `lib/utils/formatCurrency.ts` com suporte a compact, separadores pt-BR e proteção contra `NaN`. `PriceDisplay` também existe em `components/ui/PriceDisplay.tsx` para exibição com indicador colorido de variação.

**Ação:** Task T005.

---

### 1.3 `PLAN_LABELS` redefinido em 4 arquivos

`lib/constants/labels.ts` centraliza `PLAN_LABELS: Record<PlanType, string>`. Quatro arquivos redefinem com os mesmos valores:

| Arquivo | Linha | Redefinição local |
|---|---|---|
| `app/(admin)/admin/usuarios/page.tsx` | 50 | `PLAN_LABELS: Record<PlanType, string>` |
| `components/affiliate/AffiliateHistory.tsx` | 44 | `PLAN_LABELS: Record<AffiliateConversion['planType'], string>` |
| `components/onboarding/plan-cards.tsx` | 7 | `PLAN_LABELS: Record<PlanType, string>` |
| `app/(app)/planos/historico/page.tsx` | 7 | `PLAN_LABELS: Record<string, string>` (loosely typed) |

**Ação:** Task T006.

---

### 1.4 `ADMIN_ROLE_LABELS` sem centralização

| Arquivo | Padrão |
|---|---|
| `components/profile/ProfilePageClient.tsx:22` | `const ADMIN_ROLE_LABELS = { SUPER_ADMIN: 'SuperAdmin', ... }` |
| `components/layout/AppHeader.tsx:16` | `const adminRoleLabel = useMemo(() => ({ SUPER_ADMIN: 'SA', ... }[role]), [role])` |

**Ação:** Task T007 — adicionar a `lib/constants/labels.ts`.

---

## 2. Componentização

### 2.1 God Component: `app/(admin)/admin/usuarios/page.tsx`

**Métricas:**
- Linhas: **1123**
- `useState`: **26**
- Funções-componente internas: **5** (SuspendDialog, ResetBalanceDialog, UserDetailRow, JogadoresTab, AdminsTab)
- Tipos locais: 4 interfaces, 4 type aliases

**Estrutura interna identificada:**
```
SuspendDialog (L76-155)        — Dialog de suspensão com formulário de motivo
ResetBalanceDialog (L167-222)  — Dialog de reset de saldo
UserDetailRow (L224-412)       — Row expansível com ações admin
JogadoresTab (L421-714)        — Tab completa com busca, filtros, paginação e ações
AdminsTab (L724-1039)          — Tab de gestão de admins com CRUD de roles
AdminUsuariosPage (L1040+)     — Orquestrador (80 linhas)
```

**Ação:** Task T008 — mover subcomponentes para `components/admin/usuarios/`.

---

### 2.2 Grandes com extração de hook recomendada

| Arquivo | Linhas | useState | Extração sugerida |
|---|---|---|---|
| `app/(app)/planos/PlansPageClient.tsx` | 382 | 13 | `useSubscriptionData`, `usePlansCheckout` |
| `app/(admin)/admin/noticias/page.tsx` | 511 | 13 | `NewsListSection`, `NewsEditorPanel`, `NewsInjectorPanel` |

**Ação:** Tasks T009, T010.

---

### 2.3 `Tabs` implementado com props array (avaliação)

`components/ui/Tabs.tsx` usa `tabs: TabItem[]` em vez de Compound Components. Dado que tem navegação por teclado e aria completos, e o uso atual é consistente, **não é prioridade de refactor** neste momento. Anotar para futura evolução.

---

## 3. Estrutura de Projeto

### ✅ Pontos fortes

| Aspecto | Status |
|---|---|
| Layer-based architecture | ✅ Bem definido: app/ → components/ → lib/ → prisma |
| hooks/ dedicado | ✅ 20 hooks incluindo useDebounce, useLocalStorage, useMediaQuery, useDisclosure |
| lib/services/ | ✅ 30+ serviços bem separados |
| lib/repositories/ | ✅ Repository pattern implementado |
| lib/constants/ | ✅ Centralizado: labels, routes, messages, errors, limits |
| types/ centralizado | ✅ models, api, dtos, portfolio |
| Sem prisma em componentes | ✅ Zero imports de prisma em components/ |
| Colocation de testes | ✅ .test.tsx ao lado do componente em portfolio/ e market/ |

### ⚠️ Rotas EN/PT duplicadas

O admin tem rotas duplicadas EN→PT que são **redirects intencionais** (aliases de URL):
- `engagement` → redirect `/admin/engajamento`
- `moderation` → redirect `/admin/moderacao`
- `users` → redirect `/admin/usuarios`
- etc.

**Avaliação:** Padrão correto. Não é duplicação problemática. Os arquivos EN têm 5 linhas cada com `redirect()`.

O mesmo vale para `app/(app)/glossary` → `glossario`, `leagues` (com mais conteúdo) vs `ligas` (alias com `/criar`).

**Não requer ação.**

---

## 4. Padrões de Código

### 4.1 Imports de serviços em Client Components

| Arquivo | Import | Avaliação |
|---|---|---|
| `components/plans/UpgradePrompt.tsx` | `calcBonusAmount` de `lib/services/plan-logic` | ✅ Função pura — OK |
| `components/ai/AIAnalysisCard.tsx` | `aiResponseParser` de `lib/services/AIResponseParser` | ⚠️ Leve violação — parser poderia ser util |

**Avaliação:** Nível leve, não crítico. `aiResponseParser` é um objeto com métodos puros, mas está em `lib/services/`. Considerar mover para `lib/utils/` em refactor futuro.

### 4.2 Barrel exports — avaliação

| Barrel | Exports | Avaliação |
|---|---|---|
| `components/ui/index.ts` | 24 | ✅ Organizado, tipado, sem `export *` |
| `hooks/index.ts` | ~15 | ✅ Seletivo, com tipos exportados |
| `lib/index.ts` | Múltiplos | ✅ Com aviso explícito de o que NÃO exportar |
| `types/index.ts` | `export * from` em 5 arquivos | ⚠️ Glob exports, mas aceitável para types |

**Sem ação urgente.**

### 4.3 Tipos locais no God Component

`usuarios/page.tsx` define `AdminUser`, `RegularUser`, `PaginationMeta`, `PlanType` (redundante com `lib/enums`), `UserStatus` localmente. Serão movidos com T008.

---

## 5. Anti-patterns

| Anti-pattern | Encontrado | Gravidade |
|---|---|---|
| God Component | `usuarios/page.tsx` (1123L, 26 useState) | 🔴 Alta |
| Componentes duplicados | feedback/ vs ui/ | 🔴 Alta |
| Utilitário duplicado inline | `fsCurrency` em 2 arquivos | 🟡 Média |
| Labels duplicados | PLAN_LABELS em 4 arquivos | 🟡 Média |
| Props drilling | Não detectado | ✅ OK |
| Importação circular | Não detectada | ✅ OK |
| Barrel gigante | Não detectado | ✅ OK |
| Lógica de negócio em UI | Não detectada (prisma não importado em components/) | ✅ OK |

---

## 6. Métricas

```
Componentes analisados:       ~120 arquivos tsx
Arquivos com >400 linhas:     3 (usuarios/page.tsx, noticias/page.tsx, FinancialDashboard.tsx)
Componentes com >8 useState:  5
Duplicações críticas:         3 (EmptyState, ErrorState, Skeleton)
Funções duplicadas:           1 (fsCurrency × 2)
Constants duplicadas:         2 tipos (PLAN_LABELS × 4, ADMIN_ROLE_LABELS × 2)
```

---

## 7. Tasks Priorizadas

| Task | Tipo | Impacto | Esforço |
|---|---|---|---|
| T001 — Consolidar EmptyState | DRY | Alto | 1h |
| T002 — Consolidar ErrorState | DRY | Alto | 45min |
| T003 — Consolidar Skeleton + SkeletonText | DRY | Alto | 45min |
| T004 — Remover pasta feedback/ | Cleanup | Alto | 30min |
| T005 — fsCurrency → formatFS | DRY | Médio | 30min |
| T006 — PLAN_LABELS centralizado | DRY | Médio | 45min |
| T007 — ADMIN_ROLE_LABELS centralizado | DRY | Baixo | 30min |
| T008 — Decompor usuarios/page.tsx | Componentização | Alto | 4h |
| T009 — Decompor PlansPageClient | Componentização | Médio | 2h |
| T010 — Decompor noticias/page.tsx | Componentização | Médio | 2h |
| T011 — Validar feedback/ removida | Cleanup | Alto | 15min |

**Total estimado: 14h**

---

## 8. Checklist de Arquitetura

### Duplicação de Código
- [ ] EmptyState consolidado em ui/ (T001)
- [ ] ErrorState consolidado em ui/ (T002)
- [ ] Skeleton consolidado em ui/ com SkeletonText (T003)
- [ ] `fsCurrency` local eliminado (T005)
- [ ] `PLAN_LABELS` sem redefinições locais (T006)
- [ ] `ADMIN_ROLE_LABELS` centralizado (T007)

### Componentização
- [x] Componentes têm responsabilidade única (exceto usuarios/page.tsx)
- [x] Nenhum componente com >7 props fora de contexto adequado
- [ ] `usuarios/page.tsx` decomposto (T008)
- [ ] `PlansPageClient.tsx` com hooks extraídos (T009)

### Estrutura de Projeto
- [x] Layer-based clara e consistente
- [x] Colocation de testes em portfolio/ e market/
- [x] Barrel exports focados
- [x] Sem dependências circulares detectadas

### Hooks
- [x] useDebounce, useLocalStorage, useMediaQuery, useDisclosure extraídos
- [x] usePortfolio, useDividends, useLeagues, useMarketData — domínio coberto

### Services e Data Layer
- [x] Lógica de negócio em lib/services, não em componentes
- [x] Repositories separados de services
- [x] Prisma não importado em components/ ou app/
- [x] API client centralizado (lib/api/client.ts)

### Anti-patterns Evitados
- [x] Sem props drilling excessivo
- [x] Sem imports circulares
- [x] Sem barrel gigante
- [ ] God Component em usuarios/page.tsx (T008)
