// ============================================================================
// Foot Stock — Mensagens do sistema (PT-BR)
// ============================================================================

export const MESSAGES = {
  AUTH: {
    LOGIN_SUCCESS: 'Login realizado com sucesso.',
    LOGIN_FAILED: 'E-mail ou senha incorretos.',
    REGISTER_SUCCESS: 'Conta criada com sucesso! Verifique seu e-mail.',
    REGISTER_FAILED: 'Não foi possível criar a conta. Tente novamente.',
    REGISTER_WELCOME: 'Cadastro realizado!',
    REGISTER_WELCOME_DESCRIPTION: 'Bem-vindo ao Foot Stock.',
    REGISTER_CONNECTION_ERROR: 'Erro de conexão. Tente novamente.',
    LOGOUT_SUCCESS: 'Você saiu da sua conta.',
    SESSION_EXPIRED: 'Sua sessão expirou. Faça login novamente.',
    PASSWORD_RESET_SENT: 'E-mail de redefinição enviado com sucesso.',
    PASSWORD_RESET_SUCCESS: 'Senha redefinida com sucesso.',
    EMAIL_NOT_FOUND: 'E-mail não encontrado.',
    UNAUTHORIZED: 'Você não tem permissão para acessar este recurso.',
    CLUB_SESSION_EXPIRED: 'Sessão expirada',
    CLUB_SESSION_EXPIRED_DESCRIPTION: 'Faça login novamente.',
    CLUB_ACCESS_DENIED: 'Acesso negado',
    CLUB_ACCESS_DENIED_DESCRIPTION: 'Acesso restrito a clubes parceiros.',
    CLUB_INVALID_CREDENTIALS: 'Credenciais inválidas',
    CLUB_INVALID_CREDENTIALS_DESCRIPTION: 'Email ou senha incorretos.',
    CLUB_GENERIC_ERROR: 'Erro',
    CLUB_GENERIC_ERROR_DESCRIPTION: 'Erro inesperado. Tente novamente.',
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
    AVATAR_SIZE_ERROR: 'A imagem deve ter no máximo 2 MB.',
    AVATAR_UPLOAD_ERROR: 'Falha ao enviar avatar. Tente novamente.',
    AVATAR_UPLOAD_GENERIC_ERROR: 'Erro ao enviar avatar.',
    BIO_UPDATED: 'Bio atualizada com sucesso.',
    BIO_UPDATE_ERROR: 'Não foi possível salvar a bio. Tente novamente.',
    ACCOUNT_DELETE_SUBSCRIPTION_ERROR: 'Cancele sua assinatura em "Gerir assinatura" antes de excluir a conta.',
    ACCOUNT_DELETE_ERROR: 'Não foi possível excluir a conta. Tente novamente.',
    LOGOUT_ERROR: 'Não foi possível sair agora. Tente novamente.',
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

  FORUM: {
    POST_PUBLISHED: 'Post publicado!',
    POST_PUBLISHED_DESCRIPTION: 'Sua análise foi publicada.',
    POST_LIKED_ERROR: 'Erro ao curtir',
    POST_LIKED_ERROR_DESCRIPTION: 'Erro ao curtir post. Tente novamente.',
    POST_DELETE_ERROR: 'Erro ao deletar',
    POST_DELETE_ERROR_DESCRIPTION: 'Não foi possível deletar o post.',
    LIMIT_REACHED: 'Limite atingido',
    LIMIT_REACHED_DESCRIPTION: 'Você atingiu o limite de posts por hora.',
    POST_PUBLISH_ERROR: 'Erro ao publicar',
    POST_PUBLISH_ERROR_DESCRIPTION: 'Erro ao publicar post. Tente novamente.',
  },

  AFFILIATE: {
    BANK_SAVED: 'Dados salvos!',
    BANK_SAVED_DESCRIPTION: 'Dados bancários salvos com sucesso.',
    BANK_SAVE_ERROR: 'Falha ao salvar dados bancários.',
    GENERIC_ERROR: 'Erro inesperado. Tente novamente.',
  },

  PORTFOLIO: {
    DIVIDEND_REINVESTED: 'Dividendo reinvestido com sucesso!',
    DIVIDEND_ALREADY_PROCESSED: 'Este dividendo já foi processado.',
    DIVIDEND_EXPIRED: 'O prazo de reinvestimento expirou.',
    DIVIDEND_REINVEST_ERROR: 'Erro ao reinvestir. Tente novamente.',
  },
} as const;
