import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateBankAccount, validateIssuer } from "./validation.ts";

const issuer = {
  legalName: "Emisor Demo S.A.S.",
  identificationType: "NIT",
  identificationNumber: "900.000.002-2",
  address: "Calle Falsa 123",
  city: "Ciudad Demo",
  phone: "+57 300 000 0000",
  email: "Emisor@Example.test",
  paymentTerms: "Pago a 30 días.",
};

const account = {
  bankName: "Banco Demo",
  accountType: "ahorros",
  accountNumber: "000-111222-33",
  holderName: "Titular Demo",
  holderIdentificationType: "CC",
  holderIdentificationNumber: "1.000.000.001",
  currency: "COP",
  issuerProfileId: " 0A1B2C3D-0000-4000-8000-000000000001 ",
};

function issuerErrors(overrides: Record<string, unknown>) {
  const result = validateIssuer({ ...issuer, ...overrides });
  return result.ok ? {} : result.fieldErrors;
}

function accountErrors(overrides: Record<string, unknown>) {
  const result = validateBankAccount({ ...account, ...overrides });
  return result.ok ? {} : result.fieldErrors;
}

describe("validateIssuer", () => {
  it("normalizes a valid issuer", () => {
    const result = validateIssuer(issuer);
    assert.ok(result.ok);
    assert.deepEqual(result.data, {
      legalName: "Emisor Demo S.A.S.",
      identificationType: "NIT",
      identificationNumber: "9000000022",
      address: "Calle Falsa 123",
      city: "Ciudad Demo",
      phone: "+57 300 000 0000",
      email: "emisor@example.test",
      paymentTerms: "Pago a 30 días.",
    });
  });

  it("requires legal name, identification, address and city, in Spanish", () => {
    const result = validateIssuer({});
    assert.ok(!result.ok);
    assert.equal(
      result.fieldErrors.legalName,
      "Escribe el nombre o razón social del emisor.",
    );
    assert.equal(
      result.fieldErrors.identificationType,
      "Elige un tipo de identificación.",
    );
    assert.equal(
      result.fieldErrors.identificationNumber,
      "Escribe el número de identificación.",
    );
    assert.equal(result.fieldErrors.address, "Escribe la dirección.");
    assert.equal(result.fieldErrors.city, "Escribe la ciudad.");
  });

  it("treats phone, email and payment terms as optional", () => {
    const result = validateIssuer({
      ...issuer,
      phone: " ",
      email: "",
      paymentTerms: "  ",
    });
    assert.ok(result.ok);
    assert.equal(result.data.phone, null);
    assert.equal(result.data.email, null);
    assert.equal(result.data.paymentTerms, null);
  });

  it("rejects an invalid email, phone and identification number", () => {
    assert.equal(
      issuerErrors({ email: "nope" }).email,
      "Escribe un correo válido.",
    );
    assert.equal(
      issuerErrors({ phone: "abc" }).phone,
      "Escribe un teléfono válido (7 a 15 dígitos).",
    );
    assert.equal(
      issuerErrors({ identificationNumber: "12AB" }).identificationNumber,
      "Usa solo números, sin letras ni símbolos.",
    );
  });

  it("limits the payment terms and keeps their line breaks", () => {
    assert.equal(
      issuerErrors({ paymentTerms: "x".repeat(1001) }).paymentTerms,
      "Las condiciones de pago son demasiado largas (máximo 1000 caracteres).",
    );
    const result = validateIssuer({
      ...issuer,
      paymentTerms: "  Línea uno\r\nLínea dos  ",
    });
    assert.ok(result.ok);
    assert.equal(result.data.paymentTerms, "Línea uno\nLínea dos");
  });

  it("ignores unknown or non-string values", () => {
    const result = validateIssuer({ ...issuer, legalName: 42, extra: "x" });
    assert.ok(!result.ok);
    assert.ok(result.fieldErrors.legalName);
    assert.equal("extra" in result.fieldErrors, false);
  });
});

describe("validateBankAccount", () => {
  it("normalizes a valid account", () => {
    const result = validateBankAccount({
      ...account,
      bankName: "  Banco   Demo ",
    });
    assert.ok(result.ok);
    assert.deepEqual(result.data, {
      bankName: "Banco Demo",
      accountType: "ahorros",
      accountNumber: "00011122233",
      holderName: "Titular Demo",
      holderIdentificationType: "CC",
      holderIdentificationNumber: "1000000001",
      currency: "COP",
      issuerProfileId: "0a1b2c3d-0000-4000-8000-000000000001",
    });
  });

  it("requires every field, in Spanish", () => {
    const result = validateBankAccount({});
    assert.ok(!result.ok);
    assert.equal(result.fieldErrors.bankName, "Escribe el nombre del banco.");
    assert.equal(result.fieldErrors.accountType, "Elige el tipo de cuenta.");
    assert.equal(
      result.fieldErrors.accountNumber,
      "Escribe el número de cuenta.",
    );
    assert.equal(
      result.fieldErrors.holderName,
      "Escribe el nombre del titular.",
    );
    assert.equal(
      result.fieldErrors.holderIdentificationType,
      "Elige un tipo de identificación.",
    );
    assert.equal(
      result.fieldErrors.holderIdentificationNumber,
      "Escribe el número de identificación.",
    );
    assert.equal(result.fieldErrors.currency, "Elige la moneda.");
    assert.equal(
      result.fieldErrors.issuerProfileId,
      "Elige el emisor de la cuenta.",
    );
  });

  it("accepts only a uuid as the issuer", () => {
    for (const issuerProfileId of ["", "nope", "1", 42, null]) {
      assert.equal(
        accountErrors({ issuerProfileId }).issuerProfileId,
        "Elige el emisor de la cuenta.",
        String(issuerProfileId),
      );
    }
  });

  it("accepts only ahorros or corriente and only COP or USD", () => {
    assert.ok(accountErrors({ accountType: "nomina" }).accountType);
    assert.ok(accountErrors({ currency: "EUR" }).currency);
    assert.equal(accountErrors({ currency: "USD" }).currency, undefined);
    assert.equal(
      accountErrors({ accountType: "corriente" }).accountType,
      undefined,
    );
  });

  it("accepts only digits in the account number, 4 to 20 of them", () => {
    assert.equal(
      accountErrors({ accountNumber: "12AB5678" }).accountNumber,
      "Usa solo números, sin letras ni símbolos.",
    );
    assert.equal(
      accountErrors({ accountNumber: "123" }).accountNumber,
      "Debe tener entre 4 y 20 dígitos.",
    );
    assert.equal(
      accountErrors({ accountNumber: "1".repeat(21) }).accountNumber,
      "Debe tener entre 4 y 20 dígitos.",
    );
    assert.equal(
      accountErrors({ accountNumber: "1234" }).accountNumber,
      undefined,
    );
  });

  it("limits bank and holder names", () => {
    assert.ok(accountErrors({ bankName: "x".repeat(101) }).bankName);
    assert.ok(accountErrors({ holderName: "x".repeat(201) }).holderName);
  });
});
