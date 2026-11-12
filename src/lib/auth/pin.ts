import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCb);

export function validatePinFormat(pin: string, isAdmin: boolean): string | null {
  const value = pin.normalize("NFKC");
  if (isAdmin) {
    const digits = /^\d{4,12}$/.test(value);
    const passphrase = /^[\p{L}\p{N} .,'!?\-]{8,80}$/u.test(value) && /\D/u.test(value);
    if (!digits && !passphrase) {
      return "An admin PIN is 4–12 digits, or a passphrase of at least 8 characters.";
    }
    return null;
  }
  if (!/^\d{4,8}$/.test(value)) {
    return "Use a PIN of 4 to 8 digits.";
  }
  return null;
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scrypt(pin.normalize("NFKC"), salt, 32)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPinHash(pin: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const actual = (await scrypt(pin.normalize("NFKC"), Buffer.from(saltHex, "hex"), 32)) as Buffer;
  const expected = Buffer.from(hashHex, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
