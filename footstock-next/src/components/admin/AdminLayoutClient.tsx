"use client";
// ============================================================================
// Foot Stock — AdminLayoutClient
// Timer de inatividade 30min: renova TTL Redis a cada interação, redireciona ao expirar.
// Rastreabilidade: INT-087, TASK-1/ST006
// ============================================================================

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";

interface AdminLayoutClientProps {
  userId: string;
  children: React.ReactNode;
}

const ACTIVITY_EVENTS = [
  "mousemove",
  "keydown",
  "click",
  "touchstart",
  "scroll",
] as const;

const DEBOUNCE_MS = 30_000; // Renova Redis no máximo 1x a cada 30s
const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
const CHECK_INTERVAL_MS = 60_000; // Verifica expiração a cada 1min

export function AdminLayoutClient({
  userId,
  children,
}: AdminLayoutClientProps) {
  const router = useRouter();
  const lastActivityRef = useRef<number>(Date.now());
  const lastRenewRef = useRef<number>(0);
  const timeoutCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const renewActivity = useCallback(async () => {
    const now = Date.now();
    lastActivityRef.current = now;

    // Debounce: não chamar Redis em cada evento
    if (now - lastRenewRef.current < DEBOUNCE_MS) return;
    lastRenewRef.current = now;

    try {
      await fetch("/api/v1/admin/session/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });
    } catch {
      // Falha silenciosa — o Redis irá expirar naturalmente
    }
  }, [userId]);

  const handleTimeout = useCallback(() => {
    if (timeoutCheckRef.current) {
      clearInterval(timeoutCheckRef.current);
    }
    router.push(ROUTES.LOGIN);
  }, [router]);

  useEffect(() => {
    void renewActivity();

    const handleActivity = () => void renewActivity();
    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    timeoutCheckRef.current = setInterval(() => {
      const inactive = Date.now() - lastActivityRef.current;
      if (inactive >= TIMEOUT_MS) {
        handleTimeout();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (timeoutCheckRef.current) {
        clearInterval(timeoutCheckRef.current);
      }
    };
  }, [renewActivity, handleTimeout]);

  return <>{children}</>;
}
