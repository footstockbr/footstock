import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { getAuthUser } from "@/lib/auth";
import { ComunidadeClient } from "./comunidade-client";

export const metadata: Metadata = {
  title: "Comunidade — FootStock",
};

export default async function ComunidadePage() {
  const auth = await getAuthUser();

  return (
    <div data-testid="page-comunidade" className="px-4 pt-4 max-w-3xl mx-auto">
      <h1 className="text-lg font-bold text-[#EAECEF] mb-4 flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-[#F0B90B]" />
        Comunidade
      </h1>
      <ComunidadeClient currentUserId={auth?.user.id} />
    </div>
  );
}
