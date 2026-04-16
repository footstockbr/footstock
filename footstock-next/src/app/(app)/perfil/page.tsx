import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthUser } from "@/lib/auth";
import { ProfileInfo } from "@/components/profile/profile-info";
import { PlanCard } from "@/components/profile/plan-card";
import { AffiliateCard } from "@/components/profile/affiliate-card";
import { TourReactivation } from "@/components/profile/tour-reactivation";
import { LGPDActions } from "@/components/profile/lgpd-actions";
import { PushPermissionRequest } from "@/components/notifications/PushPermissionRequest";
import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";
import { ROUTES } from "@/lib/constants/routes";

export const metadata: Metadata = {
  title: "Meu Perfil — FootStock",
  description: "Gerencie seu perfil, plano e privacidade.",
};

export default async function PerfilPage() {
  const auth = await getAuthUser();

  if (!auth) {
    redirect(ROUTES.LOGIN);
  }

  const { user } = auth;

  return (
    <div data-testid="perfil-page" className="px-4 py-4 flex flex-col gap-4">
      <h1 className="text-lg font-bold text-[#EAECEF]">Meu Perfil</h1>

      <ProfileInfo user={user} />

      <AffiliateCard />

      <PlanCard user={user} />

      <TourReactivation />

      <PushPermissionRequest />

      <NotificationPreferences />

      <LGPDActions />

      {/* Trofeus de ligas PRO */}
      <Link
        href="/perfil/trofeus"
        className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#1E2329] border border-white/10 hover:border-[#F0B90B]/40 transition-colors"
        data-testid="link-trofeus"
      >
        <div>
          <p className="text-sm font-semibold text-[#EAECEF]">Meus Troféus</p>
          <p className="text-xs text-gray-500 mt-0.5">Conquistas em Ligas PRO</p>
        </div>
        <span className="text-[#F0B90B] text-lg">&#9654;</span>
      </Link>

      {/* Espaço para nav bottom */}
      <div className="h-4" />
    </div>
  );
}
