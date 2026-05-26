/**
 * task-021 — Bug D (regressao): politica staff/admin para planos.
 *
 * Trava os criterios do runbook 05-25-foot-stock-bugs-producao-v2.md (secao 10/14.3):
 *  (d) admin/staff e redirecionado de /planos para /conta;
 *  (e) checkout de admin/staff retorna AUTH-009;
 *  (f) invariante M058: staff sem plan_type;
 *  (g) subscription de staff rejeitada pelo trigger.
 *
 * Nota de implantacao: a Saida esperada da task apontava para
 * src/app/(app)/planos/__tests__/ , mas o jest.config (testMatch) so coleta
 * tests/**. Colocado aqui para que o guard de regressao realmente execute.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { ROUTES } from '@/lib/constants/routes'

// ─── (d) Redirect admin de /planos para /conta ─────────────────────────────────

const mockGetAuthUser = jest.fn()
const mockRedirect = jest.fn((url: string) => {
  // redirect() do Next halt-a a execucao lancando; emulamos para travar o fluxo.
  throw new Error(`NEXT_REDIRECT:${url}`)
})

jest.mock('@/lib/auth', () => ({
  getAuthUser: (...args: unknown[]) => mockGetAuthUser(...args),
}))
jest.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}))

describe('Bug D — admin/staff nao acessa /planos', () => {
  beforeEach(() => {
    mockGetAuthUser.mockReset()
    mockRedirect.mockClear()
  })

  test('(d) admin e redirecionado de /planos para /conta', async () => {
    mockGetAuthUser.mockResolvedValue({
      user: { adminRole: 'SUPER_ADMIN', planType: null },
      userId: 'admin-1',
    })
    const { default: PlanosPage } = await import('@/app/(app)/planos/page')
    await expect(
      PlanosPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow(`NEXT_REDIRECT:${ROUTES.CONTA}`)
    expect(mockRedirect).toHaveBeenCalledWith(ROUTES.CONTA)
  })
})

// ─── (e) Checkout de admin retorna AUTH-009 ────────────────────────────────────

jest.mock('@/app/api/middleware', () => ({
  withAuth: (fn: unknown) => fn,
}))

describe('Bug D — checkout de admin bloqueado (AUTH-009)', () => {
  test('(e) pix-checkout retorna 403 AUTH-009 para conta com adminRole', async () => {
    const { POST } = await import('@/app/api/v1/payments/pix-checkout/route')
    const req = { json: async () => ({ planType: 'CRAQUE', period: 'monthly' }) }
    const res = await (POST as unknown as (
      r: unknown,
      ctx: unknown,
    ) => Promise<Response>)(req, { user: { id: 'admin-1', adminRole: 'SUPER_ADMIN' } })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('AUTH-009')
  })
})

// ─── (f)(g) Invariante M058 durável (CHECK + trigger) ─────────────────────────

describe('Bug D — invariante M058 (staff sem plano/subscription)', () => {
  const migrationSql = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260525120000_M058-staff-no-plan-or-subscription/migration.sql',
    ),
    'utf8',
  )

  test('(f) CHECK constraint impede plan_type em staff (ADMIN/CLUB_PARTNER)', () => {
    expect(migrationSql).toContain('users_staff_no_plan_type_check')
    expect(migrationSql).toMatch(
      /CHECK\s*\(\s*"plan_type"\s+IS\s+NULL\s+OR\s+"user_type"\s+NOT\s+IN\s*\(\s*'ADMIN',\s*'CLUB_PARTNER'\s*\)/i,
    )
  })

  test('(g) trigger rejeita subscription vinculada a staff', () => {
    expect(migrationSql).toContain('reject_staff_subscription')
    expect(migrationSql).toContain('trg_reject_staff_subscription')
    expect(migrationSql).toMatch(/BEFORE\s+INSERT\s+OR\s+UPDATE/i)
  })
})
