import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { ComunidadeClient } from "./comunidade-client";

export const metadata: Metadata = {
  title: "Comunidade — Foot Stock",
};

export default function ComunidadePage() {
  return (
    <div className="px-4 pt-4">
      <h1 className="text-lg font-bold text-[#EAECEF] mb-4 flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-[#F0B90B]" />
        Comunidade
      </h1>
      <ComunidadeClient />
    </div>
  );
}
