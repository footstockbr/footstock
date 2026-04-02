import type { Metadata } from 'next'
import { Newspaper, PlusCircle } from 'lucide-react'
import Link from 'next/link'
import { NewsManager } from '@/components/admin/NewsManager'

export const metadata: Metadata = {
  title: 'Gestão de Notícias | Admin | Foot Stock',
  description: 'Gestão editorial de notícias do Foot Stock',
}

export default function AdminNoticiasPage() {
  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#EAECEF] flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-[#F0B90B]" />
            Gestão de Notícias
          </h1>
          <p className="text-sm text-[#929AA5] mt-0.5">Publicar, arquivar e editar notícias classificadas pelo motor</p>
        </div>
        <Link
          href="/admin/motor"
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[rgba(240,185,11,.12)] border border-[rgba(240,185,11,.25)] text-sm font-medium text-[#F0B90B] hover:bg-[rgba(240,185,11,.2)] transition-colors min-h-[44px]"
        >
          <PlusCircle className="h-4 w-4" />
          Injetar Notícia
        </Link>
      </div>

      <NewsManager />
    </div>
  )
}
