import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryAdapter } from "better-auth/adapters/memory";
import { getCookies } from "better-auth/cookies";
import { type AuthEnv, loadAuthEnv } from "../shared/config/env.ts";
import { ROLE_NAMES } from "./access-control.ts";
import { createAuth } from "./auth.ts";

const SECRET = "test-only-secret-0123456789abcdef-0123456789";

function authEnv(overrides: Record<string, string> = {}): AuthEnv {
  return loadAuthEnv({
    APP_ENV: "test",
    BETTER_AUTH_URL: "http://localhost:3100",
    BETTER_AUTH_SECRET: SECRET,
    ...overrides,
  });
}

function memoryAuth(env: AuthEnv = authEnv()) {
  const database = memoryAdapter({
    user: [],
    session: [],
    account: [],
    verification: [],
  });
  return createAuth({ env, database });
}

const PASSWORD = "correct-horse-battery-staple-0";

async function expectApiError(promise: Promise<unknown>, status: number) {
  await assert.rejects(promise, (error: unknown) => {
    const apiError = error as { statusCode?: number; status?: string };
    assert.equal(apiError.statusCode, status);
    return true;
  });
}

describe("roles", () => {
  it("exposes exactly the admin and staff roles", () => {
    assert.deepEqual([...ROLE_NAMES].sort(), ["admin", "staff"]);
  });

  it("gives a user created without a role the staff role", async () => {
    const auth = memoryAuth();
    const { user } = await auth.api.createUser({
      body: {
        email: "staff-default@example.test",
        password: PASSWORD,
        name: "Default Staff",
      },
    });
    assert.equal(user.role, "staff");
  });

  it("lets a server-side createUser set the admin role", async () => {
    const auth = memoryAuth();
    const { user } = await auth.api.createUser({
      body: {
        email: "admin@example.test",
        password: PASSWORD,
        name: "Admin",
        role: "admin",
      },
    });
    assert.equal(user.role, "admin");
  });

  it("never accepts the user role at creation", async () => {
    const auth = memoryAuth();
    // The role type is a closed union, so invalid roles need a cast to reach
    // the runtime check that a raw HTTP body would hit.
    const invalidBodies: Array<Record<string, unknown>> = [
      { role: "user" },
      { role: ["admin", "user"] },
      { data: { role: "user" } },
      { role: "superuser" },
    ];
    for (const body of invalidBodies) {
      await expectApiError(
        auth.api.createUser({
          body: {
            email: `no-user-role-${Math.random().toString(36).slice(2)}@example.test`,
            password: PASSWORD,
            name: "Nope",
            ...body,
          } as never,
        }),
        400,
      );
    }
  });

  it("never lets an admin set the user role afterwards", async () => {
    const auth = memoryAuth();
    await auth.api.createUser({
      body: {
        email: "admin2@example.test",
        password: PASSWORD,
        name: "Admin Two",
        role: "admin",
      },
    });
    const { user: target } = await auth.api.createUser({
      body: {
        email: "target@example.test",
        password: PASSWORD,
        name: "Target",
      },
    });
    const signIn = await auth.api.signInEmail({
      body: { email: "admin2@example.test", password: PASSWORD },
      asResponse: true,
    });
    const cookie = signIn.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const headers = new Headers({
      cookie,
      origin: "http://localhost:3100",
    });
    await expectApiError(
      auth.api.setRole({
        body: { userId: target.id, role: "user" as never },
        headers,
      }),
      400,
    );
    const ok = await auth.api.setRole({
      body: { userId: target.id, role: "admin" },
      headers,
    });
    assert.equal(ok.user.role, "admin");
  });
});

describe("account creation surface", () => {
  it("keeps public sign-up disabled", async () => {
    const auth = memoryAuth();
    await expectApiError(
      auth.api.signUpEmail({
        body: {
          email: "self-signup@example.test",
          password: PASSWORD,
          name: "Self Signup",
        },
      }),
      400,
    );
  });
});

describe("jobTitle", () => {
  it("is stored separately from the role and the full name", async () => {
    const auth = memoryAuth();
    const { user } = await auth.api.createUser({
      body: {
        email: "titled@example.test",
        password: PASSWORD,
        name: "Ana Maria Perez Gomez",
        data: { jobTitle: "Insurance advisor" },
      },
    });
    assert.equal(user.name, "Ana Maria Perez Gomez");
    assert.equal(user.role, "staff");
    assert.equal((user as { jobTitle?: string }).jobTitle, "Insurance advisor");
  });

  it("is optional at creation", async () => {
    const auth = memoryAuth();
    const { user } = await auth.api.createUser({
      body: {
        email: "untitled@example.test",
        password: PASSWORD,
        name: "No Title",
      },
    });
    assert.equal(user.role, "staff");
  });

  it("cannot be changed by the user through the self-service update", async () => {
    const auth = memoryAuth();
    await auth.api.createUser({
      body: {
        email: "self-update@example.test",
        password: PASSWORD,
        name: "Self Update",
        data: { jobTitle: "Original" },
      },
    });
    const signIn = await auth.api.signInEmail({
      body: { email: "self-update@example.test", password: PASSWORD },
      asResponse: true,
    });
    const headers = new Headers({
      cookie: signIn.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; "),
      origin: "http://localhost:3100",
    });
    await expectApiError(
      auth.api.updateUser({
        body: { jobTitle: "Promoted" } as never,
        headers,
      }),
      400,
    );
    const session = await auth.api.getSession({ headers });
    assert.ok(session, "session must resolve");
    assert.equal((session.user as { jobTitle?: string }).jobTitle, "Original");
  });
});

function parseSetCookie(raw: string) {
  const [pair = "", ...attrs] = raw.split(";").map((part) => part.trim());
  const eq = pair.indexOf("=");
  const attributes = new Map<string, string | true>();
  for (const attr of attrs) {
    const i = attr.indexOf("=");
    if (i === -1) attributes.set(attr.toLowerCase(), true);
    else attributes.set(attr.slice(0, i).toLowerCase(), attr.slice(i + 1));
  }
  return { name: pair.slice(0, eq), attributes };
}

async function sessionSetCookie(auth: ReturnType<typeof memoryAuth>) {
  await auth.api.createUser({
    body: {
      email: "cookie@example.test",
      password: PASSWORD,
      name: "Cookie User",
    },
  });
  const response = await auth.api.signInEmail({
    body: { email: "cookie@example.test", password: PASSWORD },
    asResponse: true,
  });
  const raw = response.headers
    .getSetCookie()
    .find((c) => c.includes("session_token"));
  assert.ok(raw, "session cookie must be set");
  return parseSetCookie(raw);
}

describe("cookies", () => {
  const production = () =>
    memoryAuth(
      authEnv({
        APP_ENV: "production",
        BETTER_AUTH_URL: "https://hachisky.example.test",
      }),
    );

  it("production over HTTPS: __Secure- prefix, Secure, HttpOnly, Path=/, no Domain", async () => {
    const auth = production();
    const config = getCookies(auth.options).sessionToken;
    assert.equal(config.name, "__Secure-better-auth.session_token");
    assert.equal(config.attributes.secure, true);
    assert.equal(config.attributes.httpOnly, true);
    assert.equal(config.attributes.path, "/");
    assert.equal(config.attributes.domain, undefined);
    assert.equal(config.attributes.sameSite, "lax");

    const emitted = await sessionSetCookie(auth);
    assert.equal(emitted.name, "__Secure-better-auth.session_token");
    assert.equal(emitted.attributes.get("secure"), true);
    assert.equal(emitted.attributes.get("httponly"), true);
    assert.equal(emitted.attributes.get("path"), "/");
    assert.equal(emitted.attributes.has("domain"), false);
    assert.equal(
      String(emitted.attributes.get("samesite")).toLowerCase(),
      "lax",
    );
  });

  it("development over HTTP: no prefix and no Secure attribute, still HttpOnly and host-only", async () => {
    const auth = memoryAuth(authEnv({ APP_ENV: "development" }));
    const config = getCookies(auth.options).sessionToken;
    assert.equal(config.name, "better-auth.session_token");
    assert.equal(config.attributes.secure, false);
    assert.equal(config.attributes.httpOnly, true);
    assert.equal(config.attributes.domain, undefined);

    const emitted = await sessionSetCookie(auth);
    assert.equal(emitted.name, "better-auth.session_token");
    assert.equal(emitted.attributes.has("secure"), false);
    assert.equal(emitted.attributes.get("httponly"), true);
    assert.equal(emitted.attributes.get("path"), "/");
    assert.equal(emitted.attributes.has("domain"), false);
  });

  it("sets the security options explicitly instead of relying on library defaults", () => {
    const prod = production().options;
    assert.equal(prod.advanced?.useSecureCookies, true);
    assert.equal(prod.advanced?.cookiePrefix, undefined);
    assert.equal(prod.advanced?.crossSubDomainCookies?.enabled, false);
    assert.equal(prod.session?.cookieCache?.enabled, false);

    const dev = memoryAuth(authEnv({ APP_ENV: "development" })).options;
    assert.equal(dev.advanced?.useSecureCookies, false);
    assert.equal(dev.advanced?.cookiePrefix, undefined);
    assert.equal(dev.advanced?.crossSubDomainCookies?.enabled, false);
    assert.equal(dev.session?.cookieCache?.enabled, false);
  });

  it("trusts only its own origin", () => {
    assert.deepEqual(production().options.trustedOrigins, [
      "https://hachisky.example.test",
    ]);
  });
});

describe("mounting", () => {
  it("does not mount an /api/auth route handler in the app", async () => {
    const { existsSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const appApiAuth = fileURLToPath(
      new URL("../../app/api/auth", import.meta.url),
    );
    assert.equal(existsSync(appApiAuth), false);
  });
});
