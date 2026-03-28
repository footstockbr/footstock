/**
 * Códigos e mensagens de erro padronizados (ERROR-CATALOG).
 */
export const ERROR_CODES = {
  // Auth
  AUTH_001: 'AUTH-001',
  AUTH_003: 'AUTH-003',
  AUTH_004: 'AUTH-004',
  AUTH_009: 'AUTH-009',
  // Validação
  VAL_001: 'VAL-001',
  VAL_002: 'VAL-002',
  // Sistema
  SYS_001: 'SYS-001',
} as const

export const ERROR_MESSAGES: Record<string, string> = {
  'AUTH-001': 'Sessão expirada. Faça login novamente.',
  'AUTH-003': 'CPF já cadastrado na plataforma.',
  'AUTH-004': 'Este email já está cadastrado. Faça login ou recupere sua senha.',
  'AUTH-009': 'Muitas tentativas. Tente novamente em 1 hora.',
  'VAL-001': 'Dados inválidos. Verifique os campos e tente novamente.',
  'VAL-002': 'Você deve ter ao menos 18 anos para se cadastrar (ECA Digital).',
  'SYS-001': 'Erro interno. Tente novamente em instantes.',
}
