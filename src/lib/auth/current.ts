import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { deleteSession, profileForToken } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { SHORT_SESSION_HOURS, TRUSTED_SESSION_DAYS } from "@/lib/types";

export async function requestIp() {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "local";
  return headerStore.get("x-real-ip") ?? "local";
}

async function cookieSecure() {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  return (await headers()).get("x-forwarded-proto") === "https";
}

export async function getSessionProfile() {
  const token = (await cookies()).get("bs_session")?.value;
  if (!token) return null;
  const db = await getDb();
  const found = await profileForToken(db, token);
  return found?.profile ?? null;
}

export async function requireProfile() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/");
  return profile;
}

export async function setPreferenceCookies(theme: string, fontSize: string) {
  const secure = await cookieSecure();
  const store = await cookies();
  const maxAge = TRUSTED_SESSION_DAYS * 24 * 60 * 60;
  store.set("bs_theme", theme, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge });
  store.set("bs_font", fontSize, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge });
}

export async function setSessionCookie(token: string, trusted: boolean, theme: string, fontSize: string) {
  const secure = await cookieSecure();
  const store = await cookies();
  const maxAge = trusted ? TRUSTED_SESSION_DAYS * 24 * 60 * 60 : SHORT_SESSION_HOURS * 60 * 60;
  store.set("bs_session", token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge });
  store.set("bs_theme", theme, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: TRUSTED_SESSION_DAYS * 24 * 60 * 60 });
  store.set("bs_font", fontSize, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: TRUSTED_SESSION_DAYS * 24 * 60 * 60 });
}

export async function clearSessionCookie() {
  const token = (await cookies()).get("bs_session")?.value;
  if (token) {
    const db = await getDb();
    await deleteSession(db, token);
  }
  const store = await cookies();
  store.delete("bs_session");
}
