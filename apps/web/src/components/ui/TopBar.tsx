import Link from "next/link";
import Image from "next/image";
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
    <nav className="flex h-11 shrink-0 items-center justify-between border-b border-gray-700/25 bg-gray-950 px-7">
      <div className="flex items-center gap-2">
        <Button variant="icon" href="/" title="Home">
          <Image src="/icon.svg" alt="Home" width={20} height={20} className="h-5 w-5" />
        </Button>
        <div className="h-4 w-px bg-gray-700/30" />
        <ol
          className="flex items-center gap-1.5 text-xs"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <Link
                href={item.href}
                className="text-amber-400/70 transition-colors hover:text-amber-300"
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
