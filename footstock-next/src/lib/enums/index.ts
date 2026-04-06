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

/** Status do ciclo de vida de uma ordem (alinhado com Prisma OrderStatus enum) */
export const ORDER_STATUS = {
  /** Ordem aberta no order book */
  OPEN: 'OPEN',
  /** Executada completamente pelo motor */
  FILLED: 'FILLED',
  /** Cancelada pelo usuário ou sistema */
  CANCELLED: 'CANCELLED',
  /** Expirada por tempo */
  EXPIRED: 'EXPIRED',
  /** Parcialmente executada */
  PARTIAL: 'PARTIAL',
  // Aliases legados (mapeiam para os valores canônicos)
  /** @deprecated Use OPEN */
  PENDING: 'OPEN',
  /** @deprecated Use FILLED */
  EXECUTED: 'FILLED',
} as const;
export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/** Papéis administrativos do painel */
export const ADMIN_ROLE = {
  /** Acesso total ao sistema */
  SUPER_ADMIN: 'SUPER_ADMIN',
  /** Gestão geral da plataforma */
  ADMIN: 'ADMIN',
  /** Administrador (legado) */
  ADMINISTRADOR: 'ADMINISTRADOR',
  /** Visualização e monitoramento */
  MONITOR: 'MONITOR',
  /** Edição de conteúdo e notícias */
  EDITOR: 'EDITOR',
  /** Moderação do fórum */
  MODERADOR: 'MODERADOR',
  /** Parceiro de clube (Time Parceiro) */
  CLUB_PARTNER: 'CLUB_PARTNER',
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
  /** Fã de futebol (perfil torcedor) */
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
  /** Comissão de afiliado recebida */
  AFFILIATE_COMMISSION_EARNED: 'AFFILIATE_COMMISSION_EARNED',
  /** Usuário cadastrado via link de afiliado */
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

/** Status do ciclo de vida de uma assinatura */
export const SUBSCRIPTION_STATUS = {
  /** Período de teste gratuito */
  TRIAL: 'TRIAL',
  /** Assinatura ativa */
  ACTIVE: 'ACTIVE',
  /** Assinatura cancelada */
  CANCELLED: 'CANCELLED',
  /** Assinatura expirada */
  EXPIRED: 'EXPIRED',
  /** Aguardando confirmação de pagamento */
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  /** Trava de cancelamento (48h para liquidação de posições) */
  CANCELLATION_LOCK: 'CANCELLATION_LOCK',
} as const;
export type SubscriptionStatusType = (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

/** Hierarquia numérica dos planos para comparações de upgrade/downgrade */
export const PLAN_HIERARCHY: Record<PlanType, number> = {
  JOGADOR: 0,
  CRAQUE: 1,
  LENDA: 2,
} as const;

/** Status de pagamento */
export const PAYMENT_STATUS = {
  /** Pagamento pendente */
  PENDING: 'PENDING',
  /** Pagamento aprovado */
  APPROVED: 'APPROVED',
  /** Pagamento pago (legado) */
  PAID: 'PAID',
  /** Pagamento rejeitado */
  REJECTED: 'REJECTED',
  /** Pagamento estornado */
  REFUNDED: 'REFUNDED',
  /** Chargeback */
  CHARGEBACK: 'CHARGEBACK',
} as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

// ---------------------------------------------------------------------------
// Module-15: Portfolio Dashboard
// ---------------------------------------------------------------------------

/** Períodos de visualização do histórico do portfólio */
export const PORTFOLIO_PERIOD = {
  H1: '1H',
  H12: '12H',
  H24: '24H',
  WEEK: '7D',
  MONTH: '30D',
  YEAR: '1Y',
  ALL: 'ALL',
} as const;
export type PortfolioPeriod = (typeof PORTFOLIO_PERIOD)[keyof typeof PORTFOLIO_PERIOD];

/** Variante de posição — regular (long) ou short */
export const POSITION_VARIANT = {
  REGULAR: 'REGULAR',
  SHORT: 'SHORT',
} as const;
export type PositionVariant = (typeof POSITION_VARIANT)[keyof typeof POSITION_VARIANT];

// ---------------------------------------------------------------------------
// Module-16: Dividendos
// ---------------------------------------------------------------------------

/** Tipo de dividendo distribuído */
export const DIVIDEND_TYPE = {
  ESPORTIVO: 'ESPORTIVO',
  FINANCEIRO: 'FINANCEIRO',
} as const;
export type DividendType = (typeof DIVIDEND_TYPE)[keyof typeof DIVIDEND_TYPE];

/** Status do ciclo de vida de um dividendo */
export const DIVIDEND_STATUS = {
  CREDITED: 'CREDITED',
  PENDING: 'PENDING',
  EXPIRADO: 'EXPIRADO',
} as const;
export type DividendStatus = (typeof DIVIDEND_STATUS)[keyof typeof DIVIDEND_STATUS];

// ---------------------------------------------------------------------------
// module-18: Forum Global & Glossário
// ---------------------------------------------------------------------------

/** Ordem de exibição dos posts do fórum */
export const FORUM_SORT_ORDER = {
  RECENT: 'recent',
  POPULAR: 'popular',
} as const;
export type ForumSortOrder = (typeof FORUM_SORT_ORDER)[keyof typeof FORUM_SORT_ORDER];

/** Categorias do glossário financeiro-esportivo (INTAKE canônico: 8 categorias) */
export const GLOSSARY_CATEGORY = {
  INDICADORES_TECNICOS: 'indicadores-tecnicos',
  VALUATION_FUNDAMENTOS: 'valuation-e-fundamentos',
  TIPOS_DE_ORDEM: 'tipos-de-ordem',
  CARTEIRA_RENTABILIDADE: 'carteira-e-rentabilidade',
  SENTIMENTO_ANALISE: 'sentimento-e-analise',
  MERCADO_PREGAO: 'mercado-e-pregao',
  DIVISOES_CLUBES: 'divisoes-e-clubes',
  PLANOS_FUNCIONALIDADES: 'planos-e-funcionalidades',
} as const;
export type GlossaryCategory = (typeof GLOSSARY_CATEGORY)[keyof typeof GLOSSARY_CATEGORY];

// ---------------------------------------------------------------------------
// Status de usuário (conta)
// ---------------------------------------------------------------------------

/** Status da conta de um usuário */
export const USER_STATUS = {
  /** Conta ativa */
  ACTIVE: 'ACTIVE',
  /** Conta suspensa temporariamente */
  SUSPENDED: 'SUSPENDED',
  /** Conta banida permanentemente */
  BANNED: 'BANNED',
  /** Sem plano pago (plano gratuito) */
  FREE: 'FREE',
} as const;
export type UserStatusType = (typeof USER_STATUS)[keyof typeof USER_STATUS];

// ---------------------------------------------------------------------------
// Status de notícia editorial
// ---------------------------------------------------------------------------

/** Status do ciclo de vida de uma notícia editorial */
export const NEWS_STATUS = {
  /** Rascunho (não publicado) */
  DRAFT: 'DRAFT',
  /** Publicado e visível */
  PUBLISHED: 'PUBLISHED',
  /** Arquivado (não visível) */
  ARCHIVED: 'ARCHIVED',
} as const;
export type NewsStatus = (typeof NEWS_STATUS)[keyof typeof NEWS_STATUS];

// ---------------------------------------------------------------------------
// Status de liga
// ---------------------------------------------------------------------------

/** Status do ciclo de vida de uma liga */
export const LEAGUE_STATUS = {
  /** Liga ativa aceitando participantes */
  ACTIVE: 'ACTIVE',
  /** Liga encerrada */
  FINISHED: 'FINISHED',
  /** Liga cancelada */
  CANCELLED: 'CANCELLED',
} as const;
export type LeagueStatus = (typeof LEAGUE_STATUS)[keyof typeof LEAGUE_STATUS];

// ---------------------------------------------------------------------------
// Status de saúde do sistema
// ---------------------------------------------------------------------------

/** Status de saúde de um componente de sistema */
export const HEALTH_STATUS = {
  /** Componente operacional */
  OK: 'ok',
  /** Componente com erro */
  ERROR: 'error',
  /** Componente com degradação parcial */
  DEGRADED: 'degraded',
} as const;
export type HealthStatus = (typeof HEALTH_STATUS)[keyof typeof HEALTH_STATUS];

/** Status do motor de cotações */
export const MOTOR_STATUS = {
  /** Motor online */
  ONLINE: 'ONLINE',
  /** Motor offline */
  OFFLINE: 'OFFLINE',
  /** Motor em estado degradado */
  DEGRADED: 'DEGRADED',
} as const;
export type MotorStatus = (typeof MOTOR_STATUS)[keyof typeof MOTOR_STATUS];
