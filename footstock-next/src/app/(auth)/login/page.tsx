import { LoginForm } from "@/components/auth/login-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Entrar — FootStock",
};

export default function LoginPage() {
  return <LoginForm />;
}
