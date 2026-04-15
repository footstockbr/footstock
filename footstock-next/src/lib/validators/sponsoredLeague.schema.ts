import { z } from 'zod'

const prizeLineSchema = z.object({
  position: z.number().int().min(1).max(20),
  label: z.string().min(1).max(50),
  description: z.string().max(500),
})

const validStatuses = ['AGENDADA', 'ATIVA', 'ENCERRADA'] as const
const validPlans = ['JOGADOR', 'CRAQUE', 'LENDA'] as const

const urlSchema = z.string().url().regex(/^https?:\/\//).max(500).nullable().optional()

export const createSponsoredLeagueSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no minimo 3 caracteres').max(100),
  company: z.string().min(2, 'Empresa deve ter no minimo 2 caracteres').max(100),
  sponsorUrl: urlSchema.default(null),
  prizes: z.array(prizeLineSchema).max(20).default([]),
  prize: z.string().max(500).optional(),
  maxParticipants: z.number().int().min(1).max(10000).default(50),
  minPlan: z.enum(validPlans).default('JOGADOR'),
  status: z.enum(validStatuses).default('AGENDADA'),
  borderColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor deve ser hex valida (#RRGGBB)').default('#f59e0b'),
  startDate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Data de inicio invalida'),
  endDate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Data de fim invalida'),
}).refine(
  (data) => new Date(data.endDate) > new Date(data.startDate),
  { message: 'Data de fim deve ser posterior a data de inicio', path: ['endDate'] }
)

export const updateSponsoredLeagueSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  company: z.string().min(2).max(100).optional(),
  sponsorUrl: urlSchema,
  prizes: z.array(prizeLineSchema).max(20).optional(),
  prize: z.string().max(500).optional(),
  maxParticipants: z.number().int().min(1).max(10000).optional(),
  minPlan: z.enum(validPlans).optional(),
  status: z.enum(validStatuses).optional(),
  borderColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  startDate: z.string().refine((d) => !isNaN(Date.parse(d))).optional(),
  endDate: z.string().refine((d) => !isNaN(Date.parse(d))).optional(),
})
