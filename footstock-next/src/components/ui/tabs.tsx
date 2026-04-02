"use client";

import { createContext, useContext, useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  registerTab: (value: string, el: HTMLButtonElement | null) => void;
  getTabValues: () => string[];
}

const TabsContext = createContext<TabsContextValue>({
  activeTab: "",
  setActiveTab: () => {},
  registerTab: () => {},
  getTabValues: () => [],
});

function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
  className,
}: {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue || "");
  const activeTab = value ?? internalValue;
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const setActiveTab = (tab: string) => {
    if (!value) setInternalValue(tab);
    onValueChange?.(tab);
  };

  const registerTab = useCallback((tabValue: string, el: HTMLButtonElement | null) => {
    if (el) {
      tabRefs.current.set(tabValue, el);
    } else {
      tabRefs.current.delete(tabValue);
    }
  }, []);

  const getTabValues = useCallback(() => Array.from(tabRefs.current.keys()), []);

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, registerTab, getTabValues }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

function TabsList({
  children,
  className,
  label = "Abas",
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center bg-[#181A20] rounded-lg p-1 gap-1",
        className
      )}
      role="tablist"
      aria-label={label}
    >
      {children}
    </div>
  );
}

function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { activeTab, setActiveTab, registerTab, getTabValues } = useContext(TabsContext);
  const isActive = activeTab === value;

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const tabValues = getTabValues();
    const currentIndex = tabValues.indexOf(value);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;
    if (e.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabValues.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabValues.length) % tabValues.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = tabValues.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    const nextValue = tabValues[nextIndex];
    setActiveTab(nextValue);
    // Focus the next tab button via context ref map
    const el = (e.currentTarget.closest('[role="tablist"]') as HTMLElement)
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex];
    el?.focus();
  }

  return (
    <button
      ref={(el) => registerTab(value, el)}
      role="tab"
      id={`tab-${value}`}
      aria-selected={isActive}
      aria-controls={`panel-${value}`}
      tabIndex={isActive ? 0 : -1}
      onClick={() => setActiveTab(value)}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-150",
        isActive
          ? "bg-[#F0B90B] text-[#0B0E11]"
          : "text-[#929AA5] hover:text-[#EAECEF]",
        className
      )}
    >
      {children}
    </button>
  );
}

function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { activeTab } = useContext(TabsContext);
  const isActive = activeTab === value;

  return (
    <div
      role="tabpanel"
      id={`panel-${value}`}
      aria-labelledby={`tab-${value}`}
      hidden={!isActive}
      tabIndex={0}
      className={cn("focus:outline-none", className)}
    >
      {children}
    </div>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
