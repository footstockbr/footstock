/**
 * Testes unitarios - politica de troca de plano do admin (FIX-02 / Task 04)
 * src/lib/admin/plan-change.ts
 *
 * Garante a invariante C2: toda troca de plano pelo admin so e APLICADA quando
 * resulta em Subscription coerente; staff e downgrade sao rejeitados.
 */
import {
  PLAN_HIERARCHY,
  isStaffAccount,
  classifyPlanChange,
  decidePlanChange,
} from '@/lib/admin/plan-change'

describe('Admin: politica de troca de plano (FIX-02)', () => {
  describe('hierarquia', () => {
    it('JOGADOR < CRAQUE < LENDA', () => {
      expect(PLAN_HIERARCHY.JOGADOR).toBeLessThan(PLAN_HIERARCHY.CRAQUE)
      expect(PLAN_HIERARCHY.CRAQUE).toBeLessThan(PLAN_HIERARCHY.LENDA)
    })
  })

  describe('isStaffAccount', () => {
    it('conta com adminRole e staff', () => {
      expect(isStaffAccount({ adminRole: 'ADMINISTRADOR' })).toBe(true)
    })
    it('userType institucional e staff', () => {
      expect(isStaffAccount({ userType: 'CLUB_PARTNER' })).toBe(true)
      expect(isStaffAccount({ userType: 'ADMIN' })).toBe(true)
    })
    it('usuario normal nao e staff', () => {
      expect(isStaffAccount({ userType: 'NORMAL', adminRole: null })).toBe(false)
      expect(isStaffAccount({})).toBe(false)
    })
  })

  describe('classifyPlanChange', () => {
    it('mesmo plano = NOOP', () => {
      expect(classifyPlanChange('CRAQUE', 'CRAQUE')).toBe('NOOP')
    })
    it('subida = UPGRADE', () => {
      expect(classifyPlanChange('JOGADOR', 'CRAQUE')).toBe('UPGRADE')
      expect(classifyPlanChange('CRAQUE', 'LENDA')).toBe('UPGRADE')
    })
    it('descida = DOWNGRADE', () => {
      expect(classifyPlanChange('LENDA', 'CRAQUE')).toBe('DOWNGRADE')
      expect(classifyPlanChange('CRAQUE', 'JOGADOR')).toBe('DOWNGRADE')
    })
    it('plano atual nulo trata como JOGADOR', () => {
      expect(classifyPlanChange(null, 'CRAQUE')).toBe('UPGRADE')
      expect(classifyPlanChange(undefined, 'JOGADOR')).toBe('NOOP')
    })
  })

  describe('decidePlanChange', () => {
    it('rejeita conta staff com AUTH-009 (403)', () => {
      const d = decidePlanChange({ adminRole: 'ADMINISTRADOR', planType: 'JOGADOR' }, 'LENDA')
      expect(d).toEqual({
        action: 'REJECT',
        code: 'AUTH-009',
        status: 403,
        message: expect.any(String),
      })
    })

    it('rejeita downgrade com ADMIN-PLAN-DOWNGRADE (400)', () => {
      const d = decidePlanChange({ planType: 'LENDA' }, 'CRAQUE')
      expect(d.action).toBe('REJECT')
      if (d.action === 'REJECT') {
        expect(d.code).toBe('ADMIN-PLAN-DOWNGRADE')
        expect(d.status).toBe(400)
      }
    })

    it('mesmo plano = NOOP', () => {
      expect(decidePlanChange({ planType: 'CRAQUE' }, 'CRAQUE')).toEqual({ action: 'NOOP' })
    })

    it('upgrade valido = APPLY com from/to', () => {
      const d = decidePlanChange({ planType: 'JOGADOR' }, 'CRAQUE')
      expect(d).toEqual({ action: 'APPLY', from: 'JOGADOR', to: 'CRAQUE' })
    })

    it('upgrade a partir de plano nulo = APPLY from JOGADOR', () => {
      const d = decidePlanChange({ planType: null }, 'LENDA')
      expect(d).toEqual({ action: 'APPLY', from: 'JOGADOR', to: 'LENDA' })
    })

    it('staff tem precedencia sobre direcao do plano', () => {
      // mesmo sendo "upgrade", staff e bloqueado antes de classificar direcao
      const d = decidePlanChange({ adminRole: 'MONITOR', planType: 'JOGADOR' }, 'CRAQUE')
      expect(d.action).toBe('REJECT')
      if (d.action === 'REJECT') expect(d.code).toBe('AUTH-009')
    })
  })
})
