import type { Metadata } from "next";
import Link from "next/link";
import { Check, CheckCircle2, ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { ROUTES } from "@/lib/constants/routes";
import { PlanType } from "@/lib/constants/plans";
import { PLAN_DETAILS } from "@/lib/constants/plan-details";
import { PlanRevalidateOnSuccess } from "@/components/payments/PlanRevalidateOnSuccess";

export const metadata: Metadata = {
  title: "Pagamento confirmado — FootStock",
};

interface SucessoPageProps {
  searchParams: Promise<{ sub?: string; plan?: string }>;
}

// Planos pagos sao CRAQUE ou LENDA. Default seguro = CRAQUE quando o param vier ausente/invalido.
function resolvePlan(raw?: string): PlanType {
  const upper = (raw ?? "").toUpperCase();
  if (upper === PlanType.LENDA) return PlanType.LENDA;
  return PlanType.CRAQUE;
}

/**
 * Pagina de sucesso de pagamento (item 11). Antes o gateway retornava para /planos (a propria
 * pagina de venda, so com um banner). Agora retorna para esta pagina dedicada: confirma o
 * pagamento, lista as features do plano contratado, faz polling da ativacao (PlanRevalidateOnSuccess,
 * pois o webhook do MP e assincrono) e oferece o CTA "VOLTAR PARA O MERCADO".
 */
export default async function PlanoSucessoPage({ searchParams }: SucessoPageProps) {
  const auth = await getAuthUser();
  if (!auth) redirect(ROUTES.LOGIN);
  // Admin nao contrata plano (mesma politica de /planos).
  if (auth.user.adminRole) redirect(ROUTES.CONTA);

  const { plan } = await searchParams;
  const planType = resolvePlan(plan);
  const detail = PLAN_DETAILS[planType];

  return (
    <div className="px-4 py-8 max-w-2xl mx-auto">
      {/* Polling do status da assinatura ate ACTIVE (webhook do MP e assincrono). */}
      <PlanRevalidateOnSuccess active />

      <div className="flex flex-col items-center text-center gap-3 mb-6">
        <CheckCircle2 className="h-12 w-12 text-[#2EBD85]" aria-hidden="true" />
        <h1 className="text-xl font-bold text-[#EAECEF]">Pagamento confirmado</h1>
        <p className="text-sm text-[#929AA5]">
          Seu plano <span className="font-semibold text-[#F0B90B]">{detail.name}</span> está sendo
          ativado. Isso leva alguns segundos após a confirmação do pagamento, e esta página
          atualiza sozinha quando o plano estiver ativo.
        </p>
      </div>

      <div className="rounded-xl border border-[rgba(240,185,11,.18)] bg-[#1E2329] p-5 mb-6">
        <p className="text-sm font-semibold text-[#EAECEF] mb-3">
          O que você desbloqueou com o {detail.name}:
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {detail.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-[#C0C4CE]">
              <Check className="h-4 w-4 text-[#2EBD85] shrink-0 mt-0.5" aria-hidden="true" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href={ROUTES.MERCADO}
          data-testid="success-back-to-market"
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#F0B90B] px-4 py-3 text-sm font-semibold text-[#0B0E11] hover:bg-[#FCD535] transition-colors"
        >
          VOLTAR PARA O MERCADO
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link
          href={ROUTES.CONTA}
          className="inline-flex items-center justify-center rounded-lg border border-[rgba(240,185,11,.25)] px-4 py-3 text-sm font-medium text-[#C0C4CE] hover:border-[rgba(240,185,11,.45)] transition-colors"
        >
          Ver minha conta
        </Link>
      </div>
    </div>
  );
}
