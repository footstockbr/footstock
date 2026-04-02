// ============================================================================
// Foot Stock — Códigos de erro e mensagens associadas
// ============================================================================

/** Códigos de erro da plataforma (36 códigos) */
export const ERROR_CODES = {
  // ---- AUTH (10) ----
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

  // ---- VALIDATION (10) ----
  VAL_001: 'VAL-001',
  VAL_002: 'VAL-002',
  VAL_003: 'VAL-003',
  VAL_004: 'VAL-004',
  VAL_005: 'VAL-005',
  VAL_006: 'VAL-006',
  VAL_007: 'VAL-007',
  VAL_008: 'VAL-008',
  VAL_009: 'VAL-009',
  VAL_010: 'VAL-010',

  // ---- ORDERS (8) ----
  ORD_001: 'ORD-001',
  ORD_002: 'ORD-002',
  ORD_003: 'ORD-003',
  ORD_004: 'ORD-004',
  ORD_005: 'ORD-005',
  ORD_006: 'ORD-006',
  ORD_007: 'ORD-007',
  ORD_008: 'ORD-008',

  // ---- PAYMENT (4) ----
  PAY_001: 'PAY-001',
  PAY_002: 'PAY-002',
  PAY_003: 'PAY-003',
  PAY_004: 'PAY-004',

  // ---- REGISTER (3) ----
  REG_001: 'REG-001',
  REG_002: 'REG-002',
  REG_003: 'REG-003',

  // ---- AGE (1) ----
  AGE_001: 'AGE-001',

  // ---- SYSTEM (6) ----
  SYS_001: 'SYS-001',
  SYS_002: 'SYS-002',
  SYS_003: 'SYS-003',
  SYS_004: 'SYS-004',
  SYS_005: 'SYS-005',
  SYS_006: 'SYS-006',

  // ---- POSITIONS / PORTFOLIO (module-15) ----
  POS_050: 'POS-050',
  POS_080: 'POS-080',

  // ---- RATE LIMIT (module-18, module-21) ----
  RATE_001: 'RATE-001',
  RATE_002: 'RATE-002',

  // ---- AI / ASSESSOR (module-21) ----
  AI_050: 'AI-050',
  AI_051: 'AI-051',

  // ---- ADMIN (module-22) ----
  ADMIN_050: 'ADMIN-050',
  ASSET_051: 'ASSET-051',

  // ---- CLUB PORTAL (module-25) ----
  ADMIN_051: 'ADMIN-051',

  // ---- AFFILIATE (module-25) ----
  AFFILIATE_001: 'AFFILIATE-001',
  AFFILIATE_002: 'AFFILIATE-002',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Mensagens descritivas para cada código de erro (PT-BR) */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // AUTH
  'AUTH-001': 'Credenciais inválidas.',
  'AUTH-002': 'Token de acesso expirado.',
  'AUTH-003': 'Token de refresh inválido.',
  'AUTH-004': 'Conta não verificada. Verifique seu e-mail.',
  'AUTH-005': 'Conta bloqueada por excesso de tentativas.',
  'AUTH-006': 'E-mail já cadastrado.',
  'AUTH-007': 'Senha não atende aos requisitos mínimos.',
  'AUTH-008': 'Token de redefinição de senha inválido ou expirado.',
  'AUTH-009': 'Permissão insuficiente para esta ação.',
  'AUTH-010': 'Sessão inválida. Faça login novamente.',

  // VALIDATION
  'VAL-001': 'Campo obrigatório não preenchido.',
  'VAL-002': 'Formato de e-mail inválido.',
  'VAL-003': 'Valor fora do intervalo permitido.',
  'VAL-004': 'Formato de data inválido.',
  'VAL-005': 'Tipo de dado inválido.',
  'VAL-006': 'Tamanho excede o limite máximo.',
  'VAL-007': 'Caracteres não permitidos.',
  'VAL-008': 'CPF inválido.',
  'VAL-009': 'Ticker não encontrado.',
  'VAL-010': 'Parâmetros de paginação inválidos.',

  // ORDERS
  'ORD-001': 'Saldo insuficiente para a operação.',
  'ORD-002': 'Limite de ordens ativas atingido.',
  'ORD-003': 'Mercado fechado para negociação.',
  'ORD-004': 'Circuit breaker ativo para este ativo.',
  'ORD-005': 'Ordem não encontrada.',
  'ORD-006': 'Ordem não pode ser cancelada neste status.',
  'ORD-007': 'Concentração por ativo excede o limite permitido.',
  'ORD-008': 'Tipo de ordem não disponível para seu plano.',

  // PAYMENT
  'PAY-001': 'Falha no processamento do pagamento.',
  'PAY-002': 'Cartão recusado pela operadora.',
  'PAY-003': 'Assinatura não encontrada.',
  'PAY-004': 'Período de carência para cancelamento não atingido.',

  // REGISTER
  'REG-001': 'Já existe uma conta com este CPF.',
  'REG-002': 'Este e-mail já está cadastrado.',
  'REG-003': 'Muitas tentativas de cadastro. Tente novamente em 1 hora.',

  // AGE
  'AGE-001': 'Você deve ter ao menos 18 anos para se cadastrar.',

  // SYSTEM
  'SYS-001': 'Erro interno do servidor.',
  'SYS-002': 'Serviço temporariamente indisponível.',
  'SYS-003': 'Tempo de resposta excedido.',
  'SYS-004': 'Taxa de requisições excedida. Tente novamente em instantes.',
  'SYS-005': 'Recurso não encontrado.',
  'SYS-006': 'Erro de comunicação com serviço externo.',

  // POSITIONS / PORTFOLIO
  'POS-050': 'Posição liquidada por margem insuficiente.',
  'POS-080': 'Posição não encontrada.',

  // RATE LIMIT
  'RATE-001': 'Limite de postagens atingido. Tente novamente em instantes.',
  'RATE-002': 'Limite de consultas ao Assessor IA atingido (10/hora).',

  // AI / ASSESSOR
  'AI-050': 'O Assessor IA está disponível a partir do plano Craque.',
  'AI-051': 'O Assessor IA está temporariamente indisponível. Tente novamente.',

  // ADMIN
  'ADMIN-050': 'Permissão insuficiente para esta ação administrativa.',
  'ASSET-051': 'Ticker inválido ou não encontrado na lista de ativos.',

  // CLUB PORTAL
  'ADMIN-051': 'Acesso a dados de outro clube não permitido.',

  // AFFILIATE
  'AFFILIATE-001': 'Sem código de afiliado ativo.',
  'AFFILIATE-002': 'CPF/CNPJ inválido.',
} as const;
