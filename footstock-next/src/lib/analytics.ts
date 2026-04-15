// ============================================================================
// Foot Stock — Analytics Wrapper (Mixpanel)
// Rastreabilidade: ANALYTICS-SPEC.md, T-029
// IMPORTANTE: Inicializar SOMENTE apos consentimento analytics (LGPD)
// TODO: DPA com Mixpanel necessario para LGPD — PENDING
// ============================================================================

import mixpanel from 'mixpanel-browser'

// === Tipos de dominio ===

export type UserPlan = 'JOGADOR' | 'CRAQUE' | 'LENDA'
export type InvestorProfile = 'INICIANTE' | 'INTERMEDIARIO' | 'AVANCADO' | 'FA_FUTEBOL'
export type OrderType = 'MARKET' | 'LIMIT' | 'SCHEDULED' | 'OCO' | 'SHORT'
export type MarketSession = 'PRE_MARKET' | 'TRADING' | 'CALL' | 'AFTER' | 'CLOSED'
export type NotificationType =
  | 'ORDER_EXECUTED' | 'ORDER_CANCELLED' | 'MARGIN_CALL_ALERT' | 'CIRCUIT_BREAKER'
  | 'NEWS_FAVORITE_CLUB' | 'PAYMENT_CONFIRMED' | 'PAYMENT_FAILED' | 'PLAN_CANCEL_ALERT'
  | 'DIVIDEND_CREDITED' | 'BONUS_CREDITED' | 'LEAGUE_RESULT' | 'ADMIN_BROADCAST'
export type UserType = 'NORMAL' | 'TIME_PARCEIRO' | 'INFLUENCIADOR'

// === Propriedades de identificacao (nao-PII) ===

export type UserProperties = {
  plan: UserPlan
  investorProfile: InvestorProfile
  userType: UserType
  affiliateCode: string | null
  referredByCode: string | null
  createdAt: string // ISO 8601
}

// === Mapa de 47 eventos e propriedades ===

export type AnalyticsEvents = {
  // Auth & Onboarding (EVT-001 a EVT-010)
  signup_started: { referrer?: string; device_type?: string }
  signup_step_completed: { step: 1 | 2 | 3 | 4; step_name: string }
  signup_completed: { age_verified: boolean; age_verification_method: string }
  age_verification_blocked: { verification_method: string; step: number }
  login_completed: { method: 'email_password' | 'webauthn'; plan: UserPlan }
  password_reset_requested: Record<string, never>
  plan_selected_onboarding: { plan_selected: UserPlan }
  investor_profile_selected: { profile: InvestorProfile }
  onboarding_tour_completed: { steps_completed: number; plan: UserPlan }
  onboarding_tour_skipped: { step_when_skipped: number; plan: UserPlan }

  // Trading & Orders (EVT-011 a EVT-014)
  order_form_opened: { asset_ticker: string; order_type: OrderType; side: 'BUY' | 'SELL'; plan: UserPlan }
  order_submitted: { asset_ticker: string; order_type: OrderType; side: 'BUY' | 'SELL'; plan: UserPlan; value_bracket: '0-500' | '500-1000' | '1000+' }
  order_executed: { asset_ticker: string; order_type: OrderType; side: 'BUY' | 'SELL'; plan: UserPlan; execution_delay_ms?: number; market_session: MarketSession }
  order_cancelled: { asset_ticker: string; order_type: OrderType; cancel_reason: 'USER_REQUEST' | 'OCO_TRIGGER' | 'HALT' | 'DOWNGRADE' }

  // Plan & Revenue (EVT-015 a EVT-024)
  upgrade_prompt_shown: { feature_blocked: string; current_plan: UserPlan; required_plan: 'CRAQUE' | 'LENDA' }
  market_list_viewed: { plan: UserPlan; filter_applied: boolean; filter_type?: string }
  asset_detail_viewed: { asset_ticker: string; asset_serie: 'A' | 'B'; plan: UserPlan }
  asset_comparison_used: { primary_ticker: string; comparison_count: 2 | 3 | 4; plan: UserPlan }
  plan_upgrade_clicked: { origin: string; current_plan: UserPlan }
  plan_selected: { plan_selected: 'CRAQUE' | 'LENDA'; billing_cycle: 'monthly'; current_plan: UserPlan }
  payment_gateway_selected: { gateway: 'MERCADO_PAGO' | 'PAGSEGURO' | 'PAYPAL'; plan: UserPlan }
  payment_completed: { plan: 'CRAQUE' | 'LENDA'; gateway: string; is_first_payment: boolean }
  payment_failed: { plan_attempted: 'CRAQUE' | 'LENDA'; gateway: string; error_code: string }
  subscription_cancelled: { plan: UserPlan; cancellation_reason: string; within_trial: boolean; had_open_shorts: boolean }

  // Leagues & Community (EVT-025 a EVT-027)
  league_viewed: { plan: UserPlan; has_active_league: boolean }
  league_created: { league_type: 'FRIENDS'; duration: 'week' | 'month' | 'season'; plan: UserPlan }
  league_joined: { league_type: 'PUBLIC' | 'FRIENDS' | 'PRO'; via_invite_link: boolean; plan: UserPlan }

  // Educational & Content (EVT-028 a EVT-032)
  ai_advisor_queried: { asset_ticker: string; plan: UserPlan; served_from_cache: boolean; response_ms: number }
  glossary_category_viewed: { category: string; plan: UserPlan }
  glossary_term_viewed: { term_id: string; category: string; accessed_via: 'glossary_screen' | 'info_icon'; plan: UserPlan }
  forum_post_created: { asset_ticker?: string; char_count: number; plan: UserPlan }
  forum_post_liked: { plan: UserPlan }

  // Notifications (EVT-033 a EVT-035)
  notification_received: { notification_type: NotificationType; channel: 'in-app' | 'email' | 'push'; plan: UserPlan }
  notification_clicked: { notification_type: NotificationType; time_to_click_seconds: number; plan: UserPlan }
  notification_dismissed: { notification_type: NotificationType; plan: UserPlan }

  // LGPD Compliance (EVT-036 a EVT-037)
  consent_granted: { purposes: string[] }
  data_export_requested: Record<string, never>

  // Affiliate Program (EVT-038 a EVT-043)
  affiliate_code_generated: { affiliateType: string; code: string; commissionPercentage: number }
  affiliate_link_clicked: { affiliateCode: string; affiliateType: string; source: string }
  affiliate_signup_completed: { affiliateCode: string; affiliateType: string; referredUserId: string }
  affiliate_conversion: { affiliateCode: string; affiliateType: string; plan: UserPlan; commissionAmount: string }
  affiliate_payout_initiated: { affiliateId: string; amount: string; payoutMethod: string }
  affiliate_config_updated: { affiliateType: string; fieldsUpdated: string[] }

  // Push Notifications (EVT-044 a EVT-047)
  push_permission_granted: { plan: UserPlan }
  push_permission_denied: { plan: UserPlan }
  push_notification_received: { notification_type: NotificationType; plan: UserPlan }
  push_notification_clicked: { notification_type: NotificationType; time_to_click_seconds?: number; plan: UserPlan }
}

// === Estado interno ===

let _initialized = false
let _enabled = false

const MIXPANEL_TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN ?? ''
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0'
const ENVIRONMENT = process.env.NODE_ENV === 'production'
  ? 'production'
  : process.env.NODE_ENV === 'test'
    ? 'test'
    : 'development'

// === Analytics wrapper ===

export const analytics = {
  /**
   * Inicializa Mixpanel. Chamar SOMENTE apos consentimento analytics confirmado.
   * SSR guard incluso — nao faz nada no server.
   */
  init() {
    if (typeof window === 'undefined') return
    if (_initialized) return
    if (!MIXPANEL_TOKEN) {
      if (ENVIRONMENT === 'development') {
        console.warn('[Analytics] NEXT_PUBLIC_MIXPANEL_TOKEN nao definido — tracking desabilitado')
      }
      return
    }
    // Nao inicializar em testes automatizados
    if (ENVIRONMENT === 'test') return

    mixpanel.init(MIXPANEL_TOKEN, {
      debug: ENVIRONMENT === 'development',
      track_pageview: false, // page views controlados manualmente
      persistence: 'localStorage',
      ignore_dnt: false,
    })

    _initialized = true
    _enabled = true
  },

  /**
   * Identifica usuario apos login. Chama mixpanel.identify + people.set + register super properties.
   * NÃO envia PII (email, nome, CPF, telefone).
   */
  identify(userId: string, properties: UserProperties) {
    if (!_enabled || !_initialized) return

    mixpanel.identify(userId)
    mixpanel.people.set({
      plan: properties.plan,
      investorProfile: properties.investorProfile,
      userType: properties.userType,
      affiliateCode: properties.affiliateCode,
      referredByCode: properties.referredByCode,
      createdAt: properties.createdAt,
    })
    mixpanel.register({
      plan: properties.plan,
      userType: properties.userType,
      affiliateCode: properties.affiliateCode,
      referredByCode: properties.referredByCode,
      app_version: APP_VERSION,
      environment: ENVIRONMENT,
    })
  },

  /**
   * Rastreia evento tipado. Propriedades validadas em compile-time via AnalyticsEvents.
   */
  track<E extends keyof AnalyticsEvents>(event: E, properties: AnalyticsEvents[E]) {
    if (!_enabled || !_initialized) return

    mixpanel.track(event, properties as Record<string, unknown>)
  },

  /**
   * Rastreia page view.
   */
  page(pageName: string, properties?: Record<string, unknown>) {
    if (!_enabled || !_initialized) return

    mixpanel.track('page_viewed', {
      page_name: pageName,
      ...properties,
    })
  },

  /**
   * Reset ao logout — limpa identidade e super properties.
   */
  reset() {
    if (!_initialized) return

    mixpanel.reset()
  },

  /**
   * Verifica se analytics esta habilitado (consentimento + inicializacao).
   */
  isEnabled(): boolean {
    return _enabled && _initialized
  },

  /**
   * Desabilita tracking (usuario revogou consentimento analytics).
   */
  disable() {
    if (!_initialized) return

    mixpanel.opt_out_tracking()
    _enabled = false
  },

  /**
   * Atualiza super properties (ex: apos upgrade de plano).
   */
  updateSuperProperties(properties: Partial<UserProperties>) {
    if (!_enabled || !_initialized) return

    mixpanel.register(properties as Record<string, unknown>)
    mixpanel.people.set(properties as Record<string, unknown>)
  },
}
