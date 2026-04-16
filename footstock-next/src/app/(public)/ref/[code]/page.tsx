// ============================================================================
// FootStock — Página de Landing de Referral /ref/[code]
// Captura o código de afiliado, salva em cookie (fs_ref) e redireciona para
// o cadastro com ?ref=CODE já preenchido no Step1.
// ============================================================================

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

interface Props {
  params: Promise<{ code: string }>
}

export default async function ReferralLandingPage({ params }: Props) {
  const { code } = await params
  const normalizedCode = code.toUpperCase()

  // Validar se o código existe e está ativo
  const affiliateCode = await prisma.affiliateCode.findFirst({
    where: { code: normalizedCode, active: true },
    select: { code: true },
  })

  if (!affiliateCode) {
    // Código inválido: redireciona para cadastro sem pré-preenchimento
    redirect('/cadastro')
  }

  // Salvar cookie válido por 30 dias — capturado pelo Step1PersonalData.tsx
  const cookieStore = await cookies()
  cookieStore.set('fs_ref', normalizedCode, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 dias
    httpOnly: false, // precisa ser lido pelo JS client
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })

  // Redirecionar para cadastro com ref como query param (fallback duplo)
  redirect(`/cadastro?ref=${normalizedCode}`)
}

// Gerar metadata dinâmica para SEO do link compartilhado
export async function generateMetadata({ params }: Props) {
  const { code } = await params
  return {
    title: 'Você foi convidado para o FootStock!',
    description: `Use o código ${code.toUpperCase()} no cadastro e comece a simular investimentos em clubes de futebol.`,
    openGraph: {
      title: 'Você foi convidado para o FootStock!',
      description: 'A plataforma de simulação de investimentos em futebol. Cadastre-se agora!',
    },
  }
}
