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
  email: z.string().email('Informe um email válido').max(255),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres').max(128),
  confirmPassword: z.string(),
  favoriteClub: z.string().min(1, 'Selecione seu clube do coração'),
  consents: z.object({
    terms: z.literal(true, 'Você deve aceitar os Termos de Uso'),
    marketing: z.boolean().optional().default(false),
    analytics: z.boolean().optional().default(false),
    thirdParty: z.boolean().optional().default(false),
  }),
  userType: z.enum(['NORMAL', 'TIME_PARCEIRO', 'INFLUENCIADOR']).optional().default('NORMAL'),
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
})
export type Step1Data = z.infer<typeof step1Schema>

export const step2Schema = registerBase
  .pick({ email: true, password: true, confirmPassword: true })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  })
export type Step2Data = z.infer<typeof step2Schema>
