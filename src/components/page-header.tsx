import { cn } from "@/lib/utils";

// The one page heading used across the app: an optional small line above,
// the title, and an optional description below. Compact on phones.
export function PageHeader({
  eyebrow,
  title,
  description,
  className,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className={cn("space-y-1", className)}>
      {eyebrow ? <p className="text-sm text-muted-foreground">{eyebrow}</p> : null}
      <h1 className="font-display text-3xl leading-tight md:text-4xl">{title}</h1>
      {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      {children}
    </header>
  );
}
