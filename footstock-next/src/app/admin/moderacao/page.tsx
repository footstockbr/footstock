import type { Metadata } from "next";
import { ShieldAlert, Flag, CheckCircle, XCircle } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const metadata: Metadata = {
  title: "Moderacao — Admin · Foot Stock",
};

export default async function AdminModeracaoPage() {
  const [flaggedPosts, pendingCount, suspendedCount] = await Promise.all([
    prisma.globalForumPost.findMany({
      where: { isFlagged: true, isDeleted: false },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.globalForumPost.count({
      where: { isFlagged: true, isDeleted: false },
    }),
    prisma.user.count({ where: { status: "SUSPENDED" } }),
  ]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#EAECEF] flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-[#F0B90B]" />
          Moderacao
        </h1>
        <p className="text-sm text-[#929AA5]">Denuncias, conteudo e seguranca da comunidade</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Denuncias Pendentes"
          value={String(pendingCount)}
          subValue="aguardando revisao"
        />
        <StatCard
          label="Posts Flagrados"
          value={String(flaggedPosts.length)}
          subValue="exibindo ate 20"
        />
        <StatCard
          label="Usuarios Suspensos"
          value={String(suspendedCount)}
          subValue="ativos agora"
        />
      </div>

      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <h2 className="text-sm font-semibold text-[#EAECEF] mb-3 flex items-center gap-2">
          <Flag className="h-4 w-4 text-[#F6465D]" />
          Fila de Moderacao
        </h2>
        <div className="flex flex-col gap-3">
          {flaggedPosts.length === 0 && (
            <p className="text-sm text-[#929AA5] text-center py-4">
              Nenhum post flagrado no momento.
            </p>
          )}
          {flaggedPosts.map((post) => {
            const timeAgo = formatDistanceToNow(post.createdAt, {
              locale: ptBR,
              addSuffix: true,
            });

            return (
              <div key={post.id} className="bg-[#181A20] rounded-lg border border-[rgba(240,185,11,.06)] p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="default" size="xs">post</Badge>
                      <span className="text-xs font-medium text-[#f59e0b]">pendente</span>
                      {post.ticker && (
                        <span className="text-xs font-mono text-[#F0B90B]">{post.ticker}</span>
                      )}
                      <span className="text-xs text-[#929AA5]">
                        {post.flagCount} flag{post.flagCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <p className="text-sm text-[#c5b99a]">{post.content}</p>
                    <p className="text-xs text-[#929AA5] mt-1">
                      Por: {post.user.name} ({post.user.email}) · {timeAgo}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button className="p-1.5 rounded hover:bg-[rgba(74,222,128,.1)] text-[#929AA5] hover:text-[#4ade80] transition-colors">
                      <CheckCircle className="h-4 w-4" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-[rgba(239,68,68,.1)] text-[#929AA5] hover:text-[#F6465D] transition-colors">
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
