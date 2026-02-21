"use client";

// src/components/NavLinks.tsx
// ============================================================
// Shared navigation links for all internal pages.
// Uses usePathname() to highlight the current active view.
// ============================================================

import Link from "next/link";
import { usePathname } from "next/navigation";

const VIEWS = [
  { path: "/customer",  label: "Customer"  },
  { path: "/barista",   label: "Barista"   },
  { path: "/owner",     label: "Dashboard" },
] as const;

interface NavLinksProps {
  /**
   * subtle=true  → used on the customer view where nav must not compete
   *                with the ordering experience (lower base opacity)
   * subtle=false → used on barista/owner internal tools (more visible)
   */
  subtle?: boolean;
}

export function NavLinks({ subtle = false }: NavLinksProps) {
  const pathname = usePathname();

  return (
    <>
      {VIEWS.map(({ path, label }) => {
        const isActive = pathname === path;

        if (isActive) {
          return (
            <span
              key={path}
              className="text-xs font-medium"
              style={{
                color: "#FAF3E8",
                opacity: subtle ? 0.7 : 1,
                textDecoration: "underline",
                textUnderlineOffset: "3px",
                textDecorationColor: subtle ? "#FAF3E8" : "#D4943A",
              }}
            >
              {label}
            </span>
          );
        }

        return (
          <Link
            key={path}
            href={path}
            className="text-xs transition-opacity hover:opacity-80"
            style={{
              color: "#FAF3E8",
              opacity: subtle ? 0.35 : 0.45,
            }}
          >
            {label}
          </Link>
        );
      })}
    </>
  );
}
