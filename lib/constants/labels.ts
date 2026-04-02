// ============================================================================
// Foot Stock — Labels para UI (PT-BR)
// ============================================================================

import type {
  PlanType,
  OrderType,
  OrderSide,
  OrderStatus,
  SessionType,
  InvestorProfile,
} from '../enums';

/** Labels dos planos de assinatura */
export const PLAN_LABELS: Record<PlanType, string> = {
  JOGADOR: 'Jogador',
  CRAQUE: 'Craque',
  LENDA: 'Lenda',
} as const;

/** Labels dos tipos de ordem */
export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  MARKET: 'Mercado',
  LIMIT: 'Limite',
  OCO: 'OCO',
  SHORT: 'Short',
  SCHEDULED: 'Programada',
} as const;

/** Labels do lado da ordem */
export const ORDER_SIDE_LABELS: Record<OrderSide, string> = {
  BUY: 'Compra',
  SELL: 'Venda',
} as const;

/** Labels do status da ordem */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  OPEN: 'Aberta',
  FILLED: 'Executada',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Expirada',
  PARTIAL: 'Parcialmente Executada',
} as const;

/** Labels das sessões de pregão */
export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  PRE_ABERTURA: 'Pré-Abertura',
  NEGOCIACAO: 'Negociação',
  CALL: 'Call de Fechamento',
  AFTER_MARKET: 'After-Market',
  FECHADO: 'Fechado',
} as const;

/** Labels do perfil de investidor */
export const INVESTOR_PROFILE_LABELS: Record<InvestorProfile, string> = {
  INICIANTE: 'Iniciante',
  INTERMEDIARIO: 'Intermediário',
  AVANCADO: 'Avançado',
  FA: 'Analista Fundamentalista',
} as const;

/** Labels dos roles administrativos */
export const ADMIN_ROLE_LABELS = {
  SUPER_ADMIN: 'SuperAdmin',
  ADMINISTRADOR: 'Administrador',
  MONITOR: 'Monitor',
  EDITOR: 'Editor',
  MODERADOR: 'Moderador',
} as const;

/** Labels de navegação principal */
export const NAV_LABELS = {
  HOME: 'Início',
  DASHBOARD: 'Painel',
  MERCADO: 'Mercado',
  PORTFOLIO: 'Portfólio',
  ORDENS: 'Ordens',
  LIGAS: 'Ligas',
  NOTICIAS: 'Notícias',
  FORUM: 'Fórum',
  PERFIL: 'Perfil',
  CONFIGURACOES: 'Configurações',
  ASSINATURA: 'Assinatura',
  NOTIFICACOES: 'Notificações',
  ADMIN: 'Admin',
  RANKING: 'Ranking',
  HISTORICO: 'Histórico',
  SAIR: 'Sair',
} as const;
