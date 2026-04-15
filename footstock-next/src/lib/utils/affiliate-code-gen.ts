// ============================================================================
// Foot Stock — Geração de código único de afiliado
// Formato: NAME_PREFIX(5) + RANDOM_SUFFIX(4) = 9 chars uppercase alphanumeric
// Ex: PEDRO7K4M, JOAO91BX, MARIA3ZP
// ============================================================================

const BASE32_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' // sem 0, 1, I, O — evita confusão visual

function randomBase32(length: number): string {
  let result = ''
  for (let i = 0; i < length; i++) {
    result += BASE32_CHARS[Math.floor(Math.random() * BASE32_CHARS.length)]
  }
  return result
}

function namePrefix(name: string): string {
  // Remove acentos, normaliza para ASCII, remove não-letras, pega primeiras 5 letras uppercase
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .slice(0, 5)
    .toUpperCase()
    .padEnd(5, 'X') // garante 5 chars mínimo
}

/**
 * Gera um código de afiliado a partir do nome.
 * NÃO verifica unicidade — use generateUniqueAffiliateCode para persistência.
 */
export function generateAffiliateCode(name: string): string {
  return namePrefix(name) + randomBase32(4)
}

/**
 * Gera código único com retry até 5 tentativas.
 * Recebe uma função async de verificação de existência.
 *
 * @param name - nome do usuário
 * @param exists - função que retorna true se o código já está em uso
 * @returns código único gerado
 * @throws Error se não conseguir gerar código único em 5 tentativas
 */
export async function generateUniqueAffiliateCode(
  name: string,
  exists: (code: string) => Promise<boolean>
): Promise<string> {
  const MAX_ATTEMPTS = 5
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const code = generateAffiliateCode(name)
    const taken = await exists(code)
    if (!taken) return code
  }
  // Fallback: usa mais entropia no sufixo para evitar colisão
  const fallback = 'FS' + randomBase32(7)
  const takenFallback = await exists(fallback)
  if (!takenFallback) return fallback
  throw new Error(`[affiliate-code-gen] Não foi possível gerar código único após ${MAX_ATTEMPTS + 1} tentativas`)
}
