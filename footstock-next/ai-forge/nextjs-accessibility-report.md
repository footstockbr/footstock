# PRD: Acessibilidade e Semântica — FootStock (footstock-next)

> Gerado em: 2026-04-01 | Escopo: `src/` (excluindo node_modules)
> Stack: Next.js 15 + Tailwind CSS + Radix primitives customizados

---

## Problemas Encontrados

### Semântica (WCAG 1.3.x)
- **1 layout (auth) sem `<main>` landmark** — `src/app/(auth)/layout.tsx`
- **Heading hierarchy h1→h3 (pula h2)** em páginas admin — `src/app/admin/motor/page.tsx`, `src/app/admin/page.tsx` etc.
- `lang="pt-BR"` presente no root layout ✅
- Skip link ✅ no app layout
- Landmarks `<header>`, `<nav>`, `<main>` presentes no app layout ✅
- Falta `<footer>` em todos os layouts (baixo impacto — app mobile-first)

### Zoom / Escalabilidade (WCAG 1.4.4) — CRÍTICO
- **`userScalable: false`** em `src/app/layout.tsx:44` — impede zoom para usuários com baixa visão

### Imagens (WCAG 1.1.1)
- Logo com `alt="FootStock"` ✅
- Imagem do ativo com `alt={asset.displayName}` ✅
- Ícones Lucide têm `aria-hidden="true"` ✅

### Navegação por Teclado (WCAG 2.1.x)
- Skip link funcional ✅ com foco visível ✅
- `aria-current="page"` no BottomTabBar ✅
- **Drawer sem Escape key handler e sem focus trap** — `src/components/ui/drawer.tsx`
- **Modal sem focus trap + sem auto-focus na abertura** — `src/components/ui/modal.tsx`
- **Tabs sem navegação por teclado (Arrow keys)** — `src/components/ui/tabs.tsx`
- **Password toggle com `tabIndex={-1}`** — `src/components/ui/input.tsx:73` — inacessível por teclado

### ARIA (WCAG 4.1.x)
- `role="dialog"` + `aria-modal="true"` em Modal ✅ e NotificationDrawer ✅
- `aria-labelledby="modal-title"` em Modal ✅
- `aria-label` descritivo no NotificationBell ✅ com contagem dinâmica
- `aria-live="polite"` no SessionIndicator ✅
- **Drawer: `aria-labelledby` ausente** mesmo quando `title` é passado
- **Tabs: faltam `tabIndex`, `aria-controls`, `aria-labelledby`, `aria-label` no `TabsList`**
- **Button: spinner `Loader2` sem `aria-hidden="true"` + sem sr-only "Carregando..."**
- **Input: `error` não vinculada ao `<input>` via `aria-describedby`**
- **Input: `required` sem `aria-required`**
- **Market search input sem `aria-label`** — `market-page-client.tsx:83`
- **Filter toggle buttons sem `aria-pressed`** — `market-page-client.tsx`
- **Chat input do assessor sem `aria-label`** — `assessor/page.tsx:57`

### Contraste e Percepção Visual (WCAG 1.4.x)
- Dark theme com fundo `#0B0E11` e texto `#EAECEF` (alto contraste) ✅
- `focus-visible:ring-2` no Button ✅
- Placeholder `#707A8A` — pode estar abaixo do limiar 4.5:1 em alguns fundos (verificar manualmente)
- Texto muted `#929AA5` sobre `#0B0E11` — verificar contraste (estimativa ~5.1:1 — borderline)

### Motion (WCAG 2.3.x)
- **`@media (prefers-reduced-motion: reduce)`** em `globals.css:111` com `animation-duration: 0.01ms !important` ✅ — cobre todos os `animate-*`
- `animate-bounce` (NotificationBell badge) e `animate-pulse` (session dot) são silenciados pelo CSS global ✅

### Touch (WCAG 2.5.x)
- NotificationBell: `min-w-[44px] min-h-[44px]` ✅
- BottomTabBar items: `flex-1 py-2` — atingem ~56px de altura ✅
- Filter chips na página de mercado: `py-1 px-3` — altura ~28px, **abaixo de 44px** ❌ WCAG 2.5.8

---

## Conformidade WCAG 2.1

### Level A (Mínimo)
| Critério | Status | Componente / Arquivo |
|---|---|---|
| 1.1.1 Non-text Content | ✅ | Imagens com alt adequado |
| 1.3.1 Info and Relationships | ⚠️ | Auth layout sem `<main>`; h1→h3 em admin |
| 2.1.1 Keyboard | ❌ | Drawer/Modal sem focus trap; Tabs sem arrow keys; password toggle inacessível |
| 2.1.2 No Keyboard Trap | ✅ | Nenhum trap identificado |
| 2.4.1 Bypass Blocks | ✅ | Skip link presente no app layout |
| 4.1.2 Name, Role, Value | ❌ | Tabs incompleto; Drawer sem aria-labelledby; Input sem aria-describedby |

### Level AA (Recomendado)
| Critério | Status | Componente / Arquivo |
|---|---|---|
| 1.4.3 Contrast (Minimum) | ⚠️ | Muted text `#929AA5` borderline — verificar manualmente |
| 1.4.4 Resize Text | ❌ | `userScalable: false` bloqueia zoom |
| 2.4.3 Focus Order | ❌ | Modal/Drawer não capturam foco ao abrir |
| 2.4.7 Focus Visible | ✅ | `focus-visible:ring-2` nos elementos interativos |
| 2.5.8 Target Size | ⚠️ | Filter chips < 44px |
| 3.3.1 Error Identification | ⚠️ | Erros visíveis mas não vinculados via aria-describedby |
| 3.3.3 Error Suggestion | ✅ | Mensagens de erro descritivas nos forms |
| 4.1.3 Status Messages | ⚠️ | Button loading sem anúncio para screen reader |

## Impacto
- **Componentes afetados:** 8 (Modal, Drawer, Tabs, Button, Input, BottomTabBar/filters, AssessorInput, market-search)
- **Páginas afetadas:** ~10 (mercado, ativo, ligas, admin, assessor, auth, planos, perfil, inbox, comunidade)
- **Risco:** ALTO
