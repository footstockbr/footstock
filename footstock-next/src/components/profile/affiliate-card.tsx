'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, Check, Users, TrendingUp, Link2 } from 'lucide-react'

interface AffiliateData {
  hasAffiliateCode: boolean
  affiliateCode: string | null
  referralLink: string | null
  totalReferrals: number
  totalEarnedFS: number
  recentConversions: Array<{
    referredUserName: string
    earnedFS: number
    date: string
  }>
  active: boolean
}

async function fetchAffiliate(): Promise<AffiliateData> {
  const res = await fetch('/api/v1/users/me/affiliate', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

export function AffiliateCard() {
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const { data, isLoading, isError } = useQuery<AffiliateData>({
    queryKey: ['user-affiliate'],
    queryFn: fetchAffiliate,
    staleTime: 60_000,
  })

  async function handleCopyCode() {
    if (!data?.affiliateCode) return
    await navigator.clipboard.writeText(data.affiliateCode)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  async function handleCopyLink() {
    if (!data?.referralLink) return
    await navigator.clipboard.writeText(data.referralLink)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  if (isLoading) {
    return (
      <div
        data-testid="affiliate-card-loading"
        className="bg-[#1E2329] border border-[rgba(240,185,11,.12)] rounded-xl p-4 animate-pulse"
      >
        <div className="h-4 w-40 bg-[#2B3139] rounded mb-3" />
        <div className="h-10 w-full bg-[#2B3139] rounded" />
      </div>
    )
  }

  if (isError || !data?.hasAffiliateCode) {
    return null
  }

  const formattedEarned = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  })
    .format(data.totalEarnedFS)
    .replace('R$', 'FS$')

  return (
    <div
      data-testid="affiliate-card"
      className="bg-[#1E2329] border border-[rgba(240,185,11,.18)] rounded-xl p-4 space-y-4"
    >
      {/* Cabeçalho */}
      <div>
        <h2 className="text-sm font-semibold text-[#EAECEF] flex items-center gap-2">
          <Users className="h-4 w-4 text-[#F0B90B]" />
          Programa de Indicações
        </h2>
        <p className="text-xs text-[#929AA5] mt-0.5">
          Indique amigos e ganhe FS$100 a cada cadastro
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div
          data-testid="affiliate-card-referrals"
          className="bg-[#0B0E11] rounded-lg px-3 py-2 text-center"
        >
          <p className="text-lg font-bold text-[#F0B90B]">{data.totalReferrals}</p>
          <p className="text-[10px] text-[#929AA5]">indicações</p>
        </div>
        <div
          data-testid="affiliate-card-earned"
          className="bg-[#0B0E11] rounded-lg px-3 py-2 text-center"
        >
          <p className="text-lg font-bold text-[#0ECB81]">{formattedEarned}</p>
          <p className="text-[10px] text-[#929AA5]">ganhos totais</p>
        </div>
      </div>

      {/* Código */}
      <div>
        <p className="text-[10px] text-[#929AA5] mb-1.5 uppercase tracking-wide">Seu código</p>
        <div className="flex items-center gap-2">
          <div
            data-testid="affiliate-card-code"
            className="flex-1 bg-[#0B0E11] border border-[rgba(240,185,11,.2)] rounded-lg px-3 py-2 font-mono text-sm font-bold text-[#F0B90B] tracking-widest select-all"
          >
            {data.affiliateCode}
          </div>
          <button
            data-testid="affiliate-card-copy-code-button"
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[rgba(240,185,11,.1)] border border-[rgba(240,185,11,.2)] text-[#F0B90B] text-xs font-medium hover:bg-[rgba(240,185,11,.18)] transition-colors"
            aria-label="Copiar código de afiliado"
          >
            {copiedCode ? (
              <Check className="h-3.5 w-3.5 text-[#0ECB81]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copiedCode ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </div>

      {/* Link de divulgação */}
      <div>
        <p className="text-[10px] text-[#929AA5] mb-1.5 uppercase tracking-wide">
          <Link2 className="h-3 w-3 inline mr-1" />
          Link de divulgação
        </p>
        <div className="flex items-center gap-2">
          <div
            data-testid="affiliate-card-link"
            className="flex-1 bg-[#0B0E11] border border-[rgba(240,185,11,.1)] rounded-lg px-3 py-2 text-[10px] text-[#707A8A] truncate select-all"
          >
            {data.referralLink}
          </div>
          <button
            data-testid="affiliate-card-copy-link-button"
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#2B3139] border border-[#2B3139] text-[#929AA5] text-xs font-medium hover:bg-[#374151] transition-colors whitespace-nowrap"
            aria-label="Copiar link de indicação"
          >
            {copiedLink ? (
              <Check className="h-3.5 w-3.5 text-[#0ECB81]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copiedLink ? 'Copiado' : 'Copiar link'}
          </button>
        </div>
      </div>

      {/* Conversões recentes */}
      {data.recentConversions.length > 0 && (
        <div>
          <p className="text-[10px] text-[#929AA5] mb-2 uppercase tracking-wide flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Últimas indicações
          </p>
          <div data-testid="affiliate-card-conversions" className="space-y-1.5">
            {data.recentConversions.map((conv, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs bg-[#0B0E11] rounded px-3 py-1.5"
              >
                <span className="text-[#929AA5] truncate max-w-[140px]">
                  {conv.referredUserName}
                </span>
                <span className="text-[#0ECB81] font-medium whitespace-nowrap">
                  +FS${conv.earnedFS.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA — se zero indicações */}
      {data.totalReferrals === 0 && (
        <p
          data-testid="affiliate-card-zero-state"
          className="text-xs text-[#707A8A] text-center py-1"
        >
          Ainda sem indicações. Compartilhe seu link e ganhe FS$100 por cadastro!
        </p>
      )}
    </div>
  )
}
