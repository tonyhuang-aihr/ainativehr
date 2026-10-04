import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

export const LOCK_THRESHOLD = 5;
export const LOCK_MINUTES = 15;

export function passwordIssue(password: string): string | null {
  if (password.length < 8) return "密码至少 8 位";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "密码需要同时包含字母和数字";
  return null;
}

export function nextLock(failures: number, now: number): { failures: number; lockedUntil: number | null } {
  const count = failures + 1;
  if (count >= LOCK_THRESHOLD) return { failures: count, lockedUntil: now + LOCK_MINUTES * 60 * 1000 };
  return { failures: count, lockedUntil: null };
}

export function lockActive(lockedUntil: number | null, now: number): boolean {
  return lockedUntil != null && lockedUntil > now;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 32)) as Buffer;
  return `scrypt$${salt}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, salt, hex] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hex) return false;
  const hash = (await scrypt(password, salt, 32)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  if (hash.length !== expected.length) return false;
  return timingSafeEqual(hash, expected);
}
