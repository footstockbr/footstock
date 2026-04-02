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

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL deve ser URL válida'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Redis
  REDIS_URL: z.string().min(1, 'REDIS_URL é obrigatório'),

  // Upstash Redis (Rate Limiting)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

  // Auth
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter ao menos 32 caracteres'),

  // Motor
  RAILWAY_URL: z.string().url().optional(),
  MOTOR_SECRET_TOKEN: z.string().min(1),

  // Sentry
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  SENTRY_DSN: z.string().url().optional(),

  // Auth — Registro
  CPF_HASH_SALT: z.string().min(32, 'CPF_HASH_SALT deve ter ao menos 32 caracteres'),
  FLAGCHECK_API_URL: z.string().url().optional(),
  FLAGCHECK_API_KEY: z.string().optional(),

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
  WEBAUTHN_RP_NAME: z.string().min(1).optional().default('Foot Stock'),
  WEBAUTHN_ORIGIN: z.string().url().optional().default('http://localhost:3000'),

  // IA (Anthropic Claude)
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  // Segurança adicional
  ENCRYPTION_KEY: z.string().min(32).optional(),
  INTERNAL_JOBS_SECRET: z.string().min(32).optional(),
  REVALIDATE_SECRET: z.string().min(1).optional(),
  INVITE_TOKEN_SECRET: z.string().min(32).optional(),

})

const _env = envSchema.safeParse(rawEnv)

if (!_env.success) {
  console.error('Variáveis de ambiente inválidas:')
  console.error(JSON.stringify(_env.error.format(), null, 2))
  if (process.env.NODE_ENV === 'production') {
    process.exit(1)
  }
}

export const env = _env.success ? _env.data : ({} as z.infer<typeof envSchema>)
