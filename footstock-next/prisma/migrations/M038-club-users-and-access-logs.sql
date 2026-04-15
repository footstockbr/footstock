-- M038: Portal do Clube — ClubUser (credenciais separadas) + ClubAccessLog
-- Rastreabilidade: US-025, TASK-015, MILESTONE-9

-- Tabela de representantes institucionais dos clubes (separada de users)
CREATE TABLE IF NOT EXISTS "club_users" (
  "id"            TEXT         NOT NULL PRIMARY KEY,
  "club_ticker"   TEXT         NOT NULL,
  "email"         TEXT         NOT NULL,
  "password_hash" TEXT         NOT NULL,
  "name"          TEXT         NOT NULL,
  "role"          VARCHAR(20)  NOT NULL DEFAULT 'VIEWER',
  "is_active"     BOOLEAN      NOT NULL DEFAULT true,
  "last_login_at" TIMESTAMPTZ,
  "created_by"    TEXT         NOT NULL,
  "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "club_users_club_ticker_fkey"
    FOREIGN KEY ("club_ticker") REFERENCES "assets"("ticker")
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT "club_users_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "club_users_email_key" ON "club_users" ("email");
CREATE INDEX IF NOT EXISTS "club_users_club_ticker_idx" ON "club_users" ("club_ticker");
CREATE INDEX IF NOT EXISTS "club_users_email_idx" ON "club_users" ("email");

-- Logs de acesso ao portal do clube (auditoria LGPD)
CREATE TABLE IF NOT EXISTS "club_access_logs" (
  "id"             TEXT         NOT NULL PRIMARY KEY,
  "club_user_id"   TEXT         NOT NULL,
  "action"         VARCHAR(50)  NOT NULL,
  "ip_address"     VARCHAR(45),
  "user_agent"     VARCHAR(500),
  "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "club_access_logs_club_user_id_fkey"
    FOREIGN KEY ("club_user_id") REFERENCES "club_users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "club_access_logs_club_user_id_idx" ON "club_access_logs" ("club_user_id");
CREATE INDEX IF NOT EXISTS "club_access_logs_created_at_idx" ON "club_access_logs" ("created_at");
