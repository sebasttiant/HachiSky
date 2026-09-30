import { safeNextPath } from "./next-path.ts";

// Use the HTTP handler: direct auth.api calls bypass its rate limiter.
export async function signIn(
  email: string,
  password: string,
  next: unknown,
  request: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await request("/api/auth/sign-in/email", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, rememberMe: true }),
    });
    return response.ok ? safeNextPath(next) : null;
  } catch {
    return null;
  }
}

export async function signOut(request: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await request("/api/auth/sign-out", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return response.ok;
  } catch {
    return false;
  }
}
