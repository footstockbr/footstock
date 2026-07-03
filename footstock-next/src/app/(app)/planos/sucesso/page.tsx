import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { ROUTES } from "@/lib/constants/routes";
import { PlanType } from "@/lib/constants/plans";
import { normalizeGatewayReturnParam } from "@/lib/payments/gateway-return-params";
import { PlanoSucessoContent } from "@/components/payments/PlanoSucessoContent";

export const metadata: Metadata = {
  title: "Pagamento confirmado — FootStock",
};

interface SucessoPageProps {
  searchParams: Promise<{ sub?: string; plan?: string }>;
}

// Planos pagos sao CRAQUE ou LENDA. Default seguro = CRAQUE quando o param vier
// ausente/invalido. O param passa por normalizeGatewayReturnParam ANTES: o gateway
// pode anexar `?preapproval_id=...` ao ultimo param da back_url (incidente
// 2026-07-03), chegando aqui como "LENDA?preapproval_id=..." — sem o corte, uma
// compra LENDA renderizava o card de CRAQUE.
function resolvePlan(raw?: string): PlanType {
  const upper = normalizeGatewayReturnParam(raw).toUpperCase();
  if (upper === PlanType.LENDA) return PlanType.LENDA;
  return PlanType.CRAQUE;
}

/**
 * Pagina de sucesso LEGADA (query-based). Mantida para retrocompat com back_urls
 * emitidas antes do fix do incidente 2026-07-03; a rota canonica atual e
 * /planos/sucesso/[subId] (path-based, plano derivado do banco). Nao remover
 * enquanto houver checkout in-flight criado antes do deploy do fix.
 */
export default async function PlanoSucessoPage({ searchParams }: SucessoPageProps) {
  const auth = await getAuthUser();
  if (!auth) redirect(ROUTES.LOGIN);
  // Admin nao contrata plano (mesma politica de /planos).
  if (auth.user.adminRole) redirect(ROUTES.CONTA);

  const { plan, sub } = await searchParams;
  const planType = resolvePlan(plan);
  const subId = normalizeGatewayReturnParam(sub) || undefined;

  return <PlanoSucessoContent planType={planType} subId={subId} />;
}
