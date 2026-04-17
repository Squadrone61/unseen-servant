import type { ReactNode } from "react";

interface Tab<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface TabBarProps<T extends string = string> {
  tabs: Tab<T>[];
  active: T;
  onChange: (value: T) => void;
  /** Stretch tabs to fill width equally */
  stretch?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function TabBar<T extends string = string>({
  tabs,
  active,
  onChange,
  stretch,
  size = "md",
  className,
}: TabBarProps<T>) {
  return (
    <div className={`flex border-b border-gray-700 ${className ?? ""}`}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={`${stretch ? "flex-1" : ""} ${
            size === "sm" ? "px-3 py-1.5" : "px-4 py-2.5"
          } flex items-center justify-center gap-1.5 text-xs font-medium transition-colors ${
            active === tab.value
              ? "border-b-2 border-amber-400/70 text-amber-300"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
