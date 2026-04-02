import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-[#0B0E11] p-4">
      {children}
    </main>
  );
}
