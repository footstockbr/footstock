// Type augmentation para Auth.js v5 (next-auth@5.0.0-beta.31).
// Estende Session.user, User e JWT com os campos do dominio Foot Stock
// expostos via callbacks `jwt` e `session` (ver src/lib/authjs/config.ts).
//
// Rastreabilidade: TASK-002 (M054) do loop migrate-supabase-auth-to-authjs-railway.

import type { DefaultSession, DefaultUser } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";
import type { AdminRole, PlanType } from "@/lib/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      adminRole: AdminRole | null;
      planType: PlanType;
      userType: string;
      favoriteClub: string | null;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    id: string;
    adminRole?: AdminRole | null;
    planType?: PlanType;
    userType?: string;
    favoriteClub?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    adminRole?: AdminRole | null;
    planType?: PlanType;
    userType?: string;
    favoriteClub?: string | null;
  }
}
