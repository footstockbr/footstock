// ============================================================================
// Foot Stock — Admin Layout (Server Component)
// Verifica sessão admin e renderiza layout com sidebar + timer de inatividade 30min.
// Rastreabilidade: INT-085, INT-087, TASK-1/ST005
// ============================================================================

import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminLayoutClient } from "@/components/admin/AdminLayoutClient";
import type { AdminRole } from "@/types";
import type { Metadata } from "next";
import { ROUTES } from "@/lib/constants/routes";

export const metadata: Metadata = {
  title: { default: "Admin | Foot Stock", template: "%s | Admin Foot Stock" },
  robots: "noindex, nofollow",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getAuthUser();

  if (!auth || !auth.user.adminRole) {
    redirect(ROUTES.LOGIN);
  }

  const { user } = auth;

  return (
    // flex-col mobile: header acima do conteúdo. md:flex-row: sidebar ao lado.
    <div className="min-h-dvh md:h-dvh md:overflow-hidden flex flex-col md:flex-row bg-[#0B0E11]">
      <AdminSidebar adminRole={user.adminRole as AdminRole} />

      <AdminLayoutClient userId={user.id}>
        <main className="flex-1 overflow-y-auto pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
      </AdminLayoutClient>
    </div>
  );
}
