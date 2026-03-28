// ============================================================================
// Foot Stock — Mensagens do sistema (PT-BR)
// ============================================================================

export const MESSAGES = {
  AUTH: {
    LOGIN_SUCCESS: 'Login realizado com sucesso.',
    LOGIN_FAILED: 'E-mail ou senha incorretos.',
    REGISTER_SUCCESS: 'Conta criada com sucesso! Verifique seu e-mail.',
    REGISTER_FAILED: 'Não foi possível criar a conta. Tente novamente.',
    LOGOUT_SUCCESS: 'Você saiu da sua conta.',
    SESSION_EXPIRED: 'Sua sessão expirou. Faça login novamente.',
    PASSWORD_RESET_SENT: 'E-mail de redefinição enviado com sucesso.',
    PASSWORD_RESET_SUCCESS: 'Senha redefinida com sucesso.',
    EMAIL_NOT_FOUND: 'E-mail não encontrado.',
    UNAUTHORIZED: 'Você não tem permissão para acessar este recurso.',
  },

  ORDERS: {
    CREATED: 'Ordem criada com sucesso.',
    EXECUTED: 'Ordem executada com sucesso.',
    CANCELLED: 'Ordem cancelada.',
    CANCEL_FAILED: 'Não foi possível cancelar a ordem.',
    INSUFFICIENT_BALANCE: 'Saldo insuficiente para esta operação.',
    LIMIT_EXCEEDED: 'Limite de ordens ativas atingido para seu plano.',
    MARKET_CLOSED: 'O mercado está fechado no momento.',
    CIRCUIT_BREAKER_ACTIVE: 'Negociação suspensa: circuit breaker ativado.',
    POSITION_LIMIT: 'Limite de concentração por ativo atingido (25%).',
    ORDER_NOT_FOUND: 'Ordem não encontrada.',
  },

  PROFILE: {
    UPDATED: 'Perfil atualizado com sucesso.',
    UPDATE_FAILED: 'Não foi possível atualizar o perfil.',
    PASSWORD_CHANGED: 'Senha alterada com sucesso.',
    PASSWORD_MISMATCH: 'A senha atual está incorreta.',
    AVATAR_UPDATED: 'Foto de perfil atualizada.',
  },

  SUBSCRIPTION: {
    SUBSCRIBED: 'Assinatura ativada com sucesso!',
    CANCELLED: 'Assinatura cancelada. Acesso mantido até o fim do período.',
    UPGRADE_SUCCESS: 'Plano atualizado com sucesso!',
    DOWNGRADE_SUCCESS: 'Plano alterado. A mudança será aplicada no próximo ciclo.',
    PAYMENT_FAILED: 'Falha no pagamento. Verifique seus dados.',
    PAYMENT_CONFIRMED: 'Pagamento confirmado.',
    ALREADY_SUBSCRIBED: 'Você já possui uma assinatura ativa.',
  },

  GENERIC: {
    LOADING: 'Carregando...',
    ERROR: 'Ocorreu um erro inesperado. Tente novamente.',
    NOT_FOUND: 'Recurso não encontrado.',
    NETWORK_ERROR: 'Erro de conexão. Verifique sua internet.',
    SAVED: 'Alterações salvas com sucesso.',
    DELETED: 'Item removido com sucesso.',
    CONFIRM_DELETE: 'Tem certeza que deseja remover este item?',
    NO_RESULTS: 'Nenhum resultado encontrado.',
    COPIED: 'Copiado!',
  },
} as const;
