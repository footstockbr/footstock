import { z } from 'zod'

// Ticker válido: 2-5 letras maiúsculas + 1-2 dígitos. Ex: URU3, POR3, GAL3
export const tickerSchema = z
  .string()
  .regex(/^[A-Z]{2,5}\d{1,2}$/i, 'Ticker inválido')
  .transform((t) => t.toUpperCase().trim())
