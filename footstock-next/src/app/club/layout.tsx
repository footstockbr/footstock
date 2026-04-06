import type { Metadata } from "next";
import { ClubSidebar } from "@/components/club/ClubSidebar";

export const metadata: Metadata = {
  title: "Portal do Clube — Foot Stock",
};

export default function ClubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh overflow-hidden bg-[#0B0E11] flex">
      <ClubSidebar />

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
