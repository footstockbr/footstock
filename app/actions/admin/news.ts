'use server'
// ============================================================================
// Foot Stock — Server Action: injectNewsAction
// Injeção manual de notícias via admin com RBAC (motor:control).
// Rastreabilidade: INT-049
// ============================================================================

import { revalidatePath } from 'next/cache'
import { newsInjectionService, adminNewsInjectSchema } from '@/lib/services/NewsInjectionService'
import { getAdminActionUser } from '@/lib/auth/action-auth'
import {
  type ActionResult,
  actionSuccess,
  actionError,
  getErrorMessage,
} from '@/lib/action-utils'

type InjectNewsResult = ActionResult<{ newsId: string }>

/**
 * Injeta notícia no motor de preços.
 * Assinatura compatível com useActionState (prevState primeiro parâmetro).
 */
export async function injectNewsAction(
  _prevState: InjectNewsResult,
  formData: FormData
): Promise<InjectNewsResult> {
  // 1. Verificar autenticação e permissão RBAC
  const auth = await getAdminActionUser<{ newsId: string }>('motor:control')
  if (!auth.user) return auth.actionError

  // 2. Extrair e validar input
  const rawData = {
    title: formData.get('title'),
    content: formData.get('content'),
    ticker: formData.get('ticker'),
    impactCategory: formData.get('impactCategory'),
    sentiment: parseFloat(formData.get('sentiment') as string),
    source: formData.get('source') || undefined,
  }

  const parsed = adminNewsInjectSchema.safeParse(rawData)
  if (!parsed.success) {
    return actionError(
      'Dados inválidos',
      parsed.error.flatten().fieldErrors as Record<string, string[]>
    )
  }

  // 3. Executar operação (redirect/notFound ficam FORA do try/catch)
  try {
    const { newsId } = await newsInjectionService.inject(parsed.data, auth.user.id)

    revalidatePath('/admin/news')
    revalidatePath('/admin')

    return actionSuccess(
      { newsId },
      `Notícia injetada com sucesso para ${parsed.data.ticker}. O motor processará o impacto em breve.`
    )
  } catch (error) {
    console.error('[injectNewsAction] Erro interno:', error)

    if (error instanceof Error && error.message.includes('não encontrado')) {
      return actionError(error.message)
    }

    return actionError(getErrorMessage(error))
  }
}
