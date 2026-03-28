import type { Metadata } from "next";
import { MarketPageClient } from "./market-page-client";

export const metadata: Metadata = {
  title: "Mercado — Foot Stock",
  description: "Acompanhe os preços em tempo real dos 40 clubes brasileiros.",
};

export default function MercadoPage() {
  return <MarketPageClient />;
}
