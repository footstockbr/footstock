import type { Metadata } from "next";
import { BookOpen, Search } from "lucide-react";

export const metadata: Metadata = {
  title: "Glossário — Foot Stock",
};

const TERMS = [
  { term: "After Market", def: "Período de negociação após o fechamento oficial do mercado" },
  { term: "Ask", def: "Preço pelo qual o vendedor está disposto a vender um ativo" },
  { term: "Bid", def: "Preço pelo qual o comprador está disposto a comprar um ativo" },
  { term: "Circuit Breaker", def: "Mecanismo automático que suspende as negociações em casos de volatilidade extrema" },
  { term: "GARCH", def: "Modelo estatístico para estimar e prever a volatilidade de ativos financeiros" },
  { term: "Kyle's Lambda", def: "Medida da pressão de preço por unidade de fluxo de ordens (impacto de mercado)" },
  { term: "Liquidez", def: "Facilidade com que um ativo pode ser comprado ou vendido sem afetar seu preço" },
  { term: "OFI", def: "Order Flow Imbalance — desequilíbrio entre ordens de compra e venda no book" },
  { term: "OCO", def: "One Cancels Other — par de ordens onde a execução de uma cancela a outra" },
  { term: "Ornstein-Uhlenbeck", def: "Processo estocástico de reversão à média usado para modelar preços" },
  { term: "Posição Short", def: "Aposta na queda de preço de um ativo (venda a descoberto)" },
  { term: "Spread", def: "Diferença entre o preço de compra (ask) e venda (bid) de um ativo" },
  { term: "Stop Loss", def: "Ordem para limitar as perdas vendendo automaticamente quando o preço cai a certo nível" },
  { term: "Supply Global", def: "No Foot Stock, quantidade total de ações de cada clube disponível para negociação" },
  { term: "Volatilidade", def: "Medida de variação do preço de um ativo ao longo do tempo" },
];

export default function GlossarioPage() {
  return (
    <div className="px-4 pt-4">
      <h1 className="text-lg font-bold text-[#EAECEF] mb-1 flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-[#F0B90B]" />
        Glossário
      </h1>
      <p className="text-sm text-[#929AA5] mb-4">116 termos de mercado financeiro</p>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#707A8A]" />
        <input
          type="search"
          placeholder="Buscar termo..."
          className="h-10 w-full rounded-lg border border-[rgba(240,185,11,.18)] bg-[#181A20] pl-9 pr-3 text-sm text-[#EAECEF] placeholder:text-[#707A8A] focus:outline-none focus:border-[rgba(240,185,11,.4)]"
        />
      </div>

      <div className="flex flex-col gap-2">
        {TERMS.map((item) => (
          <div
            key={item.term}
            className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.1)] p-4"
          >
            <p className="text-sm font-semibold text-[#F0B90B] mb-1">{item.term}</p>
            <p className="text-sm text-[#929AA5] leading-relaxed">{item.def}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
