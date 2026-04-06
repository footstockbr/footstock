"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMINISTRADOR", "MONITOR", "EDITOR", "MODERADOR"];

/**
 * Client-side safety net: redirects admin/club users away from the (app) layout.
 * Covers existing sessions where the fs-admin-role cookie was not yet set.
 * For new logins, the login form + middleware already handle the redirect.
 */
export function AdminRouteGuard() {
  const router = useRouter();

  useEffect(() => {
    const cookieValue = document.cookie
      .split("; ")
      .find((c) => c.startsWith("fs-admin-role="))
      ?.split("=")[1];

    if (cookieValue && ADMIN_ROLES.includes(cookieValue)) {
      router.replace(ROUTES.ADMIN);
      return;
    }
    if (cookieValue === "CLUB_PARTNER") {
      router.replace(ROUTES.CLUB);
      return;
    }

    // No cookie — fetch user profile to check admin role
    if (!cookieValue) {
      fetch("/api/v1/users/me")
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          const role = json?.data?.adminRole;
          if (!role) return;
          document.cookie = `fs-admin-role=${role}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
          if (ADMIN_ROLES.includes(role)) {
            router.replace(ROUTES.ADMIN);
          } else if (role === "CLUB_PARTNER") {
            router.replace(ROUTES.CLUB);
          }
        })
        .catch(() => {});
    }
  }, [router]);

  return null;
}
