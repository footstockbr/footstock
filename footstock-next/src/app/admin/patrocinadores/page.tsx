import type { Metadata } from "next";
import { HandshakeIcon, Plus, DollarSign } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Patrocinadores — Admin · Foot Stock",
};

export default async function AdminPatrocinadoresPage() {
  const now = new Date();

  const [sponsors, totalAssets, assetsWithSponsors] = await Promise.all([
    prisma.sponsor.findMany({
      include: { asset: { select: { name: true, ticker: true } } },
      orderBy: { contractStart: "desc" },
    }),
    prisma.asset.count(),
    prisma.sponsor.groupBy({
      by: ["assetId"],
      where: { assetId: { not: null }, contractEnd: { gt: now } },
    }),
  ]);

  const activeSponsors = sponsors.filter((s) => s.contractEnd > now);
  const monthlyRevenue = activeSponsors.reduce(
    (sum, s) => sum + s.sponsorshipValue.toNumber(),
    0
  );
  const coverageCount = assetsWithSponsors.length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#EAECEF] flex items-center gap-2">
            <HandshakeIcon className="h-5 w-5 text-[#F0B90B]" />
            Patrocinadores
          </h1>
          <p className="text-sm text-[#929AA5]">Contratos e receita de patrocinio</p>
        </div>
        <Button variant="primary" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Novo patrocinador
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Contratos Ativos"
          value={String(activeSponsors.length)}
          subValue={`de ${sponsors.length} total`}
        />
        <StatCard
          label="Receita Mensal"
          value={`R$ ${monthlyRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          subValue="patrocinios"
        />
        <StatCard
          label="Cobertura de Clubes"
          value={`${coverageCount}/${totalAssets}`}
          subValue={`${totalAssets > 0 ? Math.round((coverageCount / totalAssets) * 100) : 0}% com patrocinio`}
        />
      </div>

      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <div className="flex flex-col gap-3">
          {sponsors.map((sponsor) => {
            const isActive = sponsor.contractEnd > now;
            const value = sponsor.sponsorshipValue.toNumber();

            return (
              <div key={sponsor.id} className="flex items-center justify-between py-2 border-b border-[rgba(240,185,11,.04)] last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[rgba(240,185,11,.1)] flex items-center justify-center">
                    <DollarSign className="h-4 w-4 text-[#F0B90B]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#EAECEF]">{sponsor.name}</p>
                    <p className="text-xs text-[#929AA5]">
                      {sponsor.asset ? `${sponsor.asset.name} (${sponsor.asset.ticker})` : "Sem clube vinculado"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-[#c5b99a]">
                    R$ {value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mes
                  </span>
                  <Badge variant={isActive ? "default" : "warning"} size="xs">
                    {isActive ? "ativo" : "expirado"}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
