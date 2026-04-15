// ============================================================================
// Foot Stock — MixpanelServerService (server-side)
// Eventos sensiveis: orders, payments, compliance, affiliate, notifications
// Rastreabilidade: ANALYTICS-SPEC.md, T-029
// IMPORTANTE: Nunca duplicar eventos client/server
// TODO: DPA com Mixpanel necessario para LGPD — PENDING
// ============================================================================

import 'server-only'

import Mixpanel from 'mixpanel'

import type {
  AnalyticsEvents,
  UserPlan,
  OrderType,
  MarketSession,
  NotificationType,
} from '@/lib/analytics'

// === Inicializacao do SDK server-side ===

const MIXPANEL_TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN ?? ''

let _client: Mixpanel.Mixpanel | null = null

function getClient(): Mixpanel.Mixpanel | null {
  if (!MIXPANEL_TOKEN) return null
  if (process.env.NODE_ENV === 'test') return null

  if (!_client) {
    _client = Mixpanel.init(MIXPANEL_TOKEN, {
      protocol: 'https',
    })
  }

  return _client
}

// === Tipo para eventos server-side ===

type ServerSideEvents = Pick<
  AnalyticsEvents,
  // Auth
  | 'signup_completed'
  | 'age_verification_blocked'
  // Trading (North Star)
  | 'order_executed'
  | 'order_cancelled'
  // Revenue
  | 'payment_completed'
  | 'payment_failed'
  | 'subscription_cancelled'
  // Community
  | 'league_created'
  | 'league_joined'
  | 'ai_advisor_queried'
  | 'forum_post_created'
  // Notifications
  | 'notification_received'
  // Affiliate
  | 'affiliate_code_generated'
  | 'affiliate_signup_completed'
  | 'affiliate_conversion'
  | 'affiliate_payout_initiated'
  | 'affiliate_config_updated'
>

// === Service ===

class MixpanelServerService {
  /**
   * Rastreia evento server-side associado a um userId.
   * Verifica consentimento analytics antes de enviar.
   */
  track<E extends keyof ServerSideEvents>(
    userId: string,
    event: E,
    properties: ServerSideEvents[E]
  ): void {
    const client = getClient()
    if (!client) return

    try {
      client.track(event, {
        distinct_id: userId,
        ...properties as Record<string, unknown>,
      })
    } catch {
      // Falha silenciosa — analytics nunca deve quebrar o backend
    }
  }

  /**
   * Verifica consentimento analytics do usuario antes de rastrear.
   * Usar em route handlers que tem acesso ao prisma.
   */
  async trackWithConsentCheck<E extends keyof ServerSideEvents>(
    userId: string,
    event: E,
    properties: ServerSideEvents[E],
    hasAnalyticsConsent: boolean
  ): Promise<void> {
    if (!hasAnalyticsConsent) return

    this.track(userId, event, properties)
  }

  // === Helpers tipados para eventos frequentes ===

  trackOrderExecuted(
    userId: string,
    props: {
      asset_ticker: string
      order_type: OrderType
      side: 'BUY' | 'SELL'
      plan: UserPlan
      execution_delay_ms?: number
      market_session: MarketSession
    }
  ) {
    this.track(userId, 'order_executed', props)
  }

  trackOrderCancelled(
    userId: string,
    props: {
      asset_ticker: string
      order_type: OrderType
      cancel_reason: 'USER_REQUEST' | 'OCO_TRIGGER' | 'HALT' | 'DOWNGRADE'
    }
  ) {
    this.track(userId, 'order_cancelled', props)
  }

  trackPaymentCompleted(
    userId: string,
    props: {
      plan: 'CRAQUE' | 'LENDA'
      gateway: string
      is_first_payment: boolean
    }
  ) {
    this.track(userId, 'payment_completed', props)
  }

  trackPaymentFailed(
    userId: string,
    props: {
      plan_attempted: 'CRAQUE' | 'LENDA'
      gateway: string
      error_code: string
    }
  ) {
    this.track(userId, 'payment_failed', props)
  }

  trackNotificationReceived(
    userId: string,
    props: {
      notification_type: NotificationType
      channel: 'in-app' | 'email' | 'push'
      plan: UserPlan
    }
  ) {
    this.track(userId, 'notification_received', props)
  }

  trackSignupCompleted(
    userId: string,
    props: {
      age_verified: boolean
      age_verification_method: string
    }
  ) {
    this.track(userId, 'signup_completed', props)
  }

  trackLeagueCreated(
    userId: string,
    props: {
      league_type: 'FRIENDS'
      duration: 'week' | 'month' | 'season'
      plan: UserPlan
    }
  ) {
    this.track(userId, 'league_created', props)
  }

  trackLeagueJoined(
    userId: string,
    props: {
      league_type: 'PUBLIC' | 'FRIENDS' | 'PRO'
      via_invite_link: boolean
      plan: UserPlan
    }
  ) {
    this.track(userId, 'league_joined', props)
  }

  trackForumPostCreated(
    userId: string,
    props: {
      asset_ticker?: string
      char_count: number
      plan: UserPlan
    }
  ) {
    this.track(userId, 'forum_post_created', props)
  }

  trackAIAdvisorQueried(
    userId: string,
    props: {
      asset_ticker: string
      plan: UserPlan
      served_from_cache: boolean
      response_ms: number
    }
  ) {
    this.track(userId, 'ai_advisor_queried', props)
  }

  trackSubscriptionCancelled(
    userId: string,
    props: {
      plan: UserPlan
      cancellation_reason: string
      within_trial: boolean
      had_open_shorts: boolean
    }
  ) {
    this.track(userId, 'subscription_cancelled', props)
  }

  trackAffiliateSignupCompleted(
    userId: string,
    props: {
      affiliateCode: string
      affiliateType: string
      referredUserId: string
    }
  ) {
    this.track(userId, 'affiliate_signup_completed', props)
  }

  trackAffiliateConversion(
    userId: string,
    props: {
      affiliateCode: string
      affiliateType: string
      plan: UserPlan
      commissionAmount: string
    }
  ) {
    this.track(userId, 'affiliate_conversion', props)
  }

  trackAffiliateCodeGenerated(
    userId: string,
    props: {
      affiliateType: string
      code: string
      commissionPercentage: number
    }
  ) {
    this.track(userId, 'affiliate_code_generated', props)
  }

  trackAffiliatePayoutInitiated(
    userId: string,
    props: {
      affiliateId: string
      amount: string
      payoutMethod: string
    }
  ) {
    this.track(userId, 'affiliate_payout_initiated', props)
  }
}

export const mixpanelServer = new MixpanelServerService()
