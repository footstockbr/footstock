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

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={overlayRef}
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(8,11,18,0.85)" }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={cn(
          "relative bg-[#141210] rounded-t-2xl border-t border-[rgba(201,168,76,.18)] max-h-[80vh] overflow-y-auto animate-slide-up pb-safe",
          className
        )}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-[#2a2010] rounded-full" aria-hidden="true" />
        </div>
        {title && (
          <div className="px-5 py-3 border-b border-[rgba(201,168,76,.1)]">
            <h2 className="text-base font-semibold text-[#f0ead6]">{title}</h2>
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export { Drawer };
