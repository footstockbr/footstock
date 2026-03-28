import type { Metadata } from "next";
import { PortfolioClient } from "./portfolio-client";

export const metadata: Metadata = {
  title: "Carteira — Foot Stock",
};

export default function PortfolioPage() {
  return <PortfolioClient />;
}
