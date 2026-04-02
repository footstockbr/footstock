-- M039_drop_legacy_subscription_columns
-- Remove colunas legadas da tabela subscriptions que foram substituídas em M034.
-- current_period_start → starts_at
-- current_period_end   → expires_at
-- cancel_at_period_end → não usado no schema atual
-- gateway_id           → substituído por gateway (enum SubscriptionGateway)

ALTER TABLE "subscriptions"
  DROP COLUMN IF EXISTS "current_period_start",
  DROP COLUMN IF EXISTS "current_period_end",
  DROP COLUMN IF EXISTS "cancel_at_period_end",
  DROP COLUMN IF EXISTS "gateway_id";
