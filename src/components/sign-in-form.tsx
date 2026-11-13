"use client";

import { useState } from "react";
import { useActionState } from "react";
import { signInAction, type SignInState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

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
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-ring",
                selected === item.id ? "border-primary bg-secondary shadow-sm" : "border-border bg-card hover:border-primary/50",
              )}
            >
              <input type="radio" name="profilePick" className="sr-only" checked={selected === item.id} onChange={() => setSelected(item.id)} />
              <span
                aria-hidden
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display text-lg",
                  selected === item.id ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
                )}
              >
                {item.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{item.name}</span>
                <span className="block text-xs text-muted-foreground">{item.isAdmin ? "Admin" : "Learner"}</span>
              </span>
              {selected === item.id ? <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden /> : null}
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
          className="h-12"
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
