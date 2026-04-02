'use client'

import { useState } from 'react'
import { Copy, Check, Link as LinkIcon } from 'lucide-react'
import { useGenerateInvite } from '@/hooks/useLeagues'
import { COPY_FEEDBACK_MS } from '@/lib/constants/timing'

interface Props {
  leagueId: string
}

export function InviteLink({ leagueId }: Props) {
  const [copied, setCopied] = useState(false)
  const { mutate: generate, data, isPending } = useGenerateInvite()

  async function handleCopy() {
    const url = data?.inviteUrl
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
    } catch {
      // Fallback for environments where clipboard API is unavailable
    }
  }

  function handleGenerate() {
    generate(leagueId)
  }

  if (!data?.inviteUrl) {
    return (
      <button
        onClick={handleGenerate}
        disabled={isPending}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#1a1816] border border-[#2a2724] text-gray-300 hover:text-[#EAECEF] hover:border-[#F0B90B]/40 transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B] min-h-[44px]"
        aria-label="Gerar link de convite para a liga"
      >
        <LinkIcon className="h-4 w-4" aria-hidden="true" />
        {isPending ? 'Gerando...' : 'Gerar link de convite'}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex-1 px-3 py-2 rounded-lg bg-[#1E2329] border border-[#2a2724] text-xs text-gray-400 truncate"
        aria-label="Link de convite gerado"
      >
        {data.inviteUrl}
      </div>
      <button
        onClick={handleCopy}
        className="flex-shrink-0 p-2 rounded-lg bg-[#1a1816] border border-[#2a2724] text-gray-400 hover:text-[#EAECEF] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B] min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label={copied ? 'Link copiado!' : 'Copiar link de convite'}
      >
        {copied
          ? <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          : <Copy className="h-4 w-4" aria-hidden="true" />
        }
      </button>
      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {copied ? 'Link copiado!' : ''}
      </span>
    </div>
  )
}
