import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ResetPasswordContent } from './ResetPasswordContent'

export const metadata: Metadata = {
  title: 'Redefinir Senha | Foot Stock',
  robots: { index: false, follow: false },
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[200px] text-text-secondary">Carregando...</div>}>
      <ResetPasswordContent />
    </Suspense>
  )
}
