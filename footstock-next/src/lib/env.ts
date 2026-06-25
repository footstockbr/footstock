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
  // Task 005 — ids de `preapproval_plan` do Mercado Pago resolvidos via config (NUNCA
  // hardcoded no codigo). JSON map de planKey (`{PLAN_TYPE}_{period}`, ex.: `LENDA_monthly`)
  // -> preapproval_plan_id ja criado no MP. Quando uma planKey esta ausente, createSubscription
  // cria o plano de forma idempotente via API (`/preapproval_plan` + X-Idempotency-Key). Cadastro
  // manual no painel fica fora de escopo (decisao fechada da task 005).
  MERCADO_PAGO_PREAPPROVAL_PLAN_IDS: z.string().min(1).optional(),
  ACTIVE_GATEWAY: z.enum(['MERCADO_PAGO', 'PAGSEGURO', 'PAYPAL']).optional(),
  // FIX-01 — politica de refund alerta-primeiro para captura orfa (NOT_ACTIVATABLE).
  // Default 'false': um pagamento capturado para assinatura terminal e registrado como
  // Payment CAPTURED_NOT_ACTIVATED + audit REJECTED + alerta (resolucao manual do operador).
  // 'true' habilita auto-refund SOMENTE quando o orfao e comprovado (sem sub ACTIVE cobrindo)
  // e de forma idempotente. Estorno de pagamento com plano ATIVO correspondente e PROIBIDO.
  AUTO_REFUND_ON_ORPHAN: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .default('false'),
  PAGSEGURO_EMAIL: z.string().email().optional(),
  PAGSEGURO_TOKEN: z.string().min(1).optional(),
  PAGSEGURO_WEBHOOK_SECRET: z.string().min(1).optional(),
  PAGSEGURO_SANDBOX: z.string().optional(),
  // Marketplace/seller id (ACCO_...). Carregado mas ainda nao consumido pelos
  // gateways — wiring de split/marketplace exige mudanca em pagseguro.ts.
  PAGSEGURO_MARKETPLACE_ID: z.string().min(1).optional(),
  PAYPAL_CLIENT_ID: z.string().min(1).optional(),
  PAYPAL_CLIENT_SECRET: z.string().min(1).optional(),
  PAYPAL_WEBHOOK_ID: z.string().min(1).optional(),
  PAYPAL_SANDBOX: z.string().optional(),
  // Merchant/account id (Payer ID). Carregado mas ainda nao consumido pelos
  // gateways — wiring de marketplace/partner exige mudanca em paypal.ts.
  PAYPAL_MERCHANT_ID: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),

  // ST004 — janela de execução permitida do cron reconcile-payments, em horas UTC,
  // formato "startHour-endHour" (start inclusivo, end exclusivo; 0-24). Ausente/vazio =
  // sempre permitido (sem mudança de comportamento). Fora da janela o cron faz early-return
  // sem efeitos colaterais. Ex.: "2-6" só permite das 02:00 às 05:59 UTC.
  RECONCILE_WINDOW_UTC: z.string().optional(),

  // ST009 — número de proxies confiáveis entre a aplicação e a internet. O IP real do
  // cliente é o (TRUSTED_PROXY_HOPS)-ésimo a partir da DIREITA na cadeia X-Forwarded-For;
  // entradas à esquerda são controladas pelo cliente (XFF spoof) e NÃO confiáveis.
  // Default 1 (edge da plataforma de hosting).
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).max(10).optional().default(1),

  // Email (Resend)
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional().default('noreply@footstock.app'),

  // WebAuthn (Passwordless)
  WEBAUTHN_RP_ID: z.string().min(1).optional().default('localhost'),
  WEBAUTHN_RP_NAME: z.string().min(1).optional().default('FootStock'),
  WEBAUTHN_ORIGIN: z.string().url().optional().default('http://localhost:3000'),

  // IA — toggle de provider de LLM (Anthropic Claude <-> Kimi for coding).
  // AI_PROVIDER seleciona o provider ativo; default 'kimi'. Ver lib/services/ai-provider.ts.
  AI_PROVIDER: z.enum(['anthropic', 'kimi']).optional().default('kimi'),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  // Kimi: chave sk-kimi-..., endpoint Anthropic-compativel e modelo (defaults no resolver).
  KIMI_API_KEY: z.string().min(1).optional(),
  KIMI_BASE_URL: z.string().url().optional(),
  KIMI_MODEL: z.string().min(1).optional(),

  // Segurança adicional
  ENCRYPTION_KEY: z.string().min(32).optional(),
  INTERNAL_JOBS_SECRET: z.string().min(32).optional(),
  REVALIDATE_SECRET: z.string().min(1).optional(),
  INVITE_TOKEN_SECRET: z.string().min(32).optional(),

}).transform((data) => ({
  ...data,
  // FIX-24 — tolerancia de nomenclatura do Mercado Pago.
  // MERCADO_PAGO_* e o nome canonico (== producao + o que o codigo le em
  // lib/gateways/mercadopago.ts). MP_* permanece aceito como alias legado para
  // nao quebrar provisionamento de templates antigos: o valor canonico resolve de
  // MERCADO_PAGO_X e cai para MP_X quando o primeiro estiver ausente.
  MERCADO_PAGO_ACCESS_TOKEN: data.MERCADO_PAGO_ACCESS_TOKEN ?? data.MP_ACCESS_TOKEN,
  MERCADO_PAGO_WEBHOOK_SECRET: data.MERCADO_PAGO_WEBHOOK_SECRET ?? data.MP_WEBHOOK_SECRET,
}))

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

// FIX-24 — boot fail-fast do gateway de pagamento ativo.
// Quando ACTIVE_GATEWAY esta declarado, suas credenciais (token + webhook secret)
// sao obrigatorias: provisionar sem elas deixa checkout/webhook silenciosamente
// quebrado em runtime (token ausente -> PAYMENT_010, webhook sem secret -> rejeicao).
// Falhamos no boot para tornar a configuracao faltante visivel de imediato.
// Pulado em build phase (env de runtime indisponivel) e quando ACTIVE_GATEWAY nao
// foi declarado (dev/test sem gateway ativo nao dispara o gate).
if (_env.success && !isBuildPhase) {
  const d = _env.data
  const active = d.ACTIVE_GATEWAY
  const gatewayCredentials: Record<string, Array<[string, string | undefined]>> = {
    MERCADO_PAGO: [
      ['MERCADO_PAGO_ACCESS_TOKEN', d.MERCADO_PAGO_ACCESS_TOKEN],
      ['MERCADO_PAGO_WEBHOOK_SECRET', d.MERCADO_PAGO_WEBHOOK_SECRET],
    ],
    PAGSEGURO: [
      ['PAGSEGURO_TOKEN', d.PAGSEGURO_TOKEN],
      ['PAGSEGURO_WEBHOOK_SECRET', d.PAGSEGURO_WEBHOOK_SECRET],
    ],
    PAYPAL: [
      ['PAYPAL_CLIENT_ID', d.PAYPAL_CLIENT_ID],
      ['PAYPAL_CLIENT_SECRET', d.PAYPAL_CLIENT_SECRET],
      ['PAYPAL_WEBHOOK_ID', d.PAYPAL_WEBHOOK_ID],
    ],
  }
  if (active) {
    const missingGateway = (gatewayCredentials[active] ?? [])
      .filter(([, value]) => !value)
      .map(([key]) => key)
    if (missingGateway.length > 0) {
      const msg =
        `[env] ACTIVE_GATEWAY=${active} mas faltam credenciais obrigatórias: ${missingGateway.join(', ')}`
      console.error(msg)
      throw new Error(msg)
    }
  }
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
