import { z } from 'zod'

export const createLeagueSchema = z.object({
  name: z
    .string()
    .min(3, 'Mínimo 3 caracteres')
    .max(50, 'Máximo 50 caracteres'),
  type: z.enum(['PUBLICA', 'AMIGOS', 'PRO']),
  duration: z.enum(['1S', '1M', 'TEMPORADA']),
  division: z.enum(['BRONZE', 'PRATA', 'OURO', 'OPEN']),
  emblemUrl: z.string().url('URL inválida').optional(),
  sponsorId: z.string().optional(),
  // Ligas PRO podem habilitar alavancagem 2x para membros Lenda
  permiteAlavancagem: z.boolean().optional().default(false),
})

export type CreateLeagueInput = z.infer<typeof createLeagueSchema>
