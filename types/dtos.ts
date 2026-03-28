// ============================================================================
// Foot Stock — Data Transfer Objects (DTOs)
// ============================================================================

import type {
  OrderType,
  OrderSide,
  InvestorProfile,
  PlanType,
  Sentiment,
} from '@/lib/enums';

// ---------------------------------------------------------------------------
// ST003: DTOs de entrada (client → server)
// ---------------------------------------------------------------------------

/** DTO de login com e-mail e senha */
export interface LoginDTO {
  email: string;
  password: string;
}

/** DTO de registro com dados pessoais e consentimentos */
export interface RegisterDTO {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  cpf: string;
  phone: string;
  birthDate: string;
  favoriteClub?: string;
  consents: {
    terms: true;
    privacy: true;
    marketing: boolean;
  };
}

/** DTO de solicitação de recuperação de senha */
export interface ForgotPasswordDTO {
  email: string;
}

/** DTO de redefinição de senha com token */
export interface ResetPasswordDTO {
  token: string;
  password: string;
  confirmPassword: string;
}

/** DTO de atualização de perfil */
export interface UpdateProfileDTO {
  name?: string;
  phone?: string | null;
  favoriteClub?: string | null;
  investorProfile?: InvestorProfile;
}

/** DTO de atualização de consentimento LGPD */
export interface UpdateConsentDTO {
  type: 'TERMS' | 'PRIVACY' | 'MARKETING' | 'COOKIES';
  accepted: boolean;
}

/** DTO de criação de ordem */
export interface CreateOrderDTO {
  ticker: string;
  type: OrderType;
  side: OrderSide;
  quantity: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  scheduledAt?: string;
}

/** DTO de checkout de assinatura */
export interface CheckoutDTO {
  planType: Exclude<PlanType, 'JOGADOR'>;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  couponCode?: string;
}

/** DTO de criação de liga */
export interface CreateLeagueDTO {
  name: string;
  description: string;
  type: 'PUBLICA' | 'AMIGOS' | 'PRO';
  maxMembers: number;
  entryFee: number;
  startDate: string;
  endDate: string;
}

/** Resultado de análise de IA para um ativo */
export interface AIAnalysis {
  ticker: string;
  summary: string;
  sentiment: Sentiment;
  recommendation: 'COMPRAR' | 'MANTER' | 'VENDER';
  targetPrice: number;
  confidence: number;
  factors: Array<{
    category: string;
    description: string;
    impact: 'POSITIVO' | 'NEUTRO' | 'NEGATIVO';
  }>;
  generatedAt: string;
}

/** Dados consolidados do painel administrativo */
export interface AdminDashboardDTO {
  totalUsers: number;
  activeUsers24h: number;
  totalOrders24h: number;
  totalVolume24h: number;
  revenue30d: number;
  subscriptionsByPlan: Record<PlanType, number>;
  topAssetsByVolume: Array<{
    ticker: string;
    name: string;
    volume: number;
  }>;
  systemHealth: {
    matchingEngineLatency: number;
    apiUptime: number;
    errorRate: number;
  };
}
