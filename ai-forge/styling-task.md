# Styling Tasks — Foot Stock
> Gerado por `/nextjs:styling` em 2026-04-02

---

### T001 – Substituir classes Tailwind hardcoded por tokens semânticos em PositionCard
**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** COMPLETED

**Arquivos:**
- modificar: `components/portfolio/PositionCard.tsx`

**Descrição:**
`pnlColor` usa `text-emerald-400 / text-red-400 / text-slate-400` (classes Tailwind brutas), ignorando os tokens `text-price-up / text-price-down / text-price-neutral` definidos no tailwind.config. Texto secundário (qty, labels SHORT) usa `text-slate-400` em vez de `text-text-muted`. Botão "Fechar Short" usa `border-red-500 text-red-400 hover:bg-red-500/10` em vez dos tokens de erro. Template literals `${pnlColor}` em vez de `cn()`.

**Critérios de Aceite:**
- `pnlColor` usa `text-price-up` / `text-price-down` / `text-price-neutral`
- Texto info (qty, margem, aluguel) usa `text-text-muted`
- Botão "Fechar Short" usa `border-error text-error hover:bg-error/10`
- `cn()` em vez de template literals para className

**Estimativa:** 0.5h

---

### T002 – Corrigir rgba hardcoded nos keyframes de tick no globals.css
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Status:** COMPLETED

**Arquivos:**
- modificar: `app/globals.css`

**Descrição:**
Keyframes `tick-up` e `tick-down` usam `rgba(46, 189, 133, 0.2)` e `rgba(246, 70, 93, 0.2)` diretamente. O sistema já define `--color-success-muted` e `--color-error-muted` (0.1), mas os ticks precisam de opacidade levemente maior (0.2) para o flash visual. Adicionar dois novos tokens `--color-success-flash` e `--color-error-flash` e referenciá-los nos keyframes.

**Critérios de Aceite:**
- `:root` define `--color-success-flash` e `--color-error-flash`
- Keyframes `tick-up` / `tick-down` usam `var(--color-success-flash)` / `var(--color-error-flash)`
- Zero hex/rgba hardcoded em keyframes

**Estimativa:** 0.25h

---

### T003 – Substituir `#F0B90B` arbitrary por token `accent` no AdminSidebar
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Status:** COMPLETED

**Arquivos:**
- modificar: `components/admin/AdminSidebar.tsx`

**Descrição:**
`text-[#F0B90B]` e `bg-[#F0B90B]/20` são usados em 6+ locais para estados ativos da nav do admin. O token `accent` (mapeado para `--accent-primary`) representa exatamente essa cor no design system.

**Critérios de Aceite:**
- Zero `text-[#F0B90B]` no arquivo → substituídos por `text-accent`
- Zero `bg-[#F0B90B]/20` → substituídos por `bg-accent/20`

**Estimativa:** 0.25h

---

### T004 – Substituir `violet-500/400` por tokens de accent no AssetCard
**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Status:** COMPLETED

**Arquivos:**
- modificar: `components/market/AssetCard.tsx`

**Descrição:**
`hover:border-violet-500/30` e `focus-visible:outline-violet-500` no article raiz criam inconsistência com o restante do design system que usa `accent` para hover/focus. A estrela de favorito usa `text-violet-400 fill-violet-400` — deve usar `text-accent-gold fill-accent-gold`. `text-text-tertiary` é token não definido no config — substituir por `text-text-muted`.

**Critérios de Aceite:**
- `hover:border-accent/30` no article raiz
- `focus-visible:outline-accent` no article raiz
- Estrela favorito usa `text-accent-gold fill-accent-gold`
- `text-text-tertiary` removido → `text-text-muted`

**Estimativa:** 0.25h

---

### T005 – Auditoria e tokenização do zinc scale no painel Admin (backlog)
**Tipo:** SEQUENTIAL
**Dependências:** T003
**Status:** BACKLOG

**Arquivos:**
- modificar: `app/globals.css`
- modificar: 25+ arquivos em `components/admin/`

**Descrição:**
O painel admin usa extensivamente `zinc-400 / zinc-800 / zinc-950 / zinc-100` (412 ocorrências em 25 arquivos) que não pertencem ao sistema de tokens. O admin tem um sub-tema "mais escuro" justificado, mas deve ser representado por variáveis próprias (`--admin-bg`, `--admin-border`, `--admin-text-muted`, etc.) para manutenibilidade.

**Critérios de Aceite:**
- Variáveis `--admin-*` definidas em `:root`
- Tokens mapeados no tailwind.config sob o namespace `admin-*`
- Todos os 25 arquivos admin migrados
- Zero `zinc-*` hardcoded no escopo admin

**Estimativa:** 4h

> ⚠️ Escopo grande — executar em sprint dedicado. T001–T004 não dependem deste.
