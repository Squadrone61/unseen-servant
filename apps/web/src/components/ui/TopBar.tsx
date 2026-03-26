import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";

interface BreadcrumbItem {
  label: string;
  href: string;
}

interface TopBarProps {
  items: BreadcrumbItem[];
  current: string;
  children?: ReactNode;
}

export function TopBar({ items, current, children }: TopBarProps) {
  return (
    <nav className="flex items-center justify-between h-11 px-7 bg-gray-950 border-b border-gray-700/25 shrink-0">
      <div className="flex items-center gap-2">
        <Button variant="icon" href="/" title="Home">
          <img src="/icon.svg" alt="Home" className="w-5 h-5" />
        </Button>
        <div className="w-px h-4 bg-gray-700/30" />
        <ol
          className="flex items-center gap-1.5 text-xs"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <Link
                href={item.href}
                className="text-amber-400/70 hover:text-amber-300 transition-colors"
              >
                {item.label}
              </Link>
              <span className="text-gray-600 select-none">&rsaquo;</span>
            </li>
          ))}
          <li className="text-gray-400">{current}</li>
        </ol>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </nav>
  );
}
