// Foot Stock — Tipos centralizados
// Gerado por /back-end-build em 2026-03-28

// ─── Resposta padrão da API ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
}

export interface ApiListResponse<T> {
  data: T[]
  pagination: Pagination
}

export interface ApiErrorResponse {
  error: ApiError
}

export interface ApiError {
  code: string
  message: string
  details?: string | null
  available?: number | null
  requiredPlan?: string | null
  limit?: number | null
  resetAt?: string | null
  ticker?: string | null
  estimatedResume?: string | null
}

// ─── Paginação ─────────────────────────────────────────────────────────────────

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
}

export interface PaginationParams {
  page?: number
  limit?: number
}

// ─── Enums ─────────────────────────────────────────────────────────────────────

export type UserType = 'NORMAL' | 'TIME_PARCEIRO' | 'INFLUENCIADOR'
export type InvestorProfile = 'CONSERVADOR' | 'MODERADO' | 'ARROJADO' | 'ESPECULADOR' | 'INICIANTE' | 'INTERMEDIARIO' | 'AVANCADO' | 'FA'
export type PlanType = 'JOGADOR' | 'CRAQUE' | 'LENDA'
export type AdminRole = 'SUPER_ADMIN' | 'ADMINISTRADOR' | 'MONITOR' | 'EDITOR' | 'MODERADOR' | 'CLUB_PARTNER'
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'OCO' | 'SCHEDULED'
export type OrderSide = 'BUY' | 'SELL'
export type OrderStatus = 'OPEN' | 'FILLED' | 'CANCELLED' | 'EXPIRED' | 'PARTIAL'
export type PositionSide = 'LONG' | 'SHORT'
export type AssetDivision = 'SERIE_A' | 'SERIE_B'
export type AssetSentiment = 'BULLISH' | 'NEUTRAL' | 'BEARISH'
export type TransactionType = 'BUY' | 'SELL' | 'FEE' | 'DIVIDEND' | 'MARGIN_CALL'
export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLATION_LOCK' | 'CANCELLED' | 'PAST_DUE' | 'TRIALING'
export type PaymentGateway = 'MERCADO_PAGO' | 'PAGSEGURO' | 'PAYPAL'
export type PaymentPeriod = 'MONTHLY' | 'YEARLY'
export type ImpactCategory = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'FINANCEIRA_CRITICA' | 'ESPORTIVA_MAJORITARIA' | 'MERCADO_ATIVOS' | 'INTEGRIDADE_SAUDE' | 'INSTITUCIONAL' | 'ESPORTIVA_MENOR'
export type LeagueType = 'PUBLICA' | 'AMIGOS' | 'PRO'
export type LeagueDivision = 'BRONZE' | 'PRATA' | 'OURO' | 'ABERTA'
/** Alias semântico para LeagueDivision — usado nos contratos de scoring */
export type LeagueCategory = LeagueDivision
export type LeagueDuration = '1S' | '1M' | 'TEMPORADA'
export type LeagueStatus = 'PENDING' | 'ACTIVE' | 'FINISHED'
export type ScorePillar = 'RENTABILIDADE' | 'SOFISTICACAO' | 'DIVERSIFICACAO' | 'CONSISTENCIA' | 'BONUS_EDUCATIVO'
export type PostStatus = 'ACTIVE' | 'REMOVED' | 'FLAGGED'

// module-19: 16 tipos de notificação (NOTIFICATION-SPEC v1.0)
export type NotificationType =
  | 'ORDER_EXECUTED'
  | 'ORDER_CANCELLED'
  | 'MARGIN_CALL_ALERT'
  | 'CIRCUIT_BREAKER'
  | 'NEWS_FAVORITE_CLUB'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_FAILED'
  | 'PLAN_CANCEL_ALERT'
  | 'DIVIDEND_CREDITED'
  | 'BONUS_CREDITED'
  | 'LEAGUE_RESULT'
  | 'ADMIN_BROADCAST'
  | 'CANCELLATION_LOCK_ACTIVE'
  | 'CANCELLATION_LOCK_LIQUIDATED'

export interface NotificationDTO {
  id: string
  userId: string
  type: NotificationType | string
  title: string
  body: string
  read: boolean
  metadata?: Record<string, unknown> | null
  createdAt: string
}

export interface SendNotificationOptions {
  userId: string
  type: NotificationType
  title: string
  body: string
  metadata?: Record<string, unknown>
}

// ─── Entidades ─────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  name: string
  phone?: string | null
  birthDate: string
  favoriteClub: string
  favoriteClubDisplayName?: string | null
  userType: UserType
  investorProfile: InvestorProfile
  planType: PlanType
  fsBalance: number
  marginBlocked: number
  tourCompleted: boolean
  ageVerificationPending: boolean
  adminRole?: AdminRole | null
  createdAt: string
  updatedAt: string
}

export interface Asset {
  id: string
  ticker: string
  name: string
  clubSlug: string
  division: AssetDivision
  currentPrice: number
  fairValue: number
  currentSupply: number
  totalShares: number
  isHalted: boolean
  haltReason?: string | null
  colorPrimary: string
  colorSecondary: string
  logoUrl?: string | null
  financials: {
    receita?: number | null
    elenco?: number | null
    marca?: number | null
    divida?: number | null
    freeFloat?: number | null
    multiplicador?: number | null
    marketCap?: number | null
    ipoPrice?: number | null
    equityValue?: number | null
    totalShares?: number | null
    [key: string]: unknown
  } | null
  sentiment: AssetSentiment
  updatedAt: string
}

export interface PriceCandle {
  id: string
  ticker: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  period: '1m' | '5m' | '15m' | '1h' | '1d'
  timestamp: string
}

export interface Order {
  id: string
  userId: string
  ticker: string
  type: OrderType
  side: OrderSide
  quantity: number
  price?: number | null
  status: OrderStatus
  stopLossPrice?: number | null
  takeProfitPrice?: number | null
  scheduledAt?: string | null
  feeAmount?: number | null
  executedAt?: string | null
  expiresAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface Position {
  id: string
  userId: string
  ticker: string
  quantity: number
  avgPrice: number
  side: PositionSide
  marginBlocked: number
  leverageMultiplier: number
  leverageAmount: number
  dailyInterestRate: number
  interestAccrued: number
  createdAt: string
  updatedAt: string
}

export interface Transaction {
  id: string
  userId: string
  orderId?: string | null
  ticker: string
  type: TransactionType
  amount: number
  fsAmount: number
  balanceBefore: number
  balanceAfter: number
  createdAt: string
}

export interface Subscription {
  id: string
  userId: string
  planType: PlanType
  gateway: PaymentGateway
  period: PaymentPeriod
  status: SubscriptionStatus
  startsAt: string
  expiresAt?: string | null
  trialEndsAt?: string | null
  cancelledAt?: string | null
  cancellationLockExpiresAt?: string | null
  createdAt: string
  updatedAt: string
}

export type Notification = NotificationDTO

export interface NewsItem {
  id: string
  title: string
  source: string
  url: string
  ticker: string
  sentiment: number
  impactCategory: ImpactCategory
  publishedAt: string
  injectedAt: string
  createdAt: string
}

export interface ForumPost {
  id: string
  userId: string
  content: string
  ticker?: string | null
  status: PostStatus
  likes: number
  flagged: boolean
  createdAt: string
  updatedAt: string
}

export interface ScoreBreakdown {
  rentabilidade: number   // 0-35
  sofisticacao: number    // 0-25
  diversificacao: number  // 0-20
  consistencia: number    // 0-15
  bonusEducativo: number  // 0-5
  total: number           // soma dos pilares
  finalScore: number      // total × fatorEquidade
  fatorEquidade: number
}

export interface League {
  id: string
  name: string
  slug: string
  type: LeagueType
  division: LeagueDivision   // = category
  duration: LeagueDuration
  sponsorId?: string | null
  startsAt: string
  endsAt?: string | null
  status: LeagueStatus
  createdBy?: string | null
  memberCount?: number
  isMember?: boolean
  userRank?: number | null
  sponsor?: { id: string; name: string; logoUrl?: string | null } | null
  createdAt: string
}

export interface LeagueMember {
  id: string
  leagueId: string
  userId: string
  score: number       // = finalScore
  rank: number
  joinedAt?: string
  lastScoreAt?: string | null
  scoreBreakdown?: ScoreBreakdown | null
  updatedAt: string
}

export interface LeagueMemberRanking {
  rank: number
  userId: string
  userName: string
  userPlan: PlanType
  userAvatarUrl?: string | null
  score: ScoreBreakdown
  joinedAt: string
  isCurrentUser?: boolean
}

export interface AIAnalysis {
  ticker: string
  clubName: string
  resumo: string
  pontosPositivos: string[]
  pontosNegativos: string[]
  sentimentoGeral: AssetSentiment
  recomendacao: 'COMPRAR' | 'MANTER' | 'VENDER'
  nivelRisco: 'BAIXO' | 'MEDIO' | 'ALTO'
  noticiasRecentes: Array<{
    titulo: string
    sentimento: AssetSentiment
    emoji: string
  }>
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  user: User
}

export interface CheckoutResponse {
  checkoutUrl: string
  subscriptionId: string
}

// ─── Inputs ────────────────────────────────────────────────────────────────────

export interface RegisterInput {
  name: string
  email: string
  password: string
  cpf: string
  phone?: string
  birthDate: string
  favoriteClub: string
  investorProfile: InvestorProfile
  consentLgpd: boolean
}

export interface LoginInput {
  email: string
  password: string
}

export interface UpdateUserInput {
  name?: string
  phone?: string
  favoriteClub?: string
  investorProfile?: InvestorProfile
  tourCompleted?: boolean
}

export interface CreateOrderInput {
  ticker: string
  type: OrderType
  side: OrderSide
  quantity: number
  price?: number
  stopLossPrice?: number
  takeProfitPrice?: number
  scheduledAt?: string
}

export interface CheckoutInput {
  planType: 'CRAQUE' | 'LENDA'
  gateway: PaymentGateway
  period: PaymentPeriod
}

export interface CreateForumPostInput {
  content: string
  ticker?: string
}

export interface CreateLeagueInput {
  name: string
  type: 'AMIGOS' | 'PRO'
  duration: number
}

// ─── JWT payload ───────────────────────────────────────────────────────────────

export interface JWTPayload {
  sub: string
  email: string
  planType: PlanType
  adminRole?: AdminRole | null
  iat: number
  exp: number
}
