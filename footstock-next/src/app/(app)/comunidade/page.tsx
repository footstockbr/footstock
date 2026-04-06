import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ComunidadeClient, type ForumPostView } from "./comunidade-client";

export const metadata: Metadata = {
  title: "Comunidade — Foot Stock",
};

export default async function ComunidadePage() {
  const rawPosts = await prisma.globalForumPost.findMany({
    where: { isDeleted: false, isFlagged: false },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      user: { select: { name: true } },
      _count: { select: { likes: true } },
    },
  });

  const posts: ForumPostView[] = rawPosts.map((p) => ({
    id: p.id,
    authorName: p.user.name,
    content: p.content,
    ticker: p.ticker,
    likesCount: p._count.likes,
    createdAgo: formatDistanceToNow(p.createdAt, { addSuffix: true, locale: ptBR }),
  }));

  return (
    <div className="px-4 pt-4">
      <h1 className="text-lg font-bold text-[#EAECEF] mb-4 flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-[#F0B90B]" />
        Comunidade
      </h1>
      <ComunidadeClient posts={posts} />
    </div>
  );
}
