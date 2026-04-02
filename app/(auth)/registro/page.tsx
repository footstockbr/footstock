'use client'

import { RegisterWizard } from '@/components/auth/register/RegisterWizard'

export default function RegisterPage() {
  return (
    <div className="w-full py-8">
      <h1 className="text-2xl font-bold text-text-primary text-center mb-6">
        Criar conta
      </h1>
      <RegisterWizard />
    </div>
  )
}
