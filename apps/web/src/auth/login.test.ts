import assert from "node:assert/strict";
import { it } from "node:test";
import { signIn, signOut } from "./login.ts";

it("posts credentials through the HTTP endpoint and sanitizes the destination", async () => {
  let called = false;
  const request: typeof fetch = async (input, init) => {
    called = true;
    assert.equal(input, "/api/auth/sign-in/email");
    assert.equal(init?.method, "POST");
    assert.equal(init?.credentials, "same-origin");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      email: "user@example.test",
      password: "test-password",
      rememberMe: true,
    });
    return new Response("{}", { status: 200 });
  };
  assert.deepEqual(
    await signIn("user@example.test", "test-password", "/work", request),
    { ok: true, destination: "/work" },
  );
  assert.equal(called, true);
  assert.deepEqual(
    await signIn("e", "p", "/a/..//evil.test", requestWithoutInspection),
    { ok: true, destination: "/" },
  );
});
const requestWithoutInspection: typeof fetch = async () => new Response("{}");

const respond =
  (status: number): typeof fetch =>
  async () =>
    new Response("private detail", { status });

it("reports rejected credentials without saying which field was wrong", async () => {
  for (const status of [400, 401, 403]) {
    assert.deepEqual(await signIn("e", "p", "/work", respond(status)), {
      ok: false,
      reason: "invalid",
    });
  }
});

it("reports rate limiting separately so the user knows to wait", async () => {
  assert.deepEqual(await signIn("e", "p", "/work", respond(429)), {
    ok: false,
    reason: "rate_limited",
  });
});

it("reports server and network failures as unavailable", async () => {
  assert.deepEqual(await signIn("e", "p", "/work", respond(500)), {
    ok: false,
    reason: "unavailable",
  });
  assert.deepEqual(
    await signIn("e", "p", "/work", async () => {
      throw new Error("private detail");
    }),
    { ok: false, reason: "unavailable" },
  );
});

it("signs out through HTTP and reports success only after the response", async () => {
  assert.equal(
    await signOut(async (input, init) => {
      assert.equal(input, "/api/auth/sign-out");
      assert.equal(init?.method, "POST");
      assert.equal(init?.credentials, "same-origin");
      return new Response("{}");
    }),
    true,
  );
  assert.equal(
    await signOut(async () => new Response("", { status: 500 })),
    false,
  );
  assert.equal(
    await signOut(async () => {
      throw new Error("offline");
    }),
    false,
  );
});
