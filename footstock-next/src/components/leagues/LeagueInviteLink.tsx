'use client'

import { useState } from 'react'
import { Copy, Link2, RotateCcw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGenerateInvite, useRevokeInvite } from '@/hooks/useLeagues'

interface Props {
  leagueId: string
  isCreator: boolean
}

/**
 * LeagueInviteLink — exibe e gerencia o link de convite de uma liga AMIGOS.
 * Apenas o criador pode gerar e revogar o link.
 */
export function LeagueInviteLink({ leagueId, isCreator }: Props) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const generate = useGenerateInvite()
  const revoke = useRevokeInvite()

  if (!isCreator) return null

  async function handleGenerate() {
    const result = await generate.mutateAsync(leagueId)
    setInviteUrl(result.inviteUrl)
  }

  async function handleRevoke() {
    await revoke.mutateAsync(leagueId)
    setInviteUrl(null)
  }

  async function handleCopy() {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-4 p-3 rounded-lg bg-[#1a1816] border border-[#2a2724]">
      <div className="flex items-center gap-2 mb-2">
        <Link2 className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Link de convite
        </span>
      </div>

      {inviteUrl ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-2 rounded bg-[#0f0e0d] border border-[#2a2724]">
            <span className="text-xs text-gray-300 truncate flex-1">{inviteUrl}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
                'bg-[#F0B90B]/10 text-[#F0B90B] hover:bg-[#F0B90B]/20',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]'
              )}
              aria-label={copied ? 'Link copiado!' : 'Copiar link de convite'}
            >
              <Copy className="h-3 w-3" aria-hidden="true" />
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
            <button
              onClick={handleGenerate}
              disabled={generate.isPending}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
                'bg-white/5 text-gray-300 hover:bg-white/10',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              aria-label="Regenerar link de convite (invalida o anterior)"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Regenerar
            </button>
            <button
              onClick={handleRevoke}
              disabled={revoke.isPending}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
                'bg-red-500/10 text-red-400 hover:bg-red-500/20',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              aria-label="Revogar link de convite"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              Revogar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={generate.isPending}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium transition-colors w-full justify-center',
            'bg-[#F0B90B]/10 text-[#F0B90B] hover:bg-[#F0B90B]/20',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          aria-label="Gerar link de convite para a liga"
        >
          <Link2 className="h-3 w-3" aria-hidden="true" />
          {generate.isPending ? 'Gerando...' : 'Gerar link de convite'}
        </button>
      )}

      {(generate.isError || revoke.isError) && (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {generate.isError ? 'Erro ao gerar convite.' : 'Erro ao revogar convite.'}
        </p>
      )}
    </div>
  )
}
