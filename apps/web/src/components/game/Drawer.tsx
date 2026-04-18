import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  title: string;
  width?: string;
  children: ReactNode;
}

export function Drawer({
  open,
  onClose,
  side = "right",
  title,
  width = "w-80",
  children,
}: DrawerProps) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div
        className={`fixed top-0 ${side === "right" ? "right-0" : "left-0"} z-50
                    ${width} border- flex h-full flex-col
                    border-gray-700/40 bg-gray-900 shadow-2xl`}
      >
        {/* Header */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-gray-700/30 px-4">
          <span
            className="text-sm font-medium tracking-wider text-gray-400 uppercase"
            style={{ fontFamily: "var(--font-cinzel)" }}
          >
            {title}
          </span>
          <Button variant="icon" onClick={onClose}>
            <span className="text-lg leading-none">×</span>
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}
