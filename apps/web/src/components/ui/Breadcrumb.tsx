import Link from "next/link";
import type { ReactNode } from "react";

interface BreadcrumbItem {
  label: string;
  href: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  current: string;
  children?: ReactNode;
}

export function Breadcrumb({ items, current, children }: BreadcrumbProps) {
  return (
    <nav className="mb-4">
      <div className="flex items-center justify-between">
        <ol
          className="flex items-center gap-1.5 text-sm"
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
        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>
      <div className="h-px bg-gradient-to-r from-amber-500/30 via-gray-700/50 to-transparent mt-2" />
    </nav>
  );
}
