-- M045_add_rls_remaining_tables
-- Habilita RLS nas 25 tabelas públicas restantes (rls_disabled_in_public)
-- Contexto: M019 cobriu 6 tabelas core. Esta migration fecha o gap apontado
-- pelo alerta de segurança do Supabase em 07 Abr 2026.
--
-- Estratégia por categoria:
--   A) Dados do usuário (user_id FK)     → owner-only via auth.uid()
--   B) Dados de mercado / públicos       → SELECT aberto, write via service role
--   C) Tabelas admin / sistema           → sem acesso de client (service role only)
--
-- NOTA: Prisma usa service role key no backend — bypassa RLS automaticamente.
-- Estas policies protegem acesso direto via anon/authenticated key no client.

-- ─────────────────────────────────────────────────────────────────────────────
-- A) DADOS DO USUÁRIO — owner-only
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "subscriptions"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "league_members"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "forum_posts"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_access_logs"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_export_jobs"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "global_forum_posts"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "forum_likes"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dividends"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "affiliate_codes"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "affiliate_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "glossary_interactions" ENABLE ROW LEVEL SECURITY;

-- subscriptions: usuário vê apenas a própria
CREATE POLICY "subscriptions_owner_access" ON "subscriptions"
  FOR ALL USING (user_id = auth.uid()::text);

-- payments: usuário vê apenas os próprios pagamentos
CREATE POLICY "payments_owner_access" ON "payments"
  FOR ALL USING (user_id = auth.uid()::text);

-- league_members: usuário vê apenas suas próprias participações
CREATE POLICY "league_members_owner_access" ON "league_members"
  FOR ALL USING (user_id = auth.uid()::text);

-- forum_posts: usuário lê todos (fórum público), gerencia apenas os seus
CREATE POLICY "forum_posts_read_all" ON "forum_posts"
  FOR SELECT USING (true);

CREATE POLICY "forum_posts_owner_write" ON "forum_posts"
  FOR ALL USING (user_id = auth.uid()::text);

-- data_access_logs: LGPD — usuário vê apenas os seus registros de acesso
CREATE POLICY "data_access_logs_owner_access" ON "data_access_logs"
  FOR ALL USING (user_id = auth.uid()::text);

-- data_export_jobs: usuário vê apenas seus jobs de exportação (LGPD)
CREATE POLICY "data_export_jobs_owner_access" ON "data_export_jobs"
  FOR ALL USING (user_id = auth.uid()::text);

-- global_forum_posts: leitura pública, escrita apenas do próprio
CREATE POLICY "global_forum_posts_read_all" ON "global_forum_posts"
  FOR SELECT USING (true);

CREATE POLICY "global_forum_posts_owner_write" ON "global_forum_posts"
  FOR ALL USING (user_id = auth.uid()::text);

-- forum_likes: leitura pública, gerenciamento apenas do próprio
CREATE POLICY "forum_likes_read_all" ON "forum_likes"
  FOR SELECT USING (true);

CREATE POLICY "forum_likes_owner_write" ON "forum_likes"
  FOR ALL USING (user_id = auth.uid()::text);

-- dividends: usuário vê apenas os seus dividendos
CREATE POLICY "dividends_owner_access" ON "dividends"
  FOR ALL USING (user_id = auth.uid()::text);

-- affiliate_codes: usuário vê apenas o seu código de afiliado
CREATE POLICY "affiliate_codes_owner_access" ON "affiliate_codes"
  FOR ALL USING (user_id = auth.uid()::text);

-- affiliate_transactions: usuário vê transações onde é o referred
CREATE POLICY "affiliate_transactions_referred_access" ON "affiliate_transactions"
  FOR SELECT USING (referred_user_id = auth.uid()::text);

-- glossary_interactions: usuário vê apenas suas interações
CREATE POLICY "glossary_interactions_owner_access" ON "glossary_interactions"
  FOR ALL USING (user_id = auth.uid()::text);

-- ─────────────────────────────────────────────────────────────────────────────
-- B) DADOS DE MERCADO / PÚBLICOS — SELECT aberto, writes via service role
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "assets"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "price_history"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "news"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sponsors"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ad_sponsors"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "nsm_daily_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leagues"          ENABLE ROW LEVEL SECURITY;

-- assets: dados dos ativos (clubes) — leitura pública
CREATE POLICY "assets_read_all" ON "assets"
  FOR SELECT USING (true);

-- price_history: histórico de preços — leitura pública
CREATE POLICY "price_history_read_all" ON "price_history"
  FOR SELECT USING (true);

-- news: notícias — leitura pública
CREATE POLICY "news_read_all" ON "news"
  FOR SELECT USING (true);

-- sponsors: patrocinadores — leitura pública
CREATE POLICY "sponsors_read_all" ON "sponsors"
  FOR SELECT USING (true);

-- ad_sponsors: anúncios — leitura pública
CREATE POLICY "ad_sponsors_read_all" ON "ad_sponsors"
  FOR SELECT USING (true);

-- nsm_daily_records: dados diários do mercado — leitura pública
CREATE POLICY "nsm_daily_records_read_all" ON "nsm_daily_records"
  FOR SELECT USING (true);

-- leagues: leitura pública para ligas; owner gerencia a sua
CREATE POLICY "leagues_read_all" ON "leagues"
  FOR SELECT USING (true);

CREATE POLICY "leagues_owner_write" ON "leagues"
  FOR ALL USING (created_by = auth.uid()::text);

-- ─────────────────────────────────────────────────────────────────────────────
-- C) TABELAS ADMIN / SISTEMA — sem acesso direto de client
--    (service role bypassa RLS; nenhuma policy = nenhum acesso via anon/auth key)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "admin_market_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "blocked_words"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "moderation_rules"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "incident_logs"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_audit_logs"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dunning_attempts"     ENABLE ROW LEVEL SECURITY;

-- Sem políticas = deny-all para anon e authenticated.
-- Acesso exclusivo via service role key (backend/Prisma).

-- ─────────────────────────────────────────────────────────────────────────────
-- down:
-- ALTER TABLE "dunning_attempts"     DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "webhook_audit_logs"   DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "incident_logs"        DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "moderation_rules"     DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "blocked_words"        DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "admin_market_actions" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "leagues"              DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "nsm_daily_records"    DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "ad_sponsors"          DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "sponsors"             DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "news"                 DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "price_history"        DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "assets"               DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "glossary_interactions" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "affiliate_transactions" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "affiliate_codes"      DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "dividends"            DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "forum_likes"          DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "global_forum_posts"   DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "data_export_jobs"     DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "data_access_logs"     DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "forum_posts"          DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "league_members"       DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "payments"             DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "subscriptions"        DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "leagues_owner_write"                   ON "leagues";
-- DROP POLICY IF EXISTS "leagues_read_all"                      ON "leagues";
-- DROP POLICY IF EXISTS "nsm_daily_records_read_all"            ON "nsm_daily_records";
-- DROP POLICY IF EXISTS "ad_sponsors_read_all"                  ON "ad_sponsors";
-- DROP POLICY IF EXISTS "sponsors_read_all"                     ON "sponsors";
-- DROP POLICY IF EXISTS "news_read_all"                         ON "news";
-- DROP POLICY IF EXISTS "price_history_read_all"                ON "price_history";
-- DROP POLICY IF EXISTS "assets_read_all"                       ON "assets";
-- DROP POLICY IF EXISTS "glossary_interactions_owner_access"    ON "glossary_interactions";
-- DROP POLICY IF EXISTS "affiliate_transactions_referred_access" ON "affiliate_transactions";
-- DROP POLICY IF EXISTS "affiliate_codes_owner_access"          ON "affiliate_codes";
-- DROP POLICY IF EXISTS "dividends_owner_access"                ON "dividends";
-- DROP POLICY IF EXISTS "forum_likes_owner_write"               ON "forum_likes";
-- DROP POLICY IF EXISTS "forum_likes_read_all"                  ON "forum_likes";
-- DROP POLICY IF EXISTS "global_forum_posts_owner_write"        ON "global_forum_posts";
-- DROP POLICY IF EXISTS "global_forum_posts_read_all"           ON "global_forum_posts";
-- DROP POLICY IF EXISTS "data_export_jobs_owner_access"         ON "data_export_jobs";
-- DROP POLICY IF EXISTS "data_access_logs_owner_access"         ON "data_access_logs";
-- DROP POLICY IF EXISTS "forum_posts_owner_write"               ON "forum_posts";
-- DROP POLICY IF EXISTS "forum_posts_read_all"                  ON "forum_posts";
-- DROP POLICY IF EXISTS "league_members_owner_access"           ON "league_members";
-- DROP POLICY IF EXISTS "payments_owner_access"                 ON "payments";
-- DROP POLICY IF EXISTS "subscriptions_owner_access"            ON "subscriptions";
