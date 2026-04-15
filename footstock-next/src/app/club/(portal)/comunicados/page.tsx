// ============================================================================
// Foot Stock — /club/comunicados — Comunicados oficiais do clube
// Auth obrigatória CLUB_PARTNER via (portal)/layout.tsx + withClubAuth().
// Integração com feed de comunicados em fase futura.
// Rastreabilidade: US-025, US-036, FDD painel-admin §2.12, MILESTONE-9
// ============================================================================

import type { Metadata } from 'next'
import { FileText, Trophy, Clock } from 'lucide-react'
import { withClubAuth } from '@/lib/auth/club-auth'
import { prisma } from '@/lib/prisma'

export const metadata: Metadata = {
  title: 'Comunicados — Portal do Clube — Foot Stock',
}

export default async function ClubComunicadosPage() {
  const { clubId } = await withClubAuth()

  const asset = await prisma.asset.findUnique({
    where: { ticker: clubId },
    select: { id: true, displayName: true },
  })

  if (!asset) {
    return (
      <div className="flex items-center justify-center h-full text-[#929AA5] text-sm p-8">
        Clube {clubId} não encontrado no sistema.
      </div>
    )
  }

  // Buscar notícias relacionadas ao clube como proxy de comunicados
  const clubNews = await prisma.news.findMany({
    where: {
      OR: [
        { ticker: clubId },
        { assetIds: { has: asset.id } },
      ],
      isPublished: true,
      isArchived: false,
    },
    orderBy: { publishedAt: 'desc' },
    take: 10,
    select: {
      id: true,
      title: true,
      content: true,
      publishedAt: true,
      source: true,
      impact: true,
    },
  })

  const formatDate = (d: Date | null) => {
    if (!d) return '—'
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }

  return (
    <div data-testid="page-club-comunicados" className="max-w-xl mx-auto px-4 pt-6 pb-10 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4 bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.18)] p-5">
        <div className="w-12 h-12 rounded-full bg-[rgba(240,185,11,.15)] flex items-center justify-center">
          <FileText className="h-6 w-6 text-[#F0B90B]" />
        </div>
        <div className="flex-1">
          <h1 className="text-base font-bold text-[#EAECEF]">Comunicados — {asset.displayName}</h1>
          <p className="text-xs text-[#929AA5] mt-0.5">Notícias e anúncios relevantes</p>
        </div>
        {clubNews.length > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-[rgba(240,185,11,.12)] text-[#F0B90B] text-xs font-bold">
            {clubNews.length}
          </span>
        )}
      </div>

      {clubNews.length > 0 ? (
        <div className="space-y-4">
          {clubNews.map((news) => (
            <div key={news.id} className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h2 className="text-sm font-semibold text-[#EAECEF] leading-snug flex-1">{news.title}</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[rgba(240,185,11,.12)] text-[#F0B90B] flex-shrink-0">
                  {news.impact}
                </span>
              </div>
              <p className="text-xs text-[#929AA5] leading-relaxed line-clamp-2">
                {news.content.slice(0, 160)}{news.content.length > 160 ? '…' : ''}
              </p>
              <div className="flex items-center gap-3 mt-3 text-[10px] text-[#4B5563]">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDate(news.publishedAt)}
                </span>
                {news.source && <span>via {news.source}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-10 text-center space-y-3">
          <FileText className="h-10 w-10 text-[#2B3139] mx-auto" />
          <div>
            <p className="text-sm font-semibold text-[#EAECEF]">Nenhum comunicado</p>
            <p className="text-xs text-[#929AA5] mt-1 max-w-xs mx-auto">
              Comunicados e notícias sobre o clube aparecerão aqui assim que forem publicados.
            </p>
          </div>
        </div>
      )}

      {/* Aviso */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-[rgba(240,185,11,.06)] border border-[rgba(240,185,11,.12)]">
        <Trophy className="h-4 w-4 text-[#F0B90B] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#929AA5]">
          Comunicados publicados via painel administrativo do Foot Stock.
        </p>
      </div>
    </div>
  )
}
