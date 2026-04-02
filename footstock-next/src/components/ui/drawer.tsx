"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

function Drawer({ isOpen, onClose, title, children, className }: DrawerProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Captura o trigger antes de abrir
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      // Auto-focus no container do drawer
      drawerRef.current?.focus();
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Escape key + focus trap
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      triggerRef.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const titleId = title ? "drawer-title" : undefined;

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={overlayRef}
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(8,11,18,0.85)" }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={drawerRef}
        tabIndex={-1}
        className={cn(
          "relative bg-[#1E2329] rounded-t-2xl border-t border-[rgba(240,185,11,.18)] max-h-[80vh] overflow-y-auto animate-slide-up pb-safe focus:outline-none",
          className
        )}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-[#2B3139] rounded-full" aria-hidden="true" />
        </div>
        {title && (
          <div className="px-5 py-3 border-b border-[rgba(240,185,11,.1)]">
            <h2 id="drawer-title" className="text-base font-semibold text-[#EAECEF]">{title}</h2>
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export { Drawer };
