"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { changePinAction, savePreferencesAction, signOutAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FontSize, ThemePreference } from "@/lib/types";

const themes: { id: ThemePreference; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "Match device" },
];

const fonts: { id: FontSize; label: string }[] = [
  { id: "sm", label: "Smaller" },
  { id: "md", label: "Default" },
  { id: "lg", label: "Larger" },
];

export function SettingsForm({
  theme,
  fontSize,
  isAdmin,
  adminPin,
}: {
  theme: ThemePreference;
  fontSize: FontSize;
  isAdmin: boolean;
  adminPin: boolean;
}) {
  const router = useRouter();
  const [pinState, pinAction, pinPending] = useActionState(changePinAction, null);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-display text-2xl">Theme</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {themes.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant={theme === item.id ? "default" : "outline"}
              onClick={() => {
                void savePreferencesAction(item.id, fontSize).then(() => router.refresh());
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </section>
      <section>
        <h2 className="font-display text-2xl">Text size</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {fonts.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant={fontSize === item.id ? "default" : "outline"}
              onClick={() => {
                void savePreferencesAction(theme, item.id).then(() => router.refresh());
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </section>
      <section>
        <h2 className="font-display text-2xl">Change PIN</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {adminPin ? "Admins can use 4–12 digits or a passphrase of at least 8 characters." : "Use 4 to 8 digits."}
        </p>
        <form action={pinAction} className="mt-3 grid max-w-sm gap-3">
          <div>
            <Label htmlFor="current">Current PIN</Label>
            <Input id="current" name="current" type="password" autoComplete="current-password" required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="next">New PIN</Label>
            <Input id="next" name="next" type="password" autoComplete="new-password" required className="mt-1" />
          </div>
          {pinState?.error ? <p className="text-sm text-destructive">{pinState.error}</p> : null}
          {pinState?.ok ? <p className="text-sm text-success">PIN updated.</p> : null}
          <Button type="submit" disabled={pinPending}>
            {pinPending ? "Saving…" : "Update PIN"}
          </Button>
        </form>
      </section>
      <section>
        <h2 className="font-display text-2xl">Install</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>iPhone: Share, then Add to Home Screen.</li>
          <li>Android: Chrome menu, then Install app.</li>
          <li>Windows: Edge or Chrome menu, then Install Bite Sized.</li>
        </ul>
        <p className="mt-2 text-sm text-muted-foreground">The app needs a connection. It does not keep a copy of the course for offline reading.</p>
      </section>
      {isAdmin ? (
        <p>
          <a className="underline decoration-primary/50 underline-offset-4" href="/admin">
            Family and admin settings
          </a>
        </p>
      ) : null}
      <form action={signOutAction}>
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </div>
  );
}
