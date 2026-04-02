'use client'

import { useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const ENABLE_EMBLEM_UPLOAD = process.env.NEXT_PUBLIC_ENABLE_EMBLEM_UPLOAD === 'true'

interface Props {
  onSelect: (file: File | null) => void
}

/**
 * Emblem upload input — only rendered when NEXT_PUBLIC_ENABLE_EMBLEM_UPLOAD=true.
 * Returns null silently if the feature flag is off.
 */
export function UploadEmblem({ onSelect }: Props) {
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  if (!ENABLE_EMBLEM_UPLOAD) return null

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Selecione uma imagem (PNG, JPG ou WebP).')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 2 MB.')
      return
    }

    const url = URL.createObjectURL(file)
    setPreview(url)
    onSelect(file)
  }

  function handleRemove() {
    setPreview(null)
    onSelect(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      <p className="text-sm font-medium text-gray-300 mb-2">Emblema da liga (opcional)</p>

      {preview ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Pré-visualização do emblema"
            className="w-16 h-16 rounded-full object-cover border border-[#2a2724]"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B] rounded"
            aria-label="Remover emblema"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Remover
          </button>
        </div>
      ) : (
        <label
          className={cn(
            'flex flex-col items-center justify-center gap-2',
            'h-24 rounded-xl border-2 border-dashed border-[#2a2724]',
            'text-gray-500 cursor-pointer hover:border-[#F0B90B]/40 hover:text-gray-400 transition-colors',
            'focus-within:ring-2 focus-within:ring-[#F0B90B]'
          )}
          aria-label="Selecionar emblema da liga"
        >
          <ImagePlus className="h-6 w-6" aria-hidden="true" />
          <span className="text-xs">Clique para selecionar</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={handleChange}
            aria-label="Arquivo de imagem do emblema"
          />
        </label>
      )}

      {error && (
        <p role="alert" className="mt-1.5 text-xs text-red-400">{error}</p>
      )}
    </div>
  )
}
