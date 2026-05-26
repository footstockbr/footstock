/**
 * task-021 — Bug D (regressao): paridade desktop/mobile do item "Planos".
 *
 * Trava os criterios do runbook 05-25-foot-stock-bugs-producao-v2.md (secao 10):
 *  (a) usuario comum ve "Planos" no desktop sidebar antes de "Perfil";
 *  (b) usuario comum encontra "Planos" no drawer "Mais" do mobile;
 *  (c) a checagem de paridade desktop/mobile para rotas obrigatorias permanece ativa.
 *
 * Nota de implantacao: a Saida esperada da task apontava para
 * src/components/shared/__tests__/ , mas o jest.config (testMatch) so coleta
 * tests/**. Colocado aqui para que o guard de regressao realmente execute.
 */

import { ROUTES } from '@/lib/constants/routes'
import { BASE_NAV_ITEMS, REQUIRED_NAV_ROUTES } from '@/components/shared/desktop-sidebar'
import { MOBILE_NAV_HREFS, DRAWER_ITEMS } from '@/components/shared/bottom-tab-bar'

describe('Bug D — paridade de navegacao do item Planos', () => {
  test('(a) usuario comum ve "Planos" no desktop sidebar', () => {
    const hrefs = BASE_NAV_ITEMS.map((i) => i.href)
    expect(hrefs).toContain(ROUTES.PLANOS)
  })

  test('(a) "Planos" aparece antes de "Perfil" no desktop sidebar', () => {
    const hrefs = BASE_NAV_ITEMS.map((i) => i.href)
    const planosIdx = hrefs.indexOf(ROUTES.PLANOS)
    const perfilIdx = hrefs.indexOf(ROUTES.PERFIL)
    expect(planosIdx).toBeGreaterThanOrEqual(0)
    expect(perfilIdx).toBeGreaterThanOrEqual(0)
    expect(planosIdx).toBeLessThan(perfilIdx)
  })

  test('(b) usuario comum encontra "Planos" no drawer "Mais" do mobile', () => {
    const drawerHrefs = DRAWER_ITEMS.map((i) => i.href)
    expect(drawerHrefs).toContain(ROUTES.PLANOS)
    expect(MOBILE_NAV_HREFS).toContain(ROUTES.PLANOS)
  })

  test('(c) paridade desktop/mobile satisfeita para todas as rotas obrigatorias', () => {
    const desktop = new Set<string>(BASE_NAV_ITEMS.map((i) => i.href))
    const mobile = new Set<string>(MOBILE_NAV_HREFS)
    for (const route of REQUIRED_NAV_ROUTES) {
      expect(desktop.has(route)).toBe(true)
      expect(mobile.has(route)).toBe(true)
    }
  })

  test('(c) a lista de rotas obrigatorias inclui Planos (guard nao foi esvaziado)', () => {
    expect(REQUIRED_NAV_ROUTES).toContain(ROUTES.PLANOS)
  })
})
