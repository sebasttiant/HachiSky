import { safeNextPath } from "./next-path.ts";

// "invalid" covers an unknown email and a wrong password alike, so the UI
// cannot reveal whether an account exists.
export type SignInFailure = "invalid" | "rate_limited" | "unavailable";

export type SignInResult =
  | { ok: true; destination: string }
  | { ok: false; reason: SignInFailure };

function failureFor(status: number): SignInFailure {
  if (status === 429) return "rate_limited";
  return status >= 500 ? "unavailable" : "invalid";
}

// Use the HTTP handler: direct auth.api calls bypass its rate limiter.
export async function signIn(
  email: string,
  password: string,
  next: unknown,
  request: typeof fetch = fetch,
): Promise<SignInResult> {
  try {
    const response = await request("/api/auth/sign-in/email", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, rememberMe: true }),
    });
    return response.ok
      ? { ok: true, destination: safeNextPath(next) }
      : { ok: false, reason: failureFor(response.status) };
  } catch {
    return { ok: false, reason: "unavailable" };
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
