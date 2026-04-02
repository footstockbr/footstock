'use client'

import { useSearchParams } from 'next/navigation'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'

export function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const token = searchParams?.get('token') ?? null

  return <ResetPasswordForm token={token} />
}
