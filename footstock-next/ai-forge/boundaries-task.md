# Boundaries Tasks — FootStock

> Gerado por `/nextjs:boundaries` em 2026-04-02

---

### T001 – Admin layout completo como Client Component
**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** COMPLETED

**Arquivos:**
- modificar: `src/app/admin/layout.tsx`
- criar: `src/components/admin/AdminSidebar.tsx`

**Descrição:**
`app/admin/layout.tsx` tem `"use client"` inteiro por causa de `useState(sidebarOpen)` + `usePathname`. Isso
arrasta toda a árvore de páginas admin para o bundle client. Solução: extrair `AdminSidebar` como Client Component
isolado; o layout fica Server Component.

**Critérios de aceite:**
- `admin/layout.tsx` sem `"use client"`
- `AdminSidebar.tsx` tem `"use client"` e contém todo estado interativo
- Build sem erros

---

### T002 – Módulos server sem `server-only`
**Tipo:** PARALLEL
**Dependências:** none
**Status:** COMPLETED

**Arquivos:**
- modificar: `src/lib/prisma.ts`
- modificar: `src/lib/supabase.ts`
- modificar: `src/lib/auth.ts`

**Descrição:**
`prisma.ts` expõe `PrismaClient`; `supabase.ts` usa `cookies()` (API server-only do Next.js); `auth.ts` usa ambos.
Nenhum importa `'server-only'`. Se acidentalmente importados em um Client Component, o build não quebra com
erro claro — a falha ocorre em runtime ou com leaks de secrets.

**Critérios de aceite:**
- `import 'server-only'` na primeira linha de cada arquivo
- Tentativa de importar em um Client Component deve quebrar o build com mensagem clara

---

### T003 – `suppressHydrationWarning` sem documentação
**Tipo:** PARALLEL
**Dependências:** none
**Status:** COMPLETED

**Arquivos:**
- modificar: `src/app/layout.tsx`

**Descrição:**
`<html suppressHydrationWarning>` em `app/layout.tsx` não tem comentário explicando o motivo.
Necessário para extensões de browser (Grammarly, 1Password, LastPass) que injetam atributos no `<html>`.
Sem comentário, futuros devs podem remover ou achar que é bug.

**Critérios de aceite:**
- Comentário inline explicando o `suppressHydrationWarning`

---

### T004 – `app/page.tsx`: fetch client-side para auth check (documentação de decisão)
**Tipo:** PARALLEL
**Dependências:** none
**Status:** COMPLETED

**Arquivos:**
- modificar: `src/app/page.tsx`

**Descrição:**
A página raiz usa `useEffect → fetch('/api/v1/auth/session')` para verificar autenticação após o splash.
Em App Router, o padrão recomendado é middleware redirect para usuários autenticados, eliminando o fetch client.
Como a página tem splash screen animado (necessita `"use client"`), o padrão atual é justificado — mas
deve estar documentado com comentário explicando por que o middleware não é suficiente (dependência de animação
de splash). **Follow-up recomendado:** `/nextjs:server-actions` para avaliar conversão com middleware.

**Critérios de aceite:**
- Comentário documentando a razão do fetch client-side
- Nenhuma mudança de comportamento

---

## Dependências cross-comando

| Issue | Comando complementar |
|-------|----------------------|
| T004 padrão de auth redirect | `needs follow-up /nextjs:server-actions` |
| T001 AdminSidebar performance | `needs follow-up /nextjs:performance` (bundle size admin) |
