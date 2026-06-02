// ============================================================================
// FootStock — Testes: AutoModeration rules service
// Fonte: module-24/TASK-7/ST001
// ============================================================================

import {
  MODERATION_RULE_ID,
  type ModerationRule,
  type ModerationRuleId,
} from '@/lib/services/AutoModeration'

// ---------------------------------------------------------------------------
// Helpers de teste (sem I/O real — testa lógica pura)
// ---------------------------------------------------------------------------

const DEFAULT_RULES: ModerationRule[] = [
  { id: MODERATION_RULE_ID.DELETE_3_FLAGS, name: 'Auto-Delete 3 Flags', description: 'Deletar posts com 3+ flags', enabled: false },
  { id: MODERATION_RULE_ID.BAN_IP_BURST, name: 'IP Burst Ban', description: 'Banir IP após 5 posts em 1 min', enabled: false },
  { id: MODERATION_RULE_ID.HIDE_SUSPENDED, name: 'Hide Suspended', description: 'Ocultar posts de suspensos', enabled: false },
  { id: MODERATION_RULE_ID.NEW_USER_RESTRICT, name: 'New User Restrict', description: 'Restringir novos usuários', enabled: false },
  { id: MODERATION_RULE_ID.HOURLY_LIMIT, name: 'Hourly Post Limit', description: 'Máximo 5 posts/hora', enabled: false },
]

function applyRuleUpdate(rules: ModerationRule[], ruleId: ModerationRuleId, enabled: boolean): ModerationRule[] {
  return rules.map(r => r.id === ruleId ? { ...r, enabled } : r)
}

function resolveRule(rules: ModerationRule[], id: ModerationRuleId): ModerationRule | undefined {
  return rules.find(r => r.id === id)
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('MODERATION_RULE_ID', () => {
  it('deve conter exatamente 5 regras', () => {
    const ids = Object.values(MODERATION_RULE_ID)
    expect(ids).toHaveLength(5)
  })

  it('deve ter IDs sequenciais de 1 a 5', () => {
    expect(MODERATION_RULE_ID.DELETE_3_FLAGS).toBe(1)
    expect(MODERATION_RULE_ID.BAN_IP_BURST).toBe(2)
    expect(MODERATION_RULE_ID.HIDE_SUSPENDED).toBe(3)
    expect(MODERATION_RULE_ID.NEW_USER_RESTRICT).toBe(4)
    expect(MODERATION_RULE_ID.HOURLY_LIMIT).toBe(5)
  })
})

describe('Default rules', () => {
  it('todas as regras padrão devem estar desabilitadas', () => {
    for (const rule of DEFAULT_RULES) {
      expect(rule.enabled).toBe(false)
    }
  })

  it('cada regra deve ter name e description não vazios', () => {
    for (const rule of DEFAULT_RULES) {
      expect(rule.name.length).toBeGreaterThan(0)
      expect(rule.description.length).toBeGreaterThan(0)
    }
  })
})

describe('Rule update logic', () => {
  it('deve ativar uma regra sem afetar as outras', () => {
    const updated = applyRuleUpdate(DEFAULT_RULES, MODERATION_RULE_ID.DELETE_3_FLAGS, true)
    expect(resolveRule(updated, MODERATION_RULE_ID.DELETE_3_FLAGS)?.enabled).toBe(true)
    expect(resolveRule(updated, MODERATION_RULE_ID.BAN_IP_BURST)?.enabled).toBe(false)
    expect(resolveRule(updated, MODERATION_RULE_ID.HIDE_SUSPENDED)?.enabled).toBe(false)
  })

  it('deve desativar uma regra ativa', () => {
    const activated = applyRuleUpdate(DEFAULT_RULES, MODERATION_RULE_ID.HOURLY_LIMIT, true)
    const deactivated = applyRuleUpdate(activated, MODERATION_RULE_ID.HOURLY_LIMIT, false)
    expect(resolveRule(deactivated, MODERATION_RULE_ID.HOURLY_LIMIT)?.enabled).toBe(false)
  })

  it('deve suportar múltiplas regras ativas simultaneamente', () => {
    let rules = applyRuleUpdate(DEFAULT_RULES, MODERATION_RULE_ID.DELETE_3_FLAGS, true)
    rules = applyRuleUpdate(rules, MODERATION_RULE_ID.HIDE_SUSPENDED, true)
    rules = applyRuleUpdate(rules, MODERATION_RULE_ID.HOURLY_LIMIT, true)
    const activeCount = rules.filter(r => r.enabled).length
    expect(activeCount).toBe(3)
  })

  it('deve ser idempotente — ativar regra já ativa não muda nada', () => {
    const first = applyRuleUpdate(DEFAULT_RULES, MODERATION_RULE_ID.BAN_IP_BURST, true)
    const second = applyRuleUpdate(first, MODERATION_RULE_ID.BAN_IP_BURST, true)
    expect(second).toEqual(first)
  })
})

describe('Rule resolution', () => {
  it('deve resolver regra por ID corretamente', () => {
    const rule = resolveRule(DEFAULT_RULES, MODERATION_RULE_ID.NEW_USER_RESTRICT)
    expect(rule).toBeDefined()
    expect(rule?.name).toBe('New User Restrict')
  })

  it('deve retornar undefined para ID inexistente', () => {
    const rule = resolveRule(DEFAULT_RULES, 99 as ModerationRuleId)
    expect(rule).toBeUndefined()
  })
})
