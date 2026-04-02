import type { PlanType } from '@/lib/enums';

type PlanProfileSummary = {
  initialBalanceLabel: string;
  quoteDelayLabel: string;
  dailyOrderLimitLabel: string;
  orderTypesLabel: string;
  aiAdvisorLabel: string;
  leaguesLabel: string;
  technicalIndicatorsLabel: string;
  comparisonModeLabel: string;
  shortAndLeverageLabel: string;
};

export const PLAN_PROFILE_SUMMARY: Record<PlanType, PlanProfileSummary> = {
  JOGADOR: {
    initialBalanceLabel: 'FS$ 2.000',
    quoteDelayLabel: 'Atraso de 1 hora',
    dailyOrderLimitLabel: '2 ordens por dia',
    orderTypesLabel: 'Apenas MARKET',
    aiAdvisorLabel: 'Bloqueado',
    leaguesLabel: 'Somente ligas públicas',
    technicalIndicatorsLabel: 'Bandas de Bollinger (MM9/MM21 bloqueados)',
    comparisonModeLabel: 'Bloqueado',
    shortAndLeverageLabel: 'Short, OCO e alavancagem 2x bloqueados',
  },
  CRAQUE: {
    initialBalanceLabel: 'FS$ 5.000',
    quoteDelayLabel: 'Atraso de 30 minutos',
    dailyOrderLimitLabel: '5 ordens por dia',
    orderTypesLabel: 'MARKET, LIMIT e SCHEDULED',
    aiAdvisorLabel: 'Assessor IA básico',
    leaguesLabel: 'Ligas privadas de amigos',
    technicalIndicatorsLabel: 'Bandas de Bollinger (MM9/MM21 bloqueados)',
    comparisonModeLabel: 'Liberado',
    shortAndLeverageLabel: 'Short, OCO e alavancagem 2x bloqueados',
  },
  LENDA: {
    initialBalanceLabel: 'FS$ 25.000',
    quoteDelayLabel: 'Tempo real',
    dailyOrderLimitLabel: 'Ordens ilimitadas',
    orderTypesLabel: 'MARKET, LIMIT, SCHEDULED e OCO',
    aiAdvisorLabel: 'Assessor IA VIP com busca web',
    leaguesLabel: 'Ligas PRO e todas as demais',
    technicalIndicatorsLabel: 'Bandas de Bollinger + MM9 + MM21',
    comparisonModeLabel: 'Liberado',
    shortAndLeverageLabel: 'Short, OCO e alavancagem 2x liberados',
  },
} as const;
