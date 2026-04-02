// ============================================================================
// Foot Stock — WebAuthn Server Helpers (@simplewebauthn/server)
// ============================================================================

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type GenerateRegistrationOptionsOpts,
  type GenerateAuthenticationOptionsOpts,
  type VerifyRegistrationResponseOpts,
  type VerifyAuthenticationResponseOpts,
} from '@simplewebauthn/server'

const rpID = process.env.WEBAUTHN_RP_ID ?? 'localhost'
const rpName = process.env.WEBAUTHN_RP_NAME ?? 'Foot Stock'
const origin = process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:3000'

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function createRegistrationOptions(
  userId: string,
  userEmail: string
) {
  const opts: GenerateRegistrationOptionsOpts = {
    rpName,
    rpID,
    userID: userId,
    userName: userEmail,
    userDisplayName: userEmail,
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'preferred',
    },
    timeout: 60000,
  }

  return generateRegistrationOptions(opts)
}

export async function verifyRegistration(
  response: VerifyRegistrationResponseOpts['response'],
  expectedChallenge: string
) {
  const opts: VerifyRegistrationResponseOpts = {
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  }

  return verifyRegistrationResponse(opts)
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export async function createAuthenticationOptions(
  credentialIds: Uint8Array[]
) {
  const opts: GenerateAuthenticationOptionsOpts = {
    rpID,
    userVerification: 'required',
    timeout: 60000,
    allowCredentials: credentialIds.map((id) => ({
      id,
      type: 'public-key',
      transports: ['internal'],
    })),
  }

  return generateAuthenticationOptions(opts)
}

export async function verifyAuthentication(
  response: VerifyAuthenticationResponseOpts['response'],
  expectedChallenge: string,
  credentialPublicKey: Uint8Array,
  credentialID: Uint8Array,
  credentialCounter: number
) {
  const opts: VerifyAuthenticationResponseOpts = {
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    authenticator: {
      credentialPublicKey,
      credentialID,
      counter: credentialCounter,
      transports: ['internal'],
    },
  }

  return verifyAuthenticationResponse(opts)
}
