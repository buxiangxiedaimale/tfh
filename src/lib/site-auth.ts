export const AUTH_COOKIE = "flowtodo_auth";

export function sitePassword(): string {
  return process.env.SITE_PASSWORD?.trim() ?? "";
}

export function siteAuthEnabled(): boolean {
  return sitePassword().length > 0;
}

export async function makeAuthToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(`flowtodo:${password}`)
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyAuthCookie(
  cookieValue: string | undefined
): Promise<boolean> {
  if (!siteAuthEnabled()) return true;
  if (!cookieValue) return false;
  const expected = await makeAuthToken(sitePassword());
  return cookieValue === expected;
}
