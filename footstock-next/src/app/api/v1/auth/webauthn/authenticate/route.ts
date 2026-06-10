import { errors } from '@/lib/api'

/**
 * POST /api/v1/auth/webauthn/authenticate
 *
 * DESABILITADO (501) ATÉ module-6.
 *
 * O fluxo WebAuthn está pela metade: não existe tabela `webauthn_credentials`
 * (module-6 pendente), então o passo "verify" verificava a assinatura contra uma
 * credencial vazia e — caso a verificação passasse — emitia um cookie de sessão
 * Auth.js REAL para o e-mail informado. Isso é um caminho de login perigoso e
 * não funcional (a feature não está exposta em nenhuma UI).
 *
 * Mantemos o endpoint fechado (501) em vez de meio-implementado. Reabrir exige:
 *   1) criar o modelo Prisma `WebAuthnCredential` (+ migration);
 *   2) persistir a credencial no registro e carregá-la aqui;
 *   3) armazenar o challenge em Redis (não em Map em memória — module-7).
 */
export async function POST() {
  return errors.notImplemented()
}
