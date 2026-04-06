"use client";

import { MessageCircle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { GLOSSARY_TERMS } from "@/lib/data/glossary";

export interface ForumPostView {
  id: string;
  authorName: string;
  content: string;
  ticker: string | null;
  likesCount: number;
  createdAgo: string;
}

const GLOSSARY_PREVIEW = GLOSSARY_TERMS.slice(0, 10);

export function ComunidadeClient({ posts }: { posts: ForumPostView[] }) {
  return (
    <Tabs defaultValue="forum">
      <TabsList className="w-full">
        <TabsTrigger value="forum">Forum</TabsTrigger>
        <TabsTrigger value="glossario">Glossario</TabsTrigger>
      </TabsList>

      <TabsContent value="forum" className="mt-4">
        <Button variant="primary" size="md" fullWidth className="mb-4">
          <MessageCircle className="h-4 w-4 mr-2" />
          Nova publicacao
        </Button>

        {posts.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className="h-10 w-10 text-[#707A8A] mx-auto mb-3" />
            <p className="text-sm text-[#929AA5]">
              Nenhuma publicacao ainda. Seja o primeiro!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {posts.map((post) => (
              <div
                key={post.id}
                className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.18)] p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Avatar name={post.authorName} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-[#EAECEF]">{post.authorName}</p>
                    <p className="text-[10px] text-[#707A8A]">{post.createdAgo}</p>
                  </div>
                  {post.ticker && (
                    <span className="ml-auto text-xs font-mono font-bold text-[#F0B90B]">
                      {post.ticker}
                    </span>
                  )}
                </div>
                <p className="text-sm text-[#929AA5] leading-relaxed">{post.content}</p>
                <div className="flex items-center gap-4 mt-3">
                  <button className="flex items-center gap-1 text-xs text-[#929AA5] hover:text-[#F0B90B] transition-colors">
                    &#10084;&#65039; {post.likesCount}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="glossario" className="mt-4">
        <div className="flex flex-col gap-2">
          {GLOSSARY_PREVIEW.map((item) => (
            <div key={item.slug} className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.1)] p-4">
              <p className="text-sm font-mono font-bold text-[#F0B90B] mb-1">{item.title}</p>
              <p className="text-sm text-[#929AA5]">{item.definition}</p>
            </div>
          ))}
          <p className="text-xs text-center text-[#707A8A] mt-2">
            {GLOSSARY_TERMS.length} termos disponiveis no glossario completo
          </p>
        </div>
      </TabsContent>
    </Tabs>
  );
}
