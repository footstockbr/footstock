# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-interactions.spec.ts >> ST008: Cadastro — Wizard 4 etapas >> /cadastro carrega formulário de cadastro
- Location: tests/e2e/ui-interactions.spec.ts:389:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
Call log:
  - navigating to "http://localhost:3000/cadastro", waiting until "load"

```

# Test source

```ts
  290 | })
  291 | 
  292 | // ─── ST007: Assessor IA — Restrição de Plano ─────────────────────────────────
  293 | 
  294 | test.describe('ST007: Assessor IA — Restrição por Plano', () => {
  295 |   test('JOGADOR vê mensagem de upgrade ao acessar /assessor', async ({ page }) => {
  296 |     await loginAs(page, 'jogador')
  297 |     await page.goto('/assessor')
  298 |     await waitForNoSpinner(page)
  299 | 
  300 |     // Deve mostrar lock, paywall ou mensagem de upgrade
  301 |     const upgradeContent = page.locator(
  302 |       'text=/craque|lenda|upgrade|plano|assinar|bloqueado/i'
  303 |     ).first()
  304 |     const isVisible = await upgradeContent.isVisible().catch(() => false)
  305 |     // JOGADOR deve ver indicação de bloqueio/upgrade ao acessar assessor IA
  306 |     expect(isVisible).toBe(true)
  307 |   })
  308 | })
  309 | 
  310 | // ─── ST-MODAL: Zero Modais Quebrados — ESC, Backdrop, Botão X ────────────────
  311 | 
  312 | test.describe('ST-MODAL: Modais — ESC, Backdrop, Botão X (TASK-4 ST003)', () => {
  313 |   test.beforeEach(async ({ page }) => {
  314 |     await loginAs(page, 'craque')
  315 |   })
  316 | 
  317 |   test('Modal de confirmação de ordem fecha com ESC', async ({ page }) => {
  318 |     await page.goto('/mercado/FLA')
  319 |     await waitForNoSpinner(page)
  320 | 
  321 |     // Tentar abrir modal de ordem (Comprar/Vender)
  322 |     const orderBtn = page.getByRole('button', { name: /comprar|vender|ordem/i }).first()
  323 |     if (await orderBtn.isVisible().catch(() => false)) {
  324 |       await orderBtn.click()
  325 |       // Verificar que modal/dialog apareceu
  326 |       const dialog = page.locator('[role="dialog"], [role="alertdialog"], .modal, [data-state="open"]').first()
  327 |       if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
  328 |         await page.keyboard.press('Escape')
  329 |         await expect(dialog).not.toBeVisible({ timeout: 2000 })
  330 |       }
  331 |     }
  332 |   })
  333 | 
  334 |   test('Modal de confirmação fecha com botão X/Fechar', async ({ page }) => {
  335 |     await page.goto('/mercado/FLA')
  336 |     await waitForNoSpinner(page)
  337 | 
  338 |     const orderBtn = page.getByRole('button', { name: /comprar|vender|ordem/i }).first()
  339 |     if (await orderBtn.isVisible().catch(() => false)) {
  340 |       await orderBtn.click()
  341 |       const dialog = page.locator('[role="dialog"], [role="alertdialog"], .modal, [data-state="open"]').first()
  342 |       if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
  343 |         const closeBtn = dialog.locator('button[aria-label*="fechar" i], button[aria-label*="close" i], button:has(svg.lucide-x)').first()
  344 |         if (await closeBtn.isVisible().catch(() => false)) {
  345 |           await closeBtn.click()
  346 |           await expect(dialog).not.toBeVisible({ timeout: 2000 })
  347 |         }
  348 |       }
  349 |     }
  350 |   })
  351 | 
  352 |   test('Modal fecha ao clicar no backdrop/overlay', async ({ page }) => {
  353 |     await page.goto('/mercado/FLA')
  354 |     await waitForNoSpinner(page)
  355 | 
  356 |     const orderBtn = page.getByRole('button', { name: /comprar|vender|ordem/i }).first()
  357 |     if (await orderBtn.isVisible().catch(() => false)) {
  358 |       await orderBtn.click()
  359 |       const dialog = page.locator('[role="dialog"], [role="alertdialog"], .modal, [data-state="open"]').first()
  360 |       if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
  361 |         // Clicar fora do modal (backdrop)
  362 |         await page.mouse.click(10, 10)
  363 |         // Nota: nem todos os modais fecham com backdrop (ex: confirmação destrutiva)
  364 |         // Verificamos que pelo menos o ESC funciona como fallback
  365 |       }
  366 |     }
  367 |   })
  368 | 
  369 |   test('Dialog de exclusão de conta tem confirmação obrigatória', async ({ page }) => {
  370 |     await page.goto('/perfil/privacidade')
  371 |     await waitForNoSpinner(page)
  372 | 
  373 |     const deleteBtn = page.getByRole('button', { name: /excluir conta|deletar|apagar/i }).first()
  374 |     if (await deleteBtn.isVisible().catch(() => false)) {
  375 |       await deleteBtn.click()
  376 |       // Modal de confirmação deve aparecer
  377 |       const confirmDialog = page.locator('[role="alertdialog"], [role="dialog"]').first()
  378 |       await expect(confirmDialog).toBeVisible({ timeout: 3000 })
  379 |       // Deve ter botão de cancelar
  380 |       const cancelBtn = confirmDialog.getByRole('button', { name: /cancelar|voltar|não/i }).first()
  381 |       await expect(cancelBtn).toBeVisible()
  382 |     }
  383 |   })
  384 | })
  385 | 
  386 | // ─── ST008: Formulário de Cadastro — Fluxo Wizard ─────────────────────────────
  387 | 
  388 | test.describe('ST008: Cadastro — Wizard 4 etapas', () => {
  389 |   test('/cadastro carrega formulário de cadastro', async ({ page }) => {
> 390 |     await page.goto('/cadastro')
      |                ^ Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
  391 |     await page.waitForLoadState('networkidle')
  392 | 
  393 |     // Deve ter campos de cadastro
  394 |     await expect(page.locator('text=/500/i')).not.toBeVisible()
  395 |     const form = page.locator('form').first()
  396 |     await expect(form).toBeVisible()
  397 |   })
  398 | })
  399 | 
```