import { z } from 'zod'

export const createLeagueSchema = z.object({
  name: z
    .string()
    .min(3, 'Mínimo 3 caracteres')
    .max(50, 'Máximo 50 caracteres'),
  type: z.enum(['PUBLICA', 'AMIGOS', 'PRO']),
  duration: z.enum(['1S', '1M', 'TEMPORADA']),
  division: z.enum(['BRONZE', 'PRATA', 'OURO', 'ABERTA']),
  emblemUrl: z.string().url('URL inválida').optional(),
  sponsorId: z.string().optional(),
})

export type CreateLeagueInput = z.infer<typeof createLeagueSchema>
