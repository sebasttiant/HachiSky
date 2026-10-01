import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseCreateUser,
  parseResetPassword,
  parseUpdateUser,
} from "./forms.ts";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const valid = {
  name: "  Luis   Gómez ",
  email: "  Luis@Example.COM ",
  jobTitle: " Asesor comercial ",
  role: "staff",
  temporaryPassword: "temporal-segura-2026",
};

describe("parseCreateUser", () => {
  it("normalizes name, email and job title", () => {
    assert.deepEqual(parseCreateUser(form(valid)), {
      ok: true,
      data: {
        name: "Luis Gómez",
        email: "luis@example.com",
        jobTitle: "Asesor comercial",
        role: "staff",
        temporaryPassword: "temporal-segura-2026",
      },
    });
  });

  it("treats an empty job title as none", () => {
    const result = parseCreateUser(form({ ...valid, jobTitle: "   " }));
    assert.equal(result.ok && result.data.jobTitle, null);
  });

  it("reports one Spanish message per invalid field", () => {
    const result = parseCreateUser(
      form({
        name: " ",
        email: "no-es-correo",
        jobTitle: "",
        role: "user",
        temporaryPassword: "corta",
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(Object.keys(result.fieldErrors).sort(), [
      "email",
      "name",
      "role",
      "temporaryPassword",
    ]);
    assert.match(result.fieldErrors.temporaryPassword ?? "", /12 caracteres/);
  });

  it("rejects a missing field instead of coercing it", () => {
    const data = form(valid);
    data.delete("role");
    assert.equal(parseCreateUser(data).ok, false);
  });
});

describe("parseUpdateUser and parseResetPassword", () => {
  it("accepts name, job title and role", () => {
    assert.deepEqual(
      parseUpdateUser(form({ name: "Eva", jobTitle: "", role: "admin" })),
      { ok: true, data: { name: "Eva", jobTitle: null, role: "admin" } },
    );
  });

  it("requires a temporary password of at least 12 characters", () => {
    assert.equal(
      parseResetPassword(form({ temporaryPassword: "x".repeat(11) })).ok,
      false,
    );
    assert.deepEqual(
      parseResetPassword(form({ temporaryPassword: "x".repeat(12) })),
      { ok: true, data: { temporaryPassword: "x".repeat(12) } },
    );
  });
});
