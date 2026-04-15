'use client'

// ============================================================================
// Foot Stock — AffiliatePortalClient
// Portal completo do afiliado: métricas, histórico de transações, link copiável,
// formulário de dados bancários.
// Rastreabilidade: T-001 (Gap 6), US-036, US-037
// ============================================================================

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Copy, Check, Users, TrendingUp, DollarSign, Clock, Building2 } from 'lucide-react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { EligibleAffiliateType } from '@/lib/auth/affiliate-auth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/components/ui/stat-card'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AffiliateMetrics {
  affiliateCode: string
  referralLink: string
  totalSignups: number
  paidConversions: number
  totalCommissionFS: number
  commissionPct: number
  conversions: Array<{
    date: string
    planType: string
    commissionFS: number
    status: string
  }>
}

interface PaginatedResponse {
  success: boolean
  data: AffiliateMetrics
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
    hasNextPage: boolean
  }
}

interface BankData {
  banco: string
  agencia: string
  conta: string
  pixKey: string
  cpfCnpj: string
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const bankSchema = z.object({
  banco:    z.string().min(1, 'Banco obrigatório'),
  agencia:  z.string().regex(/^\d{1,6}-?\d?$/, 'Agência inválida (ex: 0001 ou 0001-4)'),
  conta:    z.string().regex(/^\d{1,12}-?\d?$/, 'Conta inválida'),
  pixKey:   z.string().min(1, 'Chave PIX obrigatória'),
  cpfCnpj:  z.string().min(11, 'CPF/CNPJ inválido').max(18, 'CPF/CNPJ inválido'),
})

type BankFormData = z.infer<typeof bankSchema>

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  PENDING:    'Pendente',
  PROCESSING: 'Processando',
  PAID:       'Pago',
  VOIDED:     'Anulado',
}

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  PENDING:    'default',
  PROCESSING: 'warning',
  PAID:       'success',
  VOIDED:     'error',
}

async function fetchMetrics(page: number): Promise<PaginatedResponse> {
  const res = await fetch(`/api/v1/affiliate/me?page=${page}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Erro ao carregar dados')
  return res.json()
}

async function fetchBankData(): Promise<{ data: BankData | null }> {
  const res = await fetch('/api/v1/affiliate/me/bank', { credentials: 'include' })
  if (!res.ok) throw new Error('Erro ao carregar dados bancários')
  return res.json()
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  affiliateCode: string
  affiliateType: EligibleAffiliateType
  commissionPercentage: number
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function AffiliatePortalClient({ affiliateCode, affiliateType, commissionPercentage }: Props) {
  const [page, setPage] = useState(1)
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [showBankForm, setShowBankForm] = useState(false)
  const queryClient = useQueryClient()

  const referralLink = `https://footstock.app/ref/${affiliateCode.toLowerCase()}`

  // ── Métricas + histórico ──────────────────────────────────────────────────
  const {
    data: metricsRes,
    isLoading: metricsLoading,
    isError: metricsError,
    refetch: refetchMetrics,
  } = useQuery<PaginatedResponse>({
    queryKey: ['affiliate-portal', page],
    queryFn: () => fetchMetrics(page),
    staleTime: 60_000,
  })

  // ── Dados bancários ───────────────────────────────────────────────────────
  const {
    data: bankRes,
    isLoading: bankLoading,
    refetch: refetchBank,
  } = useQuery<{ data: BankData | null }>({
    queryKey: ['affiliate-bank'],
    queryFn: fetchBankData,
    staleTime: 120_000,
  })

  // ── Salvar dados bancários ────────────────────────────────────────────────
  const bankMutation = useMutation({
    mutationFn: async (data: BankFormData) => {
      const res = await fetch('/api/v1/affiliate/me/bank', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error?.message ?? 'Erro ao salvar dados bancários')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Dados bancários salvos com sucesso!')
      setShowBankForm(false)
      queryClient.invalidateQueries({ queryKey: ['affiliate-bank'] })
      refetchBank()
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const bankForm = useForm<BankFormData>({
    resolver: zodResolver(bankSchema),
    defaultValues: { banco: '', agencia: '', conta: '', pixKey: '', cpfCnpj: '' },
  })

  // Quando showBankForm abre e há dados existentes, popular apenas campos não-mascarados.
  // conta e cpfCnpj são retornados mascarados pela API — não pré-preencher para evitar
  // sobrescrever os dados reais com o valor mascarado ao salvar.
  useEffect(() => {
    if (showBankForm && bankRes?.data) {
      bankForm.reset({
        banco:   bankRes.data.banco   ?? '',
        agencia: bankRes.data.agencia ?? '',
        conta:   '',   // mascarado — usuário deve redigitar
        pixKey:  bankRes.data.pixKey  ?? '',
        cpfCnpj: '',   // mascarado — usuário deve redigitar
      })
    }
    if (!showBankForm) {
      bankForm.reset({ banco: '', agencia: '', conta: '', pixKey: '', cpfCnpj: '' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBankForm])

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleCopyCode() {
    await navigator.clipboard.writeText(affiliateCode)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(referralLink)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const metrics = metricsRes?.data
  const pagination = metricsRes?.pagination

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      {/* Tipo de afiliado */}
      <div className="flex items-center gap-2">
        <Badge variant={affiliateType === 'TIME_PARCEIRO' ? 'craque' : 'lenda'}>
          {affiliateType === 'TIME_PARCEIRO' ? 'Time Parceiro' : 'Influenciador'}
        </Badge>
        <span className="text-xs text-[#7D8694]">
          Comissão: {(commissionPercentage * 100).toFixed(0)}% por conversão
        </span>
      </div>

      {/* Link de indicação */}
      <div className="bg-[#1A2027] border border-[#2C3740] rounded-lg p-4 flex flex-col gap-3">
        <p className="text-xs text-[#7D8694] font-medium uppercase tracking-wide">Seu link de indicação</p>
        <div className="flex items-center gap-2">
          <code className="text-xs text-[#EAECEF] flex-1 truncate font-mono bg-[#0E1217] px-2 py-1 rounded">
            {referralLink}
          </code>
          <button
            onClick={handleCopyLink}
            aria-label="Copiar link de indicação"
            className="text-[#7D8694] hover:text-[#EAECEF] transition-colors"
          >
            {copiedLink ? <Check size={16} className="text-[#2EBD85]" /> : <Copy size={16} />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#7D8694]">Código:</span>
          <code className="text-xs text-[#F0B90B] font-mono">{affiliateCode}</code>
          <button
            onClick={handleCopyCode}
            aria-label="Copiar código de afiliado"
            className="text-[#7D8694] hover:text-[#EAECEF] transition-colors"
          >
            {copiedCode ? <Check size={14} className="text-[#2EBD85]" /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      {/* Métricas */}
      {metricsLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : metricsError ? (
        <div role="alert" className="text-center py-6 flex flex-col gap-2">
          <p className="text-sm text-[#F6465D]">Erro ao carregar métricas</p>
          <Button variant="outline" size="sm" onClick={() => refetchMetrics()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label={<span className="flex items-center gap-1"><Users size={12} />Cadastros</span>}
            value={String(metrics?.totalSignups ?? 0)}
            subValue="via link"
          />
          <StatCard
            label={<span className="flex items-center gap-1"><TrendingUp size={12} />Conversões</span>}
            value={String(metrics?.paidConversions ?? 0)}
            subValue="assinantes ativos"
            subValueColor="positive"
          />
          <StatCard
            label={<span className="flex items-center gap-1"><DollarSign size={12} />Total ganho</span>}
            value={`FS$${(metrics?.totalCommissionFS ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
            subValueColor="positive"
          />
          <StatCard
            label={<span className="flex items-center gap-1"><Clock size={12} />Comissão</span>}
            value={`${(commissionPercentage * 100).toFixed(0)}%`}
            subValue="por conversão"
          />
        </div>
      )}

      {/* Dados bancários */}
      <div className="bg-[#1A2027] border border-[#2C3740] rounded-lg p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-[#7D8694] font-medium uppercase tracking-wide flex items-center gap-1">
            <Building2 size={12} />
            Dados para repasse
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowBankForm(!showBankForm)}
            className="text-xs"
          >
            {showBankForm ? 'Cancelar' : bankRes?.data ? 'Editar' : 'Cadastrar'}
          </Button>
        </div>

        {/* Estado: sem dados bancários */}
        {!bankLoading && !bankRes?.data && !showBankForm && (
          <p className="text-xs text-[#F6465D]">
            Cadastre seus dados bancários para receber repasses.
          </p>
        )}

        {/* Estado: dados mascarados */}
        {!bankLoading && bankRes?.data && !showBankForm && (
          <div className="flex flex-col gap-1 text-xs text-[#7D8694]">
            <span>Banco: {bankRes.data.banco}</span>
            <span>Agência: {bankRes.data.agencia}</span>
            <span>Conta: {bankRes.data.conta}</span>
            <span>PIX: {bankRes.data.pixKey}</span>
          </div>
        )}

        {bankLoading && <Skeleton className="h-10 rounded" />}

        {/* Formulário */}
        {showBankForm && (
          <form
            onSubmit={bankForm.handleSubmit((data) => bankMutation.mutate(data))}
            className="flex flex-col gap-3 mt-1"
            noValidate
          >
            {(
              [
                { name: 'banco',    label: 'Banco',       placeholder: 'Nubank, Itaú...' },
                { name: 'agencia',  label: 'Agência',     placeholder: '0001' },
                { name: 'conta',    label: 'Conta',       placeholder: '12345-6' },
                { name: 'pixKey',   label: 'Chave PIX',   placeholder: 'CPF, e-mail ou telefone' },
                { name: 'cpfCnpj',  label: 'CPF/CNPJ',    placeholder: 'Seu CPF ou CNPJ' },
              ] as const
            ).map(({ name, label, placeholder }) => (
              <div key={name} className="flex flex-col gap-1">
                <label htmlFor={`bank-${name}`} className="text-xs text-[#7D8694]">
                  {label}
                </label>
                <input
                  id={`bank-${name}`}
                  {...bankForm.register(name)}
                  placeholder={placeholder}
                  aria-invalid={!!bankForm.formState.errors[name]}
                  aria-describedby={bankForm.formState.errors[name] ? `bank-${name}-err` : undefined}
                  className="bg-[#0E1217] border border-[#2C3740] rounded px-3 py-2 text-xs text-[#EAECEF] placeholder-[#4A5568] focus:outline-none focus:border-[#4CAF50] aria-[invalid=true]:border-[#F6465D]"
                />
                {bankForm.formState.errors[name] && (
                  <p id={`bank-${name}-err`} className="text-xs text-[#F6465D]">
                    {bankForm.formState.errors[name]?.message}
                  </p>
                )}
              </div>
            ))}

            <Button
              type="submit"
              disabled={bankMutation.isPending}
              className="w-full"
              size="sm"
            >
              {bankMutation.isPending ? 'Salvando...' : 'Salvar dados bancários'}
            </Button>
          </form>
        )}
      </div>

      {/* Histórico de transações */}
      <div className="flex flex-col gap-3">
        <p className="text-xs text-[#7D8694] font-medium uppercase tracking-wide">
          Histórico de comissões
        </p>

        {metricsLoading && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        )}

        {!metricsLoading && (!metrics?.conversions || metrics.conversions.length === 0) && (
          <div className="text-center py-6">
            <p className="text-sm text-[#7D8694]">Nenhuma comissão ainda</p>
            <p className="text-xs text-[#4A5568] mt-1">
              Compartilhe seu link para começar a ganhar.
            </p>
          </div>
        )}

        {metrics?.conversions?.map((conv, idx) => (
          <div
            key={idx}
            role="listitem"
            className="bg-[#1A2027] border border-[#2C3740] rounded-lg px-4 py-3 flex items-center justify-between"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-[#EAECEF]">
                {new Date(conv.date).toLocaleDateString('pt-BR')}
              </span>
              <span className="text-xs text-[#7D8694]">
                Plano {conv.planType}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#2EBD85]">
                +FS${Number(conv.commissionFS).toFixed(0)}
              </span>
              <Badge variant={(STATUS_VARIANT[conv.status] ?? 'default') as Parameters<typeof Badge>[0]['variant']}>
                {STATUS_LABEL[conv.status] ?? conv.status}
              </Badge>
            </div>
          </div>
        ))}

        {/* Paginação */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between pt-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Página anterior"
            >
              Anterior
            </Button>
            <span className="text-xs text-[#7D8694]">
              {page} / {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasNextPage}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Próxima página"
            >
              Próxima
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
