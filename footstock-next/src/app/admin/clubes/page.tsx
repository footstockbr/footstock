import type { Metadata } from "next";
import { Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Clubes — Admin · Foot Stock",
};

export default async function AdminClubesPage() {
  const assets = await prisma.asset.findMany({
    orderBy: [{ division: "asc" }, { currentPrice: "desc" }],
  });

  // Count distinct holders (users with OPEN positions) per asset
  const holderCounts = await prisma.position.groupBy({
    by: ["assetId"],
    where: { status: "OPEN" },
    _count: { userId: true },
  });
  const holdersMap = new Map(
    holderCounts.map((h) => [h.assetId, h._count.userId])
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#EAECEF] flex items-center gap-2">
            <Trophy className="h-5 w-5 text-[#F0B90B]" />
            Clubes
          </h1>
          <p className="text-sm text-[#929AA5]">
            {assets.length} clubes · gestão de ativos e supply
          </p>
        </div>
      </div>

      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgba(240,185,11,.1)] bg-[rgba(240,185,11,.02)]">
              <th className="text-left px-4 py-3 text-xs text-[#929AA5] font-medium">Clube</th>
              <th className="text-right px-4 py-3 text-xs text-[#929AA5] font-medium">Preço</th>
              <th className="text-right px-4 py-3 text-xs text-[#929AA5] font-medium">Variação</th>
              <th className="text-right px-4 py-3 text-xs text-[#929AA5] font-medium">Supply</th>
              <th className="text-right px-4 py-3 text-xs text-[#929AA5] font-medium">Holders</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => {
              const price = asset.currentPrice.toNumber();
              const open = asset.openPrice.toNumber();
              const changePct = open > 0 ? ((price - open) / open) * 100 : 0;
              const positive = changePct > 0;
              const neutral = changePct === 0;
              const holders = holdersMap.get(asset.id) ?? 0;

              return (
                <tr
                  key={asset.ticker}
                  className="border-b border-[rgba(240,185,11,.04)] hover:bg-[rgba(240,185,11,.02)]"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono text-[#F0B90B] w-12">
                        {asset.ticker}
                      </span>
                      <span className="text-sm text-[#c5b99a]">{asset.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-[#EAECEF]">
                    FS$ {price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`text-sm font-mono font-medium flex items-center justify-end gap-0.5 ${
                        neutral
                          ? "text-[#929AA5]"
                          : positive
                            ? "text-[#4ade80]"
                            : "text-[#F6465D]"
                      }`}
                    >
                      {neutral ? (
                        <Minus className="h-3 w-3" />
                      ) : positive ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {changePct > 0 ? "+" : ""}
                      {changePct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-[#929AA5]">
                    {Number(asset.currentSupply).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-[#c5b99a]">
                    {holders.toLocaleString("pt-BR")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
