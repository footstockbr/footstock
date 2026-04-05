/**
 * Tipo de retorno padronizado para Server Actions — compatível com useActionState.
 * Usar em todos os arquivos com "use server" do projeto.
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

/** Cria resultado de erro */
export function actionError(
  error: string,
  fieldErrors?: Record<string, string[]>
): ActionResult {
  return { success: false, error, fieldErrors }
}

/** Extrai mensagem user-friendly de qualquer tipo de erro */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Erro desconhecido. Tente novamente.'
}
