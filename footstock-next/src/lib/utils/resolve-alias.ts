// ============================================================================
// FootStock — resolveAlias
// Resolver de aliases de ticker: converte códigos do mundo real (FLA3) para
// tickers canônicos do sistema (URU3) de forma transparente.
//
// SEGURANÇA: server-only. Este módulo acessa a tabela asset_aliases que pode
// conter correlações entre tickers fictícios e reais. Nunca importar no cliente.
//
// Contrato:
//   resolveAlias("FLA3")  → "URU3"   (alias encontrado → retorna canônico)
//   resolveAlias("URU3")  → "URU3"   (já é canônico → retorna direto)
//   resolveAlias("XYZ9")  → null     (não existe nem como alias nem como ticker)
//   resolveAlias("fla3")  → "URU3"   (case-insensitive)
// ============================================================================

import 'server-only'

import { prisma } from '@/lib/prisma'

/**
 * Resolve um ticker (potencialmente um alias do mundo real) para o ticker
 * canônico fictício do sistema.
 *
 * Estratégia:
 * 1. Normaliza para maiúsculas
 * 2. Verifica se já é um ticker canônico ativo em `assets`
 * 3. Se não, busca em `asset_aliases` (ativo)
 * 4. Retorna null se nenhum match
 *
 * Nunca lança exceção — "não encontrado" é resultado de domínio.
 * A rota que chama decide se isso vira 404 ou 422.
 */
export async function resolveAlias(rawTicker: string): Promise<string | null> {
  if (!rawTicker?.trim()) return null

  const ticker = rawTicker.toUpperCase().trim()

  // Passo 1: Verifica se já é ticker canônico
  const canonical = await prisma.asset.findUnique({
    where: { ticker, isActive: true },
    select: { ticker: true },
  })
  if (canonical) return canonical.ticker

  // Passo 2: Verifica em asset_aliases
  const alias = await prisma.assetAlias.findUnique({
    where: { alias: ticker },
    select: { assetTicker: true, isActive: true },
  })

  if (alias?.isActive) return alias.assetTicker

  return null
}

/**
 * Versão síncrona do resolver usando mapa em memória.
 * Use APENAS quando já tiver o mapa pré-carregado (ex: em batch processing).
 * Para uso em rotas, prefira resolveAlias() (async com DB).
 */
export function resolveAliasFromMap(
  rawTicker: string,
  aliasMap: Map<string, string>
): string | null {
  if (!rawTicker?.trim()) return null
  const ticker = rawTicker.toUpperCase().trim()
  return aliasMap.get(ticker) ?? null
}
