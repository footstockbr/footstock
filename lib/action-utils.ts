// ============================================================================
// Foot Stock — Server Action Utilities
// Tipo ActionResult<T> e helpers para uso com useActionState (React 19).
// ============================================================================

/**
 * Tipo de retorno padronizado para Server Actions.
 * Compatível com useActionState: o primeiro estado é `initialActionState`.
 */
export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

/** Estado inicial para useActionState */
export const initialActionState: ActionResult = {
  success: false,
  error: '',
}

/** Cria resultado de sucesso */
export function actionSuccess<T>(data?: T, message?: string): ActionResult<T> {
  return { success: true, data, message }
}

/** Cria resultado de erro (genérico — compatível com qualquer ActionResult<T>) */
export function actionError<T = void>(
  error: string,
  fieldErrors?: Record<string, string[]>
): ActionResult<T> {
  return { success: false, error, fieldErrors }
}

/** Extrai mensagem de erro de qualquer tipo */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Erro desconhecido. Tente novamente.'
}
