import { PlanType } from "@/lib/constants/plans";

/**
 * Dados canonicos dos planos (nome, preco, features). Fonte da pagina de sucesso de
 * pagamento (/planos/sucesso, item 11), que lista as features do plano contratado.
 * NOTA (dedupe pendente): planos/page.tsx ainda mantem uma copia inline desta lista; o
 * ideal e refatorar aquela pagina para consumir PLAN_DETAILS tambem (icone/badge ficam la).
 */
export interface PlanDetail {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  missing: string[];
}

export const PLAN_DETAILS: Record<PlanType, PlanDetail> = {
  [PlanType.JOGADOR]: {
    name: "Jogador",
    price: "Grátis",
    period: "",
    description: "Para começar no mercado",
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
  [PlanType.CRAQUE]: {
    name: "Craque",
    price: "R$ 1,00",
    period: "/mês",
    description: "Para traders sérios",
    features: [
      "Saldo inicial FS$ 5.000",
      "Ordens a mercado (5/dia)",
      "Ordens Limitada & Agendada",
      "Cotações com 30 min de delay",
      "Taxa operacional: 0,35%",
      "Assessor IA (50 msg/dia)",
      "Análises OFI & Kyle's λ",
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
  [PlanType.LENDA]: {
    name: "Lenda",
    price: "R$ 1,00",
    period: "/mês",
    description: "Experiência completa",
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
};
