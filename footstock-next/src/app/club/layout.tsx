import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portal do Clube — Foot Stock",
};

export default function ClubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#080808]">
      {children}
    </div>
  );
}
