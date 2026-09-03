// FootStock — Constantes de erro
// Referência: output/docs/foot-stock/project/ERROR-CATALOG.md
//
// ATENCAO (2026-09-03): este arquivo NAO e o catalogo de wire e nao e importado
// por nenhum modulo de `src/`. O catalogo que as respostas HTTP de fato usam e
// `src/lib/constants/errors.ts`, e a numeracao dos dois DIVERGE:
//
//   codigo    | aqui (morto)              | src/lib/constants (wire real)
//   ----------|---------------------------|------------------------------------
//   AUTH_002  | e-mail ou senha incorretos | Acesso negado
//   AUTH_003  | acesso negado              | CPF ja cadastrado
//   AUTH_004  | conta suspensa             | e-mail ja cadastrado (usado no register)
//   AUTH_007  | e-mail ja cadastrado       | senha fora dos requisitos
//
// Por isso a suspensao de conta implantada em 2026-09-03 recebeu codigos NOVOS
// (AUTH-014 suspensa, AUTH-015 banida) em vez de reaproveitar o AUTH_004 daqui:
// AUTH-004 no wire ja significa outra coisa e ja esta em producao.
// Nao usar este arquivo como fonte. Ou ele e reconciliado, ou e apagado.

export const ERROR_CODES = {
  // VAL — Validação
  VAL_001: 'Campo obrigatório não informado.',
  VAL_002: 'Formato inválido.',
  VAL_003: 'Valor fora do intervalo permitido.',
  VAL_004: 'Tamanho inválido.',

  // SYS — Sistema
  SYS_001: 'Erro interno. Nossa equipe foi notificada.',
  SYS_002: 'Serviço temporariamente indisponível.',
  SYS_003: 'Conflito de concorrência. Recarregue e tente novamente.',

  // AUTH — Autenticação/Autorização
  AUTH_001: 'Sessão expirada. Faça login novamente.',
  AUTH_002: 'E-mail ou senha incorretos.',
  AUTH_003: 'Acesso negado.',
  AUTH_004: 'Conta suspensa. Entre em contato com o suporte.',
  AUTH_005: 'Já existe uma conta com este CPF.',
  AUTH_006: 'É necessário ter 18 anos ou mais para se cadastrar.',
  AUTH_007: 'E-mail já cadastrado.',
  AUTH_008: 'Token de reset inválido ou expirado.',
  AUTH_011: 'CPF identificado como menor de idade. Cadastro não permitido.',
  AUTH_012: 'Sua verificação de idade está pendente. Aguarde a conclusão.',

  // RATE — Rate Limiting
  RATE_001: 'Limite de requisições atingido. Tente novamente em instantes.',
  RATE_002: 'Muitas tentativas de login. Aguarde 15 minutos.',

  // ORDER — Ordens
  ORDER_001: 'Limite de ordens do plano atingido.',
  ORDER_002: 'Saldo insuficiente para realizar a operação.',
  ORDER_003: 'Tipo de ordem não permitido pelo seu plano.',
  ORDER_004: 'Atualização concorrente detectada. Recarregue e tente novamente.',
  ORDER_005: 'Negociação suspensa para este ativo.',
  ORDER_006: 'Apenas ordens pendentes podem ser canceladas.',
  ORDER_007: 'Quantidade mínima não atingida.',

  // ASSET — Ativos
  ASSET_001: 'Ativo não encontrado.',
  ASSET_002: 'Ativo em halt — negociação suspensa.',
  ASSET_003: 'Ticker inválido.',

  // POS — Posições
  POS_001: 'Posição insuficiente para esta operação.',
  POS_002: 'Margem insuficiente para operação short.',
  POS_003: 'Alavancagem requer plano Lenda.',

  // PAYMENT — Pagamentos
  PAYMENT_001: 'Gateway de pagamento indisponível.',
  PAYMENT_002: 'Assinatura já ativa neste plano.',
  PAYMENT_003: 'Período de arrependimento em andamento.',
  PAYMENT_004: 'Webhook com assinatura inválida.',
  PAYMENT_005: 'Pagamento já processado.',

  // LEAGUE — Ligas
  LEAGUE_001: 'Plano insuficiente para criar este tipo de liga.',
  LEAGUE_002: 'Usuário já é membro desta liga.',
  LEAGUE_003: 'Liga não encontrada ou encerrada.',

  // AI — Assessor IA
  AI_001: 'Limite de consultas por hora atingido.',
  AI_002: 'Assessor indisponível. Tente em breve.',
  AI_003: 'Plano insuficiente. Assessor IA disponível a partir do plano Craque.',

  // FORUM — Fórum
  FORUM_001: 'Conteúdo inválido ou bloqueado.',
  FORUM_002: 'Limite de posts por minuto atingido.',
  FORUM_003: 'Post não encontrado.',

  // USER — Perfil
  USER_001: 'Perfil não encontrado.',
  USER_002: 'Atualização não permitida.',

  // LGPD
  LGPD_001: 'Solicitação de exclusão registrada.',
  LGPD_002: 'Exportação de dados registrada.',

  // ADMIN
  ADMIN_001: 'Permissão insuficiente para esta ação.',
  ADMIN_002: 'Usuário não encontrado.',

  // NOT FOUND
  NOT_FOUND_001: 'Recurso não encontrado.',
} as const

export type ErrorCode = keyof typeof ERROR_CODES
