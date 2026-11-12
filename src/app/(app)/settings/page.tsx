import { requireProfile } from "@/lib/auth/current";
import { SettingsForm } from "@/components/settings-form";
import type { FontSize, ThemePreference } from "@/lib/types";

export default async function SettingsPage() {
  const profile = await requireProfile();
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-4xl">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">These stay with {profile.name}.</p>
      <div className="mt-6">
        <SettingsForm
          theme={(profile.theme ?? "system") as ThemePreference}
          fontSize={(profile.fontSize ?? "md") as FontSize}
          isAdmin={profile.isAdmin}
          adminPin={profile.isAdmin}
        />
      </div>
    </div>
  );
}
