// ============================================================================
// Foot Stock — Enums (const objects + derived types)
// ============================================================================

// ---------------------------------------------------------------------------
// ST001: Todos os enums como objetos `as const` com tipos derivados
// ---------------------------------------------------------------------------

/** Planos de assinatura disponíveis na plataforma */
export const PLAN_TYPE = {
  /** Plano gratuito com funcionalidades básicas */
  JOGADOR: 'JOGADOR',
  /** Plano intermediário com ordens avançadas */
  CRAQUE: 'CRAQUE',
  /** Plano premium com acesso completo */
  LENDA: 'LENDA',
} as const;
export type PlanType = (typeof PLAN_TYPE)[keyof typeof PLAN_TYPE];

/** Tipos de ordem disponíveis para negociação */
export const ORDER_TYPE = {
  /** Ordem executada ao preço de mercado */
  MARKET: 'MARKET',
  /** Ordem com preço-limite definido */
  LIMIT: 'LIMIT',
  /** Ordem OCO (One Cancels Other) */
  OCO: 'OCO',
  /** Ordem de venda a descoberto */
  SHORT: 'SHORT',
  /** Ordem programada para execução futura */
  SCHEDULED: 'SCHEDULED',
} as const;
export type OrderType = (typeof ORDER_TYPE)[keyof typeof ORDER_TYPE];

/** Lado da operação (compra ou venda) */
export const ORDER_SIDE = {
  /** Compra de ativo */
  BUY: 'BUY',
  /** Venda de ativo */
  SELL: 'SELL',
} as const;
export type OrderSide = (typeof ORDER_SIDE)[keyof typeof ORDER_SIDE];

/** Status do ciclo de vida de uma ordem */
export const ORDER_STATUS = {
  /** Aguardando execução no order book */
  OPEN: 'OPEN',
  /** Executada com sucesso pelo motor */
  FILLED: 'FILLED',
  /** Cancelada pelo usuário ou sistema */
  CANCELLED: 'CANCELLED',
  /** Expirada por tempo */
  EXPIRED: 'EXPIRED',
  /** Parcialmente executada */
  PARTIAL: 'PARTIAL',
} as const;
export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/** Papéis administrativos do painel */
export const ADMIN_ROLE = {
  /** Acesso total ao sistema */
  SUPER_ADMIN: 'SUPER_ADMIN',
  /** Gestão geral da plataforma */
  ADMINISTRADOR: 'ADMINISTRADOR',
  /** Visualização e monitoramento */
  MONITOR: 'MONITOR',
  /** Edição de conteúdo e notícias */
  EDITOR: 'EDITOR',
  /** Moderação do fórum */
  MODERADOR: 'MODERADOR',
} as const;
export type AdminRole = (typeof ADMIN_ROLE)[keyof typeof ADMIN_ROLE];

/** Sessões do pregão virtual */
export const SESSION_TYPE = {
  /** Período de pré-abertura */
  PRE_ABERTURA: 'PRE_ABERTURA',
  /** Pregão regular de negociação */
  NEGOCIACAO: 'NEGOCIACAO',
  /** Leilão de fechamento */
  CALL: 'CALL',
  /** After-market com restrições */
  AFTER_MARKET: 'AFTER_MARKET',
  /** Mercado fechado */
  FECHADO: 'FECHADO',
} as const;
export type SessionType = (typeof SESSION_TYPE)[keyof typeof SESSION_TYPE];

/** Perfil de investidor do usuário */
export const INVESTOR_PROFILE = {
  /** Investidor iniciante */
  INICIANTE: 'INICIANTE',
  /** Investidor com experiência moderada */
  INTERMEDIARIO: 'INTERMEDIARIO',
  /** Investidor experiente */
  AVANCADO: 'AVANCADO',
  /** Analista fundamentalista */
  FA: 'FA',
} as const;
export type InvestorProfile = (typeof INVESTOR_PROFILE)[keyof typeof INVESTOR_PROFILE];

/** Tipos de liga de competição */
export const LEAGUE_TYPE = {
  /** Liga pública aberta a todos */
  PUBLICA: 'PUBLICA',
  /** Liga privada entre amigos */
  AMIGOS: 'AMIGOS',
  /** Liga profissional com premiação */
  PRO: 'PRO',
} as const;
export type LeagueType = (typeof LEAGUE_TYPE)[keyof typeof LEAGUE_TYPE];

/** Tipos de notificação da plataforma */
export const NOTIFICATION_TYPE = {
  /** Ordem executada com sucesso */
  ORDER_EXECUTED: 'ORDER_EXECUTED',
  /** Ordem cancelada */
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  /** Alerta de chamada de margem */
  MARGIN_CALL_ALERT: 'MARGIN_CALL_ALERT',
  /** Circuit breaker ativado */
  CIRCUIT_BREAKER: 'CIRCUIT_BREAKER',
  /** Pagamento confirmado */
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
  /** Pagamento falhou */
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  /** Alerta de cancelamento de plano */
  PLAN_CANCEL_ALERT: 'PLAN_CANCEL_ALERT',
  /** Dividendo creditado */
  DIVIDEND_CREDITED: 'DIVIDEND_CREDITED',
  /** Bônus creditado */
  BONUS_CREDITED: 'BONUS_CREDITED',
  /** Resultado de liga publicado */
  LEAGUE_RESULT: 'LEAGUE_RESULT',
  /** Notícia publicada para clube favorito do usuário */
  NEWS_FAVORITE_CLUB: 'NEWS_FAVORITE_CLUB',
  /** Comunicado do administrador do sistema */
  ADMIN_BROADCAST: 'ADMIN_BROADCAST',
  /** Comissão de afiliado processada */
  AFFILIATE_COMMISSION_EARNED: 'AFFILIATE_COMMISSION_EARNED',
  /** Convidado de afiliado se cadastrou */
  AFFILIATE_INVITE_JOINED: 'AFFILIATE_INVITE_JOINED',
  /** Trava de cancelamento ativada (48h para liquidação) */
  CANCELLATION_LOCK_ACTIVE: 'CANCELLATION_LOCK_ACTIVE',
  /** Posições liquidadas compulsoriamente */
  CANCELLATION_LOCK_LIQUIDATED: 'CANCELLATION_LOCK_LIQUIDATED',
} as const;
export type NotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

/** Categorias de impacto nos preços dos ativos */
export const IMPACT_CATEGORY = {
  /** Vitória em partida */
  VITORIA: 'VITORIA',
  /** Derrota em partida */
  DERROTA: 'DERROTA',
  /** Empate em partida */
  EMPATE: 'EMPATE',
  /** Conquista de título */
  TITULO: 'TITULO',
  /** Rebaixamento de divisão */
  REBAIXAMENTO: 'REBAIXAMENTO',
  /** Contratação de jogador */
  CONTRATACAO: 'CONTRATACAO',
  /** Venda de jogador */
  VENDA: 'VENDA',
  /** Lesão de jogador */
  LESAO: 'LESAO',
  /** Suspensão de jogador */
  SUSPENSAO: 'SUSPENSAO',
  /** Mudança de técnico */
  TECNICO: 'TECNICO',
  /** Evento financeiro do clube */
  FINANCEIRO: 'FINANCEIRO',
  /** Contrato de patrocínio */
  PATROCINIO: 'PATROCINIO',
  /** Evento relacionado ao estádio */
  ESTADIO: 'ESTADIO',
  /** Evento de torcida */
  TORCIDA: 'TORCIDA',
  /** Polêmica de arbitragem */
  ARBITRAGEM: 'ARBITRAGEM',
} as const;
export type ImpactCategory = (typeof IMPACT_CATEGORY)[keyof typeof IMPACT_CATEGORY];

/** Sentimento de mercado ou notícia */
export const SENTIMENT = {
  /** Impacto muito positivo */
  MUITO_POSITIVO: 'MUITO_POSITIVO',
  /** Impacto positivo */
  POSITIVO: 'POSITIVO',
  /** Impacto neutro */
  NEUTRO: 'NEUTRO',
  /** Impacto negativo */
  NEGATIVO: 'NEGATIVO',
  /** Impacto muito negativo */
  MUITO_NEGATIVO: 'MUITO_NEGATIVO',
} as const;
export type Sentiment = (typeof SENTIMENT)[keyof typeof SENTIMENT];

/** Divisões do campeonato */
export const DIVISION = {
  /** Série A — primeira divisão */
  SERIE_A: 'SERIE_A',
  /** Série B — segunda divisão */
  SERIE_B: 'SERIE_B',
} as const;
export type Division = (typeof DIVISION)[keyof typeof DIVISION];

/** Status de pagamento */
export const PAYMENT_STATUS = {
  /** Pagamento pendente */
  PENDING: 'PENDING',
  /** Pagamento confirmado */
  PAID: 'PAID',
  /** Pagamento falhou */
  FAILED: 'FAILED',
  /** Pagamento estornado */
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];
