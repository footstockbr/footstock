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
  hasNext: boolean
}

export interface PaginationParams {
  page?: number
  limit?: number
}

// ─── Enums ─────────────────────────────────────────────────────────────────────

export type UserType = 'NORMAL' | 'TIME_PARCEIRO' | 'INFLUENCIADOR'
export type InvestorProfile = 'INICIANTE' | 'INTERMEDIARIO' | 'AVANCADO' | 'FA_FUTEBOL'
export type PlanType = 'JOGADOR' | 'CRAQUE' | 'LENDA'
export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'MONITOR' | 'EDITOR' | 'MODERADOR'
export type OrderType = 'MARKET' | 'LIMIT' | 'OCO' | 'SHORT' | 'SCHEDULED'
export type OrderSide = 'BUY' | 'SELL'
export type OrderStatus = 'PENDING' | 'EXECUTED' | 'CANCELLED' | 'EXPIRED' | 'PARTIAL'
export type PositionSide = 'LONG' | 'SHORT'
export type AssetDivision = 'A' | 'B'
export type AssetSentiment = 'BULLISH' | 'NEUTRO' | 'BEARISH'
export type TransactionType = 'BUY' | 'SELL' | 'FEE' | 'DIVIDEND' | 'MARGIN_CALL'
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'PENDING_PAYMENT'
export type PaymentGateway = 'MERCADO_PAGO' | 'PAGSEGURO' | 'PAYPAL'
export type PaymentPeriod = 'MONTHLY' | 'ANNUAL'
export type ImpactCategory = 'RESULTADO_ESPORTIVO' | 'CONTRATACAO' | 'FINANCEIRO' | 'LESAO' | 'SUSPENSAO' | 'INSTITUCIONAL'
export type LeagueType = 'PUBLICA' | 'AMIGOS' | 'PRO'
export type LeagueDivision = 'BRONZE' | 'PRATA' | 'OURO' | 'ABERTA'
export type LeagueStatus = 'PENDING' | 'ACTIVE' | 'FINISHED'
export type PostStatus = 'ACTIVE' | 'REMOVED' | 'FLAGGED'

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
  displayName: string
  division: AssetDivision
  currentPrice: number
  fairValue: number
  currentSupply: number
  totalShares: number
  isHalted: boolean
  haltReason?: string | null
  colors: { primary: string; secondary: string }
  financials: {
    receita?: number | null
    elenco?: number | null
    marca?: number | null
    divida?: number | null
    freeFloat?: number | null
    multiplicador?: number | null
    // Market detail computed fields
    marketCap?: number | null
    ipoPrice?: number | null
    equityValue?: number | null
    totalShares?: number | null
    [key: string]: unknown
  }
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

export interface Notification {
  id: string
  userId: string
  type: string
  title: string
  body: string
  read: boolean
  metadata?: Record<string, unknown> | null
  createdAt: string
}

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

export interface League {
  id: string
  name: string
  type: LeagueType
  division: LeagueDivision
  duration: number
  sponsorId?: string | null
  startsAt: string
  endsAt?: string | null
  status: LeagueStatus
  createdAt: string
}

export interface LeagueMember {
  id: string
  leagueId: string
  userId: string
  score: number
  rank: number
  scoreBreakdown?: {
    rentabilidade?: number
    sofisticacao?: number
    diversificacao?: number
    consistencia?: number
    educativo?: number
  } | null
  updatedAt: string
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
