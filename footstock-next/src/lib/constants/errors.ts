/**
 * Códigos e mensagens de erro padronizados (ERROR-CATALOG).
 */
export const ERROR_CODES = {
  // Auth
  AUTH_001: 'AUTH-001',
  AUTH_002: 'AUTH-002',
  AUTH_003: 'AUTH-003',
  AUTH_004: 'AUTH-004',
  AUTH_005: 'AUTH-005',
  AUTH_006: 'AUTH-006',
  AUTH_007: 'AUTH-007',
  AUTH_008: 'AUTH-008',
  AUTH_009: 'AUTH-009',
  AUTH_010: 'AUTH-010',
  AUTH_011: 'AUTH-011',
  AUTH_012: 'AUTH-012',
  AUTH_013: 'AUTH-013',
  // Validação
  VAL_001: 'VAL-001',
  VAL_002: 'VAL-002',
  VAL_003: 'VAL-003',
  // Ordem
  ORD_008: 'ORD-008',
  // Admin
  ADMIN_050: 'ADMIN-050',
  ADMIN_051: 'ADMIN-051',
  ADMIN_052: 'ADMIN-052',
  ADMIN_053: 'ADMIN-053',
  ADMIN_054: 'ADMIN-054',
  ADMIN_055: 'ADMIN-055',
  ADMIN_056: 'ADMIN-056',
  ADMIN_057: 'ADMIN-057',
  ADMIN_058: 'ADMIN-058',
  // Ativo
  ASSET_001: 'ASSET-001',
  ASSET_051: 'ASSET-051',
  // Rate
  RATE_001: 'RATE-001',
  // Sistema
  SYS_001: 'SYS-001',
  SYS_002: 'SYS-002',
  // Recurso
  NOT_FOUND_001: 'NOT-FOUND-001',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export const ERROR_MESSAGES: Record<string, string> = {
  'AUTH-001': 'Sessão expirada. Faça login novamente.',
  'AUTH-002': 'Acesso negado.',
  'AUTH-003': 'CPF já cadastrado na plataforma.',
  'AUTH-004': 'Este email já está cadastrado. Faça login ou recupere sua senha.',
  'AUTH-005': 'Acesso restrito ao painel administrativo.',
  'AUTH-006': 'Muitas tentativas de login. Aguarde antes de tentar novamente.',
  'AUTH-007': 'Senha não atende aos requisitos mínimos.',
  'AUTH-008': 'Operação não permitida.',
  'AUTH-009': 'Muitas tentativas. Tente novamente em 1 hora.',
  'AUTH-010': 'Sessão inválida. Faça login novamente.',
  'AUTH-011': 'CPF identificado como menor de idade. Cadastro não permitido.',
  'AUTH-012': 'Sua verificação de idade está pendente. Aguarde a conclusão.',
  'AUTH-013': 'Não foi possível concluir o cadastro com os dados informados. Verifique e tente novamente.',
  'VAL-001': 'Dados inválidos. Verifique os campos e tente novamente.',
  'VAL-002': 'Você deve ter ao menos 18 anos para se cadastrar (ECA Digital).',
  'VAL-003': 'Valor fora do intervalo permitido.',
  'ORD-008': 'Tipo de ordem não disponível para seu plano.',
  'ADMIN-050': 'Permissão insuficiente para esta ação administrativa.',
  'ADMIN-051': 'Permissão insuficiente para gerenciar notícias.',
  'ADMIN-052': 'Permissão insuficiente para gerenciar patrocinadores.',
  'ADMIN-053': 'Não é possível executar esta ação contra a própria conta.',
  'ADMIN-054': 'Não é possível executar esta ação contra contas administrativas.',
  'ADMIN-055': 'Apenas SUPER_ADMIN pode executar esta ação.',
  'ADMIN-056': 'Não é permitido rebaixar o próprio acesso.',
  'ADMIN-057': 'Não é permitido remover o último SUPER_ADMIN.',
  'ADMIN-058': 'Não é permitido auto-promover para SUPER_ADMIN.',
  'ASSET-001': 'Ativo não encontrado.',
  'ASSET-051': 'Ativo não encontrado na lista de ativos válidos.',
  'RATE-001': 'Limite de requisições excedido. Aguarde antes de tentar novamente.',
  'SYS-001': 'Erro interno. Tente novamente em instantes.',
  'SYS-002': 'Serviço temporariamente indisponível.',
  'NOT-FOUND-001': 'Recurso não encontrado.',
}
