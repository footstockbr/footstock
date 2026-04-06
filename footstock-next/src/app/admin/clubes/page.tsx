import type { Metadata } from "next";
import { Trophy, TrendingUp, TrendingDown } from "lucide-react";

export const metadata: Metadata = {
  title: "Clubes — Admin · Foot Stock",
};

const CLUBS = [
  { ticker: "URU3", name: "Urubu da Gavea FC", price: "FS$ 87,40", change: "+3,2%", positive: true, supply: "100.000", holders: "4.821" },
  { ticker: "POR4", name: "Porco do Parque FC", price: "FS$ 72,15", change: "+1,8%", positive: true, supply: "100.000", holders: "3.547" },
  { ticker: "TIM3", name: "Timão do São Jorge FC", price: "FS$ 48,30", change: "-2,1%", positive: false, supply: "100.000", holders: "3.102" },
  { ticker: "TRI4", name: "Tricolor do Morumbi AC", price: "FS$ 55,60", change: "+0,4%", positive: true, supply: "100.000", holders: "2.891" },
  { ticker: "BAL4", name: "Baleia da Vila Belmiro SC", price: "FS$ 38,70", change: "-0,8%", positive: false, supply: "100.000", holders: "2.441" },
  { ticker: "IMO3", name: "Imortal da Arena FC", price: "FS$ 44,20", change: "+1,1%", positive: true, supply: "100.000", holders: "2.103" },
];

export default function AdminClubesPage() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#EAECEF] flex items-center gap-2">
            <Trophy className="h-5 w-5 text-[#F0B90B]" />
            Clubes
          </h1>
          <p className="text-sm text-[#929AA5]">40 clubes · gestão de ativos e supply</p>
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
            {CLUBS.map((club) => (
              <tr key={club.ticker} className="border-b border-[rgba(240,185,11,.04)] hover:bg-[rgba(240,185,11,.02)]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono text-[#F0B90B] w-12">{club.ticker}</span>
                    <span className="text-sm text-[#c5b99a]">{club.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm text-[#EAECEF]">{club.price}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`text-sm font-mono font-medium flex items-center justify-end gap-0.5 ${club.positive ? "text-[#4ade80]" : "text-[#F6465D]"}`}>
                    {club.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {club.change}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-[#929AA5]">{club.supply}</td>
                <td className="px-4 py-3 text-right font-mono text-sm text-[#c5b99a]">{club.holders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
