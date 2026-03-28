"use client";

import { MessageCircle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";

const MOCK_POSTS = [
  { id: 1, author: "Carlos M.", avatar: "CM", time: "há 5 min", content: "FLAM4 vai explodir essa semana. Notícia de renovação é muito bullish!", likes: 24, replies: 8 },
  { id: 2, author: "Ana P.", avatar: "AP", time: "há 12 min", content: "Comprei mais 50 ações de PALM4. O técnico novo vai fazer diferença nos próximos jogos.", likes: 15, replies: 3 },
  { id: 3, author: "Roberto S.", avatar: "RS", time: "há 32 min", content: "Alguém mais acha que CORI4 está subvalorizado? Olhando o histórico, está numa mínima histórica.", likes: 31, replies: 12 },
];

const GLOSSARY = [
  { term: "OFI", def: "Order Flow Imbalance — desequilíbrio entre ordens de compra e venda" },
  { term: "GARCH", def: "Modelo de volatilidade que captura clustering de volatilidade" },
  { term: "Short", def: "Venda a descoberto — apostar na queda de um ativo" },
  { term: "Spread", def: "Diferença entre o preço de compra (ask) e venda (bid)" },
  { term: "Circuit Breaker", def: "Mecanismo que suspende negociações durante variações extremas" },
];

export function ComunidadeClient() {
  return (
    <Tabs defaultValue="forum">
      <TabsList className="w-full">
        <TabsTrigger value="forum">Fórum</TabsTrigger>
        <TabsTrigger value="glossario">Glossário</TabsTrigger>
      </TabsList>

      <TabsContent value="forum" className="mt-4">
        <Button variant="primary" size="md" fullWidth className="mb-4">
          <MessageCircle className="h-4 w-4 mr-2" />
          Nova publicação
        </Button>

        <div className="flex flex-col gap-3">
          {MOCK_POSTS.map((post) => (
            <div
              key={post.id}
              className="bg-[#141210] rounded-lg border border-[rgba(201,168,76,.18)] p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Avatar name={post.author} size="sm" />
                <div>
                  <p className="text-sm font-medium text-[#f0ead6]">{post.author}</p>
                  <p className="text-[10px] text-[#4a3d2a]">{post.time}</p>
                </div>
              </div>
              <p className="text-sm text-[#7a7060] leading-relaxed">{post.content}</p>
              <div className="flex items-center gap-4 mt-3">
                <button className="flex items-center gap-1 text-xs text-[#7a7060] hover:text-[#c9a84c] transition-colors">
                  ❤️ {post.likes}
                </button>
                <button className="flex items-center gap-1 text-xs text-[#7a7060] hover:text-[#c9a84c] transition-colors">
                  💬 {post.replies} respostas
                </button>
              </div>
            </div>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="glossario" className="mt-4">
        <div className="flex flex-col gap-2">
          {GLOSSARY.map((item) => (
            <div key={item.term} className="bg-[#141210] rounded-lg border border-[rgba(201,168,76,.1)] p-4">
              <p className="text-sm font-mono font-bold text-[#c9a84c] mb-1">{item.term}</p>
              <p className="text-sm text-[#7a7060]">{item.def}</p>
            </div>
          ))}
        </div>
      </TabsContent>
    </Tabs>
  );
}
