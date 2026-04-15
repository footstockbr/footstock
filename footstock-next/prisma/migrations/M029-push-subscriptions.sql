-- M029: Cria tabela push_subscriptions para Web Push Notifications (VAPID)
--       EP045/EP046 — US-039

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id"         TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "user_id"    TEXT         NOT NULL,
  "endpoint"   TEXT         NOT NULL,
  "p256dh"     TEXT         NOT NULL,
  "auth"       TEXT         NOT NULL,
  "user_agent" TEXT,
  "active"     BOOLEAN      NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint"),
  CONSTRAINT "push_subscriptions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_active_idx"
  ON "push_subscriptions" ("user_id", "active");

-- Trigger para updated_at automatico
CREATE OR REPLACE FUNCTION update_push_subscriptions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_push_subscriptions_updated_at ON "push_subscriptions";
CREATE TRIGGER set_push_subscriptions_updated_at
  BEFORE UPDATE ON "push_subscriptions"
  FOR EACH ROW EXECUTE FUNCTION update_push_subscriptions_updated_at();
