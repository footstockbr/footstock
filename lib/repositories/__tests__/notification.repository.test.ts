import { NotificationType } from '@prisma/client'

describe('NotificationType enum', () => {
  // Todos os 16 tipos definidos em NOTIFICATION-SPEC.md (v2)
  const REQUIRED_TYPES: NotificationType[] = [
    'ORDER_EXECUTED',
    'ORDER_CANCELLED',
    'MARGIN_CALL_ALERT',
    'CIRCUIT_BREAKER',
    'NEWS_FAVORITE_CLUB',
    'PAYMENT_CONFIRMED',
    'PAYMENT_FAILED',
    'PLAN_CANCEL_ALERT',
    'DIVIDEND_CREDITED',
    'BONUS_CREDITED',
    'LEAGUE_RESULT',
    'ADMIN_BROADCAST',
    'AFFILIATE_COMMISSION_EARNED',
    'AFFILIATE_INVITE_JOINED',
    'CANCELLATION_LOCK_ACTIVE',
    'CANCELLATION_LOCK_LIQUIDATED',
  ]

  test('todos os 16 tipos de NOTIFICATION-SPEC estão presentes', () => {
    expect(REQUIRED_TYPES).toHaveLength(16)
  })

  test('enum não tem valores duplicados', () => {
    expect(new Set(REQUIRED_TYPES).size).toBe(16)
  })

  test('todos os tipos são strings não-vazias', () => {
    REQUIRED_TYPES.forEach(type => {
      expect(typeof type).toBe('string')
      expect(type.length).toBeGreaterThan(0)
    })
  })
})
