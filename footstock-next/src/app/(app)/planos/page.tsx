import type { Metadata } from "next";
import { Check, Zap, Crown, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlanType } from "@/lib/constants/plans";
import Link from "next/link";
import { ROUTES } from "@/lib/constants/routes";

export const metadata: Metadata = {
  title: "Planos — Foot Stock",
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
      "Acesso ao mercado ao vivo",
      "Portfólio básico",
      "Dados com delay de 15 min",
      "Comunidade & fórum",
      "1 liga simultânea",
    ],
    missing: [
      "Dados em tempo real",
      "Assessor IA",
      "Análises avançadas",
      "Dividendos",
    ],
    cta: "Plano atual",
    ctaVariant: "secondary" as const,
    disabled: true,
  },
  {
    type: PlanType.CRAQUE,
    icon: Zap,
    name: "Craque",
    price: "R$ 19,90",
    period: "/mês",
    description: "Para traders sérios",
    badge: "Mais popular",
    features: [
      "Tudo do Jogador",
      "Dados em tempo real",
      "Assessor IA (50 msg/dia)",
      "Análises OFI & Kyle's λ",
      "5 ligas simultâneas",
      "Dividendos automáticos",
      "Alertas de preço",
    ],
    missing: [],
    cta: "Assinar Craque",
    ctaVariant: "plan" as const,
    disabled: false,
  },
  {
    type: PlanType.LENDA,
    icon: Crown,
    name: "Lenda",
    price: "R$ 39,90",
    period: "/mês",
    description: "Experiência completa",
    badge: "Premium",
    features: [
      "Tudo do Craque",
      "Assessor IA ilimitado",
      "Book de ordens completo",
      "Ligas ilimitadas",
      "Relatórios exportáveis",
      "Suporte prioritário",
      "Badge exclusivo Lenda",
    ],
    missing: [],
    cta: "Assinar Lenda",
    ctaVariant: "plan" as const,
    disabled: false,
  },
];

export default function PlanosPage() {
  return (
    <div data-testid="planos-page" className="px-4 pt-4 pb-8">
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold text-[#EAECEF] mb-1">Escolha seu plano</h1>
        <p className="text-sm text-[#929AA5]">
          Invista em dados melhores. Cancele quando quiser.
        </p>
      </div>

      <div data-testid="planos-list" className="flex flex-col gap-4">
        {PLANS.map((plan) => {
          const Icon = plan.icon;
          const isCraque = plan.type === PlanType.CRAQUE;

          return (
            <div
              key={plan.type}
              data-testid={`plano-card-${plan.type.toLowerCase()}`}
              className={`rounded-xl border p-5 relative ${
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

              <ul className="space-y-2 mb-4">
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

              <Button
                data-testid={`plano-cta-button-${plan.type.toLowerCase()}`}
                variant={plan.ctaVariant}
                size="md"
                fullWidth
                disabled={plan.disabled}
              >
                {plan.cta}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="mt-6 text-center">
        <p className="text-xs text-[#707A8A]">
          Pagamento seguro via Stripe · Cancele a qualquer momento
        </p>
        <Link href={ROUTES.CONTA} className="text-xs text-[#929AA5] underline mt-1 inline-block">
          Voltar para minha conta
        </Link>
      </div>
    </div>
  );
}
