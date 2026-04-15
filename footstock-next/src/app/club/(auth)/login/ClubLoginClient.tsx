// ============================================================================
// Foot Stock — ClubLoginClient — Client component for club partner login
// Extracted from page.tsx to allow useSearchParams inside Suspense boundary.
// Rastreabilidade: FDD painel-admin §2.12, MILESTONE-9 TASK-1/ST001-ST002
// ============================================================================

'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Trophy, Lock, Mail } from 'lucide-react'

export default function ClubLoginClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const errorParam = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(
    errorParam === 'unauthorized' ? 'Acesso não autorizado para este portal.' : null
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErrorMsg(null)

    try {
      const res = await fetch('/api/v1/club/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data?.error?.message ?? 'Credenciais inválidas. Verifique seu e-mail e senha.')
        return
      }

      // Login bem-sucedido — redirecionar para dashboard do clube
      router.push('/club')
      router.refresh()
    } catch {
      setErrorMsg('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#0B0E11] px-4">
      <div className="w-full max-w-sm">
        {/* Logo / marca */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[rgba(240,185,11,.12)] border border-[rgba(240,185,11,.25)] flex items-center justify-center mb-4">
            <Trophy className="h-8 w-8 text-[#F0B90B]" />
          </div>
          <h1 className="text-xl font-bold text-[#EAECEF]">Portal do Clube Parceiro</h1>
          <p className="text-sm text-[#929AA5] mt-1 text-center">
            Acesso exclusivo para representantes institucionais
          </p>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* E-mail */}
          <div>
            <label htmlFor="email" className="block text-xs text-[#929AA5] mb-1.5">
              E-mail institucional
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#929AA5]" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="clube@footstock.com"
                className="w-full bg-[#1E2329] border border-[#2B3139] rounded-lg pl-9 pr-4 py-3 text-sm text-[#EAECEF] placeholder-[#4B5563] focus:outline-none focus:border-[#F0B90B] transition-colors"
              />
            </div>
          </div>

          {/* Senha */}
          <div>
            <label htmlFor="password" className="block text-xs text-[#929AA5] mb-1.5">
              Senha
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#929AA5]" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full bg-[#1E2329] border border-[#2B3139] rounded-lg pl-9 pr-4 py-3 text-sm text-[#EAECEF] placeholder-[#4B5563] focus:outline-none focus:border-[#F0B90B] transition-colors"
              />
            </div>
          </div>

          {/* Esqueceu a senha */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                if (!email) {
                  setErrorMsg('Informe seu e-mail institucional para redefinir a senha.')
                  return
                }
                setLoading(true)
                setErrorMsg(null)
                fetch('/api/v1/club/auth/forgot-password', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email }),
                })
                  .then((res) => res.json())
                  .then((data) => {
                    if (data?.success) {
                      setErrorMsg(null)
                      alert('Se o e-mail estiver cadastrado, você receberá instruções para redefinir sua senha.')
                    } else {
                      setErrorMsg(data?.error?.message ?? 'Erro ao solicitar redefinição de senha.')
                    }
                  })
                  .catch(() => setErrorMsg('Erro de conexão. Tente novamente.'))
                  .finally(() => setLoading(false))
              }}
              className="text-xs text-[#929AA5] hover:text-[#F0B90B] transition-colors"
            >
              Esqueceu a senha?
            </button>
          </div>

          {/* Mensagem de erro */}
          {errorMsg && (
            <div className="p-3 rounded-lg bg-[rgba(246,70,93,.1)] border border-[rgba(246,70,93,.25)] text-xs text-[#F6465D]">
              {errorMsg}
            </div>
          )}

          {/* Botão de submit */}
          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full py-3 rounded-lg bg-[#F0B90B] hover:bg-[#d4a20a] text-[#0B0E11] font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Entrando...' : 'Entrar no Portal'}
          </button>
        </form>

        {/* Informação de acesso */}
        <p className="mt-6 text-center text-xs text-[#4B5563]">
          Acesso concedido apenas pelo administrador do Foot Stock.
          <br />
          Em caso de dúvidas, entre em contato com o suporte.
        </p>

        {/* Separação visual do app principal */}
        <div className="mt-8 pt-6 border-t border-[#1E2329] text-center">
          <p className="text-xs text-[#4B5563]">
            Esta é a área exclusiva de clubes parceiros.{' '}
            <a href="/login" className="text-[#929AA5] hover:text-[#F0B90B] transition-colors">
              Acessar o app
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
