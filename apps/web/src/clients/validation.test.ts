import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeIdentificationNumber, validateClient } from "./validation.ts";

const valid = {
  name: "Cliente Demo S.A.S.",
  identificationType: "NIT",
  identificationNumber: "900.000.001-1",
};

function fieldErrors(raw: unknown) {
  const result = validateClient(raw);
  assert.equal(result.ok, false);
  return result.ok ? {} : result.fieldErrors;
}

describe("normalizeIdentificationNumber", () => {
  it("strips separators and spaces from NIT and CC", () => {
    assert.equal(
      normalizeIdentificationNumber("NIT", " 900.000.001-1 "),
      "9000000011",
    );
    assert.equal(
      normalizeIdentificationNumber("CC", "1 000 000 001"),
      "1000000001",
    );
  });

  it("trims, upper-cases and drops separators from CE and PP", () => {
    assert.equal(
      normalizeIdentificationNumber("PP", " ab-123 456 "),
      "AB123456",
    );
    assert.equal(normalizeIdentificationNumber("CE", "ce0001"), "CE0001");
  });
});

describe("validateClient", () => {
  it("normalizes a valid client and turns blank optional fields into null", () => {
    const result = validateClient({
      ...valid,
      name: "  Cliente   Demo  S.A.S. ",
      address: "  ",
      city: " Ciudad Demo ",
      email: " Contacto@Example.TEST ",
      phone: "",
    });
    assert.deepEqual(result, {
      ok: true,
      data: {
        name: "Cliente Demo S.A.S.",
        identificationType: "NIT",
        identificationNumber: "9000000011",
        address: null,
        city: "Ciudad Demo",
        email: "contacto@example.test",
        phone: null,
      },
    });
  });

  it("reports Spanish field errors for a missing name and identification", () => {
    assert.deepEqual(fieldErrors({}), {
      name: "Escribe el nombre o razón social.",
      identificationType: "Elige un tipo de identificación.",
      identificationNumber: "Escribe el número de identificación.",
    });
    assert.deepEqual(
      fieldErrors({
        name: "   ",
        identificationType: "NIT",
        identificationNumber: " ",
      }),
      {
        name: "Escribe el nombre o razón social.",
        identificationNumber: "Escribe el número de identificación.",
      },
    );
  });

  it("rejects an unknown identification type", () => {
    assert.equal(
      fieldErrors({ ...valid, identificationType: "RUT" }).identificationType,
      "Elige un tipo de identificación.",
    );
  });

  it("rejects non-numeric NIT and CC and out-of-range lengths", () => {
    assert.match(
      fieldErrors({ ...valid, identificationNumber: "90A000001" })
        .identificationNumber ?? "",
      /solo números/,
    );
    assert.match(
      fieldErrors({ ...valid, identificationNumber: "123" })
        .identificationNumber ?? "",
      /entre 5 y 15 dígitos/,
    );
    assert.match(
      fieldErrors({
        ...valid,
        identificationType: "CC",
        identificationNumber: "1".repeat(16),
      }).identificationNumber ?? "",
      /entre 5 y 15 dígitos/,
    );
  });

  it("rejects CE and PP numbers with other characters", () => {
    assert.match(
      fieldErrors({
        ...valid,
        identificationType: "PP",
        identificationNumber: "AB#123",
      }).identificationNumber ?? "",
      /letras y números/,
    );
  });

  it("rejects an invalid email, phone and over-long fields", () => {
    const errors = fieldErrors({
      ...valid,
      email: "not-an-email",
      phone: "abc",
      address: "x".repeat(201),
      city: "y".repeat(101),
      name: "z".repeat(201),
    });
    assert.equal(errors.email, "Escribe un correo válido.");
    assert.match(errors.phone ?? "", /teléfono válido/);
    assert.match(errors.address ?? "", /demasiado larga/);
    assert.match(errors.city ?? "", /demasiado larga/);
    assert.match(errors.name ?? "", /demasiado largo/);
  });

  it("ignores non-string values instead of coercing them", () => {
    assert.equal(
      fieldErrors({ ...valid, name: 42 }).name,
      "Escribe el nombre o razón social.",
    );
  });
});
