# Accessibility Tasks — FootStock (footstock-next)

> Gerado em: 2026-04-01 | Total: 10 tasks

---

### T001 — Remover userScalable: false do viewport

**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: `src/app/layout.tsx`

**Descrição:**
Remover `userScalable: false` do export `viewport`. Manter `width: "device-width"` e `initialScale: 1`. Usuários com baixa visão precisam fazer zoom.

**WCAG:** 1.4.4 (Resize Text)

**Critérios de Aceite:**
- [ ] `userScalable` removido ou alterado para `true`
- [ ] Pinch-to-zoom funciona no browser mobile
- [ ] Layout não quebra com zoom de 200%

**Estimativa:** 0.25h

---

### T002 — Adicionar `<main>` no Auth layout

**Tipo:** SEQUENTIAL
**Dependências:** T001
**Arquivos:**
- modificar: `src/app/(auth)/layout.tsx`

**Descrição:**
Substituir o `<div>` root do AuthLayout por `<main>` com `id="auth-content"` para garantir o landmark principal nas páginas de autenticação.

**WCAG:** 1.3.1 (Info and Relationships)

**Critérios de Aceite:**
- [ ] `<main>` presente em todas as rotas `(auth)/`
- [ ] Screen reader anuncia região principal
- [ ] Layout visual inalterado

**Estimativa:** 0.25h

---

### T003 — Corrigir Drawer: focus trap + Escape + aria-labelledby

**Tipo:** SEQUENTIAL
**Dependências:** T002
**Arquivos:**
- modificar: `src/components/ui/drawer.tsx`

**Descrição:**
1. Adicionar `aria-labelledby` apontando para o `<h2>` quando `title` é passado (adicionar `id="drawer-title"` no h2).
2. Adicionar handler de Escape key para chamar `onClose`.
3. Implementar focus trap: ao abrir, focar no primeiro elemento focável dentro do drawer. Ao Tab/Shift+Tab na borda, fazer wrap. Ao fechar, retornar foco ao trigger (capturar `document.activeElement` antes de abrir via `useRef`).
4. Usar `tabIndex={-1}` no container do drawer para receber foco programático.

**WCAG:** 2.1.1 (Keyboard), 2.4.3 (Focus Order), 4.1.2 (Name, Role, Value)

**Critérios de Aceite:**
- [ ] Escape fecha o drawer
- [ ] Foco vai para o drawer ao abrir
- [ ] Tab não sai do drawer enquanto aberto
- [ ] Foco retorna ao botão trigger ao fechar
- [ ] Screen reader anuncia título do drawer

**Estimativa:** 1.5h

---

### T004 — Corrigir Modal: focus trap + auto-focus + retorno de foco

**Tipo:** PARALLEL-GROUP-1
**Dependências:** T002
**Arquivos:**
- modificar: `src/components/ui/modal.tsx`

**Descrição:**
1. Adicionar `tabIndex={-1}` no elemento interno `.rounded-xl` e focar nele ao abrir (`useRef` + `useEffect`).
2. Implementar focus trap idêntico ao T003 (focusable elements query + Tab/Shift+Tab wrap).
3. Capturar `document.activeElement` antes de abrir e retornar o foco ao fechar (em cleanup do `useEffect`).
4. Escapar já existe ✅ — apenas garantir que está no useEffect de focus trap.

**WCAG:** 2.1.1 (Keyboard), 2.4.3 (Focus Order)

**Critérios de Aceite:**
- [ ] Foco vai automaticamente ao modal ao abrir
- [ ] Tab não sai do modal enquanto aberto
- [ ] Shift+Tab funciona em wrap
- [ ] Foco retorna ao trigger ao fechar
- [ ] Escape fecha o modal

**Estimativa:** 1.5h

---

### T005 — Corrigir Tabs: keyboard navigation + ARIA completo

**Tipo:** PARALLEL-GROUP-1
**Dependências:** T002
**Arquivos:**
- modificar: `src/components/ui/tabs.tsx`

**Descrição:**
1. `TabsList`: adicionar `aria-label` prop (passar como prop, default `"Abas"`).
2. `TabsTrigger`: 
   - Adicionar `id={`tab-${value}`}`.
   - Adicionar `tabIndex={isActive ? 0 : -1}`.
   - Adicionar `aria-controls={`panel-${value}`}`.
   - Adicionar handler `onKeyDown` para ArrowRight/ArrowLeft/Home/End — usar `useRef` array nos triggers.
3. `TabsContent`:
   - Adicionar `id={`panel-${value}`}`.
   - Adicionar `aria-labelledby={`tab-${value}`}`.
   - Mudar de `return null` para `hidden` attribute: `<div hidden={activeTab !== value} ...>`.

**WCAG:** 2.1.1 (Keyboard), 4.1.2 (Name, Role, Value)

**Critérios de Aceite:**
- [ ] Arrow keys navegam entre tabs
- [ ] Home/End funcionam
- [ ] Tab único tab stop no tablist (roving tabindex)
- [ ] Panels têm id e aria-labelledby corretos
- [ ] Screen reader anuncia tab selecionada e painel

**Estimativa:** 1.5h

---

### T006 — Corrigir Button: loading state acessível

**Tipo:** SEQUENTIAL
**Dependências:** none
**Arquivos:**
- modificar: `src/components/ui/button.tsx`

**Descrição:**
No branch `isLoading`:
1. Adicionar `aria-hidden="true"` no `<Loader2>`.
2. Adicionar `<span className="sr-only">Carregando...</span>` após o spinner.
3. Adicionar `aria-disabled={disabled || isLoading}` no `<button>` (além do `disabled` nativo).

**WCAG:** 4.1.2 (Name, Role, Value), 4.1.3 (Status Messages)

**Critérios de Aceite:**
- [ ] Screen reader anuncia "Carregando..." quando botão está em loading
- [ ] `aria-disabled` reflete estado de loading
- [ ] Loader2 não é anunciado separadamente

**Estimativa:** 0.5h

---

### T007 — Corrigir Input: aria-describedby + aria-required + password toggle

**Tipo:** PARALLEL-GROUP-2
**Dependências:** T006
**Arquivos:**
- modificar: `src/components/ui/input.tsx`

**Descrição:**
1. Gerar IDs para mensagens: `errorId = inputId + "-error"`, `hintId = inputId + "-hint"`.
2. Adicionar `id={errorId}` no `<p>` de erro e `id={hintId}` no `<p>` de hint.
3. Adicionar `aria-describedby` no `<input>` linkando ao(s) ID(s) ativos.
4. Adicionar `aria-required={props.required}` no `<input>`.
5. **Remover `tabIndex={-1}` do password toggle** — o botão deve ser acessível por teclado. Já tem `aria-label` correto ✅.

**WCAG:** 2.1.1 (Keyboard), 3.3.1 (Error Identification), 4.1.2 (Name, Role, Value)

**Critérios de Aceite:**
- [ ] Screen reader associa mensagem de erro ao input
- [ ] Screen reader anuncia campo como obrigatório
- [ ] Password toggle focável por Tab
- [ ] Toggle de visibilidade funciona com Enter/Space

**Estimativa:** 1h

---

### T008 — Corrigir Market page: search label + filter aria-pressed

**Tipo:** PARALLEL-GROUP-2
**Dependências:** T006
**Arquivos:**
- modificar: `src/app/(app)/mercado/market-page-client.tsx`

**Descrição:**
1. Adicionar `aria-label="Buscar clube ou ticker"` no `<input type="search">` (linha 83).
2. Nos botões de filtro de divisão (linha 110-125): adicionar `aria-pressed={division === d}`.
3. Nos botões de filtro de sentimento (linha 127-148): adicionar `aria-pressed={sentiment === s}`.
4. Envolver cada grupo de filtros em `<fieldset>` + `<legend className="sr-only">` para agrupar semanticamente.

**WCAG:** 4.1.2 (Name, Role, Value)

**Critérios de Aceite:**
- [ ] Screen reader anuncia o campo de busca
- [ ] Filtros ativos anunciados como "pressionado"
- [ ] Grupos de filtros com legend acessível

**Estimativa:** 0.75h

---

### T009 — Corrigir Assessor: chat input sem aria-label

**Tipo:** PARALLEL-GROUP-2
**Dependências:** T006
**Arquivos:**
- modificar: `src/app/(app)/assessor/page.tsx`

**Descrição:**
Adicionar `aria-label="Pergunte ao assessor IA"` no `<input type="text">` na linha 57. Também adicionar `aria-label="Enviar pergunta"` no Button de envio para maior clareza.

**WCAG:** 4.1.2 (Name, Role, Value)

**Critérios de Aceite:**
- [ ] Screen reader anuncia o campo de chat
- [ ] Botão de envio tem label descritivo

**Estimativa:** 0.25h

---

### T010 — Corrigir heading hierarchy em páginas admin

**Tipo:** SEQUENTIAL
**Dependências:** T007
**Arquivos:**
- modificar: `src/components/admin/MotorStateCard.tsx`
- modificar: `src/components/admin/NewsInjector.tsx`
- modificar: `src/components/admin/ImpactMatrix.tsx`
- modificar: `src/components/admin/RevenueChart.tsx`
- modificar: `src/components/admin/RetentionTable.tsx`
- modificar: `src/components/admin/SubscriptionStats.tsx`
- modificar: `src/components/admin/GatewayConfig.tsx`
- modificar: `src/components/admin/EngagementMetrics.tsx`

**Descrição:**
Nas páginas admin, os componentes filhos usam `<h3>` diretamente sem `<h2>` intermediário (hierarquia h1→h3). Duas opções:
- **Opção A (recomendada):** Mudar os `<h3>` nos componentes de card admin para `<h2>` (pois são seções diretas da página).
- **Opção B:** Adicionar um `<h2 className="sr-only">Seções</h2>` antes do grid de cards nas páginas admin.

Usar Opção A. Os `<h3>` internos de subseções (RetentionTable, SubscriptionStats) passam a ter hierarquia h2→h3 correta.

**WCAG:** 1.3.1 (Info and Relationships), 2.4.6 (Headings and Labels)

**Critérios de Aceite:**
- [ ] Nenhuma página admin pula nível de heading
- [ ] Lighthouse heading order sem violações
- [ ] Visual inalterado (apenas tag semântica muda)

**Estimativa:** 1h
