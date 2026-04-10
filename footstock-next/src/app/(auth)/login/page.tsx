import { LoginForm } from "@/components/auth/login-form";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Entrar — Foot Stock",
};

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMINISTRADOR", "MONITOR", "EDITOR", "MODERADOR"];

export default async function LoginPage() {
  const cookieStore = await cookies();
  const adminRole = cookieStore.get("fs-admin-role")?.value;

  if (adminRole && ADMIN_ROLES.includes(adminRole)) {
    redirect("/admin");
  }
  if (adminRole === "CLUB_PARTNER") {
    redirect("/club");
  }

  return <LoginForm />;
}
