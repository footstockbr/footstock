// ============================================================================
// Foot Stock — POST /api/v1/glossary/interact
// Registra interação fire-and-forget com termo do glossário (InfoIcon click)
// Fonte: module-18/TASK-6/ST004
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { getTermBySlug } from '@/lib/data/glossary'
import { glossaryInteractionRepository } from '@/lib/repositories/GlossaryInteractionRepository'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const InteractSchema = z.object({
  termSlug: z.string().min(1, 'termSlug é obrigatório.'),
})

// ---------------------------------------------------------------------------
// POST /api/v1/glossary/interact
// ---------------------------------------------------------------------------

async function interactHandler(req: NextRequest, { user }: AuthContext) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: 'Body inválido.' } },
      { status: 400 }
    )
  }

  const parsed = InteractSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' } },
      { status: 422 }
    )
  }

  const { termSlug } = parsed.data

  // Validar que o termo existe no glossário
  const term = getTermBySlug(termSlug)
  if (!term) {
    return NextResponse.json(
      { success: false, error: { code: 'GLOSSARY_001', message: `Termo '${termSlug}' não encontrado no glossário.` } },
      { status: 422 }
    )
  }

  await glossaryInteractionRepository.record(user.id, termSlug)

  return NextResponse.json({ success: true, data: { ok: true } }, { status: 201 })
}

export const POST = withAuth(interactHandler)
