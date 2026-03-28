-- M019_add_rls_helpers
-- Funções helper RLS + políticas para Supabase
-- NOTA: O trigger on_auth_user_created deve ser criado MANUALMENTE via Supabase SQL Editor (ver PENDING-ACTIONS.md)

-- Função helper: retorna o user_id do JWT atual (Supabase RLS)
CREATE OR REPLACE FUNCTION auth.uid() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT coalesce(current_setting('request.jwt.claim.sub', true), '') $$;

-- Habilitar RLS nas tabelas críticas
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "positions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consents" ENABLE ROW LEVEL SECURITY;

-- Policies: usuário vê apenas seus próprios dados
-- (Service role key bypassa RLS automaticamente no Prisma server-side)
CREATE POLICY "users_self_access" ON "users"
  FOR ALL USING (id = auth.uid());

CREATE POLICY "orders_owner_access" ON "orders"
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "positions_owner_access" ON "positions"
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "transactions_owner_access" ON "transactions"
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "notifications_owner_access" ON "notifications"
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "consents_owner_access" ON "consents"
  FOR ALL USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────
-- AÇÃO MANUAL OBRIGATÓRIA (Supabase SQL Editor):
-- Criar trigger on_auth_user_created para sincronizar auth.users → public.users
-- ─────────────────────────────────────────────────────────────────
--
-- CREATE OR REPLACE FUNCTION public.handle_new_user()
-- RETURNS trigger AS $$
-- BEGIN
--   INSERT INTO public.users (id, email, name, cpf_hash, created_at, updated_at)
--   VALUES (
--     NEW.id,
--     NEW.email,
--     COALESCE(NEW.raw_user_meta_data->>'name', 'Usuário'),
--     COALESCE(NEW.raw_user_meta_data->>'cpfHash', ''),
--     NOW(),
--     NOW()
--   )
--   ON CONFLICT (id) DO NOTHING;
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;
--
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
--
-- ─────────────────────────────────────────────────────────────────

-- down:
-- DROP POLICY IF EXISTS "consents_owner_access" ON "consents";
-- DROP POLICY IF EXISTS "notifications_owner_access" ON "notifications";
-- DROP POLICY IF EXISTS "transactions_owner_access" ON "transactions";
-- DROP POLICY IF EXISTS "positions_owner_access" ON "positions";
-- DROP POLICY IF EXISTS "orders_owner_access" ON "orders";
-- DROP POLICY IF EXISTS "users_self_access" ON "users";
-- ALTER TABLE "consents" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "notifications" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "transactions" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "positions" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "orders" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;
