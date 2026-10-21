import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { moduleAccessDecision } from "../../src/auth/module-access.ts";
import type { SessionResolution } from "../../src/auth/session.ts";

// The non-redirecting module check used by API route handlers (JSON 401/403
// instead of a redirect to /login or the 403 page). Same rules as
// requireModule: a session, no pending password change, a role with access.

const user = (role: "admin" | "staff") => ({
  id: "u1",
  name: "Demo",
  email: "demo@example.test",
  role,
  jobTitle: null,
});

const authenticated = (role: "admin" | "staff"): SessionResolution => ({
  status: "authenticated",
  user: user(role),
  setCookies: [],
});

describe("module access decision", () => {
  it("lets an administrator use settings", () => {
    const decision = moduleAccessDecision(
      authenticated("admin"),
      false,
      "settings",
    );
    assert.equal(decision.status, "authenticated");
    assert.equal(
      decision.status === "authenticated" && decision.session.user.id,
      "u1",
    );
  });

  it("treats anonymous and denied sessions as unauthenticated", () => {
    for (const resolution of [
      { status: "anonymous", setCookies: [] },
      { status: "denied", reason: "banned", setCookies: [] },
      { status: "denied", reason: "invalid_role", setCookies: [] },
    ] as SessionResolution[]) {
      assert.deepEqual(moduleAccessDecision(resolution, false, "settings"), {
        status: "unauthenticated",
      });
    }
  });

  it("forbids a role without the module and a pending password change", () => {
    assert.deepEqual(
      moduleAccessDecision(authenticated("staff"), false, "settings"),
      { status: "forbidden" },
    );
    assert.deepEqual(
      moduleAccessDecision(authenticated("admin"), true, "settings"),
      { status: "forbidden" },
    );
  });
});
