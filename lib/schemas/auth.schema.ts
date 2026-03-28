// ============================================================================
// Foot Stock — Schemas de Autenticação (Zod)
// ============================================================================

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Regex para telefone brasileiro: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX */
const PHONE_REGEX = /^\(\d{2}\)\s?\d{4,5}-\d{4}$/;

/** Regex para CPF: XXX.XXX.XXX-XX */
const CPF_REGEX = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;

/** Idade mínima em anos */
const MIN_AGE = 18;

/**
 * Verifica se a data de nascimento corresponde a pelo menos MIN_AGE anos.
 */
function isAtLeastAge(birthDate: string, minAge: number): boolean {
  const birth = new Date(birthDate);
  const today = new Date();
  const ageCutoff = new Date(
    today.getFullYear() - minAge,
    today.getMonth(),
    today.getDate(),
  );
  return birth <= ageCutoff;
}

// ---------------------------------------------------------------------------
// ST005: Schemas de autenticação
// ---------------------------------------------------------------------------

/** Schema de login */
export const loginSchema = z.object({
  email: z
    .string({ required_error: 'E-mail é obrigatório.' })
    .email('Formato de e-mail inválido.')
    .max(255, 'E-mail deve ter no máximo 255 caracteres.')
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: 'Senha é obrigatória.' })
    .min(1, 'Senha é obrigatória.'),
});

/** Schema de registro com validações completas */
export const registerSchema = z
  .object({
    name: z
      .string({ required_error: 'Nome é obrigatório.' })
      .min(3, 'Nome deve ter no mínimo 3 caracteres.')
      .max(100, 'Nome deve ter no máximo 100 caracteres.')
      .trim(),
    email: z
      .string({ required_error: 'E-mail é obrigatório.' })
      .email('Formato de e-mail inválido.')
      .max(255, 'E-mail deve ter no máximo 255 caracteres.')
      .toLowerCase()
      .trim(),
    password: z
      .string({ required_error: 'Senha é obrigatória.' })
      .min(8, 'Senha deve ter no mínimo 8 caracteres.')
      .max(128, 'Senha deve ter no máximo 128 caracteres.')
      .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula.')
      .regex(/[a-z]/, 'Senha deve conter ao menos uma letra minúscula.')
      .regex(/\d/, 'Senha deve conter ao menos um número.')
      .regex(
        /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/,
        'Senha deve conter ao menos um caractere especial.',
      ),
    confirmPassword: z.string({
      required_error: 'Confirmação de senha é obrigatória.',
    }),
    cpf: z
      .string({ required_error: 'CPF é obrigatório.' })
      .regex(CPF_REGEX, 'CPF deve estar no formato XXX.XXX.XXX-XX.'),
    phone: z
      .string({ required_error: 'Telefone é obrigatório.' })
      .regex(PHONE_REGEX, 'Telefone deve estar no formato (XX) XXXXX-XXXX.'),
    birthDate: z
      .string({ required_error: 'Data de nascimento é obrigatória.' })
      .date('Formato de data inválido. Use AAAA-MM-DD.')
      .refine(
        (val) => isAtLeastAge(val, MIN_AGE),
        `Você deve ter no mínimo ${MIN_AGE} anos para se cadastrar.`,
      ),
    favoriteClub: z
      .string()
      .max(50, 'Clube favorito deve ter no máximo 50 caracteres.')
      .optional(),
    consents: z.object({
      terms: z.literal(true, {
        errorMap: () => ({
          message: 'Você deve aceitar os Termos de Uso para se cadastrar.',
        }),
      }),
      privacy: z.literal(true, {
        errorMap: () => ({
          message:
            'Você deve aceitar a Política de Privacidade para se cadastrar.',
        }),
      }),
      marketing: z.boolean().default(false),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não conferem.',
    path: ['confirmPassword'],
  });

/** Schema de solicitação de recuperação de senha */
export const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: 'E-mail é obrigatório.' })
    .email('Formato de e-mail inválido.')
    .max(255, 'E-mail deve ter no máximo 255 caracteres.')
    .toLowerCase()
    .trim(),
});

/** Schema de redefinição de senha */
export const resetPasswordSchema = z
  .object({
    token: z
      .string({ required_error: 'Token é obrigatório.' })
      .min(1, 'Token é obrigatório.'),
    password: z
      .string({ required_error: 'Nova senha é obrigatória.' })
      .min(8, 'Senha deve ter no mínimo 8 caracteres.')
      .max(128, 'Senha deve ter no máximo 128 caracteres.')
      .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula.')
      .regex(/[a-z]/, 'Senha deve conter ao menos uma letra minúscula.')
      .regex(/\d/, 'Senha deve conter ao menos um número.')
      .regex(
        /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/,
        'Senha deve conter ao menos um caractere especial.',
      ),
    confirmPassword: z.string({
      required_error: 'Confirmação de senha é obrigatória.',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não conferem.',
    path: ['confirmPassword'],
  });

// ---------------------------------------------------------------------------
// Tipos inferidos dos schemas
// ---------------------------------------------------------------------------

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
