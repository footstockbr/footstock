import type { Metadata } from "next";
import { ClubSidebar } from "@/components/club/ClubSidebar";

export const metadata: Metadata = {
  title: "Portal do Clube — Foot Stock",
};

export default function ClubLayout({ children }: { children: React.ReactNode }) {
  return (
    // flex-col mobile: header acima do conteúdo. md:flex-row: sidebar ao lado.
    <div className="min-h-dvh md:h-dvh md:overflow-hidden flex flex-col md:flex-row bg-[#0B0E11]">
      <ClubSidebar />

      <main className="flex-1 overflow-y-auto pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>
    </div>
  );
}
