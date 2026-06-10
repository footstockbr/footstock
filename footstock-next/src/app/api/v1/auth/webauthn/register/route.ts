import { errors } from '@/lib/api'

/**
 * POST /api/v1/auth/webauthn/register
 *
 * DESABILITADO (501) ATÉ module-6.
 *
 * O passo "verify" retornava "registrado com sucesso" sem JAMAIS persistir a
 * credencial (não existe a tabela `webauthn_credentials` — module-6 pendente),
 * deixando o usuário com a falsa impressão de ter cadastrado biometria. A feature
 * não está exposta em nenhuma UI. Mantemos fechado (501) em vez de meio-pronto.
 *
 * Reabrir exige: modelo Prisma `WebAuthnCredential` (+ migration), persistência da
 * credencial no registro e challenge em Redis com TTL (module-7).
 */
export async function POST() {
  return errors.notImplemented()
}
