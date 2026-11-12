"use client";

import { useState } from "react";
import { useActionState } from "react";
import { signInAction, type SignInState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProfileCard = { id: string; name: string; isAdmin: boolean };

export function SignInForm({ profiles }: { profiles: ProfileCard[] }) {
  const [selected, setSelected] = useState<string>(profiles[0]?.id ?? "");
  const [state, action, pending] = useActionState(signInAction, null as SignInState);
  const profile = profiles.find((item) => item.id === selected);

  if (profiles.length === 0) {
    return (
      <p className="text-muted-foreground">
        No profiles yet. The first run should create Eric. If the database was emptied, restart the app.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <fieldset>
        <legend className="sr-only">Choose a profile</legend>
        <div className="grid gap-2">
          {profiles.map((item) => (
            <label
              key={item.id}
              data-testid={`profile-${item.name}`}
              className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 ${selected === item.id ? "border-primary bg-secondary" : "border-border bg-card"}`}
            >
              <span className="font-medium">{item.name}</span>
              <span className="flex items-center gap-3 text-sm text-muted-foreground">
                {item.isAdmin ? "Admin" : "Learner"}
                <input
                  type="radio"
                  name="profilePick"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={selected === item.id}
                  onChange={() => setSelected(item.id)}
                />
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <input type="hidden" name="profileId" value={selected} />
      <div className="space-y-2">
        <Label htmlFor="pin">{profile?.isAdmin ? "PIN or passphrase" : "PIN"}</Label>
        <Input
          id="pin"
          name="pin"
          data-testid="pin-input"
          type={profile?.isAdmin ? "text" : "password"}
          inputMode={profile?.isAdmin ? "text" : "numeric"}
          autoComplete="current-password"
          autoCapitalize="off"
          required
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? "pin-error" : undefined}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="trusted" defaultChecked className="h-4 w-4 accent-[var(--primary)]" />
        Keep me signed in on this device
      </label>
      {state?.error ? (
        <p id="pin-error" role="alert" className="text-sm text-destructive" data-testid="pin-error">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" data-testid="pin-submit" disabled={pending || !selected} className="w-full">
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
