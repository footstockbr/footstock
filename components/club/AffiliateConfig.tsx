'use client'
// ============================================================================
// Foot Stock — AffiliateConfig
// Formulário de dados bancários do clube para repasse de royalties.
// CPF/CNPJ validado via dígito verificador. Dados criptografados em repouso.
// Rastreabilidade: INT-084, US-036, TASK-2/ST005
// ============================================================================

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Btn } from '@/components/ui/Btn'
import { ToastContainer } from '@/components/ui/Toast'
import { useToast } from '@/hooks/useToast'
import { MESSAGES } from '@/lib/constants/messages'

import { validateCpfCnpj } from '@/lib/utils/validate-document'

// ---------------------------------------------------------------------------
// Schema Zod
// ---------------------------------------------------------------------------

const affiliateBankSchema = z.object({
  banco: z.string().min(1, 'Banco obrigatório'),
  agencia: z.string().regex(/^\d{1,6}-?\d?$/, 'Agência inválida'),
  conta: z.string().regex(/^\d{1,12}-?\d?$/, 'Conta inválida'),
  pixKey: z.string().min(1, 'Chave PIX obrigatória'),
  cpfCnpj: z.string().refine(validateCpfCnpj, 'CPF/CNPJ inválido'),
})

type AffiliateBankForm = z.infer<typeof affiliateBankSchema>

interface AffiliateBankData {
  banco: string
  agencia: string
  conta: string   // mascarado: ****1234
  pixKey: string
  cpfCnpj: string    // mascarado
}

interface AffiliateConfigProps {
  clubId: string
  initialData?: AffiliateBankData | null
}

export function AffiliateConfig({ clubId: _clubId, initialData }: AffiliateConfigProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toasts, toast, removeToast } = useToast()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AffiliateBankForm>({
    resolver: zodResolver(affiliateBankSchema),
    defaultValues: {
      banco: initialData?.banco ?? '',
      agencia: initialData?.agencia ?? '',
      pixKey: initialData?.pixKey ?? '',
    },
  })

  const onSubmit = async (data: AffiliateBankForm) => {
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/v1/club/affiliate/bank`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const err = await res.json() as { error?: { message?: string } }
        toast.error('Erro', err.error?.message ?? MESSAGES.AFFILIATE.BANK_SAVE_ERROR)
        return
      }

      toast.success(MESSAGES.AFFILIATE.BANK_SAVED, MESSAGES.AFFILIATE.BANK_SAVED_DESCRIPTION)
    } catch {
      toast.error('Erro', MESSAGES.AFFILIATE.GENERIC_ERROR)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
      <h3 className="text-lg font-semibold text-zinc-100">Dados Bancários para Repasse</h3>
      <p className="text-sm text-zinc-500">
        Informações utilizadas para repasse de royalties. Dados armazenados com criptografia.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">Banco</label>
            <Input
              placeholder="Ex: Itaú"
              disabled={isSubmitting}
              aria-describedby={errors.banco ? 'banco-error' : undefined}
              {...register('banco')}
            />
            {errors.banco && (
              <p id="banco-error" className="mt-1 text-xs text-red-400">{errors.banco.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">Agência</label>
            <Input
              inputMode="numeric"
              placeholder="0001"
              disabled={isSubmitting}
              aria-describedby={errors.agencia ? 'agencia-error' : undefined}
              {...register('agencia')}
            />
            {errors.agencia && (
              <p id="agencia-error" className="mt-1 text-xs text-red-400">{errors.agencia.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">Conta</label>
            <Input
              inputMode="numeric"
              placeholder={initialData?.conta ?? '00000000-0'}
              disabled={isSubmitting}
              aria-describedby={errors.conta ? 'conta-error' : undefined}
              {...register('conta')}
            />
            {errors.conta && (
              <p id="conta-error" className="mt-1 text-xs text-red-400">{errors.conta.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">Chave PIX</label>
            <Input
              placeholder="CNPJ, email ou chave aleatória"
              disabled={isSubmitting}
              aria-describedby={errors.pixKey ? 'pix-error' : undefined}
              {...register('pixKey')}
            />
            {errors.pixKey && (
              <p id="pix-error" className="mt-1 text-xs text-red-400">{errors.pixKey.message}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-zinc-300">CPF/CNPJ</label>
            <Input
              inputMode="numeric"
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              disabled={isSubmitting}
              aria-describedby={errors.cpfCnpj ? 'cpfcnpj-error' : undefined}
              {...register('cpfCnpj')}
            />
            {errors.cpfCnpj && (
              <p id="cpfcnpj-error" className="mt-1 text-xs text-red-400">{errors.cpfCnpj.message}</p>
            )}
          </div>
        </div>

        <Btn
          type="submit"
          variant="primary"
          disabled={isSubmitting}
          className="min-h-[48px] w-full sm:w-auto"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              Salvando...
            </span>
          ) : (
            'Salvar dados bancários'
          )}
        </Btn>
      </form>
    </div>
  )
}
