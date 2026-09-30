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
  assert.equal(
    await signIn("user@example.test", "test-password", "/work", request),
    "/work",
  );
  assert.equal(called, true);
  assert.equal(
    await signIn("e", "p", "/a/..//evil.test", requestWithoutInspection),
    "/",
  );
});
const requestWithoutInspection: typeof fetch = async () => new Response("{}");

it("does not expose authentication or network errors", async () => {
  for (const status of [400, 401, 403, 429, 500]) {
    assert.equal(
      await signIn(
        "e",
        "p",
        "/work",
        async () => new Response("private detail", { status }),
      ),
      null,
    );
  }
  assert.equal(
    await signIn("e", "p", "/work", async () => {
      throw new Error("private detail");
    }),
    null,
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
