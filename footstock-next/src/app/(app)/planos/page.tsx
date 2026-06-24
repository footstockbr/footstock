import type { Metadata } from "next";
import { Check, Zap, Crown, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlanType } from "@/lib/constants/plans";
import {
  PLAN_AMOUNTS_CENTS,
  formatBRLFromCents,
} from "@/lib/constants/plan-amounts-cents";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { getAuthUser } from "@/lib/auth";
import { PlanCTAButton } from "@/components/payments/PlanCTAButton";
import { PlanRevalidateOnSuccess } from "@/components/payments/PlanRevalidateOnSuccess";
import { resolveEnabledCheckoutGateways } from "@/lib/payments/enabled-gateways.server";

export const metadata: Metadata = {
  title: "Planos — FootStock",
};

const PLAN_ORDER: Record<PlanType, number> = {
  [PlanType.JOGADOR]: 1,
  [PlanType.CRAQUE]: 2,
  [PlanType.LENDA]: 3,
};

const PLANS = [
  {
    type: PlanType.JOGADOR,
    icon: Star,
    name: "Jogador",
    price: "Grátis",
    period: "",
    description: "Para começar no mercado",
    badge: null,
    features: [
      "Saldo inicial FS$ 2.000",
      "Ordens a mercado (2/dia)",
      "Cotações com 1h de delay",
      "Taxa operacional: 0,45%",
      "Portfolio básico",
      "Comunidade & fórum",
      "1 liga simultânea",
    ],
    missing: [
      "Cotações em tempo real",
      "Ordens Limitada & Agendada",
      "Ordens OCO & Short Selling",
      "Assessor IA",
      "Análises avançadas (MM, OFI)",
      "Modo comparação de clubes",
      "Dividendos automáticos",
    ],
  },
  {
    type: PlanType.CRAQUE,
    icon: Zap,
    name: "Craque",
    // SSoT (FIX-12): preco de cobranca derivado de PLAN_AMOUNTS_CENTS (centavos).
    price: formatBRLFromCents(PLAN_AMOUNTS_CENTS.CRAQUE.monthly),
    period: "/mês",
    description: "Para traders sérios",
    badge: "Mais popular",
    features: [
      "Saldo inicial FS$ 5.000",
      "Ordens a mercado (5/dia)",
      "Ordens Limitada & Agendada",
      "Cotações com 30 min de delay",
      "Taxa operacional: 0,35%",
      "Assessor IA (50 msg/dia)",
      "Análises OFI & Kyle's \u03bb",
      "Modo comparação (até 4 clubes)",
      "5 ligas simultâneas",
      "Dividendos automáticos",
      "Alertas de preço",
    ],
    missing: [
      "Cotações em tempo real",
      "Ordens OCO (One Cancels Other)",
      "Short Selling com margem",
      "Alavancagem 2x",
      "Assessor IA ilimitado",
    ],
  },
  {
    type: PlanType.LENDA,
    icon: Crown,
    name: "Lenda",
    // SSoT (FIX-12): preco de cobranca derivado de PLAN_AMOUNTS_CENTS (centavos).
    price: formatBRLFromCents(PLAN_AMOUNTS_CENTS.LENDA.monthly),
    period: "/mês",
    description: "Experiência completa",
    badge: "Premium",
    features: [
      "Saldo inicial FS$ 25.000",
      "Ordens ilimitadas por dia",
      "Cotações em tempo real",
      "Taxa operacional: 0,25%",
      "Ordens OCO (One Cancels Other)",
      "Short Selling com margem 150%",
      "Alavancagem 2x",
      "Indicadores MM9 & MM21 exclusivos",
      "Assessor IA ilimitado",
      "Book de ordens completo",
      "Ligas ilimitadas",
      "Relatórios exportáveis",
      "Suporte prioritário",
      "Badge exclusivo Lenda",
    ],
    missing: [],
  },
];

interface PlanosPageProps {
  searchParams: Promise<{ payment?: string }>;
}

export default async function PlanosPage({ searchParams }: PlanosPageProps) {
  const auth = await getAuthUser();
  // Politica do operador: admin nao deve acessar nem ver opcao de planos.
  // Guard server-side e a fronteira de seguranca dura (o nav apenas esconde o link).
  if (auth?.user.adminRole) {
    redirect(ROUTES.CONTA);
  }
  const userPlan = (auth?.user.planType as PlanType) ?? PlanType.JOGADOR;
  const userPlanLevel = PLAN_ORDER[userPlan] ?? 1;
  // Gateways efetivamente habilitados (credenciais presentes), resolvidos
  // server-side e repassados aos CTAs para o seletor de pagamento nao oferecer
  // gateway quebrado nem flashear carregamento.
  const enabledGateways = resolveEnabledCheckoutGateways();
  const { payment } = await searchParams;
  const paymentSucceeded = payment === "success";

  // task-017: retorno do gateway nunca pode ser silencioso (Zero Silencio).
  // Cada estado tem copy distinta e visivel. O caso success ainda dispara a
  // revalidacao do plano via PlanRevalidateOnSuccess (abaixo).
  const paymentBanner: { tone: "success" | "pending" | "failed"; message: string } | null =
    payment === "success"
      ? {
          tone: "success",
          message:
            "Pagamento recebido. Atualizando seu plano. Se o plano nao aparecer, atualize a pagina em alguns segundos.",
        }
      : payment === "pending"
        ? {
            tone: "pending",
            message:
              "Ha um pagamento pendente para este plano. Aguarde a confirmacao ou conclua a tentativa aberta.",
          }
        : payment === "failed"
          ? {
              tone: "failed",
              message:
                "Pagamento recusado pelo gateway. Tente outro cartao ou metodo de pagamento.",
            }
          : null;

  const BANNER_STYLES: Record<"success" | "pending" | "failed", string> = {
    success: "border-[rgba(46,189,133,.4)] bg-[rgba(46,189,133,.08)] text-[#2EBD85]",
    pending: "border-[rgba(240,185,11,.4)] bg-[rgba(240,185,11,.08)] text-[#F0B90B]",
    failed: "border-[rgba(246,70,93,.4)] bg-[rgba(246,70,93,.08)] text-[#F6465D]",
  };

  return (
    <div data-testid="planos-page" className="px-4 md:px-8 pt-4 pb-8 max-w-5xl mx-auto">
      <PlanRevalidateOnSuccess active={paymentSucceeded} />
      {paymentBanner && (
        <div
          role="status"
          data-testid={`planos-payment-banner-${payment}`}
          className={`mb-6 rounded-lg border px-4 py-3 text-sm ${BANNER_STYLES[paymentBanner.tone]}`}
        >
          {paymentBanner.message}
        </div>
      )}
      <div className="text-center mb-8">
        <h1 className="text-xl font-bold text-[#EAECEF] mb-1">Escolha seu plano</h1>
        <p className="text-sm text-[#929AA5]">
          Invista em dados melhores. Cancele quando quiser.
        </p>
      </div>

      <div data-testid="planos-list" className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 items-start">
        {PLANS.map((plan) => {
          const Icon = plan.icon;
          const isCraque = plan.type === PlanType.CRAQUE;
          const planLevel = PLAN_ORDER[plan.type];

          const isCurrentPlan = plan.type === userPlan;
          const isUpgrade = planLevel > userPlanLevel;
          const isDowngrade = planLevel < userPlanLevel;

          let ctaLabel: string;
          let ctaVariant: "secondary" | "plan";
          let ctaDisabled: boolean;

          if (isCurrentPlan) {
            ctaLabel = "Plano atual";
            ctaVariant = "secondary";
            ctaDisabled = true;
          } else if (isUpgrade) {
            ctaLabel = `Assinar ${plan.name}`;
            ctaVariant = "plan";
            ctaDisabled = false;
          } else {
            // downgrade
            ctaLabel = "Incluído no seu plano";
            ctaVariant = "secondary";
            ctaDisabled = true;
          }

          return (
            <div
              key={plan.type}
              data-testid={`plano-card-${plan.type.toLowerCase()}`}
              className={`rounded-xl border p-5 relative flex flex-col ${
                isCraque
                  ? "bg-[rgba(240,185,11,.06)] border-[rgba(240,185,11,.4)] shadow-[0_0_24px_rgba(240,185,11,.12)]"
                  : "bg-[#1E2329] border-[rgba(240,185,11,.12)]"
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant={plan.type === PlanType.CRAQUE ? "craque" : "lenda"} size="sm">
                    {plan.badge}
                  </Badge>
                </div>
              )}

              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    plan.type === PlanType.LENDA
                      ? "bg-[rgba(240,185,11,.2)]"
                      : isCraque
                      ? "bg-[rgba(240,185,11,.15)]"
                      : "bg-[rgba(120,110,90,.15)]"
                  }`}>
                    <Icon className={`h-5 w-5 ${
                      plan.type === PlanType.JOGADOR ? "text-[#929AA5]" : "text-[#F0B90B]"
                    }`} />
                  </div>
                  <div>
                    <p className="text-base font-bold text-[#EAECEF]">{plan.name}</p>
                    <p className="text-xs text-[#929AA5]">{plan.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold font-mono text-[#EAECEF]">{plan.price}</span>
                  {plan.period && (
                    <span className="text-xs text-[#929AA5]">{plan.period}</span>
                  )}
                </div>
              </div>

              <ul className="space-y-2 mb-4 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-[#4ade80] flex-shrink-0" />
                    <span className="text-sm text-[#c5b99a]">{feature}</span>
                  </li>
                ))}
                {plan.missing.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 opacity-40">
                    <div className="h-3.5 w-3.5 flex-shrink-0 flex items-center justify-center">
                      <div className="h-px w-3 bg-[#929AA5]" />
                    </div>
                    <span className="text-sm text-[#929AA5]">{feature}</span>
                  </li>
                ))}
              </ul>

              {isUpgrade && plan.type !== PlanType.JOGADOR ? (
                <PlanCTAButton
                  planType={plan.type as "CRAQUE" | "LENDA"}
                  label={ctaLabel}
                  currentPlan={userPlan}
                  enabledGateways={enabledGateways}
                  data-testid={`plano-cta-button-${plan.type.toLowerCase()}`}
                />
              ) : (
                <Button
                  data-testid={`plano-cta-button-${plan.type.toLowerCase()}`}
                  variant={ctaVariant}
                  size="md"
                  fullWidth
                  disabled={ctaDisabled}
                  title={isDowngrade ? "Seu plano atual já inclui os recursos deste plano. Downgrade agendado ainda não está disponível." : undefined}
                >
                  {ctaLabel}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 text-center">
        <p className="text-xs text-[#707A8A]">
          Pagamento seguro via Mercado Pago, PagSeguro ou PayPal · Cancele a qualquer momento
        </p>
        <Link href={ROUTES.CONTA} className="text-xs text-[#929AA5] underline mt-1 inline-block">
          Voltar para minha conta
        </Link>
      </div>
    </div>
  );
}
