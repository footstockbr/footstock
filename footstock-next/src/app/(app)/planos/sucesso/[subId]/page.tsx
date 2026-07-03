import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROUTES } from "@/lib/constants/routes";
import { PlanType } from "@/lib/constants/plans";
import { PlanoSucessoContent } from "@/components/payments/PlanoSucessoContent";

export const metadata: Metadata = {
  title: "Pagamento confirmado — FootStock",
};

interface SucessoSubPageProps {
  params: Promise<{ subId?: string }>;
}

/**
 * Pagina de sucesso path-based (incidente 2026-07-03). A back_url enviada ao gateway
 * agora e /planos/sucesso/{subId} SEM query string propria: o Mercado Pago anexava
 * `?preapproval_id=...` a uma back_url que ja tinha query, malformando a URL
 * (`?sub=...&plan=CRAQUE?preapproval_id=...`). Com o subId no path, qualquer coisa
 * que o gateway anexe vira query inofensiva.
 *
 * O plano exibido vem do BANCO (subscription do proprio usuario), nunca de query
 * param — retorno de gateway e informativo, nao fonte de verdade.
 */
export default async function PlanoSucessoSubPage({ params }: SucessoSubPageProps) {
  const auth = await getAuthUser();
  if (!auth) redirect(ROUTES.LOGIN);
  // Admin nao contrata plano (mesma politica de /planos).
  if (auth.user.adminRole) redirect(ROUTES.CONTA);

  const { subId } = await params;
  if (!subId) redirect(ROUTES.PLANOS);

  const subscription = await prisma.subscription.findUnique({
    where: { id: subId },
    select: { userId: true, planType: true, status: true },
  });

  // Assinatura inexistente ou de OUTRO usuario: nunca renderizar dados alheios.
  if (!subscription || subscription.userId !== auth.userId) redirect(ROUTES.PLANOS);

  // Review codex 2026-07-03 (F4): sucesso e pagina de "pagamento em ativacao" — vale para
  // PENDING (aguardando webhook/reconcile, com polling) e ACTIVE (ja ativado). Uma sub em
  // estado terminal (cancelada/expirada/suspensa) acessada por URL manual NAO pode renderizar
  // tela de sucesso — devolver para /planos, que mostra o estado real dos planos.
  const RENDERABLE_STATUSES = ["PENDING", "ACTIVE"];
  if (!RENDERABLE_STATUSES.includes(subscription.status)) redirect(ROUTES.PLANOS);

  // Planos pagos sao CRAQUE ou LENDA; qualquer outro valor cai no default seguro.
  const planType =
    subscription.planType === PlanType.LENDA ? PlanType.LENDA : PlanType.CRAQUE;

  return <PlanoSucessoContent planType={planType} subId={subId} />;
}
