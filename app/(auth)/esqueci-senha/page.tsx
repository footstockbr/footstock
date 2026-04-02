import type { Metadata } from 'next'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'

export const metadata: Metadata = {
  title: 'Recuperar Senha | Foot Stock',
  robots: { index: false, follow: false },
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />
}
