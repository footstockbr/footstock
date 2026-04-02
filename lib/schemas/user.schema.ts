// ============================================================================
// Foot Stock — Schema de Usuário (Zod)
// ============================================================================

import { z } from 'zod';
import { INVESTOR_PROFILE } from '@/lib/enums';

// ---------------------------------------------------------------------------
// ST005: Schema de atualização de perfil
// ---------------------------------------------------------------------------

/** Schema de atualização de perfil do usuário */
export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(3, 'Nome deve ter no mínimo 3 caracteres.')
    .max(100, 'Nome deve ter no máximo 100 caracteres.')
    .trim()
    .optional(),
  phone: z
    .string()
    .regex(
      /^\(\d{2}\)\s?\d{4,5}-\d{4}$/,
      'Telefone deve estar no formato (XX) XXXXX-XXXX.',
    )
    .nullable()
    .optional(),
  favoriteClub: z
    .string()
    .max(50, 'Clube favorito deve ter no máximo 50 caracteres.')
    .nullable()
    .optional(),
  investorProfile: z
    .nativeEnum(
      Object.fromEntries(
        Object.entries(INVESTOR_PROFILE).map(([k, v]) => [k, v]),
      ) as typeof INVESTOR_PROFILE,
      {
        errorMap: () => ({ message: 'Perfil de investidor inválido.' }),
      },
    )
    .optional(),
  bio: z
    .string()
    .max(300, 'Bio deve ter no máximo 300 caracteres.')
    .nullable()
    .optional(),
});

// ---------------------------------------------------------------------------
// Tipo inferido
// ---------------------------------------------------------------------------

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
