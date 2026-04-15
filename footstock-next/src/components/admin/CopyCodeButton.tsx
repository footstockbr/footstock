'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export function CopyCodeButton({ code, testid }: { code: string; testid?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      const el = document.createElement('textarea')
      el.value = code
      el.style.position = 'fixed'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      data-testid={testid ?? `copy-code-${code}`}
      onClick={handleCopy}
      title={copied ? 'Copiado!' : `Copiar ${code}`}
      className="text-[#707A8A] hover:text-[#929AA5] transition-colors"
    >
      {copied
        ? <Check className="h-3 w-3 text-[#2EBD85]" />
        : <Copy className="h-3 w-3" />}
    </button>
  )
}
