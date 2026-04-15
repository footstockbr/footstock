/**
 * T-013 — Definição dos passos do onboarding tour adaptativo.
 *
 * Tours:
 *   BÁSICO  (INICIANTE / FA)           — 6 passos
 *   AVANÇADO (INTERMEDIARIO / AVANCADO) — 3 passos
 *
 * targetId: valor do atributo data-tour no elemento alvo.
 * placement: posição preferida do tooltip (ajustada pelo tourPositioning.ts se não couber).
 */

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right'

export interface TourStepDef {
  /** data-tour do elemento que será destacado. null = tooltip centralizado */
  targetId: string | null
  title: string
  description: string
  placement: TourPlacement
}

// ── Tour Básico — INICIANTE / FA ─────────────────────────────────────────────
export const TOUR_STEPS_BASIC: TourStepDef[] = [
  {
    targetId: 'market-list',
    title: 'Mercado de Ativos',
    description:
      'Este é o mercado. Aqui você vê os preços em tempo real dos clubes disponíveis.',
    placement: 'right',
  },
  {
    targetId: 'portfolio-tab',
    title: 'Portfolio',
    description:
      'Aqui fica sua carteira. Suas ações e saldo FS$ aparecem aqui.',
    placement: 'top',
  },
  {
    targetId: 'order-form',
    title: 'Ordens Básicas',
    description:
      'Para comprar ou vender, clique em um clube e use o formulário de ordem. Comece com uma ordem a mercado.',
    placement: 'left',
  },
  {
    targetId: 'notification-bell',
    title: 'Notificações',
    description:
      'O sino aqui te avisa sobre suas ordens, dividendos e novidades dos seus clubes.',
    placement: 'bottom',
  },
  {
    targetId: 'leagues-tab',
    title: 'Ligas',
    description:
      'Compete com outros torcedores nas Ligas. Sua pontuação é baseada em 5 pilares.',
    placement: 'top',
  },
  {
    targetId: 'glossary-link',
    title: 'Glossário',
    description:
      'Não sabe um termo? Acesse o glossário a qualquer momento pelo menu lateral ou pelo "Mais".',
    placement: 'right',
  },
]

// ── Tour Avançado — INTERMEDIARIO / AVANCADO ─────────────────────────────────
export const TOUR_STEPS_ADVANCED: TourStepDef[] = [
  {
    targetId: 'chart-area',
    title: 'Gráficos e Indicadores',
    description:
      'Seu plano dá acesso a gráficos avançados. Bollinger e OFI estão disponíveis para todos.',
    placement: 'bottom',
  },
  {
    targetId: 'order-type-selector',
    title: 'Tipos de Ordem',
    description:
      'Além de ordens a mercado, você pode usar LIMIT, STOP-LIMIT e OCO.',
    placement: 'right',
  },
  {
    targetId: 'ofi-chart',
    title: 'Análise de Sentimento',
    description:
      'O OFI mostra o fluxo de ordens em tempo real. Use para identificar pressão compradora ou vendedora.',
    placement: 'top',
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Perfis que recebem o tour básico (6 passos).
 * INICIANTE e FA (Fã de futebol) — tratados de forma equivalente.
 */
const BASIC_PROFILES = new Set(['INICIANTE', 'FA'])

/**
 * Retorna os passos do tour conforme o investorProfile do usuário.
 */
export function getTourSteps(investorProfile: string): TourStepDef[] {
  return BASIC_PROFILES.has(investorProfile)
    ? TOUR_STEPS_BASIC
    : TOUR_STEPS_ADVANCED
}
