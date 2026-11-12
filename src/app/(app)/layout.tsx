import { requireProfile } from "@/lib/auth/current";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  return <AppShell name={profile.name}>{children}</AppShell>;
}
