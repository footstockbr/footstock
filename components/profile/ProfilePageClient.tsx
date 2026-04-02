'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Lock, LogOut, ShieldCheck, Trash2, TrendingUp } from 'lucide-react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useToast } from '@/hooks/useToast'
import { PLAN_LABELS, INVESTOR_PROFILE_LABELS, ADMIN_ROLE_LABELS } from '@/lib/constants/labels'
import { PLAN_PROFILE_SUMMARY } from '@/lib/constants/plan-profile'
import { ROUTES } from '@/lib/constants/routes'
import { MESSAGES } from '@/lib/constants/messages'
import { apiClient } from '@/lib/api/client'
import { signOut } from '@/lib/auth'
import { changePasswordSchema, type ChangePasswordInput } from '@/lib/schemas/auth.schema'
import { Input } from '@/components/ui/Input'
import { Btn } from '@/components/ui/Btn'
import { ToastContainer } from '@/components/ui/Toast'

export function ProfilePageClient() {
  const { data: user, isLoading, isError } = useCurrentUser()
  const { toasts, toast, removeToast } = useToast()
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'deleting'>('idle')
  const [bioEdit, setBioEdit] = useState(false)
  const [bioValue, setBioValue] = useState('')
  const [bioSaving, setBioSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  async function onChangePassword(data: ChangePasswordInput) {
    try {
      const response = await apiClient.patch('/api/v1/users/me/password', data)
      const message =
        (
          response as {
            data?: { data?: { message?: string } }
          }
        )?.data?.data?.message ?? MESSAGES.PROFILE.PASSWORD_CHANGED

      toast.success(message)
      reset()
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message ?? MESSAGES.PROFILE.UPDATE_FAILED
      toast.error(message)
    }
  }

  async function handleDeleteAccount() {
    if (deleteStep === 'idle') {
      setDeleteStep('confirm')
      return
    }
    setDeleteStep('deleting')
    try {
      await apiClient.delete('/api/v1/users/me')
      await signOut()
      router.push('/')
    } catch (error: unknown) {
      const code = (error as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code
      if (code === 'SUB_ACTIVE') {
        toast.error(MESSAGES.PROFILE.ACCOUNT_DELETE_SUBSCRIPTION_ERROR)
      } else {
        toast.error(MESSAGES.PROFILE.ACCOUNT_DELETE_ERROR)
      }
      setDeleteStep('idle')
    }
  }

  async function handleSaveBio() {
    setBioSaving(true)
    try {
      const res = await apiClient.patch('/api/v1/users/me', { bio: bioValue })
      if (res) {
        toast.success(MESSAGES.PROFILE.BIO_UPDATED)
        setBioEdit(false)
      }
    } catch {
      toast.error(MESSAGES.PROFILE.BIO_UPDATE_ERROR)
    } finally {
      setBioSaving(false)
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast.error(MESSAGES.PROFILE.AVATAR_SIZE_ERROR)
      return
    }
    setAvatarUploading(true)
    try {
      const formData = new FormData()
      formData.append('avatar', file)
      const res = await fetch('/api/v1/users/me/avatar', { method: 'POST', body: formData })
      if (res.ok) {
        toast.success(MESSAGES.PROFILE.AVATAR_UPDATED)
        router.refresh()
      } else {
        toast.error(MESSAGES.PROFILE.AVATAR_UPLOAD_ERROR)
      }
    } catch {
      toast.error(MESSAGES.PROFILE.AVATAR_UPLOAD_GENERIC_ERROR)
    } finally {
      setAvatarUploading(false)
    }
  }

  async function handleLogout() {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      await signOut()
    } catch {
      setIsLoggingOut(false)
      toast.error(MESSAGES.PROFILE.LOGOUT_ERROR)
    }
  }

  if (isLoading) {
    return (
      <section className="rounded-xl border border-border-default bg-bg-card p-4">
        <h1 className="text-lg font-semibold text-text-primary">Perfil</h1>
        <p className="mt-2 text-sm text-text-secondary">Carregando dados da conta...</p>
      </section>
    )
  }

  if (isError || !user) {
    return (
      <section className="rounded-xl border border-border-default bg-bg-card p-4">
        <h1 className="text-lg font-semibold text-text-primary">Perfil</h1>
        <p className="mt-2 text-sm text-red-400">
          Não foi possível carregar seus dados agora. Tente novamente em instantes.
        </p>
      </section>
    )
  }

  const isAdminAccount = Boolean(user.adminRole)
  const planSummary = PLAN_PROFILE_SUMMARY[user.planType]

  return (
    <section className="rounded-xl border border-border-default bg-bg-card p-4 space-y-5">
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={isLoggingOut}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-border-default bg-bg-elevated px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {isLoggingOut ? 'Saindo...' : 'Sair'}
        </button>
      </div>

      <div>
        <h1 className="text-lg font-semibold text-text-primary">Perfil</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Dados da conta, plano atual e governança de assinatura conforme o Foot Stock.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="rounded-lg border border-border-default bg-bg-elevated p-3">
          <p className="text-xs uppercase tracking-wide text-text-muted">Nome</p>
          <p className="mt-1 text-sm font-medium text-text-primary">{user.name}</p>
        </div>
        <div className="rounded-lg border border-border-default bg-bg-elevated p-3">
          <p className="text-xs uppercase tracking-wide text-text-muted">E-mail</p>
          <p className="mt-1 text-sm font-medium text-text-primary">{user.email}</p>
        </div>
        <div className="rounded-lg border border-border-default bg-bg-elevated p-3">
          <p className="text-xs uppercase tracking-wide text-text-muted">Clube favorito</p>
          <p className="mt-1 text-sm font-medium text-text-primary">{user.favoriteClub ?? 'Não definido'}</p>
          <p className="mt-1 text-xs text-text-secondary">
            No produto, troca de clube favorito é feita apenas via suporte.
          </p>
        </div>
        <div className="rounded-lg border border-border-default bg-bg-elevated p-3">
          <p className="text-xs uppercase tracking-wide text-text-muted">Perfil de investidor</p>
          <p className="mt-1 text-sm font-medium text-text-primary">
            {INVESTOR_PROFILE_LABELS[user.investorProfile]}
          </p>
        </div>

        {/* Avatar */}
        <div className="rounded-lg border border-border-default bg-bg-elevated p-3">
          <p className="text-xs uppercase tracking-wide text-text-muted">Avatar</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-bg-card border border-border-default flex items-center justify-center overflow-hidden shrink-0">
              {(user as { avatarUrl?: string }).avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={(user as { avatarUrl?: string }).avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-lg font-bold text-text-secondary">{user.name?.[0]?.toUpperCase() ?? '?'}</span>
              )}
            </div>
            <label className="cursor-pointer">
              <span className="inline-flex items-center gap-1 rounded-md border border-border-default px-3 py-2 text-xs text-text-primary hover:border-accent hover:text-accent transition-colors">
                {avatarUploading ? 'Enviando...' : 'Trocar foto'}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={avatarUploading}
                onChange={(e) => void handleAvatarChange(e)}
              />
            </label>
            <p className="text-xs text-text-secondary">JPG, PNG ou WebP — máx 2 MB</p>
          </div>
        </div>

        {/* Bio */}
        <div className="rounded-lg border border-border-default bg-bg-elevated p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-text-muted">Bio</p>
            {!bioEdit && (
              <button
                onClick={() => { setBioValue((user as { bio?: string }).bio ?? ''); setBioEdit(true) }}
                className="text-xs text-accent hover:underline"
              >
                Editar
              </button>
            )}
          </div>
          {bioEdit ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={bioValue}
                onChange={(e) => setBioValue(e.target.value)}
                maxLength={200}
                rows={3}
                className="w-full rounded-md border border-border-default bg-bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                placeholder="Escreva uma bio curta..."
              />
              <p className="text-xs text-text-secondary text-right">{bioValue.length}/200</p>
              <div className="flex gap-2">
                <Btn type="button" isLoading={bioSaving} onClick={() => void handleSaveBio()} className="text-xs py-1.5 px-3">
                  Salvar
                </Btn>
                <button onClick={() => setBioEdit(false)} className="text-xs text-text-secondary hover:text-text-primary">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-text-primary">
              {(user as { bio?: string }).bio || <span className="text-text-secondary italic">Sem bio definida.</span>}
            </p>
          )}
        </div>
      </div>

      {isAdminAccount ? (
        <div className="rounded-lg border border-accent/40 bg-accent/10 p-3">
          <p className="text-xs uppercase tracking-wide text-text-muted">Conta administrativa</p>
          <p className="mt-1 text-sm font-semibold text-text-primary">
            {ADMIN_ROLE_LABELS[user.adminRole as keyof typeof ADMIN_ROLE_LABELS]}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            Esta conta pertence ao painel administrativo. Plano de assinatura não se aplica.
          </p>
          <div className="mt-3">
            <Link
              href={ROUTES.ADMIN}
              className="inline-flex items-center gap-1 rounded-md border border-accent px-3 py-2 text-sm font-medium text-accent hover:bg-accent/10 transition-colors"
            >
              Ir para painel admin
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-accent/40 bg-accent/10 p-3">
            <p className="text-xs uppercase tracking-wide text-text-muted">Plano atual</p>
            <p className="mt-1 text-sm font-semibold text-text-primary">{PLAN_LABELS[user.planType]}</p>
            <p className="mt-1 text-xs text-text-secondary">
              Upgrade libera recursos imediatamente. O bônus de FS$ é creditado após 7 dias.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={ROUTES.PLANOS}
                className="inline-flex items-center gap-1 rounded-md border border-accent px-3 py-2 text-sm font-medium text-accent hover:bg-accent/10 transition-colors"
              >
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
                Ver planos
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-border-default bg-bg-elevated p-3">
            <p className="text-xs uppercase tracking-wide text-text-muted">Recursos do seu plano</p>
            <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-text-primary sm:grid-cols-2">
              <p>Saldo inicial: {planSummary.initialBalanceLabel}</p>
              <p>Delay de cotação: {planSummary.quoteDelayLabel}</p>
              <p>Limite diário: {planSummary.dailyOrderLimitLabel}</p>
              <p>Tipos de ordem: {planSummary.orderTypesLabel}</p>
              <p>Assessor IA: {planSummary.aiAdvisorLabel}</p>
              <p>Ligas: {planSummary.leaguesLabel}</p>
              <p>Indicadores: {planSummary.technicalIndicatorsLabel}</p>
              <p>Comparação de ativos: {planSummary.comparisonModeLabel}</p>
              <p className="sm:col-span-2">Trading avançado: {planSummary.shortAndLeverageLabel}</p>
            </div>
          </div>
        </>
      )}

      <div className="rounded-lg border border-border-default bg-bg-elevated p-3">
        <p className="text-xs uppercase tracking-wide text-text-muted">Privacidade e LGPD</p>
        <p className="mt-1 text-xs text-text-secondary">
          Você pode gerenciar sua assinatura, consultar a política de privacidade ou solicitar a exclusão permanente dos seus dados conforme a LGPD (Art. 18).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={ROUTES.PRIVACY}
            className="inline-flex items-center gap-1 rounded-md border border-border-default px-3 py-2 text-sm text-text-primary hover:border-accent hover:text-accent transition-colors"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Política de privacidade
          </Link>
          {!isAdminAccount && (
            <Link
              href={ROUTES.PLANOS}
              className="inline-flex items-center gap-1 rounded-md border border-border-default px-3 py-2 text-sm text-text-primary hover:border-accent hover:text-accent transition-colors"
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
              Gerir assinatura
            </Link>
          )}
        </div>
      </div>

      {!isAdminAccount && (
        <div className="rounded-lg border border-red-800/40 bg-bg-elevated p-3">
          <p className="text-xs uppercase tracking-wide text-red-400">Zona de perigo</p>
          <p className="mt-1 text-xs text-text-secondary">
            A exclusão de conta é permanente e irreversível. Seus dados pessoais serão anonimizados conforme a LGPD. Registros financeiros são mantidos por obrigação legal (5 anos).
          </p>
          {deleteStep === 'confirm' && (
            <p className="mt-2 text-xs font-medium text-red-400">
              Tem certeza? Esta acao nao pode ser desfeita. Se tiver assinatura ativa, cancele-a primeiro em &quot;Gerir assinatura&quot;.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {deleteStep !== 'confirm' ? (
              <button
                type="button"
                onClick={handleDeleteAccount}
                className="inline-flex items-center gap-1 rounded-md border border-red-800/60 px-3 py-2 text-sm text-red-400 hover:border-red-500 hover:text-red-300 transition-colors"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Excluir minha conta
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={(deleteStep as string) === 'deleting'}
                  className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  {(deleteStep as string) === 'deleting' ? 'Excluindo...' : 'Confirmar exclusao'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteStep('idle')}
                  className="inline-flex items-center gap-1 rounded-md border border-border-default px-3 py-2 text-sm text-text-primary hover:border-accent transition-colors"
                >
                  Cancelar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border-default bg-bg-elevated p-3">
        <p className="text-xs uppercase tracking-wide text-text-muted">Segurança</p>
        <p className="mt-1 text-xs text-text-secondary">
          Altere sua senha para manter sua conta protegida.
        </p>

        <form className="mt-3 space-y-3" onSubmit={handleSubmit(onChangePassword)} noValidate>
          <Input
            label="Senha atual"
            type="password"
            autoComplete="current-password"
            error={errors.currentPassword?.message}
            {...register('currentPassword')}
          />

          <Input
            label="Nova senha"
            type="password"
            autoComplete="new-password"
            hint="Mínimo de 8 caracteres, com maiúscula, minúscula, número e símbolo."
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />

          <Input
            label="Confirmar nova senha"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          <Btn type="submit" isLoading={isSubmitting} className="w-full sm:w-auto">
            Salvar nova senha
          </Btn>
        </form>
      </div>

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </section>
  )
}
