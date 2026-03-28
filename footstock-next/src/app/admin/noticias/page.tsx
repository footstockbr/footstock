import type { Metadata } from "next";
import { Newspaper, Plus, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Notícias — Admin · Foot Stock",
};

const MOCK_NEWS = [
  { id: 1, title: "Flamengo anuncia renovação de contrato de atacante", ticker: "FLAM4", impact: "positivo", status: "publicado", date: "28/03/2026" },
  { id: 2, title: "Palmeiras contrata reforço para o meio-campo", ticker: "PALM4", impact: "positivo", status: "publicado", date: "27/03/2026" },
  { id: 3, title: "Corinthians perde jogo fora de casa por 2-0", ticker: "CORI4", impact: "negativo", status: "rascunho", date: "26/03/2026" },
  { id: 4, title: "São Paulo anuncia patrocínio master de R$ 30 milhões", ticker: "SAOP4", impact: "positivo", status: "publicado", date: "25/03/2026" },
];

export default function AdminNoticiasPage() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#f0ead6] flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-[#c9a84c]" />
            Notícias
          </h1>
          <p className="text-sm text-[#7a7060]">Gerenciar conteúdo editorial e impacto de mercado</p>
        </div>
        <Button variant="primary" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Nova notícia
        </Button>
      </div>

      <div className="bg-[#141210] rounded-xl border border-[rgba(201,168,76,.1)] p-4">
        <div className="flex flex-col gap-2">
          {MOCK_NEWS.map((news) => (
            <div key={news.id} className="flex items-center gap-3 py-2.5 border-b border-[rgba(201,168,76,.04)] last:border-0">
              <div className={`w-1.5 h-8 rounded-full flex-shrink-0 ${
                news.impact === "positivo" ? "bg-[#4ade80]" : "bg-[#ef4444]"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#c5b99a] truncate">{news.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-mono text-[#c9a84c]">{news.ticker}</span>
                  <span className="text-xs text-[#4a3d2a]">·</span>
                  <span className="text-xs text-[#7a7060]">{news.date}</span>
                </div>
              </div>
              <Badge variant={news.status === "publicado" ? "default" : "warning"} size="xs">
                {news.status}
              </Badge>
              <div className="flex gap-1">
                <button className="p-1.5 rounded hover:bg-[rgba(201,168,76,.08)] text-[#7a7060] hover:text-[#c9a84c] transition-colors">
                  <Edit className="h-3.5 w-3.5" />
                </button>
                <button className="p-1.5 rounded hover:bg-[rgba(239,68,68,.1)] text-[#7a7060] hover:text-[#ef4444] transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
