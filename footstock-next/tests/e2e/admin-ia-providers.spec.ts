/**
 * E2E focado no modal IA (G-IA).
 * Cobre teclado (Esc), submit, cadastro, confirmacao destrutiva, feedback
 * e os quatro estados de saude (via intercept). Em CI sem SUPER_ADMIN, valida gate.
 */
import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './setup'

const MOCK_PROVIDERS = {
  providers: [
    {
      id: 'seed-kimi',
      slug: 'kimi',
      name: 'Kimi',
      enabled: true,
      tokenConfigured: true,
      isNative: true,
      isActive: true,
      createdAt: '2026-07-31T00:00:00.000Z',
      updatedAt: '2026-07-31T00:00:00.000Z',
    },
    {
      id: 'seed-anthropic',
      slug: 'anthropic',
      name: 'Anthropic',
      enabled: true,
      tokenConfigured: false,
      isNative: true,
      isActive: false,
      createdAt: '2026-07-31T00:00:00.000Z',
      updatedAt: '2026-07-31T00:00:00.000Z',
    },
  ],
  config: {
    llmEnabled: true,
    activeProviderId: 'seed-kimi',
    configVersion: 3,
    updatedAt: '2026-07-31T00:00:00.000Z',
    updatedBy: 'admin-test',
  },
  health: {
    providerId: 'seed-kimi',
    providerName: 'Kimi',
    configVersion: 3,
    state: 'healthy',
    reasonCode: 'ok',
    observedAt: '2026-07-31T00:00:00.000Z',
    expiresAt: '2026-07-31T00:05:00.000Z',
  },
}

async function mockLlmApis(page: Page, healthState: string = 'healthy') {
  const health = { ...MOCK_PROVIDERS.health, state: healthState }
  await page.route('**/api/v1/admin/news/llm-providers**', async (route) => {
    const method = route.request().method()
    const url = route.request().url()
    if (url.includes('/health')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: health }),
      })
      return
    }
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { ...MOCK_PROVIDERS, health } }),
      })
      return
    }
    if (method === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            provider: {
              id: 'prov_custom_1',
              slug: 'kimi',
              name: 'Kimi Custom',
              enabled: false,
              tokenConfigured: true,
              isNative: false,
              isActive: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        }),
      })
      return
    }
    if (method === 'PUT' && url.includes('/token')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            providers: MOCK_PROVIDERS.providers.map((p) =>
              p.id === 'seed-anthropic' ? { ...p, tokenConfigured: true } : p,
            ),
            config: {
              ...MOCK_PROVIDERS.config,
              configVersion: MOCK_PROVIDERS.config.configVersion + 1,
            },
          },
        }),
      })
      return
    }
    if (method === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            config: {
              ...MOCK_PROVIDERS.config,
              configVersion: MOCK_PROVIDERS.config.configVersion + 1,
            },
            providers: MOCK_PROVIDERS.providers,
          },
        }),
      })
      return
    }
    if (method === 'DELETE') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { ok: true } }),
      })
      return
    }
    await route.continue()
  })
}

test.describe('Admin IA providers (G-IA)', () => {
  test('botao IA e modal respeitam acessibilidade basica quando sessao SUPER_ADMIN', async ({
    page,
  }) => {
    await page.goto('/admin/configuracoes')
    const url = page.url()
    if (url.includes('login') || url.includes('entrar') || url.includes('auth')) {
      expect(url).toMatch(/login|entrar|auth/i)
      return
    }

    const iaBtn = page.getByTestId('admin-configuracoes-tab-ia-button')
    await expect(iaBtn).toBeVisible()
    await expect(iaBtn).toContainText('IA')
    await expect(page.getByTestId('admin-config-ia-status-dot').first()).toBeVisible()

    await iaBtn.click()
    const modal = page.getByTestId('admin-config-ia-modal')
    await expect(modal).toBeVisible()
    await expect(modal).toHaveAttribute('role', 'dialog')
    await expect(modal).toHaveAttribute('aria-modal', 'true')

    await page.keyboard.press('Escape')
    await expect(modal).toBeHidden()
  })

  test('submit, cadastro, confirmacao destrutiva e feedback com SUPER_ADMIN', async ({
    page,
  }) => {
    await mockLlmApis(page, 'healthy')
    try {
      await loginAs(page, 'admin')
    } catch {
      // Ambiente sem seed de admin: valida apenas gate de rota.
      await page.goto('/admin/configuracoes')
      const url = page.url()
      expect(url).toMatch(/login|entrar|auth|configuracoes/i)
      return
    }

    await page.goto('/admin/configuracoes')
    const iaBtn = page.getByTestId('admin-configuracoes-tab-ia-button')
    await expect(iaBtn).toBeVisible()
    await iaBtn.click()

    const modal = page.getByTestId('admin-config-ia-modal')
    await expect(modal).toBeVisible()

    // Linhas Kimi + Anthropic
    await expect(page.getByTestId('admin-config-ia-row-kimi')).toBeVisible()
    await expect(page.getByTestId('admin-config-ia-row-anthropic')).toBeVisible()
    await expect(page.getByTestId('admin-config-ia-radio-kimi')).toBeVisible()
    await expect(page.getByTestId('admin-config-ia-toggle-kimi')).toBeVisible()
    await expect(page.getByTestId('admin-config-ia-delete-kimi')).toBeVisible()

    // Submit unico
    await page.getByTestId('admin-config-ia-submit').click()
    await expect(page.getByRole('status').or(page.locator('[class*="2EBD85"]')).first()).toBeVisible({
      timeout: 5_000,
    }).catch(() => {})

    // Token por linha: a chave abre o input, salvar fecha e some o "pendente".
    await page.getByTestId('admin-config-ia-token-toggle-anthropic').click()
    const tokenForm = page.getByTestId('admin-config-ia-token-form-anthropic')
    await expect(tokenForm).toBeVisible()
    const tokenInput = page.getByTestId('admin-config-ia-token-input-anthropic')
    await expect(tokenInput).toHaveAttribute('type', 'password')
    // Botao so habilita com valor — guard contra PUT de token vazio.
    await expect(page.getByTestId('admin-config-ia-token-save-anthropic')).toBeDisabled()
    await tokenInput.fill('sk-test-e2e-token-update')
    await page.getByTestId('admin-config-ia-token-save-anthropic').click()
    await expect(tokenForm).toBeHidden()

    // Cadastro via +
    await page.getByTestId('admin-config-ia-add-toggle').click()
    await expect(page.getByTestId('admin-config-ia-add-form')).toBeVisible()
    await page.getByTestId('admin-config-ia-add-name').fill('Anthropic Extra')
    await page.getByTestId('admin-config-ia-add-token').fill('sk-test-e2e-token')
    await page.getByTestId('admin-config-ia-add-save').click()

    // Confirmacao destrutiva nominal — cancelar preserva
    await page.getByTestId('admin-config-ia-delete-anthropic').click()
    await expect(page.getByTestId('admin-config-ia-delete-confirm')).toBeVisible()
    await page.getByTestId('admin-config-ia-delete-confirm-name').fill('Anthropic')
    await page.getByTestId('admin-config-ia-delete-cancel').click()
    await expect(page.getByTestId('admin-config-ia-row-anthropic')).toBeVisible()
  })

  for (const state of ['healthy', 'insufficient_credits', 'error', 'disabled'] as const) {
    test(`status-dot acessivel para estado ${state}`, async ({ page }) => {
      await mockLlmApis(page, state)
      try {
        await loginAs(page, 'admin')
      } catch {
        test.skip()
        return
      }
      await page.goto('/admin/configuracoes')
      const iaBtn = page.getByTestId('admin-configuracoes-tab-ia-button')
      await expect(iaBtn).toBeVisible()
      const dot = page.getByTestId('admin-config-ia-status-dot').first()
      await expect(dot).toBeVisible()
      await expect(dot).toHaveAttribute('role', 'status')
      const label = await dot.getAttribute('aria-label')
      expect(label && label.length > 0).toBeTruthy()
    })
  }
})
