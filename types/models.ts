// ============================================================================
// Foot Stock — Domain Models & Interfaces
// ============================================================================

import type {
  PlanType,
  OrderType,
  OrderSide,
  OrderStatus,
  AdminRole,
  SessionType,
  InvestorProfile,
  LeagueType,
  NotificationType,
  ImpactCategory,
  Sentiment,
  Division,
  PaymentStatus,
} from '@/lib/enums';

// ---------------------------------------------------------------------------
// ST001: 16+ domain interfaces
// ---------------------------------------------------------------------------

/** Usuário completo da plataforma */
export interface User {
  id: string;
  email: string;
  cpfHash: string;
  name: string;
  phone: string | null;
  birthDate: string;
  favoriteClub: string | null;
  investorProfile: InvestorProfile;
  planType: PlanType;
  fsBalance: number;
  marginBlocked: number;
  tourCompleted: boolean;
  ageVerificationPending: boolean;
  adminRole: AdminRole | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Dados públicos do usuário (sem campos sensíveis) */
export type UserPublic = Omit<User, 'cpfHash' | 'fsBalance' | 'marginBlocked'>;

/** Perfil editável do usuário */
export type UserProfile = Pick<
  User,
  'id' | 'name' | 'email' | 'favoriteClub' | 'investorProfile' | 'planType' | 'tourCompleted'
>;

/** Exportação segura para LGPD (sem CPF hash nem role admin) */
export type UserSafeExport = Omit<User, 'cpfHash' | 'adminRole'>;

/** Cores do ativo (escudo/marca do clube) */
export interface AssetColors {
  primary: string;
  secondary: string;
}

/** Indicadores financeiros do ativo */
export interface AssetFinancials {
  revenue: number;
  roster: number;
  brand: number;
  fairValue: number;
}

/** Ativo negociável na plataforma (clube de futebol) */
export interface Asset {
  id: string;
  ticker: string;
  name: string;
  division: Division;
  currentPrice: number;
  fairValue: number;
  currentSupply: number;
  totalShares: number;
  isHalted: boolean;
  haltReason: string | null;
  colors: AssetColors;
  financials: AssetFinancials;
  sentiment: Sentiment;
  change24h: number;
  volume24h: number;
  createdAt: string;
  updatedAt: string;
}

/** Resumo compacto do ativo para listagens */
export type AssetSummary = Pick<
  Asset,
  | 'id'
  | 'ticker'
  | 'name'
  | 'division'
  | 'currentPrice'
  | 'change24h'
  | 'volume24h'
  | 'isHalted'
  | 'colors'
  | 'sentiment'
>;

/** Ordem de compra ou venda */
export interface Order {
  id: string;
  userId: string;
  ticker: string;
  type: OrderType;
  side: OrderSide;
  status: OrderStatus;
  quantity: number;
  price: number | null;
  executedPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  scheduledAt: string | null;
  expiresAt: string | null;
  fee: number;
  totalValue: number;
  createdAt: string;
  updatedAt: string;
}

/** Posição do usuário em um ativo */
export interface Position {
  id: string;
  userId: string;
  ticker: string;
  quantity: number;
  averagePrice: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  createdAt: string;
  updatedAt: string;
}

/** Tipos de transação financeira no extrato */
export type TransactionType =
  | 'COMPRA'
  | 'VENDA'
  | 'TAXA'
  | 'DIVIDENDO'
  | 'BONUS'
  | 'DEPOSITO'
  | 'RETIRADA'
  | 'AJUSTE';

/** Transação financeira no extrato do usuário */
export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  description: string;
  referenceId: string | null;
  createdAt: string;
}

/** Histórico de preço de um ativo */
export interface PriceHistory {
  id: string;
  ticker: string;
  price: number;
  volume: number;
  timestamp: string;
}

/** Assinatura de plano do usuário */
export interface Subscription {
  id: string;
  userId: string;
  planType: PlanType;
  status: 'ACTIVE' | 'CANCELLED' | 'PAST_DUE' | 'TRIAL';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  gatewaySubscriptionId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Pagamento processado pelo gateway */
export interface Payment {
  id: string;
  userId: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  gatewayPaymentId: string | null;
  gatewayResponse: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Notícia que impacta preços dos ativos */
export interface News {
  id: string;
  title: string;
  summary: string;
  content: string;
  sourceUrl: string | null;
  ticker: string | null;
  impactCategory: ImpactCategory;
  sentiment: Sentiment;
  impactPercent: number;
  publishedAt: string;
  createdAt: string;
}

/** Liga de competição entre usuários */
export interface League {
  id: string;
  name: string;
  description: string;
  type: LeagueType;
  creatorId: string;
  maxMembers: number;
  entryFee: number;
  prizePool: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Membro participante de uma liga */
export interface LeagueMember {
  id: string;
  leagueId: string;
  userId: string;
  portfolioValue: number;
  rank: number;
  pnl: number;
  pnlPercent: number;
  joinedAt: string;
  updatedAt: string;
}

/** Post no fórum da comunidade */
export interface ForumPost {
  id: string;
  authorId: string;
  title: string;
  content: string;
  ticker: string | null;
  parentId: string | null;
  likesCount: number;
  repliesCount: number;
  isModerated: boolean;
  moderatedBy: string | null;
  moderatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Notificação enviada ao usuário */
export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

/** Consentimento LGPD/GDPR do usuário */
export interface Consent {
  id: string;
  userId: string;
  type: 'TERMS' | 'PRIVACY' | 'MARKETING' | 'COOKIES';
  accepted: boolean;
  ipAddress: string;
  userAgent: string;
  acceptedAt: string;
  revokedAt: string | null;
  version: string;
}

/** Patrocinador de ativo (clube) */
export interface Sponsor {
  id: string;
  ticker: string;
  name: string;
  logoUrl: string;
  tier: 'MASTER' | 'PREMIUM' | 'STANDARD';
  contractValue: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
}

/** Estado atual do mercado/pregão */
export interface MarketState {
  session: SessionType;
  isOpen: boolean;
  nextSessionAt: string;
  message: string | null;
  updatedAt: string;
}

/** Tick de mercado em tempo real */
export interface MarketTick {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: string;
}
