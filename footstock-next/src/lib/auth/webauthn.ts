import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  WebAuthnCredential,
} from '@simplewebauthn/server'

// ─── Configuração do Relying Party ────────────────────────────────────────────

const RP_ID = process.env.WEBAUTHN_RP_ID ?? 'localhost'
const RP_NAME = process.env.WEBAUTHN_RP_NAME ?? 'Foot Stock'

function getOrigin(): string {
  if (process.env.WEBAUTHN_ORIGIN) return process.env.WEBAUTHN_ORIGIN
  if (RP_ID === 'localhost') return 'http://localhost:3000'
  return `https://${RP_ID}`
}

// ─── Registro ─────────────────────────────────────────────────────────────────

/**
 * Gera opções para registrar nova chave biométrica (FIDO2/PassKey).
 * O `challenge` retornado deve ser armazenado temporariamente (Redis) com TTL de 5 min.
 *
 * @param userId - ID do usuário (string UUID).
 * @param userEmail - Email do usuário (exibido no prompt biométrico).
 */
export async function createRegistrationOptions(userId: string, userEmail: string) {
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(userId), // v13: Uint8Array
    userName: userEmail,
    userDisplayName: userEmail,
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform', // Face ID, Touch ID, Windows Hello
      userVerification: 'required',
      residentKey: 'required',
    },
    supportedAlgorithmIDs: [-7, -257], // ES256, RS256
  })
}

/**
 * Verifica a resposta de registro enviada pelo browser (SimpleWebAuthn client).
 * @param response - Objeto JSON retornado pelo `startRegistration()` no client.
 * @param expectedChallenge - Challenge armazenado no Redis antes do registro.
 */
export async function verifyRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string
) {
  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: getOrigin(),
    expectedRPID: RP_ID,
    requireUserVerification: true,
  })
}

// ─── Autenticação ─────────────────────────────────────────────────────────────

/**
 * Gera opções para autenticação biométrica com chave já registrada.
 * @param credentialIds - IDs das credenciais em Base64URL string (armazenadas no banco).
 */
export async function createAuthenticationOptions(credentialIds: string[]) {
  return generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'required',
    allowCredentials: credentialIds.map((id) => ({
      id, // v13: Base64URLString (plain string)
      type: 'public-key' as const,
    })),
  })
}

/**
 * Verifica a resposta de autenticação enviada pelo browser.
 * @param response - Objeto JSON retornado pelo `startAuthentication()` no client.
 * @param expectedChallenge - Challenge armazenado no Redis.
 * @param authenticator - Dados do autenticador armazenados no banco ao registrar.
 */
export async function verifyAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  credential: WebAuthnCredential
) {
  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: getOrigin(),
    expectedRPID: RP_ID,
    credential, // v13: renamed from 'authenticator' to 'credential'
    requireUserVerification: true,
  })
}
