import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

export const COOKIE = "openalternance";
export const SESSION_DAYS = 30;

// Hash both sides first: timingSafeEqual needs equal lengths, and this hides the password length.
const digest = (value: string) => createHash("sha256").update(value).digest();

export function passwordMatches(input: string, expected: string): boolean {
  return timingSafeEqual(digest(input), digest(expected));
}

// Random 256-bit token, stored server-side in `sessions`: logout deletes the row, so the cookie stops working.
export const newSessionToken = (): string => randomBytes(32).toString("hex");

export function sessionTokenFrom(req: Request): string {
  const cookie = (req.headers.get("cookie") ?? "").split(/;\s*/).find((part) => part.startsWith(`${COOKIE}=`));
  return cookie?.slice(COOKIE.length + 1) ?? "";
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`;
}

export const clearSessionCookie = (): string => `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
