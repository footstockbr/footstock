import type { Metadata } from "next";
import { PortfolioClient } from "./portfolio-client";
import { SponsorBanner } from "@/components/shared/sponsor-banner";

export const metadata: Metadata = {
  title: "Carteira — FootStock",
};

export default function PortfolioPage() {
  return (
    <div className="flex flex-col">
      {/* Banner CART_TOP: 360×60 — topo da carteira */}
      <div className="flex justify-center px-4 pt-3">
        <SponsorBanner position="cart_top" />
      </div>
      <PortfolioClient />
    </div>
  );
}
