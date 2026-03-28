-- Trigger de sincronização Supabase Auth → tabela public.users
-- IMPORTANTE: Este trigger NÃO é gerenciado pelo Prisma.
-- Executar manualmente no Supabase SQL Editor (Settings > Database > Functions).
--
-- Propósito: garantir consistência mínima caso a API falhe após criar o usuário
-- no Supabase Auth mas antes de executar prisma.user.create.
-- O ON CONFLICT (id) DO NOTHING garante que não sobrescreve o registro completo da API.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, investor_profile, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'INICIANTE',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
