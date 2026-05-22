import { z } from 'zod'
import { validateCPF, calcAge } from '@/lib/utils/validators'

// ─── Schema base do objeto (sem .refine) — necessário para derivar step schemas ─

const registerBase = z.object({
  name: z.string().min(3, 'Nome deve ter ao menos 3 caracteres').max(120),
  phone: z.string().min(10, 'Telefone inválido').max(20),
  birthDate: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), 'Data inválida')
    .refine((v) => calcAge(v) >= 18, 'Você deve ter ao menos 18 anos'),
  cpf: z
    .string()
    .min(11, 'CPF inválido')
    .max(14)
    .refine((v) => validateCPF(v), 'CPF inválido'),
  // ID-NEW-005 (Codex round 3): canonicalizar email antes da validacao para
  // que User@x.com e user@x.com nao virem dois registros distintos sob unique
  // index case-sensitive do Postgres. transform roda apos .email() — mantido
  // .trim() para acidentes de paste com espacos.
  email: z
    .string()
    .max(255)
    .email('Informe um email válido')
    .transform((v) => v.trim().toLowerCase()),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres').max(128),
  confirmPassword: z.string(),
  favoriteClub: z.string().min(1, 'Selecione seu clube do coração'),
  consents: z.object({
    terms: z.literal(true, 'Você deve aceitar os Termos de Uso'),
    marketing: z.boolean().optional().default(false),
    analytics: z.boolean().optional().default(false),
    thirdParty: z.boolean().optional().default(false),
  }),
  // ID-NEW-002 (Codex round 2): userType NAO e aceito do cliente. Public
  // registration sempre cria userType=NORMAL. Promocao para TIME_PARCEIRO /
  // INFLUENCIADOR e fluxo admin-side, fora deste schema. Manter campo aqui
  // apenas significa privilege escalation via payload.
  referredByCode: z.string().max(20).optional(),
})

// ─── Schema completo de registro (com validação cross-field) ──────────────────

export const registerSchema = registerBase.refine(
  (v) => v.password === v.confirmPassword,
  { message: 'As senhas não coincidem', path: ['confirmPassword'] }
)

export type RegisterDTO = z.infer<typeof registerSchema>

// ─── Schemas por etapa (derivados do base) ────────────────────────────────────

export const step1Schema = registerBase.pick({
  name: true,
  phone: true,
  birthDate: true,
  cpf: true,
  referredByCode: true,
})
export type Step1Data = z.infer<typeof step1Schema>

export const step2Schema = registerBase
  .pick({ email: true, password: true, confirmPassword: true })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  })
export type Step2Data = z.infer<typeof step2Schema>

// ─── Login ────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  // ID-NEW-005: canonicalizar email simetricamente ao registerSchema para que
  // login funcione mesmo se o usuario digitar com case diferente do cadastro.
  email: z
    .string()
    .email('Informe um email válido')
    .transform((v) => v.trim().toLowerCase()),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
})
export type LoginFormData = z.infer<typeof loginSchema>

// ─── Reset password ───────────────────────────────────────────────────────────

export const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres'),
    confirmPassword: z.string().min(1, 'Confirme a senha'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  })
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>

// ─── Change password (usuário autenticado) ───────────────────────────────────

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ message: 'Senha atual é obrigatória.' })
      .min(1, 'Senha atual é obrigatória.'),
    newPassword: z
      .string({ message: 'Nova senha é obrigatória.' })
      .min(8, 'Senha deve ter no mínimo 8 caracteres.')
      .max(128, 'Senha deve ter no máximo 128 caracteres.'),
    confirmPassword: z.string({
      message: 'Confirmação de senha é obrigatória.',
    }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'A nova senha deve ser diferente da senha atual.',
    path: ['newPassword'],
  })
export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>
