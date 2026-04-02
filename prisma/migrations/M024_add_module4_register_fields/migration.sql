-- module-4 auditoria TASK-6: 3 novos campos na tabela users
-- Fonte: TASK-6/ST001 (referredByCode), ST002 (favoriteClubDisplayName), ST004 (userType)

-- ─── referred_by_code ──────────────────────────────────────────────────────
ALTER TABLE "users"
  ADD COLUMN "referred_by_code" TEXT;

-- ─── favorite_club_display_name ────────────────────────────────────────────
ALTER TABLE "users"
  ADD COLUMN "favorite_club_display_name" TEXT;

-- ─── user_type ─────────────────────────────────────────────────────────────
ALTER TABLE "users"
  ADD COLUMN "user_type" TEXT NOT NULL DEFAULT 'NORMAL';

-- ─── index para busca por referral code ────────────────────────────────────
CREATE INDEX "users_referred_by_code_idx"
  ON "users"("referred_by_code")
  WHERE "referred_by_code" IS NOT NULL;
