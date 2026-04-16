import type { Metadata } from "next";
import { MarketPageClient } from "./market-page-client";
import { SponsorBanner } from "@/components/shared/sponsor-banner";

export const metadata: Metadata = {
  title: "Mercado — FootStock",
  description: "Acompanhe os preços em tempo real dos 40 clubes brasileiros.",
};

export default function MercadoPage() {
  return (
    <div data-testid="page-mercado" className="flex flex-col">
      {/* Banner HOME_TOP: 360×80 — topo da listagem do mercado */}
      <div className="flex justify-center px-4 pt-3">
        <SponsorBanner position="home_top" />
      </div>

      <MarketPageClient />

      {/* Banner HOME_MID: 360×60 — após a lista principal */}
      <div className="flex justify-center px-4 pb-4">
        <SponsorBanner position="home_mid" />
      </div>
    </div>
  );
}
