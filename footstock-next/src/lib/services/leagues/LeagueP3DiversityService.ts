import 'server-only'

import { prisma } from '@/lib/prisma'

const MAX_P3 = 20
const SERIE_BONUS = 4
const PTS_PER_ASSET = 3

/**
 * Pilar P3 — Portfolio Diversity (max 20 pts).
 *
 * Fórmula: min(unique_assets * 3 + serie_bonus, 20)
 * - unique_assets: ativos com posição aberta (saldo > 0)
 * - serie_bonus: +4 se portfolio tem ativos de AMBAS as divisões (SERIE_A e SERIE_B)
 */
export class LeagueP3DiversityService {
  async calcularParaLiga(
    leagueId: string,
    memberIds: string[]
  ): Promise<Map<string, number>> {
    if (memberIds.length === 0) return new Map()

    // Busca posições abertas com divisão do ativo
    const positions = await prisma.position.findMany({
      where: {
        userId: { in: memberIds },
        status: 'OPEN',
        quantity: { gt: 0 },
      },
      select: {
        userId: true,
        assetId: true,
        asset: { select: { division: true } },
      },
    })

    const scores = new Map<string, number>(memberIds.map((id) => [id, 0]))

    // Agrupa por usuário
    const byUser = new Map<string, { assetId: string; division: string }[]>()
    for (const pos of positions) {
      const arr = byUser.get(pos.userId) ?? []
      arr.push({ assetId: pos.assetId, division: pos.asset.division })
      byUser.set(pos.userId, arr)
    }

    for (const userId of memberIds) {
      const userPositions = byUser.get(userId) ?? []

      const uniqueAssets = new Set(userPositions.map((p) => p.assetId)).size
      const divisions = new Set(userPositions.map((p) => p.division))

      const serieBonus = divisions.has('SERIE_A') && divisions.has('SERIE_B') ? SERIE_BONUS : 0
      const p3 = Math.min(uniqueAssets * PTS_PER_ASSET + serieBonus, MAX_P3)

      scores.set(userId, p3)
    }

    return scores
  }
}

export const leagueP3DiversityService = new LeagueP3DiversityService()
