/**
 * M067 item 016 — Card com badge de sentimento por time
 * Loop 07-28-noticias-multi-time-linha-por-time
 *
 * Cobre os criterios de aceite:
 *   15 — grupo de 3 gera 3 badges no mesmo card, cada uma com o sentimento e a
 *        identidade da propria linha do grupo.
 *   44 — clique na badge de um irmao filtra por aquele time e NAO altera o
 *        estado de expansao do card.
 *   45 — badge e controle de expansao sao paradas de foco distintas; `Enter`
 *        funciona nos dois; nenhuma interacao aninhada (equivalente da regra
 *        axe `nested-interactive`).
 *   48 — nenhum testid novo colide com os existentes (checagem estatica; ver
 *        nota de escopo abaixo).
 *
 * NOTA DE DEPENDENCIA (finding registrado, ST006 item 4): o repo NAO tem
 * `@axe-core/playwright` nem qualquer runner de acessibilidade instalado
 * (`package.json` so traz `@playwright/test`). Conforme a instrucao literal do
 * runbook ("se ausente, registrar finding e usar o runner de acessibilidade ja
 * existente no repo em vez de adicionar dependencia nova"), a auditoria de
 * `nested-interactive` e feita por assercao direta sobre a arvore DOM: nenhum
 * elemento interativo pode ter ancestral interativo dentro do feed. E a mesma
 * condicao que a regra axe verifica, sem introduzir dependencia nova.
 *
 * NOTA DE ESCOPO (criterio 48): a checagem de colisao de testid e um grep
 * estatico sobre `src` e roda em `## Verificacao` do runbook, nao aqui — os
 * testids novos sao template literals e nao aparecem como string literal no
 * codigo-fonte, entao um teste automatizado sobre o fonte nao provaria nada.
 *
 * Dados: o feed e mockado via `page.route` (grupo de 3 linhas com sentimentos
 * distintos), para o teste nao depender do estado do banco nem do publisher
 * (itens 011/013 estao REPROVADO no loop).
 *
 * PRE-REQUISITO: servidor rodando (`npm run dev`) e usuario de teste no seed.
 * EXECUCAO: `npx playwright test tests/e2e/noticias-multi-time.spec.ts`
 */

import { test, expect, type Page } from '@playwright/test'
import { USERS } from './setup'

/**
 * Login local em vez de `loginAs` de `setup.ts`: o helper compartilhado aponta
 * para os testids `email-input` / `password-input` / `login-submit`, que NAO
 * existem em `src/components/auth/login-form.tsx` (os reais sao
 * `form-login-email-input`, `form-login-password-input`,
 * `form-login-submit-button`). Finding registrado; corrigir o helper
 * compartilhado esta fora do escopo do item 016 porque alteraria o
 * comportamento de todos os outros specs que dependem dele.
 */
async function login(page: Page): Promise<void> {
  const user = USERS.jogador
  await page.goto('/login')
  await page.locator('[data-testid="form-login-email-input"]').fill(user.email)
  await page.locator('[data-testid="form-login-password-input"]').fill(user.password)
  await page.locator('[data-testid="form-login-submit-button"]').click()
  await page.waitForURL(/mercado|onboarding|admin|noticias/, { timeout: 15_000 })
}

// ─── Fixture do grupo de 3 ────────────────────────────────────────────────────

const GROUP_ID = 'e2e-group-016'

const ASSETS = [
  { id: 'asset-uru3', ticker: 'URU3', displayName: 'Uruguaiana' },
  { id: 'asset-flm3', ticker: 'FLM3', displayName: 'Flamengo E2E' },
  { id: 'asset-pal3', ticker: 'PAL3', displayName: 'Palmeiras E2E' },
]

/** Grupo de 3 linhas: ancora BULLISH + irmaos BEARISH e NEUTRAL. */
const TEAM_LINES = [
  { id: `${GROUP_ID}-0`, ticker: 'URU3', assetIds: ['asset-uru3'], sentiment: 'BULLISH', impact: 'POSITIVE', groupRank: 0 },
  { id: `${GROUP_ID}-1`, ticker: 'FLM3', assetIds: ['asset-flm3'], sentiment: 'BEARISH', impact: 'NEGATIVE', groupRank: 1 },
  { id: `${GROUP_ID}-2`, ticker: 'PAL3', assetIds: ['asset-pal3'], sentiment: 'NEUTRAL', impact: 'NEUTRAL', groupRank: 2 },
]

const SENTIMENT_LABEL: Record<string, string> = {
  BULLISH: 'Positivo',
  BEARISH: 'Negativo',
  NEUTRAL: 'Neutro',
}

function feedItem(teams = TEAM_LINES) {
  const anchor = teams[0]
  return {
    id: anchor.id,
    title: 'Noticia multi-time E2E do item 016',
    content: 'Corpo da noticia usado para exercitar o controle de expansao dedicado do card.',
    source: 'E2E',
    assetIds: anchor.assetIds,
    sentiment: anchor.sentiment,
    impact: anchor.impact,
    isPublished: true,
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    groupId: GROUP_ID,
    groupRank: anchor.groupRank,
    ticker: anchor.ticker,
    teams,
  }
}

async function mockFeed(page: Page, teams = TEAM_LINES): Promise<void> {
  await page.route('**/api/v1/assets**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: ASSETS }),
    })
  })

  await page.route('**/api/v1/news**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [feedItem(teams)],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      }),
    })
  })
}

/**
 * Abre `/noticias` com o feed mockado. O login so e exercido quando o ambiente
 * de fato redireciona para `/login` — com o feed mockado o teste nao depende do
 * banco, e num ambiente com guarda de rota ativa o login roda antes da segunda
 * tentativa. Se nem assim a lista renderizar, o teste falha de forma visivel
 * (nunca skip silencioso).
 */
async function gotoNoticias(page: Page): Promise<void> {
  await page.goto('/noticias')

  if (/\/login/.test(new URL(page.url()).pathname)) {
    await login(page)
    await page.goto('/noticias')
  }

  await expect(page.locator('[data-testid="noticias-list"]')).toBeVisible({ timeout: 15_000 })
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe('M067 item 016 — badge de sentimento por time', () => {
  test.beforeEach(async ({ page }) => {
    await mockFeed(page)
  })

  test('criterio 15 — grupo de 3 renderiza 3 badges, cada uma com o sentimento da propria linha', async ({ page }) => {
    await gotoNoticias(page)

    const card = page.locator('[data-testid="noticias-list"] > div').first()
    const badges = card.locator(`[data-testid^="noticias-item-${GROUP_ID}-badge-"]:not([data-testid$="-sentiment"]):not([data-testid$="-unresolved"])`)

    await expect(badges).toHaveCount(3)

    for (const line of TEAM_LINES) {
      const badge = card.locator(`[data-testid="noticias-item-${GROUP_ID}-badge-${line.ticker}"]`)
      await expect(badge).toBeVisible()

      // O testid de sentimento afirma o sentimento DAQUELA linha, nao o do topo.
      const sentimentEl = card.locator(
        `[data-testid="noticias-item-${GROUP_ID}-badge-${line.ticker}-sentiment"]`,
      )
      await expect(sentimentEl).toHaveText(SENTIMENT_LABEL[line.sentiment])
    }

    // A badge do irmao BEARISH nao pode herdar o sentimento BULLISH da ancora.
    await expect(
      card.locator(`[data-testid="noticias-item-${GROUP_ID}-badge-FLM3-sentiment"]`),
    ).not.toHaveText(SENTIMENT_LABEL.BULLISH)
  })

  test('DB-20 — linha com ticker mas sem asset resolvido continua visivel e marcada', async ({ page }) => {
    await mockFeed(page, [
      TEAM_LINES[0],
      { ...TEAM_LINES[1], assetIds: ['asset-inexistente'] },
      { ...TEAM_LINES[2], assetIds: [] },
    ])
    await gotoNoticias(page)

    const card = page.locator('[data-testid="noticias-list"] > div').first()

    // Nenhuma linha some silenciosamente: 3 linhas, 3 badges.
    await expect(
      card.locator(`[data-testid^="noticias-item-${GROUP_ID}-badge-"]:not([data-testid$="-sentiment"]):not([data-testid$="-unresolved"])`),
    ).toHaveCount(3)

    // As DUAS linhas nao resolvidas seguem visiveis e marcadas INDIVIDUALMENTE:
    // o marcador carrega a identidade da linha (`badge-{ticker}-unresolved`), logo
    // nao ha testid duplicado no DOM e nao e preciso `.first()` para desviar de
    // strict-mode violation (criterio 48).
    await expect(
      card.locator(`[data-testid$="-unresolved"]`),
    ).toHaveCount(2)

    for (const ticker of ['FLM3', 'PAL3']) {
      await expect(
        card.locator(`[data-testid="noticias-item-${GROUP_ID}-badge-${ticker}-unresolved"]`),
      ).toBeVisible()
    }

    // A linha resolvida nao pode ganhar marcador de "nao identificado".
    await expect(
      card.locator(`[data-testid="noticias-item-${GROUP_ID}-badge-URU3-unresolved"]`),
    ).toHaveCount(0)
  })

  test('criterio 44 — clique na badge de um irmao filtra sem alterar a expansao do card', async ({ page }) => {
    await gotoNoticias(page)

    const expandBtn = page.locator(`[data-testid="noticias-item-${GROUP_ID}-expand"]`)
    await expandBtn.click()
    await expect(expandBtn).toHaveAttribute('aria-expanded', 'true')

    await page.locator(`[data-testid="noticias-item-${GROUP_ID}-badge-FLM3"]`).click()

    await expect(page).toHaveURL(/[?&]ticker=FLM3/)
    // A expansao nao pode ter sido alterada pelo clique na badge.
    await expect(
      page.locator(`[data-testid="noticias-item-${GROUP_ID}-expand"]`),
    ).toHaveAttribute('aria-expanded', 'true')
  })

  test('criterio 45 — badge e expansao sao paradas de foco distintas e respondem a Enter', async ({ page }) => {
    await gotoNoticias(page)

    const badge = page.locator(`[data-testid="noticias-item-${GROUP_ID}-badge-URU3"]`)
    const expandBtn = page.locator(`[data-testid="noticias-item-${GROUP_ID}-expand"]`)

    // Focar a badge e avancar com Tab: o proximo alvo nao pode ser o mesmo no.
    await badge.focus()
    await expect(badge).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(badge).not.toBeFocused()

    // O controle de expansao e alcancavel por foco proprio (nao aninhado).
    await expandBtn.focus()
    await expect(expandBtn).toBeFocused()
    await expect(expandBtn).toHaveAttribute('aria-expanded', 'false')
    await page.keyboard.press('Enter')
    await expect(expandBtn).toHaveAttribute('aria-expanded', 'true')

    // `Enter` na badge dispara o filtro.
    await badge.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/[?&]ticker=URU3/)
  })

  test('criterio 45 (axe nested-interactive) — nenhum elemento interativo tem ancestral interativo no feed', async ({ page }) => {
    await gotoNoticias(page)

    // Equivalente direto da regra axe `nested-interactive`, sem dependencia nova
    // (ver NOTA DE DEPENDENCIA no cabecalho).
    const nested = await page.evaluate(() => {
      const INTERACTIVE_TAGS = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']
      const INTERACTIVE_ROLES = [
        'button', 'link', 'checkbox', 'radio', 'menuitem', 'option',
        'switch', 'tab', 'textbox', 'combobox', 'slider', 'spinbutton',
      ]

      const isInteractive = (el: Element): boolean => {
        if (INTERACTIVE_TAGS.includes(el.tagName) && !el.hasAttribute('disabled')) return true
        const role = el.getAttribute('role')
        if (role && INTERACTIVE_ROLES.includes(role)) return true
        const tabIndex = el.getAttribute('tabindex')
        return tabIndex !== null && Number(tabIndex) >= 0
      }

      const root = document.querySelector('[data-testid="noticias-list"]')
      if (!root) return ['noticias-list ausente']

      const violations: string[] = []
      for (const el of Array.from(root.querySelectorAll('*'))) {
        if (!isInteractive(el)) continue
        let parent = el.parentElement
        while (parent && parent !== root) {
          if (isInteractive(parent)) {
            violations.push(
              `${el.tagName}[${el.getAttribute('data-testid') ?? '-'}] dentro de ${parent.tagName}[${parent.getAttribute('data-testid') ?? '-'}]`,
            )
            break
          }
          parent = parent.parentElement
        }
      }
      return violations
    })

    expect(nested).toEqual([])
  })

  test('namespace — nenhum testid renderizado no feed usa prefixo news-', async ({ page }) => {
    await gotoNoticias(page)

    const newsPrefixed = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="news-"]')).map(
        (el) => el.getAttribute('data-testid') ?? '',
      ),
    )

    expect(newsPrefixed).toEqual([])
  })
})
