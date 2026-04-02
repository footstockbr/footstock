'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { RegisterWizard } from '@/components/auth/register/RegisterWizard'
import { ROUTES } from '@/lib/constants/routes'

export default function RegisterPage() {
  return (
    <div className="w-full py-8">
      <div className="w-full max-w-md mx-auto px-4 mb-4">
        <Link
          href={ROUTES.LOGIN}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          <span>Já tenho conta</span>
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-text-primary text-center mb-6">
        Criar conta
      </h1>
      <RegisterWizard />
    </div>
  )
}
