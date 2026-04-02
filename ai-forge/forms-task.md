# Forms — Auditoria e Tasks
**Projeto:** Foot Stock  
**Workspace:** `output/workspace/foot-stock/footstock-next/src`  
**Data:** 2026-04-02  
**Status:** PENDENTE

---

## Resumo Executivo

Stack de forms consistente: **React Hook Form + Zod + Input component customizado** com acessibilidade nativa.  
13 forms com `<form noValidate>`, 20+ usos de `useForm`, 15+ schemas Zod.

**Pontos fortes:**
- `Input` component (`src/components/ui/input.tsx`) com `aria-invalid`, `aria-describedby`, `htmlFor` embutidos
- `mode: 'onBlur'` no cadastro multi-step (Step1, Step2)
- `PasswordStrength` com `aria-live="polite"`
- `fieldset` + `legend` no `RadioGroup` de `CreateLeagueForm`
- Character counter com `role="status"` em `CreatePost`
- Toast feedback (sonner) na maioria dos forms

**Issues encontrados:** 7 tasks (2 críticas, 3 altas, 2 médias)

---

## Tasks

### T001 – OrderForm: datetime-local sem acessibilidade
**Tipo:** SEQUENTIAL  
**Dependências:** none  
**Arquivos:**
- modificar: `src/components/orders/OrderForm.tsx`

**Descrição:**  
O campo de data/hora da ordem SCHEDULED (linha 268–285) usa `<input type="datetime-local">` avulso sem usar o `Input` component. Consequências: sem `id`, sem `htmlFor` correto na `<label>`, e o erro em `errors.scheduledAt` (linha 281–283) não tem `role="alert"` nem `aria-describedby` linkado ao input.

**Trecho atual (linhas 269–284):**
```tsx
<label className="text-sm text-[#EAECEF] font-medium">
  <Clock className="inline h-3.5 w-3.5 mr-1" />
  Data de execucao
</label>
<input
  type="datetime-local"
  value={scheduledAt}
  onChange={(e) => setScheduledAt(e.target.value)}
  className="h-11 w-full rounded-md..."
  required
/>
{errors.scheduledAt && (
  <p className="text-sm text-[#F6465D]">{errors.scheduledAt}</p>
)}
```

**Correção esperada:** substituir pelo `Input` component (ou adicionar `id="scheduled-at"`, `htmlFor="scheduled-at"` na label, `aria-describedby="scheduled-at-error"` no input, `id="scheduled-at-error"` + `role="alert"` no parágrafo de erro).

**Critérios de Aceite:**
- [ ] Label associada ao input via `htmlFor` + `id`
- [ ] Erro com `role="alert"` e linkado via `aria-describedby`
- [ ] Mesmo comportamento visual mantido

**Estimativa:** 30min

---

### T002 – Step4Terms: substituir div+onClick por form semântico
**Tipo:** SEQUENTIAL  
**Dependências:** none  
**Arquivos:**
- modificar: `src/components/auth/register/Step4Terms.tsx`

**Descrição:**  
`Step4Terms` renderiza um `<div>` (linha 116) com um `<Button onClick={handleSubmit}>` (linha 172). Não existe `<form onSubmit>`. Isso impede que Enter acione o submit, e screen readers não anunciam o contexto de formulário.

**Trecho atual (linhas 116 e 172–184):**
```tsx
<div data-testid="form-register-step4" className="flex flex-col gap-5">
  ...
  <Button onClick={handleSubmit} isLoading={isSubmitting} ...>
    Criar minha conta
  </Button>
</div>
```

**Correção esperada:** envolver em `<form data-testid="form-register-step4" onSubmit={handleSubmit}>` e mudar o Button para `type="submit"`.

**Critérios de Aceite:**
- [ ] `<form onSubmit={handleSubmit}>` envolve todo o conteúdo
- [ ] Button com `type="submit"` (sem `onClick`)
- [ ] Enter key aciona o submit
- [ ] `data-testid` preservado

**Estimativa:** 20min

---

### T003 – NewsForm: labels sem htmlFor nos inputs nativos
**Tipo:** SEQUENTIAL  
**Dependências:** none  
**Arquivos:**
- modificar: `src/components/admin/NewsForm.tsx`

**Descrição:**  
`NewsForm` usa inputs/selects nativos (não o `Input` component) com labels sem `htmlFor`. Os labels de "Título", "Ticker", "Sentimento" e "Categoria" (linhas 101, 118, 135, 156) não têm `htmlFor`, e os inputs não têm `id`, quebrando a associação label→input para screen readers.

**Critérios de Aceite:**
- [ ] Cada `<label>` tem `htmlFor` com o id correspondente
- [ ] Cada `<input>`/`<select>` tem `id` correspondente
- [ ] `aria-describedby` nos inputs atualizado para usar o id correto (já existe mas sem id nos inputs)

**Estimativa:** 30min

---

### T004 – OrderForm: seletor de tipo sem indicação de selecionado para a11y
**Tipo:** PARALLEL-GROUP-1  
**Dependências:** none  
**Arquivos:**
- modificar: `src/components/orders/OrderForm.tsx`

**Descrição:**  
O seletor de tipo de ordem (MARKET/LIMIT/OCO/SCHEDULED, linhas 198–213) usa `<button type="button">` sem `aria-pressed` ou `role="radio"`. Screen readers não conseguem identificar qual opção está selecionada.

**Correção esperada:** adicionar `aria-pressed={orderType === t}` nos botões OU envolver em `role="group"` com `aria-label="Tipo de ordem"`.

**Critérios de Aceite:**
- [ ] Estado selecionado anunciado para screen readers
- [ ] `aria-label` ou `role="group"` identifica o grupo

**Estimativa:** 20min

---

### T005 – Step2Access: botão submit sem loading state
**Tipo:** PARALLEL-GROUP-1  
**Dependências:** none  
**Arquivos:**
- modificar: `src/components/auth/register/Step2Access.tsx`

**Descrição:**  
`Step2Access` desestrutura `formState: { errors }` (linha 61) mas não extrai `isSubmitting`. O Button submit (linha 119) não tem `isLoading` — sem feedback visual de carregamento durante a validação/transição de step.

**Correção esperada:**
```tsx
// Linha 61 - adicionar isSubmitting:
formState: { errors, isSubmitting },

// Linha 119 - adicionar prop:
<Button ... isLoading={isSubmitting}>
```

**Critérios de Aceite:**
- [ ] `isSubmitting` extraído de `formState`
- [ ] `isLoading={isSubmitting}` no Button submit
- [ ] Botão desabilitado durante submit

**Estimativa:** 10min

---

### T006 – reset-password-form: usar formState.isSubmitting em vez de useState
**Tipo:** PARALLEL-GROUP-1  
**Dependências:** none  
**Arquivos:**
- modificar: `src/components/auth/reset-password-form.tsx`

**Descrição:**  
`reset-password-form.tsx` usa `const [isLoading, setIsLoading] = useState(false)` (linha 38) e `formState: { errors }` sem `isSubmitting`. O padrão do projeto é usar `isSubmitting` do RHF. O estado manual `isLoading` é redundante e inconsistente com o restante dos forms.

**Correção esperada:** remover `isLoading` state, usar `formState: { errors, isSubmitting }`, substituir `setIsLoading(true/false)` por `isSubmitting` nativo do RHF, passar `isLoading={isSubmitting}` ao Button.

**Critérios de Aceite:**
- [ ] `useState(false)` removido
- [ ] `isSubmitting` extraído de `formState`
- [ ] Button recebe `isLoading={isSubmitting}`
- [ ] `try/finally setIsLoading(false)` removido

**Estimativa:** 15min

---

### T007 – Step4Terms: grupos de consentimento sem fieldset/legend
**Tipo:** PARALLEL-GROUP-2  
**Dependências:** T002  
**Arquivos:**
- modificar: `src/components/auth/register/Step4Terms.tsx`

**Descrição:**  
Os dois grupos de checkboxes (obrigatórios/opcionais, linhas 118–171) não usam `<fieldset>` + `<legend>`. Para screen readers, grupos de checkbox devem ser envolvidos em `<fieldset>` com `<legend>` descritivo, conforme WCAG 1.3.1.

**Correção esperada:**
```tsx
<fieldset>
  <legend className="sr-only">Consentimentos obrigatórios</legend>
  {/* checkboxes */}
</fieldset>

<fieldset>
  <legend className="sr-only">Consentimentos opcionais</legend>
  {/* checkboxes */}
</fieldset>
```

**Critérios de Aceite:**
- [ ] Cada grupo de checkboxes envolto em `<fieldset>`
- [ ] `<legend>` com texto descritivo (pode ser `sr-only`)
- [ ] Estilo visual preservado

**Estimativa:** 20min

---

## Progresso

| Task | Status | Prioridade |
|------|--------|------------|
| T001 – OrderForm datetime-local a11y | COMPLETED | P0 |
| T002 – Step4Terms form semântico | COMPLETED | P0 |
| T003 – NewsForm labels sem htmlFor | COMPLETED | P0 |
| T004 – OrderForm seletor aria-pressed | COMPLETED | P1 |
| T005 – Step2Access isSubmitting faltando | COMPLETED | P1 |
| T006 – reset-password-form isSubmitting | COMPLETED | P1 |
| T007 – Step4Terms fieldset/legend | COMPLETED | P2 |

---

## Fora do Escopo Detectado

| Ocorrência | Arquivo | Encaminhar para |
|-----------|---------|----------------|
| Schema Zod duplicado em `login-form.tsx` e `reset-password-form.tsx` (não importam de `@/lib/schemas/auth.schema`) | `footstock-next/src/components/auth/` | `/nextjs:architecture` |
| Ausência de error summary + `setFocus` em forms longos | Step1, Step2, CreateLeagueForm | Melhoria futura |
| `<img>` sem `next/image` em `login-form.tsx` linha 74 | `footstock-next/src/components/auth/login-form.tsx` | `/nextjs:nextjs-components` |
