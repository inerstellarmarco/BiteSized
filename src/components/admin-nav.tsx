import Link from "next/link";

const links = [
  { href: "/admin", label: "Family" },
  { href: "/admin/style", label: "Style" },
  { href: "/admin/import", label: "Import" },
  { href: "/admin/review", label: "Review" },
  { href: "/admin/flags", label: "Flags" },
  { href: "/admin/proposals", label: "Placement" },
];

export function AdminNav({ current }: { current: string }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-2 text-sm">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`rounded-full px-3 py-1 ${current === link.href ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
