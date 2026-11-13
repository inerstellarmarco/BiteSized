"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, House, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { RefreshOnReturn } from "@/components/refresh-on-return";

const links = [
  { href: "/home", label: "Home", icon: House },
  { href: "/course", label: "Course", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ name, children }: { name: string; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/home" className="font-display text-2xl italic leading-none">
            Bite Sized
          </Link>
          <nav className="hidden items-center gap-5 text-sm md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname.startsWith(link.href) ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-1.5 transition-colors hover:text-primary",
                  pathname.startsWith(link.href) && "bg-secondary font-semibold text-primary",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <p className="text-sm text-muted-foreground">{name}</p>
        </div>
      </header>
      <RefreshOnReturn />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 pb-28 md:pb-12">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur md:hidden">
        <ul className="mx-auto flex max-w-lg justify-around px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {links.map((link) => {
            const Icon = link.icon;
            const active = pathname.startsWith(link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-w-16 flex-col items-center gap-1 rounded-2xl px-4 py-1.5 text-xs transition-colors",
                    active ? "bg-secondary font-semibold text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon aria-hidden className="h-5 w-5" />
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
