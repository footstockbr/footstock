-- ============================================================================
-- FootStock — Supabase Auth Sync Trigger
-- ============================================================================
-- Este trigger garante que quando um usuario e criado via Supabase Auth,
-- um registro minimo e criado na tabela public.users.
--
-- IMPORTANTE: Este trigger NAO e gerenciado pelo Prisma.
-- Executar manualmente no Supabase SQL Editor.
--
-- O trigger serve como fallback — a API sempre cria o registro completo.
-- Se a API falhar apos createUser mas antes de prisma.user.create,
-- o trigger garante consistencia minima.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Apenas cria registro se nao existir (registro completo e criado pela API).
  -- cpf_hash: usa o valor do metadata (passado pelo seed/API) ou placeholder para evitar NOT NULL.
  INSERT INTO public.users (id, email, name, cpf_hash, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'cpfHash', 'pending-' || NEW.id::text),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger (idempotente com OR REPLACE na function)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
