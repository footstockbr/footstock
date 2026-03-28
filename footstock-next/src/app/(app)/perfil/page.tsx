import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { ProfileInfo } from "@/components/profile/profile-info";
import { PlanCard } from "@/components/profile/plan-card";
import { TourReactivation } from "@/components/profile/tour-reactivation";
import { LGPDActions } from "@/components/profile/lgpd-actions";
import { ROUTES } from "@/lib/constants/routes";

export const metadata: Metadata = {
  title: "Meu Perfil — Foot Stock",
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
      <h1 className="text-lg font-bold text-[#f0ead6]">Meu Perfil</h1>

      <ProfileInfo user={user} />

      <PlanCard user={user} />

      <TourReactivation />

      <LGPDActions />

      {/* Espaço para nav bottom */}
      <div className="h-4" />
    </div>
  );
}
