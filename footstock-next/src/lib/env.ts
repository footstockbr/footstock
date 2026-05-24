import { z } from 'zod'

// Converte strings vazias para undefined antes da validação do Zod.
// Necessário porque process.env retorna "" para vars não preenchidas no .env,
// enquanto Zod's .optional() só aceita undefined (não "").
const rawEnv = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v === '' ? undefined : v])
)

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL é obrigatório'),

  // Redis
  REDIS_URL: z.string().min(1, 'REDIS_URL é obrigatório'),

  // Auth
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter ao menos 32 caracteres'),

  // Auth.js v5 (NextAuth) — NXAUTH-02
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET deve ter ao menos 32 caracteres').optional(),
  AUTH_URL: z.string().url().optional(),
  AUTH_TRUST_HOST: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .default('true'),
  AUTH_ENABLE_LEGACY_CREDENTIALS: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .default('true'),
  AUTH_ENABLE_GOOGLE: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .default('false'),
  // NXAUTH-07 — quando 'true' habilita o recovery flow via Auth.js Resend
  // magic-link (passwordless). Default 'false' desativa o canal de recovery.
  // Liga junto com RESEND_API_KEY configurado.
  AUTH_ENABLE_MAGIC_LINK_RESET: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .default('false'),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  // Motor
  RAILWAY_URL: z.string().url().optional(),
  MOTOR_SECRET_TOKEN: z.string().min(1),

  // Sentry
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  SENTRY_DSN: z.string().url().optional(),

  // Auth — Registro
  // HMAC_CPF_SECRET é o path canônico (crypto.ts L26). CPF_HASH_SALT é fallback legado
  // (crypto.ts L32-37 emite warn). crypto.ts valida em runtime — basta um dos dois.
  CPF_HASH_SALT: z.string().min(32, 'CPF_HASH_SALT deve ter ao menos 32 caracteres').optional(),
  HMAC_CPF_SECRET: z.string().min(32, 'HMAC_CPF_SECRET deve ter ao menos 32 caracteres').optional(),

  // App
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

  // Gateways de pagamento (server-only — sem NEXT_PUBLIC_)
  MP_ACCESS_TOKEN: z.string().min(1).optional(),
  MP_WEBHOOK_SECRET: z.string().min(1).optional(),
  MERCADO_PAGO_ACCESS_TOKEN: z.string().min(1).optional(),
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().min(1).optional(),
  ACTIVE_GATEWAY: z.enum(['MERCADO_PAGO', 'PAGSEGURO', 'PAYPAL']).optional(),
  PAGSEGURO_EMAIL: z.string().email().optional(),
  PAGSEGURO_TOKEN: z.string().min(1).optional(),
  PAGSEGURO_WEBHOOK_SECRET: z.string().min(1).optional(),
  PAGSEGURO_SANDBOX: z.string().optional(),
  PAYPAL_CLIENT_ID: z.string().min(1).optional(),
  PAYPAL_CLIENT_SECRET: z.string().min(1).optional(),
  PAYPAL_WEBHOOK_ID: z.string().min(1).optional(),
  PAYPAL_SANDBOX: z.string().optional(),
  CRON_SECRET: z.string().min(1).optional(),

  // Email (Resend)
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional().default('noreply@footstock.app'),

  // WebAuthn (Passwordless)
  WEBAUTHN_RP_ID: z.string().min(1).optional().default('localhost'),
  WEBAUTHN_RP_NAME: z.string().min(1).optional().default('FootStock'),
  WEBAUTHN_ORIGIN: z.string().url().optional().default('http://localhost:3000'),

  // IA (Anthropic Claude)
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  // FlagCheck — Verificação de maioridade via CPF (T-023)
  FLAGCHECK_API_URL: z.string().url().optional(),
  FLAGCHECK_API_KEY: z.string().min(1).optional(),

  // Segurança adicional
  ENCRYPTION_KEY: z.string().min(32).optional(),
  INTERNAL_JOBS_SECRET: z.string().min(32).optional(),
  REVALIDATE_SECRET: z.string().min(1).optional(),
  INVITE_TOKEN_SECRET: z.string().min(32).optional(),

})

const _env = envSchema.safeParse(rawEnv)

// Skip strict validation during Next.js build phase (page data collection).
// Em build phase, Railway/Docker não expoe runtime env vars; validacao real
// ocorre no boot do server (runtime). Build-time só precisa que tipos resolvam.
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'

if (!_env.success && !isBuildPhase) {
  const missing = _env.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(' | ')
  console.error('[env] Variáveis de ambiente inválidas:', missing)
  throw new Error(`[env] Configuração inválida — variáveis faltando ou inválidas: ${missing}`)
}

// Build-time fallback: durante next build, env vars do Railway nao estao
// disponiveis (Docker build phase isolada). Fornece dummy values nao-secretos
// para que page data collection consiga importar modulos que usam env.X
// (ex: prisma client init em rotas /api/cron/*).
const buildFallback: z.infer<typeof envSchema> = {
  DATABASE_URL: 'postgresql://build:build@localhost:5432/build',
  DIRECT_URL: 'postgresql://build:build@localhost:5432/build',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'build-jwt-secret-32-characters-min-length',
  MOTOR_SECRET_TOKEN: 'build-motor-token',
} as z.infer<typeof envSchema>

export const env = _env.success
  ? _env.data
  : (isBuildPhase ? buildFallback : ({} as z.infer<typeof envSchema>))
