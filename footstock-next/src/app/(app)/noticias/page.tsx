import type { Metadata } from "next";
import { Newspaper } from "lucide-react";
import { Badge, type BadgeVariant } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Notícias — Foot Stock",
};

type SentimentKey = "MUITO_POSITIVO" | "POSITIVO" | "NEUTRO" | "NEGATIVO" | "MUITO_NEGATIVO";

const MOCK_NEWS: Array<{ id: number; ticker: string; title: string; sentiment: SentimentKey; time: string; source: string }> = [
  { id: 1, ticker: "URU3", title: "Urubu da Gavea FC renova contrato com técnico", sentiment: "POSITIVO", time: "há 5 min", source: "GloboEsporte" },
  { id: 2, ticker: "POR4", title: "Porco do Parque FC vence rival e sobe na tabela", sentiment: "MUITO_POSITIVO", time: "há 12 min", source: "UOL Esporte" },
  { id: 3, ticker: "TIM3", title: "Timão do São Jorge FC empata e decepciona torcida", sentiment: "NEGATIVO", time: "há 25 min", source: "ESPN Brasil" },
  { id: 4, ticker: "MAL4", title: "Cruz de Malta de São Januário SC anuncia novo reforço para o segundo semestre", sentiment: "POSITIVO", time: "há 1h", source: "O Dia" },
];

const SENTIMENT_VARIANTS: Record<SentimentKey, BadgeVariant> = {
  MUITO_POSITIVO: "success-strong",
  POSITIVO: "success",
  NEUTRO: "default",
  NEGATIVO: "error",
  MUITO_NEGATIVO: "error",
};

const SENTIMENT_LABELS: Record<SentimentKey, string> = {
  MUITO_POSITIVO: "Muito Positivo",
  POSITIVO: "Positivo",
  NEUTRO: "Neutro",
  NEGATIVO: "Negativo",
  MUITO_NEGATIVO: "Muito Negativo",
};

export default function NoticiasPage() {
  return (
    <div data-testid="noticias-page" className="px-4 pt-4">
      <h1 className="text-lg font-bold text-[#EAECEF] mb-4 flex items-center gap-2">
        <Newspaper className="h-5 w-5 text-[#F0B90B]" />
        Feed de Notícias
      </h1>

      <div data-testid="noticias-list" className="flex flex-col gap-3">
        {MOCK_NEWS.map((news) => (
          <div
            key={news.id}
            data-testid={`noticias-item-${news.id}`}
            className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.18)] p-4 transition-all hover:border-[rgba(240,185,11,.35)] hover:bg-[rgba(240,185,11,.04)] cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-[#F0B90B]">{news.ticker}</span>
                <Badge variant={SENTIMENT_VARIANTS[news.sentiment]} size="xs">
                  {SENTIMENT_LABELS[news.sentiment]}
                </Badge>
              </div>
              <span className="text-[10px] text-[#707A8A] shrink-0">{news.time}</span>
            </div>
            <p className="text-sm font-medium text-[#EAECEF] leading-snug">{news.title}</p>
            <p className="text-xs text-[#929AA5] mt-1">Fonte: {news.source}</p>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-[#707A8A] mt-6 mb-4">
        Notícias em tempo real disponíveis com backend ativo
      </p>
    </div>
  );
}
