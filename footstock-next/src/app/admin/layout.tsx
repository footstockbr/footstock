// ============================================================================
// FootStock — Admin Layout (Server Component)
// Verifica sessão admin e renderiza layout com sidebar + timer de inatividade 30min.
// Rastreabilidade: INT-085, INT-087, TASK-1/ST005
// ============================================================================

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuthUser } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminLayoutClient } from "@/components/admin/AdminLayoutClient";
import type { AdminRole } from "@/types";
import type { Metadata } from "next";
import { ROUTES } from "@/lib/constants/routes";

export const metadata: Metadata = {
  title: { default: "Admin | FootStock", template: "%s | Admin FootStock" },
  robots: "noindex, nofollow",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getAuthUser();

  // Em dev, aceita fs-admin-role cookie como fallback
  let user = auth?.user;
  if (!user && process.env.NODE_ENV === 'development') {
    const cookieStore = await cookies();
    const adminRole = cookieStore.get('fs-admin-role')?.value;
    if (adminRole) {
      // Dummy user object para dev
      user = {
        id: 'dev-user',
        email: 'dev@foot-stock.test',
        name: 'Dev User',
        phone: null,
        birthDate: '',
        favoriteClub: '',
        favoriteClubDisplayName: null,
        userType: 'NORMAL',
        investorProfile: 'INICIANTE',
        planType: 'JOGADOR',
        fsBalance: 0,
        marginBlocked: 0,
        tourCompleted: false,
        adminRole: adminRole as AdminRole,
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  }

  // Logs distinguiveis (task-016): o caminho "sem usuario" ja e coberto por
  // readAuthjsSession ([AUTH_COOKIE] absent/undecodable) e getAuthUser
  // ([AUTH_FAIL] user-not-found). Aqui falta o estado "usuario autenticado mas
  // SEM adminRole" — distinto de sessao ausente: a sessao resolveu, mas a conta
  // nao e staff. Sem valor de cookie/secret/hash, apenas o motivo.
  if (user && !user.adminRole) {
    console.warn("[AUTH_FAIL] reason=authenticated-but-no-adminRole");
  }
  if (!user || !user.adminRole) {
    redirect(ROUTES.LOGIN);
  }

  return (
    // flex-col mobile: header acima do conteúdo. md:flex-row: sidebar ao lado.
    <div className="min-h-dvh md:h-dvh md:overflow-hidden flex flex-col md:flex-row bg-[#0B0E11]">
      <AdminSidebar adminRole={user.adminRole as AdminRole} />

      <AdminLayoutClient userId={user.id}>
        <main className="flex-1 min-w-0 overflow-y-auto pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
      </AdminLayoutClient>
    </div>
  );
}
